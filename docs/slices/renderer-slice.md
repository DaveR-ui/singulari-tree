---
id: renderer-slice
category: slices
tags:
- slice
- generality
aliases:
- Renderer slice
related:
- slices-index
version: 1.0.2
status: active
---

# Renderer — Slice Generalities

## What this slice is

Angular 22 SPA (zoneless, standalone, signals) with vertical features and stores, plus the shared UI kit. It is the visible face of SingulariTree.

## Boundaries

- **IN:** `apps/angular/**`, `libs/ui-kit/**`.
- **OUT:** Electron, Go core and contracts (it only consumes them).

## Entry points

- `apps/angular/src/app/app.ts` — root component.
- `apps/angular/src/app/app.routes.ts` — top-level routes.
- `apps/angular/src/app/features/` — vertical features.
- `apps/angular/src/app/core/services/` — `ipc-bridge.service.ts`, `repo-state.service.ts`.
- `libs/ui-kit/src/` — shared components.

## How it works

- Each feature is vertical (UI + store + mappers).
- `IpcBridgeService` talks to the preload exposed by the shell.
- `RepoStateService` exposes state with signals.
- The mappers translate towards the `@contracts` types.

## Conventions of this slice

- Standalone + zoneless + signals.
- Tests with vitest.
- The UI kit contains "dumb" components.

## Dependencies

- **Upstream:** preload bridge and contracts.
- **Downstream:** none.

## Known gaps & accepted debt

- Minimal features with mock data.
- Diff viewer (Monaco) and performance with large repos pending.
