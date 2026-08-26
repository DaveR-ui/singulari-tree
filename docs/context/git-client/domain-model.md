# Modelo de dominio — Entidades, VOs, Agregados, SQLite, Errores

> Fuente de verdad código: `apps/go-core/internal/domain/*.go` + `libs/contracts/proto/domain.proto` + `data/sqlite/migrations/001_initial.sql`.

## 1. Agregados y raíces

### 1.1 Repository (Aggregate Root)

**Entidad:** `Repository` — `apps/go-core/internal/domain/repository.go`

```go
type RepositoryId string // UUID v4 local, no es Git OID
type Repository struct {
  ID           RepositoryId
  FsPath       string    // absolute, normalized (filepath.Abs)
  CommonDir    string    // .git/commonDir (worktree-aware)
  Name         string    // basename(FsPath) por defecto
  CreatedAt    time.Time
  LastOpenedAt time.Time
}
```

**Invariantes:**
- `FsPath` requerido y normalizado; `CommonDir` default `FsPath/.git`.
- `ID` UUID v4 local (no derivado de Git).
- Un `Repository` agrupa branches, commits (vía cache), status, worktrees, stashes (proyecciones desde Git).

**Ports:**
```go
type RepoPort interface {
  Open(ctx, fsPath) (*Repository, error)
  List(ctx) ([]Repository, error)
  Remove(ctx, id) error
  Get(ctx, id) (*Repository, error)
}
```

Proto `domain.proto: Repository { id, fs_path, common_dir, name, created_at, last_opened_at }`.

### 1.2 Commit (Immutable DAG Entity)

```go
type Oid struct { Hex string; Kind string } // SHA1 40 / SHA256 64 hex, regex ^[0-9a-f]{40,64}$
type Signature struct { Name, Email string; When time.Time }
type Commit struct {
  Oid         Oid
  Parents     []Oid
  Author      Signature
  Committer   Signature
  Message     string
  TreeOid     Oid
  CommittedAt time.Time
}
type Lane struct { Index, Color int; Continues bool } // lane assignment output
```

**Invariantes:** Oid validado `NewOid(hex)`, parents inmutable, message puede contener conflict markers (expuestos en Diff).

Ports:
```go
type CommitPort interface {
  Get(ctx, repoID, oid) (*Commit, error)
  List(ctx, repoID, offset, limit) ([]Commit, int, error)
}
type CachePort interface { GetCommits / SetCommits / Invalidate }
```

### 1.3 Otras entidades (proyecciones Git)

| Entidad | Archivo | Proto | Campos clave | Notas |
|---------|---------|-------|--------------|-------|
| `Branch` | `branch.go` | `Branch` | `name, ref_name, tip:Oid, upstream, is_current, is_remote` | Local vs remota (`refs/heads` vs `refs/remotes`) |
| `Remote` | `remote.go` | `Remote` | `name, urls[], fetch_specs[]` | `git remote -v` |
| `Tag` | `tag.go` | `Tag` | `name, ref_name, target:Oid, tagger?, message?, annotated` | Ligera vs anotada |
| `Stash` | `stash.go` | `Stash` | `index, oid, message, branch_name?` | `refs/stash` reflog |
| `Worktree` | `worktree.go` | `Worktree` | `fs_path, branch?, head:Oid, is_main` | `git worktree list` |
| `Diff/Hunk/DiffLine` | `diff.go` | `Diff, Hunk, DiffLine` | `from,to Oid, hunks[], additions, deletions, is_binary, has_conflict_markers` | Monaco render |
| `FileStatus` | `diff.go` + proto | `FileStatus` | `path, staged, unstaged, is_staged, is_conflicted` | porcelain v2 |

Value Objects: `Oid`, `Signature`, `RefName{raw}`, `DiffLine{kind,text,no_newline}`, `Hunk`, `FileStatus`.

## 2. Diagrama ER (conceptual)

```mermaid
erDiagram
  REPOSITORY ||--o{ COMMIT_CACHE : caches
  REPOSITORY ||--o{ FILE_STATUS : has
  REPOSITORY ||--o{ STASH_CACHE : caches
  REPOSITORY {
    string id PK
    string fs_path UNIQUE
    string common_dir
    string name
    string created_at
    string last_opened_at
  }
  COMMIT_CACHE {
    string repo_id FK
    string oid PK
    string parents
    string author_name
    string author_email
    string committed_at
  }
  FILE_STATUS {
    string repo_id FK
    string path PK
    string staged
    string unstaged
    bool is_staged
    bool is_conflicted
  }
```

Git objects (branches, tags, stashes, worktrees, diffs) **no** se persisten como tablas propias — se leen live desde `.git`; cache opcional en `commit_cache`/`stash_cache` para ventana visible.

## 3. Schema SQLite (`data/sqlite/migrations/001_initial.sql`)

**Principios:** solo metadata cache/UI-state/config — nunca Git data. WAL + `synchronous=NORMAL` + `foreign_keys=ON`. DB per-user: `~/.local/share/singularitree/cache.db` (Linux), `~/Library/Application Support/...` (macOS), `%APPDATA%` (Windows). Migrations idempotentes (`IF NOT EXISTS`).

