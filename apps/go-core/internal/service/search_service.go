package service

import (
	"context"
	"sort"
	"strings"

	"github.com/SingulariTree/go-core/internal/domain"
)

// searchBackfillLimit bounds the per-repo backfill a search may trigger: at
// most this many commits are read from Git for a repository that has no cached
// rows (ADR-026). Search never runs an unbounded `git log` at query time.
const searchBackfillLimit = 500

// defaultSearchLimit is used when a search request omits a limit; maxSearchLimit
// caps an oversized request so a single query stays bounded.
const (
	defaultSearchLimit = 100
	maxSearchLimit     = 500
)

// SearchService orchestrates cross-repo local commit search over the SQLite
// metadata cache (ADR-026). It depends on the narrow CommitSearchPort (the
// metadata table), the commit read port for a bounded backfill, and the cache
// port to persist that backfill. It never reads Git objects.
type SearchService struct {
	searchPort domain.CommitSearchPort
	gitPort    domain.CommitLister
	cachePort  domain.CachePort
}

// NewSearchService creates a SearchService. gitPort and cachePort may be nil, in
// which case no backfill is performed and only already-cached rows are searched.
func NewSearchService(searchPort domain.CommitSearchPort, gitPort domain.CommitLister, cachePort domain.CachePort) *SearchService {
	return &SearchService{searchPort: searchPort, gitPort: gitPort, cachePort: cachePort}
}

// Search returns cross-repo commit hits matching query. repoIDs scopes the
// search; an empty list yields no results. Rows come from the metadata cache;
// a repository with no cached rows gets at most one bounded backfill
// (searchBackfillLimit) when a Git port and cache are wired, so a repo that is
// skipped (or has no Git port) simply contributes nothing (ADR-026).
func (s *SearchService) Search(ctx context.Context, repoIDs []string, query string, limit int) ([]domain.CommitSearchHit, error) {
	if s.searchPort == nil || len(repoIDs) == 0 {
		return nil, nil
	}
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}
	if limit <= 0 {
		limit = defaultSearchLimit
	}
	if limit > maxSearchLimit {
		limit = maxSearchLimit
	}

	s.backfill(ctx, repoIDs)

	hits, err := s.searchPort.SearchCommits(ctx, repoIDs, query, limit)
	if err != nil {
		return nil, err
	}
	// Deterministic order independent of the store: newest first, oid as the
	// tie-breaker.
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].CommittedAt.Equal(hits[j].CommittedAt) {
			return hits[i].Oid > hits[j].Oid
		}
		return hits[i].CommittedAt.After(hits[j].CommittedAt)
	})
	if len(hits) > limit {
		hits = hits[:limit]
	}
	return hits, nil
}

// backfill opportunistically populates the metadata cache for repos that have
// no cached rows, reading at most searchBackfillLimit commits each. It is
// best-effort: a Git or write error is ignored so search still returns cached
// results.
func (s *SearchService) backfill(ctx context.Context, repoIDs []string) {
	if s.gitPort == nil || s.cachePort == nil {
		return
	}
	for _, raw := range repoIDs {
		repoID := domain.RepositoryId(raw)
		if repoID == "" {
			continue
		}
		if _, _, ok := s.cachePort.GetCommits(ctx, repoID, 0, 1); ok {
			continue // already has cached rows; nothing to warm.
		}
		commits, total, err := s.gitPort.List(ctx, repoID, 0, searchBackfillLimit)
		if err != nil || len(commits) == 0 {
			continue
		}
		_ = s.cachePort.PutCommits(ctx, repoID, 0, total, commits)
	}
}
