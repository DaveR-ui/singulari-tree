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
version: 1.4.0
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
- File status screen landed (renderer-only, [[adr-0029-file-status-screen]]): `/repo/file-status` with local / commit / PR variants, a `FileStatusStore` composing `StatusStore`, the diff always on the right, and the graph context-menu "File status" entry selecting the commit then routing there. This post-M3 work is not part of the M-numbering above and is recorded here on landing.
- **Pending (not implemented, [[adr-0030-history-screen-is-compare-free]]):** the History screen becomes compare-free. `RepoPage` must stop mounting `st-status-workspace` below the graph (`repo-page.ts:30-32`, fixed 260px `.st-repo-page__status` band `:74-79`); the selection-coupled first-parent diff (`status-workspace.ts:132-143` → `status.store.ts:291-298`) goes away with the panel; the selected-commit aside stays the read-only details panel (`commit-details-panel.ts:13-61`, no file list / diff / stats); and the inline compare modal (`graph-page.ts:162-186`, `graph.store.ts:283-314`) is removed in favour of repurposing the context-menu "Compare with selected" entry as a navigation action to `/repo/file-status`, reusing the `GraphStore.select(oid)` + `router.navigate(['/repo','file-status'])` hand-off (`graph-page.ts:419-424`). Renderer-only — no new RPC, IPC channel or Go-core change.
- Performance with large repos remains under watch.
