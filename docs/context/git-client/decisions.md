# Decisiones de diseño — ADRs

> Formato ADR: Context → Decision → Consequences → Alternatives. Todas justifican por qué se eligió y qué se sacrificó.

## ADR-001 — Hexagonal (Ports & Adapters) con Go headless

- **Contexto:** Frontend nunca debe ejecutar Git directo; Electron debe ser reemplazable; Go debe correr sin UI.
- **Decisión:** `domain` puro sin imports externos; `service` orquesta ports; `adapter` implementa; `cmd/go-core/main.go` es composition root. Angular/Electron solo conocen `window.gitClientApi`.
- **Consecuencias:** + testeabilidad (mocks ports), + sustituibilidad (Tauri/React), + headless proof `--headless`; − boilerplate interfaces, − curva hexagonal para contributors nuevos.
- **Alternativas:** MVC monolítico Electron (descartado: acopla Git a UI, no headless).
- **Estado:** Aceptado.

## ADR-002 — Monorepo npm workspaces + go.work

- **Contexto:** Necesidad de contratos atómicos Angular↔Go y tooling único.
- **Decisión:** `package.json` workspaces (`angular`, `electron`, `contracts`, `ui-kit`) + `go.work` (`use ./apps/go-core`).
- **Consecuencias:** + `buf generate` atomiza `gen/go+gen/ts`; + CI único; − `go.work` requiere Go 1.18+ (ok 1.24).
- **Alternativas:** Polyrepo (descartado: drift contratos).
- **Estado:** Aceptado.

## ADR-003 — Contratos proto únicos con buf (singularitree.v1 alias gitclient.v1)

- **Contexto:** Tipado entre Go y TS, breaking changes controlados.
- **Decisión:** `libs/contracts/proto/*.proto` fuente única; `buf.yaml` v2 (`STANDARD`, `breaking: FILE`) + `buf.gen.yaml` (`go`, `grpc/go`, `ts-proto`) → `gen/go` + `gen/ts`; `buf lint` + `buf breaking` en `tools/ci/verify-contracts.sh`; paquete `singularitree.v1`, alias `gitclient.v1` en comentarios.
- **Consecuencias:** + breaking check; + `gen` no editable; − dependencia `buf` CLI.
- **Alternativas:** OpenAPI/JSON Schema (descartado: streaming débil).
- **Estado:** Aceptado.

## ADR-004 — IPC gRPC primario (unix socket/named pipe) + HTTP fallback

- **Contexto:** Streaming (`Watch`, `Fetch` progress, `StreamCommits`) y tipado; compatibilidad debug.
- **Decisión:** gRPC en unix socket (Linux/macOS) / named pipe `\\.\pipe\singularitree-go-core` (Windows) primario; HTTP fallback siempre en `127.0.0.1:0` con JSON; token `authorization: Bearer`. Scaffold mapea unix→TCP para buildability.
- **Consecuencias:** + streaming nativo + interceptors; + `curl` fallback; − gRPC complejidad vs REST; − unix socket perms en Windows.
- **Alternativas:** Solo HTTP REST/SSE (descartado: streaming frágil, tipado manual).
- **Estado:** Aceptado.

## ADR-005 — Preload único + contextIsolation + CSP

- **Contexto:** Seguridad Electron, una superficie IPC.
- **Decisión:** `preload.ts` único `contextBridge.exposeInMainWorld('gitClientApi', api)`; `BrowserWindow` `contextIsolation:true, nodeIntegration:false, sandbox:true`; CSP en `window/csp.ts`; validación `channels.ts:validate` antes de forward.
- **Consecuencias:** + minimiza attack surface; + tipado; − no exponer `ipcRenderer` directo.
- **Alternativas:** `nodeIntegration:true` (descartado: inseguro).
- **Estado:** Aceptado.

## ADR-006 — SQLite WAL per-user para metadata cache (nunca Git objects)

- **Contexto:** Persistir recents/favorites/prefs/UI-state + commit window cache sin servidor; Git data queda en `.git`.
- **Decisión:** SQLite WAL (`journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`) en `~/.local/share/singularitree/cache.db` (Linux), `Application Support` (macOS), `%APPDATA%` (Win); `data/sqlite/migrations/001_initial.sql` migra `repos`, `commit_cache`, `file_status`, `stash_cache`; `modernc.org/sqlite` (pure Go) o `mattn/go-sqlite3`; un solo writer (Go).
- **Consecuencias:** + sin servidor, + WAL concurrencia lecturas; + migraciones versionadas; − no multi-writer; − path per-OS.
- **Alternativas:** LevelDB/IndexedDB (descartado: query SQL útil para commits), Postgres (descartado: servidor).
- **Estado:** Aceptado.

## ADR-007 — Go core headless con GO_CORE_READY + supervisor Ping 5s + token rotation

