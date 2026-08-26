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
func (s *RepoService) Open(ctx context.Context, fsPath string) (*domain.Repository, error) {
	if s.repoPort == nil {
		return nil, domain.ErrNotAGitRepo
	}
	return s.repoPort.Open(ctx, fsPath)
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
		return nil
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
