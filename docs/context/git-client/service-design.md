# Diseño de servicios — Go + Angular

## 1. Servicios Go (`apps/go-core/internal/service`)

Hexagonal: services orquestan ports (`domain/*Port`), nunca detalles `adapter`.

### 1.1 RepoService

```go
type RepoService struct { repoPort RepoPort; gitPort GitPort }
func (s *RepoService) Open(ctx, fsPath) (*Repository, error) {
  // valida .git existe (git rev-parse --git-common-dir), normaliza, persiste repos table
}
func (s *RepoService) List(ctx) ([]Repository, error)
func (s *RepoService) Remove(ctx, id) error
```

- `Open` es idempotente: si `fs_path` ya existe, actualiza `last_opened_at`.
- `common_dir` resuelve worktrees (`git rev-parse --git-common-dir`).

### 1.2 GitService

```go
type GitService struct { gitPort GitPort; cachePort CachePort }
func (s *GitService) Status(ctx, repoID) ([]FileStatus, error)   // porcelain v2
func (s *GitService) Diff(ctx, repoID, from, to) (Diff, error)
func (s *GitService) Stage(ctx, repoID, paths) error
func (s *GitService) Unstage(ctx, repoID, paths) error
func (s *GitService) Commit(ctx, repoID, message, author) (*Commit, error)
func (s *GitService) Checkout(ctx, repoID, refName) error
func (s *GitService) Fetch/Push/Pull(ctx, repoID, remote, branch) (<-chan Progress, error) // streaming
```

- `Stage/Unstage` invalida `file_status` cache.
- `Commit` valida `message` no vacío, hook errors → `COMMIT_FAILED`.

### 1.3 GraphService (commit graph + lanes)

**Problema:** miles de commits, grafo con merges/crossovers, render <100ms para 50k.

```go
type GraphService struct { gitPort GitPort; cachePort CachePort }
func (s *GraphService) Commits(ctx, repoID, offset, limit) ([]Commit, int, error) {
  if cached, ok := cachePort.GetCommits(repoID, offset, limit); ok { return cached }
  commits, total, err := gitPort.List(offset, limit)
  cachePort.SetCommits(repoID, offset, commits)
  return commits, total, err
}
func (s *GraphService) Lanes(ctx, repoID, commits []Commit) ([]Lane, error)
```

**Algoritmo lanes (equivalente `git log --graph`):**
- Input: commits topológicamente ordenados (`git log --topo-order` o `git rev-list`).
- Estado: `lanes[]` slots (columnas), `nextFree` pool, `commitToLane` map.
- Por cada commit:
  1. Asigna lane: si commit es hijo directo del anterior en mismo lane → reuse; si merge → abre nueva lane; si orphan → `nextFree`.
  2. Para cada parent, asigna lane continuada; si múltiples parents (merge), las lanes extra continúan.
  3. Cierra lanes que no tienen commit vivo.
- Complejidad O(n * avgParents) ~ O(n).
- Output `Lane{Index, Color, Continues}` por commit, que Angular usa para dibujar líneas.

**Alternativa considerada:** derivar lanes en Angular; descartada — 50k commits bloquea main thread; Go lo hace <50ms.

### 1.4 CacheService

```go
type CacheService struct { store CachePort /* SQLite */ }
func (c *CacheService) GetCommits(repoID, offset, limit) ([]Commit, bool)
func (c *CacheService) SetCommits(repoID, offset, commits)
func (c *CacheService) Invalidate(repoID) // on fs:changed / HEAD move
```

- LRU window: cache solo ventana visible `200 + 100 prefetch` (ver §3).
- `commit_cache` index `(repo_id, committed_at DESC)` para `ORDER BY committed_at DESC LIMIT ? OFFSET ?`.
- Invalida en `WatcherService` event o `Commit`/`Checkout`/`Fetch` success.

### 1.5 WatcherService

```go
type WatcherService struct { watcherPort WatcherPort; cachePort CachePort; bus EventBus }
func (s *WatcherService) Watch(repoID) (<-chan FsChangedEvent, error) {
  ch, _ := watcherPort.Watch(repoID) // fsnotify .git/HEAD, refs/, index
  go func(){
    debounced := coalesce(ch, 200*time.Millisecond, 300*time.Millisecond) // debounce + coalescing
    for ev := range debounced {
      if isLockFile(ev.Paths) { continue } // .git/index.lock guard
      cachePort.Invalidate(repoID)
      bus.Publish(FsChangedEvent{RepoId: repoID, Paths: ev.Paths})
    }
  }()
  return ch
}
```

- `adapter/watcher/watcher.go` usa `fsnotify` (o `notify` cross-platform), debounce 150-300ms, coalescing burst, filtro `index.lock`.
- Evento wire: `FsChangedEvent{repo_id, paths}` vía `Watch` streaming gRPC → Electron `fs:changed` → Angular `onFsChanged`.

## 2. Angular — Signals stores (`apps/angular/src/app`)

### 2.1 IpcBridge (core)

`core/services/ipc-bridge.service.ts` — wrapper tipado sobre `window.gitClientApi` (ver `ipc-strategy.md §1.2`). Generado `gen/ts` reemplazará `unknown`.

