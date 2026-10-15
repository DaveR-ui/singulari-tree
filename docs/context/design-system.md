---
last_updated: 2026-10-15
status: active
description: Shipped SingulariTree renderer design system — the navy & cyan palette in dark and light, the two-tier CSS custom property vocabulary, typography, spacing and geometry, the ui-kit component inventory, and copy-paste usage.
tags:
- design-system
- renderer
- tokens
- theming
- ui-kit
version: 1.1
related:
- renderer-redesign-plan
- renderer-slice
---

# SingulariTree — Navy & Cyan — Style Reference

> navy workbench — indigo surfaces, hairline structure, and one cyan accent that marks identity

**Theme:** dark (default) + light (`[data-theme='light']`)

SingulariTree's renderer reads as a dense-but-calm desktop instrument: a navy workbench where structure comes from 1px hairlines and type weight instead of boxes and gradients, and a single cyan accent marks identity — brand glyph, commit hashes, the current branch, focus rings and the primary action — while nothing else competes for it. Panels are flat and separated by a hairline, list rows stay legible at 12–13px with a mono byline, and the commit graph is the only continuously-drawn, saturated element on screen. The system ships as two tiers of CSS custom properties in `libs/ui-kit/src/styles/tokens.scss`: raw primitives (`--st-prim-*`, never referenced by a component) and a semantic layer (`--st-color/space/font/size/radius/motion/z-*`, the only layer components consume). Every semantic token is defined twice — in `:root` (dark defaults) and in a matched `[data-theme='light']` block — so a light value can never silently fall back to a dark one. This is the shipped state of the committed direction in [[renderer-redesign-plan]] §2.

> **P4.1 palette shift (2026-10-15).** At the operator's request ("un poco más como antes") the DARK surfaces, structure and text moved off the neutral charcoal ramp onto a **navy/indigo** ramp — canvas `#1e1e2e`, surfaces `#252536` / `#2a2a3a`, raised `#2e2e40`, border `#3a3a52`, text `#e9e9f2`, muted `#a8a8c0` — echoing the app's earlier navy family. The **cyan accent, the eight graph lanes, the ref pills and the status colours are deliberately unchanged**: the accent is the documented identity token, the lane palette is built on the same family, and the reference blue `#0a84ff` reaches only ~4.3:1 against these navy surfaces — below WCAG AA for the 11–13px mono hash/path text that consumes `--st-color-accent`, where `#69dfdc` holds ~10:1. Geometry, hairlines, radii, the type scale and the light theme are untouched; only the dark colour family changed, so the direction now reads **Navy & Cyan**. The full rationale is written in `tokens.scss`'s header note.

## Tokens — Colors

### Semantic layer (dark + light)

Both values are shown for every token: the dark value is defined in `:root`, the light value in `[data-theme='light']`. Components consume only these names.

**Surface and text**

| Name | Token | Dark | Light | Role |
|------|-------|------|-------|------|
| App canvas | `--st-color-bg` | `#1e1e2e` | `#f7f8f7` | shell background, routed region |
| Chrome | `--st-color-chrome` | `#232334` | `#eceeed` | top bar and status bar |
| Rail | `--st-color-rail` | `#20202f` | `#f0f2f1` | nav rail |
| Surface | `--st-color-surface` | `#252536` | `#ffffff` | panels, panes, cards |
| Surface 2 | `--st-color-surface-2` | `#2a2a3a` | `#f4f6f5` | raised strips, table header, field background |
| Raised | `--st-color-raised` | `#2e2e40` | `#ffffff` | popovers, modals |
| Border | `--st-color-border` | `#3a3a52` | `#d8dcda` | hairline structure |
| Border strong | `--st-color-border-strong` | `color-mix(border 94%, text)` | `color-mix(border 90%, text)` | pane dividers, focus-adjacent edges |
| Text | `--st-color-text` | `#e9e9f2` | `#14181a` | primary text |
| Muted | `--st-color-muted` | `#a8a8c0` | `#5b6668` | bylines, paths, metadata |

**Accent and selection**

