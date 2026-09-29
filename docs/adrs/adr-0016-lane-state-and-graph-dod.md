---
id: adr-0016-lane-state-and-graph-dod
category: adrs
tags: [adr, graph, lanes, dod, onrails]
aliases: [ADR-0016]
related: [adr-index, accepted-debt]
version: 1.0
status: active
---

# ADR-0016: Estado de lanes por repo + alcance del DoD del grafo

## Problem

Dos decisiones quedaron implícitas al implementar el grafo y, sin registro, se pierden. (a) La asignación de columnas (lanes) sufría *seams* de re-layout porque el algoritmo era local a cada ventana: el mismo commit podía caer en una columna distinta según qué ventana de scroll lo pidiera. (b) El DoD de la Semana 1-2 prometía paridad visual con `git log --graph --oneline`, que dibuja diagonales de convergencia y cruces, cuando el contrato de transporte `Lane{index,color,continues}` no porta geometría de aristas y esas diagonales no son representables.

## Solution

Dos decisiones, itemizadas.

### (a) Ownership del estado de lanes — `GraphService` stateful por repo

1. Las lanes se computan **solo en Go** (ADR-008); el renderer nunca re-deriva columnas.
2. `GraphService` mantiene un **estado de fold por repositorio** (slots de lane) más el **vector de lanes acumulado**, resuelto desde HEAD.
3. La columna de un commit depende **solo de la historia desde HEAD**, no de qué ventana la pidió — se eliminan los *seams* de re-layout de la computación puramente window-local previa.
4. El estado se **invalida** por eventos del watcher y por movimientos de HEAD: las operaciones mutantes de `GitService` emiten un evento de watcher, y `main.go` cablea `WatcherService.OnChange → GraphService.Invalidate`.
5. **Concurrencia:** mutex por servicio; `go test -race` se mantiene verde.
6. **Caché solo en memoria**; SQLite sigue siendo caché de metadata de commits y **nunca** guarda objetos Git (anti-goal del entry point).

### (b) Scoping del DoD — columnas verticales; geometría de aristas diferida

7. El contrato de wire `Lane{index,color,continues}` **no porta geometría de aristas**, así que convergencias y cruces no pueden dibujarse como diagonales.
8. El DoD de la Semana 1-2 se **acota a columnas de lane verticales**: asignación de columna correcta y continua entre ventanas.
9. La **paridad visual completa** con las diagonales/cruces de `git log --graph` queda diferida como **deuda aceptada** (ver [[accepted-debt]]).
10. **No hubo cambio de contrato** (ni `LaneRow` ni segmentos): fue una decisión deliberada (Opción B) para no congelar un contrato de wire incompleto.

## When to use

- Al tocar `GraphService.Lanes`, su estado de fold, su invalidación o su benchmark.
- Al evaluar si el DoD del grafo exige diagonales/cruces (hoy: no; es deuda aceptada).

## When not to use

- No para rediseñar la UI del grafo ni asumir paridad con `git log --graph`.
- No para introducir `LaneRow`/segmentos sin un ADR sucesor que superseda a este.
- No para mover el cómputo de lanes al renderer: viola ADR-008.

## Examples

Estado per-repo e invalidación:

```go
// GraphService: fold state por repo + lane vector acumulado, resuelto desde HEAD.
func (s *GraphService) Invalidate(repoID string) { /* drop fold state -> recompute from HEAD */ }

// main.go: un cambio del watcher dispara la invalidación.
watcher.OnChange(func(ev Event) { graph.Invalidate(ev.RepoID) })
```

Ciclo de verificación:

```bash
cd apps/go-core && go test -race ./...   # el mutex del estado se mantiene verde
```

## Common mistakes

- **Meter el estado de fold en la ventana** en vez de en el servicio: reintroduce los *seams* entre scrolls.
- **Olvidar invalidar en HEAD moves**: una operación mutante sin evento de watcher deja lanes obsoletas.
- **Cachear objetos Git en SQLite** "para acelerar": viola el anti-goal; SQLite es solo metadata.
- **Prometer diagonales** con el contrato actual: `Lane` no lleva geometría de aristas.

## References

- Deuda aceptada (paridad de aristas): [[accepted-debt]]
- Hub de ADRs: [[adr-index]]
- Contrato del corpus: [documentation-system.md](../context/documentation-system.md)
- Diseño legacy de servicios: [service-design.md](../context/git-client/service-design.md)
