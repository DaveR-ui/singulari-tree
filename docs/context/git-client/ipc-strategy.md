# Estrategia IPC — Preload + gRPC/HTTP + Proto + Supervisor

## 1. Visión general

Dos canales:

```
Angular (renderer)  ──IPC (Electron)──▶  Electron main  ──gRPC/HTTP (localhost)──▶  Go core
  window.gitClientApi        ipcMain.handle         supervisor.forwardToGo       singularitree.v1
```

- **Angular ↔ Electron:** `contextIsolation` + `contextBridge` + `ipcRenderer.invoke/handle` + eventos `ipcRenderer.on`.
- **Electron ↔ Go:** gRPC primario en unix socket/named pipe + HTTP fallback en `127.0.0.1:0` efímero, ambos con `token` auth.

Go nunca habla directo con Angular; Electron nunca implementa Git.

## 1.2 Preload bridge (único)

`apps/electron/src/preload/preload.ts` — **una sola** llamada `contextBridge.exposeInMainWorld`.

```ts
// preload.ts
import { contextBridge, ipcRenderer } from 'electron';
export interface GitClientApi {
  getCommits: (req: unknown) => Promise<unknown>;
  getBranches: (req: unknown) => Promise<unknown>;
  getRemotes:  (req: unknown) => Promise<unknown>;
  getTags:     (req: unknown) => Promise<unknown>;
  getStashes:  (req: unknown) => Promise<unknown>;
  getStatus:   (req: unknown) => Promise<unknown>;
  getDiff:     (req: unknown) => Promise<unknown>;
  stage:       (req: unknown) => Promise<unknown>;
  unstage:     (req: unknown) => Promise<unknown>;
  commit:      (req: unknown) => Promise<unknown>;
  checkout:    (req: unknown) => Promise<unknown>;
  fetch: (req: unknown) => Promise<unknown>; // streaming progress vía events
  pull:  (req: unknown) => Promise<unknown>;
  push:  (req: unknown) => Promise<unknown>;
  onRepoChanged: (cb:(p:unknown)=>void)=>()=>void;
  onFsChanged:   (cb:(p:unknown)=>void)=>()=>void;
  onProgress:    (cb:(p:unknown)=>void)=>()=>void;
}
const api: GitClientApi = {
  getCommits: (req)=> ipcRenderer.invoke('git:getCommits', req),
  getBranches:(req)=> ipcRenderer.invoke('git:getBranches', req),
  // ... 1:1 con CHANNELS
  onFsChanged: (cb)=> { const h=(_:unknown,p:unknown)=>cb(p); ipcRenderer.on('fs:changed',h as never); return ()=>ipcRenderer.removeAllListeners('fs:changed'); },
};
contextBridge.exposeInMainWorld('gitClientApi', api);
```

**Reglas:**
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` en `BrowserWindow`.
- Nunca exponer `ipcRenderer` directo ni `require`.
- Validación en `ipc/channels.ts` (`validate(channel,payload)`) antes de forward.
- Angular consume vía `apps/angular/src/app/core/services/ipc-bridge.service.ts` (`IpcBridge` wrapper tipado + `AppError`).

Tipos generados desde proto (`libs/contracts/gen/ts`) reemplazan `unknown` tras `buf generate` (path alias `@contracts`).

## 2. Electron ↔ Go

### 2.1 Transporte — Decisión

| Criterio | gRPC (primario) | HTTP/JSON (fallback) |
|----------|----------------|----------------------|
| Streaming server | nativo (`stream Progress`, `Watch`) | SSE/long-poll (más frágil) |
| Tipado | proto + buf lint/breaking | manual |
| Overhead | bajo (http/2) | medio |
| Unix socket/named pipe | sí | sí |
| Tooling | `grpc-go` + interceptors | `net/http` |

**Elección:** gRPC primario en unix socket (Linux/macOS) / named pipe (Windows) `unix:///tmp/singularitree-go.sock` o `\\.\pipe\singularitree-go-core`; HTTP fallback siempre levantado en `127.0.0.1:0` para `curl`/debug y si gRPC no disponible. Ambos con token.

Scaffold actual mapea unix socket a `127.0.0.1:0` TCP para buildability cross-platform; producción implementa `net.Listen("unix", path)` real.

### 2.2 Channels mapping

