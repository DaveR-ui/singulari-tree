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
version: 1.0.1
status: active
---

# Tooling — Slice Generalities

## What this slice is

Build and generation scripts, plus CI automation. It is the reproducible entry point to compile and verify the monorepo.

## Boundaries

- **IN:** `tools/**`, `go.work` and the root build-relevant configs.
- **OUT:** apps and libs (tooling orchestrates them, it does not implement them).

## Entry points

- `tools/scripts/` — contract generation and build.
- `tools/ci/` — CI checks.
- `go.work` — Go workspace.
- `package.json` — root npm scripts.

## How it works

- The bash scripts use `set -euo pipefail` and resolve `ROOT` with `dirname`.
- `verify-contracts.sh` runs lint, breaking and drift for protobuf.
- `verify-migrations.sh` validates the SQLite migrations.
- `tools/ci/verify-docs.sh` (new) validates the corpus with `node tools/docs/validate.js`.

## Conventions of this slice

- Commands are run from the package directory, never from the root (except Go via `go.work`).
- `--headless` mode must be reproducible.

## Dependencies

- **Upstream:** `buf`, `go`, `node` toolchains.
- **Downstream:** all slices.

## Known gaps & accepted debt

- There is no remote CI pipeline.
- `verify-docs.sh` is new.
