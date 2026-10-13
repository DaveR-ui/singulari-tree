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
version: 1.0.3
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
- `./tools/scripts/run-tests-local.sh` reproduces the CI suites locally, in the same order and from the same package directories as the workflow: build go-core + Angular renderer + Electron shell, `go vet` and `go test` from `apps/go-core`, Electron typecheck + vitest, then the Playwright Electron smoke. Every Go/TS command runs from its own package directory, never the root; without a `DISPLAY` the smoke is wrapped in `xvfb-run` exactly like CI. `E2E_REQUIRE_PREREQS` is deliberately left **unset** locally so a developer without a full build gets an honest skip — CI sets it to `'1'` so a broken build can never look green.
- Its `--windows-paths` mode cross-compiles and runs the Go suite for `GOOS=windows` under Wine as a **best-effort** extra: the authoritative Windows proof stays the `windows-latest` CI job (or `gh workflow run`), and Wine is not Windows (it reproduced some, not all, of the Windows-only failures).

## Conventions of this slice

- Commands are run from the package directory, never from the root (except Go via `go.work`).
- `--headless` mode must be reproducible.

## Dependencies

- **Upstream:** `buf`, `go`, `node` toolchains.
- **Downstream:** all slices.

## Known gaps & accepted debt

- **Correction (adjudicated):** the earlier claim that "there is no remote CI pipeline" was **false**. CI exists at `.github/workflows/ci.yml`: workflow `CI`, triggered on `push` to `main`, `pull_request` and `workflow_dispatch`, with `concurrency` group `ci-${{ github.workflow }}-${{ github.ref }}` (`cancel-in-progress: true`) and `permissions: contents: read`.
- The single job `build-and-test` runs a two-OS matrix (`[ubuntu-latest, windows-latest]`) with `fail-fast: false` — deliberately, so neither OS can hide the other's failure — and `timeout-minutes: 45`. Steps: checkout; Node 24 + npm cache; Go from `go.work` (1.26.0); `npm ci`; build go-core, Angular renderer and Electron shell; Electron and Angular vitest; `go vet ./...` then `go test ./... -count=1`; the Playwright Electron smoke with `E2E_REQUIRE_PREREQS: '1'`, wrapped in `xvfb-run` on Linux; and an `apps/electron/e2e-results/` upload on failure (7-day retention).
- This matches the frozen `docs/context/git-client/roadmap-mvp.md:104` (the 2-OS e2e smoke); the frozen roadmap is **not** edited (ratchet), and it agrees with the corrected claim.
- `.github/workflows/pages.yml` is a second, separate workflow: it deploys the static `website/` folder to GitHub Pages (no build step; its own `pages` concurrency group).
- `verify-docs.sh` is new.
