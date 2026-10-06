package grpc

import (
	"context"
	"crypto/subtle"
	"strings"
	"time"

	googlegrpc "google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	singularitreev1 "github.com/SingulariTree/go-core/gen/go/singularitree/v1"
	"github.com/SingulariTree/go-core/internal/domain"
	"github.com/SingulariTree/go-core/internal/service"
)

// Server is the gRPC transport adapter for the singularitree.v1 GitCore service.
// It embeds UnimplementedGitCoreServer so not-yet-implemented RPCs return
// codes.Unimplemented instead of panicking.
type Server struct {
	singularitreev1.UnimplementedGitCoreServer

	repoSvc    *service.RepoService
	gitSvc     *service.GitService
	graphSvc   *service.GraphService
	watcherSvc *service.WatcherService
	cacheSvc   *service.CacheService
	token      string
	startedAt  time.Time
}

// NewServer creates the GitCore gRPC adapter. token, when non-empty, is enforced
// by the auth interceptors returned from UnaryAuthInterceptor/StreamAuthInterceptor.
func NewServer(repoSvc *service.RepoService, gitSvc *service.GitService, graphSvc *service.GraphService, watcherSvc *service.WatcherService, cacheSvc *service.CacheService, token string) *Server {
	return &Server{
		repoSvc:    repoSvc,
		gitSvc:     gitSvc,
		graphSvc:   graphSvc,
		watcherSvc: watcherSvc,
		cacheSvc:   cacheSvc,
		token:      token,
		startedAt:  time.Now(),
	}
}

// Register registers the GitCore service implementation on a grpc.Server.
func (s *Server) Register(gs *googlegrpc.Server) {
	singularitreev1.RegisterGitCoreServer(gs, s)
}

// Ping is the supervisor heartbeat (ipc-strategy.md §2.6).
func (s *Server) Ping(context.Context, *singularitreev1.PingRequest) (*singularitreev1.PingResponse, error) {
	return &singularitreev1.PingResponse{
		Ok:         true,
		UptimeMs:   uint64(time.Since(s.startedAt).Milliseconds()),
		QueueDepth: 0,
	}, nil
}

// OpenRepository validates and tracks a repository, returning its record.
func (s *Server) OpenRepository(ctx context.Context, req *singularitreev1.OpenRepositoryRequest) (*singularitreev1.Repository, error) {
	if s.repoSvc == nil {
		return nil, status.Error(codes.FailedPrecondition, "repo service not configured")
	}
	repo, err := s.repoSvc.Open(ctx, req.GetFsPath())
	if err != nil {
		return nil, appErrorToStatus(ctx, err)
	}
	return repositoryToProto(repo), nil
}

// GetRepository returns a tracked repository by ID.
func (s *Server) GetRepository(ctx context.Context, req *singularitreev1.GetRepositoryRequest) (*singularitreev1.Repository, error) {
	if s.repoSvc == nil {
		return nil, status.Error(codes.FailedPrecondition, "repo service not configured")
	}
	repo, err := s.repoSvc.Get(ctx, domain.RepositoryId(req.GetRepoId()))
	if err != nil {
		return nil, appErrorToStatus(ctx, err)
	}
	return repositoryToProto(repo), nil
}

// ListRepositories returns all tracked repositories (most recent first).
func (s *Server) ListRepositories(ctx context.Context, _ *singularitreev1.ListRepositoriesRequest) (*singularitreev1.ListRepositoriesResponse, error) {
	if s.repoSvc == nil {
		return nil, status.Error(codes.FailedPrecondition, "repo service not configured")
	}
	repos, err := s.repoSvc.List(ctx)
	if err != nil {
		return nil, appErrorToStatus(ctx, err)
	}
	out := &singularitreev1.ListRepositoriesResponse{
		Repositories: make([]*singularitreev1.Repository, 0, len(repos)),
	}
	for i := range repos {
		out.Repositories = append(out.Repositories, repositoryToProto(&repos[i]))
	}
	return out, nil
}

// RemoveRepository untracks a repository. The delete cascades to its cached
// rows (ON DELETE CASCADE, PRAGMA foreign_keys=ON); any in-memory state keyed
// by the repository ID is then dropped best-effort so stale lane layouts or
// cached commit windows are not served for the removed ID.
func (s *Server) RemoveRepository(ctx context.Context, req *singularitreev1.RemoveRepositoryRequest) (*singularitreev1.RemoveRepositoryResponse, error) {
	if s.repoSvc == nil {
		return nil, status.Error(codes.FailedPrecondition, "repo service not configured")
	}
	id := domain.RepositoryId(req.GetRepoId())
	if err := s.repoSvc.Remove(ctx, id); err != nil {
		return nil, appErrorToStatus(ctx, err)
	}
	if s.graphSvc != nil {
		s.graphSvc.Invalidate(id)
	}
	if s.cacheSvc != nil {
		s.cacheSvc.Invalidate(id)
	}
	return &singularitreev1.RemoveRepositoryResponse{}, nil
}

