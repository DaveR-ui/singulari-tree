---
id: adr-index
category: adrs
tags: [adr, hub, index]
aliases: [ADR Index, ADR List]
related: [adr-0014-docs-corpus-layout, adr-0015-docs-validator-generated-index, adr-0016-lane-state-and-graph-dod, adr-0017-docs-language-en, adr-0018-renderer-i18n-locale-switch, adr-0019-adr-translation-authorization, adr-0020-diff-per-file-and-hunk-staging, adr-0021-reset-modes, adr-0022-graph-context-menu-shell, adr-0023-commit-change-size-gauge, adr-024-multi-repo-workspaces, adr-025-deep-links-and-clipboard-clone, adr-026-cross-repo-commit-search, adr-027-git-flow-presets, adr-028-advanced-git-rpcs, adr-0029-file-status-screen, adr-0030-history-screen-is-compare-free, adr-0031-repository-relocation-and-missing-folder-recovery, adr-0032-history-commit-file-list-tooltip]
version: 1.7.0
status: active
---

# ADRs — Index

## What belongs here

**Structural or schema** decisions of this corpus: layout, note contract, validator, generated indexes. Append-only: an accepted ADR is not edited; if the decision changes, a successor is written with `supersedes`.

## Contents

- [[adr-0014-docs-corpus-layout]] — adopt the documentation-onrails corpus (`docs/` as root, `docs/project.md` as entry point).
- [[adr-0015-docs-validator-generated-index]] — custom zero-dependency validator + generated indexes with marker regions.
- [[adr-0016-lane-state-and-graph-dod]] — per-repo lane state in `GraphService` + graph DoD scoped to vertical columns (edge parity deferred).
- [[adr-0017-docs-language-en]] — adopt English as the documentation corpus language (supersedes ADR-0014 item 7).
- [[adr-0018-renderer-i18n-locale-switch]] — renderer i18n with an EN/ES locale switch via runtime `$localize` (English default).
- [[adr-0019-adr-translation-authorization]] — authorize a translation-only transform of historical ADR bodies (sole exception to append-only; no version bump).
- [[adr-0020-diff-per-file-and-hunk-staging]] — additive per-file `Diff` (`files` + `truncated`) and core-side hunk/line staging & discard (M2).
- [[adr-0021-reset-modes]] — `Reset` RPC with soft/mixed/hard, a `HARD` confirmation guard and `RESET_FAILED`.
- [[adr-0022-graph-context-menu-shell]] — renderer-only graph context-menu shell (Checkout / Compare / Copy SHA; V1.1 entries excluded).
- [[adr-0023-commit-change-size-gauge]] — `GetCommitStats` numstat counts cached in SQLite metadata only (never Git objects).
- [[adr-024-multi-repo-workspaces]] — repo tabs and multi-repo fetch are a renderer-only concept consumed from the core `repos` table (M3).
- [[adr-025-deep-links-and-clipboard-clone]] — provisional `singularitree://` scheme, shell-side routing via `deeplink:open`, clipboard clone prefill (M3).
- [[adr-026-cross-repo-commit-search]] — `SearchCommits` over an indexed SQLite metadata table only, never Git objects (M3).
- [[adr-027-git-flow-presets]] — git-flow semantics live in core over the ADR-028 RPCs; config is SQLite metadata (M3).
- [[adr-028-advanced-git-rpcs]] — V1.1 branch CRUD, merge, tag CRUD and stash apply/pop/drop as append-only RPCs (M3).
- [[adr-0029-file-status-screen]] — renderer-only File Status screen (local / commit / PR variants) reusing GetDiff, GetBranches and the existing StatusStore; the diff is always on the right.
- [[adr-0030-history-screen-is-compare-free]] — History is a read-only commit overview (no panel below the graph); Compare becomes a navigation action to File status (refines ADR-0022's presentation, extends ADR-0029).
- [[adr-0031-repository-relocation-and-missing-folder-recovery]] — a moved/renamed repository folder is a named, recoverable state: `REPO_PATH_MISSING` vs `NOT_A_GIT_REPO` plus an additive `RelocateRepository` RPC that repoints the existing registration (no silent delete).
- [[adr-0032-history-commit-file-list-tooltip]] — the History aside gains a changed-file list tooltip next to "Review changes" — a **narrow** supersession of ADR-0030 that lifts only its "no file list" lock and repeals ADR-0031's item 7b refusal; compare stays in File status.

## Elsewhere

ADR-001..ADR-013 live embedded in `docs/context/git-client/decisions.md` (legacy — see `accepted-debt.md`). Numbering continues at **ADR-033** (last used: ADR-0032). Existing filenames are mixed: the older `adr-024`…`adr-028` are unpadded, `adr-0029` and later are padded; new files follow the padded form and **existing files are never renamed**.