| Name | Token | Dark | Light | Role |
|------|-------|------|-------|------|
| Accent | `--st-color-accent` | `#69dfdc` | `#0f7f7c` | brand, hashes, current branch, primary CTA |
| Accent soft | `--st-color-accent-soft` | `color-mix(accent 18%)` | `color-mix(accent 12%)` | active nav fill, accent badges |
| Accent contrast | `--st-color-accent-contrast` | `#16162a` | `#ffffff` | text on accent fills |
| Focus | `--st-color-focus` | `#69dfdc` | `#0f7f7c` | `:focus-visible` ring |
| Selected fill | `--st-color-selected` | `#123a46` | `#d3ece9` | selected row fill |
| Selection bar | `--st-color-selected-bar` | `#69dfdc` | `#0f7f7c` | 3px inset selection bar |
| Selected border | `--st-color-selected-border` | `#3a7d78` | `#7fc4bd` | selected row hairline |

**Status**

| Name | Token | Dark | Light | Role |
|------|-------|------|-------|------|
| Add | `--st-color-add` / `-soft` | `#9fe0b1` / `mix 14%` | `#1c7c3c` / `mix 10%` | `+N` stats, staged, add badge |
| Remove | `--st-color-remove` / `-soft` | `#ffacaf` / `mix 14%` | `#b3261e` / `mix 10%` | `−N` stats, discard |
| Warn | `--st-color-warn` / `-soft` | `#ebcb86` / `mix 14%` | `#8a6100` / `mix 10%` | modified, ahead/behind, conflict |
| Danger | `--st-color-danger` / `-soft` | `#ffacaf` / `mix 14%` | `#b3261e` / `mix 10%` | destructive actions, error notices |

**Diff tints**

| Name | Token | Dark | Light | Role |
|------|-------|------|-------|------|
| Insert | `--st-color-diff-insert-bg` / `-fg` | `#223e2e` / `#c6f1d1` | `#e6f7ea` / `#14532d` | added lines |
| Delete | `--st-color-diff-delete-bg` / `-fg` | `#49292d` / `#ffd4d5` | `#fde8e9` / `#7f1d1d` | removed lines |
| Hunk | `--st-color-diff-hunk-bg` / `-fg` | `#293638` / `#aad8d7` | `#e8f4f3` / `#0f5f5c` | hunk headers |
| Gutter | `--st-color-diff-gutter-bg` / `-fg` | `#20202f` / `#6f7690` | `#f4f6f5` / `#8a9490` | line-number columns |

**Graph lanes and ref pills**

| Name | Token | Dark | Light | Role |
|------|-------|------|-------|------|
| Lane 1 | `--st-color-graph-lane-1` | `#67cbc7` | `#52a29f` | graph lane colour |
| Lane 2 | `--st-color-graph-lane-2` | `#cfad78` | `#a68a60` | graph lane colour |
| Lane 3 | `--st-color-graph-lane-3` | `#8fd6a0` | `#72ab80` | graph lane colour |
| Lane 4 | `--st-color-graph-lane-4` | `#e79aa0` | `#b97b80` | graph lane colour |
| Lane 5 | `--st-color-graph-lane-5` | `#b3a6e8` | `#8f85ba` | graph lane colour |
| Lane 6 | `--st-color-graph-lane-6` | `#7fb3e0` | `#668fb3` | graph lane colour |
| Lane 7 | `--st-color-graph-lane-7` | `#e2cf8a` | `#b5a66e` | graph lane colour |
| Lane 8 | `--st-color-graph-lane-8` | `#dba6d4` | `#af85aa` | graph lane colour |
| Ref — HEAD | `--st-color-ref-head` | `#67cbc7` | `#0f7f7c` | `HEAD` ref pill |
| Ref — branch | `--st-color-ref-branch` | `#9fe0b1` | `#1c7c3c` | local branch ref pill |
| Ref — remote | `--st-color-ref-remote` | `#ebcb86` | `#8a6100` | `remote/branch` ref pill |
| Ref — tag | `--st-color-ref-tag` | `#b3a6e8` | `#6d28d9` | tag ref pill |

**Badges and misc**

Badge fills are a low-alpha mix of the hue with a solid foreground; graph badges reuse `--st-color-graph-lane-N`.