// GetCommits returns a window of commits plus the total reachable count.
func (s *Server) GetCommits(ctx context.Context, req *singularitreev1.GetCommitsRequest) (*singularitreev1.GetCommitsResponse, error) {
	if s.graphSvc == nil {
		return nil, status.Error(codes.FailedPrecondition, "graph service not configured")
	}
	repoID := domain.RepositoryId(req.GetRepoId())
	commits, total, err := s.graphSvc.Commits(ctx, repoID, int(req.GetOffset()), int(req.GetLimit()))
	if err != nil {
		return nil, appErrorToStatus(ctx, err)
	}
	// Lanes are computed in Go (ADR-008) and returned as a parallel array:
	// lanes[i] belongs to commits[i]. WindowLanes keeps columns continuous with
	// the full history from HEAD across scroll windows (stateful per-repo lane
	// state), falling back to the pure window-local Lanes when no Git port.
	lanes, err := s.graphSvc.WindowLanes(ctx, repoID, commits, int(req.GetOffset()))
	if err != nil {
		return nil, appErrorToStatus(ctx, err)
	}
	out := &singularitreev1.GetCommitsResponse{
		Commits: make([]*singularitreev1.Commit, 0, len(commits)),
		Total:   uint32(total),
		Lanes:   make([]*singularitreev1.Lane, 0, len(lanes)),
	}
	for _, c := range commits {
		out.Commits = append(out.Commits, commitToProto(c))
	}
	for _, l := range lanes {
		out.Lanes = append(out.Lanes, laneToProto(l))
	}
	return out, nil
}

// GetBranches returns the repository's local and remote-tracking branches.
func (s *Server) GetBranches(ctx context.Context, req *singularitreev1.GetBranchesRequest) (*singularitreev1.GetBranchesResponse, error) {
	if s.gitSvc == nil {
		return nil, status.Error(codes.FailedPrecondition, "git service not configured")
	}
	branches, err := s.gitSvc.BranchList(ctx, domain.RepositoryId(req.GetRepoId()))
	if err != nil {
		return nil, appErrorToStatus(ctx, err)
	}
	out := &singularitreev1.GetBranchesResponse{
		Branches: make([]*singularitreev1.Branch, 0, len(branches)),
	}
	for _, b := range branches {
		out.Branches = append(out.Branches, branchToProto(b))
	}
	return out, nil
}

// GetRemotes returns the repository's configured remotes.
func (s *Server) GetRemotes(ctx context.Context, req *singularitreev1.GetRemotesRequest) (*singularitreev1.GetRemotesResponse, error) {
	if s.gitSvc == nil {
		return nil, status.Error(codes.FailedPrecondition, "git service not configured")
	}
	remotes, err := s.gitSvc.RemoteList(ctx, domain.RepositoryId(req.GetRepoId()))
	if err != nil {
		return nil, appErrorToStatus(ctx, err)
	}
	out := &singularitreev1.GetRemotesResponse{
		Remotes: make([]*singularitreev1.Remote, 0, len(remotes)),
	}
	for _, r := range remotes {
		out.Remotes = append(out.Remotes, remoteToProto(r))
	}
	return out, nil
}

// GetTags returns the repository's tags.
func (s *Server) GetTags(ctx context.Context, req *singularitreev1.GetTagsRequest) (*singularitreev1.GetTagsResponse, error) {
	if s.gitSvc == nil {
		return nil, status.Error(codes.FailedPrecondition, "git service not configured")
	}
	tags, err := s.gitSvc.TagList(ctx, domain.RepositoryId(req.GetRepoId()))
	if err != nil {
		return nil, appErrorToStatus(ctx, err)
	}
	out := &singularitreev1.GetTagsResponse{
		Tags: make([]*singularitreev1.Tag, 0, len(tags)),
	}
	for _, tag := range tags {
		out.Tags = append(out.Tags, tagToProto(tag))
	}
	return out, nil
}

// Fetch runs `git fetch` and streams progress chunks to the client
// (server-streaming RPC). Errors before streaming starts are returned with the
// domain code attached as trailer metadata via appErrorToStatus.
func (s *Server) Fetch(req *singularitreev1.FetchRequest, stream googlegrpc.ServerStreamingServer[singularitreev1.Progress]) error {
	if s.gitSvc == nil {
		return status.Error(codes.FailedPrecondition, "git service not configured")
	}
	opts := domain.RemoteOpOptions{
		Prune: req.GetPrune(),
		Tags:  req.GetTags(),
		Force: req.GetForce(),
	}
	ch, err := s.gitSvc.Fetch(stream.Context(), domain.RepositoryId(req.GetRepoId()), req.GetRemote(), opts)
	if err != nil {
		return appErrorToStatus(stream.Context(), err)
	}
	return streamProgress(stream, ch)
}

