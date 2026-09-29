---
last_updated: 2026-09-28
status: active
description: Deuda aceptada del corpus — documentos legacy sin migrar y decisiones toleradas explícitamente, con el criterio para reducirla.
tags:
- documentation
- debt
- legacy
- ratchet
version: 1.0
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
| `docs/context/git-client/**` — 12 docs de contenido (`architecture.md`, `decisions.md`, `module-diagram.md`, `service-design.md`, `domain-model.md`, `folder-structure.md`, `roadmap-mvp.md`, `roadmap-v1.md`, `risks.md`, `ipc-strategy.md`, `testing-strategy.md`, `github-oauth-guide.md`) + hub no-kebab `INDEX.md` + alias `README.md` | Sin frontmatter y con hub no-`kebab-case`; **EXCLUIDOS del validador** (`docs/context/git-client/**` congelado). | Ratchet: migrar cada archivo solo al tocarlo (frontmatter + renombrar hub cuando aplique). |
| ADR-001..ADR-013 embebidos en `docs/context/git-client/decisions.md` | No se extraen a `docs/adrs/` para evitar un big-bang de 13 archivos. | La numeración continúa en **ADR-014**; los nuevos ADRs nacen ya en `docs/adrs/` con su hub. |
| `README.md` (raíz) | README humano, **sin frontmatter**, FUERA del corpus. | Se mantiene como puntero al entry point ([`docs/project.md`](../project.md)); no se migra. |
| `docs/context/git-client/README.md` | Alias del hub legacy `INDEX.md`. | Desaparece cuando el hub legacy se migre/normalice al tocarlo. |

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