| Name | Token | Role |
|------|-------|------|
| Branch badge | `--st-color-badge-branch-bg` / `-fg` | `color-mix(accent 12%)` fill, accent foreground |
| Tag badge | `--st-color-badge-tag-bg` / `-fg` | `color-mix(warn 12%)` fill, warn foreground |
| Success badge | `--st-color-badge-success-bg` / `-fg` | `color-mix(add 12%)` fill, add foreground |
| Warning badge | `--st-color-badge-warning-bg` / `-fg` | `color-mix(warn 12%)` fill, warn foreground |
| Avatar | `--st-color-avatar-bg` / `-fg` | `#343a52`/`#cef4db` (dark), `#d9e6df`/`#14532d` (light) |
| Overlay | `--st-color-overlay` | `rgba(12,12,24,.62)` (dark), `rgba(20,24,26,.35)` (light) |

### Tier-1 primitives

Raw, theme-independent values. Never reference these from a component — they exist only so the semantic layer has a single vocabulary to draw from.

```
ink-900 #1e1e2e   ink-850 #20202f   ink-800 #252536   ink-750 #2a2a3a
ink-700 #2e2e40   ink-600 #3a3a52   ink-050 #e9e9f2   ink-300 #a8a8c0
cyan-400 #69dfdc  cyan-500 #438c89  cyan-600 #356966  cyan-700 #164746
green-300 #9fe0b1 red-300 #ffacaf   amber-300 #ebcb86
diff    ins-bg #223e2e ins-fg #c6f1d1   del-bg #49292d del-fg #ffd4d5   hunk-bg #293638 hunk-fg #aad8d7
graph   graph-cyan #67cbc7 graph-amber #cfad78   avatar-bg #343a52 avatar-fg #cef4db
```

> The neutral primitives are the navy/indigo ramp shipped by the P4.1 palette shift; the accent, status, diff and graph primitives are unchanged from the committed direction.

## Tokens — Typography

### Inter — UI and body family · `--st-font-ui`

`Inter, system-ui, -apple-system, sans-serif`. Every non-code surface uses this stack: nav labels, buttons, commit subjects, settings, table headers. No font asset is bundled (the CSP forbids remote fonts), so the stack resolves to `system-ui` on most machines. Weights are quantised to **400 / 500 / 600 / 700** — fractional weights (550/650) resolve unpredictably on the system fallback and are not used.

### Mono — hashes, paths and code · `--st-font-mono`

`Consolas, 'Liberation Mono', ui-monospace, SFMono-Regular, Menlo, monospace`. Mono is reserved for mechanisms where character alignment matters: commit oids (short and full), fs paths, `remote/branch` ref names, diff code and gutter numbers, `+N/−N` counts, keycaps and dates. It is never used for nav labels, buttons, settings labels, commit subjects or table headers.

### Type Scale

Sizes come from the numeric `--st-font-*` tokens; line heights from `--st-leading-tight` (1.25, dense rows), `--st-leading-ui` (1.5, prose and descriptions) and `--st-leading-code` (24px, the 12px mono diff/editor grid).

| Role | Size | Line height | Token | Use |
|------|------|-------------|-------|-----|
| eyebrow | 11px | 1.25 | `--st-font-11` | uppercase group headers (`.st-eyebrow`, `letter-spacing: .08em`, muted) |
| byline / meta | 11px | 1.5 | `--st-font-11` | muted metadata, dates, paths |
| row subject / label | 12px | 1.25 | `--st-font-12` | list rows, controls, table cells |
| body | 13px | 1.5 | `--st-font-13` | shell base size, prose, descriptions |
| brand | 17px | 1.25 | `--st-font-17` | top-bar wordmark; the default `st-icon` render size |
| detail subject | 22px | 1.25 | `--st-font-22` | commit subject in the detail pane |
| code | 12px | 24px | `--st-font-12` + `--st-font-mono` | diff/editor grid (`.st-leading-code`) |

All numeric columns set `font-variant-numeric: tabular-nums` (`.st-tabular-nums`) so dates and counts do not jitter.

## Tokens — Spacing & Shapes

**Base unit:** 4px · **Density:** compact

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 1 | 4px | `--st-space-1` |
| 2 | 8px | `--st-space-2` |
| 3 | 12px | `--st-space-3` |
| 4 | 16px | `--st-space-4` |
| 5 | 20px | `--st-space-5` |
| 6 | 24px | `--st-space-6` |
| 7 | 32px | `--st-space-7` |
| 8 | 40px | `--st-space-8` |

