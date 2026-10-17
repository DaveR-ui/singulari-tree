---
id: adr-0035-commit-details-redesign-and-inline-hunk-actions
category: adrs
tags: [adr, renderer, graph, status, diff, staging, ui-kit]
aliases: [ADR-035, Commit-details redesign and inline per-hunk diff actions]
related: [adr-index, adr-0033-commit-details-files-expandable-panel, adr-0020-diff-per-file-and-hunk-staging, adr-0029-file-status-screen, adr-0030-history-screen-is-compare-free, design-system, renderer-slice, feature-gap-analysis]
version: 1.1
status: active
---

# ADR-035: The commit-details panel is a header/description/files/footer surface, and the diff viewer carries host-supplied inline per-hunk actions (refines ADR-033)

## Problem

Two surfaces shipped by earlier ADRs no longer match how the operator uses them, and the mismatch is structural rather than cosmetic.

**The commit-details panel.** [[adr-0033-commit-details-files-expandable-panel]] gave the History aside an inline expandable changed-file list, and the P4.1 polish batch gave the panel a `collapsible` compact-head mode so it would stop crowding the list it shares a column with (`renderer-redesign-plan` §P4.1 item 4). Both were guesses about vertical budget: the panel's identity (short oid, branch chip), its 22px subject, its message body, its file list and its metadata all competed for the same space, and the only way to reclaim room was to collapse **the whole panel** — which hid the very commit the list described. A commit that touches dozens of files was also unscannable: there was no way to ask the list for the one path the operator came for, and the heading counted nothing.

**The diff viewer and its hunk actions.** Hunk/line staging and discarding shipped in M2 ([[adr-0020-diff-per-file-and-hunk-staging]]) as a separate `st-hunk-actions` block sitting in the changes panel's **left column**, beside the diff it acted on — the affordance and the code it addressed were in different columns, wired through a second diff read. The viewer itself was strictly read-only: it had no notion of a hunk as a target, so any inline affordance would have meant a second, parallel diff rendering and a parallel addressing path.

## Solution

Decision, itemized. This ADR **refines [[adr-0033-commit-details-files-expandable-panel]]**: ADR-0033 stays `active` and is **not** superseded — its data source (`StatusStore` + the existing `getDiff`), its read-only path-list contract and the compare-free boundaries all stand as written. Exactly two things change: the panel's internal layout and disclosure model, and the viewer's ability to carry host-supplied inline actions.

### 1. The commit-details layout is header row → description → changed files → demoted metadata

`apps/angular/src/app/features/repo/graph/ui/commit-details-panel.ts` renders, top to bottom: a **header row**, a collapsible **description block** (subject + body), an independently collapsible **changed-files block**, and a de-emphasized **metadata footer**.

The header row is three slots: **identity left** (mono short sha + branch chip), the **primary CTA centred** (the opt-in `showCta` "Review changes" button, in a `flex: 1` centre slot so it stays centred regardless of how wide either side grows), and the **action group right** (padlock, contextual nav, analyzer-only "show in graph"). The metadata block moves to the bottom behind a hairline top rule, muted at `opacity: .75`, so author/date/commit/parents/refs and the committer line never compete with the message.

### 2. The panel loses its compact-head mode; one exclusive switch owns the description/files choice

The `collapsible` input (compact head + collapsed-by-default body) is **removed**. Space is reclaimed by rendering **one region at a time** rather than by hiding the panel: a single two-segment `st-toggle-group` switch — **`description` (default) | `files`** — sits in the subject row, exactly where the description disclosure used to sit, and decides which region is mounted. **Exactly one of {description, changed files} is in the DOM — never both, never neither** (the inactive region is not rendered, not hidden with CSS). The subject `h1` stays rendered in both modes because it is the commit's identity; it clamps to one line in `files` mode and wraps in full in `description` mode. The panel owns the mode as local view state (`mode`, the same pattern as its existing `fileFilter`), and forces `files` — disabling the `description` segment — when the commit has no body, so a body-less commit can never land in an empty `description` mode.

