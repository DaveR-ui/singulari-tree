package service

import (
	"context"

	"github.com/SingulariTree/go-core/internal/domain"
)

// RepoService manages tracked repositories (service-design.md §1.1).
type RepoService struct {
	repoPort domain.RepoPort
	gitPort  domain.GitPort
}

// NewRepoService creates a RepoService.
func NewRepoService(repoPort domain.RepoPort, gitPort domain.GitPort) *RepoService {
	return &RepoService{repoPort: repoPort, gitPort: gitPort}
}

// Open validates that fsPath is a git repo and tracks it.
//
// Validation runs through the Git port (git rev-parse --show-toplevel /
// --git-common-dir) before anything is persisted, so a non-repo path yields
// ErrNotAGitRepo instead of a bogus repository record. The resolved top-level
// directory is used as the persisted path (worktree/subdirectory-safe).
func (s *RepoService) Open(ctx context.Context, fsPath string) (*domain.Repository, error) {
	if s.repoPort == nil || s.gitPort == nil {
		return nil, domain.ErrNotAGitRepo.WithDetail("fs_path", fsPath)
	}
	topLevel, _, err := s.gitPort.Resolve(ctx, fsPath)
	if err != nil {
		return nil, domain.ErrNotAGitRepo.WithDetail("fs_path", fsPath)
	}
	return s.repoPort.Open(ctx, topLevel)
}

// Get returns a tracked repository by ID.
func (s *RepoService) Get(ctx context.Context, id domain.RepositoryId) (*domain.Repository, error) {
	if s.repoPort == nil {
		return nil, domain.ErrRepoNotFound
	}
	return s.repoPort.Get(ctx, id)
}

// List returns tracked repositories.
func (s *RepoService) List(ctx context.Context) ([]domain.Repository, error) {
	if s.repoPort == nil {
		return nil, nil
	}
	return s.repoPort.List(ctx)
}

// Remove untracks a repository.
func (s *RepoService) Remove(ctx context.Context, id domain.RepositoryId) error {
	if s.repoPort == nil {
		return domain.ErrRepoNotFound
	}
	return s.repoPort.Remove(ctx, id)
}

// Resolve returns fsPath for a repository ID.
func (s *RepoService) Resolve(ctx context.Context, id domain.RepositoryId) (string, error) {
	if s.repoPort == nil {
		return "", domain.ErrRepoNotFound
	}
	repo, err := s.repoPort.Get(ctx, id)
	if err != nil {
		return "", err
	}
	if repo == nil {
		return "", domain.ErrRepoNotFound
	}
	return repo.FsPath, nil
}
