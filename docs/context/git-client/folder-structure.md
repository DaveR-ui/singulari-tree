# Estructura de carpetas — Monorepo SingulariTree

> Fuente de verdad del árbol: `README.md` del repo. Este documento añade **rationale** por carpeta.

## 1. Árbol canónico

```
SingulariTree/                         <- monorepo root (carpeta física SingulariTree, alias lógico git-client)
├── docs/
│   └── context/
│       └── git-client/                <- ESTE FOLDER: 12 docs de diseño (topic folder greenfield)
│           ├── INDEX.md               <- índice + mapa entregables (canónico)
│           ├── README.md              <- alias de INDEX.md
│           ├── architecture.md        <- C4 L1-3 + hexagonal + headless proof §5
│           ├── folder-structure.md    <- este archivo
│           ├── module-diagram.md      <- mermaid C4 + secuencia IPC + prueba hexagonal
│           ├── domain-model.md        <- entidades, VOs, agregados, SQLite schema, errores
│           ├── ipc-strategy.md        <- preload bridge + gRPC/HTTP + proto sketch + supervisor §2.6 + seguridad
│           ├── service-design.md      <- servicios Go, stores Angular, cache, watchers, paginación
│           ├── testing-strategy.md    <- pirámide, vitest/go test/playwright
│           ├── roadmap-mvp.md         <- MVP 8-10 semanas
│           ├── roadmap-v1.md          <- V1 16-20 semanas post-MVP
│           ├── risks.md               <- riesgos técnicos
│           └── decisions.md           <- 13 ADRs justificadas
├── apps/
│   ├── angular/                       <- Angular 21 renderer (zoneless, standalone, signals)
│   │   ├── angular.json
│   │   ├── package.json               <- @singularitree/angular
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── main.ts                <- bootstrapApplication
│   │       ├── styles.scss
│   │       ├── environments/
│   │       │   ├── environment.ts
│   │       │   └── environment.development.ts
│   │       └── app/
│   │           ├── app.ts / app.config.ts / app.routes.ts
│   │           ├── core/
│   │           │   ├── services/
│   │           │   │   ├── ipc-bridge.service.ts   <- wrapper window.gitClientApi (typed)
│   │           │   │   └── repo-state.service.ts    <- Signals global state
│   │           │   ├── guards/
│   │           │   └── layout/
│   │           ├── features/
│   │           │   └── repo/                        <- feature vertical (ver service-design.md)
│   │           │       ├── repo.routes.ts
│   │           │       ├── repo.service.ts
│   │           │       ├── repo-models.ts
│   │           │       ├── page/repo-page.ts
│   │           │       └── ui/repo-list.ts
│   │           ├── shared/
│   │           │   ├── ui/
│   │           │   ├── data/
│   │           │   └── utils/
│   │           └── environments/
│   ├── electron/                      <- Electron shell (main + preload + ipc + window)
│   │   ├── package.json               <- @singularitree/electron
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── main/
│   │       │   ├── main.ts            <- app.whenReady, BrowserWindow, supervisor.start
│   │       │   ├── supervisor.ts      <- spawn go-core, GO_CORE_READY, Ping 5s, queue
│   │       │   └── app-menu.ts
│   │       ├── preload/
│   │       │   └── preload.ts         <- único contextBridge.exposeInMainWorld
│   │       ├── ipc/
│   │       │   ├── channels.ts        <- CHANNELS const + validate
│   │       │   ├── handlers.ts        <- ipcMain.handle → forwardToGo
│   │       │   └── events.ts          <- push events (fs:changed, progress)
│   │       └── window/
│   │           ├── window.ts
│   │           └── csp.ts             <- Content-Security-Policy
│   └── go-core/                       <- Go headless core (domain + services + adapters)
│       ├── go.mod                     <- module github.com/SingulariTree/go-core (Go 1.25+)
│       ├── cmd/
│       │   └── go-core/
│       │       └── main.go            <- Viper + DI + gRPC/HTTP, --headless flag
│       └── internal/
│           ├── domain/                <- entidades puras + ports (hexagonal centro)
│           │   ├── repository.go
│           │   ├── commit.go
│           │   ├── branch.go
│           │   ├── remote.go
│           │   ├── tag.go
│           │   ├── stash.go
│           │   ├── worktree.go
│           │   ├── diff.go
│           │   └── errors.go
│           ├── service/               <- casos de uso (orquestan ports)
│           │   ├── repo_service.go
│           │   ├── git_service.go
│           │   ├── graph_service.go
│           │   ├── cache_service.go
│           │   └── watcher_service.go
│           ├── repository/            <- SQLite persistence adapters
│           │   ├── repo_store.go
│           │   └── commit_cache.go
│           ├── adapter/
│           │   ├── git/               <- exec git / go-git (GitPort impl)
│           │   │   └── stub.go
│           │   ├── grpc/
│           │   │   └── server.go
│           │   ├── http/
│           │   │   └── handler.go
│           │   └── watcher/
│           │       └── watcher.go     <- fsnotify + debounce
│           └── config/
│               └── config.go          <- Viper + flags
├── libs/
│   ├── contracts/                     <- Fuente única de verdad (proto → gen)
│   │   ├── package.json               <- @singularitree/contracts
│   │   ├── buf.yaml                   <- v2, lint STANDARD, breaking FILE
│   │   ├── buf.gen.yaml               <- go + grpc/go + ts-proto
│   │   ├── proto/
│   │   │   ├── domain.proto           <- Oid, Signature, Commit, Branch, Remote, Tag, Stash, Diff...
│   │   │   ├── errors.proto           <- AppError + ErrorCode
│   │   │   └── gitcore.proto          <- service GitCore (Ping, GetCommits, StreamCommits, Watch...)
│   │   └── gen/
│   │       ├── go/                    <- buf generate (gitignored keep)
│   │       └── ts/                    <- buf generate
│   └── ui-kit/                        <- shared Angular UI kit (dumb components)
│       ├── package.json
│       ├── ng-package.json
│       └── src/
│           ├── index.ts
│           ├── button/
│           ├── graph-row/             <- fila grafo con lanes
│           ├── diff-viewer/           <- Monaco wrapper
│           └── styles/
├── data/
│   └── sqlite/                        <- docs + migrations (DB runtime fuera del repo)
│       ├── README.md
│       └── migrations/
│           └── 001_initial.sql        <- repos, commit_cache, file_status, stash_cache
├── tools/
│   ├── scripts/
│   │   ├── gen-contracts.sh           <- buf generate --template buf.gen.yaml
│   │   └── build-go-core.sh           <- go build -o dist/go-core ./apps/go-core/cmd/go-core
│   └── ci/
│       └── verify-contracts.sh        <- buf lint + buf breaking + buf generate --dry-run
├── go.work                            <- Go workspace (use ./apps/go-core)
├── package.json                       <- root workspaces (angular, electron, contracts, ui-kit)
└── README.md                          <- traceability + headless proof + quick start
```

