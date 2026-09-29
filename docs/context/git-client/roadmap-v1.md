# Roadmap V1 — 16-20 semanas post-MVP

> V1 = MVP + SourceTree paridad sustancial: merge/rebase/cherry-pick avanzados, conflicto UI, worktrees full, submodules, LFS awareness, SSH auth, signed commits, bisect/blame hooks, búsqueda/filtrado grafo, bisect, reflog, stash apply/pop, patch apply, remotos CRUD, settings, keybindings, packaging firmado, auto-update, perf large-repo 100k.

## Fase V1.1 — Git avanzado (sem 1-6 post-MVP)

| Feature | Go | Angular | Notas |
|---------|----|---------|-------|
| **Branch create/rename/delete** | `GitPort.CreateBranch`, `DeleteBranch` | `BranchStore` CRUD modal | `BRANCH_EXISTS` handling |
| **Merge** | `Merge(ref, strategy, no-ff)` | merge dialog + conflict state | expone `has_conflict_markers` en Diff |
| **Rebase interactive** | `Rebase(base, onto, interactive)` | rebase todo editor (lista commits reordenables) | streaming logs |
| **Cherry-pick** | `CherryPick(oid)` | cherry-pick desde history context menu | |
| **Revert** | `Revert(oid)` | revert commit | |
| **Tag create/delete/push** | `CreateTag(name, annotated, message)` | tag dialog | push tags |
| **Worktrees full CRUD** | `AddWorktree`, `RemoveWorktree` | worktree manager page | |
| **Stash apply/pop/drop** | `StashApply`, `Pop`, `Drop` | stash context menu | |
| **Conflictos UI** | `Diff.has_conflict_markers` | Monaco conflict editor (3-way) | blocker |

**DoD V1.1:** merge/rebase/cherry-pick con conflictos visibles y resolubles sin terminal.

## Fase V1.2 — Grafo pro + búsqueda (sem 7-10)

- **Search/filter grafo:** por message, author, oid short, branch/topo; highlighting en lanes.
- **Zoom/minimap:** lanes escalables, minimap canvas.
- **Keyboard nav:** `j/k`, `g→top`, `/ search`, `c commit`, `s stage`.
- **Blame/History file:** `git blame` y `git log -- <path>` por file.
- **Reflog view:** `git reflog` streaming.
- **Lane performance:** incremental lanes para 100k, workers para cálculo lanes si >50k.

**DoD:** grafo 100k commits searchable, keyboard-only usable.

## Workstream opcional — Superficie MCP (MCP-A/B/C)

> **Opcional** y desacoplado del spine; no bloquea ninguna fase. Registrado en **ADR-013**. Se sitúa entre el MVP y las integraciones de hosting (V1.3). MCP es un inbound adapter sobre el mismo core Go (`adapter/mcp` + `cmd/mcp-server`), consumido por clientes AI de forma headless (sin Electron/Angular).

| Fase | Alcance | Entregable |
|------|---------|------------|
| **MCP-A** | Read-only | `adapter/mcp` + `cmd/mcp-server` (stdio); tools read (`git_ping`, `git_get_commits`, `git_get_status`, `git_get_diff`, `git_events`…); JSON Schema generado desde proto |
| **MCP-B** | Writes + progreso/cancel | Mutation set tras `--allow-write` (`git_stage`/`git_commit`/`git_fetch`…); `Progress`→`notifications/progress`; `notifications/cancelled`→context-cancel (cierra R12) |
| **MCP-C** | Streamable HTTP + resources/prompts | MCP HTTP en loopback (Bearer por sesión + Origin check); resources/prompts; DI compartida vía `internal/bootstrap` |

**DoD:** `cmd/mcp-server` corre headless contra el core Go sin Electron/Angular; schemas MCP generados desde `gitcore.proto`; sin segundo writer a `cache.db` (R13).

## Fase V1.3 — Remotos & Auth (sem 11-14)

- **Remote CRUD:** add/rename/remove remote, fetch_specs edit.
- **SSH:** `ssh-agent` + key file + passphrase UI, `GIT_SSH_COMMAND` wiring.
- **HTTPS:** credential helper (libsecret/Keychain/wincred) + token prompt.
- **LFS awareness:** `git lfs` status (no implementa LFS, solo detecta).
- **Submodules:** list + update + diff.
- **Signed commits:** GPG/SSH signing passthrough.

**DoD:** `fetch/pull/push` con SSH/HTTPS privados funciona cross-platform.

## Fase V1.4 — Packaging & Polish (sem 15-18)

- **Signing:** macOS notarization, Windows sign, Linux flatpak/appimage.
- **Auto-update:** `electron-updater` (GitHub Releases).
- **Settings:** git config editor (user.name/email, core.autocrlf, etc.), theme, keymap, diff tool external.
- **Onboarding:** welcome wizard (open/create/clone repo).
- **Telemetry opcional:** opt-in usage metrics (no Git data).
- **i18n:** es/en locales.
- **Accesibilidad:** ARIA en graph-row, Monaco keyboard nav.

**DoD:** instaladores firmados + auto-update en 3 OS.

## Fase V1.5 — Hardening (sem 19-20)

- Large repo perf audit (git.git, chromium, linux kernel shallow).
- Watcher stress (burst 1000 files, `git checkout main`).
- SQLite WAL concurrency (múltiples ventanas Electron = un Go core).
- Security audit preload/CSP/token.
- Docs final + migration guide.

## Línea de tiempo visual

```mermaid
gantt
  title SingulariTree V1 (post-MVP)
  dateFormat YYYY-MM-DD
  section V1.1 Git avanzado
    Branch/Merge/Rebase/Cherry-pick :a1, 2026-11-01, 6w
  section V1.2 Grafo pro
    Search/Zoom/Blame :a2, after a1, 4w
  section MCP (opcional)
    Adapter MCP stdio/HTTP :aM, after a2, 3w
  section V1.3 Remotos+Auth
    SSH/HTTPS/LFS/Submodules :a3, after a2, 4w
  section V1.4 Packaging
    Signing/Auto-update :a4, after a3, 4w
  section V1.5 Hardening
    Perf+Security :a5, after a4, 2w
```

## Dependencias V1

- V1.1 bloquea V1.2 (merge logic primero).
- V1.3 puede solaparse con V1.2 (distintos ports: GitPort vs GraphService).
- Workstream MCP (opcional) puede solaparse con V1.1-V1.3; no bloquea fases (ADR-013).
- Packing (V1.4) requiere V1.1-1.3 estables.

## Criterios de salida V1

- [ ] Merge/rebase/cherry-pick/revert/tag/worktree/stash full sin terminal.
- [ ] Grafo 100k + search/filter + minimap + keyboard.
- [ ] SSH/HTTPS auth, remotos CRUD, submodules list, LFS awareness.
- [ ] Instaladores firmados 3 OS + auto-update.
- [ ] Coverage ≥80%, e2e en 3 OS, perf benchmark <16ms/frame grafo 100k.
- [ ] `buf breaking` nunca rompió contratos sin major.
