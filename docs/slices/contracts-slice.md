---
id: contracts-slice
category: slices
tags:
- slice
- generality
aliases:
- Contracts slice
related:
- slices-index
version: 1.0
status: active
---

# Contracts — Slice Generalities

## What this slice is

Fuente única de contratos proto y stubs generados. Es la frontera de compatibilidad entre el core Go, el shell Electron y el renderer Angular: los tres consumen los mismos tipos y servicios generados desde `libs/contracts/proto`.

## Boundaries

- **IN:** `libs/contracts/**` — proto, configuración de `buf` y artefactos generados.
- **OUT:** lógica de negocio (core Go) y runtime IPC (desktop-shell).

## Entry points

- `libs/contracts/proto/` — definiciones `.proto`.
- `libs/contracts/buf.yaml` — configuración de módulo y lint.
- `libs/contracts/buf.gen.yaml` — plantilla de generación.
- `libs/contracts/gen/go` — stubs Go.
- `libs/contracts/gen/ts` — stubs TypeScript.

## How it works

1. Se editan los `proto/*.proto`.
2. `buf generate --template buf.gen.yaml` produce `gen/go` + `gen/ts`.
3. `go.work` incluye `libs/contracts/gen` para que el core Go consuma los stubs.
4. `tools/ci/verify-contracts.sh` ejecuta lint + breaking contra `main` (subdir `libs/contracts`) + drift.

## Conventions of this slice

- Paquete proto `singularitree.v1` (alias `gitclient.v1`).
- Nunca se edita `gen/` a mano: es artefacto generado.
- Todo cambio breaking requiere `buf breaking`.

## Dependencies

- **Upstream:** toolchain `buf`.
- **Downstream:** core Go, desktop-shell, renderer.

## Known gaps & accepted debt

- Lógica Git real pendiente (MVP).
- El alias `gitclient.v1` es transitorio.