```sql
-- PRAGMAs al abrir: journal_mode=WAL; synchronous=NORMAL; foreign_keys=ON;

CREATE TABLE IF NOT EXISTS repos (
  id              TEXT PRIMARY KEY,
  fs_path         TEXT NOT NULL UNIQUE,
  common_dir      TEXT NOT NULL,
  name            TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  last_opened_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commit_cache (
  repo_id         TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  oid             TEXT NOT NULL,
  parents         TEXT NOT NULL, -- JSON array hex
  author_name     TEXT NOT NULL,
  author_email    TEXT NOT NULL,
  author_when     TEXT NOT NULL, -- RFC3339
  committer_name  TEXT NOT NULL,
  committer_email TEXT NOT NULL,
  committer_when  TEXT NOT NULL,
  message         TEXT NOT NULL,
  tree_oid        TEXT NOT NULL,
  committed_at    TEXT NOT NULL, -- RFC3339
  PRIMARY KEY (repo_id, oid)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS file_status (
  repo_id       TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  path          TEXT NOT NULL,
  staged        TEXT NOT NULL,
  unstaged      TEXT NOT NULL,
  is_staged     INTEGER NOT NULL,
  is_conflicted INTEGER NOT NULL,
  PRIMARY KEY (repo_id, path)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS stash_cache (
  repo_id     TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  stash_index INTEGER NOT NULL,
  oid         TEXT NOT NULL,
  message     TEXT NOT NULL,
  branch_name TEXT,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (repo_id, stash_index)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_commit_cache_when ON commit_cache(repo_id, committed_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_status_repo ON file_status(repo_id);
```

**Worktrees/branches/tags** no tienen tabla — se enumeran vía `GitPort`; si se necesita cache de recents/favorites/prefs/UI-state, añadir en migración `002`:

```sql
-- previsto 002_prefs.sql
CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE recent_repos (repo_id TEXT PRIMARY KEY REFERENCES repos(id), opened_at TEXT);
CREATE TABLE favorites (repo_id TEXT PRIMARY KEY REFERENCES repos(id));
```

Operaciones repository: `repo_store.go` usa `database/sql` con `modernc.org/sqlite` (pure Go, sin CGO) o `mattn/go-sqlite3`.

## 4. Contratos proto ↔ dominio

| Dominio Go | Proto | Conversión |
|------------|-------|------------|
| `Oid{Hex,Kind}` | `Oid{hex,kind}` | `NewOid` valida regex |
| `Signature{Name,Email,When time.Time}` | `Signature{name,email,when RFC3339}` | `time.RFC3339` |
| `Commit{...}` | `Commit{oid, parents[], author, committer, message, tree_oid, committed_at}` | directo |
| `Branch` | `Branch{name, ref_name, tip, upstream, is_current, is_remote}` | `ref_name = RefName.raw` |
| `Diff` | `Diff{from,to,hunks,additions,deletions,is_binary,has_conflict_markers}` | hunks agregados |

Generación: `buf generate --template buf.gen.yaml` → `libs/contracts/gen/go/singularitree/v1` + `gen/ts`.

## 5. Errores (errors.go + errors.proto)

`AppError{Code, Message, Details map[string]string}` — envelope uniforme.

**Códigos canónicos (`errors.proto: ErrorCode` + `domain/errors.go`):**

| Code string | Enum | Cuándo | HTTP map (fallback) |
|-------------|------|--------|---------------------|
| `REPO_NOT_FOUND` | 1 | repo id no existe | 404 |
| `NOT_A_GIT_REPO` | 2 | `Open` path sin `.git` | 400 |
| `COMMIT_NOT_FOUND` | 3 | oid no existe en DAG | 404 |
| `INVALID_OID` | 4 | hex no match regex | 400 |
| `BRANCH_NOT_FOUND` | 5 | checkout/merge branch miss | 404 |
| `BRANCH_EXISTS` | 6 | create collision | 409 |
| `DETACHED_HEAD` | 7 | HEAD detached | 409 |
| `IPC_UNAVAILABLE` | 8 | Electron no disponible | 503 |
| `GO_CORE_UNAVAILABLE` | 9 | gRPC down | 503 |
| `QUEUE_FULL` | 10 | supervisor queue 100 | 429 |
| `STAGE_FAILED` | 11 | `git add` fail | 422 |
| `COMMIT_FAILED` | 12 | commit hook/fail | 422 |
| `CHECKOUT_FAILED` | 13 | checkout conflict | 422 |
| `FETCH_FAILED` | 14 | fetch network | 502 |
| `PUSH_FAILED` | 15 | push rejected | 502 |
| `DIFF_FAILED` | 16 | diff binary/too large | 422 |
| `WATCH_FAILED` | 17 | fsnotify error | 500 |
| `UNAUTHENTICATED` | 18 | token mismatch | 401 |

Wire: `AppError` message en gRPC `Status.details` o `application/grpc+proto` trailer; HTTP JSON `{code, message, details}`.

Ejemplo Go:
```go
return AppError{Code: ErrCodeInvalidOid, Message: "invalid oid"}.WithDetail("oid", hex)
```

Ejemplo TS:
```ts
try { await ipcBridge.invoke('getCommits', req) } catch(e: AppError) { if(e.code==='QUEUE_FULL') retry() }
```

## 6. Invariantes de negocio

- Nunca persistir blobs/trees/commits completos en SQLite; solo ventana cacheada (200+100) y metadatos.
- `commit_cache` invalidado en `FsChangedEvent` o `HEAD` move; `file_status` refrescado con debounce.
- `refs/stash` puede no existir — `ListStashes` devuelve vacío, no error.
- Large repo: `GetCommits` offset/limit obligatorio; streaming `StreamCommits` para prefetch.
