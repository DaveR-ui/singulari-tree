# SingulariTree

> **SingulariTree = git-client monorepo** — SourceTree-inspired multiplatform desktop Git client.
> Greenfield design under `docs/context/git-client/` (see `docs/context/git-client/INDEX.md`).
> Physical folder on disk is `SingulariTree/` (alias `git-client` per `docs/context/git-client/folder-structure.md §1`).
> Module alias: **Singularitree** (Go module `github.com/SingulariTree/go-core`, proto package `singularitree.v1` aka `gitclient.v1` for compatibility).

Necomat `frontend/` (Angular 21 SPA `spa-necomat`) and `backend/` (Go 1.24 API `github.com/DavidRomaniuk/golang-api`) are **untouched** by this scaffold. SingulariTree is additive — see `docs/context/README.md` Three-Tree diagram.

## Monorepo Tree (source of truth: `docs/context/git-client/folder-structure.md §1`)

```
SingulariTree/                         <- monorepo root (physical folder SingulariTree, logical git-client)
├── apps/
│   ├── angular/                       <- Angular 21 renderer (zoneless signals, standalone)
│   │   └── src/app/{app,core,features/<feature>,shared,environments}
│   ├── electron/                      <- Electron shell (main + preload + ipc + window, supervisor)
│   │   └── src/{main,preload,ipc,window}
│   └── go-core/                       <- Go headless core (domain + services + adapters)
│       ├── cmd/go-core/main.go        <- Viper + DI + gRPC/HTTP, --headless flag
│       └── internal/{domain,service,repository,adapter/{git,grpc,http,watcher},config}
├── libs/
│   ├── contracts/                     <- Single contract source (proto -> gen/go + gen/ts)
│   │   ├── proto/{domain,errors,gitcore}.proto
│   │   └── gen/{go,ts}/              <- generated stubs (buf generate)
│   └── ui-kit/                        <- shared Angular UI kit (dumb components)
├── data/
│   └── sqlite/                        <- WAL per-user DB docs + migrations (runtime DB outside repo)
│       └── migrations/001_initial.sql
├── tools/
│   ├── scripts/{gen-contracts,build-go-core}.sh
│   └── ci/verify-contracts.sh
├── go.work                            <- Go workspace (use ./apps/go-core)
└── README.md
```

## Traceability

- Index: `docs/context/git-client/INDEX.md`
- Architecture (C4 + Hexagonal + headless proof): `docs/context/git-client/architecture.md`
- Folder structure: `docs/context/git-client/folder-structure.md`
- Module / hexagonal proof: `docs/context/git-client/module-diagram.md`
- Domain model (entities, SQLite tables, errors): `docs/context/git-client/domain-model.md`
- IPC strategy (preload bridge + gRPC/HTTP, proto sketch §2.3, supervisor §2.6): `docs/context/git-client/ipc-strategy.md`
- Service design (Go services, Angular stores, cache, watchers): `docs/context/git-client/service-design.md`

## Headless Proof (architecture.md §5)

Go core compiles and runs without Electron or Angular:

```bash
# from repo root SingulariTree/
go run ./apps/go-core/cmd/go-core --headless --grpc-addr unix:///tmp/singularitree-go.sock --db ~/.local/share/singularitree/cache.db

# compiled binary (ephemeral localhost ports):
./dist/go-core --headless --grpc-addr 127.0.0.1:0 --http-fallback-addr 127.0.0.1:0 --log-level info
# stdout when ready:
# GO_CORE_READY addr=unix:///tmp/singularitree-go.sock http=127.0.0.1:0 token=<32B hex>
```

Behavior in `--headless`:
- starts gRPC on Unix socket (Linux/macOS) or named pipe `\\.\pipe\singularitree-go-core` (Windows) and HTTP fallback on ephemeral localhost;
- prints `GO_CORE_READY addr=... http=... token=...` for supervisor discovery;
- health `Ping` every 5s; graceful shutdown on `SIGTERM`/`SIGINT`.

## Contracts

- Go module: `github.com/SingulariTree/go-core` (Go 1.25+)
- Proto package: `singularitree.v1` (alias `gitclient.v1` for compatibility — see `libs/contracts/proto/*.proto` header comments)
- Generation: `buf generate --template buf.gen.yaml` -> `libs/contracts/gen/go` + `libs/contracts/gen/ts`
- Breaking check: `buf breaking` via `tools/ci/verify-contracts.sh`

## Necomat Isolation

This monorepo does not modify `frontend/` or `backend/`. Workspace routing (`docs/project.md` Slices table) remains authoritative for Necomat; SingulariTree is documented as a greenfield topic folder under `docs/context/git-client/` until promoted to a slice.

## Quick Start (scaffold)

```bash
# verify Go core builds headless
go vet ./...
go run ./apps/go-core/cmd/go-core --headless --help
# generate contracts (requires buf)
./tools/scripts/gen-contracts.sh
# build binary
./tools/scripts/build-go-core.sh
```
