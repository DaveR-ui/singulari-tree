---
id: adr-0015-docs-validator-generated-index
category: adrs
tags: [adr, documentation, validator, generated]
aliases: [ADR-0015]
related: [adr-index]
version: 1.0
status: active
---

# ADR-0015: Validador de docs propio + índices generados con marker regions

## Problem

El catálogo de revisión de [[docs-review-protocol]] necesita un pase automático: sin él, los 9 errores se detectan a ojo y los índices se desincronizan. El validador del repo onrails no es reutilizable tal cual — está cableado a **su** layout, su raíz de corpus y su entry point — así que copiarlo produce falsos positivos sobre la estructura de SingulariTree. Además, mantener `docs/index.md` y `docs/tag-index.md` a mano garantiza drift.

## Solution

Adoptar un **equivalente** propio, no el upstream. Decisión, itemizada:

1. **No** se vende el `validate.js` del repo onrails tal cual (cableado a su layout). Se adopta un **equivalente zero-dependency** en `tools/docs/validate.js`, con raíz de corpus `docs/` y entry point `docs/project.md`.
2. **Implementa el catálogo completo**: los **9 errores + 3 warnings** de [[docs-review-protocol]].
3. **`--write`** regenera las regiones marker de `docs/index.md` (marker `index`) y `docs/tag-index.md` (marker `tags`), **write-if-diff**, con línea de snapshot (fecha).
4. **Exclusión explícita** del legacy `context/git-client/**` como deuda aceptada — ver `accepted-debt.md`.
5. **Hook CI** `tools/ci/verify-docs.sh`, mismo patrón que `tools/ci/verify-contracts.sh`: falla el build si el validador sale `1`.

## When to use

- Al agregar o cambiar reglas del catálogo de revisión.
- Al tocar la forma de los índices generados o sus markers.

## When not to use

- No para validar contenido semántico (correctitud técnica): eso es revisión humana.
- No para el legacy excluido: el validador lo salta por diseño.

## Examples

Regenerar y verificar:

```bash
node tools/docs/validate.js --write   # regiones index + tags, write-if-diff
node tools/docs/validate.js           # read-only, exit 1 si hay errores
```

Hook de CI:

```bash
tools/ci/verify-docs.sh               # falla el build si validate.js sale 1
```

## Common mistakes

- **Parchear a mano** las regiones generadas: el siguiente `--write` lo revierte.
- **Adoptar el validador upstream sin adaptar**: raíz, layout y entry point ajenos → falsos positivos.
- Regenerar con `--write` y dar el merge por bueno sin correr la verificación read-only.
- Olvidar la línea de snapshot: se pierde la señal de staleness.

## References

- [documentation-system.md](../context/documentation-system.md)
- [docs-review-protocol.md](../protocols/docs-review-protocol.md)
- [accepted-debt.md](../context/accepted-debt.md)
