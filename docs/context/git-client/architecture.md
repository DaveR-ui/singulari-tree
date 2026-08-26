# Arquitectura — C4 + Hexagonal + Headless Proof

> Stack: Angular latest stable + Signals + TypeScript + SCSS, Electron, Go 1.24, SQLite WAL, IPC Electron↔Angular (`contextIsolation` + preload) + Electron↔Go (gRPC unix socket/named pipe primario + HTTP fallback). Principios: performance, scalability, clean architecture, maintainability, automated testing.

## 1. Visión C4

### 1.1 Nivel 1 — System Context

```
Usuario ──▶ SingulariTree Desktop App (Angular + Electron + Go + SQLite)
                │
                ├──▶ Filesystem / .git  (go-git / exec git)
                ├──▶ Remotos Git (fetch/pull/push)
                └──▶ SQLite per-user (config, recents, favorites, prefs, UI-state, metadata cache — NO objetos Git)
```

- **Actor:** desarrollador en Linux/Windows/macOS.
- **SingulariTree:** sistema único; Electron es shell, Angular es renderer, Go es core de negocio.
- **Externo:** repos Git en disco, remotos HTTPS/SSH.

### 1.2 Nivel 2 — Containers

| Container | Runtime | Responsabilidad | Comunicación | Reemplazable |
|-----------|---------|-----------------|--------------|--------------|
| **Angular renderer** | Chromium (Electron renderer) | UI: grafo, diff Monaco, status/stage, history, stash, branches | `window.gitClientApi` → IPC (invoke/handle + events) | Sí — cualquier SPA que hable `gitClientApi` |
| **Electron main + preload** | Node + Electron main | Shell, ventanas, menus, `supervisor` de Go, bridge IPC | `contextBridge` + `ipcMain.handle` + gRPC/HTTP cliente a Go | Sí (Tauri/Wails) — mantiene contrato |
| **Go core headless** | Go 1.24 binary | Todo Git, grafo lanes, cache, watchers, diff, progress streaming | gRPC (`singularitree.v1`) primaria + HTTP fallback | Sí — corre sin UI (`--headless`) |
| **SQLite** | file WAL | Solo config/recents/favorites/prefs/UI-state/metadata cache | `database/sql` + `modernc.org/sqlite` o `mattn/go-sqlite3` | Sí — nunca Git objects |
| **Contracts** | buf + proto | Fuente única de verdad | `libs/contracts/proto/*.proto` → `gen/go + gen/ts` | — |

Diagrama:

```
┌──────────────────┐   contextBridge    ┌─────────────────┐  gRPC (unix socket) / HTTP  ┌──────────────┐
│ Angular (Signals)│ ─────────────────▶ │ Electron main   │ ───────────────────────────▶ │ Go core      │
│  Signals Stores  │ ◀───────────────── │ + supervisor    │ ◀─────────────────────────── │  services    │
│  + Monaco+Graph  │   events (fs:changed, repo:changed, progress)                 │  + adapters  │
└──────────────────┘                    └─────────────────┘                              └──────┬───────┘
                                                                                              │ SQLite WAL
                                                                                       ┌──────▼───────┐
                                                                                       │ SQLite cache │
                                                                                       └──────────────┘
                                                                                              │ git CLI / go-git
                                                                                       ┌──────▼───────┐
                                                                                       │ .git / refs  │
                                                                                       └──────────────┘
```

### 1.3 Nivel 3 — Componentes (por container)

**Angular (`apps/angular/src`):**
- `app/core/services/ipc-bridge.service.ts` — typed wrapper sobre `window.gitClientApi`.
- `app/core/services/repo-state.service.ts` — Signals global (repo actual, status, polling).
- `features/repo/{page,ui,repo.service.ts}` — páginas por feature (history, graph, status, diff, branches).
- `shared/ui + libs/ui-kit` — dumb components (`graph-row`, `diff-viewer`, `button`).