### Border Radius

| Element | Value | Token |
|---------|-------|-------|
| micro chips | 3px | `--st-radius-1` |
| controls (nav items, inputs, toggles) | 4px | `--st-radius-2` |
| cards and panels | 5px | `--st-radius-3` |
| popovers, drawer | 8px | `--st-radius-4` |
| pills (badges, ref pills) | 999px | `--st-radius-pill` |

### Geometry

| Token | Value | Role |
|-------|-------|------|
| `--st-hairline` | 1px | the single structural separator (panels never use shadows) |
| `--st-size-topbar` | 64px | shell top bar |
| `--st-size-statusbar` | 31px | shell status bar |
| `--st-size-rail` | 224px | nav rail |
| `--st-size-rail-collapsed` | 40px | collapsed nav rail |
| `--st-size-drawer` | 264px | repo drawer (pinned) |
| `--st-size-detail-pane` | 380px | pinned detail pane in a split |
| `--st-size-pane-min` | 320px | minimum pane and popover width |
| `--st-size-row-graph` | 28px | commit-graph row (frozen — must equal `GRAPH_ROW_HEIGHT`) |
| `--st-size-row-tree` | 28px | tree/file row |
| `--st-size-row-tree-dense` | 24px | dense tree row, nav item, split detail header |
| `--st-size-control-sm` | 24px | small control (icon buttons, toggle segments) |
| `--st-size-control-md` | 28px | medium control (buttons, inputs) |
| `--st-size-control-lg` | 32px | large control |
| `--st-size-selection-bar-w` | 3px | inset selection bar width |

### Motion

| Token | Value | Use |
|-------|-------|-----|
| `--st-motion-fast` | 120ms | hover/press colour and border transitions |
| `--st-motion-base` | 180ms | popover open, pane mode swap |
| `--st-motion-slow` | 240ms | drawer width |
| `--st-ease` | `cubic-bezier(0.2, 0.7, 0.2, 1)` | the single easing curve |

One guard in `utilities.scss` neutralises the whole set under `prefers-reduced-motion: reduce`. There is no motion on selection change, scroll, or graph rows.

### Z-index scale

`--st-z-sticky` 10 · `--st-z-rail` 15 · `--st-z-backdrop` 30 · `--st-z-drawer` 35 · `--st-z-popover` 40 · `--st-z-menu` 45 · `--st-z-modal` 100 · `--st-z-toast` 120.

### Utilities

`libs/ui-kit/src/styles/utilities.scss` carries the shared classes that express the direction: `.st-focus-ring` (2px ring, offset 2px) and `.st-focus-ring--inset` (offset −1px, for rows); `.st-hairline` plus its `--top/--left/--right` variants; `.st-eyebrow`; `.st-mono` and `.st-tabular-nums`; `.st-hover-surface`; and the selection pair `.st-selectable-row` / `.st-selection-bar`.

## Components

All shipped primitives live under `libs/ui-kit/src/` and are exported from the barrel `libs/ui-kit/src/index.ts`.

### `st-button`
**Role:** the single action element

Variants `default | primary | ghost | danger | icon`; sizes `sm` (24px) `md` (30px). `default` is a bordered surface button; `primary` fills with `--st-color-accent` and uses `--st-color-accent-contrast` text; `ghost` is transparent; `danger` is transparent with `--st-color-danger` text; `icon` is square and sized by `--st-size-control-sm|md`. Focus uses a 2px `--st-color-focus` outline. `ariaLabel` is forwarded to the inner native button; `pressed` (`boolean | null`) is forwarded as `aria-pressed` for toggle chips and is omitted when null.

### `st-badge`
**Role:** pill label for branch, tag, status and graph state

Variants `neutral | branch | tag | success | warning | add | remove | warn | danger | graph-1 … graph-8`. Pill radius, 10px type. Status fills are a low-alpha mix of the hue; the foreground is the solid hue.

### `st-icon`
**Role:** decorative inline glyph

A dumb renderer over an inline-SVG registry (`icon/icons.ts`): 24×24 viewBox, `stroke-width: 1.8`, `stroke: currentColor`, rendered at 17px (`--st-font-17`) by default. Always `aria-hidden` — the accessible name belongs to the host control. An unknown `name` renders nothing and is never an error.

