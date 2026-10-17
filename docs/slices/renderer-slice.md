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
version: 1.5.2
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
- M3 landed: branch/merge/tag/stash UI plus the graph context-menu "Create branch here" / "Tag this commit" and a merge-conflict banner; multi-repo Workspaces / repo tabs (renderer-only UI-state) with renderer-orchestrated multi-repo fetch-all; the cross-repo search view (sidebar WORKSPACE `search`; **retired by [[adr-0034-retire-cross-repo-commit-search]]**); a git-flow panel; and deep-link routing plus clipboard clone / copy-repo-URL (clone prefill only, V1.4) — [[adr-024-multi-repo-workspaces]], [[adr-025-deep-links-and-clipboard-clone]], [[adr-026-cross-repo-commit-search]], [[adr-027-git-flow-presets]], [[adr-028-advanced-git-rpcs]].
- File status screen landed (renderer-only, [[adr-0029-file-status-screen]]): `/repo/file-status` with local / commit / PR variants, a `FileStatusStore` composing `StatusStore`, the diff always on the right, and the graph context-menu "File status" entry selecting the commit then routing there. This post-M3 work is not part of the M-numbering above and is recorded here on landing.
- History screen is compare-free, landed (renderer-only, [[adr-0030-history-screen-is-compare-free]]): the History screen is now a read-only commit overview — `RepoPage` no longer mounts `st-status-workspace` below the graph (the fixed 260px `.st-repo-page__status` band and `status-workspace.ts` are gone), the selection-coupled first-parent diff went with the panel, and the selected-commit aside renders only `commit-details-panel` (general characteristics, no file list / diff / stats). The inline compare modal is removed: `GraphStore`'s `compare` / `compareDiff` / `compareLoading` / `compareError` state plus `compareCommits` / `clearCompare` are deleted, and "Compare with selected" is a navigation shortcut that reuses the "File status" hand-off (`GraphStore.select(oid)` then route to `/repo/file-status`), staying disabled for the synthetic WIP row. Three mechanisms that lived only in the deleted band were re-homed: the `git:watch` kickoff into `GraphStore.openRepository` (`startWatch`, `graph.store.ts`), the graph half of `RepoState.statusRefreshRequested` into `RepoPage` and its working-tree half into `FileStatusPage` (`refreshForExternalChange()`), and `fs:changed → graph.reload()` into `RepoPage`; `StatusStore.loadCommitDiff` is kept as a store capability with no graph-selection consumer — **narrowly updated by [[adr-0032-history-commit-file-list-tooltip]]:** the History aside now shows a changed-file list tooltip next to "Review changes" (`st-popover`, sourced from `StatusStore` + the existing `getDiff`), so the store's commit-diff read once again has a graph-selection consumer while the diff itself stays in File status. No new RPC, IPC channel or Go-core change. This post-M3 work is not part of the M-numbering above and is recorded here on landing.
- Performance with large repos remains under watch.
