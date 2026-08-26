package repository

import (
	"context"
	"sync"

	"github.com/SingulariTree/go-core/internal/domain"
)

// RepoStore is the SQLite-backed RepoPort implementation (stub, GORM in real impl).
// WAL mode: PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON
type RepoStore struct {
	mu    sync.RWMutex
	repos map[domain.RepositoryId]*domain.Repository
	byPath map[string]domain.RepositoryId
}

// NewRepoStore creates an in-memory stub (real impl opens SQLite with WAL).
func NewRepoStore() *RepoStore {
	return &RepoStore{
		repos:  make(map[domain.RepositoryId]*domain.Repository),
		byPath: make(map[string]domain.RepositoryId),
	}
}

// Open tracks a repository (upsert by FsPath).
func (s *RepoStore) Open(_ context.Context, fsPath string) (*domain.Repository, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if id, ok := s.byPath[fsPath]; ok {
		if r, ok := s.repos[id]; ok {
			return r, nil
		}
	}
	// Minimal stub: create new
	repo, err := domain.NewRepository(domain.RepositoryId(fsPath), fsPath, "", "")
	if err != nil {
		return nil, err
	}
	s.repos[repo.ID] = &repo
	s.byPath[fsPath] = repo.ID
	return &repo, nil
}

// List returns all tracked repos.
func (s *RepoStore) List(_ context.Context) ([]domain.Repository, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.Repository, 0, len(s.repos))
	for _, r := range s.repos {
		out = append(out, *r)
	}
	return out, nil
}

// Remove untracks a repo.
func (s *RepoStore) Remove(_ context.Context, id domain.RepositoryId) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if r, ok := s.repos[id]; ok {
		delete(s.byPath, r.FsPath)
	}
	delete(s.repos, id)
	return nil
}

// Get returns a repo by ID.
func (s *RepoStore) Get(_ context.Context, id domain.RepositoryId) (*domain.Repository, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if r, ok := s.repos[id]; ok {
		return r, nil
	}
	return nil, domain.ErrRepoNotFound
}