### `st-nav-item`
**Role:** navigation-rail entry

Icon + label + optional count pill (a neutral `st-badge`, hidden when the count is 0). Active state is the shared selection treatment: `--st-color-accent` text, a `--st-color-accent-soft` fill and the 3px inset selection bar, with `aria-current="page"`.

### `st-panel`
**Role:** pane container with a sticky section header

Two slots: an element marked `[header]` composes the header strip (eyebrow + title + optional badge); the default slot is the body. Surface background, 1px border, `--st-radius-3`. The header is sticky by default.

### `st-input` / `st-textarea` / `st-select`
**Role:** controlled form fields

The parent owns the state; each control re-emits its value on input/change. Surface-2 background, hairline border, `--st-radius-2`, and a border-to-accent focus state. `st-input` is `text | search | password`; `st-textarea` is the commit-message box; `st-select` projects native `<option>` children.

### `st-toggle-group`
**Role:** segmented control

`options[]` + `value` + `valueChange`, one segment active at a time. Surface-2 track, 24px segments, the active segment raised to the surface colour. Used for theme, language, density and variant bars.

### `[stSelectableRow]`
**Role:** the one reusable selectable-row pattern

An attribute directive, host-agnostic: it adds `.st-selectable-row`, the selected fill, the 3px `.st-selection-bar` and the inset focus ring to whatever element it sits on, owns `tabindex`, and emits `rowActivated` on click or Enter/Space. It deliberately styles no geometry, so the same pattern is shared by the nav rail, history rows, the file list and search hits.

### `st-popover`
**Role:** floating layer

Renders a backdrop and a raised panel only while `open`. Closes on Escape, backdrop click, or focus leaving the subtree, each emitting `closed`; anchoring and focus restoration are the consumer's job. Raised background, `--st-radius-4`, minimum width `--st-size-pane-min`.

### `st-live-region`
**Role:** assistive-technology announcer

A visually-hidden `role="status"` region with `politeness` `polite | assertive`. The root-scoped `LiveRegionService` owns the message and `announce()` is the single mutation point, so fetch progress and ambient notices all publish through one region.

### `st-workspace-split`
**Role:** two-pane workspace primitive

A pinned detail pane plus a flexible primary pane — never two equal columns. Elements marked `[detail]` project into the pinned pane (rendered only while `showDetail` is true); the default slot is the primary pane. Panel width defaults to `--st-size-detail-pane`.

### `st-empty-state`
**Role:** centered empty / placeholder block

Optional `icon`, `title` and `message`; tone `neutral | muted | error`. Renders each part only when its input is non-empty.

### `st-repo-card`
**Role:** repository row in the drawer and repos page

Icon + name (+ optional branch badge) + optional subtitle. Emits `picked` on click or keyboard; selected state uses the accent border and fill.

### `st-graph-row`
**Role:** one presentational commit row

A fixed 28px row (`GRAPH_ROW_HEIGHT`, matching `--st-size-row-graph`) holding an inline-SVG lane segment, the short oid, ref pills (`head / branch / remote / tag`), the message subject, the author, a `+N/−N/f` stats gauge and a `tabular-nums` date. Lane colour comes from `--st-color-graph-lane-N`; the SVG lane width is dynamic (`(maxLane + 1) × 14px`).

### `st-diff-viewer`
**Role:** read-only diff surface

Mounts a lazily-loaded Monaco `DiffEditor` when a real textual diff is available, and a plain tokenized grid fallback otherwise (a 4-column insert/delete/context grid, shown before the chunk loads, in tests, or if initialization fails). Distinct notices cover truncated, error, loading, binary, conflict and empty diffs. Monaco renders read-only `plaintext` models at `fontSize: 12` on a `lineHeight: 24` grid with the `--st-font-mono` family and is unified by default (`renderSideBySide: false`). Two token-derived custom themes — `singularitree-dark` and `singularitree-light`, mirroring the `--st-color-*` diff, surface and gutter values — are registered by the lazy loader (`defineTheme`) before it hands back the module, and `setTheme` follows the current `data-theme` so the editor never flashes the built-in theme. The layout persists through `DiffModeService` (`st:diffMode`, default `unified`); the file-status diff-pane header toggle (`st-toggle-group`, Unified / Side by side) flips it live.