The two independent icon-only disclosures this section originally recorded, and their `aria-expanded` / `aria-controls` wiring, are gone; the **2026-10-17 refinement below** is the authoritative description of the switch and of the analyzer's second instance of it.

### 3. The changed-files block gains a literal-substring name filter and an accurate, filter-aware count

Inside the changed-files region sits a `st-input type="search"` (`testId="commit-details-files-filter"`) and a heading that counts what is actually there: `N changed files` (singular/plural aware) unfiltered, `N of M changed files` while a filter is active. Match semantics are **case-insensitive literal substring via `String#includes` — never a RegExp** — so filter metacharacters (`*`, `[`, `]`, `.`) a path legitimately contains stay literal and no path is ever matched by an unintended pattern. Two distinct empty states: "No changed files." (the commit has none) versus "No files match the filter." (files exist, the query matches none). The filter is view state owned by the panel; the store never sees it.

### 4. The `back` output and `showNavigation` input are replaced by one contextual-nav slot

`showNavigation` (with `viewInTree` / `back`) is gone. The header's action group renders exactly one contextual navigation affordance, chosen by the `navMode` input — `'none' | 'release' | 'history'`:

- `'release'` — the History "Back" action (`data-testid="commit-details-release"`), which drops the lock **and** the selection (item 6). Both the History aside and the File-status commit embed use it.
- `'history'` — the analyzer shortcut back to the graph (`data-testid="commit-details-history"`, `history` icon), which the File-status **local** variant renders also in the empty branch when nothing is pinned — so "pick a commit" is one click away.
- `'none'` — no navigation affordance.

The `commit-details-byline` element is deleted along with the compact head.

### 5. The selection lock (padlock) is owned by `GraphStore`, not by the panel

`GraphStore` (`apps/angular/src/app/features/repo/graph/graph.store.ts`) gains `lockedOid` / `lockedCommit` signals and `lock()` / `unlock()` / `release()`. The panel is a dumb renderer: it takes a `locked` boolean, emits `lockToggle` and holds **no** lock state — the same dumb-primitive shape the CTA (`showCta`) and the changed-file list (`changedFiles`) already use.

**State-ownership rationale.** The lock cannot live in the panel, because the panel is unmounted exactly when the lock matters. `REPO_ROUTES` provides `GraphStore` on the parent route, so the store instance (and therefore the lock) spans `/repo` ↔ `/repo/file-status`; the panel instance does not. The lock's whole purpose is cross-screen: pin a commit in History, walk to File status, and contrast the working tree against it at one click. Only a route-scoped store can hold that, and `GraphStore` is the store that already owns `selectedOid` — the lock is a constraint **on** the selection, so it belongs beside it.

### 6. The lock refuses foreign selections and announces the refusal; only the explicit release moves it

`select(oid)` is the single chokepoint every selection path funnels through — row clicks, `moveSelection` (keyboard), and the deep-link `focusCommit` — so the guard lives there and nothing can bypass it:

