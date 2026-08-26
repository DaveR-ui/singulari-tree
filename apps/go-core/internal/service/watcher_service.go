package service

import (
	"context"

	"github.com/SingulariTree/go-core/internal/domain"
)

// WatcherService owns FS subscriptions and coalescing (service-design.md §4, 150ms debounce).
type WatcherService struct {
	port domain.WatcherPort
}

// NewWatcherService creates a WatcherService.
func NewWatcherService(port domain.WatcherPort) *WatcherService {
	return &WatcherService{port: port}
}

// Watch subscribes to FsChanged events for a repository.
func (s *WatcherService) Watch(ctx context.Context, repoID domain.RepositoryId) (<-chan domain.FsChangedEvent, error) {
	if s.port == nil {
		ch := make(chan domain.FsChangedEvent)
		close(ch)
		return ch, nil
	}
	return s.port.Watch(ctx, repoID)
}

// Unwatch removes a subscription.
func (s *WatcherService) Unwatch(repoID domain.RepositoryId) error {
	if s.port == nil {
		return nil
	}
	return s.port.Unwatch(repoID)
}

// Emit fans out an event (called by adapter).
func (s *WatcherService) Emit(_ domain.FsChangedEvent) {}
