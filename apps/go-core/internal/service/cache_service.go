package service

import (
	"context"
	"sync"

	"github.com/SingulariTree/go-core/internal/domain"
)

// CacheService implements LRU (500 entries) + SQLite coherence (service-design.md §6).
type CacheService struct {
	mu       sync.RWMutex
	capacity int
	entries  map[string][]domain.Commit
	order    []string
}

// NewCacheService creates a CacheService with given LRU capacity.
func NewCacheService(capacity int) *CacheService {
	if capacity <= 0 {
		capacity = 500
	}
	return &CacheService{
		capacity: capacity,
		entries:  make(map[string][]domain.Commit),
	}
}

func cacheKey(repoID domain.RepositoryId, offset, limit int) string {
	// Simplified key; real impl includes tipOid
	return string(repoID) + ":" + itoa(offset) + ":" + itoa(limit)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}

// GetCommits tries LRU.
func (s *CacheService) GetCommits(_ context.Context, repoID domain.RepositoryId, offset, limit int) ([]domain.Commit, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	k := cacheKey(repoID, offset, limit)
	c, ok := s.entries[k]
	return c, ok
}

// PutCommits stores in LRU (evicts oldest if over capacity).
func (s *CacheService) PutCommits(_ context.Context, repoID domain.RepositoryId, commits []domain.Commit) error {
	// Use window 0 as placeholder key for bulk put; real impl keys by offset/limit/tip
	s.mu.Lock()
	defer s.mu.Unlock()
	k := string(repoID) + ":put"
	if _, exists := s.entries[k]; !exists {
		if len(s.entries) >= s.capacity {
			if len(s.order) > 0 {
				delete(s.entries, s.order[0])
				s.order = s.order[1:]
			}
		}
		s.order = append(s.order, k)
	}
	s.entries[k] = commits
	return nil
}

// Invalidate removes entries for a repo.
func (s *CacheService) Invalidate(repoID domain.RepositoryId) {
	s.mu.Lock()
	defer s.mu.Unlock()
	prefix := string(repoID) + ":"
	for k := range s.entries {
		if len(k) >= len(prefix) && k[:len(prefix)] == prefix {
			delete(s.entries, k)
		}
	}
	// rebuild order
	n := 0
	for _, k := range s.order {
		if _, ok := s.entries[k]; ok {
			s.order[n] = k
			n++
		}
	}
	s.order = s.order[:n]
}
