---
id: docs-review-protocol
category: protocols
tags: [protocol, review, validation]
aliases: [Docs Review Protocol, Protocolo de revisión de docs]
related: [new-note-protocol, bootstrap-protocol]
version: 1.0
status: active
---

# Protocolo de revisión de docs

## Problem

Sin una disciplina de merge explícita, el corpus se degrada silenciosamente: aparecen `id`s duplicados, links muertos, notas huérfanas e índices que ya no reflejan el contenido. Cada revisor aplica criterios distintos y la deuda se descubre tarde, cuando ya nadie sabe qué versión es la correcta. Hace falta un catálogo cerrado de reglas y un pase automático que lo haga cumplir.

## Solution

El catálogo de revisión es una **disciplina de merge**: se corre antes de cada merge que toque `docs/`. Tiene 9 errores (bloquean) y 3 warnings (revisión humana).

### Errores (bloquean el merge)

| # | Error | Qué detecta |
|---|-------|-------------|
| 1 | `metadata-outside-contract` | keys faltantes o extra en el frontmatter |
| 2 | `non-kebab-case-name` | filename fuera de lowercase-kebab-case |
| 3 | `duplicate-ids` | dos notas con el mismo `id` |
| 4 | `dangling-related-target` | `related` que apunta a un `id` inexistente |
| 5 | `dangling-link` | link markdown relativo a un target inexistente |
| 6 | `orphan-note` | nota sin ninguna arista resuelta |
| 7 | `missing-from-hub` | nota ausente del hub de su carpeta |
| 8 | `stale-generated-index` | región generada desactualizada respecto al store |
| 9 | `secret-in-prose` | secreto o credencial en el cuerpo |

### Warnings (revisión humana)

| # | Warning | Qué detecta |
|---|---------|-------------|
| 1 | `no-h1` | nota sin H1 |
| 2 | `category-mismatch-folder` | `category` no coincide con la carpeta |
| 3 | `near-duplicate-body` | cuerpo casi idéntico a otra nota |

### Machine walk

```bash
node tools/docs/validate.js          # read-only; exit 1 si hay errores
node tools/docs/validate.js --write  # regenera las regiones marker
```

`validate.js` no escribe salvo con `--write`, y `--write` solo regenera las regiones marcadas (`index`, `tags`), write-if-diff.

### Calibración brownfield

- Los errores bloquean **solo el subconjunto migrado** del corpus.
- La deuda legacy (`docs/context/git-client/**`) queda **explícitamente excluida** del validador — ver [[bootstrap-protocol]] y `accepted-debt.md`.
- El bucle gap-close: **buscar** → si falta, **escribir según contrato** → **registrar en el hub Y en el tag index en el mismo commit**.

## When to use

- Antes de cada merge que toque `docs/`.
- Al cerrar un gap encontrado por el validador (bucle gap-close).

## When not to use

- No sustituye la revisión humana de contenido: el validador comprueba forma y grafo, no exactitud técnica ni prosa.
- No se aplica al legacy excluido: forzarlo genera falsos positivos.

## Examples

Fallar y luego arreglar un `dangling-related-target`:

```yaml
# antes
related: [nota-inexistente]
# después — el id resuelve
related: [new-note-protocol]
```

Merge limpio:

```bash
node tools/docs/validate.js --write   # regenera regiones
node tools/docs/validate.js           # exit 0
```

## Common mistakes

- Correr solo `--write` y nunca la verificación read-only: el `--write` no falla aunque queden errores.
- Editar a mano un índice generado en vez de regenerar la región.
- Desbloquear el merge desactivando una regla en lugar de arreglar la nota culpable.
- Registrar la nota en el hub pero olvidar el tag index en el mismo commit (o al revés).

## References

- [accepted-debt.md](../context/accepted-debt.md)
- [documentation-system.md](../context/documentation-system.md)
- [docs/project.md](../project.md)
