# SingulariTree — Índice de documentación

> **SingulariTree = git-client monorepo** — Cliente Git de escritorio multiplataforma inspirado en SourceTree.
> Carpeta física: `SingulariTree/` · Alias lógico: `git-client` · Módulo Go: `github.com/SingulariTree/go-core` · Proto: `singularitree.v1` (alias `gitclient.v1`).

## Propósito

Este directorio es el **greenfield topic folder** canónico para el diseño completo de SingulariTree. No modifica `frontend/` ni `backend/` de Necomat. Describe un monorepo **Angular + Electron + Go headless + SQLite + gRPC/HTTP + contratos buf**.

Principios no negociables (inglés técnico preservado):
1. **Performance** — grafo virtualizado, LRU cache, paginación, watchers coalescados.
2. **Scalability** — repos grandes (50k+ commits), binarios pesados, múltiples repos.
3. **Clean Architecture / Hexagonal** — frontend nunca habla con Git; `ports & adapters`.
4. **Maintainability** — contratos únicos `libs/contracts/proto -> gen/go + gen/ts`.
5. **Automated testing + UX moderna** — vitest, go test, playwright.

---

## Mapa de entregables (10 + 2)

| # | Documento | Qué responde | Criterio aceptación |
|---|-----------|--------------|---------------------|
| 1 | [architecture.md](./architecture.md) | C4 L1-3, hexagonal, headless proof (`--headless`, `GO_CORE_READY`, supervisor) | C4 + hexagonal + headless proof |
| 2 | [folder-structure.md](./folder-structure.md) | Árbol monorepo con rationale por carpeta | Estructura completa |
| 3 | [module-diagram.md](./module-diagram.md) | Mermaid C4 + hexagonal proof + secuencia IPC | Diagrama módulos |
| 4 | [domain-model.md](./domain-model.md) | Entidades, VOs, agregados, schema SQLite, errores | Modelo dominio |
| 5 | [ipc-strategy.md](./ipc-strategy.md) | Preload bridge, gRPC vs HTTP, proto sketch, supervisor, seguridad | IPC completo |
| 6 | [service-design.md](./service-design.md) | Servicios Go, Angular Signals stores, cache, watchers, paginación | Diseño servicios |
| 7 | [testing-strategy.md](./testing-strategy.md) | Pirámide testing, mocks, testcontainers, e2e | Testing |
| 8 | [roadmap-mvp.md](./roadmap-mvp.md) | MVP 8-10 semanas, épicas, DoD | MVP |
| 9 | [roadmap-v1.md](./roadmap-v1.md) | V1 16-20 semanas post-MVP | V1 |
| 10 | [risks.md](./risks.md) | Riesgos técnicos, mitigaciones, RACI | Riesgos |
| 11 | [decisions.md](./decisions.md) | ADRs justificadas (13 decisiones) | Decisiones |
| 12 | Este índice | Navegación | Índice |

## Superficie MCP (opcional) — ADR-013

- **Qué:** MCP (Model Context Protocol) como **inbound adapter opcional** sobre el core Go — permite que clientes AI manejen/consulten el mismo core, headless.
- **Dónde:** `apps/go-core/internal/adapter/mcp/` + `apps/go-core/cmd/mcp-server/main.go` (stdio; HTTP en loopback en fase MCP-C).
- **Estado:** **Proposed** (advisory — no bloquea el spine de Fase 0). Ver [decisions.md](./decisions.md) ADR-013, [architecture.md](./architecture.md) §2, [module-diagram.md](./module-diagram.md) §2/§5, [risks.md](./risks.md) R13-R15, [roadmap-v1.md](./roadmap-v1.md) workstream MCP-A/B/C.

## Convenciones

- **Idioma:** Español (términos técnicos en inglés).
- **Contratos:** fuente única `libs/contracts/proto/*.proto` → `libs/contracts/gen/go + gen/ts` vía `buf generate --template buf.gen.yaml`. Paquete `singularitree.v1`, alias `gitclient.v1` para compatibilidad (ver cabeceras proto).
- **SQLite:** WAL + `synchronous=NORMAL` + `foreign_keys=ON`, DB por usuario fuera del repo (`~/.local/share/singularitree/cache.db` o `~/Library/Application Support/...`), **nunca** guarda objetos Git.
- **Headless:** `go-core --headless` imprime `GO_CORE_READY addr=... http=... token=...` y responde `Ping` cada 5s; supervisor lo supervisa (ver `architecture.md §5` y `ipc-strategy.md §2.6`).

## Quick links (skeleton físico)

- Monorepo root: `SingulariTree/` (este repo)
- Angular: `apps/angular` · Electron: `apps/electron` · Go core: `apps/go-core`
- Contratos: `libs/contracts` · UI kit: `libs/ui-kit` · SQLite: `data/sqlite`
- Tools: `tools/scripts/{gen-contracts,build-go-core}.sh` + `tools/ci/verify-contracts.sh`
- Supervisor existente: `apps/electron/src/main/supervisor.ts`
- Preload existente: `apps/electron/src/preload/preload.ts`
- Headless entrypoint: `apps/go-core/cmd/go-core/main.go`

## Estado

Scaffold verde: contratos proto + supervisor stub + Go headless stub + migrations `001_initial.sql` existen; generación buf y lógica Git real pendientes (MVP).

## Verificación

```bash
ls docs/context/git-client/          # >=10 .md
buf lint                             # ok (buf.yaml v2, package singularitree.v1)
go vet ./...                         # go-core compila
npm run gen:contracts --workspace=@singularitree/contracts  # buf generate
```

> Promoción futura: cuando se valide, este topic folder puede promoverse a Slices table en `docs/project.md`.
