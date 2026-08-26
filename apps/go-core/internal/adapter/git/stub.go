package git

import (
	"context"

	"github.com/SingulariTree/go-core/internal/domain"
)

// Adapter is the go-git primary + libgit2 cgo fallback stub.
// Real implementation wraps go-git and falls back to libgit2 for edge cases.
type Adapter struct{}

// NewGoGitAdapter creates a stub git adapter.
func NewGoGitAdapter() *Adapter { return &Adapter{} }

// Status returns working-tree status (stub).
func (a *Adapter) Status(_ context.Context, _ domain.RepositoryId) ([]domain.FileStatus, error) {
	return nil, nil
}

// Stage stages paths (stub).
func (a *Adapter) Stage(_ context.Context, _ domain.RepositoryId, _ []string) error { return nil }

// Unstage unstages paths (stub).
func (a *Adapter) Unstage(_ context.Context, _ domain.RepositoryId, _ []string) error { return nil }

// Commit creates a commit (stub).
func (a *Adapter) Commit(_ context.Context, _ domain.RepositoryId, _ string, _ *domain.Signature) (*domain.Commit, error) {
	return nil, domain.AppError{Code: domain.ErrCodeCommitFailed, Message: "not implemented"}
}

// Diff returns diff (stub).
func (a *Adapter) Diff(_ context.Context, _ domain.RepositoryId, _, _ domain.Oid) (*domain.Diff, error) {
	return &domain.Diff{}, nil
}

// BranchList branches (stub).
func (a *Adapter) BranchList(_ context.Context, _ domain.RepositoryId) ([]domain.Branch, error) {
	return nil, nil
}

// BranchCreate creates a branch (stub).
func (a *Adapter) BranchCreate(_ context.Context, _ domain.RepositoryId, _ string, _ domain.Oid) (*domain.Branch, error) {
	return nil, nil
}

// BranchDelete deletes a branch (stub).
func (a *Adapter) BranchDelete(_ context.Context, _ domain.RepositoryId, _ domain.RefName) error {
	return nil
}

// Checkout checks out a ref (stub).
func (a *Adapter) Checkout(_ context.Context, _ domain.RepositoryId, _ domain.RefName) error { return nil }

// Get returns a commit (stub).
func (a *Adapter) Get(_ context.Context, _ domain.RepositoryId, _ domain.Oid) (*domain.Commit, error) {
	return nil, domain.ErrCommitNotFound
}

// List returns windowed commits (CommitPort).
func (a *Adapter) List(_ context.Context, _ domain.RepositoryId, _, _ int) ([]domain.Commit, int, error) {
	return nil, 0, nil
}

// RemoteList returns remotes (stub).
func (a *Adapter) RemoteList(_ context.Context, _ domain.RepositoryId) ([]domain.Remote, error) {
	return nil, nil
}

// TagList returns tags (stub).
func (a *Adapter) TagList(_ context.Context, _ domain.RepositoryId) ([]domain.Tag, error) {
	return nil, nil
}

// StashList returns stashes (stub).
func (a *Adapter) StashList(_ context.Context, _ domain.RepositoryId) ([]domain.Stash, error) {
	return nil, nil
}

// WorktreeList returns worktrees (stub).
func (a *Adapter) WorktreeList(_ context.Context, _ domain.RepositoryId) ([]domain.Worktree, error) {
	return nil, nil
}

// Lanes computes lanes (stub).
func (a *Adapter) Lanes(_ context.Context, _ domain.RepositoryId, commits []domain.Commit) ([]domain.Lane, error) {
	lanes := make([]domain.Lane, len(commits))
	return lanes, nil
}
