package grpc_test

import (
	"context"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	googlegrpc "google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	singularitreev1 "github.com/SingulariTree/go-core/gen/go/singularitree/v1"
	gitadapter "github.com/SingulariTree/go-core/internal/adapter/git"
	grpcadapter "github.com/SingulariTree/go-core/internal/adapter/grpc"
	"github.com/SingulariTree/go-core/internal/adapter/watcher"
	"github.com/SingulariTree/go-core/internal/repository"
	"github.com/SingulariTree/go-core/internal/service"
)

const testToken = "test-token-0123456789abcdef"

func gitRun(t *testing.T, dir string, args ...string) string {
	t.Helper()
	full := append([]string{"-C", dir}, args...)
	out, err := exec.Command("git", full...).CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
	return strings.TrimSpace(string(out))
}

// initFixtureRepo creates a real git repo with two commits.
func initFixtureRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	gitRun(t, dir, "init", "-q")
	gitRun(t, dir, "config", "user.email", "alice@example.com")
	gitRun(t, dir, "config", "user.name", "Alice")
	gitRun(t, dir, "config", "commit.gpgsign", "false")

	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("one\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitRun(t, dir, "add", "a.txt")
	gitRun(t, dir, "commit", "-q", "-m", "first commit")

	if err := os.WriteFile(filepath.Join(dir, "b.txt"), []byte("two\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitRun(t, dir, "add", "b.txt")
	gitRun(t, dir, "commit", "-q", "-m", "second commit")
	return dir
}

// startServer boots the real gRPC server on an ephemeral loopback port and
// returns the address. Everything is scoped to a temp SQLite DB.
func startServer(t *testing.T) string {
	t.Helper()
	ctx := context.Background()

	db, err := repository.OpenSQLite(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("OpenSQLite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := repository.ApplyMigrations(ctx, db); err != nil {
		t.Fatalf("ApplyMigrations: %v", err)
	}

	repoStore := repository.NewRepoStore(db)
	gitAdapter := gitadapter.NewAdapter(repoStore)
	repoSvc := service.NewRepoService(repoStore, gitAdapter)
	cacheSvc := service.NewCacheService(10)
	graphSvc := service.NewGraphService(gitAdapter, cacheSvc)
	watcherSvc := service.NewWatcherService(watcher.NewFsnotifyAdapter())
	gitSvc := service.NewGitService(gitAdapter, cacheSvc, watcherSvc)

	grpcSrv := grpcadapter.NewServer(repoSvc, gitSvc, graphSvc, watcherSvc, cacheSvc, testToken)
	gs := googlegrpc.NewServer(
		googlegrpc.UnaryInterceptor(grpcadapter.UnaryAuthInterceptor(testToken)),
		googlegrpc.StreamInterceptor(grpcadapter.StreamAuthInterceptor(testToken)),
	)
	grpcSrv.Register(gs)

	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	go func() { _ = gs.Serve(lis) }()
	t.Cleanup(gs.Stop)

	return lis.Addr().String()
}

func authed(ctx context.Context) context.Context {
	return metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+testToken)
}

func TestPingRequiresToken(t *testing.T) {
	addr := startServer(t)
	conn, err := googlegrpc.NewClient(addr, googlegrpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	defer conn.Close()
	client := singularitreev1.NewGitCoreClient(conn)

	// No token → Unauthenticated.
	_, err = client.Ping(context.Background(), &singularitreev1.PingRequest{})
	if status.Code(err) != codes.Unauthenticated {
		t.Fatalf("Ping without token code = %v, want Unauthenticated (err=%v)", status.Code(err), err)
	}

	// Wrong token → Unauthenticated.
	badCtx := metadata.AppendToOutgoingContext(context.Background(), "authorization", "Bearer wrong")
	_, err = client.Ping(badCtx, &singularitreev1.PingRequest{})
	if status.Code(err) != codes.Unauthenticated {
		t.Fatalf("Ping with wrong token code = %v, want Unauthenticated", status.Code(err))
	}

	// Correct token → ok.
	resp, err := client.Ping(authed(context.Background()), &singularitreev1.PingRequest{})
	if err != nil {
		t.Fatalf("Ping with token: %v", err)
	}
	if !resp.GetOk() {
		t.Error("Ping ok = false, want true")
	}
	if resp.GetQueueDepth() != 0 {
		t.Errorf("QueueDepth = %d, want 0", resp.GetQueueDepth())
	}
}

func TestOpenRepositoryThenGetCommits(t *testing.T) {
	addr := startServer(t)
	fixture := initFixtureRepo(t)
	head := gitRun(t, fixture, "rev-parse", "HEAD")

	conn, err := googlegrpc.NewClient(addr, googlegrpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	defer conn.Close()
	client := singularitreev1.NewGitCoreClient(conn)
	ctx := authed(context.Background())

	repo, err := client.OpenRepository(ctx, &singularitreev1.OpenRepositoryRequest{FsPath: fixture})
	if err != nil {
		t.Fatalf("OpenRepository: %v", err)
	}
	if repo.GetId() == "" {
		t.Fatal("OpenRepository returned empty id")
	}
	if repo.GetFsPath() != fixture {
		t.Errorf("FsPath = %q, want %q", repo.GetFsPath(), fixture)
	}
	if repo.GetName() != filepath.Base(fixture) {
		t.Errorf("Name = %q, want %q", repo.GetName(), filepath.Base(fixture))
	}

	// GetRepository round-trips.
	got, err := client.GetRepository(ctx, &singularitreev1.GetRepositoryRequest{RepoId: repo.GetId()})
	if err != nil {
		t.Fatalf("GetRepository: %v", err)
	}
	if got.GetId() != repo.GetId() {
		t.Errorf("GetRepository id = %q, want %q", got.GetId(), repo.GetId())
	}

	// ListRepositories includes it.
	list, err := client.ListRepositories(ctx, &singularitreev1.ListRepositoriesRequest{})
	if err != nil {
		t.Fatalf("ListRepositories: %v", err)
	}
	if len(list.GetRepositories()) != 1 {
		t.Fatalf("ListRepositories len = %d, want 1", len(list.GetRepositories()))
	}

	// GetCommits returns the fixture commits with real field values.
	resp, err := client.GetCommits(ctx, &singularitreev1.GetCommitsRequest{
		RepoId: repo.GetId(),
		Offset: 0,
		Limit:  10,
	})
	if err != nil {
		t.Fatalf("GetCommits: %v", err)
	}
	if resp.GetTotal() != 2 {
		t.Errorf("total = %d, want 2", resp.GetTotal())
	}
	commits := resp.GetCommits()
	if len(commits) != 2 {
		t.Fatalf("commits len = %d, want 2", len(commits))
	}
	newest := commits[0]
	if newest.GetOid().GetHex() != head {
		t.Errorf("commits[0].oid = %q, want HEAD %q", newest.GetOid().GetHex(), head)
	}
	if !strings.HasPrefix(newest.GetMessage(), "second commit") {
		t.Errorf("message = %q", newest.GetMessage())
	}
	if newest.GetAuthor().GetEmail() != "alice@example.com" {
		t.Errorf("author email = %q", newest.GetAuthor().GetEmail())
	}
	if len(newest.GetParents()) != 1 {
		t.Errorf("parents len = %d, want 1", len(newest.GetParents()))
	}
	if newest.GetCommittedAt() == "" {
		t.Error("committed_at is empty")
	}

	// Pagination window.
	page, err := client.GetCommits(ctx, &singularitreev1.GetCommitsRequest{
		RepoId: repo.GetId(),
		Offset: 1,
		Limit:  1,
	})
	if err != nil {
		t.Fatalf("GetCommits page: %v", err)
	}
	if len(page.GetCommits()) != 1 {
		t.Fatalf("page len = %d, want 1", len(page.GetCommits()))
	}
	if page.GetTotal() != 2 {
		t.Errorf("page total = %d, want 2", page.GetTotal())
	}
}

// TestOpenRepositoryRejectsNonRepo asserts that OpenRepository validates the
// path through the Git port: a plain temp directory is NOT_A_GIT_REPO (mapped to
// InvalidArgument) and the domain code travels back in the trailer.
func TestOpenRepositoryRejectsNonRepo(t *testing.T) {
	addr := startServer(t)
	conn, err := googlegrpc.NewClient(addr, googlegrpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	defer conn.Close()
	client := singularitreev1.NewGitCoreClient(conn)

	var trailer metadata.MD
	_, err = client.OpenRepository(
		authed(context.Background()),
		&singularitreev1.OpenRepositoryRequest{FsPath: t.TempDir()},
		googlegrpc.Trailer(&trailer),
	)
	if err == nil {
		t.Fatal("OpenRepository(non-repo) succeeded, want error")
	}
	if got := status.Code(err); got != codes.InvalidArgument {
		t.Fatalf("OpenRepository(non-repo) code = %v, want InvalidArgument (err=%v)", got, err)
	}
	trailerCodes := trailer.Get("x-app-error-code")
	if len(trailerCodes) == 0 || trailerCodes[0] != "NOT_A_GIT_REPO" {
		t.Fatalf("trailer x-app-error-code = %v, want [NOT_A_GIT_REPO]", trailerCodes)
	}
}

func TestGetRepositoryUnknown(t *testing.T) {
	addr := startServer(t)
	conn, err := googlegrpc.NewClient(addr, googlegrpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	defer conn.Close()
	client := singularitreev1.NewGitCoreClient(conn)

	_, err = client.GetRepository(authed(context.Background()), &singularitreev1.GetRepositoryRequest{RepoId: "nope"})
	if status.Code(err) != codes.NotFound {
		t.Fatalf("GetRepository(unknown) code = %v, want NotFound", status.Code(err))
	}
}
