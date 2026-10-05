---
last_updated: 2026-09-28
status: active
description: Punto de entrada agent-facing de SingulariTree — monorepo Angular + Electron + Go core; stack, slices, comandos y navegación del corpus.
tags:
- project
- entry-point
- singularitree
version: 1.0
doc_language: es
---

# SingulariTree — Punto de entrada del proyecto

## Overview

SingulariTree es un **monorepo** de un cliente Git de escritorio multiplataforma. Forma del sistema:

> **el grafo/files son la verdad; SQLite solo guarda caché de metadata, NUNCA objetos Git.**

- **Core Go headless** (`apps/go-core`): se puede ejecutar sin Electron ni Angular (`--headless`, emite `GO_CORE_READY`).
- **Arquitectura hexagonal** (ports & adapters): el contacto con Git existe **solo** dentro del core Go.
- El renderer nunca habla con Git; todo cruza IPC → shell → core.

**Anti-goals** (no negociables):

- El renderer **nunca** habla con Git directamente.
- **No** se guardan objetos Git en SQLite — solo metadata cache, config y UI-state.
- **No** se modifican `frontend/` ni `backend/` de Necomat.

## Technology Stack

| Área | Tecnología |
|---|---|
| Runtime JS | Node >=20 (npm workspaces) |
| Renderer | Angular 21 (zoneless, standalone, signals) + TypeScript ~5.9 |
| Shell | Electron ^32 con TypeScript |
| Core | Go 1.25 (module `github.com/SingulariTree/go-core`) en workspace Go 1.26 (`go.work`) |
| Transporte | gRPC (`google.golang.org/grpc` 1.84) con fallback HTTP |
| Persistencia | SQLite `modernc.org/sqlite` (WAL, `foreign_keys=ON`, DB por usuario fuera del repo) |
| Contratos | proto con `buf` (paquete `singularitree.v1`, alias `gitclient.v1`) |
| Tests | vitest (Angular y Electron), `go test` (core) |
| Patrón | Hexagonal + contrato-primero |

## Slices

| Slice | Description | Keywords | Entry points | Primary agents |
|---|---|---|---|---|
| contracts | Fuente única de contratos proto (buf) y stubs generados Go/TS; frontera de compatibilidad entre core, shell y renderer. | proto, buf, singularitree.v1, gitclient.v1, grpc, generated, gen/go, gen/ts, breaking | `libs/contracts/`, `libs/contracts/proto/`, `libs/contracts/gen/` | coder, tester, reviewer |
| core | Core Go headless: dominio, servicios, repositorio SQLite y adaptadores git/grpc/http/watcher. | go, domain, service, repository, sqlite, wal, adapter, git, watcher, grpc, http, headless, hexagonal | `apps/go-core/`, `apps/go-core/internal/`, `data/sqlite/` | coder, tester, reviewer |
| desktop-shell | Shell Electron: ciclo de vida de ventana, preload/IPC, supervisor del core Go, menú y CSP. | electron, preload, ipc, supervisor, window, menu, csp, main, GO_CORE_READY | `apps/electron/`, `apps/electron/src/main/`, `apps/electron/src/ipc/` | coder, tester |
| renderer | SPA Angular 21 (zoneless, signals, standalone), features y stores; UI kit compartido. | angular, signals, zoneless, standalone, component, route, store, vitest, ui-kit | `apps/angular/`, `libs/ui-kit/` | coder, tester |
| tooling | Scripts de build/generación, CI y validaciones (contratos, migraciones, docs). | ci, script, build, verify, workspace, go.work, npm, buf, validate | `tools/`, `tools/ci/`, `tools/scripts/` | coder, reviewer |
| docs | Corpus de documentación, slices, ADRs, protocolos e índices generados. | docs, frontmatter, hub, index, adr, tag, protocol, slice, onrails | `docs/`, `docs/context/`, `docs/protocols/`, `docs/adrs/` | documenter, explorer |

## Commands

| Command | Purpose |
|---|---|
| `npm start` (raíz) | dev completo Angular + Electron |
| `npm run start:electron-only` | solo shell Electron |
| `npm run build --workspace=@singularitree/angular` | build renderer |
| `npm test --workspace=@singularitree/angular` | vitest renderer |
| `npm test --workspace=@singularitree/electron` | vitest shell |
| `npm run typecheck --workspace=@singularitree/electron` | tsc --noEmit |
| `cd apps/go-core && go vet ./...` | vet core (**NUNCA** desde la raíz) |
| `cd apps/go-core && go test ./...` | tests core |
| `go run ./apps/go-core/cmd/go-core --headless --help` | flags headless (vía `go.work`) |
| `./tools/scripts/gen-contracts.sh` | genera stubs proto (`buf generate`) |
| `./tools/ci/verify-contracts.sh` | breaking check de contratos |
| `./tools/ci/verify-migrations.sh` | valida migraciones SQLite |
| `./tools/scripts/build-go-core.sh` | build binario del core |
| `node tools/docs/validate.js` | valida el corpus (exit 1 si hay errores) |
| `node tools/docs/validate.js --write` | regenera `docs/index.md` + `docs/tag-index.md` |
| `./tools/ci/verify-docs.sh` | hook CI de documentación |