// Push runs `git push` and streams progress chunks to the client.
func (s *Server) Push(req *singularitreev1.PushRequest, stream googlegrpc.ServerStreamingServer[singularitreev1.Progress]) error {
	if s.gitSvc == nil {
		return status.Error(codes.FailedPrecondition, "git service not configured")
	}
	opts := domain.RemoteOpOptions{
		SetUpstream:  req.GetSetUpstream(),
		RemoteBranch: req.GetRemoteBranch(),
		Tags:         req.GetTags(),
		Force:        req.GetForce(),
	}
	ch, err := s.gitSvc.Push(stream.Context(), domain.RepositoryId(req.GetRepoId()), req.GetRemote(), req.GetBranch(), opts)
	if err != nil {
		return appErrorToStatus(stream.Context(), err)
	}
	return streamProgress(stream, ch)
}

// Pull runs `git pull` and streams progress chunks to the client.
func (s *Server) Pull(req *singularitreev1.PullRequest, stream googlegrpc.ServerStreamingServer[singularitreev1.Progress]) error {
	if s.gitSvc == nil {
		return status.Error(codes.FailedPrecondition, "git service not configured")
	}
	opts := domain.RemoteOpOptions{
		LocalBranch: req.GetLocalBranch(),
		NoCommit:    req.GetNoCommit(),
		Log:         req.GetLog(),
		NoFF:        req.GetNoFf(),
		Rebase:      req.GetRebase(),
	}
	ch, err := s.gitSvc.Pull(stream.Context(), domain.RepositoryId(req.GetRepoId()), req.GetRemote(), req.GetBranch(), opts)
	if err != nil {
		return appErrorToStatus(stream.Context(), err)
	}
	return streamProgress(stream, ch)
}

// Checkout switches the repository's working tree to the requested ref. The
// renderer sends the clicked ref verbatim; the adapter resolves local branches,
// remote-tracking branches and detached refs. force discards tracked
// modifications and discard_untracked additionally discards untracked files.
func (s *Server) Checkout(ctx context.Context, req *singularitreev1.CheckoutRequest) (*singularitreev1.CheckoutResponse, error) {
	if s.gitSvc == nil {
		return nil, status.Error(codes.FailedPrecondition, "git service not configured")
	}
	if err := s.gitSvc.Checkout(ctx, domain.RepositoryId(req.GetRepoId()), domain.RefName{Raw: req.GetRefName()}, req.GetForce(), req.GetDiscardUntracked()); err != nil {
		return nil, appErrorToStatus(ctx, err)
	}
	return &singularitreev1.CheckoutResponse{}, nil
}

// StashPush saves the repository's working-tree changes to a new stash entry,
// used by the branch-switch confirmation flow to "save the changes".
func (s *Server) StashPush(ctx context.Context, req *singularitreev1.StashPushRequest) (*singularitreev1.StashPushResponse, error) {
	if s.gitSvc == nil {
		return nil, status.Error(codes.FailedPrecondition, "git service not configured")
	}
	st, err := s.gitSvc.StashPush(ctx, domain.RepositoryId(req.GetRepoId()), req.GetMessage())
	if err != nil {
		return nil, appErrorToStatus(ctx, err)
	}
	return &singularitreev1.StashPushResponse{Stash: stashToProto(st)}, nil
}

// streamProgress drains a domain RemoteOpResult channel, forwarding each
// progress chunk as a proto Progress. A terminal result carrying an Err is
// converted with appErrorToStatus so the client's Recv sees a non-OK status and
// the typed domain code in the trailer; a clean close returns nil (success). It
// returns early when Send fails or the context is cancelled, so no goroutine
// leaks (R12).
func streamProgress(stream googlegrpc.ServerStreamingServer[singularitreev1.Progress], ch <-chan domain.RemoteOpResult) error {
	for r := range ch {
		if r.Err != nil {
			return appErrorToStatus(stream.Context(), r.Err)
		}
		if r.Progress == nil {
			continue
		}
		if err := stream.Send(progressToProto(*r.Progress)); err != nil {
			return err
		}
	}
	return nil
}

// UnaryAuthInterceptor validates `authorization: Bearer <token>` metadata.
// When token is empty, authentication is disabled.
func UnaryAuthInterceptor(token string) googlegrpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, _ *googlegrpc.UnaryServerInfo, handler googlegrpc.UnaryHandler) (any, error) {
		if err := authorize(ctx, token); err != nil {
			return nil, err
		}
		return handler(ctx, req)
	}
}

// StreamAuthInterceptor validates `authorization: Bearer <token>` metadata for
// streaming RPCs.
func StreamAuthInterceptor(token string) googlegrpc.StreamServerInterceptor {
	return func(srv any, ss googlegrpc.ServerStream, _ *googlegrpc.StreamServerInfo, handler googlegrpc.StreamHandler) error {
		if err := authorize(ss.Context(), token); err != nil {
			return err
		}
		return handler(srv, ss)
	}
}

func authorize(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return status.Error(codes.Unauthenticated, "missing metadata")
	}
	want := "Bearer " + token
	for _, v := range md.Get("authorization") {
		if secureEqual(strings.TrimSpace(v), want) {
			return nil
		}
	}
	return status.Error(codes.Unauthenticated, "invalid or missing token")
}

// secureEqual compares a and b in constant time (length-checked first) so token
// validation does not leak information through timing. Behaviour is identical
// to == for the boolean result.
func secureEqual(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