## 2. Rationale por carpeta

| Carpeta | Por qué existe | Qué NO va ahí |
|---------|---------------|---------------|
| `apps/angular` | Renderer aislado; puede compilar sin Electron (ng serve contra mock `window.gitClientApi`). Zoneless + signals para performance grafo. | Lógica Git, acceso FS, spawns. |
| `apps/electron` | Shell mínimo; solo ventana + IPC + supervisor. Mantiene Angular y Go desacoplados. | Lógica de negocio Git, estado UI. |
| `apps/go-core` | Headless core; corre `go run --headless` sin UI. Hexagonal puro: `domain` sin deps externas. | Código Electron/Angular, SCSS, HTML. |
| `apps/go-core/cmd/go-core` | Composition root (DI) — único lugar que conoce todos los adapters. | Lógica de dominio. |
| `apps/go-core/internal/domain` | Centro hexagonal; VOs/entidades testeables sin IO. | `database/sql`, `grpc`, `fsnotify`. |
| `apps/go-core/internal/service` | Orquesta ports; transacciones; validación. | Detalles gRPC/HTTP. |
| `apps/go-core/internal/adapter/*` | Adapters concretos intercambiables (git exec vs go-git, grpc vs http, fsnotify mock). | Reglas de negocio. |
| `apps/go-core/internal/repository` | SQLite adapters; WAL; migrations. | Git logic. |
| `libs/contracts` | Single source of truth; `buf breaking` previene regresiones de API. | Implementaciones. |
| `libs/contracts/gen` | Generado; nunca editado a mano. `.gitkeep` en scaffold. | Código manual. |
| `libs/ui-kit` | Dumb components reutilizables (graph-row, diff-viewer). | Estado, servicios. |
| `data/sqlite` | Docs de schema + migrations; DB runtime en `~/.local/share/...` (fuera repo). | Datos de usuario, blobs Git. |
| `tools/scripts` | Automatiza `buf generate` y `go build`; CI usa `tools/ci`. | Lógica de app. |
| `docs/context/git-client` | Topic folder greenfield; no toca Necomat; promoción futura a Slices opcional. | Código. |

## 3. Reglas de importación

```
Angular  → puede importar: libs/ui-kit, libs/contracts/gen/ts
          × NO puede importar: apps/go-core, apps/electron, data/sqlite

Electron → puede importar: libs/contracts/gen/ts (para tipar IPC), apps/go-core (solo para resolver bin path)
          × NO implementa lógica Git

Go core  → puede importar: libs/contracts/gen/go, data/sqlite/migrations (embed)
          × NO importa Angular/Electron
```

## 4. Por qué esta estructura (vs alternativas)

- **Monorepo npm workspaces + go.work** vs polyrepo: un `buf generate` actualiza ambos lados atomícamente; CI único.
- **`libs/contracts` separado** vs proto dentro de `apps/go-core`: permite que Angular genere tipos sin depender de Go.
- **`data/sqlite/migrations` fuera de `apps/go-core`**: documenta schema para ambos mundos; Go hace `embed` en build.
- **`docs/context/git-client` topic folder** vs `docs/project.md` slice inmediato: evita prematura promoción; Necomat intacto.

## 5. Convención de nombres

- Go module: `github.com/SingulariTree/go-core` (capital S, repo `SingulariTree`).
- Proto package: `singularitree.v1` (lowercase), alias `gitclient.v1` en comentarios para búsquedas legado.
- npm scopes: `@singularitree/*` (`@singularitree/angular`, `@singularitree/electron`, `@singularitree/contracts`, `@singularitree/ui-kit`).
- IPC channels: `git:<verb>` (`git:getCommits`, `git:stage`), events `repo:changed`, `fs:changed`, `git:progress`.

## 6. Qué verifica que la estructura es válida

```bash
npm run gen:contracts --workspace=@singularitree/contracts  # genera gen/go + gen/ts
go vet ./...                                                 # go-core compila
ls libs/contracts/proto/*.proto                              # domain, errors, gitcore existen
ls data/sqlite/migrations/001_initial.sql
ls apps/electron/src/main/supervisor.ts apps/electron/src/preload/preload.ts
```
