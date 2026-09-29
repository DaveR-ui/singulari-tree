package service

import (
	"context"
	"sync"

	"github.com/SingulariTree/go-core/internal/domain"
)

// WatcherService owns FS subscriptions and coalescing (service-design.md §4, 150ms debounce).
type WatcherService struct {
	port domain.WatcherPort

	mu        sync.Mutex
	callbacks []func(domain.FsChangedEvent)
}

// NewWatcherService creates a WatcherService.
func NewWatcherService(port domain.WatcherPort) *WatcherService {
	return &WatcherService{port: port}
}

// OnChange registers fn to be invoked for every emitted FsChangedEvent. It is
// used to invalidate derived state (e.g. GraphService lane layout) when the
// working tree or refs change. Callbacks run outside the registration lock.
func (s *WatcherService) OnChange(fn func(domain.FsChangedEvent)) {
	if fn == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.callbacks = append(s.callbacks, fn)
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

// Emit fans out an event (called by adapter). All registered callbacks are
// invoked synchronously after the event is recorded.
func (s *WatcherService) Emit(ev domain.FsChangedEvent) {
	s.mu.Lock()
	cbs := make([]func(domain.FsChangedEvent), len(s.callbacks))
	copy(cbs, s.callbacks)
	s.mu.Unlock()
	for _, fn := range cbs {
		fn(ev)
	}
}
