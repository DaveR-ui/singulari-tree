---
last_updated: 2026-09-29
status: active
description: Cómo está organizado el corpus de documentación de SingulariTree — capas, contrato de frontmatter, naming, hubs, índices generados, lifecycle y validador.
tags:
- documentation
- contract
- structure
- onrails
version: 1.0
related:
- accepted-debt
---

# Sistema de documentación

## Problem

Un corpus de Markdown sin reglas se pudre de dos maneras: las notas dejan de ser ciertas en silencio y los consumidores (humanos o agentes) navegan adivinando rutas. Sin un contrato único no hay forma de saber qué archivo es fuente de verdad, qué clave de frontmatter es válida ni cómo se indexa una nota nueva. SingulariTree necesita una organización que sirva a la vez a lectores y a agentes, sin base de datos intermedia.

## Solution

El corpus vive bajo `docs/` y sigue el contrato **documentation-onrails v1.4**.

### Capas

- **raw** — fuentes sin curar (código, decisiones, borradores).
- **wiki** — notas curadas; *es el store*.
- **schema** — plantillas y catálogo de revisión que aplican forma a la wiki.

Reglas: **un tema por archivo**, referenciar en vez de duplicar, máximo 3 niveles de anidación, y **un hub por carpeta** nombrado `<folder>-index.md` (exentas las carpetas de *schema* como `protocols/`, cuyas notas se registran desde la tabla de navegación del entry point).

### Contrato de frontmatter

- **Familia `nota`** (todos los `*-index.md`): exactamente 7 claves — `id`, `category`, `tags`, `aliases`, `related`, `version`, `status`. Opcionales `supersedes`, `expires_at`, `moved_from`; se **omiten** si no se usan (presente-pero-vacío es error).
- **Familia `context-doc`** (`docs/context/*.md` y `docs/project.md`): `last_updated` (YYYY-MM-DD), `status`, `description`, `tags`, `version`; opcionales `related`, `moved_from`. `docs/project.md` añade además `doc_language` (declarado **una sola vez**).
- Las claves **nunca** se renombran ni se traducen.

### Naming e identidad

- Nombres en `lowercase-kebab-case`; `docs/README.md` es la única excepción y queda **fuera** del corpus.
- `related` usa **ids**; los `[[wikilinks]]` usan **stems** de archivo (sin extensión). Un único resolver **case-insensitive**; toda referencia debe resolver a un archivo real.

### Índices generados

- `docs/index.md` y `docs/tag-index.md` son artefactos generados en **regiones delimitadas** por marcadores (`<!-- BEGIN GENERATED: index|tags -->` … `<!-- END GENERATED: … -->`).
- El generador trabaja **write-if-diff** (salida byte-estable) y estampa una **snapshot date**; nunca toca el texto fuera de la región ni rescata contenido generado.

### Lifecycle

- `status` ∈ `draft` | `active` | `superseded` | `expired`. Superseder, no reescribir: el sucesor declara `supersedes` y el predecesor cambia de estado.
- Los **ADRs son append-only** por contrato: un addendum, nunca editar el texto original.

### Ratchet

- El contrato aplica **solo** a archivos nuevos o tocados. El corpus legacy `docs/context/git-client/**` está congelado y excluido del validador — ver [[accepted-debt]].

### Version bump

- `version` = `MAJOR.MINOR(.PATCH)`: MAJOR si rompe contrato (requiere ADR), MINOR si es normativo/estructural, PATCH si es solo redacción. Todo archivo tocado bumpea `version` y refresca `last_updated`.

### Validador

- `node tools/docs/validate.js` camina el catálogo y sale con **exit 1** ante errores (p. ej. `metadata-outside-contract`); `--write` regenera los índices.
- `./tools/ci/verify-docs.sh` es el hook de CI que corre la validación en cada cambio.

## When to use

- Antes de escribir o editar cualquier nota: confirma la familia de frontmatter, el naming y si la referencia resuelve.
- Cuando un agente necesita saber dónde vive una verdad o cómo se rutea una entrada nueva.

## When not to use

- Para el README raíz humano (`README.md`): vive fuera del corpus y no lleva frontmatter.
- Para el diseño legacy de `docs/context/git-client/**`: no se migra en bloque (ver [[accepted-debt]]).

## Examples

Nota nueva (familia `nota`, hub de carpeta):

```markdown
---
id: slices-index
category: hub
tags:
- slices
- hub
aliases:
- indice-de-slices
related:
- documentation-system
version: 1.0
status: active
---
```

Context-doc mínimo:

```markdown
---
last_updated: 2026-09-28
status: active
description: ...
tags:
- documentation
version: 1.0
---
```

Región generada:

```markdown
<!-- BEGIN GENERATED: index -->
<!-- END GENERATED: index -->
```

## Common mistakes

- Dejar una clave opcional presente pero vacía (`supersedes:` sin valor) — es error de contrato.
- Editar a mano dentro de una región generada; se reconstruye con `--write`.
- Duplicar contenido que ya vive en otro context-doc o en `docs/project.md` en vez de referenciarlo.
- Mezclar varios temas en un archivo y romper "un tema por archivo".
- Declarar `doc_language` en más de un archivo: solo `docs/project.md`.

## References

- Deuda aceptada y ratchet: [[accepted-debt]]
- Entry point del proyecto: [docs/project.md](../project.md)
- Revisión del corpus: [docs/protocols/docs-review-protocol.md](../protocols/docs-review-protocol.md)