- While locked, a **foreign** oid (including `null` and the synthetic `WIP_OID`) is refused and the refusal is announced through the root `LiveRegionService`. Re-selecting the locked oid — or selecting freely while unlocked — behaves exactly as before. The announcement is a best-effort side channel: the store captures the service with `inject(..., { optional: true })` guarded by a `try/catch`, so a unit test constructing `new GraphStore(bridge)` with no DI context degrades to silence instead of throwing `NG0203`. Lock semantics never depend on the region being present.
- `lock()` is a no-op unless a genuine commit is selected (nothing selected, the WIP row, or an oid absent from the loaded `rows()` all leave the lock open) and captures **both** the oid and the live `Commit` object. Holding `lockedCommit` separately is deliberate: `reload()` / `loadWindow()` / `applyPage()` never touch the lock, so when the pinned commit falls out of a freshly loaded window the cached object still renders the pinned detail pane instead of blanking to "select a commit" (the File-status follow effect reads it for exactly this reason).
- `unlock()` clears the lock and **keeps** the selection (the padlock's "off" intent); `release()` clears both — it writes `selectedOid` directly, because it is the one action *allowed* to move a locked selection. The guard exists to block foreign selectors, not the release itself.
- `openRepository` clears the lock on **both** the success and the failure path: a different repository's DAG invalidates the pinned commit, so it must not outlive the switch. `reload()` deliberately does not.

### 7. "Show in graph" is a deep-link hand-off, not a second navigation path

The analyzer-only action (`showInGraph` input → `revealInGraph` output, `data-testid="commit-details-show-in-graph"`) reuses the **existing** `CommitFocusService` hand-off: `FileStatusPage` calls `request(repoId, oid)` and navigates to `/repo`; `RepoPage`'s existing hydration effect consumes the pending focus and runs `GraphStore.focusCommit(oid)`, whose bounded paging (`COMMIT_FOCUS_MAX_LOADS = 10` extra windows, stopping early when a page makes no progress) reveals a commit outside the loaded window. No new service, no new route, and the lock still governs the selection the focus applies.

### 8. `st-diff-viewer` gains host-supplied inline per-hunk actions — and keeps being read-only by default

The ui-kit primitive gains `hunkActions = input<readonly HunkActionSlot[] | null>(null)` and the outputs `hunkAction {hunkIndex, actionKey}` / `hunkLineToggle {hunkIndex, lineIndex}`, with `HunkActionSpec {key, icon, label, disabled?}` describing one button (the host owns the localised label; the viewer adds none of its own beyond its line-checkbox name).

- **Default (`null`): unchanged.** Monaco mounts when it can, and the 4-column tokenized grid (`old | new | sign | text`) is the fallback — before the chunk loads, in tests, or if initialization fails.
- **Actions supplied: the viewer renders its own 5-column tokenized grid** (`checkbox | old | new | sign | text`, `28px 36px 36px 20px minmax(0, 1fr)`) with the per-hunk action buttons on each hunk's header row and a checkbox on every changed line, and **Monaco never mounts** — `shouldInitialize()` returns `false`, and `maybeInitializeMonaco()` disposes an already-mounted editor if actions arrive later. The grid honours the same `data-wrap` contract and `fontSize`/`diffLineHeight` inputs as the read-only fallback.

**Force-grid rationale.** Inline affordances on a Monaco `DiffEditor` would mean injecting DOM into an editor whose views are virtualized and re-created on scroll — the buttons would have to be re-anchored to (and reconciled against) Monaco's own layout, in a surface no unit test can reach without booting the editor. The viewer's existing tokenized grid is already the tested, deterministic rendering of a diff; giving it per-hunk rows and per-line checkboxes costs one more grid mode and keeps the whole contract testable in jsdom. The trade is explicit: in action mode the surface is the grid, not the editor.

### 9. The hunk → action-index mapping is one pure walk, so `hunkIndex` is the RPC's `hunk_index`

A new pure function `hunkGridSegments(diff)` in `libs/ui-kit/src/diff-viewer/hunks-to-texts.ts` (unit-tested) walks the **same** row layout `diffToGridRows` produces and returns, per hunk, its header row index and the `(rowIndex, lineIndex)` pairs of its changed lines. There is no second diff computation: the rendered hunk maps 1:1 to the diff the host addresses, and `lineIndex` is the index into `hunk.lines`. The viewer delegates all state to the host — it holds no selection, knows no RPC, and emits indices only.

### 10. The local variant can drive the inline actions because its diff *is* the addressing substrate

`FileStatusPage` supplies `hunkActions` for the selected actionable unstaged file only (`isHunkActionable`: tracked, textual, not deleted, hunks present) and `null` on every read-only path — the commit and PR variants, no selection, binary/conflicted/staged files. In the local variant the viewer's diff **is** the worktree diff (`StatusStore.loadWorkingTreeDiff` sets `unstagedDiff` to the same `Diff`), which is also the stage/discard addressing substrate, so `hunkIndex` maps 1:1 to `StageHunk` / `DiscardHunk` `hunk_index` and the line index to `line_indices` — **the existing ADR-0020 RPCs. No proto, no IPC channel, no Go-core change.**

The per-line selection (`hunkIndex` → sorted `lineIndex[]`) lives on the **page**, not in the viewer: the diff refreshes asynchronously on every `fs:changed`, and the page is the thing that survives the re-render while owning the addressing. It is cleared once an action has been dispatched. The diff-pane layout toggle (`st-toggle-group`) is hidden while slots are supplied, because the action grid ignores side-by-side and an inert control would mislead.

### 11. `st-hunk-actions` and the left-column `changes-hunks` block are deleted

The old affordance is not kept as a parallel surface: the `st-hunk-actions` component and the `changes-hunks` block in the changes panel's left column are removed, and `isHunkActionable` moves to `apps/angular/src/app/features/repo/status/ui/hunk-actions.model.ts`. One affordance, one place, next to the code it acts on.

### 12. File-diff-list gains the same literal name filter, and the icon registry two padlock glyphs

`st-file-diff-list` gains a name filter with the identical `String#includes` semantics, AND-combined with the existing status chips (an empty filter set is the identity filter, never "match nothing"). The `st-icon` registry gains `lock` and `lock-open` (additive); `pin` / `pin-off` are untouched. The en/es catalogues are kept in exact id parity (the locale files belong to another engineer).

### Refinement (2026-10-17) — the two disclosures become one exclusive switch

The operator asked that "the button to show the full description or the files be a switch that limits you to one or the other". The two independent disclosures recorded above are **replaced by a single exclusive switch on both surfaces**: exactly one of {description, changed files} is visible — never both, never neither — and the default segment is `description`. This refines the surface's internals only; the ADR still **sits on top of [[adr-0033-commit-details-files-expandable-panel]]**, which stays `active`.

- **Primitive.** `st-toggle-group` (`libs/ui-kit/src/toggle-group/toggle-group.ts`) is reused as a dumb two-segment switch and stays dumb. `ToggleOption` gains an additive optional per-segment `disabled?: boolean`, so a single segment can be disabled while the group itself stays enabled.
- **History aside (`st-commit-details-panel`, hosted by `repo-page`).** The switch sits in the subject row, exactly where the old description chevron was; the subject `h1` stays rendered in both modes (its identity), clamped to one line in `files` mode and full/wrapping in `description` mode. The bordered changed-files block keeps its heading row but loses its chevron. The literal-substring filter (`commit-details-files-filter`, case-insensitive via `String#includes`, never a `RegExp`), the `N of M changed files` heading and both empty states are preserved. The panel owns the mode as view state (`mode`, the same pattern as its `fileFilter`); `effectiveMode` forces `files` when the commit has no body, and the `description` segment is then disabled — a commit with no body can never land in an empty `description` mode. Exactly one region is in the DOM at any time (never CSS-hidden).
- **Commit analyzer (`file-status-page`, commit variant).** The switch takes the place of the old `file-status-title-toggle` in the right-pane title header (`file-status-title`), which stays anchored above `file-status-diff`. `description` mode → the title sector shows whatever the message carries: the subject in full (wrapping) when there is one, plus the commit body when there is one — so the sector is never empty; `files` mode → the title sector degrades to the short sha and the left column's `st-file-diff-list` is the visible region. In `description` mode the left column's summary line and file list are both hidden (the file list is also the diff selector; the right-pane diff viewer is **not** cleared). The page owns the mode (`analyzerMode`) as a component-local signal, and **neither segment is ever disabled here**: unlike the panel — where the subject is the always-rendered identity, so a description view of a body-less commit adds nothing — the analyzer's description sector **is** the message, so the subject alone is content and the segment is never a dead control. The title sector renders on `hasMessage` (a subject **or** a body), never on the subject alone: a message that starts with a blank line has an empty subject but a real body, and gating on the subject would hide both sectors at once. A commit with no message at all (no subject, no body) renders no title sector and no switch, and `effectiveAnalyzerMode` forces `files`, so the left column is never left empty either.
- **Reconciliation of `showSubject` / `showFiles`.** `showSubject` now gates the panel's ENTIRE description sector and `showFiles` the files sector. Both analyzer embeds keep `[showSubject]="false" [showFiles]="false"`: in the analyzer **both** sectors are owned by the page's mode (title sector / left column), so the panel renders identity + metadata only. Recorded consequence: the File-status **local** variant's pinned-commit anchor no longer renders the commit body — the description sector has exactly one home per surface.
- **Mode never leaks between hosts.** The panel's `mode` signal and the page's `analyzerMode` signal are separate component-local instances; no shared or global state was introduced.
- **Testids.** Removed `commit-details-toggle`, `commit-details-files-toggle`, `file-status-title-toggle`; added `commit-details-view-switch`, `file-status-view-switch`, `file-status-title-body`; segment ids come from the primitive's convention (`toggle-segment-description`, `toggle-segment-files`). Everything else is unchanged.
- **Locales.** `Description`, `Files` and `Description or changed files` are added to the en/es catalogues (exact id parity enforced by `i18n-runtime.spec.ts`), and the four disclosure strings `Show description`, `Hide description`, `Collapse commit title` and `Expand commit title` are removed. The plain `Changed files` id is **kept**: `st-file-diff-list`'s heading still carries that message, so dropping the id would strand the heading untranslated and the next extraction would re-add it.
- **Renderer-only.** No new RPC, no IPC, no proto, no Go-core change — the ADR-0033 and ADR-0035 refusals hold.

### Refusals

- **Not a reopening of the compare-free lock.** The changed-files block still lists **paths only** — no hunks, no diff, no stats, no staging — the diff still lives only in `/repo/file-status`, and no status band or inline compare modal returns. [[adr-0030-history-screen-is-compare-free]] and [[adr-0033-commit-details-files-expandable-panel]] stand.
- **Not a stateful ui-kit.** `st-diff-viewer` stays dumb: it takes inputs, emits indices, owns no global state, reads no store and holds no line selection. Both the selection and the RPC mapping live in the page.
- **Not a proto / IPC / Go-core change.** The inline actions reuse the ADR-0020 per-hunk RPCs through the existing store methods; no contract, channel or Go file changed.
- **Not a supersession of ADR-0033.** Its data source, read-only path-list contract and compare-free boundaries are unchanged; only the surface's internals moved. ADR-0033 stays `active`.
- **Refused: pre-setting the Branch comparator (PR variant) with the locked commit.** `FileStatusStore.openPr` diffs **base ↔ target branches** (`getDiff(from: baseRefOid, to: targetRefOid)`) and takes no commit input, so "compare the pinned commit against a branch" is not expressible. It would need a new RPC — or a widened `GetDiff` addressing — which the renderer-only constraint forbids. The padlock therefore does not reach the PR variant, and this is recorded as out of scope rather than approximated in the UI.
- **Recorded, not re-homed: per-hunk unstage.** Its staged-side affordance is not rebuilt through some other surface — the reduction is stated in Consequences instead of hidden.

### Consequences

- **The panel's vertical budget is honest.** One exclusive switch shows **description or changed files — never both** — instead of hiding the panel that describes the commit, and the metadata no longer competes with the message. The removed `collapsible` mode is not replaced by another layout input, and no second disclosure returns.
- **The description/files choice is host-local and never leaks.** The panel's `mode` and the analyzer's `analyzerMode` are separate component-local signals, so a pick on one surface never reaches the other; no shared or global mode state exists.
- **The description sector has exactly one home per surface.** `showSubject` gates the panel's whole description sector and `showFiles` its files sector; both analyzer embeds pass `[showSubject]="false" [showFiles]="false"` because the page owns both regions there. Recorded consequence: the File-status **local** variant's pinned-commit anchor no longer renders the commit body.
- **The lock is a cross-screen concept, and it is the only way to keep a commit pinned while the working tree is on screen.** Because it lives on the route-scoped store, the File-status follow effect and the pinned detail pane read the same instance the History graph selects on.
- **A refused selection is announced, not silently dropped.** Mouse, keyboard and the deep-link hand-off all go through `select`, so the pin cannot be stolen by accident; the announcement uses the existing root live region.
- **Inline actions now sit next to the code they touch, and the surface is deterministic.** `st-hunk-actions` and the left `changes-hunks` block are gone; the viewer renders the grid itself, and the address mapping is the single pure `hunkGridSegments` walk.
- **Known reduction, recorded honestly: per-hunk UNSTAGE is no longer surfaced.** The viewer renders a **single** diff — the worktree one — and hunk actions address it, so the staged side has no inline affordance. **File-level unstage remains** through `st-changes-panel` (`unstage` RPC). `StatusStore.unstageHunk` survives as a store capability with no UI consumer; restoring the affordance needs a staged-side diff surface (a staged variant or a per-file diff switcher), which is a future decision, not a regression to be hidden.
- **The analyzer's layout toggle is hidden while actions are supplied** (the action grid ignores side-by-side), so an inert control never misleads; the read-only commit/PR paths keep the toggle.
- [[feature-gap-analysis]] and [[renderer-redesign-plan]] get a truthfulness update recording the redesign (and, on 2026-10-17, the exclusive-switch refinement), and [[design-system]]'s `st-diff-viewer` entry no longer describes the primitive as unconditionally read-only while its `st-toggle-group` entry documents the per-segment `count` pill and `disabled`.

### Exit criterion

- Done when: the commit-details panel renders header (identity | centred CTA | action group) → one exclusive `description | files` switch (default `description`) that mounts exactly one region at a time (the subject stays rendered in both; the `description` segment is disabled and `files` forced for a body-less commit) → a literal-substring name filter with an accurate count inside the files region → demoted metadata footer; the analyzer's title header carries the same switch (`file-status-view-switch`, rendered whenever the commit carries any message — `hasMessage` — with neither segment disabled, showing the subject and/or the body in `description` mode) and hides the left summary + file list in `description` mode, while a message-less commit renders no title sector and falls back to `files`; `showSubject` gates the whole description sector and `showFiles` the whole files sector, with both analyzer embeds passing `[showSubject]="false" [showFiles]="false"`, and the mode is component-local on each host (no shared state); the `collapsible` mode, the two disclosures and `showNavigation`/`back` no longer exist and `navMode` (`none | release | history`) drives the contextual action; the store-owned lock refuses foreign selections (announced through the live region), survives `/repo` ↔ `/repo/file-status`, is cleared by `openRepository` and never by `reload()`, and keeps the pinned pane rendering from `lockedCommit`; `st-diff-viewer` renders its own 5-column grid with per-hunk actions and per-line checkboxes when `hunkActions` is supplied (Monaco suppressed) and is byte-for-byte the previous read-only surface when it is `null`; `hunkIndex`/`lineIndex` come from the pure `hunkGridSegments` walk and drive the unchanged ADR-0020 RPCs; `st-hunk-actions`, the left `changes-hunks` block and `commit-details-byline` are gone and `isHunkActionable` lives in `hunk-actions.model.ts`; no proto, IPC channel or Go-core file changed; and the compare-free contract holds (paths only in the aside, no status band, no inline compare modal, the diff only in `/repo/file-status`).

## When to use

- When the History aside or the File-status analyzer needs to show a selected commit's identity, message, changed paths and metadata without the blocks fighting for one vertical budget.
- When a commit must stay pinned across `/repo` ↔ `/repo/file-status` so working-tree changes can be contrasted against it.
- When a read-only diff needs per-hunk or per-line affordances that address the core's existing `hunk_index` / `line_indices` RPCs.
- When an analyzer affordance is really a hand-off — reuse `CommitFocusService` and the graph's bounded `focusCommit` paging instead of adding navigation.

## When not to use

- Not to render hunks, a diff, staging controls or stats in the History aside — the changed-files block is a filtered path list, nothing more.
- Not to put lock state, line selection or RPC knowledge inside `st-diff-viewer` (or `commit-details-panel`): both stay dumb; the page and the store own state.
- Not to add an RPC, IPC channel or Go-core change for inline actions — the ADR-0020 per-hunk RPCs already address exactly these indices.
- Not to reach the PR variant with the locked commit: it diffs base ↔ target branches and has no commit input.
- Not to claim per-hunk unstage still works from the diff pane: only file-level unstage is surfaced.

## Examples

```text
/repo  (History)                                  /repo/file-status
  graph                                             local variant
  aside (st-commit-details-panel)                     pinned commit panel (lockedCommit) + changes panel
    header: 7-char sha · branch  [Review changes]      commit variant
            (centred)           [padlock][Back]           title: [description | files] switch
    subject  + [description | files] switch               description -> title: subject (full) + body
    exactly one region mounted:                           files       -> title: short sha;
      description  subject (full, wrapping) + body                     left file list visible
      files        [N of M changed files]  filter                     (description hides left summary + list)
                   paths only, own scroll
    metadata  hairline + muted: author/date/commit/parents/refs + committer

padlock ON   select(foreign oid) -> refused + announced (live region)
             reload()/loadWindow() -> lock untouched; lockedCommit keeps the pane
             openRepository(...)    -> lock cleared (different repo)
padlock OFF  unlock() keeps the selection; release() drops lock + selection

st-diff-viewer
  hunkActions = null     -> Monaco (4-column grid fallback)   [commit / PR / no selection]
  hunkActions = [...]    -> viewer's own 5-column grid        [local variant, actionable file]
                            header row: [ ] old  new  sign  @@ …  [stage][discard]
                            line rows:  [x] old  new  sign  code
                            -> hunkAction {hunkIndex, actionKey} -> StageHunk/DiscardHunk (ADR-0020)
```

## Common mistakes

- **Reintroducing a panel-wide collapse mode** to make room for the file list — one exclusive switch (`description | files`) makes room now.
- **Re-adding a second disclosure** (a description chevron *and* a files chevron): the two are one exclusive switch now — never both visible, never neither.
- **CSS-hiding the inactive region instead of not rendering it** — exactly one of {description, changed files} is in the DOM at any time.
- **Holding the mode in shared state** — the panel's `mode` and the analyzer's `analyzerMode` are separate component-local signals; a pick on one surface never reaches the other.
- **Disabling the analyzer's `description` segment** — the analyzer's description sector IS the message (subject and/or body), so it is never empty and the segment is never a dead control; only the panel disables its segment (there the subject is the always-rendered identity, so a body-less description view would add nothing). And never key the analyzer's title sector on the subject alone: a message starting with a blank line has an empty subject but a real body, and gating on `commitTitle()` would leave NEITHER sector in the DOM.
- **Matching paths with a `RegExp`** (or a `filter` predicate built from user input): the contract is case-insensitive literal substring via `String#includes`, so `*`, `[`, `.` in a path stay literal.
- **Holding the lock in the panel or the page** instead of the route-scoped `GraphStore`: the panel is unmounted on the screen change the lock exists for.
- **Letting `reload()` clear the lock** — only a different repository (`openRepository`) invalidates it.
- **Mounting Monaco in action mode**, or re-deriving the diff inside the viewer: the grid is the surface and `hunkGridSegments` is the only walk.
- **Putting the line selection in the viewer**: it must survive the async diff refresh, so the page owns it.
- **Claiming the ADR-0020 RPCs changed** — they did not; only the affordance moved next to the diff.
- **Re-adding per-hunk unstage through a new component** without a staged-side diff surface: file-level unstage is what exists today.

## References

- The file-list panel this refines (still `active`): [[adr-0033-commit-details-files-expandable-panel]]
- Per-file diff plus hunk/line staging and discard — the RPCs the inline actions address: [[adr-0020-diff-per-file-and-hunk-staging]]
- File Status screen (the sole diff surface, and the variant model): [[adr-0029-file-status-screen]]
- History is compare-free (the outer contract, unchanged): [[adr-0030-history-screen-is-compare-free]]
- The design system entry that documents `st-diff-viewer`: [[design-system]]
- Feature-gap analysis (truthfulness update): [[feature-gap-analysis]]
- Renderer redesign plan (truthfulness update): [[renderer-redesign-plan]]
- Renderer slice: [renderer-slice](../slices/renderer-slice.md)
- ADR hub: [[adr-index]]
