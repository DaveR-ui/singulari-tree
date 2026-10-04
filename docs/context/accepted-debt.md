---
last_updated: 2026-10-04
status: active
description: Deuda aceptada del corpus — documentos legacy sin migrar y decisiones toleradas explícitamente, con el criterio para reducirla.
tags:
- documentation
- debt
- legacy
- ratchet
version: 1.2
related:
- documentation-system
---

# Deuda aceptada

## Problem

No todo el corpus cumple el contrato onrails. Migrar el diseño legacy y extraer ADRs embebidos en bloque (big-bang) generaría ruido enorme, rompería referencias y detendría el trabajo real. A la vez, tolerar incumplimientos en silencio convierte al corpus en algo no confiable: nadie sabe qué excepciones son intencionales y cuáles son olvidos.

## Solution

Registrar aquí **cada excepción de forma explícita**, con su razón y el criterio para reducirla. Las excepciones se congelan ("ratchet"): el contrato del corpus solo aplica a archivos nuevos o tocados; un documento legacy se migra **cuando se lo toca**, no antes.

| Elemento aceptado | Por qué se tolera | Cómo se reduce |
|---|---|---|
| `docs/context/git-client/**` — 12 docs de contenido (`architecture.md`, `decisions.md`, `module-diagram.md`, `service-design.md`, `domain-model.md`, `folder-structure.md`, `roadmap-mvp.md`, `roadmap-v1.md`, `risks.md`, `ipc-strategy.md`, `testing-strategy.md`, `github-oauth-guide.md`) + hub no-kebab `INDEX.md` + alias `README.md` | Sin frontmatter y con hub no-`kebab-case`; **EXCLUIDOS del validador** (`docs/context/git-client/**` congelado). `roadmap-mvp.md` ya fue **migrado por ratchet al tocarlo** (frontmatter `context-doc`), pero el resto del árbol sigue congelado y fuera del scan. | Ratchet: migrar cada archivo solo al tocarlo (frontmatter + renombrar hub cuando aplique); `roadmap-mvp.md` ya migrado. |
| Paridad visual de aristas de lane (diagonales/cruces) vs `git log --graph` — DoD Semana 1-2 acotado (ADR-0016) | El contrato de wire `Lane{index,color,continues}` no porta geometría de aristas; solo se contratan **columnas verticales** (correctas y continuas entre ventanas). Sin cambio de contrato — decisión deliberada (Opción B). | Futura adición de contrato `LaneRow`/segmentos + diagonales SVG en el renderer, **detrás de un ADR** que superseda a [[adr-0016-lane-state-and-graph-dod]]. |
| ADR-001..ADR-013 embebidos en `docs/context/git-client/decisions.md` | No se extraen a `docs/adrs/` para evitar un big-bang de 13 archivos. | La numeración continúa en **ADR-014**; los nuevos ADRs nacen ya en `docs/adrs/` con su hub. |
| `README.md` (raíz) | README humano, **sin frontmatter**, FUERA del corpus. | Se mantiene como puntero al entry point ([`docs/project.md`](../project.md)); no se migra. |
| `docs/context/git-client/README.md` | Alias del hub legacy `INDEX.md`. | Desaparece cuando el hub legacy se migre/normalice al tocarlo. |
| Diff viewer Monaco ausente (Semana 4 del `roadmap-mvp.md`) — `libs/ui-kit/src/diff-viewer/` es un stub (`index.ts` solo exporta `DIFF_VIEWER_PLACEHOLDER`) y `monaco-editor` no está en ninguna dependencia. | La UI `stage → commit → diff` no existe aún; por eso el e2e `stage → commit → diff` es un `test.skip` documentado (`apps/electron/e2e/smoke.e2e.ts`). El tuning de "Monaco worker" de la Semana 8 **no aplica** porque no hay Monaco que tunear. Implementarlo es alcance Semana 3-4, no Semana 8. | Cerrar el track Semana 3-4 (StatusStore + commit box + `diffEditor`) **detrás de su propio ciclo**; entonces quitar el `test.skip` del e2e y añadir la captura de pantalla de diff. |
| Watcher `fsnotify` sigue siendo stub en el adapter — `apps/go-core/internal/adapter/watcher/watcher.go` no adjunta fsnotify; solo el *coalescing* real (150ms) vive en `WatcherService`. | El adapter real de fsnotify no era alcance de la Semana 8 (estabilización); esta semana se implementó el debounce/coalescing que faltaba (`WatcherService`, tests en `watcher_service_test.go`), no el watch de filesystem. | Implementar `fsnotify` real en `adapter/watcher` (watch de `.git/index`, `HEAD`, refs, worktree) y quitar la etiqueta "stub" de los comentarios. |
| Paquete UNSIGNED (sin firma/notarización/auto-update) | Alcance explícito del MVP: la firma y `electron-updater` son V1 (`roadmap-v1.md` §V1.4). | Fase V1.4: notarización macOS, firma Windows, flatpak/AppImage firmado, auto-update. |
| e2e de 2 OS vía GitHub Actions (`ubuntu-latest` + `windows-latest`) — sin validación en estación Windows local. | El criterio `roadmap-mvp.md` L104 exige "e2e smoke pasa en 2 OS" y no hay estación de 2 OS declarada; el workflow es el mecanismo mínimo verificable. Las ramas específicas de Windows (`go-core.exe`, sin symlinks) están razonadas pero **no ejecutadas** en este host Linux. | Correr el workflow en CI real; si Windows falla, ajustar el shim/build script y re-verificar. |

**Lo que NO es deuda** (cumple contrato y debe validarse):

- `docs/project.md` — entry point agent-facing.
- `docs/slices/` — slices y su hub `slices-index.md`.
- `docs/protocols/` — protocolos del corpus.
- `docs/adrs/` — decision records nuevos (ADR-014 en adelante).
- Artefactos generados `docs/index.md` y `docs/tag-index.md`.

## When to use

- Antes de "arreglar" un archivo legacy: confirma si su excepción ya está aquí.
- Al agregar una nueva excepción temporal: añade una fila con su razón y su criterio de salida.

## When not to use

- Para justificar incumplimientos nuevos: una nota nueva o tocada **debe** cumplir el contrato (ver [[documentation-system]]).
- Para archivos ya listados en "Lo que NO es deuda".

## Examples

- Un PR que corrige un typo en `docs/context/git-client/risks.md` solo añade frontmatter si además normaliza el archivo; si no, no entra en el validador.
- Un PR que crea un ADR nuevo usa `docs/adrs/adr-0014-<slug>.md` y lo registra en el hub `adr-index.md`.

## Common mistakes

- Migrar `docs/context/git-client/**` en bloque "para dejarlo limpio" — el ratchet lo prohíbe.
- Extraer ADR-001..ADR-013 a `docs/adrs/` — se evita a propósito (big-bang).
- Agregar frontmatter al `README.md` raíz o al alias `git-client/README.md`.
- Olvidar retirar una fila cuando la deuda ya se saldó.

## References

- Cómo funciona el corpus y el ratchet: [[documentation-system]]
- Entry point del proyecto: [docs/project.md](../project.md)
