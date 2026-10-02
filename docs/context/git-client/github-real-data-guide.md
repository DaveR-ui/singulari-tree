# GitHub como fuente de datos real — conexión vía `gh` CLI

> **Plan de diseño para validación humana antes de implementar.** Este documento NO describe código existente: propone un diseño y sus adiciones de contrato. Nada aquí debe implementarse hasta que un humano apruebe la sección 11. Convive con los docs legacy de `git-client/` (sin frontmatter, excluidos del validador).

## 1. Objetivo y alcance

Conectar SingulariTree a GitHub usando el **CLI `gh` como fuente de token** y obtener **los repositorios de la cuenta autenticada como datos reales** (no mock), más las adiciones de contrato proto necesarias.

**Incluido:**

- Diseño del flujo end-to-end Angular → Electron → Go core → `api.github.com`.
- Adiciones **aditivas** a `libs/contracts/proto/auth.proto` y `libs/contracts/proto/errors.proto`.
- Plan de migración del renderer de datos mock a datos reales.
- Resolución documentada de los hot spots de diseño (sección 7).

**Explícitamente fuera (ver sección 9):**

- Implementación de adapters, IPC, handlers o renderer (solo diseño).
- Regeneración de stubs `gen/{go,ts}`.
- OAuth app flow (solo evolución futura, no esta iteración).
- Migración SQLite y wiring de `buf` en CI.

Referencias hermanas: flujo OAuth y endpoints/códigos de error reutilizados en [`./github-oauth-guide.md`](./github-oauth-guide.md); transporte IPC en [`./ipc-strategy.md`](./ipc-strategy.md); puertos hexagonales en [`./service-design.md`](./service-design.md) y [`./domain-model.md`](./domain-model.md).

## 2. Decisiones congeladas (input humano)

Estas decisiones ya fueron tomadas por el humano y son restricciones de entrada, no propuestas a debatir.

| Decisión | Valor congelado |
|---|---|
| Fuente de token | CLI `gh` — token obtenido con `gh auth token` (sin OAuth app). |
| Cuenta objetivo | `DaveR-ui` (cuenta autenticada en la máquina local). |
| Scopes del token | `gist, read:org, repo, workflow` — **sin** `read:user`. |
| OAuth app flow | Fuera de esta iteración; solo evolución futura. |
| Alcance de datos | Repositorios de la cuenta autenticada (`GET /user/repos`), no repos de terceros. |

No se persisten secretos en código, docs ni logs: el token vive en memoria en el Go core y nunca se serializa al renderer.

## 3. Flujo end-to-end

Canal IPC propuesto `auth:*`, simétrico al `git:*` existente. El dueño de la red es el Go core: Electron nunca llama a GitHub.

| # | Acción Angular | Canal IPC (`auth:*`) | Electron | Go core | Red | Slice |
|---|---|---|---|---|---|---|
| 1 | `GithubAccountStore.connect()` en `apps/angular/src/app/features/github-account/github-account.store.ts` (nuevo) llama a `IpcBridge` | `auth:connectGitHubFromCLI` | — | — | — | renderer |
| 2 | `IpcBridge.invoke('auth:connectGitHubFromCLI', {ghBinary:'gh', verify:true})` en `apps/angular/src/app/core/services/ipc-bridge.service.ts` | `auth:connectGitHubFromCLI` | — | — | — | renderer |
| 3 | — | — | `preload.ts` expone el método en `GitClientApi` (`apps/electron/src/preload/preload.ts`) | — | — | desktop-shell |
| 4 | — | — | `channels.ts` declara `auth:*` + `CHANNEL_TO_RPC` (`apps/electron/src/ipc/channels.ts`) | — | — | desktop-shell |
| 5 | — | — | `handlers.ts` valida y reenvía (`apps/electron/src/ipc/handlers.ts`) | — | — | desktop-shell |
| 6 | — | — | `supervisor.forwardToGo()` dispatch gRPC (`apps/electron/src/main/supervisor.ts`) | — | — | desktop-shell |
| 7 | — | — | `go-core-client.ts` construye además el cliente `Auth` (`apps/electron/src/main/go-core-client.ts`) | — | — | desktop-shell |
| 8 | — | — | — | `AuthService.ConnectFromCLI()` (`apps/go-core/internal/service/auth_service.go`, nuevo) | — | core |
| 9 | — | — | — | `TokenSource.Token()` vía `apps/go-core/internal/adapter/ghcli/` (nuevo) ejecuta `gh auth token` | — | core |
| 10 | — | — | — | `AuthPort.GetUser()` / `ListRepos()` en `apps/go-core/internal/adapter/github/` (nuevo) detrás de `domain.AuthPort` (`apps/go-core/internal/domain/auth.go`) | `GET https://api.github.com/user` y `GET /user/repos` | core |
| 11 | — | — | — | `grpc.AuthServer` registrado en `apps/go-core/internal/adapter/grpc/server.go` (gap actual, ver §5) | — | core |

