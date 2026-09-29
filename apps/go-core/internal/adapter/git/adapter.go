// Package git implements the read side of domain.GitPort by shelling out to the
// system `git` binary (ADR-007/R7: exec git, not go-git). All invocations pass
// the repository path via `-C` and never build a shell string, so paths are not
// subject to shell interpolation.
//
// Phase 0 implements the read path only (Resolve / List / Get). Mutating and
// auxiliary operations return domain.ErrCodeNotImplemented explicitly rather
// than faking success.
package git

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/SingulariTree/go-core/internal/domain"
)

const (
	// recordSep (0x1e) terminates each commit record; unitSep (0x1f) separates
	// fields. The message (%B) is the last field and may contain newlines.
	recordSep = "\x1e"
	unitSep   = "\x1f"

	// logPrettyFormat mirrors the field order parsed by parseCommits:
	// H,P,an,ae,aI,cn,ce,cI,T,B.
	logPrettyFormat = "%H" + unitSep + "%P" + unitSep + "%an" + unitSep + "%ae" + unitSep +
		"%aI" + unitSep + "%cn" + unitSep + "%ce" + unitSep + "%cI" + unitSep +
		"%T" + unitSep + "%B" + recordSep

	// refPrettyFormat mirrors the field order parsed by parseRefs:
	// objectname, refname, *objectname (dereferenced annotated-tag target).
	// For a lightweight tag the third field is empty; for an annotated tag it
	// holds the tagged commit so the decoration lands on the commit, not on the
	// tag object.
	refPrettyFormat = "%(objectname)" + unitSep + "%(refname)" + unitSep + "%(*objectname)"

	// defaultListLimit guards against unbounded reads when the caller omits a
	// limit (the read path must always be paginated).
	defaultListLimit = 200
)

// Adapter implements domain.GitPort over the system git executable.
type Adapter struct {
	repoPort domain.RepoPort
}

// NewAdapter creates a git adapter that resolves repository IDs to filesystem
// paths through the given RepoPort.
func NewAdapter(repoPort domain.RepoPort) *Adapter {
	return &Adapter{repoPort: repoPort}
}

var _ domain.GitPort = (*Adapter)(nil)

// Resolve returns the repository top-level directory and its git common dir for
// the given filesystem path. Returns domain.ErrNotAGitRepo when the path is not
// a git repository.
func (a *Adapter) Resolve(ctx context.Context, fsPath string) (topLevel, commonDir string, err error) {
	topLevel, err = runGit(ctx, fsPath, "rev-parse", "--show-toplevel")
	if err != nil {
		return "", "", domain.ErrNotAGitRepo.WithDetail("fs_path", fsPath)
	}
	commonDir, err = runGit(ctx, fsPath, "rev-parse", "--path-format=absolute", "--git-common-dir")
	if err != nil {
		return "", "", domain.ErrNotAGitRepo.WithDetail("fs_path", fsPath)
	}
	return strings.TrimSpace(topLevel), strings.TrimSpace(commonDir), nil
}

// List returns a window of commits (topological order, newest first) plus the
// total number of reachable commits. offset/limit are applied via
// --skip/--max-count so the full history is never loaded.
func (a *Adapter) List(ctx context.Context, repoID domain.RepositoryId, offset, limit int) ([]domain.Commit, int, error) {
	fsPath, err := a.resolvePath(ctx, repoID)
	if err != nil {
		return nil, 0, err
	}
	if offset < 0 {
		offset = 0
	}
	if limit <= 0 {
		limit = defaultListLimit
	}

	out, err := runGit(ctx, fsPath, "-c", "log.showSignature=false", "log",
		"--pretty=format:"+logPrettyFormat,
		"--topo-order",
		"--skip="+strconv.Itoa(offset),
		"--max-count="+strconv.Itoa(limit),
	)
	if err != nil {
		// An empty repository has no HEAD; report an empty window, not an error.
		total, countErr := a.countCommits(ctx, fsPath)
		if countErr != nil || total == 0 {
			return []domain.Commit{}, 0, nil
		}
		return nil, 0, err
	}

	commits, err := parseCommits(out)
	if err != nil {
		return nil, 0, err
	}
	// Ref decorations are attached after parsing; the `git log` pretty format
	// stays 10 fields so parseCommits/buildCommit are unaffected. A failure to
	// enumerate refs (empty/unborn repo) degrades to no decorations rather than
	// failing the read path.
	a.attachRefs(ctx, fsPath, commits)

	total, err := a.countCommits(ctx, fsPath)
	if err != nil {
		return nil, 0, err
	}
	return commits, total, nil
}

