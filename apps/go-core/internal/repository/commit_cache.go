package repository

import (
	"context"
	"sync"

	"github.com/SingulariTree/go-core/internal/domain"
)

// CommitCache is the SQLite-backed commit_cache + file_status (stub).
// Real impl uses GORM with tables per domain-model.md §3.
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

// GetCommits returns cached commits if present.
func (c *CommitCache) GetCommits(_ context.Context, repoID domain.RepositoryId, offset, limit int) ([]domain.Commit, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	m, ok := c.commits[repoID]
	if !ok {
		return nil, false
	}
	// Simplified: return all if offset 0, else miss
	if offset != 0 {
		return nil, false
	}
	out := make([]domain.Commit, 0, len(m))
	for _, v := range m {
		out = append(out, v)
	}
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, true
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
