---
id: docs-slice
category: slices
tags:
- slice
- generality
aliases:
- Docs slice
related:
- slices-index
version: 1.0
status: active
---

# Docs — Slice Generalities

## What this slice is

Corpus de documentación del proyecto: entry point, contexto estratégico, slices, protocolos, ADRs e índices generados. Es la fuente canónica que enruta cada cambio a su doc.

## Boundaries

- **IN:** `docs/**`.
- **OUT:** `.opencode/protocols/` (protocolos del agent-system) y el código de la aplicación.

## Entry points

- `docs/project.md` — entry point y tabla de Slices.
- `docs/index.md` — índice raíz.
- `docs/context/` — contexto estratégico.
- `docs/slices/` — generalidades por slice.
- `docs/protocols/` — protocolos del proyecto.
- `docs/adrs/` — decisiones de arquitectura.

## How it works

- Contrato onrails: frontmatter + secciones fijas por tipo de nota.
- Hubs por carpeta que indexan sus notas.
- Índices generados con markers regenerables: `node tools/docs/validate.js --write`.
- Validador del corpus: `tools/docs/validate.js`.

## Conventions of this slice

- `doc_language: es`.
- Nombres de archivo y carpeta en lowercase-kebab-case.
- `related` referencia ids; los `[[wikilinks]]` referencian stems de archivo (sin `.md`).
- Los ADRs son append-only.
- Ratchet: el contrato aplica solo a archivos nuevos o tocados.

## Dependencies

- **Upstream:** agentes documenter y orchestrator.
- **Downstream:** todos los slices (routing).

## Known gaps & accepted debt

- Legacy `docs/context/git-client/**` sin frontmatter (ver `docs/context/accepted-debt.md`).
- ADR-001..013 embebidos en el legacy.
