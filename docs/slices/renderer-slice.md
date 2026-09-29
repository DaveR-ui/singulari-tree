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
version: 1.0
status: active
---

# Renderer — Slice Generalities

## What this slice is

SPA Angular 21 (zoneless, standalone, signals) con features verticales y stores, más el UI kit compartido. Es la cara visible de SingulariTree.

## Boundaries

- **IN:** `apps/angular/**`, `libs/ui-kit/**`.
- **OUT:** Electron, core Go y contratos (solo los consume).

## Entry points

- `apps/angular/src/app/app.ts` — componente raíz.
- `apps/angular/src/app/app.routes.ts` — rutas top-level.
- `apps/angular/src/app/features/` — features verticales.
- `apps/angular/src/app/core/services/` — `ipc-bridge.service.ts`, `repo-state.service.ts`.
- `libs/ui-kit/src/` — componentes compartidos.

## How it works

- Cada feature es vertical (UI + store + mappers).
- `IpcBridgeService` habla con el preload expuesto por el shell.
- `RepoStateService` expone el estado con signals.
- Los mappers traducen hacia los tipos de `@contracts`.

## Conventions of this slice

- Standalone + zoneless + signals.
- Tests con vitest.
- El UI kit contiene componentes "dumb".

## Dependencies

- **Upstream:** preload bridge y contratos.
- **Downstream:** ninguno.

## Known gaps & accepted debt

- Features mínimas con datos mock.
- Visor de diff (Monaco) y rendimiento con repos grandes pendientes.
