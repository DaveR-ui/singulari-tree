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
version: 1.0
status: active
---

# Core — Slice Generalities

## What this slice is

Core Go headless que concentra el dominio, los servicios, el repositorio y los adaptadores. No depende de Electron ni de Angular: se puede compilar y ejecutar por sí solo.

## Boundaries

- **IN:** `apps/go-core/**`, `data/sqlite/**`.
- **OUT:** contratos, shell Electron y renderer Angular.

## Entry points

- `apps/go-core/cmd/go-core/main.go` — arranque y wiring (Viper + DI).
- `apps/go-core/internal/domain/` — entidades y puertos.
- `apps/go-core/internal/service/` — casos de uso.
- `apps/go-core/internal/repository/` — persistencia SQLite.
- `apps/go-core/internal/adapter/` — adaptadores (git, grpc, http, watcher).

## How it works

- Arquitectura hexagonal *ports & adapters*.
- Arranca con `--headless` e imprime la línea `GO_CORE_READY` con los campos `addr`, `http` y el `token` de sesión rotado.
- gRPC es el transporte primario (unix socket en Linux/macOS, named pipe en Windows); HTTP actúa como fallback.
- SQLite en modo WAL es caché de metadata; **nunca** guarda objetos Git.
- Watcher coalescido sobre el filesystem.

## Conventions of this slice

- El dominio no depende de infraestructura.
- Un servicio por caso de uso.
- `go vet` y `go test` se ejecutan desde `apps/go-core`.

## Dependencies

- **Upstream:** contratos, binario `git`, SQLite.
- **Downstream:** desktop-shell (gRPC); renderer (a través del shell).

## Known gaps & accepted debt

- El adaptador `git` es un stub.
- La superficie MCP es ADR-013 **Proposed** y no está implementada.
