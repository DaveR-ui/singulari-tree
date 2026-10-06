package domain

import "context"

// DiffLine is a single line in a hunk.
type DiffLine struct {
	Kind      string // "added" | "removed" | "context"
	Text      string
	NoNewline bool
}

// Hunk is a contiguous diff section.
type Hunk struct {
	FromStart int
	FromLines int
	ToStart   int
	ToLines   int
	Lines     []DiffLine
}

// Diff value object (domain-model.md §1.3).
type Diff struct {
	From               Oid
	To                 Oid
	Hunks              []Hunk
	Additions          int
	Deletions          int
	IsBinary           bool
	HasConflictMarkers bool
}

// FileStatus is working-tree status (porcelain v2).
type FileStatus struct {
	Path         string
	Staged       string
	Unstaged     string
	IsStaged     bool
	IsConflicted bool
}

// DiffPort is the Git port for diff/status.
type DiffPort interface {
	Diff(ctx context.Context, repoID RepositoryId, from, to Oid) (*Diff, error)
	Status(ctx context.Context, repoID RepositoryId) ([]FileStatus, error)
}

// GitPort aggregates all Git operations (used by services).
// It deliberately does NOT embed BranchPort/RemotePort/etc. to avoid duplicate method names
// (all have List/Add etc. with different signatures). Services depend on the specific port they need.
type GitPort interface {
	DiffPort
	CommitPort
	RemoteOpsPort
	// Resolve returns the repository top-level directory and its git common dir
	// for a filesystem path, or ErrNotAGitRepo when the path is not a repo.
	Resolve(ctx context.Context, fsPath string) (topLevel, commonDir string, err error)
	Status(ctx context.Context, repoID RepositoryId) ([]FileStatus, error)
	Stage(ctx context.Context, repoID RepositoryId, paths []string) error
	Unstage(ctx context.Context, repoID RepositoryId, paths []string) error
	Commit(ctx context.Context, repoID RepositoryId, message string, author *Signature) (*Commit, error)
	BranchList(ctx context.Context, repoID RepositoryId) ([]Branch, error)
	BranchCreate(ctx context.Context, repoID RepositoryId, name string, from Oid) (*Branch, error)
	BranchDelete(ctx context.Context, repoID RepositoryId, ref RefName) error
	Checkout(ctx context.Context, repoID RepositoryId, ref RefName, force, discardUntracked bool) error
	RemoteList(ctx context.Context, repoID RepositoryId) ([]Remote, error)
	TagList(ctx context.Context, repoID RepositoryId) ([]Tag, error)
	StashList(ctx context.Context, repoID RepositoryId) ([]Stash, error)
	// StashPush saves the working-tree changes to a new stash entry and returns
	// it. It mirrors StashList so GitService can depend on GitPort alone.
	StashPush(ctx context.Context, repoID RepositoryId, message string) (*Stash, error)
	WorktreeList(ctx context.Context, repoID RepositoryId) ([]Worktree, error)
}

// GraphPort is for commit graph + lanes (service-design.md §1.2).
type GraphPort interface {
	Commits(ctx context.Context, repoID RepositoryId, offset, limit int) ([]Commit, int, error)
	Lanes(ctx context.Context, repoID RepositoryId, commits []Commit) ([]Lane, error)
}

// Lane is a value object for graph rendering.
type Lane struct {
	Index     int
	Color     int
	Continues bool
}

// WatcherPort (fsnotify abstraction).
type WatcherPort interface {
	Watch(ctx context.Context, repoID RepositoryId) (<-chan FsChangedEvent, error)
	Unwatch(repoID RepositoryId) error
}

// FsChangedEvent is emitted by WatcherService, coalesced over its debounce
// window (default 150ms).
type FsChangedEvent struct {
	RepoID RepositoryId
	Paths  []string
}

// CachePort is the persistence port for commit cache + file_status.
type CachePort interface {
	// GetCommits returns a window of cached commits plus the total reachable
	// count, mirroring CommitPort.List so callers can compute hasMore. ok is
	// false on a cache miss.
	GetCommits(ctx context.Context, repoID RepositoryId, offset, limit int) ([]Commit, int, bool)
	// PutCommits stores a window that starts at offset together with the total
	// reachable count known when it was read. Implementations may ignore total
	// when their storage keys on offset alone.
	PutCommits(ctx context.Context, repoID RepositoryId, offset, total int, commits []Commit) error
	Invalidate(repoID RepositoryId)
}
