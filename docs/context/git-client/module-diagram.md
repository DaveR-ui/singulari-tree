# Diagrama de módulos — C4 + Hexagonal + IPC

## 1. C4 Container (mermaid)

```mermaid
C4Context
  title SingulariTree — Containers
  Person(dev, "Developer", "Linux/Win/macOS")
  System_Boundary(app, "SingulariTree Desktop") {
    Container(angular, "Angular Renderer", "Angular 21 + Signals + SCSS", "Grafo, Monaco diff, status/stage")
    Container(electron, "Electron Main + Preload", "Node + Electron", "Shell, supervisor, IPC bridge")
    Container(gocore, "Go Core Headless", "Go 1.25+", "Git, lanes, cache, watchers")
    ContainerDb(sqlite, "SQLite WAL", "file per-user", "config/recents/cache — NO Git objects")
    Container(contracts, "Contracts", "buf + proto", "singularitree.v1 → gen/go + gen/ts")
  }
  System_Ext(gitfs, ".git / Worktrees", "Git objects")
  System_Ext(remotes, "Git Remotes", "fetch/pull/push")

  Rel(dev, angular, "usa")
  Rel(angular, electron, "window.gitClientApi.invoke / on", "IPC invoke/handle")
  Rel(electron, gocore, "gRPC unix socket + HTTP fallback", "singularitree.v1 + token")
  Rel(gocore, sqlite, "database/sql", "WAL")
  Rel(gocore, gitfs, "go-git / exec git")
  Rel(gocore, remotes, "push/fetch/pull")
  Rel(contracts, angular, "gen/ts", "types")
  Rel(contracts, gocore, "gen/go", "stubs")
  Rel(contracts, electron, "gen/ts channel types")
```

## 2. Hexagonal proof (mermaid)

```mermaid
flowchart TB
  subgraph Driving["Driving (primary) adapters"]
    A["Angular Signals Stores\n(IpcBridge)"]
    E["Electron ipcMain.handle\n(channels.ts/handlers.ts)"]
    M["adapter/mcp\n(opcional, stdio)"]
  end

  subgraph Hex["Hexágono — Services (use cases)"]
    S1["RepoService"]
    S2["GitService"]
    S3["GraphService"]
    S4["CacheService"]
    S5["WatcherService"]
  end

  subgraph Ports["Ports (domain/)"]
    P1["GitPort"]
    P2["CachePort"]
    P3["RepoPort"]
    P4["WatcherPort"]
  end

  subgraph Driven["Driven (secondary) adapters"]
    D1["adapter/git\nexec / go-git"]
    D2["repository/\nSQLite WAL"]
    D3["adapter/watcher\nfsnotify coalescing"]
    D4["adapter/grpc\nadapter/http"]
  end

  A --> E --> S1 & S2 & S3
  M --> S1 & S2 & S3
  S1 & S2 & S3 --> P1 & P2 & P3 & P4
  P1 --> D1
  P2 & P3 --> D2
  P4 --> D3
  S1 & S2 & S3 -.-> D4

  classDef domain fill:#dbeafe,stroke:#2563eb
  classDef adapter fill:#fef3c7,stroke:#d97706
  class S1,S2,S3,S4,S5,P1,P2,P3,P4 domain
  class A,E,D1,D2,D3,D4,M adapter
```

**Prueba de sustituibilidad:**

| Cambio | Solo tocas | No tocas |
|--------|-----------|----------|
| Angular → React | `A` + `libs/ui-kit` | `Hex`, `Ports`, `Driven` |
| Electron → Tauri | `E` + `supervisor.ts` | `Hex`, `Ports` |
| `go-git` → exec git | `D1` | `S*`, `P1` |
| gRPC → solo HTTP | `D4` | `S*` |
| Añadir superficie MCP (opcional) | `adapter/mcp` + `cmd/mcp-server` | `Hex`, `Ports`, `Driven` |

`domain/` no importa `service/` ni `adapter/`; `service` solo conoce interfaces.

> MCP es un inbound adapter **opcional** sobre el mismo core Go (no altera el spine gRPC/`--headless`); ver ADR-013.

## 3. Secuencia IPC (request/response + streaming + watcher)

### 3.1 Request/response paginado (GetCommits)

```mermaid
sequenceDiagram
  participant NG as Angular (GraphStore)
  participant BR as IpcBridge
  participant PL as preload (gitClientApi)
  participant IPC as ipcMain.handle
  participant SUP as supervisor.forwardToGo
  participant GRPC as Go gRPC Server
  participant SVC as GraphService
  participant CACHE as SQLite cache
  participant GIT as GitPort

  NG->>BR: invoke('getCommits', {repo_id, offset, limit})
  BR->>PL: window.gitClientApi.getCommits(req)
  PL->>IPC: ipcRenderer.invoke('git:getCommits', req)
  IPC->>IPC: validate(channel, payload)
  IPC->>SUP: forwardToGo('git:getCommits', payload)
  alt ready
    SUP->>GRPC: GetCommits(req, metadata token)
    GRPC->>SVC: Commits(repoID, offset, limit)
    SVC->>CACHE: GetCommits(offset,limit)
    alt cache hit
      CACHE-->>SVC: commits
    else miss
      SVC->>GIT: List(offset,limit)
      GIT-->>SVC: commits, total
      SVC->>CACHE: SetCommits(...)
    end
    SVC-->>GRPC: GetCommitsResponse{commits,total}
    GRPC-->>SUP: response
    SUP-->>IPC: response
    IPC-->>PL: response
    PL-->>BR: Promise<response>
    BR-->>NG: signal update (commits, total)
  else not ready (restarting)
    SUP->>SUP: enqueue (max 100)
    SUP-->>IPC: pending → drain on GO_CORE_READY
  end
```

