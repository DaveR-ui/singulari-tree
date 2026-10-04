package service

import (
	"context"
	"sync"
	"time"

	"github.com/SingulariTree/go-core/internal/domain"
)

// DefaultDebounceWindow is the coalescing window applied to filesystem change
// bursts before registered callbacks fire (service-design.md §4).
const DefaultDebounceWindow = 150 * time.Millisecond

// timerHandle is the subset of *time.Timer that WatcherService needs. It is an
// interface so tests can substitute a deterministic scheduler.
type timerHandle interface {
	Stop() bool
}

// timerScheduler abstracts time.AfterFunc. Production uses realScheduler;
// tests inject a fake so coalescing can be asserted without sleeping.
type timerScheduler interface {
	afterFunc(d time.Duration, fn func()) timerHandle
}

type realScheduler struct{}

func (realScheduler) afterFunc(d time.Duration, fn func()) timerHandle {
	return time.AfterFunc(d, fn)
}

// debounceEntry holds the debounce state for one repository. last is the most
// recent event and is replayed to callbacks when the window elapses. token is
// bumped on every (re)schedule so a timer that fires after being reset cannot
// flush a newer burst.
type debounceEntry struct {
	last  domain.FsChangedEvent
	timer timerHandle
	token uint64
}

// WatcherService owns FS subscriptions and coalescing (service-design.md §4,
// default 150ms debounce). Emit does not invoke callbacks synchronously: bursts
// of events for the same repository within the debounce window collapse into a
// single callback carrying the most recent event.
type WatcherService struct {
	port   domain.WatcherPort
	window time.Duration
	sched  timerScheduler

	mu        sync.Mutex
	callbacks []func(domain.FsChangedEvent)

	debMu   sync.Mutex
	pending map[domain.RepositoryId]*debounceEntry
}

// NewWatcherService creates a WatcherService using DefaultDebounceWindow.
func NewWatcherService(port domain.WatcherPort) *WatcherService {
	return NewWatcherServiceWithWindow(port, DefaultDebounceWindow)
}

// NewWatcherServiceWithWindow creates a WatcherService that coalesces events
// for a repository over the given window. A non-positive window falls back to
// DefaultDebounceWindow.
func NewWatcherServiceWithWindow(port domain.WatcherPort, window time.Duration) *WatcherService {
	return newWatcherService(port, window, realScheduler{})
}

// newWatcherService is the internal constructor with an injectable scheduler
// (used by tests to fire timers deterministically).
func newWatcherService(port domain.WatcherPort, window time.Duration, sched timerScheduler) *WatcherService {
	if window <= 0 {
		window = DefaultDebounceWindow
	}
	if sched == nil {
		sched = realScheduler{}
	}
	return &WatcherService{
		port:    port,
		window:  window,
		sched:   sched,
		pending: make(map[domain.RepositoryId]*debounceEntry),
	}
}

// OnChange registers fn to be invoked once per settled debounce window with the
// most recent FsChangedEvent for that repository. It is used to invalidate
// derived state (e.g. GraphService lane layout) when the working tree or refs
// change. Callbacks run outside the registration lock.
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

// Emit records ev and (re)arms the per-repository debounce timer. It returns
// immediately; callbacks run once the window elapses, carrying the last event
// seen for that repository. Safe for concurrent use by fsnotify goroutines.
func (s *WatcherService) Emit(ev domain.FsChangedEvent) {
	s.debMu.Lock()
	defer s.debMu.Unlock()

	e := s.pending[ev.RepoID]
	if e == nil {
		e = &debounceEntry{}
		s.pending[ev.RepoID] = e
	}
	e.last = ev
	e.token++
	token := e.token
	if e.timer != nil {
		e.timer.Stop()
	}
	repoID := ev.RepoID
	e.timer = s.sched.afterFunc(s.window, func() {
		s.flush(repoID, token)
	})
}

// flush invokes callbacks once for a settled burst. It is a no-op when the
// entry was deleted or rescheduled since the timer was armed (token mismatch).
func (s *WatcherService) flush(repoID domain.RepositoryId, token uint64) {
	s.debMu.Lock()
	e := s.pending[repoID]
	if e == nil || e.token != token {
		s.debMu.Unlock()
		return
	}
	ev := e.last
	delete(s.pending, repoID)
	s.debMu.Unlock()

	s.invoke(ev)
}

// invoke runs callbacks outside the registration lock.
func (s *WatcherService) invoke(ev domain.FsChangedEvent) {
	s.mu.Lock()
	cbs := make([]func(domain.FsChangedEvent), len(s.callbacks))
	copy(cbs, s.callbacks)
	s.mu.Unlock()
	for _, fn := range cbs {
		fn(ev)
	}
}
