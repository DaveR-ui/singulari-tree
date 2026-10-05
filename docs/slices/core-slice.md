---
id: core-slice
category: slices
tags:
- slice
- generality
aliases:
- Core slice
related:
- slices-index
version: 1.0.1
status: active
---

# Core — Slice Generalities

## What this slice is

Headless Go core that concentrates the domain, the services, the repository and the adapters. It does not depend on Electron or Angular: it can be compiled and run on its own.

## Boundaries

- **IN:** `apps/go-core/**`, `data/sqlite/**`.
- **OUT:** contracts, Electron shell and Angular renderer.

## Entry points

- `apps/go-core/cmd/go-core/main.go` — startup and wiring (Viper + DI).
- `apps/go-core/internal/domain/` — entities and ports.
- `apps/go-core/internal/service/` — use cases.
- `apps/go-core/internal/repository/` — SQLite persistence.
- `apps/go-core/internal/adapter/` — adapters (git, grpc, http, watcher).

## How it works

- Hexagonal *ports & adapters* architecture.
- Starts with `--headless` and prints the `GO_CORE_READY` line with the fields `addr`, `http` and the rotated session `token`.
- gRPC is the primary transport (unix socket on Linux/macOS, named pipe on Windows); HTTP acts as fallback.
- SQLite in WAL mode is a metadata cache; it **never** stores Git objects.
- Coalesced watcher over the filesystem.

## Conventions of this slice

- The domain does not depend on infrastructure.
- One service per use case.
- `go vet` and `go test` run from `apps/go-core`.

## Dependencies

- **Upstream:** contracts, `git` binary, SQLite.
- **Downstream:** desktop-shell (gRPC); renderer (through the shell).

## Known gaps & accepted debt

- The `git` adapter is a stub.
- The MCP surface is ADR-013 **Proposed** and is not implemented.