**Electron (`apps/electron/src`):**
- `main/main.ts` — `app.whenReady`, `BrowserWindow` (contextIsolation, CSP `window/csp.ts`), `supervisor.start()`.
- `main/supervisor.ts` — spawns Go, awaits `GO_CORE_READY`, Ping 5s, backoff, queue, token rotation.
- `preload/preload.ts` — **único** `contextBridge.exposeInMainWorld('gitClientApi', api)`.
- `ipc/{channels.ts,handlers.ts,events.ts}` — validación + `ipcMain.handle` mapping; forward a Go.
- `window/*` — creación ventana, CSP.

**Go core (`apps/go-core/internal`):**
- `domain/` — entidades puras (`repository.go`, `commit.go`, `branch.go`, `remote.go`, `tag.go`, `stash.go`, `worktree.go`, `diff.go`, `errors.go`) + ports (interfaces).
- `service/` — casos de uso (`repo_service.go`, `git_service.go`, `graph_service.go`, `cache_service.go`, `watcher_service.go`) — orquestan ports.
- `repository/` — repos SQLite (`repo_store.go`, `commit_cache.go`).
- `adapter/{git,grpc,http,watcher}` — adapters: `git` (exec/`go-git`), `grpc/server.go`, `http/handler.go`, `watcher/watcher.go` (fsnotify).
- `config/config.go` — Viper + flags.
- `cmd/go-core/main.go` — DI + gRPC/HTTP bind + `--headless` + `GO_CORE_READY` + `signal.NotifyContext`.

**Contracts (`libs/contracts`):**
- `proto/domain.proto`, `errors.proto`, `gitcore.proto` — `package singularitree.v1`.
- `buf.yaml` v2 + `buf.gen.yaml` → `gen/go`, `gen/ts`.

## 2. Hexagonal (Ports & Adapters)

Reglas:
- `domain/` no importa `service/` ni `adapter/` ni `repository/`.
- `service/` depende de interfaces (ports) definidas en `domain/`, no de concretos.
- `adapter/` implementa ports.
- Angular nunca importa Go; Electron nunca implementa lógica Git.

```
             ┌─────────────────────┐
             │   Angular / Electron│  Driving adapters (primary)
             │   (ipc handlers)    │
             └──────────┬──────────┘
                        │ llama
             ┌──────────▼──────────┐
             │   Service layer     │  Use cases (GraphService, GitService…)
             │   (ports definidos) │
             └──────────┬──────────┘
         ┌──────────────┼──────────────┐
         │              │              │
  ┌──────▼─────┐ ┌─────▼──────┐ ┌───▼────────┐
  │ GitPort    │ │ CachePort  │ │ WatcherPort│  Ports (domain/)
  └──────┬─────┘ └─────┬──────┘ └───┬────────┘
         │             │            │
  ┌──────▼─────┐ ┌─────▼──────┐ ┌───▼────────┐
  │ git/exec   │ │ sqlite     │ │ fsnotify   │  Driven adapters (secondary)
  │ go-git     │ │ WAL        │ │ coalescing │
  └────────────┘ └────────────┘ └────────────┘
```

**Sustituibilidad probada:**
- Angular → Svelte/React: solo reimplementar `window.gitClientApi` consumer.
- Electron → Tauri: mantener `supervisor` contract (spawn Go, `GO_CORE_READY`).
- `go-git` → exec git: cambiar `adapter/git` sin tocar services.

Interfaces clave ya esbozadas:
```go
type GitPort interface {
  List(ctx, repoID, offset, limit) ([]Commit, int, error)
  GetStatus(ctx, repoID) ([]FileStatus, error)
  GetDiff(ctx, repoID, from, to) (Diff, error)
  Stage(ctx, repoID, paths) error
  // …
}
type CachePort interface { GetCommits / SetCommits / Invalidate }
type WatcherPort interface { Watch(repoID) (<-chan FsChangedEvent, error) }
```

## 3. Dependencias y flujo de datos

- **Input:** path de repo en disco → `RepoService.Open` valida `.git`/commonDir → persiste en `repos` table.
- **Output:** commits paginados → `GraphService` → `GrpcServer` → `supervisor.forwardToGo` → `ipcRenderer` → `IpcBridge` → Signals store → grafo virtualizado.
- **State:** SQLite es source of truth para metadata cache/UI-state; `.git` es source of truth para Git data.
- **Side effects:** file watcher invalida cache; push/pull stream `Progress`.