## Repository Structure

```
SingulariTree/
├── apps/
│   ├── angular/        # renderer SPA Angular 21 (zoneless, signals, standalone)
│   ├── electron/       # shell Electron: main, preload, ipc, supervisor
│   └── go-core/        # core Go headless (domain, service, repository, adapter)
├── libs/
│   ├── contracts/      # fuente única proto (buf) + stubs gen/go y gen/ts
│   └── ui-kit/         # UI kit Angular compartido (dumb components)
├── data/
│   └── sqlite/         # migrations; DB runtime por usuario fuera del repo
├── tools/
│   ├── scripts/        # gen-contracts.sh, build-go-core.sh, gen-migrations.sh
│   └── ci/             # verify-contracts.sh, verify-migrations.sh, verify-docs.sh
├── docs/
│   ├── context/        # docs estratégicos (git-client/ legacy en ratchet)
│   ├── slices/         # slices + slices-index.md (hub)
│   ├── protocols/      # protocolos del corpus
│   ├── adrs/           # decision records (append-only)
│   ├── project.md      # entry point (este archivo)
│   ├── index.md        # índice generado
│   └── tag-index.md    # índice de etiquetas generado
├── go.work             # workspace Go (use ./apps/go-core)
└── README.md           # README humano (fuera del corpus)
```

## Key Conventions

- Contratos con fuente única `libs/contracts/proto/*.proto` → `gen/{go,ts}` vía `buf generate`; nunca editar generados a mano.
- Paquete proto `singularitree.v1` con alias `gitclient.v1` por compatibilidad.
- `doc_language: es`: español con términos técnicos en inglés; los encabezados del contrato onrails quedan verbatim.
- Naming `lowercase-kebab-case`; el `id` coincide con el stem del archivo.
- El frontend nunca habla con Git; el core Go es headless y hexagonal.
- SQLite por usuario (WAL, `foreign_keys=ON`) y **NUNCA** guarda objetos Git.
- Necomat `frontend/`/`backend/` permanecen intactos.
- Tests/builds desde el directorio del paquete (nunca la raíz, salvo Go vía `go.work`).
- ADRs append-only; la numeración continúa desde ADR-013.

## Domain Entities

**App:** `Repository` (agregado raíz), `Commit` (DAG inmutable), `Branch`, `Tag`, `Stash`, `Worktree`, `Remote`, `Diff`, `Author`/`Identity`.

**Corpus:** `Slice`, `Hub`, `Note`, `Context-doc`, `ADR`, `Protocol`, `Generated region`, `Tag index`, `Resolver`, `Accepted debt`.

## Context Index

- [`docs/context/documentation-system.md`](context/documentation-system.md) — contrato, capas, naming e índices generados del corpus.
- [`docs/context/accepted-debt.md`](context/accepted-debt.md) — deuda aceptada explícita y criterio del ratchet.
- [`docs/context/git-client/INDEX.md`](context/git-client/INDEX.md) — corpus de diseño legacy, en ratchet.
- [`docs/slices/slices-index.md`](slices/slices-index.md) — hub de slices; rutea cada cambio a su slice primario.
- [`docs/protocols/bootstrap-protocol.md`](protocols/bootstrap-protocol.md) — arranque e inicialización del corpus.
- [`docs/protocols/new-note-protocol.md`](protocols/new-note-protocol.md) — crear una nota nueva conforme al contrato.
- [`docs/protocols/docs-review-protocol.md`](protocols/docs-review-protocol.md) — revisión del corpus y errores del validador.
- [`docs/adrs/adr-index.md`](adrs/adr-index.md) — hub de ADRs (decisiones estructurales, append-only).

## Common Lookups

| Síntoma / pregunta | Dónde mirar |
|---|---|
| No sé dónde cae mi tarea | [docs/slices/slices-index.md#contents](slices/slices-index.md#contents) |
| Voy a crear una nota nueva | [docs/protocols/new-note-protocol.md#solution](protocols/new-note-protocol.md#solution) |
| El validador de docs falla con `metadata-outside-contract` | [docs/protocols/docs-review-protocol.md#solution](protocols/docs-review-protocol.md#solution) |
| Quiero regenerar el índice de documentación | [docs/context/documentation-system.md#solution](context/documentation-system.md#solution) |
| `go-core` no arranca headless (`GO_CORE_READY` ausente) | [docs/context/git-client/architecture.md#5-headless-proof-5-del-readmemd--contrato-ejecutable](context/git-client/architecture.md#5-headless-proof-5-del-readmemd--contrato-ejecutable) |
