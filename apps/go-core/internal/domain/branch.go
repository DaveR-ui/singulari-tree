package domain

import (
	"context"
	"strings"
)

// RefName is a Git ref name value object (e.g. refs/heads/main, HEAD).
type RefName struct {
	Raw string
}

// Short returns short name (e.g. main from refs/heads/main, origin/main from refs/remotes/origin/main).
func (r RefName) Short() string {
	s := r.Raw
	if s == "HEAD" {
		return "HEAD"
	}
	for _, prefix := range []string{"refs/heads/", "refs/remotes/", "refs/tags/"} {
		if strings.HasPrefix(s, prefix) {
			return strings.TrimPrefix(s, prefix)
		}
	}
	return s
}

// Branch entity (domain-model.md §1.2).
type Branch struct {
	Name      string
	RefName   RefName
	Tip       Oid
	Upstream  *RefName
	IsCurrent bool
	IsRemote  bool
}

// BranchPort is the Git port for branches.
type BranchPort interface {
	List(ctx context.Context, repoID RepositoryId) ([]Branch, error)
	Create(ctx context.Context, repoID RepositoryId, name string, from Oid) (*Branch, error)
	Delete(ctx context.Context, repoID RepositoryId, ref RefName) error
	Checkout(ctx context.Context, repoID RepositoryId, ref RefName) error
}

// Errors
var (
	ErrBranchNotFound = AppError{Code: ErrCodeBranchNotFound, Message: "branch not found"}
	ErrBranchExists   = AppError{Code: ErrCodeBranchExists, Message: "branch already exists"}
	ErrDetachedHead   = AppError{Code: ErrCodeDetachedHead, Message: "detached HEAD"}
)
