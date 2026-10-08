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
version: 1.3.0
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

- M1 landed: repos list, virtualized graph + filter + commit details + WIP row, sidebar branches/tags/remotes, `StatusStore` + changes/commit panel, a lazy-loaded Monaco `DiffViewer`, and settings (theme, en/es).
- M2 landed: graph right-click context-menu shell (Checkout / Compare / Copy SHA, plus Reset) — [[adr-0022-graph-context-menu-shell]] — hunk/line staging & discard UI (Commit Composer), and the commit change-size gauge from `GetCommitStats`.
- M3 landed: branch/merge/tag/stash UI plus the graph context-menu "Create branch here" / "Tag this commit" and a merge-conflict banner; multi-repo Workspaces / repo tabs (renderer-only UI-state) with renderer-orchestrated multi-repo fetch-all; the cross-repo search view (sidebar WORKSPACE `search`); a git-flow panel; and deep-link routing plus clipboard clone / copy-repo-URL (clone prefill only, V1.4) — [[adr-024-multi-repo-workspaces]], [[adr-025-deep-links-and-clipboard-clone]], [[adr-026-cross-repo-commit-search]], [[adr-027-git-flow-presets]], [[adr-028-advanced-git-rpcs]].
- Performance with large repos remains under watch.
