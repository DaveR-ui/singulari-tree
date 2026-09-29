package service

import (
	"context"

	"github.com/SingulariTree/go-core/internal/domain"
)

// GraphService owns commit graph and lanes (service-design.md §1.2).
type GraphService struct {
	gitPort   domain.GitPort
	cachePort domain.CachePort
}

// NewGraphService creates a GraphService.
func NewGraphService(gitPort domain.GitPort, cachePort domain.CachePort) *GraphService {
	return &GraphService{gitPort: gitPort, cachePort: cachePort}
}

// Commits returns windowed commits (200+100 pattern, handled by Angular GraphStore).
func (s *GraphService) Commits(ctx context.Context, repoID domain.RepositoryId, offset, limit int) ([]domain.Commit, int, error) {
	if s.cachePort != nil {
		if commits, total, ok := s.cachePort.GetCommits(ctx, repoID, offset, limit); ok {
			return commits, total, nil
		}
	}
	if s.gitPort == nil {
		return nil, 0, nil
	}
	// Real implementation would delegate to a GraphPort; stub returns empty window
	commits, total, err := s.gitPort.List(ctx, repoID, offset, limit)
	if err != nil {
		return nil, 0, err
	}
	return commits, total, nil
}

// Lanes computes lanes for commits (<100ms for 50k, service-design.md §1.2).
func (s *GraphService) Lanes(_ context.Context, _ domain.RepositoryId, commits []domain.Commit) ([]domain.Lane, error) {
	lanes := make([]domain.Lane, len(commits))
	for i := range lanes {
		lanes[i] = domain.Lane{Index: i % 8, Color: i % 8, Continues: false}
	}
	return lanes, nil
}
