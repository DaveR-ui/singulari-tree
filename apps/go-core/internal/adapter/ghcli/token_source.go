// Package ghcli resolves the GitHub CLI binary and reads the authenticated
// token from `gh auth token` (github-real-data-guide.md §3 HS1, §12a).
//
// The Go core is the only owner of the token and of the network: the token is
// held in memory, never serialized to the renderer, and raw stderr from `gh` is
// never surfaced (it can echo the user).
package ghcli

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/SingulariTree/go-core/internal/domain"
)

// CommandRunner executes a resolved binary and returns stdout, stderr and the
// process exit code. It is injectable so tests never touch a real `gh`.
type CommandRunner func(ctx context.Context, path string, env []string, args ...string) (stdout, stderr string, exitCode int, err error)

// TokenSource obtains a GitHub token from the `gh` CLI.
type TokenSource struct {
	searchPath string
	run        CommandRunner
}

// NewTokenSource creates a TokenSource whose binary resolution prepends the
// SINGULARITREE_GH_PATH dirs (searchPath, split on os.PathListSeparator) to the
// inherited PATH (github-real-data-guide.md §12a).
func NewTokenSource(searchPath string) *TokenSource {
	return &TokenSource{searchPath: searchPath, run: execRunner}
}

// NewTokenSourceWithRunner creates a TokenSource with an injected runner; used
// by tests.
func NewTokenSourceWithRunner(searchPath string, runner CommandRunner) *TokenSource {
	return &TokenSource{searchPath: searchPath, run: runner}
}

// Token runs `<gh> auth token` and returns the trimmed token.
//
// Errors are structured and never include raw stderr:
//   - GH_CLI_NOT_FOUND: binary unresolved (Details {binary, searched_path}) or
//     the resolved binary could not be executed, i.e. the process never started
//     (Details {binary, exit_code}).
//   - GH_CLI_UNAUTHENTICATED: the process ran but exited non-zero or produced no
//     token; Details {binary, exit_code}.
func (s *TokenSource) Token(ctx context.Context, ghBinary string) (string, error) {
	if ghBinary == "" {
		ghBinary = "gh"
	}
	combined := SearchedPath(s.searchPath)
	binary, ok := Lookup(combined, ghBinary)
	if !ok {
		return "", domain.AppError{
			Code:    domain.ErrCodeGHCLINotFound,
			Message: "gh CLI not found",
			Details: map[string]string{
				"binary":        ghBinary,
				"searched_path": combined,
			},
		}
	}

	stdout, _, exitCode, err := s.run(ctx, binary, withPath(combined), "auth", "token")
	token := strings.TrimSpace(stdout)
	if err != nil || exitCode != 0 || token == "" {
		// A runner error with a zero exit code means the process never started;
		// normalize to the -1 launch-failure sentinel (real exit codes are
		// 0-255, so a negative code is unambiguously "never ran").
		if exitCode == 0 && err != nil {
			exitCode = -1
		}
		// Launch/exec failure is a resolution problem, not an auth problem:
		// reporting it as "not authenticated" would wrongly send the user to
		// `gh auth login`. Raw stderr is still never surfaced.
		if exitCode < 0 {
			return "", domain.AppError{
				Code:    domain.ErrCodeGHCLINotFound,
				Message: "gh CLI could not be executed",
				Details: map[string]string{
					"binary":    binary,
					"exit_code": strconv.Itoa(exitCode),
				},
			}
		}
		return "", domain.AppError{
			Code:    domain.ErrCodeGHCLIUnauthenticated,
			Message: "gh CLI is not authenticated",
			Details: map[string]string{
				"binary":    binary,
				"exit_code": strconv.Itoa(exitCode),
			},
		}
	}
	return token, nil
}

// Lookup resolves ghBinary against searchPath (a PATH-style list): it searches
// each directory itself because exec.Command resolves against the parent PATH,
// then falls back to exec.LookPath. It returns an absolute executable path.
func Lookup(searchPath, ghBinary string) (string, bool) {
	if ghBinary == "" {
		ghBinary = "gh"
	}
	if filepath.IsAbs(ghBinary) || strings.ContainsRune(ghBinary, os.PathSeparator) {
		if isExecutable(ghBinary) {
			return absolute(ghBinary), true
		}
		return "", false
	}
	for _, dir := range filepath.SplitList(searchPath) {
		if dir == "" {
			dir = "."
		}
		candidate := filepath.Join(dir, ghBinary)
		if isExecutable(candidate) {
			return absolute(candidate), true
		}
	}
	if found, err := exec.LookPath(ghBinary); err == nil {
		return absolute(found), true
	}
	return "", false
}

// SearchedPath returns the PATH actually searched when resolving the gh binary:
// the SINGULARITREE_GH_PATH dirs prepended to the inherited PATH. It is used by
// the early startup diagnostic and by GH_CLI_NOT_FOUND details.
func SearchedPath(searchPath string) string {
	parent := os.Getenv("PATH")
	if searchPath == "" {
		return parent
	}
	if parent == "" {
		return searchPath
	}
	return searchPath + string(os.PathListSeparator) + parent
}

func absolute(path string) string {
	if abs, err := filepath.Abs(path); err == nil {
		return abs
	}
	return path
}

func isExecutable(path string) bool {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}
	return info.Mode().Perm()&0o111 != 0
}

// withPath returns a copy of the process environment with PATH replaced by
// combined, so the child `gh` resolves its own helpers from the same list.
func withPath(combined string) []string {
	env := os.Environ()
	out := make([]string, 0, len(env)+1)
	for _, entry := range env {
		if strings.HasPrefix(strings.ToUpper(entry), "PATH=") {
			continue
		}
		out = append(out, entry)
	}
	return append(out, "PATH="+combined)
}

// execRunner is the default CommandRunner; it executes the resolved absolute
// path directly and captures stdout/stderr separately.
func execRunner(ctx context.Context, path string, env []string, args ...string) (string, string, int, error) {
	cmd := exec.CommandContext(ctx, path, args...)
	cmd.Env = env
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	exitCode := 0
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = -1
		}
	}
	return stdout.String(), stderr.String(), exitCode, err
}