### 3.2 Streaming (Fetch/Push/Watch)

```mermaid
sequenceDiagram
  participant NG as Angular
  participant PL as preload
  participant SUP as supervisor
  participant GRPC as Go gRPC

  NG->>PL: gitClientApi.fetch({repo_id, remote})
  PL->>SUP: forwardToGo('git:fetch')
  SUP->>GRPC: Fetch(req) returns stream<Progress>
  loop chunks
    GRPC-->>SUP: Progress{percent, message}
    SUP-->>PL: webContents.send('git:progress', progress)
    PL-->>NG: onProgress(cb)
  end
  GRPC-->>SUP: EOF
  SUP-->>PL: done

  NG->>PL: watch({repo_id})
  SUP->>GRPC: Watch(req) returns stream<FsChangedEvent>
  loop fs events (coalesced 150-300ms)
    GRPC-->>SUP: FsChangedEvent{paths}
    SUP-->>PL: send('fs:changed', event)
    PL-->>NG: onFsChanged → invalidate cache → re-fetch window
  end
```

### 3.3 Headless supervision

```mermaid
sequenceDiagram
  participant E as Electron main
  participant SUP as Supervisor
  participant GO as Go core (--headless)

  E->>SUP: new Supervisor({goCoreBinary, grpcAddr, httpAddr, dbPath, token})
  SUP->>GO: spawn(bin, [--grpc-addr, --http-fallback-addr, --token, --db])
  GO-->>SUP: stdout: GO_CORE_READY addr=... http=... token=...
  SUP->>SUP: ready=true, queue drain, restarts=0
  loop every 5s
    SUP->>GO: gRPC Ping({}) + token
    GO-->>SUP: PingResponse{ok, uptime_ms}
  end
  alt exit / Ping miss 2x
    SUP->>SUP: scheduleRestart backoff [200,500,1000,2000,5000] + token rotation
    SUP->>GO: spawn again
  end
  E->>SUP: stop() → kill SIGTERM → graceful 5s
```

## 4. Módulos Angular (features verticales)

```
features/repo/
  ├── repo.routes.ts      <- lazy load
  ├── repo.service.ts     <- facade sobre IpcBridge (getCommits, getStatus…)
  ├── repo-models.ts      <- ViewModels (CommitRow, Lane)
  ├── page/repo-page.ts   <- orquesta graph + status + diff
  └── ui/
      ├── graph/          <- virtual scroll + lanes canvas
      ├── status/         <- stage/unstage, file list
      ├── diff/           <- Monaco side-by-side/unified
      ├── branches/       <- branches/tags/stashes/worktrees
      └── toolbar/        <- fetch/pull/push + progress bar
```

Cada feature tiene su **Signals store** (ver `service-design.md §2`): `GraphStore`, `StatusStore`, `DiffStore`, `BranchStore`.

## 5. Módulos Go (internal)

| Módulo | Depende de | Expone |
|--------|------------|--------|
| `domain` | nada (puro) | entidades, VOs, ports interfaces, errores |
| `service` | `domain` ports | casos de uso, validación, transacciones |
| `repository` | `domain`, `database/sql` | SQLite impl de `RepoPort`, `CachePort` |
| `adapter/git` | `domain` | `GitPort` via exec/go-git |
| `adapter/grpc` | `service`, `gen/go` | `GitCore` gRPC server, interceptors token/auth |
| `adapter/http` | `service` | fallback REST `/health`, `/commits`, etc. |
| `adapter/watcher` | `domain` | `WatcherPort` fsnotify |
| `adapter/mcp` *(opcional)* | `service`, `gen/go` | MCP server (stdio), tools `git_<verb>` — ver ADR-013 |
| `config` | Viper, flags | `Config` struct |
| `cmd/go-core` | todos | DI wiring, listeners, graceful shutdown |
| `cmd/mcp-server` *(opcional)* | todos | composition root MCP; wiring compartido vía `internal/bootstrap` |

## 6. Dependencias externas

- `modernc.org/sqlite` o `mattn/go-sqlite3` (CGO) + `fsnotify`
- `google.golang.org/grpc` + `connect` opcional
- `spf13/viper` + `spf13/cobra` o `flag`
- `buf` (Contracts) + `stephenh/ts-proto` (gen/ts)
- Angular CDK (virtual scroll) o canvas; `monaco-editor` + `monaco-workers`

## 7. Verificación del diagrama

- `domain/` no importa `service/` ni `adapter/` → `go vet ./...` + import cycle check.
- Angular `ng build` sin Electron — `window.gitClientApi` mockeado en `environments`.
- Go `go run --headless` sin Angular/Electron — `GO_CORE_READY` emitido.
```