## Do's and Don'ts

### Do
- Consume only the semantic layer in components; reach for `--st-color-*`, `--st-space-*`, `--st-font-*`, `--st-size-*`, `--st-radius-*`, `--st-motion-*` and `--st-z-*`.
- Define every semantic name in both `:root` and `[data-theme='light']` so neither theme can fall back into the other.
- Separate panels with 1px hairlines (`--st-color-border`) — structure comes from lines and type weight, not boxes.
- Reserve `--st-color-accent` for identity: brand, hashes, current branch, focus and the primary action.
- Use `.st-selectable-row` + `.st-selection-bar` for selection everywhere so "what is selected" reads the same in the rail, the history list, the file list, search hits and drawer cards.
- Keep the graph row at 28px and set numeric columns to `.st-tabular-nums`.
- Use mono only for hashes, paths, refs, diff code and gutters, counts and keycaps.
- Use the inset focus ring (offset −1px) inside rows and nav items; the standard 2px ring elsewhere.

### Don't
- Do not add `var(--st-x, #hex)` (or `rgba()`/any value) fallbacks — a fallback is a theming bug; every token must exist in both blocks. The P4.1 pass removed the last 87 of them from the renderer; keep it that way.
- Do not reference a `--st-prim-*` primitive from a component.
- Do not introduce colours outside the semantic set, or gradients and decorative glows.
- Do not use box-shadow for elevation — the one shadow is the inset selection bar.
- Do not use mono for nav labels, buttons, settings labels, commit subjects or table headers.
- Do not use fractional font weights — 400 / 500 / 600 / 700 only.
- Do not animate selection changes, scrolling, or graph rows.
- Do not mix radii: controls are 4px, cards and panels 5px, popovers and the drawer 8px.

## Surfaces

| Level | Name | Token | Dark | Light | Purpose |
|-------|------|-------|------|-------|---------|
| 0 | Canvas | `--st-color-bg` | `#1e1e2e` | `#f7f8f7` | the routed region and app background |
| 1 | Chrome | `--st-color-chrome` | `#232334` | `#eceeed` | top bar and status bar |
| 1 | Rail | `--st-color-rail` | `#20202f` | `#f0f2f1` | nav rail |
| 2 | Surface | `--st-color-surface` | `#252536` | `#ffffff` | panels, panes, cards, inputs |
| 2 | Surface 2 | `--st-color-surface-2` | `#2a2a3a` | `#f4f6f5` | sticky strips, table header, field background |
| 3 | Raised | `--st-color-raised` | `#2e2e40` | `#ffffff` | popovers and modals above the surface |
| — | Overlay | `--st-color-overlay` | `rgba(12,12,24,.62)` | `rgba(20,24,26,.35)` | modal and drawer backdrop |

## Layout

The shell is one flex column (`.st-shell`) with the body absorbing slack:

```
[1] top bar          64px    brand | repo tabs ......... remote ops | sync | menu | drawer toggle
[2] banners          auto    checkout-error · merge-conflict   (conditional)
[3] body             flex    nav rail 224 | workspace (pinned detail 380 + flexible primary) | drawer 264
[4] status bar       31px    repo · branch · short-hash | sync/online | live region
```

The nav rail is `--st-size-rail` wide (`224px`, collapses to `40px`), the repo drawer is `--st-size-drawer` (`264px`), and a workspace split pins its detail pane at `--st-size-detail-pane` (`380px`) beside a flexible primary pane. Scrollbars are 8px and use `--st-color-border` for the thumb.

## Agent Prompt Guide

**Quick Color Reference**
- canvas: `--st-color-bg`
- chrome (top/status bar): `--st-color-chrome`
- rail: `--st-color-rail`
- panel / card: `--st-color-surface`
- field / raised strip: `--st-color-surface-2`
- border / hairline: `--st-color-border`
- text: `--st-color-text` · muted: `--st-color-muted`
- accent (identity, primary action): `--st-color-accent`
- focus ring: `--st-color-focus`
- selection fill / bar: `--st-color-selected` / `--st-color-selected-bar`
- danger: `--st-color-danger` · warn: `--st-color-warn` · add: `--st-color-add`

**Example Component Prompts**

