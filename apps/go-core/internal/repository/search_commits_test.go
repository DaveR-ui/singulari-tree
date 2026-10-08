package repository

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/SingulariTree/go-core/internal/domain"
)

// searchCommit builds a minimal commit for the search tests.
func searchCommit(oid string, msg, authorName, authorEmail string, at time.Time) domain.Commit {
	return domain.Commit{
		Oid:         domain.Oid{Hex: oid, Kind: "SHA1"},
		Author:      domain.Signature{Name: authorName, Email: authorEmail, When: at},
		Committer:   domain.Signature{Name: authorName, Email: authorEmail, When: at},
		Message:     msg,
		TreeOid:     oid40('t'),
		CommittedAt: at,
	}
}

// TestSearchCommits covers message/author/oid matching, case-insensitivity,
// LIKE escaping, repo scoping and the limit (ADR-026).
func TestSearchCommits(t *testing.T) {
	ctx := context.Background()
	db := openTestDB(t)
	store := NewRepoStore(db)

	repoA, err := store.Open(ctx, t.TempDir())
	if err != nil {
		t.Fatalf("Open(A): %v", err)
	}
	repoB, err := store.Open(ctx, t.TempDir())
	if err != nil {
		t.Fatalf("Open(B): %v", err)
	}

	cache := NewCommitCache(db)
	base := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)

	// Oids are 40-hex so the oid-prefix match is exercised.
	oidFix := "abcdef" + strings.Repeat("0", 34)
	oidTwo := "bbbbbb" + strings.Repeat("0", 34)
	oidPct := "cccccc" + strings.Repeat("0", 34)
	oidUnd := "dddddd" + strings.Repeat("0", 34)

	commits := []domain.Commit{
		searchCommit(oidFix, "Fix login flow", "Alice", "alice@example.com", base),
		searchCommit(oidTwo, "Add dashboard", "Bob", "bob@example.com", base.Add(time.Minute)),
		searchCommit(oidPct, "Progress 100% complete", "Carol", "carol@example.com", base.Add(2*time.Minute)),
		searchCommit(oidUnd, "Rename foo_bar to baz", "Dave", "dave@example.com", base.Add(3*time.Minute)),
	}
	if err := cache.PutCommits(ctx, repoA.ID, 0, len(commits), commits); err != nil {
		t.Fatalf("PutCommits(A): %v", err)
	}

	// Repo B has a matching commit that must not leak into a scoped search.
	other := searchCommit("eeeee"+strings.Repeat("0", 35), "Fix login flow", "Eve", "eve@example.com", base)
	if err := cache.PutCommits(ctx, repoB.ID, 0, 1, []domain.Commit{other}); err != nil {
		t.Fatalf("PutCommits(B): %v", err)
	}

	// Message match, case-insensitive.
	hits, err := cache.SearchCommits(ctx, []string{string(repoA.ID)}, "LOGIN", 10)
	if err != nil {
		t.Fatalf("SearchCommits(message): %v", err)
	}
	if len(hits) != 1 || hits[0].Oid != oidFix {
		t.Fatalf("message hits = %+v, want [%s]", hits, oidFix)
	}
	if hits[0].RepoID != repoA.ID || hits[0].AuthorEmail != "alice@example.com" {
		t.Errorf("hit fields = %+v", hits[0])
	}

	// Author name and email match.
	if hits, _ := cache.SearchCommits(ctx, []string{string(repoA.ID)}, "bob", 10); len(hits) != 1 || hits[0].Oid != oidTwo {
		t.Errorf("author-name hits = %+v, want [%s]", hits, oidTwo)
	}
	if hits, _ := cache.SearchCommits(ctx, []string{string(repoA.ID)}, "carol@example", 10); len(hits) != 1 || hits[0].Oid != oidPct {
		t.Errorf("author-email hits = %+v, want [%s]", hits, oidPct)
	}

	// Oid prefix match.
	if hits, _ := cache.SearchCommits(ctx, []string{string(repoA.ID)}, "abc", 10); len(hits) != 1 || hits[0].Oid != oidFix {
		t.Errorf("oid-prefix hits = %+v, want [%s]", hits, oidFix)
	}

	// LIKE metacharacters match literally: "%" must not act as a wildcard.
	pct, err := cache.SearchCommits(ctx, []string{string(repoA.ID)}, "100%", 10)
	if err != nil {
		t.Fatalf("SearchCommits(%%): %v", err)
	}
	if len(pct) != 1 || pct[0].Oid != oidPct {
		t.Errorf("escaped %% hits = %+v, want [%s]", pct, oidPct)
	}
	if wide, _ := cache.SearchCommits(ctx, []string{string(repoA.ID)}, "100%complete", 10); len(wide) != 0 {
		t.Errorf("unescaped wildcard leaked: %+v", wide)
	}

	// "_" must match literally too.
	if und, _ := cache.SearchCommits(ctx, []string{string(repoA.ID)}, "foo_bar", 10); len(und) != 1 || und[0].Oid != oidUnd {
		t.Errorf("escaped _ hits = %+v, want [%s]", und, oidUnd)
	}
	if wide, _ := cache.SearchCommits(ctx, []string{string(repoA.ID)}, "fooXbar", 10); len(wide) != 0 {
		t.Errorf("underscore matched as wildcard: %+v", wide)
	}

	// Repo scoping: repo B's identical message is not returned for repo A.
	scoped, err := cache.SearchCommits(ctx, []string{string(repoA.ID)}, "Fix login", 10)
	if err != nil {
		t.Fatalf("SearchCommits(scoped): %v", err)
	}
	if len(scoped) != 1 || scoped[0].RepoID != repoA.ID {
		t.Errorf("scoped hits = %+v, want only repo A", scoped)
	}

	// Limit is honoured and results are newest-first.
	limited, err := cache.SearchCommits(ctx, []string{string(repoA.ID)}, "0", 2)
	if err != nil {
		t.Fatalf("SearchCommits(limit): %v", err)
	}
	if len(limited) != 2 {
		t.Errorf("limit hits = %d, want 2", len(limited))
	}
	if !limited[0].CommittedAt.After(limited[1].CommittedAt) && limited[0].CommittedAt != limited[1].CommittedAt {
		t.Errorf("hits not newest-first: %+v", limited)
	}

	// Empty scope / limit yields nothing.
	if hits, _ := cache.SearchCommits(ctx, nil, "login", 10); len(hits) != 0 {
		t.Errorf("empty scope hits = %+v, want none", hits)
	}
	if hits, _ := cache.SearchCommits(ctx, []string{string(repoA.ID)}, "login", 0); len(hits) != 0 {
		t.Errorf("zero limit hits = %+v, want none", hits)
	}
}
