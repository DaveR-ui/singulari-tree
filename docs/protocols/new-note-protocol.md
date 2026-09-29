---
id: new-note-protocol
category: protocols
tags: [protocol, contract]
aliases: [New Note Protocol, Protocolo de nota nueva]
related: [bootstrap-protocol]
version: 1.0
status: active
---

# Protocolo de nota nueva

## Problem

Una nota escrita "a mano alzada" suele entrar sin frontmatter completo, sin las secciones de cuerpo obligatorias o sin aristas al resto del grafo. Eso la vuelve invisible para los índices generados, rompe el validador y deja links que nadie resuelve. Falta un checklist único que se corra **antes** de declarar la nota terminada.

## Solution

Checklist de cierre. Correr entero antes de declarar la nota `done`; un ítem sin marcar es un bloqueador.

### Metadata

- [ ] Las **7 keys requeridas** están presentes: `id`, `category`, `tags`, `aliases`, `related`, `version`, `status`.
- [ ] `id` es un slug único, aproximadamente `<stem>` y coherente con `<category>`.
- [ ] `status` es uno del enum: `draft` | `active` | `superseded` | `expired`.
- [ ] Keys opcionales: presentes con valor válido o **totalmente ausentes** (nunca vacías ni en `null`).
- [ ] Sin keys extra fuera del contrato.

### Body

- [ ] H1 presente y descriptivo.
- [ ] Las **7 secciones verbatim en orden**: `## Problem`, `## Solution`, `## When to use`, `## When not to use`, `## Examples`, `## Common mistakes`, `## References`.
- [ ] `## When not to use` y `## Common mistakes` son reales y específicos, no relleno.

### Graph

- [ ] Todo `related` apunta a un `id` que resuelve a una nota real.
- [ ] Todo `[[wikilink]]` usa el stem del filename (sin `.md`) y resuelve.
- [ ] La nota tiene **≥1 arista resuelta** (o `related` o `[[wikilink]]`).
- [ ] La nota aparece en el hub de su carpeta.

### Hygiene

- [ ] Sin secretos: ni credenciales, ni hashes largos, ni valores de `token` o `password` en el cuerpo.
- [ ] El índice generado lista la nota (`node tools/docs/validate.js --write` sin diff inesperado).
- [ ] Todos los links vivos: `node tools/docs/validate.js` exit `0`.

## When to use

- Al crear cualquier nota nueva dentro del corpus (context, protocols, adrs, decisions).
- Al tocar una nota existente que todavía no había pasado por el contrato.

## When not to use

- No para hubs: los `<folder>-index.md` usan body corto, no las 7 secciones.
- No sustituye la revisión de contenido: el checklist verifica forma, no veracidad.

## Examples

Frontmatter mínimo correcto (7 keys, sin extras):

```yaml
---
id: my-note
category: protocols
tags: [protocol, example]
aliases: [My Note]
related: [new-note-protocol]
version: 1.0
status: active
---
```

Arista viva: `related: [new-note-protocol]` resuelve a `new-note-protocol.md`; `[[new-note-protocol]]` resuelve al mismo stem.

## Common mistakes

- Dejar keys opcionales en `null` o `[]` en lugar de omitirlas.
- Escribir el H1 en un idioma y las secciones en otro; el cuerpo va en el idioma configurado.
- `related` con stems en lugar de `id`s, o `[[wikilink]]` con `.md`.
- Crear la nota sin registrarla en el hub de su carpeta: queda huérfana.

## References

- [docs-review-protocol.md](./docs-review-protocol.md)
- [documentation-system.md](../context/documentation-system.md)
- [docs/project.md](../project.md)
