package repository

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/SingulariTree/go-core/internal/domain"
)

// CommitCache is the SQLite-backed implementation of domain.CachePort
// (domain-model.md §3). It persists commit windows into the `commit_cache`
// table so the metadata cache survives restarts and process changes.
//
// Refs are NOT persisted: the table has no ref column, and ref decorations are
// derived by the Git read adapter on every window. Reads therefore return
// commits without Refs, which is the documented cache contract.
type CommitCache struct {
	db *sql.DB
}

var _ domain.CachePort = (*CommitCache)(nil)

// NewCommitCache creates a CommitCache over an opened SQLite database.
// ApplyMigrations must have been called before use.
func NewCommitCache(db *sql.DB) *CommitCache {
	return &CommitCache{db: db}
}

// PutCommits upserts the window's commits keyed by (repo_id, oid). offset and
// total are not persisted: rows are deduplicated by oid and the window order is
// rebuilt from committed_at at read time. A transaction keeps a window atomic.
func (c *CommitCache) PutCommits(ctx context.Context, repoID domain.RepositoryId, offset, total int, commits []domain.Commit) error {
	if len(commits) == 0 {
		return nil
	}

	tx, err := c.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	const q = `INSERT INTO commit_cache (
			repo_id, oid, parents,
			author_name, author_email, author_when,
			committer_name, committer_email, committer_when,
			message, tree_oid, committed_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(repo_id, oid) DO UPDATE SET
			parents         = excluded.parents,
			author_name     = excluded.author_name,
			author_email    = excluded.author_email,
			author_when     = excluded.author_when,
			committer_name  = excluded.committer_name,
			committer_email = excluded.committer_email,
			committer_when  = excluded.committer_when,
			message         = excluded.message,
			tree_oid        = excluded.tree_oid,
			committed_at    = excluded.committed_at`
	stmt, err := tx.PrepareContext(ctx, q)
	if err != nil {
		return err
	}
	defer func() { _ = stmt.Close() }()

	for i := range commits {
		cm := &commits[i]
		if _, err := stmt.ExecContext(ctx,
			string(repoID),
			cm.Oid.Hex,
			joinParents(cm.Parents),
			cm.Author.Name,
			cm.Author.Email,
			formatTime(cm.Author.When),
			cm.Committer.Name,
			cm.Committer.Email,
			formatTime(cm.Committer.When),
			cm.Message,
			cm.TreeOid.Hex,
			formatTime(cm.CommittedAt),
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// GetCommits reads one window ordered by committed_at DESC (idx_commit_cache_when)
// and the total number of cached rows. ok is false when the repo has no cached
// commits.
//
// Note: this ordering is by commit date, NOT topological. Git lists commits in
// topological order and the graph's lane layout depends on it, so this reader
// must NOT serve graph windows directly: it is the L2 write-through sink, while
// the hot read path goes through CacheService (L1, window-keyed). Serving
// topo-dependent reads from here would need an explicit ordering key.
func (c *CommitCache) GetCommits(ctx context.Context, repoID domain.RepositoryId, offset, limit int) ([]domain.Commit, int, bool) {
	var total int
	if err := c.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM commit_cache WHERE repo_id = ?`, string(repoID),
	).Scan(&total); err != nil {
		return nil, 0, false
	}
	if total == 0 {
		return nil, 0, false
	}

	// SQLite treats LIMIT -1 as "no limit"; a non-positive limit means the caller
	// wants the whole window.
	lim := limit
	if lim <= 0 {
		lim = -1
	}

	rows, err := c.db.QueryContext(ctx,
		`SELECT oid, parents,
		        author_name, author_email, author_when,
		        committer_name, committer_email, committer_when,
		        message, tree_oid, committed_at
		 FROM commit_cache
		 WHERE repo_id = ?
		 ORDER BY committed_at DESC, oid DESC
		 LIMIT ? OFFSET ?`,
		string(repoID), lim, offset,
	)
	if err != nil {
		return nil, 0, false
	}
	defer rows.Close()

	capHint := lim
	if capHint < 0 {
		capHint = 0
	}
	out := make([]domain.Commit, 0, capHint)
	for rows.Next() {
		cm, err := scanCachedCommit(rows)
		if err != nil {
			return nil, 0, false
		}
		out = append(out, cm)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, false
	}
	return out, total, true
}

// Invalidate deletes all cached commits for a repo.
func (c *CommitCache) Invalidate(repoID domain.RepositoryId) {
	_, _ = c.db.ExecContext(context.Background(),
		`DELETE FROM commit_cache WHERE repo_id = ?`, string(repoID))
}

// joinParents serializes parent oids as space-separated hex ("" when none).
func joinParents(parents []domain.Oid) string {
	if len(parents) == 0 {
		return ""
	}
	parts := make([]string, len(parents))
	for i := range parents {
		parts[i] = parents[i].Hex
	}
	return strings.Join(parts, " ")
}

// splitParents is the inverse of joinParents.
func splitParents(s string) []domain.Oid {
	if s == "" {
		return nil
	}
	fields := strings.Fields(s)
	out := make([]domain.Oid, len(fields))
	for i, f := range fields {
		out[i] = domain.Oid{Hex: f, Kind: oidKind(f)}
	}
	return out
}

// oidKind infers the hash kind from the hex length (SHA-1 40, SHA-256 64).
func oidKind(hex string) string {
	if len(hex) == 64 {
		return "SHA256"
	}
	return "SHA1"
}

func formatTime(t time.Time) string {
	return t.UTC().Format(time.RFC3339Nano)
}

// scanCachedCommit scans one commit_cache row (without refs).
func scanCachedCommit(sc rowScanner) (domain.Commit, error) {
	var (
		oidHex, parents                              string
		authorName, authorEmail, authorWhen          string
		committerName, committerEmail, committerWhen string
		message, treeOid, committedAt                string
	)
	if err := sc.Scan(
		&oidHex, &parents,
		&authorName, &authorEmail, &authorWhen,
		&committerName, &committerEmail, &committerWhen,
		&message, &treeOid, &committedAt,
	); err != nil {
		return domain.Commit{}, err
	}

	authorTime, err := time.Parse(time.RFC3339Nano, authorWhen)
	if err != nil {
		return domain.Commit{}, err
	}
	committerTime, err := time.Parse(time.RFC3339Nano, committerWhen)
	if err != nil {
		return domain.Commit{}, err
	}
	committedTime, err := time.Parse(time.RFC3339Nano, committedAt)
	if err != nil {
		return domain.Commit{}, err
	}

	return domain.Commit{
		Oid:         domain.Oid{Hex: oidHex, Kind: oidKind(oidHex)},
		Parents:     splitParents(parents),
		Author:      domain.Signature{Name: authorName, Email: authorEmail, When: authorTime},
		Committer:   domain.Signature{Name: committerName, Email: committerEmail, When: committerTime},
		Message:     message,
		TreeOid:     domain.Oid{Hex: treeOid, Kind: oidKind(treeOid)},
		CommittedAt: committedTime,
	}, nil
}
