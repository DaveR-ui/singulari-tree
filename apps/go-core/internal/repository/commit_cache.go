package repository

import (
	"context"
	"sync"

	"github.com/SingulariTree/go-core/internal/domain"
)

// CommitCache is an in-memory LRU-ish cache implementing domain.CachePort.
//
// TODO(Phase 1): populate the SQLite `commit_cache` table instead of this
// in-memory map, keyed by (repo_id, oid) with index (repo_id, committed_at DESC)
// for windowed reads (service-design.md §1.4). Phase 0 only needs the port filled
// so GraphService can be wired; no SQLite commit reads happen yet.
type CommitCache struct {
	mu      sync.RWMutex
	commits map[domain.RepositoryId]map[string]domain.Commit
	status  map[domain.RepositoryId][]domain.FileStatus
}

// NewCommitCache creates an in-memory stub.
func NewCommitCache() *CommitCache {
	return &CommitCache{
		commits: make(map[domain.RepositoryId]map[string]domain.Commit),
		status:  make(map[domain.RepositoryId][]domain.FileStatus),
	}
}

// GetCommits returns cached commits if present. total is the number of cached
// commits for the repo (all commits are cached together for Phase 0), not the
// size of the returned window, so callers can still compute hasMore.
func (c *CommitCache) GetCommits(_ context.Context, repoID domain.RepositoryId, offset, limit int) ([]domain.Commit, int, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	m, ok := c.commits[repoID]
	if !ok {
		return nil, 0, false
	}
	// Simplified: return all if offset 0, else miss
	if offset != 0 {
		return nil, 0, false
	}
	out := make([]domain.Commit, 0, len(m))
	for _, v := range m {
		out = append(out, v)
	}
	total := len(out)
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, total, true
}

// PutCommits stores commits.
func (c *CommitCache) PutCommits(_ context.Context, repoID domain.RepositoryId, commits []domain.Commit) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.commits[repoID]; !ok {
		c.commits[repoID] = make(map[string]domain.Commit)
	}
	for _, co := range commits {
		c.commits[repoID][co.Oid.Hex] = co
	}
	return nil
}

// Invalidate removes cached data for a repo.
func (c *CommitCache) Invalidate(repoID domain.RepositoryId) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.commits, repoID)
	delete(c.status, repoID)
}