**Camino de retorno:** `api.github.com` → `adapter/github` (parseo + `ETag`/rate limit) → `AuthService` → respuesta gRPC `singularitree.v1.Auth` → `go-core-client.ts` → `supervisor` → `handlers.ts` → `preload.ts` → `IpcBridge` → señales de `GithubAccountStore` → UI.

## 4. Endpoints GitHub

| Endpoint | Uso | Parámetros / notas |
|---|---|---|
| `GET https://api.github.com/user` | Perfil de la cuenta autenticada | Sin params. Requiere token. `email` puede venir vacío (ver §8). |
| `GET https://api.github.com/user/repos` | Repositorios de la cuenta | Query: `per_page`, `page`, `sort` (`created`\|`updated`\|`pushed`\|`full_name`), `direction` (`asc`\|`desc`), `affiliation` (`owner,collaborator,organization_member`), `visibility` (`all`\|`public`\|`private`), `type` (`all`\|`owner`\|`public`\|`private`\|`member`). |
| `GET https://api.github.com/rate_limit` (opcional) | Snapshot de cuota sin gastar request de datos | Útil para precargar `X-RateLimit-*` cuando no hay respuesta previa. |

**Paginación (Link header):** la respuesta de `user/repos` incluye `Link: <...&page=2>; rel="next"`. El adapter parsea `rel="next"` y lo expone como `PageInfo.next_page` + `PageInfo.has_more`. Ausencia de `rel="next"` ⇒ `next_page=0`, `has_more=false`.

**Rate limits:** headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (epoch) y, en 403/429 con abuso secundario, `Retry-After`. Se mapean a `RateLimit{resource, limit, remaining, reset, reset_at}`; `reset` es epoch y `reset_at` es ISO-8601.

**Requests condicionales:** guardar el `ETag` de la última respuesta por usuario y enviar `If-None-Match`; `304 Not Modified` reutiliza el payload cacheado y no descuenta cuota contra el límite primario.

**Hogar de implementación:** `apps/go-core/internal/adapter/github/` implementa `domain.AuthPort` y `TokenStore`; `apps/go-core/internal/adapter/ghcli/` implementa el `TokenSource`. Endpoints y códigos de error reutilizados se documentan en [`./github-oauth-guide.md`](./github-oauth-guide.md).

## 5. Adiciones de contrato propuestas (proto)

Todas las adiciones son **aditivas** (`append` de campos nuevos, nunca reutilizar números ni renombrar). **`gen/{go,ts}` NO se regenera en esta iteración**: los stubs actuales siguen gobernando el wire hasta una aprobación separada con `buf generate`.

### 5.1 `libs/contracts/proto/auth.proto`

`service Auth`: agregar RPC; los RPC OAuth existentes se retienen.

```proto
service Auth {
  // ... RPC actuales (GetAuthStatus, StartGitHubOAuth, ExchangeCode, GetGitHubUser, ListGitHubRepos, Logout) se conservan ...
  rpc ConnectGitHubFromCLI(ConnectGitHubFromCLIRequest) returns (ConnectGitHubFromCLIResponse); // NUEVO
}
```

`GetAuthStatusResponse`: adicionar campo 3; 1-2 se retienen.

```proto
message GetAuthStatusResponse {
  bool authenticated = 1; // retenido
  string login = 2;       // retenido
  AuthStatus status = 3;  // NUEVO
}
```

`ListGitHubReposRequest`: adicionar 3-7; 1-2 se retienen.

```proto
message ListGitHubReposRequest {
  uint32 per_page = 1;                      // retenido
  uint32 page = 2;                          // retenido
  string sort = 3;                           // NUEVO: created|updated|pushed|full_name
  string direction = 4;                      // NUEVO: asc|desc
  string affiliation = 5;                    // NUEVO: owner,collaborator,organization_member
  string visibility = 6;                     // NUEVO: all|public|private
  string type = 7;                           // NUEVO: all|owner|public|private|member
}
```