1. Create a nav-rail item: a `st-nav-item` with an icon, a 13px label, and an optional neutral count pill. Active state uses `--st-color-accent` text, a `--st-color-accent-soft` fill and the 3px inset `.st-selection-bar`; the row is `--st-size-row-tree-dense` tall with `--st-radius-2` corners.

2. Create a history row: `st-graph-row` at 28px (`--st-size-row-graph`), with an inline SVG lane coloured by `--st-color-graph-lane-N`, a mono short oid at 60% opacity, ref pills (`--st-color-ref-*`), a 12px subject, an auto-margin author at 75% opacity, a mono `+N/−N/f` gauge (`--st-color-add` / `--st-color-remove`) and a `tabular-nums` date at 50% opacity.

3. Create a panel: an `st-panel` on `--st-color-surface` with a 1px `--st-color-border` border and `--st-radius-3`. Its sticky header holds an `.st-eyebrow` group label (11px, 600, uppercase, `.08em`) and a 13px title; the body is `--st-space-3` padded.

4. Create a floating menu: a `st-popover` whose panel uses `--st-color-raised`, a hairline border and `--st-radius-4`; it opens with `--st-motion-base` on `--st-ease` and closes on Escape, backdrop click, or focus-out, returning focus to its trigger.

5. Create a primary action: a `st-button` with `variant="primary"` — `--st-color-accent` fill, `--st-color-accent-contrast` text, 30px tall, `--st-radius-2` corners, and a 2px `--st-color-focus` ring on focus.

## Quick Start

Every value below is consumed from the semantic layer; a component never hardcodes a colour or a size. Copy the shape and swap the surface.

### CSS Custom Properties — consumption

```css
/* A flat panel separated by a hairline, never a shadow. */
.my-panel {
  background: var(--st-color-surface);
  color: var(--st-color-text);
  border: var(--st-hairline) solid var(--st-color-border);
  border-radius: var(--st-radius-3);
  padding: var(--st-space-3);
}

/* A dense, selectable row with the shared selection treatment. */
.my-row {
  display: flex;
  align-items: center;
  height: var(--st-size-row-tree);
  padding: 0 var(--st-space-2);
  color: var(--st-color-text);
  cursor: pointer;
  transition: background-color var(--st-motion-fast) var(--st-ease);
}
.my-row:hover {
  background: color-mix(in srgb, var(--st-color-text) 6%, transparent);
}
.my-row.is-selected {
  background: var(--st-color-selected);
  box-shadow: inset var(--st-size-selection-bar-w) 0 0 var(--st-color-selected-bar);
}
.my-row:focus-visible {
  outline: 2px solid var(--st-color-focus);
  outline-offset: -1px;
}

/* A mono, right-aligned, non-jittering metadata column. */
.my-meta {
  font-family: var(--st-font-mono);
  font-size: var(--st-font-11);
  font-variant-numeric: tabular-nums;
  color: var(--st-color-muted);
}

/* The one primary action. */
.my-primary {
  height: var(--st-size-control-md);
  padding: 0 var(--st-space-3);
  border-radius: var(--st-radius-2);
  background: var(--st-color-accent);
  color: var(--st-color-accent-contrast);
}
```

### The two-tier token layer

The full source is `libs/ui-kit/src/styles/tokens.scss`. Its shape is fixed — primitives first, then every semantic name defined twice:

```css
:root {
  /* Tier 1 — raw primitives, theme-independent. */
  --st-prim-cyan-400: #69dfdc;

  /* Tier 2 — semantic, dark defaults. */
  --st-color-bg: #1e1e2e;
  --st-color-surface: #252536;
  --st-color-accent: var(--st-prim-cyan-400);
}

[data-theme='light'] {
  /* Every semantic name is repeated — never a partial set. */
  --st-color-bg: #f7f8f7;
  --st-color-surface: #ffffff;
  --st-color-accent: #0f7f7c;
}
```

## References

- Visual direction and shell IA: [[renderer-redesign-plan]] (§2 visual direction, §3 shell layout)
- Renderer slice ownership: [[renderer-slice]]
- Token source: `libs/ui-kit/src/styles/tokens.scss`
- Shared utility classes: `libs/ui-kit/src/styles/utilities.scss`
- Component barrel: `libs/ui-kit/src/index.ts`
