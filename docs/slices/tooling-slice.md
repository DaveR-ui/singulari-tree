---
id: tooling-slice
category: slices
tags:
- slice
- generality
aliases:
- Tooling slice
related:
- slices-index
version: 1.0
status: active
---

# Tooling — Slice Generalities

## What this slice is

Scripts de build y generación, más la automatización de CI. Es el punto de entrada reproducible para compilar y verificar el monorepo.

## Boundaries

- **IN:** `tools/**`, `go.work` y las configs de raíz relevantes a build.
- **OUT:** apps y libs (el tooling las orquesta, no las implementa).

## Entry points

- `tools/scripts/` — generación de contratos y build.
- `tools/ci/` — verificaciones de CI.
- `go.work` — workspace Go.
- `package.json` — scripts npm de raíz.

## How it works

- Los scripts bash usan `set -euo pipefail` y resuelven `ROOT` con `dirname`.
- `verify-contracts.sh` corre lint, breaking y drift de protobuf.
- `verify-migrations.sh` valida las migraciones SQLite.
- `tools/ci/verify-docs.sh` (nuevo) valida el corpus con `node tools/docs/validate.js`.

## Conventions of this slice

- Los comandos se ejecutan desde el directorio del paquete, nunca desde la raíz (salvo Go vía `go.work`).
- El modo `--headless` debe ser reproducible.

## Dependencies

- **Upstream:** toolchains `buf`, `go`, `node`.
- **Downstream:** todos los slices.

## Known gaps & accepted debt

- No hay pipeline CI remoto.
- `verify-docs.sh` es nuevo.
