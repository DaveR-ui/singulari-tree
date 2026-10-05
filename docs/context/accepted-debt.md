---
last_updated: 2026-10-05
status: active
description: Accepted debt of the corpus — legacy documents not yet migrated and explicitly tolerated decisions, with the criterion to reduce it.
tags:
- documentation
- debt
- legacy
- ratchet
version: 1.3
related:
- documentation-system
---

# Accepted Debt

## Problem

Not the whole corpus complies with the onrails contract. Migrating the legacy design and extracting embedded ADRs in bulk (big-bang) would generate enormous noise, break references and halt real work. At the same time, silently tolerating non-compliance turns the corpus into something untrustworthy: nobody knows which exceptions are intentional and which are oversights.

## Solution

Record here **every exception explicitly**, with its reason and the criterion to reduce it. Exceptions are frozen ("ratchet"): the corpus contract only applies to new or touched files; a legacy document is migrated **when it is touched**, not before.

| Accepted item | Why it is tolerated | How it is reduced |
|---|---|---|
| `docs/context/git-client/**` — 13 content docs (`architecture.md`, `decisions.md`, `module-diagram.md`, `service-design.md`, `domain-model.md`, `folder-structure.md`, `roadmap-mvp.md`, `roadmap-v1.md`, `risks.md`, `ipc-strategy.md`, `testing-strategy.md`, `github-oauth-guide.md`, `github-real-data-guide.md`) + non-kebab hub `INDEX.md` + `README.md` alias | No frontmatter and a non-`kebab-case` hub; **EXCLUDED from the validator** (`docs/context/git-client/**` frozen). `roadmap-mvp.md` was already **migrated by ratchet on touch** (`context-doc` frontmatter), but the rest of the tree remains frozen and outside the scan. | Ratchet: migrate each file only when touched (frontmatter + rename hub when applicable); `roadmap-mvp.md` is already migrated. A pure translation is a content transform and does not by itself trigger the ratchet's contract-migration obligation — it changes prose, not shape (no frontmatter, no hub rename) — so the frozen tree remains excluded from the validator. |
| Lane edge visual parity (diagonals/crossings) vs `git log --graph` — Week 1-2 DoD bounded (ADR-0016) | The `Lane{index,color,continues}` wire contract does not carry edge geometry; only **vertical columns** are contracted (correct and continuous across windows). No contract change — deliberate decision (Option B). | Future addition of a `LaneRow`/segment contract + SVG diagonals in the renderer, **behind an ADR** that supersedes [[adr-0016-lane-state-and-graph-dod]]. |
| ADR-001..ADR-013 embedded in `docs/context/git-client/decisions.md` | They are not extracted into `docs/adrs/` to avoid a 13-file big-bang. | Numbering continues at **ADR-014**; new ADRs are born in `docs/adrs/` with their hub. |
| `README.md` (root) | Human README, **no frontmatter**, OUTSIDE the corpus. | Kept as a pointer to the entry point ([`docs/project.md`](../project.md)); it is not migrated. |
| `docs/context/git-client/README.md` | Alias of the legacy hub `INDEX.md`. | Disappears when the legacy hub is migrated/normalized on touch. |
| Monaco diff viewer missing (Week 4 of `roadmap-mvp.md`) — `libs/ui-kit/src/diff-viewer/` is a stub (`index.ts` only exports `DIFF_VIEWER_PLACEHOLDER`) and `monaco-editor` is not in any dependency. | The `stage → commit → diff` UI does not exist yet; therefore the `stage → commit → diff` e2e is a documented `test.skip` (`apps/electron/e2e/smoke.e2e.ts`). The Week 8 "Monaco worker" tuning **does not apply** because there is no Monaco to tune. Implementing it is Week 3-4 scope, not Week 8. | Close the Week 3-4 track (StatusStore + commit box + `diffEditor`) **behind its own cycle**; then remove the e2e `test.skip` and add the diff screenshot. |
| Watcher `fsnotify` is still a stub in the adapter — `apps/go-core/internal/adapter/watcher/watcher.go` does not attach fsnotify; only the real *coalescing* (150ms) lives in `WatcherService`. | The real fsnotify adapter was not Week 8 scope (stabilization); this week the missing debounce/coalescing was implemented (`WatcherService`, tests in `watcher_service_test.go`), not the filesystem watch. | Implement real `fsnotify` in `adapter/watcher` (watch of `.git/index`, `HEAD`, refs, worktree) and remove the "stub" tag from the comments. |
| UNSIGNED package (no signing/notarization/auto-update) | Explicit MVP scope: signing and `electron-updater` are V1 (`roadmap-v1.md` §V1.4). | V1.4 phase: macOS notarization, Windows signing, signed flatpak/AppImage, auto-update. |
| e2e of 2 OSes via GitHub Actions (`ubuntu-latest` + `windows-latest`) — no validation on a local Windows station. | The `roadmap-mvp.md` L104 criterion requires "e2e smoke passes on 2 OSes" and no 2-OS station is declared; the workflow is the minimal verifiable mechanism. The Windows-specific branches (`go-core.exe`, no symlinks) are reasoned but **not executed** on this Linux host. | Run the workflow on real CI; if Windows fails, adjust the shim/build script and re-verify. |

**What is NOT debt** (complies with the contract and must be validated):

- `docs/project.md` — agent-facing entry point.
- `docs/slices/` — slices and their hub `slices-index.md`.
- `docs/protocols/` — corpus protocols.
- `docs/adrs/` — new decision records (ADR-014 onward).
- Generated artifacts `docs/index.md` and `docs/tag-index.md`.

## When to use

- Before "fixing" a legacy file: confirm whether its exception is already here.
- When adding a new temporary exception: add a row with its reason and its exit criterion.

## When not to use

- To justify new non-compliance: a new or touched note **must** comply with the contract (see [[documentation-system]]).
- For files already listed under "What is NOT debt".

## Examples

- A PR that fixes a typo in `docs/context/git-client/risks.md` only adds frontmatter if it also normalizes the file; otherwise it does not enter the validator.
- A PR that creates a new ADR uses `docs/adrs/adr-0014-<slug>.md` and registers it in the `adr-index.md` hub.

## Common mistakes

- Migrating `docs/context/git-client/**` in bulk "to leave it clean" — the ratchet forbids it.
- Extracting ADR-001..ADR-013 into `docs/adrs/` — deliberately avoided (big-bang).
- Adding frontmatter to the root `README.md` or the `git-client/README.md` alias.
- Forgetting to remove a row once the debt is settled.

## References

- How the corpus and the ratchet work: [[documentation-system]]
- Project entry point: [docs/project.md](../project.md)
