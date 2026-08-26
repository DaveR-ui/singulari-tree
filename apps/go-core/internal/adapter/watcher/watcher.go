package watcher

import (
	"context"
	"sync"

	"github.com/SingulariTree/go-core/internal/domain"
)

// Adapter is the fsnotify + polling fallback stub (service-design.md §4).
// Real implementation uses fsnotify to watch .git/index, .git/HEAD, refs, worktree.
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

// Watch subscribes to FsChanged events (debounce 150ms coalescing in service).
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

// Emit fans out an event (called on fsnotify callback, debounced 150ms coalesce).
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
