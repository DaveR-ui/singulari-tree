---
id: adr-0014-docs-corpus-layout
category: adrs
tags: [adr, documentation, layout, onrails]
aliases: [ADR-0014]
related: [adr-index]
version: 1.0
status: active
---

# ADR-0014: Adoptar el corpus de documentación documentation-onrails

## Problem

SingulariTree hereda documentación legacy (`docs/context/git-client/**`) escrita con formato heterogéneo: índices a mano, links relativos sin validar y un `README.md` raíz que actúa como índice de facto. No hay un layout declarado, no hay entry point agent-facing único y no hay convención de idioma. Sin una decisión estructural, cada nuevo doc inventa su propia forma y los agentes no tienen una ruta de lectura estable.

## Solution

Adoptar el corpus **documentation-onrails** (contrato v1.4) como layout canónico. Decisión, itemizada:

1. **Raíz del corpus** = `docs/`. Todo lo canónico vive bajo `docs/`; fuera queda solo el README humano.
2. **Entry point agent-facing** = `docs/project.md`, con las **9 secciones fijas** y `doc_language: es` declarado **una sola vez**.
3. **Ubicación de ADRs** = `docs/adrs/`. La numeración continúa desde el ADR-013 legacy: el primer ADR nuevo es **ADR-014**.
4. **Índices generados** = `docs/index.md` y `docs/tag-index.md`, marcados como generados y regenerables.
5. **`README.md` raíz** queda como README **humano**, fuera del corpus, y solo apunta a `docs/project.md`.
6. **Ratchet de brownfield:** el contrato aplica a archivos nuevos o tocados; el legacy `docs/context/git-client/**` **no se reescribe** — es deuda aceptada explícita en `accepted-debt.md`.
7. **Idioma:** español, con términos técnicos en inglés.

## When to use

- Al decidir dónde vive un documento nuevo o cómo se enruta una slice.
- Al evaluar si una carpeta documental debe entrar al corpus (o quedarse como legacy).

## When not to use

- No editar este ADR para cambiar la decisión: un ADR aceptado es append-only; se escribe un sucesor con `supersedes`.
- No interpretarlo como mandato de migrar el legacy: el ratchet lo excluye a propósito.

## Examples

Ruta de lectura agent-facing:

```text
README.md (humano) -> docs/project.md (entry point) -> hubs -> docs/tag-index.md
```

Carpetas del corpus adoptadas: `context/`, `protocols/`, `adrs/`, `slices/`.

## Common mistakes

- **Big-bang retro-fit** del legacy: reescribir `docs/context/git-client/**` de una sola vez rompe links y ahoga el PR real.
- **Dos entry points** (`README.md` + `docs/project.md`) compitiendo: el agente no sabe cuál leer primero.
- Continuar la numeración de ADRs en un archivo legacy en lugar de `docs/adrs/`.
- Declarar `doc_language` en varios archivos.

## References

- [documentation-system.md](../context/documentation-system.md)
- [docs/project.md](../project.md)
- [accepted-debt.md](../context/accepted-debt.md)
