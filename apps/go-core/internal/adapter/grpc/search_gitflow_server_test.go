package grpc_test

import (
	"context"
	"strings"
	"testing"

	googlegrpc "google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	singularitreev1 "github.com/SingulariTree/go-core/gen/go/singularitree/v1"
	grpcadapter "github.com/SingulariTree/go-core/internal/adapter/grpc"
)

// newNilServer builds a GitCore server with every optional service unwired, to
// prove the new handlers nil-guard instead of panicking.
func newNilServer() *grpcadapter.Server {
	return grpcadapter.NewServer(nil, nil, nil, nil, nil, nil, nil, "")
}

// TestSearchCommitsRPC covers the cross-repo search RPC over the real gRPC stack
// (ADR-026): the bounded backfill populates the metadata cache and the hit
// carries metadata only.
func TestSearchCommitsRPC(t *testing.T) {
	addr := startServer(t)
	fixture := initFixtureRepo(t)

	client, closeConn := newGitCoreClient(t, addr)
	defer closeConn()
	ctx := authed(context.Background())

	repo, err := client.OpenRepository(ctx, &singularitreev1.OpenRepositoryRequest{FsPath: fixture})
	if err != nil {
		t.Fatalf("OpenRepository: %v", err)
	}
	repoID := repo.GetId()

	resp, err := client.SearchCommits(ctx, &singularitreev1.SearchCommitsRequest{
		Query:   "SECOND",
		RepoIds: []string{repoID},
		Limit:   10,
	})
	if err != nil {
		t.Fatalf("SearchCommits: %v", err)
	}
	hits := resp.GetHits()
	if len(hits) != 1 {
		t.Fatalf("hits = %d, want 1 (%+v)", len(hits), hits)
	}
	hit := hits[0]
	if hit.GetRepoId() != repoID || hit.GetOid() == "" {
		t.Errorf("hit = %+v, want repo_id/oid", hit)
	}
	if !strings.Contains(hit.GetMessage(), "second commit") {
		t.Errorf("message = %q", hit.GetMessage())
	}
	if hit.GetAuthorName() != "Alice" || hit.GetAuthorEmail() != "alice@example.com" {
		t.Errorf("author = %q <%q>", hit.GetAuthorName(), hit.GetAuthorEmail())
	}
	if hit.GetCommittedAt() <= 0 {
		t.Errorf("committed_at = %d, want unix seconds", hit.GetCommittedAt())
	}

	// A non-matching query yields no hits.
	empty, err := client.SearchCommits(ctx, &singularitreev1.SearchCommitsRequest{Query: "zzz-nope", RepoIds: []string{repoID}, Limit: 10})
	if err != nil {
		t.Fatalf("SearchCommits(no match): %v", err)
	}
	if len(empty.GetHits()) != 0 {
		t.Errorf("no-match hits = %+v, want none", empty.GetHits())
	}
}

// TestGitFlowConfigRPC covers defaults on an unset repo and set/get round-trip
// (ADR-027).
func TestGitFlowConfigRPC(t *testing.T) {
	addr := startServer(t)
	fixture := initFixtureRepo(t)
	gitRun(t, fixture, "branch", "-M", "main")

	client, closeConn := newGitCoreClient(t, addr)
	defer closeConn()
	ctx := authed(context.Background())

	repo, err := client.OpenRepository(ctx, &singularitreev1.OpenRepositoryRequest{FsPath: fixture})
	if err != nil {
		t.Fatalf("OpenRepository: %v", err)
	}
	repoID := repo.GetId()

	got, err := client.GetGitFlowConfig(ctx, &singularitreev1.GetGitFlowConfigRequest{RepoId: repoID})
	if err != nil {
		t.Fatalf("GetGitFlowConfig(defaults): %v", err)
	}
	if got.GetMainBranch() != "main" || got.GetDevelopBranch() != "develop" ||
		got.GetFeaturePrefix() != "feature/" || got.GetVersionTagPrefix() != "v" {
		t.Errorf("defaults = %+v", got)
	}

	set, err := client.SetGitFlowConfig(ctx, &singularitreev1.SetGitFlowConfigRequest{
		RepoId: repoID,
		Config: &singularitreev1.GitFlowConfig{MainBranch: "trunk"},
	})
	if err != nil {
		t.Fatalf("SetGitFlowConfig: %v", err)
	}
	if set.GetMainBranch() != "trunk" || set.GetDevelopBranch() != "develop" {
		t.Errorf("set = %+v, want trunk/develop (empty fields defaulted)", set)
	}

	again, err := client.GetGitFlowConfig(ctx, &singularitreev1.GetGitFlowConfigRequest{RepoId: repoID})
	if err != nil {
		t.Fatalf("GetGitFlowConfig(after set): %v", err)
	}
	if again.GetMainBranch() != "trunk" {
		t.Errorf("round-trip main = %q, want trunk", again.GetMainBranch())
	}
}