// attachRefs populates Commit.Refs in place for the listed commits: branch,
// remote and tag decorations from a single for-each-ref call, plus a synthetic
// {Name:"HEAD", Kind:"head"} on the commit HEAD currently points at. Any error
// degrades to leaving refs unset (the read path never fails on decorations).
func (a *Adapter) attachRefs(ctx context.Context, fsPath string, commits []domain.Commit) {
	if len(commits) == 0 {
		return
	}
	byOid := map[string][]domain.RefLabel{}
	if out, err := runGit(ctx, fsPath, "for-each-ref", "--format="+refPrettyFormat); err == nil {
		byOid = parseRefs(out)
	}
	head := a.headOid(ctx, fsPath)

	for i := range commits {
		oid := commits[i].Oid.Hex
		var refs []domain.RefLabel
		if head != "" && oid == head {
			refs = append(refs, domain.RefLabel{Name: "HEAD", Kind: domain.RefKindHead})
		}
		refs = append(refs, byOid[oid]...)
		commits[i].Refs = refs
	}
}

// headOid returns the oid HEAD resolves to, or "" when HEAD is unborn/absent.
func (a *Adapter) headOid(ctx context.Context, fsPath string) string {
	out, err := runGit(ctx, fsPath, "rev-parse", "--verify", "--quiet", "HEAD")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(out)
}

// parseRefs parses `git for-each-ref --format=refPrettyFormat` output into a
// map from commit oid hex to its decorations. It is a pure helper (unit-tested
// directly). Lines that do not classify as head/branch/remote/tag are ignored.
func parseRefs(out string) map[string][]domain.RefLabel {
	byOid := map[string][]domain.RefLabel{}
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimRight(line, "\r")
		if line == "" {
			continue
		}
		fields := strings.Split(line, unitSep)
		if len(fields) < 2 {
			continue
		}
		objectOid := strings.TrimSpace(fields[0])
		ref := strings.TrimSpace(fields[1])
		derefOid := ""
		if len(fields) >= 3 {
			derefOid = strings.TrimSpace(fields[2])
		}
		name, kind, ok := classifyRef(ref)
		if !ok {
			continue
		}
		target := objectOid
		// Annotated tags point at a tag object; decorate the tagged commit.
		if kind == domain.RefKindTag && derefOid != "" {
			target = derefOid
		}
		if target == "" {
			continue
		}
		byOid[target] = append(byOid[target], domain.RefLabel{Name: name, Kind: kind})
	}
	return byOid
}

// classifyRef maps a full refname to its short label and unambiguous kind.
func classifyRef(ref string) (name, kind string, ok bool) {
	switch {
	case strings.HasPrefix(ref, "refs/heads/"):
		return strings.TrimPrefix(ref, "refs/heads/"), domain.RefKindBranch, true
	case strings.HasPrefix(ref, "refs/remotes/"):
		return strings.TrimPrefix(ref, "refs/remotes/"), domain.RefKindRemote, true
	case strings.HasPrefix(ref, "refs/tags/"):
		return strings.TrimPrefix(ref, "refs/tags/"), domain.RefKindTag, true
	default:
		return "", "", false
	}
}

// Get returns a single commit by oid.
func (a *Adapter) Get(ctx context.Context, repoID domain.RepositoryId, oid domain.Oid) (*domain.Commit, error) {
	fsPath, err := a.resolvePath(ctx, repoID)
	if err != nil {
		return nil, err
	}
	out, err := runGit(ctx, fsPath, "-c", "log.showSignature=false", "log",
		"-1", "--pretty=format:"+logPrettyFormat, oid.Hex)
	if err != nil {
		return nil, domain.ErrCommitNotFound.WithDetail("oid", oid.Hex)
	}
	commits, err := parseCommits(out)
	if err != nil {
		return nil, err
	}
	if len(commits) == 0 {
		return nil, domain.ErrCommitNotFound.WithDetail("oid", oid.Hex)
	}
	return &commits[0], nil
}

func (a *Adapter) countCommits(ctx context.Context, fsPath string) (int, error) {
	out, err := runGit(ctx, fsPath, "rev-list", "--count", "HEAD")
	if err != nil {
		return 0, err
	}
	n, err := strconv.Atoi(strings.TrimSpace(out))
	if err != nil {
		return 0, fmt.Errorf("parse rev-list count %q: %w", out, err)
	}
	return n, nil
}

func (a *Adapter) resolvePath(ctx context.Context, repoID domain.RepositoryId) (string, error) {
	if a.repoPort == nil {
		return "", domain.ErrRepoNotFound
	}
	repo, err := a.repoPort.Get(ctx, repoID)
	if err != nil {
		return "", err
	}
	if repo == nil || repo.FsPath == "" {
		return "", domain.ErrRepoNotFound.WithDetail("repo_id", string(repoID))
	}
	return repo.FsPath, nil
}

// runGit executes `git -C <dir> <args...>` and returns trimmed stdout.
func runGit(ctx context.Context, dir string, args ...string) (string, error) {
	full := append([]string{"-C", dir}, args...)
	cmd := exec.CommandContext(ctx, "git", full...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(stderr.String()))
	}
	return stdout.String(), nil
}

