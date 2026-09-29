---
id: slices-index
category: slices
tags:
- hub
- index
- slices
aliases:
- Slices Index
- Índice de slices
related:
- contracts-slice
- core-slice
- desktop-shell-slice
- renderer-slice
- tooling-slice
- docs-slice
version: 1.0
status: active
---

# Slices — Índice

**Qué pertenece aquí.** Un *slice* es un área mayor del código delimitada por una persona — territorio, no equipos ni tipos de archivo. Cada slice agrupa las piezas que evolucionan juntas y tiene un doc de **generalidades** (`category: slices`). Ese doc describe el slice de arriba a abajo con una estructura fija de siete secciones: qué es, dónde empieza y termina, cómo se entra, cómo funciona, sus convenciones, sus dependencias y su deuda aceptada.

## Contents

- [[contracts-slice]] — fuente única de contratos proto y stubs generados; frontera de compatibilidad entre core Go, shell Electron y renderer Angular.
- [[core-slice]] — core Go headless: dominio, servicios, repositorio y adaptadores.
- [[desktop-shell-slice]] — shell Electron: main, preload, IPC, supervisor, ventana, menú y CSP.
- [[renderer-slice]] — SPA Angular 21 (zoneless, standalone, signals), features, stores y UI kit compartido.
- [[tooling-slice]] — scripts de build/generación y CI.
- [[docs-slice]] — corpus de documentación: entry point, contexto, slices, protocolos, ADRs e índices generados.

## Elsewhere

- Diseño detallado legacy (greenfield topic folder): `docs/context/git-client/INDEX.md`.
- Decisiones de arquitectura (ADRs, append-only): `docs/adrs/adr-index.md`.
- Propuesta: cuando se valide, el topic folder legacy puede promoverse a la tabla de Slices de `docs/project.md`.