- **Contexto:** Go debe vivir sin Electron y ser supervisado.
- **Decisión:** `cmd/go-core/main.go` flag `--headless` → bindea gRPC+HTTP, imprime `GO_CORE_READY addr=... http=... token=...` (parseable), `signal.NotifyContext` graceful 5s; `supervisor.ts` awaitReady 15s, heartbeat Ping 5s, backoff `[200,500,1000,2000,5000]`, queue 100, token 32B hex rotado por restart.
- **Consecuencias:** + headless proof testeable (`go run --headless | grep GO_CORE_READY`); + auto-recover; − parsing stdout frágil (mitigado regex estricta).
- **Alternativas:** stdio JSON-RPC (descartado: menos estándar que gRPC).
- **Estado:** Aceptado (scaffold ya implementa stub TCP; producción pasará a unix socket real).

## ADR-008 — Grafo lanes en Go + virtualization Angular (CDK/canvas) + LRU windowed 200+100

- **Contexto:** 50k commits con merges, render fluido, <100ms.
- **Decisión:** `GraphService.Lanes` calcula lanes O(n) en Go (equivalente `git log --graph`); Angular virtualiza con `cdk-virtual-scroll-viewport itemSize=28` + `graph-row` SVG/canvas; paginación `200` inicial + `100` prefetch + `IntersectionObserver`; LRU memory 300.
- **Consecuencias:** + lanes <50ms en Go; + DOM solo ~30 nodos; − `cdk-virtual-scroll` no canvas (fallback canvas si no suficiente).
- **Alternativas:** Lanes en TS (descartado: bloquea main), paginación no virtualizada (descartado: DOM thrash).
- **Estado:** Aceptado.

## ADR-009 — Monaco diff con workers + chunking + fallback 1MB

- **Contexto:** Diff UX moderna, binarios, ficheros grandes.
- **Decisión:** `libs/ui-kit/diff-viewer` wrapper `monaco-editor` + `monaco-workers` (web workers); `side-by-side`/`unified` toggle; límite 1MB/`5000` líneas → plain text fallback; syntax por extensión; hunks lazy.
- **Consecuencias:** + UX SourceTree-like; + no freeze; − bundle Monaco pesado (lazy load).
- **Alternativas:** CodeMirror (descartado: Monaco superior diff), plain `<pre>` (descartado: pobre).
- **Estado:** Aceptado.

## ADR-010 — File watchers fsnotify con coalescing 150-300ms + index.lock guard

- **Contexto:** Cambios realtime `.git/HEAD`, `refs/*`, `index` sin thrash; `index.lock` burst.
- **Decisión:** `adapter/watcher` `fsnotify` watch `.git/HEAD`, `refs/**`, `index`, `logs/HEAD`; debounce 200ms (150-300 configurable) coalescing burst → un `FsChangedEvent{paths[]}`; filtro `index.lock` ignore; invalida `CacheService`; push vía `Watch` streaming → `fs:changed`.
- **Consecuencias:** + realtime sin polling; + burst coalescado; − `fsnotify` inestable en macOS FSEvents (fallback poll).
- **Alternativas:** Polling 1s (descartado: latencia, CPU).
- **Estado:** Aceptado.

## ADR-011 — Testing: vitest (Angular) + go test/ testify + playwright e2e + buf CI

- **Contexto:** Confianza, maintainability, modern UX.
- **Decisión:** Angular `vitest` (`@testing-library/angular`, `jsdom`, mock `window.gitClientApi`); Go `go test -race` + `testify` + `bufconn` gRPC + repo temp real; SQLite `:memory:`; `testcontainers` opcional; Playwright Electron `launch`; `tools/ci/verify-contracts.sh` `buf lint/breaking`; coverage 80%; CI matrix 3 OS.
- **Consecuencias:** + pirámide equilibrada; + `buf breaking` previene drift; − Playwright Electron setup.
- **Alternativas:** Karma/Jest (descartado: vitest más rápido Vite), Cypress (descartado: Playwright mejor Electron).
- **Estado:** Aceptado.

## ADR-012 — Estilo: Angular latest stable Signals zoneless + SCSS + TypeScript strict

- **Contexto:** Modern UX, performance, maintainability.
- **Decisión:** Angular `^21` `standalone` `zoneless` `signals` + `signalStore` por feature; SCSS; `strict: true`; `libs/ui-kit` dumb components.
- **Consecuencias:** + reactivity sin Zone; + signals fine-grained; − zoneless requiere `provideZonelessChangeDetection` awareness.
- **Estado:** Aceptado.

---

> Todas las ADRs tienen traceability a `architecture.md`, `ipc-strategy.md`, `service-design.md`, `domain-model.md`, y skeleton físico (`supervisor.ts`, `main.go`, `preload.ts`, `*.proto`, `001_initial.sql`).