`apps/electron/src/ipc/channels.ts`:
```ts
export const CHANNELS = {
  getCommits: 'git:getCommits',
  getBranches:'git:getBranches',
  getRemotes: 'git:getRemotes',
  getTags:    'git:getTags',
  getStashes: 'git:getStashes',
  getStatus:  'git:getStatus',
  getDiff:    'git:getDiff',
  stage:      'git:stage',
  unstage:    'git:unstage',
  commit:     'git:commit',
  checkout:   'git:checkout',
  fetch:      'git:fetch',
  push:       'git:push',
  pull:       'git:pull',
} as const;
```

`handlers.ts`:
```ts
export function registerIpcHandlers(forwardToGo: ForwardToGo){
  for(const ch of Object.values(CHANNELS)){
    ipcMain.handle(ch, async (_e, payload)=>{ validate(ch,payload); return forwardToGo(ch,payload); });
  }
}
```

`supervisor.forwardToGo(channel,payload)` mapea channel → proto RPC (switch), adjunta `authorization: Bearer <token>` metadata, y hace dispatch gRPC o HTTP fallback si gRPC `UNAVAILABLE`.

### 2.3 Proto sketch (singularitree.v1)

`libs/contracts/proto/*.proto` — `package singularitree.v1` (alias `gitclient.v1` en comentarios).

**domain.proto** (VOs/entidades): `Oid`, `Signature`, `RefName`, `Commit`, `Branch`, `Remote`, `Tag`, `Stash`, `Worktree`, `Repository`, `Diff/Hunk/DiffLine`, `FileStatus`.

**errors.proto:** `message AppError{code,message,details}` + `enum ErrorCode` (wire usa `code string`).

**gitcore.proto** (service):
```proto
syntax="proto3";
package singularitree.v1;
import "domain.proto"; import "errors.proto";
option go_package = "github.com/SingulariTree/go-core/gen/go/singularitree/v1;singularitreev1";

service GitCore {
  rpc Ping(PingRequest) returns (PingResponse);
  rpc GetRepository(GetRepositoryRequest) returns (Repository);
  rpc ListRepositories(ListRepositoriesRequest) returns (ListRepositoriesResponse);
  rpc GetCommits(GetCommitsRequest) returns (GetCommitsResponse);
  rpc StreamCommits(StreamCommitsRequest) returns (stream Commit);
  rpc GetBranches(GetBranchesRequest) returns (GetBranchesResponse);
  rpc GetRemotes(GetRemotesRequest) returns (GetRemotesResponse);
  rpc GetTags(GetTagsRequest) returns (GetTagsResponse);
  rpc GetStashes(GetStashesRequest) returns (GetStashesResponse);
  rpc GetWorktrees(GetWorktreesRequest) returns (GetWorktreesResponse);
  rpc GetStatus(GetStatusRequest) returns (GetStatusResponse);
  rpc GetDiff(GetDiffRequest) returns (Diff);
  rpc Stage(StageRequest) returns (StageResponse);
  rpc Unstage(UnstageRequest) returns (UnstageResponse);
  rpc Commit(CommitRequest) returns (Commit);
  rpc Checkout(CheckoutRequest) returns (CheckoutResponse);
  rpc Fetch(FetchRequest) returns (stream Progress);
  rpc Push(PushRequest) returns (stream Progress);
  rpc Pull(PullRequest) returns (stream Progress);
  rpc Watch(WatchRequest) returns (stream FsChangedEvent);
}
message PingRequest {}  message PingResponse{ bool ok=1; uint64 uptime_ms=2; uint32 queue_depth=3; }
message Progress{ uint32 percent=1; string message=2; }
message FsChangedEvent{ string repo_id=1; repeated string paths=2; }
```

`buf.yaml` v2 + `buf.gen.yaml` genera `gen/go` (`go` + `grpc/go`) y `gen/ts` (`ts-proto`).

### 2.4 Autenticación

- Token 32B hex (64 chars) generado en Go si no se pasa `--token`; supervisor genera y pasa `--token <hex>` al spawn; Go lo imprime en `GO_CORE_READY token=...`.
- gRPC: `authorization: Bearer <token>` metadata; interceptor valida.
- HTTP: header `X-Auth-Token` o `Authorization: Bearer`.
- Bind solo loopback (`127.0.0.1`/`unix socket`); nunca `0.0.0.0`.