`ListGitHubReposResponse`: adicionar 2-3; 1 se retiene.

```proto
message ListGitHubReposResponse {
  repeated GitHubRepo repos = 1; // retenido
  PageInfo page_info = 2;        // NUEVO
  RateLimit rate_limit = 3;      // NUEVO
}
```

`GitHubRepo`: adicionar campos 10-28; 1-9 se retienen.

```proto
message GitHubRepo {
  // 1-9 retenidos: id, name, full_name, private, html_url, description, language, stargazers_count, updated_at
  string node_id = 10;             // NUEVO
  string default_branch = 11;      // NUEVO
  string owner_login = 12;         // NUEVO
  string owner_avatar_url = 13;    // NUEVO
  string visibility = 14;          // NUEVO
  bool fork = 15;                  // NUEVO
  bool archived = 16;              // NUEVO
  bool disabled = 17;              // NUEVO
  string clone_url = 18;           // NUEVO
  string ssh_url = 19;             // NUEVO
  string git_url = 20;             // NUEVO
  string pushed_at = 21;           // NUEVO
  string created_at = 22;          // NUEVO
  int32 forks_count = 23;          // NUEVO
  int32 open_issues_count = 24;    // NUEVO
  repeated string topics = 25;     // NUEVO
  string license_spdx_id = 26;     // NUEVO
  bool is_template = 27;           // NUEVO
  string homepage = 28;            // NUEVO
}
```

Mensajes y enum nuevos de nivel top (sin colisión de números: `GitHubRepo` llega hasta 28; los mensajes nuevos son tipos independientes):

```proto
enum AuthSource {
  AUTH_SOURCE_UNSPECIFIED = 0;
  AUTH_SOURCE_NONE = 1;
  AUTH_SOURCE_GITHUB_CLI = 2;
  AUTH_SOURCE_OAUTH = 3;
}

message AuthStatus {
  bool authenticated = 1;
  AuthSource source = 2;
  string account_login = 3;
  string name = 4;
  string avatar_url = 5;
  string email = 6;              // opcional: puede venir vacío (ver §8)
  repeated string scopes = 7;
  RateLimit rate_limit = 8;
}

message ConnectGitHubFromCLIRequest {
  string gh_binary = 1;          // default "gh"
  bool verify = 2;               // si true, valida el token con GET /user
}

message ConnectGitHubFromCLIResponse {
  AuthStatus status = 1;
  GitHubUser user = 2;
}

message PageInfo {
  uint32 page = 1;
  uint32 per_page = 2;
  uint32 next_page = 3;          // 0 si no hay siguiente
  bool has_more = 4;
  uint32 total = 5;              // 0 si GitHub no lo provee
}

message RateLimit {
  string resource = 1;           // "core" | "search" | ...
  uint32 limit = 2;
  uint32 remaining = 3;
  int64 reset = 4;               // epoch segundos
  string reset_at = 5;           // ISO-8601
}
```

### 5.2 `libs/contracts/proto/errors.proto`

`ErrorCode`: adicionar 19-23; 0-18 se retienen.

```proto
enum ErrorCode {
  // 0-18 retenidos
  GH_CLI_NOT_FOUND = 19;
  GH_CLI_UNAUTHENTICATED = 20;
  GITHUB_RATE_LIMITED = 21;
  GITHUB_API_ERROR = 22;
  GITHUB_TOKEN_INVALID = 23;
}
```

### 5.3 Gap de wiring confirmado

Aunque `libs/contracts/gen/go/singularitree/v1/auth_grpc.pb.go` ya expone `RegisterAuthServer`, el servicio `Auth` **no está registrado**:

- `apps/go-core/internal/adapter/grpc/server.go` solo llama a `singularitreev1.RegisterGitCoreServer` (no hay `server.RegisterAuth` ni un `AuthServer` embebido).
- `apps/electron/src/main/go-core-client.ts` construye únicamente el cliente `singularitree.v1.GitCore` (`GIT_CORE_RPC_METHODS`, `GIT_CORE_PROTO_FILES`), sin cliente `Auth`.

Cerrar este gap es prerequisito de cualquier implementación y debe ir en un cambio aparte, tras aprobación. Los stubs actuales se usan tal cual; no se regeneran.

## 6. Cómo el renderer pasa a datos reales

**Estado actual (mock):**

