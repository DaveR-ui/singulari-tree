package ghcli_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/SingulariTree/go-core/internal/adapter/ghcli"
	"github.com/SingulariTree/go-core/internal/domain"
)

func writeExecutable(t *testing.T, dir, name string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("write executable: %v", err)
	}
	return path
}

func TestTokenFoundAndTrimmed(t *testing.T) {
	dir := t.TempDir()
	bin := writeExecutable(t, dir, "gh")
	t.Setenv("PATH", "")

	var gotPath string
	var gotEnv []string
	var gotArgs []string
	src := ghcli.NewTokenSourceWithRunner(dir, func(_ context.Context, path string, env []string, args ...string) (string, string, int, error) {
		gotPath = path
		gotEnv = env
		gotArgs = args
		return "  gh_token_123 \n", "", 0, nil
	})

	token, err := src.Token(context.Background(), "")
	if err != nil {
		t.Fatalf("Token: %v", err)
	}
	if token != "gh_token_123" {
		t.Errorf("token = %q, want %q", token, "gh_token_123")
	}
	if gotPath != bin {
		t.Errorf("resolved path = %q, want %q", gotPath, bin)
	}
	if len(gotArgs) != 2 || gotArgs[0] != "auth" || gotArgs[1] != "token" {
		t.Errorf("args = %v, want [auth token]", gotArgs)
	}
	foundPath := false
	for _, entry := range gotEnv {
		if entry == "PATH="+ghcli.SearchedPath(dir) {
			foundPath = true
		}
	}
	if !foundPath {
		t.Errorf("child env does not carry PATH=%s: %v", ghcli.SearchedPath(dir), gotEnv)
	}
}

func TestTokenNotFound(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("PATH", dir)

	src := ghcli.NewTokenSourceWithRunner(dir, func(context.Context, string, []string, ...string) (string, string, int, error) {
		t.Fatal("runner must not be called when the binary is missing")
		return "", "", 0, nil
	})

	_, err := src.Token(context.Background(), "gh")
	var appErr domain.AppError
	if !errors.As(err, &appErr) {
		t.Fatalf("err = %v, want domain.AppError", err)
	}
	if appErr.Code != domain.ErrCodeGHCLINotFound {
		t.Errorf("code = %q, want %q", appErr.Code, domain.ErrCodeGHCLINotFound)
	}
	if appErr.Details["binary"] != "gh" {
		t.Errorf("details.binary = %q, want gh", appErr.Details["binary"])
	}
	want := ghcli.SearchedPath(dir)
	if appErr.Details["searched_path"] != want {
		t.Errorf("details.searched_path = %q, want %q", appErr.Details["searched_path"], want)
	}
}

func TestTokenUnauthenticatedNeverLeaksStderr(t *testing.T) {
	dir := t.TempDir()
	writeExecutable(t, dir, "gh")
	t.Setenv("PATH", "")

	const secret = "SECRET-STDERR-99"
	src := ghcli.NewTokenSourceWithRunner(dir, func(context.Context, string, []string, ...string) (string, string, int, error) {
		return "", "gh: " + secret, 1, errors.New("exit status 1")
	})

	_, err := src.Token(context.Background(), "gh")
	var appErr domain.AppError
	if !errors.As(err, &appErr) {
		t.Fatalf("err = %v, want domain.AppError", err)
	}
	if appErr.Code != domain.ErrCodeGHCLIUnauthenticated {
		t.Errorf("code = %q, want %q", appErr.Code, domain.ErrCodeGHCLIUnauthenticated)
	}
	if appErr.Details["exit_code"] != "1" {
		t.Errorf("details.exit_code = %q, want 1", appErr.Details["exit_code"])
	}
	if strings.Contains(appErr.Message, secret) {
		t.Errorf("message leaked stderr: %q", appErr.Message)
	}
	for k, v := range appErr.Details {
		if strings.Contains(k, secret) || strings.Contains(v, secret) {
			t.Errorf("details leaked stderr: %s=%s", k, v)
		}
	}
}

func TestTokenLaunchFailureIsNotFound(t *testing.T) {
	dir := t.TempDir()
	bin := writeExecutable(t, dir, "gh")
	t.Setenv("PATH", "")

	const secret = "SECRET-LAUNCH-STDERR"
	src := ghcli.NewTokenSourceWithRunner(dir, func(context.Context, string, []string, ...string) (string, string, int, error) {
		// A resolved binary that could not be executed: the process never ran.
		return "", secret, -1, errors.New("fork/exec: permission denied")
	})

	_, err := src.Token(context.Background(), "gh")
	var appErr domain.AppError
	if !errors.As(err, &appErr) {
		t.Fatalf("err = %v, want domain.AppError", err)
	}
	if appErr.Code != domain.ErrCodeGHCLINotFound {
		t.Errorf("code = %q, want %q (launch failure is not an auth failure)", appErr.Code, domain.ErrCodeGHCLINotFound)
	}
	if appErr.Details["binary"] != bin {
		t.Errorf("details.binary = %q, want %q", appErr.Details["binary"], bin)
	}
	if appErr.Details["exit_code"] != "-1" {
		t.Errorf("details.exit_code = %q, want -1", appErr.Details["exit_code"])
	}
	for k, v := range appErr.Details {
		if strings.Contains(k, secret) || strings.Contains(v, secret) {
			t.Errorf("details leaked stderr: %s=%s", k, v)
		}
	}
	if strings.Contains(appErr.Message, secret) {
		t.Errorf("message leaked stderr: %q", appErr.Message)
	}
}

func TestTokenEmptyStdoutIsUnauthenticated(t *testing.T) {
	dir := t.TempDir()
	writeExecutable(t, dir, "gh")
	t.Setenv("PATH", "")

	src := ghcli.NewTokenSourceWithRunner(dir, func(context.Context, string, []string, ...string) (string, string, int, error) {
		return "   \n", "", 0, nil
	})

	_, err := src.Token(context.Background(), "gh")
	var appErr domain.AppError
	if !errors.As(err, &appErr) {
		t.Fatalf("err = %v, want domain.AppError", err)
	}
	if appErr.Code != domain.ErrCodeGHCLIUnauthenticated {
		t.Errorf("code = %q, want %q", appErr.Code, domain.ErrCodeGHCLIUnauthenticated)
	}
}

func TestLookupPrefersSearchPathOverParentPath(t *testing.T) {
	searchDir := t.TempDir()
	otherDir := t.TempDir()
	want := writeExecutable(t, searchDir, "gh")
	writeExecutable(t, otherDir, "gh")

	searchPath := searchDir + string(os.PathListSeparator) + otherDir
	got, ok := ghcli.Lookup(searchPath, "gh")
	if !ok {
		t.Fatal("Lookup returned not found")
	}
	if got != want {
		t.Errorf("Lookup = %q, want %q", got, want)
	}
}

func TestLookupAbsolutePathReturnedAsIs(t *testing.T) {
	searchDir := t.TempDir()
	otherDir := t.TempDir()
	absolute := writeExecutable(t, otherDir, "gh")
	// A same-named binary in the search path must not shadow the absolute one.
	writeExecutable(t, searchDir, "gh")

	got, ok := ghcli.Lookup(searchDir, absolute)
	if !ok {
		t.Fatal("Lookup returned not found for an absolute executable path")
	}
	if got != absolute {
		t.Errorf("Lookup = %q, want %q", got, absolute)
	}
}