### 2.5 Manejo de errores wire

- Go: `AppError` → `status.Error(codes.Code, msg)` con `details` en `google.rpc.ErrorInfo` o trailing metadata `x-app-error-code`.
- Electron: intercepta, mapea a `AppError` JSON para renderer; `QUEUE_FULL` → retry/backoff en Angular.
- Angular: `IpcBridge` lanza `AppError{code,message,details}`; stores lo muestran en toast/UI.

### 2.6 Supervisor lifecycle (supervisor.ts)

`apps/electron/src/main/supervisor.ts` — `class Supervisor`:

```ts
interface SupervisorOptions { goCoreBinary:string; grpcAddr:string; httpAddr:string; dbPath?:string; token?:string; }

class Supervisor{
  proc: ChildProcess|null; ready=false; token:string; queue:PendingRequest[] (max 100);
  async start(){ await spawn(); startHeartbeat(); }
  stop(){ clearInterval(heartbeat); proc?.kill(); }
  private async spawn(){
    const bin = fs.existsSync(goCoreBinary) ? goCoreBinary : null;
    if(!bin) proc=spawn('go',['run','apps/go-core/cmd/go-core',...args]); else proc=spawn(bin,args);
    await awaitReady(); // regex GO_CORE_READY addr=... http=... token=...
    proc.on('exit',()=>{ ready=false; scheduleRestart(); });
  }
  private awaitReady():Promise<void>{ /* 15s timeout, parse GO_CORE_READY, drainQueue */ }
  private scheduleRestart(){ backoff [200,500,1000,2000,5000], rotate token, setTimeout(spawn) }
  private startHeartbeat(){ setInterval(()=>ping(),5000) }
  async forwardToGo(channel,payload){ if(!ready) enqueue|max QUEUE_FULL; else dispatch gRPC(map channel→RPC) }
}
```

**Detalles:**
- `GO_CORE_READY addr=<grpc> http=<http> token=<64hex>` es línea stdout única parseable (regex `/GO_CORE_READY\s+addr=(\S+)\s+http=(\S+)\s+token=(\S+)/`).
- Go args: `--grpc-addr <unix|127.0.0.1:0> --http-fallback-addr 127.0.0.1:0 --token <hex> --db <path>`.
- Heartbeat `Ping` gRPC; miss 2x → `proc.kill()` → `exit` handler restarta.
- Queue drain al volverse ready; `QUEUE_FULL` si >100.

**Go side (`cmd/go-core/main.go`):**
```go
flag.Bool("headless", false, "run headless")
flag.String("grpc-addr", "127.0.0.1:0", "gRPC addr")
flag.String("http-fallback-addr", "127.0.0.1:0", "HTTP fallback")
// en --headless: fmt.Printf("GO_CORE_READY addr=%s http=%s token=%s\n", grpcAddrStr, httpAddrStr, token)
signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
```

### 2.7 Seguridad

- Electron `BrowserWindow` opciones: `webPreferences:{ contextIsolation:true, nodeIntegration:false, sandbox:true, preload: path.join(__dirname,'../preload/preload.js') }` + CSP en `window/csp.ts`.
- Go: solo localhost/unix socket, token rotado por restart, `Ping` verifica liveness, shutdown graceful 5s.
- Validación payload en `channels.ts:validate` (zod o manual) previene inyección.

## 3. Diagrama secuencia (ver también module-diagram.md §3)

Ref. `module-diagram.md §3.1-3.3` para secuencias paginación/streaming/supervision.

## 4. Fallbacks y degradación

- Si gRPC `UNAVAILABLE`, supervisor reintenta HTTP fallback (`GET /health`, `POST /commits` JSON).
- Si Go no arranca en 15s → `GO_CORE_READY timeout` → retry backoff.
- Renderer offline (Go down + queue llena) → `AppError{QUEUE_FULL}` toast + retry button.

## 5. Verificación

```bash
buf lint                          # proto lint ok
buf generate --template buf.gen.yaml  # gen/go + gen/ts
go vet ./...                      # supervisor.ts types align con proto
npm run build --workspace=@singularitree/electron  # preload compila
go run ./apps/go-core/cmd/go-core --headless --grpc-addr 127.0.0.1:0 --http-fallback-addr 127.0.0.1:0 | grep GO_CORE_READY
```