```ts
@Injectable({providedIn:'root'})
export class IpcBridge {
  invoke<K extends keyof GitClientApi>(method:K, req:Params<K>):ReturnType<K>{
    if(!window.gitClientApi) throw {code:'IPC_UNAVAILABLE'} as AppError;
    return (window.gitClientApi[method] as Function)(req);
  }
  onFsChanged(cb:(p:unknown)=>void){ return window.gitClientApi.onFsChanged(cb); }
}
```

### 2.2 Stores (Signals)

Cada feature tiene un store standalone con `signal`, `computed`, `effect`.

**GraphStore** (`features/repo/graph/graph.store.ts` previsto):
```ts
export const GraphStore = signalStore(
  withState({ commits:[] as Commit[], lanes:[] as Lane[], total:0, offset:0, loading:false, error:null as AppError|null }),
  withComputed(({commits, lanes})=>({
    rows: computed(()=> commits().map((c,i)=> ({commit:c, lane:lanes()[i]}))),
    hasMore: computed(()=> commits().length < total()),
  })),
  withMethods((store, ipc=IpcBridge)=>({
    async loadWindow(repoId:string, offset:number, limit=200){
      store.loading.set(true);
      try{
        const {commits,total}= await ipc.invoke('getCommits',{repo_id:repoId, offset, limit});
        const lanes = computeLanes(commits); // o viene de Go
        patchState(store,{commits: [...store.commits(), ...commits], lanes, total});
      }catch(e){ store.error.set(e as AppError); } finally{ store.loading.set(false); }
    },
    async prefetch(repoId:string){ if(store.hasMore()) this.loadWindow(repoId, store.commits().length, 100); }
  }))
);
```

- **Windowed pagination:** ventana inicial `200`, prefetch `100` al scrollear, infinite scroll con `IntersectionObserver` + CDK `ScrollingModule` o `cdk-virtual-scroll-viewport` (o canvas para 50k).
- **Virtualization:** `@angular/cdk/scrolling` `*cdkVirtualFor` row height fixed (28px) → DOM solo ~30 filas visibles; lanes dibujadas con SVG/canvas por `libs/ui-kit/graph-row`.

**StatusStore:**
```ts
withState({ files:[] as FileStatus[], loading:false })
withMethods((store,ipc)=>({
  async refresh(repoId:string){ store.files.set(await ipc.invoke('getStatus',{repo_id:repoId}).then(r=>r.files)); },
  async stage(repoId:string, paths:string[]){ await ipc.invoke('stage',{repo_id:repoId, paths}); await this.refresh(repoId); },
}))
// onFsChanged → debounce 200ms → refresh
```

**DiffStore:**
```ts
withState({ diff:null as Diff|null, loading:false, mode:'side-by-side' as 'side-by-side'|'unified' })
// Monaco diff viewer: large file guard → chunking/worker si >1MB o >5000 líneas
```

**RepoStore (global):**
```ts
withState({ repos:[] as Repository[], currentId:null as string|null })
```

**Branch/Tag/Stash stores** similares.

### 2.3 Cache en frontend

- Angular no cachea commits más allá de `GraphStore` memory (LRU 300). Source of truth cache es Go+SQLite; renderer invalida en `onFsChanged`/`onRepoChanged`.
- Opcional `localStorage` para UI-state (panel sizes, theme) — no Git data.

## 3. Estrategia de paginación y cache

```
User scroll ──▶ GraphStore.loadWindow(offset, limit=200)
                │ hit? → memory
                ▼ miss
            IpcBridge → Go GraphService → CachePort.GetCommits
                                            │ hit → SQLite commit_cache
                                            ▼ miss
                                          GitPort.List (git log offset/limit)
                                            → CachePort.SetCommits → response
            ──▶ lanes computed (Go o TS) ──▶ virtual scroll render
            ──▶ prefetch 100 on near-bottom
Watcher FsChangedEvent ──▶ Cache.invalidate(repoId) ──▶ GraphStore reload window 0..200
```

- `StreamCommits` para stream continuo alternativo (gRPC server streaming) si cliente quiere push.
- `total` se usa para scrollbar virtual height (`total * rowHeight`).

## 4. Watchers — coalescing

```
fsnotify .git/HEAD, refs/*, index, .git/logs/HEAD
  ──200ms debounce──▶ coalesce burst ──▶ FsChangedEvent{paths}
                     (si solo index.lock → ignore)
                                  ──▶ Go Cache.invalidate → gRPC Watch push → Electron → Angular → StatusStore.refresh + GraphStore.reload
```

Ventana 150-300ms tunable en `watcher/config.go`.

## 5. Manejo de errores y progreso

- Cada store expone `error: AppError | null` → toast.
- `Fetch/Push/Pull` progress: Angular suscribe `onProgress` → progress bar + log streaming; Go envía `Progress{percent,message}` cada chunk.
- `QUEUE_FULL`/`GO_CORE_UNAVAILABLE` → retry con backoff + banner.

## 6. Testing ganchos (ver testing-strategy.md)

- Stores testeables sin Electron: mock `window.gitClientApi` global.
- Services Go testeables con `MockGitPort`, `MockCachePort`.
- `GraphService.Lanes` unit tests con fixtures DAG pequeños.
```
