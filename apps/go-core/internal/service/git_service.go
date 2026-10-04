package service

import (
	"context"

	"github.com/SingulariTree/go-core/internal/domain"
)

// GitService handles mutating and read Git operations (service-design.md §1.1).
// Mutating ops are serialized per RepositoryId in real implementation (sync.Mutex map).
type GitService struct {
	gitPort   domain.GitPort
	cachePort domain.CachePort
	watcher   *WatcherService
}

// NewGitService creates a GitService.
func NewGitService(gitPort domain.GitPort, cachePort domain.CachePort, watcher *WatcherService) *GitService {
	return &GitService{gitPort: gitPort, cachePort: cachePort, watcher: watcher}
}

// notifyChange emits a watcher event so derived state (commit cache, lane
// layout) is invalidated after a mutating operation.
func (s *GitService) notifyChange(repoID domain.RepositoryId) {
	if s.watcher != nil {
		s.watcher.Emit(domain.FsChangedEvent{RepoID: repoID})
	}
}

// Status returns working-tree file status.
func (s *GitService) Status(ctx context.Context, repoID domain.RepositoryId) ([]domain.FileStatus, error) {
	if s.gitPort == nil {
		return nil, nil
	}
	return s.gitPort.Status(ctx, repoID)
}

// Stage stages paths.
func (s *GitService) Stage(ctx context.Context, repoID domain.RepositoryId, paths []string) error {
	if s.gitPort == nil {
		return nil
	}
	if err := s.gitPort.Stage(ctx, repoID, paths); err != nil {
		return err
	}
	if s.cachePort != nil {
		s.cachePort.Invalidate(repoID)
	}
	s.notifyChange(repoID)
	return nil
}

// Unstage unstages paths.
func (s *GitService) Unstage(ctx context.Context, repoID domain.RepositoryId, paths []string) error {
	if s.gitPort == nil {
		return nil
	}
	if err := s.gitPort.Unstage(ctx, repoID, paths); err != nil {
		return err
	}
	if s.cachePort != nil {
		s.cachePort.Invalidate(repoID)
	}
	s.notifyChange(repoID)
	return nil
}

// Commit creates a commit.
func (s *GitService) Commit(ctx context.Context, repoID domain.RepositoryId, msg string, author *domain.Signature) (*domain.Commit, error) {
	if s.gitPort == nil {
		return nil, domain.AppError{Code: domain.ErrCodeCommitFailed, Message: "git not configured"}
	}
	c, err := s.gitPort.Commit(ctx, repoID, msg, author)
	if err != nil {
		return nil, err
	}
	if s.cachePort != nil {
		s.cachePort.Invalidate(repoID)
	}
	s.notifyChange(repoID)
	return c, nil
}

// Diff returns diff between two oids.
func (s *GitService) Diff(ctx context.Context, repoID domain.RepositoryId, from, to domain.Oid) (*domain.Diff, error) {
	if s.gitPort == nil {
		return nil, domain.AppError{Code: domain.ErrCodeDiffFailed, Message: "git not configured"}
	}
	return s.gitPort.Diff(ctx, repoID, from, to)
}

// BranchList returns branches.
func (s *GitService) BranchList(ctx context.Context, repoID domain.RepositoryId) ([]domain.Branch, error) {
	if s.gitPort == nil {
		return nil, nil
	}
	return s.gitPort.BranchList(ctx, repoID)
}

// RemoteList returns configured remotes.
func (s *GitService) RemoteList(ctx context.Context, repoID domain.RepositoryId) ([]domain.Remote, error) {
	if s.gitPort == nil {
		return nil, nil
	}
	return s.gitPort.RemoteList(ctx, repoID)
}

// TagList returns tags.
func (s *GitService) TagList(ctx context.Context, repoID domain.RepositoryId) ([]domain.Tag, error) {
	if s.gitPort == nil {
		return nil, nil
	}
	return s.gitPort.TagList(ctx, repoID)
}

// Checkout checks out a ref.
func (s *GitService) Checkout(ctx context.Context, repoID domain.RepositoryId, ref domain.RefName) error {
	if s.gitPort == nil {
		return nil
	}
	if err := s.gitPort.Checkout(ctx, repoID, ref); err != nil {
		return err
	}
	if s.cachePort != nil {
		s.cachePort.Invalidate(repoID)
	}
	s.notifyChange(repoID)
	return nil
}

// Fetch streams progress for a fetch from remote, followed by an optional
// terminal error.
func (s *GitService) Fetch(ctx context.Context, repoID domain.RepositoryId, remote string, opts domain.RemoteOpOptions) (<-chan domain.RemoteOpResult, error) {
	if s.gitPort == nil {
		return nil, domain.AppError{Code: domain.ErrCodeFetchFailed, Message: "git not configured"}
	}
	ch, err := s.gitPort.Fetch(ctx, repoID, remote, opts)
	if err != nil {
		return nil, err
	}
	return s.wrapRemoteOp(ctx, repoID, ch), nil
}

// Push streams progress for publishing branch to remote, followed by an
// optional terminal error.
func (s *GitService) Push(ctx context.Context, repoID domain.RepositoryId, remote, branch string, opts domain.RemoteOpOptions) (<-chan domain.RemoteOpResult, error) {
	if s.gitPort == nil {
		return nil, domain.AppError{Code: domain.ErrCodePushFailed, Message: "git not configured"}
	}
	ch, err := s.gitPort.Push(ctx, repoID, remote, branch, opts)
	if err != nil {
		return nil, err
	}
	return s.wrapRemoteOp(ctx, repoID, ch), nil
}

// Pull streams progress for integrating remote branch, followed by an optional
// terminal error.
func (s *GitService) Pull(ctx context.Context, repoID domain.RepositoryId, remote, branch string, opts domain.RemoteOpOptions) (<-chan domain.RemoteOpResult, error) {
	if s.gitPort == nil {
		return nil, domain.AppError{Code: domain.ErrCodePullFailed, Message: "git not configured"}
	}
	ch, err := s.gitPort.Pull(ctx, repoID, remote, branch, opts)
	if err != nil {
		return nil, err
	}
	return s.wrapRemoteOp(ctx, repoID, ch), nil
}

// wrapRemoteOp proxies a remote operation's result channel. The commit cache is
// invalidated and the watcher notified only when the operation succeeds — i.e.
// the channel closes cleanly with no terminal error. On a terminal error the
// item is forwarded unchanged and derived state is left untouched, so a failed
// push/pull does not trigger a refresh that hides the failure. It exits on
// context cancellation so neither goroutine leaks (risks.md R12).
func (s *GitService) wrapRemoteOp(ctx context.Context, repoID domain.RepositoryId, in <-chan domain.RemoteOpResult) <-chan domain.RemoteOpResult {
	out := make(chan domain.RemoteOpResult)
	go func() {
		defer close(out)
		for {
			select {
			case r, ok := <-in:
				if !ok {
					// Clean channel close: the operation succeeded; refresh
					// derived state.
					if s.cachePort != nil {
						s.cachePort.Invalidate(repoID)
					}
					s.notifyChange(repoID)
					return
				}
				if r.Err != nil {
					// Terminal failure: forward it and do NOT invalidate/notify.
					select {
					case out <- r:
					case <-ctx.Done():
					}
					return
				}
				select {
				case out <- r:
				case <-ctx.Done():
					return
				}
			case <-ctx.Done():
				return
			}
		}
	}()
	return out
}