func parseCommits(out string) ([]domain.Commit, error) {
	parts := strings.Split(out, recordSep)
	commits := make([]domain.Commit, 0, len(parts))
	for _, part := range parts {
		part = strings.Trim(part, "\n\r")
		if part == "" {
			continue
		}
		fields := strings.SplitN(part, unitSep, 10)
		if len(fields) != 10 {
			return nil, fmt.Errorf("git log: expected 10 fields, got %d", len(fields))
		}
		c, err := buildCommit(fields)
		if err != nil {
			return nil, err
		}
		commits = append(commits, c)
	}
	return commits, nil
}

func buildCommit(f []string) (domain.Commit, error) {
	oid, err := domain.NewOid(f[0])
	if err != nil {
		return domain.Commit{}, err
	}
	tree, err := domain.NewOid(f[8])
	if err != nil {
		return domain.Commit{}, err
	}

	parents := make([]domain.Oid, 0)
	for _, raw := range strings.Fields(f[1]) {
		p, err := domain.NewOid(raw)
		if err != nil {
			return domain.Commit{}, err
		}
		parents = append(parents, p)
	}

	authorWhen, err := time.Parse(time.RFC3339, strings.TrimSpace(f[4]))
	if err != nil {
		return domain.Commit{}, fmt.Errorf("parse author date %q: %w", f[4], err)
	}
	committerWhen, err := time.Parse(time.RFC3339, strings.TrimSpace(f[7]))
	if err != nil {
		return domain.Commit{}, fmt.Errorf("parse committer date %q: %w", f[7], err)
	}

	return domain.Commit{
		Oid:     oid,
		Parents: parents,
		Author:  domain.Signature{Name: f[2], Email: f[3], When: authorWhen},
		Committer: domain.Signature{
			Name:  f[5],
			Email: f[6],
			When:  committerWhen,
		},
		Message:     f[9],
		TreeOid:     tree,
		CommittedAt: committerWhen,
	}, nil
}

func notImplemented(op string) domain.AppError {
	return domain.AppError{
		Code:    domain.ErrCodeNotImplemented,
		Message: op + " is not implemented in Phase 0 (read path only)",
	}
}

// --- Unimplemented Phase 1/2 operations (explicit typed errors) ---

// Status returns working-tree status. Phase 3.
func (a *Adapter) Status(context.Context, domain.RepositoryId) ([]domain.FileStatus, error) {
	return nil, notImplemented("Status")
}

// Stage stages paths. Phase 3.
func (a *Adapter) Stage(context.Context, domain.RepositoryId, []string) error {
	return notImplemented("Stage")
}

// Unstage unstages paths. Phase 3.
func (a *Adapter) Unstage(context.Context, domain.RepositoryId, []string) error {
	return notImplemented("Unstage")
}

// Commit creates a commit. Phase 3.
func (a *Adapter) Commit(context.Context, domain.RepositoryId, string, *domain.Signature) (*domain.Commit, error) {
	return nil, notImplemented("Commit")
}

// Diff returns a diff between two oids. Phase 4.
func (a *Adapter) Diff(context.Context, domain.RepositoryId, domain.Oid, domain.Oid) (*domain.Diff, error) {
	return nil, notImplemented("Diff")
}

// BranchList lists branches. Phase 5.
func (a *Adapter) BranchList(context.Context, domain.RepositoryId) ([]domain.Branch, error) {
	return nil, notImplemented("BranchList")
}

// BranchCreate creates a branch. Phase 5.
func (a *Adapter) BranchCreate(context.Context, domain.RepositoryId, string, domain.Oid) (*domain.Branch, error) {
	return nil, notImplemented("BranchCreate")
}

// BranchDelete deletes a branch. Phase 5.
func (a *Adapter) BranchDelete(context.Context, domain.RepositoryId, domain.RefName) error {
	return notImplemented("BranchDelete")
}

// Checkout checks out a ref. Phase 5.
func (a *Adapter) Checkout(context.Context, domain.RepositoryId, domain.RefName) error {
	return notImplemented("Checkout")
}

// RemoteList lists remotes. Phase 6.
func (a *Adapter) RemoteList(context.Context, domain.RepositoryId) ([]domain.Remote, error) {
	return nil, notImplemented("RemoteList")
}

// TagList lists tags. Phase 5.
func (a *Adapter) TagList(context.Context, domain.RepositoryId) ([]domain.Tag, error) {
	return nil, notImplemented("TagList")
}

// StashList lists stashes. Phase 5.
func (a *Adapter) StashList(context.Context, domain.RepositoryId) ([]domain.Stash, error) {
	return nil, notImplemented("StashList")
}

// WorktreeList lists worktrees. Phase 5.
func (a *Adapter) WorktreeList(context.Context, domain.RepositoryId) ([]domain.Worktree, error) {
	return nil, notImplemented("WorktreeList")
}
