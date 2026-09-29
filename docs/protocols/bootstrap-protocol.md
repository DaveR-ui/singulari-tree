---
id: bootstrap-protocol
category: protocols
tags: [protocol, bootstrap]
aliases: [Bootstrap Protocol, Protocolo de bootstrap]
related: [new-note-protocol]
version: 1.0
status: active
---

# Protocolo de bootstrap del corpus de documentación

## Problem

Un repo brownfield arranca sin corpus onrails: no hay entry point agent-facing, no hay índices generados y no hay disciplina de revisión. El resultado es documentación huérfana, links muertos, tags duplicados y agentes que leen fuentes distintas en cada sesión. Falta un checklist mínimo, repetible, para bootstrapear el corpus o auditar uno existente y dejarlo agent-ready.

## Solution

Checklist ejecutable. Copiar tal cual en el PR de bootstrap o de auditoría y marcar cada ítem. Un ítem sin marcar es trabajo pendiente, no una nota al pie.

### Esqueleto

- [ ] Entry point `docs/project.md` creado: metadata, stack, comandos, entidades y **Slices table**.
- [ ] `doc_language: es` declarado **una sola vez**, en `docs/project.md`.
- [ ] Crear 2–4 folders bajo `docs/` — y solo cuando la **primera nota real** los necesite. Nada de carpetas vacías especulativas.
- [ ] Cada folder tiene su hub `<folder>-index.md` (body corto: propósito + contents + elsewhere; no las 7 secciones de nota).

### Runbook

- [ ] Seguir las guidelines 00–09 de onrails para proyectos brownfield: **slices primero**, después el contrato de nota.
- [ ] Priorizar por slice: cada cambio enruta a un doc primario vía la Slices table.
- [ ] No reescribir contenido legacy para "cumplir" el contrato; el ratchet aplica a archivos nuevos o tocados.

### Garantías del store

- [ ] `docs/index.md` y `docs/tag-index.md` creados con sus markers (`index`, `tags`).
- [ ] Regenerados con `node tools/docs/validate.js --write` (write-if-diff).
- [ ] Los artefactos generados se marcan como generados y **nunca** se parchean a mano.
- [ ] Cada región generada lleva su línea de snapshot (fecha).

### Disciplina de revisión desde el día 1

- [ ] Adoptar el catálogo de `docs-review-protocol.md` como disciplina de merge.
- [ ] Calibrar contra la deuda aceptada explícita — ver `accepted-debt.md`; el legacy excluido no bloquea el merge.
- [ ] `node tools/docs/validate.js` sale con código `1` si hay errores → el hook de CI bloquea el merge.

### Agent-readiness

- [ ] Query path read-only: el agente lee entry point → hubs → tag index, sin escribir.
- [ ] Staleness visible: cada región generada expone la fecha de snapshot.

## When to use

- Al iniciar un proyecto brownfield o greenfield y definir el corpus desde cero.
- Al auditar un corpus existente antes de una migración o de promocionar un topic folder a slice.

## When not to use

- No para dar de alta una nota individual: usar `new-note-protocol.md`.
- No para re-bootstrapear un corpus ya verde: el checklist devolvería falsos pendientes.

## Examples

Bootstrap mínimo de 4 folders (agregar cada uno al crear su primera nota):

```text
docs/
├── project.md              # entry point (doc_language: es)
├── index.md                # generado (marker: index)
├── tag-index.md            # generado (marker: tags)
├── context/<folder>-index.md
├── protocols/<folder>-index.md
├── adrs/<folder>-index.md
└── slices/<folder>-index.md
```

Auditoría en un comando (read-only):

```bash
node tools/docs/validate.js        # exit 1 si hay errores
```

## Common mistakes

- Crear folders vacíos "por si acaso": rompen el principio de que cada folder nace con su primera nota.
- Declarar `doc_language` en varios archivos: la declaración única evita idiomas divergentes.
- Parchear a mano `docs/index.md` o `docs/tag-index.md`: el siguiente `--write` revierte el parche.
- Arrancar la disciplina de revisión "más adelante": la deuda de links se acumula más rápido de lo que se paga.

## References

- [docs/project.md](../project.md)
- [documentation-system.md](../context/documentation-system.md)
- [docs-review-protocol.md](./docs-review-protocol.md)
