package repository

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	"github.com/SingulariTree/go-core/internal/domain"
)

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := OpenSQLite(filepath.Join(t.TempDir(), "cache.db"))
	if err != nil {
		t.Fatalf("OpenSQLite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := ApplyMigrations(context.Background(), db); err != nil {
		t.Fatalf("ApplyMigrations: %v", err)
	}
	return db
}

func TestOpenSQLiteAndMigrations(t *testing.T) {
	db := openTestDB(t)

	// Re-applying must be idempotent.
	if err := ApplyMigrations(context.Background(), db); err != nil {
		t.Fatalf("ApplyMigrations (second run): %v", err)
	}

	for _, table := range []string{"repos", "commit_cache", "file_status", "stash_cache"} {
		var name string
		err := db.QueryRow(
			`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table,
		).Scan(&name)
		if errors.Is(err, sql.ErrNoRows) {
			t.Errorf("table %q not created", table)
		} else if err != nil {
			t.Errorf("query table %q: %v", table, err)
		}
	}
}

func TestOpenSQLiteInMemory(t *testing.T) {
	db, err := OpenSQLite(":memory:")
	if err != nil {
		t.Fatalf("OpenSQLite(:memory:): %v", err)
	}
	defer db.Close()

	if err := ApplyMigrations(context.Background(), db); err != nil {
		t.Fatalf("ApplyMigrations: %v", err)
	}
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM repos`).Scan(&n); err != nil {
		t.Fatalf("count repos: %v", err)
	}
	if n != 0 {
		t.Fatalf("repos count = %d, want 0", n)
	}
}

func TestRepoStoreRoundTrip(t *testing.T) {
	ctx := context.Background()
	store := NewRepoStore(openTestDB(t))

	pathA := t.TempDir()
	pathB := t.TempDir()

	repoA, err := store.Open(ctx, pathA)
	if err != nil {
		t.Fatalf("Open(A): %v", err)
	}
	if repoA.ID == "" {
		t.Fatal("Open(A) returned empty id")
	}
	if !filepath.IsAbs(repoA.FsPath) {
		t.Errorf("FsPath %q is not absolute", repoA.FsPath)
	}
	if repoA.Name != filepath.Base(pathA) {
		t.Errorf("Name = %q, want %q", repoA.Name, filepath.Base(pathA))
	}
	if repoA.CommonDir != filepath.Join(repoA.FsPath, ".git") {
		t.Errorf("CommonDir = %q, want default .git", repoA.CommonDir)
	}

	// Idempotent re-open: same id, preserved created_at, refreshed last_opened_at.
	reopened, err := store.Open(ctx, pathA)
	if err != nil {
		t.Fatalf("Open(A) again: %v", err)
	}
	if reopened.ID != repoA.ID {
		t.Errorf("id changed on reopen: %q -> %q", repoA.ID, reopened.ID)
	}
	if !reopened.CreatedAt.Equal(repoA.CreatedAt) {
		t.Errorf("created_at changed on reopen: %v -> %v", repoA.CreatedAt, reopened.CreatedAt)
	}
	if reopened.LastOpenedAt.Before(repoA.LastOpenedAt) {
		t.Errorf("last_opened_at went backwards: %v -> %v", repoA.LastOpenedAt, reopened.LastOpenedAt)
	}

	// Second repo opened after A should sort first (last_opened_at DESC).
	repoB, err := store.Open(ctx, pathB)
	if err != nil {
		t.Fatalf("Open(B): %v", err)
	}

	list, err := store.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("List len = %d, want 2", len(list))
	}
	if list[0].ID != repoB.ID {
		t.Errorf("List[0] = %q, want most recent B %q", list[0].ID, repoB.ID)
	}

	got, err := store.Get(ctx, repoA.ID)
	if err != nil {
		t.Fatalf("Get(A): %v", err)
	}
	if got.FsPath != repoA.FsPath {
		t.Errorf("Get(A).FsPath = %q, want %q", got.FsPath, repoA.FsPath)
	}

	if err := store.Remove(ctx, repoA.ID); err != nil {
		t.Fatalf("Remove(A): %v", err)
	}
	if _, err := store.Get(ctx, repoA.ID); err == nil {
		t.Fatal("Get(A) after Remove succeeded, want error")
	} else {
		var appErr domain.AppError
		if !errors.As(err, &appErr) || appErr.Code != domain.ErrCodeRepoNotFound {
			t.Errorf("Get(A) after Remove err = %v, want REPO_NOT_FOUND", err)
		}
	}

	if err := store.Remove(ctx, domain.RepositoryId("does-not-exist")); err == nil {
		t.Fatal("Remove(unknown) succeeded, want error")
	}

	list, err = store.List(ctx)
	if err != nil {
		t.Fatalf("List after Remove: %v", err)
	}
	if len(list) != 1 || list[0].ID != repoB.ID {
		t.Fatalf("List after Remove = %+v, want only B", list)
	}
}
