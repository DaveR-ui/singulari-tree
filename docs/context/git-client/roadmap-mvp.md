---
last_updated: 2026-09-29
status: active
description: Roadmap MVP de SingulariTree — objetivo de 8-10 semanas, entregables y DoD por semana; Semana 1-2 acotada a lane columns verticales (paridad de aristas diferida).
tags:
- roadmap
- mvp
- git-client
- legacy
version: 1.1
related:
- accepted-debt
---

# Roadmap MVP — 8-10 semanas

> Objetivo MVP: abrir repo local existente, ver grafo/history paginado, status/stage/commit, diff Monaco, branches/tags/stashes básicos, fetch/pull/push, watcher realtime, tests automatizados. Multi-repo management parcial. Sin SSH complejo ni conflictos rebase avanzados.

## Semana 0 — Fundaciones (sem 1) — ✅ COMPLETADA

**Entregables (verificados):**
- [x] `buf generate` funcional — contratos generados y commiteados (`gen/go` + `gen/ts` reales).
- [x] gRPC server real con `RegisterGitCoreServer` + interceptor de token (incluye `OpenRepository` aditivo).
- [x] SQLite WAL + migraciones aplicadas al arranque vía `embed`.
- [x] `GitPort` read path real vía `exec git`.
- [x] `GetCommits` end-to-end real (Go ↔ gRPC ↔ Electron).
- [x] `supervisor.ts` cliente gRPC real + heartbeat `Ping` (stub `forwardToGo` reemplazado).
- [x] `apps/angular` bridge tipado (`@contracts` → `libs/contracts/gen/ts`).

**DoD:** ✅ `go run --headless` + `supervisor.start()` + `buf generate` en CI verde.

**Desviaciones deliberadas (respecto al plan original):**
- **Sin Viper:** configuración con flags explícitos + `config.Load()`.
- **Migraciones embebidas** vía un generator guardado por `tools/ci/verify-migrations.sh`; la **SSOT sigue en `data/sqlite/migrations/`**.
- **ts-proto types-only** (sin runtime de servicio generado en TS).

## Semana 1-2 — Repo + Graph

**Go:**
- `RepoService.Open/List/Remove` real (validación `git rev-parse --git-common-dir`, SQLite `repos`).
- `GitPort` impl `adapter/git` usando `exec git log --pretty=format:... --topo-order --skip/--max-count` o `go-git` para `List`.
- `GraphService.Lanes` impl lane algorithm (ver `service-design.md §1.3`), benchmark <100ms/50k.
- `CacheService` SQLite `commit_cache` windowed.

**Angular:**
- `RepoStore` + `GraphStore` con `loadWindow(200)+prefetch(100)`.
- `libs/ui-kit/graph-row` (SVG lanes + commit row).
- Virtual scroll (CDK `ScrollingModule`) + infinite scroll.
- Página `features/repo/graph`.

**DoD:** abrir repo 5k commits, scroll fluido, y **columnas de lane verticales correctas** (continuidad entre ventanas garantizada por el estado per-repo en Go). La paridad visual de diagonales/cruces vs `git log --graph` queda **diferida como deuda aceptada** (ver accepted-debt) y el contrato `Lane` no cambia.

## Semana 3 — Status / Stage / Commit

**Go:** `GetStatus` (porcelain v2), `Stage/Unstage`, `Commit` (con `Signature`), `GetDiff` básico.

**Angular:** `StatusStore`, file list con staged/unstaged/conflicted, stage/unstage checkboxes, commit box, diff side-by-side básico (Monaco `diffEditor`).

**DoD:** flujo completo stage → commit → grafo se actualiza via watcher o manual refresh.

## Semana 4 — Diff Monaco + Large files

**Go:** `Diff` hunks completas, `is_binary`, `has_conflict_markers`.

**Angular:** `libs/ui-kit/diff-viewer` Monaco wrapper (`monaco-editor` + workers), toggle unified/side-by-side, handler >1MB (plain text fallback + warning), syntax highlighting por extensión.

**DoD:** diffs grandes no congelan UI; binarios muestran placeholder.

## Semana 5 — Branches / Tags / Stashes + Watchers

**Go:** `GetBranches`, `GetTags`, `GetStashes`, `GetWorktrees`, `Checkout`, watcher `fsnotify` coalescing 200ms + `index.lock` guard.

**Angular:** `BranchStore` (local/remota, current, upstream), checkout flow, tags list, stashes list, `onFsChanged` → `StatusStore.refresh` + `GraphStore.reload`.

**DoD:** checkout cambia HEAD, watcher refleja cambios externos (`echo > file` dispara refresh).

## Semana 6 — Remotos (Fetch/Pull/Push streaming)

**Go:** `Fetch/Push/Pull` con `stream Progress` (exec `git fetch --progress` parseado o `go-git` progress writer).

**Angular:** toolbar remote actions + progress bar `onProgress`, error handling (`FETCH_FAILED`/`PUSH_FAILED`).

**DoD:** fetch contra remote fixture local funciona, progress visible, error toast.

## Semana 7 — Multi-repo + SQLite prefs + Polish

**Go:** `ListRepositories` persistido, `recent` ordering por `last_opened_at`, validación múltiples repos.

**Angular:** repo list page, open/add/remove repo, persistence UI-state (panel sizes), tema, atajos teclado (graph nav flechas, space para diff).

**Tests:** vitest coverage 80% + go `go test -race` + buf lint en CI; playwright e2e smoke (open repo → graph → stage → commit → diff).

**DoD:** multi-repo usable, preferencias persisten entre reinicios.

## Semana 8 — Stabilization / Release MVP

- Bug bash repos grandes (10k+ commits, binarios, submodules).
- Perf: LRU tune, Monaco worker tune, watcher debounce tune.
- Packaging `electron-builder` Linux/Win/macOS (sin sign aún).
- Docs: `README.md` quick start actualizado, screenshots.

**Exit criteria MVP:**
- [ ] ≥1 repo abierto, grafo virtualizado, status/stage/commit, diff Monaco, branches/tags/stashes, remotos fetch/pull/push, watcher, SQLite WAL, headless proof, `buf generate` verde.
- [ ] Coverage unit ≥80%, e2e smoke pasa en 2 OS.
- [ ] Manual QA large repo (git.git 60k commits) scroll <16ms frame.

## Épicas y estimación (T-shirt)

| Épica | Sem | Talla |
|-------|-----|-------|
| Fundaciones buf + headless real | 0 | M |
| Graph + Lanes + virtualization | 1-2 | L |
| Status/Stage/Commit | 3 | M |
| Diff Monaco large files | 4 | M |
| Branches/tags/stashes + watcher | 5 | M |
| Remotos streaming | 6 | M |
| Multi-repo + polish | 7 | S |
| Stabilization | 8 | S |

Total MVP: **~8 semanas** 1 dev full-time; 6 semanas con 2 devs (Go + Angular en paralelo).
