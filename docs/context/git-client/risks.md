# Riesgos técnicos

## Matriz (Probabilidad × Impacto)

| # | Riesgo | Prob | Impacto | Severidad | Mitigación | Owner |
|---|--------|------|---------|-----------|------------|-------|
| R1 | **Grafo 50k+ lento / DOM thrash** | Alta | Alto | 🔴 | Virtual scroll CDK/canvas + lanes en Go + LRU window 200+100; bench 50k <100ms | Go GraphService + Angular graph |
| R2 | **Monaco diff congela UI ficheros grandes** | Alta | Alto | 🔴 | Worker + chunking + límite 1MB → plain text fallback; virtualization hunks | ui-kit diff-viewer |
| R3 | **Go headless lifecycle frágil (zap, socket perms)** | Media | Alto | 🟡 | Unix socket fallback TCP, `GO_CORE_READY` timeout 15s, backoff, token rotation, testcontainers kill test | supervisor + main.go |
| R4 | **SQLite WAL concurrencia (múltiples ventanas)** | Media | Medio | 🟡 | Un único Go core (no multi-process DB writers); `busy_timeout=5000`, WAL, `synchronous=NORMAL`; test stress | repository |
| R5 | **File watchers burst + index.lock** | Alta | Medio | 🟡 | fsnotify debounce 150-300ms coalescing + `index.lock` filter; watcher no bloquea UI thread | watcher adapter |
| R6 | **Contratos drift (gen/go vs gen/ts)** | Media | Alto | 🟡 | `buf lint` + `buf breaking` + `verify-contracts.sh` en CI; gen es artefacto, no edit manual | libs/contracts |
| R7 | **go-git vs exec git paridad incompleta** | Media | Alto | 🟡 | Abstracción `GitPort`; MVP usa exec `git` (paridad 100%), migra a go-git incremental con feature flags | adapter/git |
| R8 | **Token auth local spoof** | Baja | Medio | 🟢 | Bind solo 127.0.0.1/unix socket, token 32B hex, sin 0.0.0.0, CSP, contextIsolation | ipc-strategy |
| R9 | **Cross-platform path / line endings** | Media | Medio | 🟡 | `filepath.Abs` + `filepath.Join`, `core.autocrlf` awareness, tests en 3 OS | domain + Go |
| R10| **Electron packaging / signing / auto-update** | Baja (MVP) / Alta (V1) | Medio | 🟡 | `electron-builder` + notary; V1 only; MVP sin sign | tools |
| R11| **Submodules / LFS / worktrees edge cases** | Media | Medio | 🟡 | Detectar y marcar unsupported con mensaje claro; no bloquear repo open | GitService |
| R12| **Memory leak streaming (Watch/Fetch never close)** | Media | Alto | 🟡 | Context cancel en gRPC stream, `signal.NotifyContext` cleanup, deadline por RPC | grpc server |
| R13| **MCP adapter = segundo writer de SQLite (`cache.db`)** | Baja | Alto | 🟡 | MCP es único proceso core con su propia DB, o corre `--proxy-grpc` contra un go-core activo; dos writers completos a `cache.db` prohibidos (ref R4) | adapter/mcp |
| R14| **MCP tool schema drift vs proto** | Media | Medio | 🟡 | JSON Schema generado desde proto (`protoreflect`/buf), nunca duplicado a mano; check en CI (ref R6) | adapter/mcp |
| R15| **Streaming/cancelación MCP (`Fetch/Push/Pull`, `Watch`)** | Media | Medio | 🟡 | `notifications/cancelled` → context-cancel del stream gRPC; `Watch` como cursor/poll `git_events(since_cursor)` (ref R12) | adapter/mcp |

## Detalle por riesgo

### R1 — Grafo virtualization
- **Síntoma:** render 10k commits → 10k DOM nodes → jank.
- **Mitigación:** `cdk-virtual-scroll-viewport itemSize=28` + lanes SVG/canvas precomputed; lanes calculadas en Go O(n) incremental; `getCommits` paginado; LRU tamaño 300.
- **Verificación:** playwright scroll perf trace + `BenchmarkLanes(50000)` <100ms.

