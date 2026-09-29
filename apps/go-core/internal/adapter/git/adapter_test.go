package git

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/SingulariTree/go-core/internal/domain"
)

// fakeRepoPort is a minimal domain.RepoPort returning a fixed fsPath for any id.
type fakeRepoPort struct{ fsPath string }

func (f *fakeRepoPort) Open(context.Context, string) (*domain.Repository, error) {
	return nil, domain.ErrRepoNotFound
}
func (f *fakeRepoPort) List(context.Context) ([]domain.Repository, error) { return nil, nil }
func (f *fakeRepoPort) Remove(context.Context, domain.RepositoryId) error { return nil }
func (f *fakeRepoPort) Get(_ context.Context, id domain.RepositoryId) (*domain.Repository, error) {
	return &domain.Repository{ID: id, FsPath: f.fsPath}, nil
}

// gitRun runs `git -C dir args...` and fails the test on error.
func gitRun(t *testing.T, dir string, args ...string) string {
	t.Helper()
	full := append([]string{"-C", dir}, args...)
	cmd := exec.Command("git", full...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
	return strings.TrimSpace(string(out))
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

// initRepo creates a real git repository with two commits and returns its path.
func initRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	gitRun(t, dir, "init", "-q")
	gitRun(t, dir, "config", "user.email", "alice@example.com")
	gitRun(t, dir, "config", "user.name", "Alice")
	gitRun(t, dir, "config", "commit.gpgsign", "false")

	writeFile(t, filepath.Join(dir, "a.txt"), "one\n")
	gitRun(t, dir, "add", "a.txt")
	gitRun(t, dir, "commit", "-q", "-m", "first commit")

	writeFile(t, filepath.Join(dir, "b.txt"), "two\n")
	gitRun(t, dir, "add", "b.txt")
	gitRun(t, dir, "commit", "-q", "-m", "second commit\n\nbody line")
	return dir
}

func TestListAndGet(t *testing.T) {
	dir := initRepo(t)
	head := gitRun(t, dir, "rev-parse", "HEAD")
	parent := gitRun(t, dir, "rev-parse", "HEAD~1")

	repoID := domain.RepositoryId("repo-1")
	a := NewAdapter(&fakeRepoPort{fsPath: dir})
	ctx := context.Background()

	commits, total, err := a.List(ctx, repoID, 0, 10)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if total != 2 {
		t.Fatalf("total = %d, want 2", total)
	}
	if len(commits) != 2 {
		t.Fatalf("len(commits) = %d, want 2", len(commits))
	}

	// Newest first.
	if commits[0].Oid.Hex != head {
		t.Errorf("commits[0].Oid = %s, want HEAD %s", commits[0].Oid.Hex, head)
	}
	if commits[1].Oid.Hex != parent {
		t.Errorf("commits[1].Oid = %s, want HEAD~1 %s", commits[1].Oid.Hex, parent)
	}

	newest := commits[0]
	if !strings.HasPrefix(newest.Message, "second commit") {
		t.Errorf("message = %q, want prefix %q", newest.Message, "second commit")
	}
	if !strings.Contains(newest.Message, "body line") {
		t.Errorf("message should retain body, got %q", newest.Message)
	}
	if newest.Author.Name != "Alice" || newest.Author.Email != "alice@example.com" {
		t.Errorf("author = %+v, want Alice <alice@example.com>", newest.Author)
	}
	if newest.Committer.Email != "alice@example.com" {
		t.Errorf("committer email = %q", newest.Committer.Email)
	}
	if len(newest.Parents) != 1 || newest.Parents[0].Hex != parent {
		t.Errorf("parents = %+v, want [%s]", newest.Parents, parent)
	}
	if len(newest.TreeOid.Hex) != 40 || len(newest.Oid.Hex) != 40 {
		t.Errorf("oid/tree lengths unexpected: %s / %s", newest.Oid.Hex, newest.TreeOid.Hex)
	}
	if newest.CommittedAt.IsZero() {
		t.Error("committed_at is zero")
	}
	if len(commits[1].Parents) != 0 {
		t.Errorf("root commit parents = %+v, want none", commits[1].Parents)
	}
}

func TestListPagination(t *testing.T) {
	dir := initRepo(t)
	parent := gitRun(t, dir, "rev-parse", "HEAD~1")

	repoID := domain.RepositoryId("repo-1")
	a := NewAdapter(&fakeRepoPort{fsPath: dir})
	ctx := context.Background()

	page, total, err := a.List(ctx, repoID, 1, 1)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if total != 2 {
		t.Fatalf("total = %d, want 2", total)
	}
	if len(page) != 1 {
		t.Fatalf("len(page) = %d, want 1", len(page))
	}
	if page[0].Oid.Hex != parent {
		t.Errorf("page[0].Oid = %s, want %s", page[0].Oid.Hex, parent)
	}
}

func TestGet(t *testing.T) {
	dir := initRepo(t)
	head := gitRun(t, dir, "rev-parse", "HEAD")

	repoID := domain.RepositoryId("repo-1")
	a := NewAdapter(&fakeRepoPort{fsPath: dir})
	ctx := context.Background()

	oid, err := domain.NewOid(head)
	if err != nil {
		t.Fatalf("NewOid: %v", err)
	}
	c, err := a.Get(ctx, repoID, oid)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if c.Oid.Hex != head {
		t.Errorf("Get oid = %s, want %s", c.Oid.Hex, head)
	}

	missing, _ := domain.NewOid(strings.Repeat("0", 40))
	_, err = a.Get(ctx, repoID, missing)
	var appErr domain.AppError
	if !errors.As(err, &appErr) || appErr.Code != domain.ErrCodeCommitNotFound {
		t.Fatalf("Get(missing) err = %v, want COMMIT_NOT_FOUND", err)
	}
}

func TestResolve(t *testing.T) {
	dir := initRepo(t)
	sub := filepath.Join(dir, "sub")
	if err := os.Mkdir(sub, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	a := NewAdapter(&fakeRepoPort{fsPath: dir})
	topLevel, commonDir, err := a.Resolve(context.Background(), sub)
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}

	wantDir, err := filepath.EvalSymlinks(dir)
	if err != nil {
		t.Fatalf("EvalSymlinks: %v", err)
	}
	gotDir, err := filepath.EvalSymlinks(topLevel)
	if err != nil {
		t.Fatalf("EvalSymlinks(topLevel): %v", err)
	}
	if gotDir != wantDir {
		t.Errorf("topLevel = %q, want %q", gotDir, wantDir)
	}

	wantCommon := filepath.Join(wantDir, ".git")
	gotCommon, err := filepath.EvalSymlinks(commonDir)
	if err != nil {
		t.Fatalf("EvalSymlinks(commonDir): %v", err)
	}
	if gotCommon != wantCommon {
		t.Errorf("commonDir = %q, want %q", gotCommon, wantCommon)
	}
}

func TestResolveNotAGitRepo(t *testing.T) {
	a := NewAdapter(&fakeRepoPort{fsPath: t.TempDir()})
	_, _, err := a.Resolve(context.Background(), t.TempDir())
	var appErr domain.AppError
	if !errors.As(err, &appErr) || appErr.Code != domain.ErrCodeNotAGitRepo {
		t.Fatalf("Resolve err = %v, want NOT_A_GIT_REPO", err)
	}
}

func TestParseRefs(t *testing.T) {
	out := strings.Join([]string{
		"aaa" + unitSep + "refs/heads/main" + unitSep + "",
		"bbb" + unitSep + "refs/remotes/origin/main" + unitSep + "",
		"ccc" + unitSep + "refs/tags/v1.0.0" + unitSep + "",
		// Annotated tag: objectname is the tag object, *objectname the commit.
		"tagobject" + unitSep + "refs/tags/v2.0.0" + unitSep + "ccc",
		// Unrelated namespace must be ignored.
		"ddd" + unitSep + "refs/notes/commits" + unitSep + "",
	}, "\n")

	got := parseRefs(out)

	want := map[string][]domain.RefLabel{
		"aaa": {{Name: "main", Kind: domain.RefKindBranch}},
		"bbb": {{Name: "origin/main", Kind: domain.RefKindRemote}},
		"ccc": {
			{Name: "v1.0.0", Kind: domain.RefKindTag},
			{Name: "v2.0.0", Kind: domain.RefKindTag},
		},
	}
	if len(got) != len(want) {
		t.Fatalf("parseRefs keys = %d, want %d (%v)", len(got), len(want), got)
	}
	for oid, wantRefs := range want {
		refs := got[oid]
		if len(refs) != len(wantRefs) {
			t.Fatalf("refs[%s] len = %d, want %d", oid, len(refs), len(wantRefs))
		}
		for i := range refs {
			if refs[i] != wantRefs[i] {
				t.Errorf("refs[%s][%d] = %+v, want %+v", oid, i, refs[i], wantRefs[i])
			}
		}
	}
}

func TestListPopulatesRefs(t *testing.T) {
	dir := initRepo(t)
	// Deterministic branch name independent of init.defaultBranch.
	gitRun(t, dir, "branch", "-M", "main")
	gitRun(t, dir, "branch", "feature")
	gitRun(t, dir, "tag", "v1.0.0")

	repoID := domain.RepositoryId("repo-1")
	a := NewAdapter(&fakeRepoPort{fsPath: dir})
	ctx := context.Background()

	commits, _, err := a.List(ctx, repoID, 0, 10)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(commits) != 2 {
		t.Fatalf("len(commits) = %d, want 2", len(commits))
	}

	got := map[string]string{}
	for _, r := range commits[0].Refs {
		got[r.Name] = r.Kind
	}
	want := map[string]string{
		"HEAD":    domain.RefKindHead,
		"main":    domain.RefKindBranch,
		"feature": domain.RefKindBranch,
		"v1.0.0":  domain.RefKindTag,
	}
	if len(got) != len(want) {
		t.Fatalf("HEAD refs = %v, want %v", got, want)
	}
	for name, kind := range want {
		if got[name] != kind {
			t.Errorf("ref %q kind = %q, want %q", name, got[name], kind)
		}
	}

	if len(commits[1].Refs) != 0 {
		t.Errorf("parent commit refs = %+v, want none", commits[1].Refs)
	}
}

func TestListEmptyRepoDegrades(t *testing.T) {
	dir := t.TempDir()
	gitRun(t, dir, "init", "-q")

	repoID := domain.RepositoryId("repo-1")
	a := NewAdapter(&fakeRepoPort{fsPath: dir})

	commits, total, err := a.List(context.Background(), repoID, 0, 10)
	if err != nil {
		t.Fatalf("List on empty repo: %v", err)
	}
	if total != 0 || len(commits) != 0 {
		t.Fatalf("empty repo = (%d commits, total %d), want (0, 0)", len(commits), total)
	}
}

func TestUnimplementedReturnsTypedError(t *testing.T) {
	a := NewAdapter(&fakeRepoPort{fsPath: t.TempDir()})
	err := a.Stage(context.Background(), domain.RepositoryId("x"), []string{"a"})
	var appErr domain.AppError
	if !errors.As(err, &appErr) || appErr.Code != domain.ErrCodeNotImplemented {
		t.Fatalf("Stage err = %v, want NOT_IMPLEMENTED", err)
	}
}