## 4. Decisiones arquitectónicas (resumen, detalle en decisions.md)

- gRPC primario + HTTP fallback (named pipe/unix socket) — performance streaming + compatibilidad.
- SQLite WAL per-user — concurrencia sin servidor, migrations versionadas.
- `buf` contratos — breaking check CI.
- Monaco + canvas/CDK virtual scroll — 50k commits.
- Viper + flags para Go config — 12-factor.

## 5. Headless Proof (§5 del README.md — contrato ejecutable)

Go core **debe** compilar y correr sin Electron/Angular.

**Contrato CLI:**
```bash
# desde monorepo root SingulariTree/
go run ./apps/go-core/cmd/go-core --headless --grpc-addr unix:///tmp/singularitree-go.sock --db ~/.local/share/singularitree/cache.db
# o efímero:
./dist/go-core --headless --grpc-addr 127.0.0.1:0 --http-fallback-addr 127.0.0.1:0 --log-level info
# stdout cuando listo (una línea, parseable por supervisor):
GO_CORE_READY addr=unix:///tmp/singularitree-go.sock http=127.0.0.1:0 token=<64 hex>
```

**Comportamiento `--headless`:**
- Bindea gRPC en unix socket (Linux/macOS) o named pipe `\\.\pipe\singularitree-go-core` (Windows), HTTP fallback en `127.0.0.1:0` (efímero).
- Imprime `GO_CORE_READY` y espera `SIGTERM`/`SIGINT`.
- Health: supervisor hace `Ping` gRPC cada 5s; si falla 2x, kill + restart backoff `[200,500,1000,2000,5000]ms`, rotando token.
- Queue: hasta 100 requests encoladas mientras Go reinicia; luego `QUEUE_FULL`.
- Graceful shutdown 5s.

**Implementación actual (scaffold):**
- `apps/go-core/cmd/go-core/main.go` ya implementa flag `--headless`, listeners TCP (stub para unix socket), `GO_CORE_READY`, y `signal.NotifyContext`.
- `apps/electron/src/main/supervisor.ts` ya implementa `awaitReady()` (regex `GO_CORE_READY`), heartbeat, queue drain, token rotation.
- Producción reemplazará stub TCP por unix socket real y gRPC real (después de `buf generate`).

**Validación:**
```bash
go vet ./...
go run ./apps/go-core/cmd/go-core --headless --help           # flags
timeout 3 go run ./apps/go-core/cmd/go-core --headless --grpc-addr 127.0.0.1:0 --http-fallback-addr 127.0.0.1:0 | grep GO_CORE_READY
```

## 6. Seguridad y guardrails

- Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP (`window/csp.ts`), preload es único bridge.
- Go: token 32B hex rotado por restart; `authorization: Bearer <token>` metadata gRPC + `X-Auth-Token` HTTP; bind solo `127.0.0.1` / unix socket (nunca `0.0.0.0`).
- SQLite: WAL + `PRAGMA foreign_keys=ON`, path per-user, migrations idempotentes.

## 7. Escalabilidad para repos grandes

- Graph: `git log --graph` lanes O(n) incremental, LRU window `200+100`, virtualization (CDK o canvas) — ver `service-design.md §1.2`.
- Diff: Monaco workers + chunking + límite 1MB con fallback plain text.
- Watchers: fsnotify + debounce 150-300ms + `.git/index.lock` guard.
- Cache: `commit_cache` index `(repo_id, committed_at DESC)`, invalidación por `fs:changed`.

## 8. Alternativas descartadas (ver decisions.md)

- Frontend hablando directo a `go-git` vía WASM — via hexagonal, bloquea headless.
- Solo HTTP REST — pierde streaming y tipado; gRPC es superior para `Watch`/`StreamCommits`/`Fetch` progress.
- SQLite guardando blobs Git — anti-pattern, rompe git como source of truth.