### R2 — Monaco large files
- **Síntoma:** diff 5MB → Monaco OOM o freeze 3s.
- **Mitigación:** `if (size>1MB || lines>5000) fallbackPlainText`; sino `monaco.editor.create(diffEditor)` con web workers (`monaco-workers`); hunks chunked lazy; diff por file, no repo-wide.
- **Verificación:** fixture large file 2MB diff, frame budget test.

### R3 — Headless lifecycle
- **Síntoma:** Go no emite `GO_CORE_READY`, socket permiso denegado, puerto en uso.
- **Mitigación:** fallback TCP `127.0.0.1:0` si unix socket falla; timeout 15s + retry backoff; health `Ping` 5s; `tools/scripts/build-go-core.sh` prueba `--headless` en CI; logs a stderr.
- **Verificación:** `timeout 3 go run --headless | grep GO_CORE_READY` en CI.

### R4 — SQLite WAL
- **Síntoma:** `database is locked` con múltiples writers.
- **Mitigación:** solo Go escribe (single writer); WAL + `PRAGMA busy_timeout=5000`; `database/sql` pool `maxOpenConns=1`; migrations `IF NOT EXISTS`.
- **Verificación:** stress test 10 goroutines concurrent `SetCommits`.

### R5 — Watchers burst
- **Síntoma:** `git checkout` genera 500 eventos → invalida cache 500 veces → thrash.
- **Mitigación:** debounce 200ms + coalescing array `paths[]` por window; filtro `index.lock`; `Watch` push único por burst.
- **Verificación:** script `touch 1000 files` → un solo `FsChangedEvent`.

### R7 — go-git paridad
- **Síntoma:** `go-git` no soporta `rebase --interactive`, `lfs`, `signing`.
- **Mitigación:** MVP usa `exec git` para paridad total; abstrae tras `GitPort`; go-git solo para lectura rápida si aporta performance (opcional feature flag).
- **Verificación:** tabla feature parity en `adapter/git/README.md`.

### R13 — MCP + SQLite single-writer
- **Síntoma:** `--mcp-stdio` arranca un segundo core completo → dos writers a `cache.db` → `database is locked` / corrupción.
- **Mitigación:** regla explícita de ownership: MCP es **único** proceso core con su DB, **o** corre `--proxy-grpc` contra un go-core ya activo; nunca dos writers full (ref R4). Read-only por defecto.
- **Verificación:** test que rechaza un segundo writer; smoke `--proxy-grpc` con go-core en marcha.

### R14 — MCP schema drift
- **Síntoma:** tools MCP declaran schemas desincronizados de `gitcore.proto` tras un cambio de contrato.
- **Mitigación:** input JSON Schema **generado** desde proto (`protoreflect`/buf), nunca hand-duplicated; outputs protojson; verificación en CI junto a `verify-contracts.sh` (ref R6).
- **Verificación:** `buf generate` + comparación de schemas → falla CI si divergen.

### R15 — MCP streaming/cancel
- **Síntoma:** `Fetch/Push/Pull` sin progreso o sin cancelación; `Watch` no encaja en streaming MCP.
- **Mitigación:** `Progress` → `notifications/progress`; `notifications/cancelled` → context-cancel del stream gRPC; `Watch` como cursor/poll `git_events(since_cursor)` (ref R12).
- **Verificación:** test de cancelación de `git_fetch`; test de cursor incremental `git_events`.

## Plan de mitigación priorizado (MVP)

1. R1, R2, R5 (sem 1-5) — perf + watchers.
2. R3, R6 (sem 0) — headless + buf.
3. R4, R7 (sem 0-1) — SQLite + GitPort.
4. R12 (sem 6) — streaming cleanup.
5. R10 (V1) — packaging.
6. R13, R14, R15 (post-MVP, workstream MCP opcional) — DB ownership + schema + cancel.

## Fallbacks

- Si virtual scroll insuficiente → migrar lanes a `<canvas>` (tradeoff a11y).
- Si fsnotify inestable en macOS → poll fallback 1s (`--watcher-mode=poll`).
- Si gRPC inestable → degradar a HTTP JSON (ya levantado en `127.0.0.1:0`).

## Métricas de seguimiento

- `BenchmarkLanes` p50/p99.
- `vitest` coverage ≥80%.
- `playwright trace` frame rate grafo.
- `go vet` + `buf breaking` must pass.
