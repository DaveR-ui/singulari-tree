---
id: adr-index
category: adrs
tags: [adr, hub, index]
aliases: [ADR Index, Índice de ADRs]
related: [adr-0014-docs-corpus-layout, adr-0015-docs-validator-generated-index, adr-0016-lane-state-and-graph-dod]
version: 1.1
status: active
---

# ADRs — Índice

## What belongs here

Decisiones **estructurales o de esquema** de este corpus: layout, contrato de nota, validador, índices generados. Append-only: un ADR aceptado no se edita; si cambia la decisión, se escribe un sucesor con `supersedes`.

## Contents

- [[adr-0014-docs-corpus-layout]] — adoptar el corpus de documentación documentation-onrails (`docs/` como raíz, `docs/project.md` como entry point).
- [[adr-0015-docs-validator-generated-index]] — validador propio zero-dependency + índices generados con marker regions.
- [[adr-0016-lane-state-and-graph-dod]] — estado de lanes por repo en `GraphService` + DoD del grafo acotado a columnas verticales (paridad de aristas diferida).

## Elsewhere

ADR-001..ADR-013 viven embebidos en `docs/context/git-client/decisions.md` (legacy — ver `accepted-debt.md`). La numeración continúa en **ADR-014**.
