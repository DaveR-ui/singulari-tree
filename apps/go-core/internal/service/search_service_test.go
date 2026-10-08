package service

import (
	"context"
	"testing"
	"time"

	"github.com/SingulariTree/go-core/internal/domain"
)

// recordingSearchPort records the last search and returns canned hits.
type recordingSearchPort struct {
	hits       []domain.CommitSearchHit
	err        error
	calls      int
	gotRepoIDs []string
	gotQuery   string
	gotLimit   int
}

func (p *recordingSearchPort) SearchCommits(_ context.Context, repoIDs []string, query string, limit int) ([]domain.CommitSearchHit, error) {
	p.calls++
	p.gotRepoIDs = append([]string(nil), repoIDs...)
	p.gotQuery = query
	p.gotLimit = limit
	return p.hits, p.err
}

// searchBackfillLister implements domain.CommitLister for the backfill path.
type searchBackfillLister struct {
	commits  []domain.Commit
	calls    int
	gotLimit int
	err      error
}

func (l *searchBackfillLister) List(_ context.Context, _ domain.RepositoryId, _, limit int) ([]domain.Commit, int, error) {
	l.calls++
	l.gotLimit = limit
	return l.commits, len(l.commits), l.err
}

// fakeBackfillCache implements domain.CachePort, tracking which repos already
// have cached rows and recording backfill writes.
type fakeBackfillCache struct {
	hasRows map[string]bool
	put     map[string][]domain.Commit
}

func (c *fakeBackfillCache) GetCommits(_ context.Context, repoID domain.RepositoryId, _, _ int) ([]domain.Commit, int, bool) {
	if c.hasRows[string(repoID)] {
		return []domain.Commit{{}}, 1, true
	}
	return nil, 0, false
}
func (c *fakeBackfillCache) PutCommits(_ context.Context, repoID domain.RepositoryId, _, _ int, commits []domain.Commit) error {
	if c.put == nil {
		c.put = map[string][]domain.Commit{}
	}
	c.put[string(repoID)] = commits
	return nil
}
func (c *fakeBackfillCache) GetCommitStats(context.Context, domain.RepositoryId, []string) ([]domain.CommitStats, bool) {
	return nil, false
}
func (c *fakeBackfillCache) PutCommitStats(context.Context, domain.RepositoryId, []domain.CommitStats) error {
	return nil
}
func (c *fakeBackfillCache) Invalidate(domain.RepositoryId) {}

// TestSearchServiceReturnsSortedHits proves the orchestrator passes the query
// through and returns hits newest-first regardless of store order.
func TestSearchServiceReturnsSortedHits(t *testing.T) {
	base := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	port := &recordingSearchPort{hits: []domain.CommitSearchHit{
		{RepoID: "r1", Oid: "aaa", CommittedAt: base},
		{RepoID: "r1", Oid: "bbb", CommittedAt: base.Add(time.Hour)},
	}}
	svc := NewSearchService(port, nil, nil)

	hits, err := svc.Search(context.Background(), []string{"r1"}, "  login  ", 5)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if port.gotQuery != "login" || port.gotLimit != 5 || len(port.gotRepoIDs) != 1 {
		t.Errorf("passed args = %q/%d/%v", port.gotQuery, port.gotLimit, port.gotRepoIDs)
	}
	if len(hits) != 2 || hits[0].Oid != "bbb" {
		t.Fatalf("hits = %+v, want bbb first", hits)
	}
}

// TestSearchServiceLimitBounds pins the default and max limit clamps.
func TestSearchServiceLimitBounds(t *testing.T) {
	ctx := context.Background()

	port := &recordingSearchPort{}
	svc := NewSearchService(port, nil, nil)
	if _, err := svc.Search(ctx, []string{"r1"}, "q", 0); err != nil {
		t.Fatalf("Search(0): %v", err)
	}
	if port.gotLimit != defaultSearchLimit {
		t.Errorf("limit = %d, want default %d", port.gotLimit, defaultSearchLimit)
	}

	port = &recordingSearchPort{}
	svc = NewSearchService(port, nil, nil)
	if _, err := svc.Search(ctx, []string{"r1"}, "q", 100000); err != nil {
		t.Fatalf("Search(huge): %v", err)
	}
	if port.gotLimit != maxSearchLimit {
		t.Errorf("limit = %d, want max %d", port.gotLimit, maxSearchLimit)
	}
}

// TestSearchServiceEmptyInputs proves empty query/scope short-circuits without
// touching the store.
func TestSearchServiceEmptyInputs(t *testing.T) {
	port := &recordingSearchPort{}
	svc := NewSearchService(port, nil, nil)

	if hits, err := svc.Search(context.Background(), nil, "q", 5); err != nil || len(hits) != 0 {
		t.Errorf("empty repo_ids = %v/%v, want none", hits, err)
	}
	if hits, err := svc.Search(context.Background(), []string{"r1"}, "   ", 5); err != nil || len(hits) != 0 {
		t.Errorf("empty query = %v/%v, want none", hits, err)
	}
	if port.calls != 0 {
		t.Errorf("store calls = %d, want 0", port.calls)
	}
}

// TestSearchServiceBoundedBackfill proves a repo with no cached rows gets one
// bounded backfill (capped at searchBackfillLimit) while a populated repo does
// not.
func TestSearchServiceBoundedBackfill(t *testing.T) {
	port := &recordingSearchPort{}
	lister := &searchBackfillLister{commits: []domain.Commit{{Oid: domain.Oid{Hex: "aaaa"}}}}
	cache := &fakeBackfillCache{hasRows: map[string]bool{"populated": true}}
	svc := NewSearchService(port, lister, cache)

	if _, err := svc.Search(context.Background(), []string{"empty", "populated"}, "q", 5); err != nil {
		t.Fatalf("Search: %v", err)
	}
	if lister.calls != 1 {
		t.Errorf("git lister calls = %d, want 1 (only the empty repo)", lister.calls)
	}
	if lister.gotLimit != searchBackfillLimit {
		t.Errorf("backfill limit = %d, want %d", lister.gotLimit, searchBackfillLimit)
	}
	if len(cache.put["empty"]) != 1 {
		t.Errorf("backfill put for empty = %+v, want 1 commit", cache.put)
	}
	if _, ok := cache.put["populated"]; ok {
		t.Errorf("populated repo was backfilled, want skipped")
	}
}

// TestSearchServiceNoGitPortSkipsBackfill proves that without a Git port, a
// repo with no cached rows simply contributes nothing.
func TestSearchServiceNoGitPortSkipsBackfill(t *testing.T) {
	port := &recordingSearchPort{}
	cache := &fakeBackfillCache{}
	svc := NewSearchService(port, nil, cache)

	if _, err := svc.Search(context.Background(), []string{"empty"}, "q", 5); err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(cache.put) != 0 {
		t.Errorf("backfill ran without a Git port: %+v", cache.put)
	}
	if port.calls != 1 {
		t.Errorf("search calls = %d, want 1", port.calls)
	}
}