- `apps/angular/src/app/core/layout/layout.ts` hardcodea `repoCards` (líneas ~69-74) y `commits` (~76-85); `layout.html` los renderiza (repo list en `.st-right__list`, graph en `.st-graph__rows`).
- `apps/angular/src/app/features/repo/data/mock-repos.ts` (+ re-export `apps/angular/src/app/features/repo/mock-data.ts`) está **huérfano**: ya no alimenta al layout ni al `GraphStore`.

**Plan propuesto:**

1. **Nueva vertical `apps/angular/src/app/features/github-account/`** — `github-account.store.ts` (señales `status`, `repos`, `pageInfo`, `rateLimit`, `loading`, `error`) + componente de cuenta que consume los canales `auth:*`. Es el único punto que habla con el `Auth` service (vía `IpcBridge`).
2. **Lista de repos del layout** — `LayoutComponent` deja `repoCards` y pasa a leer `RepoState.repos` (`apps/angular/src/app/core/services/repo-state.service.ts`, ya cableado a `git:listRepositories`). "Local repositories" = repos trackeados en el core (SQLite), NO la cuenta GitHub.
3. **Commit graph del layout** — reemplazar `commits` mock por `GraphStore` (`apps/angular/src/app/features/repo/graph/graph.store.ts`), que ya usa IPC real (`getCommits` + paginación por ventana).
4. **Eliminar mock huérfano** — borrar `features/repo/data/mock-repos.ts` y `features/repo/mock-data.ts` cuando ningún consumidor los referencie (borrado = acción humana, ver reglas de seguridad).

**Distinción explícita de vocabulario:**

| Concepto | Fuente | UI |
|---|---|---|
| **Local repositories** | `git:listRepositories` → `RepoState.repos` | Drawer derecho "Local repositories" |
| **GitHub account repos** | `auth:listGitHubRepos` → `GithubAccountStore.repos` | Nueva vista/drawer de cuenta |
| Commit graph | `git:getCommits` → `GraphStore` | Panel central de historial |

## 7. Hot spots y branch-map (resueltos)

| ID | Hot spot | Opciones evaluadas | Elegido | Rationale | Riesgo |
|---|---|---|---|---|---|
| **HS1** | Frontera de adquisición del token | `gh-cli-in-core` vs Electron lee `gh` vs renderer | **`gh-cli-in-core`** | El Go core es el único dueño de la red y del `TokenStore` in-memory; el token nunca cruza IPC al renderer. | Si `gh` no está instalado/autenticado → `GH_CLI_NOT_FOUND` / `GH_CLI_UNAUTHENTICATED`. |
| **HS2** | Forma de paginación | `page` solo vs `page + Link rel=next` vs cursor | **`page + link-next_page`** | GitHub pagina por `Link`; exponer `next_page`/`has_more` evita que el renderer adivine el fin de lista. | Proxies que reescriben `Link` romperían el parseo (fallback: `has_more` por longitud). |
| **HS3** | Estrategia de rate limit | reintento ciego vs `headers + ETag` vs backoff fijo | **`headers + etag-conditional-backoff`** | `X-RateLimit-*`/`Retry-After` + `If-None-Match` minimizan consumo y respetan cuotas. | Estado de `ETag` debe invalidarse al cambiar de cuenta (`GITHUB_TOKEN_INVALID`). |
| **HS4** | Dueño del cache | renderer vs Electron vs core en memoria vs SQLite | **`core-sqlite-metadata-cache`** | El core ya persiste metadata (repos); cachear ahí unifica y sobrevive reinicios. | **Implica una migración SQLite FUTURA, sujeta a aprobación separada**; esta iteración solo la declara. |

## 8. Supuesto oculto / caveat

Los scopes congelados (`gist, read:org, repo, workflow`) **omiten `read:user`**. Consecuencia: `GET https://api.github.com/user` puede devolver `email` vacío o nulo.

- El contrato trata `email` como **opcional** (`AuthStatus.email`, `GitHubUser.email` pueden ser `""`).
- La UI no debe asumir email presente; degradar a "no disponible".
- Opt-in posterior: `gh auth refresh -s read:user` para poblar el email. Fuera de esta iteración.

## 9. Fuera de alcance

- Implementación de adapters, IPC, handlers, supervisor o renderer.
- Regeneración de stubs `gen/go` y `gen/ts` (requiere `buf generate` y aprobación aparte).
- OAuth app flow (solo evolución futura; los RPC OAuth se conservan, no se cablean).
- Migración a SQLite como cache de metadata (ver HS4).
- Wiring de `buf` en CI.

