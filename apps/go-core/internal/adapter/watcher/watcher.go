package watcher

import (
	"context"
	"sync"

	"github.com/SingulariTree/go-core/internal/domain"
)

// Adapter is the fsnotify + polling fallback STUB (service-design.md §4).
//
// It only provides the subscription plumbing today: it does not attach an
// fsnotify/Watcher yet, so no filesystem events are generated here. A real
// implementation would watch .git/index, .git/HEAD, refs and the worktree.
// Debounce/coalescing does NOT live here — it lives in service.WatcherService,
// which coalesces bursts into one callback per repository per window.
type Adapter struct {
	mu       sync.RWMutex
	watchers map[domain.RepositoryId]chan domain.FsChangedEvent
}

// NewFsnotifyAdapter creates a watcher adapter stub.
func NewFsnotifyAdapter() *Adapter {
	return &Adapter{
		watchers: make(map[domain.RepositoryId]chan domain.FsChangedEvent),
	}
}

// Watch registers a buffered channel for repoID. Stub: it does not attach an
// fsnotify watcher, so no events are produced until the caller feeds Emit.
func (a *Adapter) Watch(_ context.Context, repoID domain.RepositoryId) (<-chan domain.FsChangedEvent, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	ch := make(chan domain.FsChangedEvent, 16)
	a.watchers[repoID] = ch
	return ch, nil
}

// Unwatch removes subscription and closes channel.
func (a *Adapter) Unwatch(repoID domain.RepositoryId) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if ch, ok := a.watchers[repoID]; ok {
		close(ch)
		delete(a.watchers, repoID)
	}
	return nil
}

// Emit delivers an event to the repository's subscriber channel, dropping it
// when the subscriber is not reading. It does NOT debounce; coalescing is
// WatcherService's job (see service.WatcherService.Emit).
func (a *Adapter) Emit(evt domain.FsChangedEvent) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if ch, ok := a.watchers[evt.RepoID]; ok {
		select {
		case ch <- evt:
		default:
		}
	}
}