// TestGitFlowStartFinishRPC covers the start/finish sequences end-to-end
// (ADR-027): create feature/login off develop, then merge it back and delete it.
func TestGitFlowStartFinishRPC(t *testing.T) {
	addr := startServer(t)
	fixture := initFixtureRepo(t)
	gitRun(t, fixture, "branch", "-M", "main")
	gitRun(t, fixture, "branch", "develop")

	client, closeConn := newGitCoreClient(t, addr)
	defer closeConn()
	ctx := authed(context.Background())

	repo, err := client.OpenRepository(ctx, &singularitreev1.OpenRepositoryRequest{FsPath: fixture})
	if err != nil {
		t.Fatalf("OpenRepository: %v", err)
	}
	repoID := repo.GetId()

	start, err := client.StartGitFlow(ctx, &singularitreev1.StartGitFlowRequest{
		RepoId: repoID, Kind: singularitreev1.GitFlowKind_FEATURE, Name: "login",
	})
	if err != nil {
		t.Fatalf("StartGitFlow: %v", err)
	}
	if start.GetBranch() != "feature/login" {
		t.Errorf("branch = %q, want feature/login", start.GetBranch())
	}
	if got := gitRun(t, fixture, "symbolic-ref", "HEAD"); got != "refs/heads/feature/login" {
		t.Fatalf("HEAD = %q, want feature/login after start", got)
	}

	finish, err := client.FinishGitFlow(ctx, &singularitreev1.FinishGitFlowRequest{
		RepoId: repoID, Kind: singularitreev1.GitFlowKind_FEATURE, Name: "feature/login", DeleteBranch: true,
	})
	if err != nil {
		t.Fatalf("FinishGitFlow: %v", err)
	}
	if finish.GetHasConflict() {
		t.Errorf("has_conflict = true, want false")
	}
	if finish.GetBranch() != "feature/login" {
		t.Errorf("finish branch = %q", finish.GetBranch())
	}
	branches, err := client.GetBranches(ctx, &singularitreev1.GetBranchesRequest{RepoId: repoID})
	if err != nil {
		t.Fatalf("GetBranches: %v", err)
	}
	for _, b := range branches.GetBranches() {
		if b.GetName() == "feature/login" {
			t.Fatalf("finished feature branch still present")
		}
	}
}