## 10. Verificación

**Ahora (solo diseño):** ejecutar desde la raíz del repo; `buf` y `go` no están instalados en este entorno, así que hoy solo corren `protoc` + `node tools/docs/validate.js`.

```bash
protoc --proto_path=libs/contracts/proto --descriptor_set_out=/dev/null \
  domain.proto errors.proto auth.proto gitcore.proto                   # parse completo (gitcore importa domain)
node tools/docs/validate.js                                            # corpus (este doc está excluido)
```

**Tras validación humana e implementación (buf no instalado hoy):**

```bash
buf lint && buf generate                                              # contratos (cuando buf esté disponible)
cd apps/go-core && go vet ./... && go test ./...                      # core
npm run typecheck --workspace=@singularitree/electron && npm test     # desktop-shell
npm test --workspace=@singularitree/angular                           # renderer (vitest)
# e2e live: gh auth status && <connect> && listar repos reales sin error
```

## 11. Pendiente de validación humana

- Aprobar las adiciones de contrato de la sección 5 (numeración de campos y mensajes nuevos).
- Aprobar `gh-cli-in-core` como frontera de token (HS1) y `core-sqlite-metadata-cache` como dueño de cache (HS4, con su migración futura).
- Aprobar el mapeo de canales `auth:*` y la nueva vertical `features/github-account/`.
- Confirmar la decisión de NO regenerar `gen/{go,ts}` en esta iteración.
- Confirmar la distinción de vocabulario "local repositories" vs "GitHub account repos".
- Confirmar tratamiento opcional de `email` y el opt-in `gh auth refresh -s read:user` (sección 8).
- Aprobar el retiro de los mocks huérfanos como acción humana separada.

## 12. Revisión independiente (analista) — ajustes solicitados antes de implementar

Una segunda opinión independiente (modelo de otra familia) revisó este plan: **veredicto `revise`**, confianza 0.72. El diseño es direccionalmente correcto, pero exige seis ajustes antes de implementar. Se registran aquí para la validación humana.

1. **`gh` y el PATH del hijo (HS1).** El supervisor lanza go-core con `spawn(bin, args)` sin `env` explícito (`apps/electron/src/main/supervisor.ts`), por lo que el core hereda el entorno de Electron. En macOS lanzado desde Finder/Launcher, el PATH es el stub (`/usr/bin:/bin:/usr/sbin:/sbin`) y `gh` (Homebrew, `/opt/homebrew/bin`) no sería encontrado. Ajuste: añadir un knob de configuración `SINGULARITREE_GH_PATH` (patrón `getEnv` de `internal/config/config.go`, patrón de `gh_binary` ya en `ConnectGitHubFromCLIRequest`), incluir el PATH buscado en `error.details` de `GH_CLI_NOT_FOUND`, y una comprobación temprana para diagnosticar en los primeros segundos.
2. **Paginación (HS2).** `total` es incognoscible en `/user/repos` (no hay `X-Total-Count`). Ajuste: documentar `PageInfo.total` como "best-effort, 0 = desconocido" (ya anotado en proto §5), **fijar el default de `sort`** (`full_name`) para que los bordes de página sean estables, y notar que GitHub clampea `per_page` a 100.
3. **Corrección del cache/ETag (HS3+HS4).** Un `304` no trae cuerpo: hay que persistir de forma atómica `(clave, etag, body)`. Ajuste: honrar `304` solo si existe cuerpo para ese `etag`; **invalidar filas incluyendo los etags** al cambiar de cuenta/token; y **clavar la cache por cuenta** (`account_login`) para que un token nuevo no sirva datos de otra cuenta.
4. **Servicio `Auth` separado (HS1/HS6).** Se confirma como la opción de menor riesgo (aditiva; `auth.proto` ya declara `service Auth`). Ajuste de implementación: el refactor service-aware debe mantener verde el chequeo `satisfies Record<ChannelName, string>` de `channels.ts` para ambos servicios y no dejar caer `auth:*` en el guard `isStreamingRpc` (que es de forma GitCore); el segundo cliente debe seguir el mismo camino de reconexión (`supervisor.ts` → `connectClient`).
5. **Superficie de secreto.** `ExchangeCodeResponse.access_token` (`auth.proto` línea 42) permanece **sin cablear/no usada** en el flujo `gh`; declararlo explícitamente. Además, los `error.details` nunca deben volcar `stderr` crudo de `gh` (puede repetir el usuario): solo fields estructurados.
6. **Corrección de alcance (HS8/§6).** `LayoutComponent` es un shell **completamente estático** (tabs, árboles de sidebar y pane de diff hardcodeados, sin inyección de stores), no un consumidor delgado de `mock-repos.ts`. "Cambiar el layout a `RepoState`/`GraphStore`" es un esfuerzo a escala de feature y NO debe viajar en la misma vertical que el account linking. Retirar `features/repo/data/mock-repos.ts` es la limpieza trivial (verificar antes que ningún spec lo importe).

