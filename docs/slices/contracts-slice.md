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
version: 1.0.1
status: active
---

# Contracts — Slice Generalities

## What this slice is

Single source of proto contracts and generated stubs. It is the compatibility boundary between the Go core, the Electron shell and the Angular renderer: all three consume the same types and services generated from `libs/contracts/proto`.

## Boundaries

- **IN:** `libs/contracts/**` — proto, `buf` configuration and generated artifacts.
- **OUT:** business logic (Go core) and IPC runtime (desktop-shell).

## Entry points

- `libs/contracts/proto/` — `.proto` definitions.
- `libs/contracts/buf.yaml` — module and lint configuration.
- `libs/contracts/buf.gen.yaml` — generation template.
- `libs/contracts/gen/go` — Go stubs.
- `libs/contracts/gen/ts` — TypeScript stubs.

## How it works

1. The `proto/*.proto` files are edited.
2. `buf generate --template buf.gen.yaml` produces `gen/go` + `gen/ts`.
3. `go.work` includes `libs/contracts/gen` so the Go core consumes the stubs.
4. `tools/ci/verify-contracts.sh` runs lint + breaking against `main` (subdir `libs/contracts`) + drift.

## Conventions of this slice

- Proto package `singularitree.v1` (alias `gitclient.v1`).
- `gen/` is never edited by hand: it is a generated artifact.
- Every breaking change requires `buf breaking`.

## Dependencies

- **Upstream:** `buf` toolchain.
- **Downstream:** Go core, desktop-shell, renderer.

## Known gaps & accepted debt

- Real Git logic pending (MVP).
- The `gitclient.v1` alias is transient.
