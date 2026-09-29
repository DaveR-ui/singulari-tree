package domain

import (
	"context"
	"regexp"
	"strings"
	"time"
)

// Oid is a Git object ID value object (SHA-1 40 or SHA-256 64 hex).
type Oid struct {
	Hex  string
	Kind string // "SHA1" | "SHA256"
}

var oidRe = regexp.MustCompile(`^[0-9a-f]{40,64}$`)

// NewOid validates and normalizes an Oid.
func NewOid(hex string) (Oid, error) {
	hex = strings.ToLower(strings.TrimSpace(hex))
	if !oidRe.MatchString(hex) {
		return Oid{}, AppError{Code: ErrCodeInvalidOid, Message: "invalid oid", Details: map[string]string{"oid": hex}}
	}
	kind := "SHA1"
	if len(hex) == 64 {
		kind = "SHA256"
	}
	return Oid{Hex: hex, Kind: kind}, nil
}

// Short returns 7-char abbreviated hex.
func (o Oid) Short() string {
	if len(o.Hex) > 7 {
		return o.Hex[:7]
	}
	return o.Hex
}

// Signature is author/committer identity.
type Signature struct {
	Name  string
	Email string
	When  time.Time
}

// RefLabel is a Git ref decoration pointing at a commit (wire: domain.proto
// RefLabel). Kind is one of "head", "branch", "remote" or "tag"; Name is the
// short label (e.g. "main", "origin/main", "v1.0.0").
type RefLabel struct {
	Name string
	Kind string
}

// Ref kind values used by RefLabel.Kind.
const (
	RefKindHead   = "head"
	RefKindBranch = "branch"
	RefKindRemote = "remote"
	RefKindTag    = "tag"
)

// Commit is an immutable Git commit entity (domain-model.md §1.2).
type Commit struct {
	Oid         Oid
	Parents     []Oid
	Author      Signature
	Committer   Signature
	Message     string
	TreeOid     Oid
	CommittedAt time.Time
	// Refs are the ref decorations pointing at this commit (may be nil). They
	// are populated by the read adapter and never computed in the domain.
	Refs []RefLabel
}

// CommitPort is the read port for commits.
type CommitPort interface {
	Get(ctx context.Context, repoID RepositoryId, oid Oid) (*Commit, error)
	List(ctx context.Context, repoID RepositoryId, offset, limit int) ([]Commit, int, error)
}

// Errors
var (
	ErrCommitNotFound = AppError{Code: ErrCodeCommitNotFound, Message: "commit not found"}
	ErrInvalidOid     = AppError{Code: ErrCodeInvalidOid, Message: "invalid oid"}
)
