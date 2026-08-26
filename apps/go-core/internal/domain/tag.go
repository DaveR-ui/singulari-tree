package domain

import "context"

// Tag entity (domain-model.md §1.2).
type Tag struct {
	Name      string
	RefName   RefName
	Target    Oid
	Tagger    *Signature
	Message   *string
	Annotated bool
}

// TagPort is the Git port for tags.
type TagPort interface {
	List(ctx context.Context, repoID RepositoryId) ([]Tag, error)
	Create(ctx context.Context, repoID RepositoryId, name string, target Oid, annotated bool) (*Tag, error)
	Delete(ctx context.Context, repoID RepositoryId, ref RefName) error
}
