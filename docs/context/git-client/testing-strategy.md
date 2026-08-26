# Estrategia de Testing

## 1. Pirámide

```
e2e (playwright)  5%
integration (testcontainers, real Git repo) 15%
unit (vitest / go test) 80%
```

## 2. Angular (vitest)

- **Runner:** `vitest` (Vite) — `apps/angular` con `environment: 'jsdom'`.
- **Matchers:** `@testing-library/angular` + `expect`.
- **Mocks:** `window.gitClientApi` mockeado globalmente; `IpcBridge` spy.
- **Stores:** test sin DOM:
  ```ts
  beforeEach(()=> (globalThis as any).window = {gitClientApi: mockApi});
  it('GraphStore loads window', async()=>{
    mockApi.getCommits.mockResolvedValue({commits: fixtures, total: 1000});
    await store.loadWindow('repo-1', 0, 200);
    expect(store.commits().length).toBe(200);
  });
  ```
- **Components:** `render(RepoPage)` con `graph-row` stub, `cdkVirtualScroll` mock, Monaco mock (`monaco-editor` es pesado: `vi.mock('monaco-editor')`).
- **Coverage:** `vitest --coverage` (v8), threshold 80% statements.

Config `apps/angular/vite.config.ts` + `setupFiles: ['src/test-setup.ts']`.

## 3. Go core (go test + testify)

- **Runner:** `go test ./...` con `testify/assert` + `require`.
- **Domain:** puros, sin IO:
  ```go
  func TestNewOid(t *testing.T){
    _, err := domain.NewOid("abc"); assert.ErrorIs(t, err, domain.ErrInvalidOid)
  }
  ```
- **Services:** ports mockeados (interfaces `GitPort`, `CachePort`):
  ```go
  type MockGitPort struct{ commits []domain.Commit }
  func (m *MockGitPort) List(ctx, repoID, off, lim) ... { return m.commits[off:lim], len(m.commits), nil }
  func TestGraphService_Lanes(t *testing.T){
    svc := service.NewGraphService(&MockGitPort{...}, nil)
    lanes, _ := svc.Lanes(ctx, repoID, commits)
    assert.Len(t, lanes, len(commits))
  }
  ```
- **Adapters:** `adapter/git` tests con repo temporal real (`t.TempDir()` + `git init` + commits fixture) — no mock.
- **SQLite:** `repository` tests con `modernc.org/sqlite` in-memory (`:memory:`) + migrations aplicadas; testcontainers opcional para ephemerality.
- **gRPC:** `buf` stubs + `grpc/test` (`google.golang.org/grpc/test/bufconn`) — test `GitCore` server sin TCP.

Comando canónico (desde `apps/go-core`):
```bash
go test ./... -race -count=1
go vet ./...
```

## 4. Integración (testcontainers / repos reales)

- **testcontainers-go** para SQLite no necesario (file); para Git usa repo fixture:
  ```bash
  mkdir -p /tmp/test-repo && cd /tmp/test-repo && git init && git config user.email test@example.com
  ```
- **Grafo grande:** script `tools/scripts/gen-large-repo.sh` (genera repo 50k commits sintéticos) para perf test `Lanes` <100ms.
- **Watcher:** `fsnotify` test con `os.WriteFile` + eventual assertion `FsChangedEvent` emitido (flaky → retry).

## 5. E2E (Playwright)

- **Scope:** `apps/angular` + `apps/electron` + `apps/go-core --headless` real.
- **Fixtures:** Playwright `electron` launcher:
  ```ts
  import { _electron as electron } from 'playwright';
  const app = await electron.launch({ args: ['apps/electron/dist/main.js'] });
  const page = await app.firstWindow();
  await page.getByTestId('repo-list').click();
  await expect(page.getByTestId('graph-row')).toHaveCount(20);
  ```
- **Casos:** open repo, graph scroll+prefetch, stage/commit, diff Monaco, branch checkout, fetch progress bar.
- **CI:** `playwright test` en `ubuntu` + `windows` + `macos` matrix; artifact `trace.zip`.

## 6. Contratos

- **buf lint/breaking:** `tools/ci/verify-contracts.sh`:
  ```bash
  buf lint
  buf breaking --against '.git#branch=main'
  buf generate --dry-run
  ```
- **Gen drift check:** CI falla si `gen/go` o `gen/ts` desactualizados.

## 7. Performance / Large repo

- Benchmark `go test -bench=BenchmarkLanes` para 50k commits.
- Angular perf: `vitest` bench virtual scroll 1000 rows (row render <2ms).

## 8. CI (previsto)

```yaml
- run: buf lint && buf breaking
- run: go vet ./... && go test ./... -race -count=1   # in apps/go-core
- run: npm test --workspace=@singularitree/angular -- --coverage
- run: npm run build --workspaces
- run: npx playwright test
```

## 9. Matriz mínima MVP

| Área | Unit | Integration | E2E |
|------|------|-------------|-----|
| Domain Oid/Repo | ✓ |  |  |
| Graph Lanes | ✓ (fixture DAG) | ✓ (large repo 50k) |  |
| Cache (SQLite) | ✓ (in-memory) | ✓ (WAL) |  |
| Watcher debounce | ✓ (mock) | ✓ (real fsnotify) |  |
| IpcBridge | ✓ (mock window) |  | ✓ |
| GraphStore pagination | ✓ |  | ✓ (scroll) |
| Diff Monaco | ✓ (mock) |  | ✓ (render) |
| Supervisor restart |  | ✓ (kill Go, queue) |  |

## 10. Qué no testear en MVP

- Remotos reales push/fetch contra GitHub (mock `GitPort`); e2e contra fixture local.
- SSH auth (V1).