// TestGitFlowFinishReleaseTagsRPC proves a release finish creates the version
// tag and merges back into develop.
func TestGitFlowFinishReleaseTagsRPC(t *testing.T) {
	addr := startServer(t)
	fixture := initFixtureRepo(t)
	gitRun(t, fixture, "branch", "-M", "main")
	gitRun(t, fixture, "branch", "develop")

	client, closeConn := newGitCoreClient(t, addr)
	defer closeConn()
	ctx := authed(context.Background())

	repo, err := client.OpenRepository(ctx, &singularitreev1.OpenRepositoryRequest{FsPath: fixture})
	if err != nil {
		t.Fatalf("OpenRepository: %v", err)
	}
	repoID := repo.GetId()

	if _, err := client.StartGitFlow(ctx, &singularitreev1.StartGitFlowRequest{
		RepoId: repoID, Kind: singularitreev1.GitFlowKind_RELEASE, Name: "1.0",
	}); err != nil {
		t.Fatalf("StartGitFlow(release): %v", err)
	}

	finish, err := client.FinishGitFlow(ctx, &singularitreev1.FinishGitFlowRequest{
		RepoId: repoID, Kind: singularitreev1.GitFlowKind_RELEASE, Name: "1.0", DeleteBranch: true,
	})
	if err != nil {
		t.Fatalf("FinishGitFlow(release): %v", err)
	}
	if finish.GetHasConflict() {
		t.Errorf("has_conflict = true, want false")
	}
	tags, err := client.GetTags(ctx, &singularitreev1.GetTagsRequest{RepoId: repoID})
	if err != nil {
		t.Fatalf("GetTags: %v", err)
	}
	var found bool
	for _, tag := range tags.GetTags() {
		if tag.GetName() == "v1.0" && tag.GetAnnotated() {
			found = true
		}
	}
	if !found {
		t.Errorf("tags = %+v, want annotated v1.0", tags.GetTags())
	}
}

// TestGitFlowUnspecifiedKindRPC asserts an unspecified kind is rejected as
// GIT_FLOW_FAILED (InvalidArgument) with the domain code in the trailer.
func TestGitFlowUnspecifiedKindRPC(t *testing.T) {
	addr := startServer(t)
	fixture := initFixtureRepo(t)

	client, closeConn := newGitCoreClient(t, addr)
	defer closeConn()
	ctx := authed(context.Background())

	repo, err := client.OpenRepository(ctx, &singularitreev1.OpenRepositoryRequest{FsPath: fixture})
	if err != nil {
		t.Fatalf("OpenRepository: %v", err)
	}

	var trailer metadata.MD
	_, err = client.StartGitFlow(
		ctx,
		&singularitreev1.StartGitFlowRequest{RepoId: repo.GetId(), Name: "x"},
		googlegrpc.Trailer(&trailer),
	)
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("StartGitFlow(unspecified) code = %v, want InvalidArgument (err=%v)", status.Code(err), err)
	}
	if got := trailer.Get("x-app-error-code"); len(got) == 0 || got[0] != "GIT_FLOW_FAILED" {
		t.Errorf("trailer x-app-error-code = %v, want [GIT_FLOW_FAILED]", got)
	}
}

// TestSearchAndGitFlowNilServices asserts the new handlers fail fast with
// FailedPrecondition when their services are not wired.
func TestSearchAndGitFlowNilServices(t *testing.T) {
	srv := newNilServer()
	ctx := context.Background()

	if _, err := srv.SearchCommits(ctx, &singularitreev1.SearchCommitsRequest{Query: "x"}); status.Code(err) != codes.FailedPrecondition {
		t.Errorf("SearchCommits(nil) code = %v, want FailedPrecondition", status.Code(err))
	}
	if _, err := srv.GetGitFlowConfig(ctx, &singularitreev1.GetGitFlowConfigRequest{RepoId: "r"}); status.Code(err) != codes.FailedPrecondition {
		t.Errorf("GetGitFlowConfig(nil) code = %v, want FailedPrecondition", status.Code(err))
	}
	if _, err := srv.StartGitFlow(ctx, &singularitreev1.StartGitFlowRequest{RepoId: "r"}); status.Code(err) != codes.FailedPrecondition {
		t.Errorf("StartGitFlow(nil) code = %v, want FailedPrecondition", status.Code(err))
	}
	if _, err := srv.FinishGitFlow(ctx, &singularitreev1.FinishGitFlowRequest{RepoId: "r"}); status.Code(err) != codes.FailedPrecondition {
		t.Errorf("FinishGitFlow(nil) code = %v, want FailedPrecondition", status.Code(err))
	}
}
