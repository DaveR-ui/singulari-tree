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

// GetCommits returns a window of commits plus the total reachable count.
func (s *Server) GetCommits(ctx context.Context, req *singularitreev1.GetCommitsRequest) (*singularitreev1.GetCommitsResponse, error) {
	if s.graphSvc == nil {
		return nil, status.Error(codes.FailedPrecondition, "graph service not configured")
	}
	commits, total, err := s.graphSvc.Commits(ctx, domain.RepositoryId(req.GetRepoId()), int(req.GetOffset()), int(req.GetLimit()))
	if err != nil {
		return nil, appErrorToStatus(ctx, err)
	}
	out := &singularitreev1.GetCommitsResponse{
		Commits: make([]*singularitreev1.Commit, 0, len(commits)),
		Total:   uint32(total),
	}
	for _, c := range commits {
		out.Commits = append(out.Commits, commitToProto(c))
	}
	return out, nil
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
