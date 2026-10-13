package repository

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"time"

	"github.com/google/uuid"

	"github.com/SingulariTree/go-core/internal/domain"
)

// RepoStore is the SQLite-backed implementation of domain.RepoPort
// (domain-model.md §1.1, ADR-006). It persists the `repos` table only; Git
// objects stay in `.git`.
type RepoStore struct {
	db *sql.DB
}

// NewRepoStore creates a RepoStore over an opened SQLite database.
// ApplyMigrations must have been called before use.
func NewRepoStore(db *sql.DB) *RepoStore {
	return &RepoStore{db: db}
}

var _ domain.RepoPort = (*RepoStore)(nil)

// Open tracks a repository, upserting by the UNIQUE fs_path. Re-opening an
// already-tracked path preserves its UUID/created_at and refreshes
// last_opened_at. The path is normalized to an absolute, cleaned form.
func (s *RepoStore) Open(ctx context.Context, fsPath string) (*domain.Repository, error) {
	abs, err := filepath.Abs(filepath.Clean(fsPath))
	if err != nil {
		return nil, domain.ErrRepoNotFound.WithDetail("fs_path", fsPath)
	}

	existing, err := s.getByPath(ctx, abs)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		now := time.Now().UTC()
		if _, err := s.db.ExecContext(ctx,
			`UPDATE repos SET last_opened_at = ? WHERE id = ?`,
			now.Format(time.RFC3339Nano), string(existing.ID),
		); err != nil {
			return nil, err
		}
		existing.LastOpenedAt = now
		return existing, nil
	}

	repo, err := domain.NewRepository(domain.RepositoryId(uuid.NewString()), abs, "", "")
	if err != nil {
		return nil, err
	}
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO repos (id, fs_path, common_dir, name, created_at, last_opened_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		string(repo.ID), repo.FsPath, repo.CommonDir, repo.Name,
		repo.CreatedAt.Format(time.RFC3339Nano), repo.LastOpenedAt.Format(time.RFC3339Nano),
	); err != nil {
		return nil, err
	}
	return &repo, nil
}

// List returns tracked repositories, most recently opened first.
//
// last_opened_at alone is not a deterministic total order: on Windows the wall
// clock is read at the coarse system-timer granularity, so two rapid Open calls
// can share the same RFC3339Nano timestamp and SQLite then returns the tied
// rows in an unspecified order. The rowid DESC term breaks the tie towards the
// later-inserted row; re-opening UPDATEs last_opened_at but not rowid, so on an
// exact tie the later-inserted row wins (insertion order, not open order).
// This mirrors the same-package precedent in commit_cache.go
// (ORDER BY committed_at DESC, oid DESC).
func (s *RepoStore) List(ctx context.Context) ([]domain.Repository, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, fs_path, common_dir, name, created_at, last_opened_at
		 FROM repos ORDER BY last_opened_at DESC, rowid DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]domain.Repository, 0)
	for rows.Next() {
		repo, err := scanRepo(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *repo)
	}
	return out, rows.Err()
}

// Remove untracks a repository and (via ON DELETE CASCADE) its cached rows.
func (s *RepoStore) Remove(ctx context.Context, id domain.RepositoryId) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM repos WHERE id = ?`, string(id))
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return domain.ErrRepoNotFound.WithDetail("repo_id", string(id))
	}
	return nil
}

// Get returns a repository by ID.
func (s *RepoStore) Get(ctx context.Context, id domain.RepositoryId) (*domain.Repository, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, fs_path, common_dir, name, created_at, last_opened_at
		 FROM repos WHERE id = ?`, string(id))
	repo, err := scanRepo(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, domain.ErrRepoNotFound.WithDetail("repo_id", string(id))
	}
	if err != nil {
		return nil, err
	}
	return repo, nil
}

func (s *RepoStore) getByPath(ctx context.Context, fsPath string) (*domain.Repository, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, fs_path, common_dir, name, created_at, last_opened_at
		 FROM repos WHERE fs_path = ?`, fsPath)
	repo, err := scanRepo(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return repo, nil
}

// rowScanner unifies *sql.Row and *sql.Rows.
type rowScanner interface {
	Scan(dest ...any) error
}

func scanRepo(sc rowScanner) (*domain.Repository, error) {
	var (
		id, fsPath, commonDir, name string
		createdAt, lastOpenedAt     string
	)
	if err := sc.Scan(&id, &fsPath, &commonDir, &name, &createdAt, &lastOpenedAt); err != nil {
		return nil, err
	}
	created, err := time.Parse(time.RFC3339Nano, createdAt)
	if err != nil {
		return nil, err
	}
	opened, err := time.Parse(time.RFC3339Nano, lastOpenedAt)
	if err != nil {
		return nil, err
	}
	return &domain.Repository{
		ID:           domain.RepositoryId(id),
		FsPath:       fsPath,
		CommonDir:    commonDir,
		Name:         name,
		CreatedAt:    created,
		LastOpenedAt: opened,
	}, nil
}