**Estado de la verificación independiente:** los cuatro hot spots siguen resueltos; el veredicto `revise` es de ajustes de diseño/alcance, no un abandono. La aprobación humana de §11 debe incorporar estos seis puntos.

## 13. Estado de implementación

El plan §1-§12 fue **aprobado e implementado end-to-end** en esta iteración, con los ajustes de §12 aplicados; este documento deja de ser solo diseño.

| Área | Estado |
|---|---|
| Contratos proto | Adiciones **aditivas** a `auth.proto` (§5.1) y `errors.proto` (§5.2) + regeneración de `gen/{go,ts}` vía `buf generate`. |
| Go core — servicio `Auth` | `RegisterAuthServer` registrado junto a `GitCore` en `apps/go-core/internal/adapter/grpc/server.go`. |
| Go core — token | Token vía `gh auth token` en `apps/go-core/internal/adapter/ghcli/`, con el knob `SINGULARITREE_GH_PATH` (§12.1). |
| Go core — REST GitHub | `apps/go-core/internal/adapter/github/`: paginación por `Link rel="next"`, rate-limit por headers y cache **ETag in-memory**. |
| Go core — servicio | `AuthService` (`apps/go-core/internal/service/auth_service.go`). |
| Electron | Segundo cliente gRPC `Auth` + canales `auth:*` **no-streaming** (no caen en el guard `isStreamingRpc` de GitCore). |
| Renderer | Vertical `features/github-account/` con los cuatro métodos del bridge. |
| Limpieza | Mocks huérfanos `features/repo/data/mock-repos.ts` + `mock-data.ts` retirados. |

**Ajustes de §12 aplicados:**

1. **(a) `gh` y PATH del hijo** — resolución de `gh` con el knob `SINGULARITREE_GH_PATH`; `GH_CLI_NOT_FOUND.details` incluye el PATH buscado.
2. **(b) Paginación** — `PageInfo.total` best-effort (`0` = desconocido); default de `sort` = `full_name`; `per_page` clampeado a 100 por GitHub.
3. **(c) Cache/ETag** — `304` honrado solo con cuerpo para ese `etag`; cache clavada por `account_login` e invalidada al cambiar de token.
4. **(d) Servicio `Auth` separado** — el `satisfies Record<ChannelName, string>` de `channels.ts` se mantiene verde para ambos servicios; el segundo cliente sigue el mismo camino de reconexión (`supervisor.ts` → `connectClient`).
5. **(e) Superficie de secreto** — `ExchangeCodeResponse.access_token` sin cablear; `error.details` solo con fields estructurados (nunca `stderr` crudo de `gh`).
6. **(f) Alcance** — la migración del shell/mocks se separa de la vertical de account linking (ver deuda).

**Diferido / deuda aceptada:**

- **Migración SQLite (HS4)** para persistir el cache ETag: esta iteración usa cache **in-memory** con `TODO(HS4)`, sujeta a aprobación separada.
- **Migración de `LayoutComponent`/static shell a `RepoState`/`GraphStore`** (§12f): el outlet del shell sigue oculto; la vertical se alcanza en `/github-account`.
- **Flujo OAuth app** y `ExchangeCodeResponse.access_token` permanecen sin cablear.
- **Resolución de `gh` en Windows**: el chequeo de bit ejecutable POSIX es poco fiable; revisar al empaquetar.

**Verificación canónica ejecutada (todo verde):**

```bash
./tools/ci/verify-contracts.sh
cd apps/go-core && go vet ./... && go test ./...
npm run typecheck --workspace=@singularitree/electron && npm test --workspace=@singularitree/electron
npm test --workspace=@singularitree/angular
node tools/docs/validate.js
```
