package service

import (
	"context"
	"fmt"
	"reflect"
	"testing"
	"time"

	"github.com/SingulariTree/go-core/internal/domain"
)

// commit builds a fixture commit; short labels are used as (fake) oid hex since
// Lanes only reads Oid.Hex and parent order.
func commit(oid string, parents ...string) domain.Commit {
	ps := make([]domain.Oid, 0, len(parents))
	for _, p := range parents {
		ps = append(ps, domain.Oid{Hex: p, Kind: "SHA1"})
	}
	return domain.Commit{Oid: domain.Oid{Hex: oid, Kind: "SHA1"}, Parents: ps}
}

// assertLanes checks index alignment plus the expected lane index / Continues
// per row.
func assertLanes(t *testing.T, got []domain.Lane, wantIndex []int, wantContinues []bool) {
	t.Helper()
	if len(wantIndex) != len(wantContinues) {
		t.Fatalf("fixture error: index/continues length mismatch")
	}
	if len(got) != len(wantIndex) {
		t.Fatalf("len(lanes) = %d, want %d (index-aligned with commits)", len(got), len(wantIndex))
	}
	for i := range got {
		if got[i].Index != wantIndex[i] {
			t.Errorf("lane[%d].Index = %d, want %d", i, got[i].Index, wantIndex[i])
		}
		if got[i].Continues != wantContinues[i] {
			t.Errorf("lane[%d].Continues = %v, want %v", i, got[i].Continues, wantContinues[i])
		}
		if got[i].Color != got[i].Index%lanePaletteSize {
			t.Errorf("lane[%d].Color = %d, want %d", i, got[i].Color, got[i].Index%lanePaletteSize)
		}
	}
}

func lanesOf(t *testing.T, commits []domain.Commit) []domain.Lane {
	t.Helper()
	svc := NewGraphService(nil, nil)
	lanes, err := svc.Lanes(context.Background(), domain.RepositoryId("repo"), commits)
	if err != nil {
		t.Fatalf("Lanes: %v", err)
	}
	return lanes
}

func TestLanesEmpty(t *testing.T) {
	lanes := lanesOf(t, nil)
	if len(lanes) != 0 {
		t.Fatalf("len(lanes) = %d, want 0", len(lanes))
	}
}

func TestLanesSingleCommit(t *testing.T) {
	lanes := lanesOf(t, []domain.Commit{commit("a")})
	assertLanes(t, lanes, []int{0}, []bool{false})
}

func TestLanesLinearChain(t *testing.T) {
	// a -> b -> c (newest first).
	lanes := lanesOf(t, []domain.Commit{
		commit("a", "b"),
		commit("b", "c"),
		commit("c"),
	})
	assertLanes(t, lanes, []int{0, 0, 0}, []bool{true, true, false})
}

func TestLanesBranchAndMerge(t *testing.T) {
	//      m
	//     / \
	//    a   b
	//     \ /
	//    base
	lanes := lanesOf(t, []domain.Commit{
		commit("m", "a", "b"),
		commit("a", "base"),
		commit("b", "base"),
		commit("base"),
	})
	assertLanes(t, lanes, []int{0, 0, 1, 0}, []bool{true, true, true, false})
}

func TestLanesOctopusMerge(t *testing.T) {
	// m merges a, b, x; all three share base.
	lanes := lanesOf(t, []domain.Commit{
		commit("m", "a", "b", "x"),
		commit("a", "base"),
		commit("b", "base"),
		commit("x", "base"),
		commit("base"),
	})
	assertLanes(t, lanes, []int{0, 0, 1, 2, 0}, []bool{true, true, true, true, false})
}

func TestLanesCrossover(t *testing.T) {
	// Two independent tips a, b both converge on c.
	lanes := lanesOf(t, []domain.Commit{
		commit("a", "c"),
		commit("b", "c"),
		commit("c"),
	})
	assertLanes(t, lanes, []int{0, 1, 0}, []bool{true, true, false})
}

func TestLanesIndependentLines(t *testing.T) {
	// Two unrelated chains interleaved; lanes stay distinct and close.
	lanes := lanesOf(t, []domain.Commit{
		commit("a", "b"),
		commit("d", "e"),
		commit("b"),
		commit("e"),
	})
	assertLanes(t, lanes, []int{0, 1, 0, 1}, []bool{true, true, false, false})
}

func TestLanesOrphanReusesFreedLane(t *testing.T) {
	// After the first root closes lane 0, the next tip reuses it.
	lanes := lanesOf(t, []domain.Commit{
		commit("a"),
		commit("b"),
	})
	assertLanes(t, lanes, []int{0, 0}, []bool{false, false})
}

func TestLanesDeterministic(t *testing.T) {
	commits := []domain.Commit{
		commit("m", "a", "b"),
		commit("a", "base"),
		commit("b", "base"),
		commit("base"),
	}
	first := lanesOf(t, commits)
	second := lanesOf(t, commits)
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("Lanes not deterministic:\n first=%+v\nsecond=%+v", first, second)
	}
}

func TestLanesMidHistoryWindowTruncatesEdges(t *testing.T) {
	// Window [b, c] of a -> b -> c; c's parent is outside the window, so the
	// lane must not stay open (Continues=false) and no error is returned.
	lanes := lanesOf(t, []domain.Commit{
		commit("b", "c"),
		commit("c", "out-of-window"),
	})
	assertLanes(t, lanes, []int{0, 0}, []bool{true, false})
}

// synthCommits builds n topologically ordered (newest first) synthetic commits:
// a linear chain with a merge onto a commit three positions ahead every 250
// rows, which exercises convergence/release without exploding lane count.
func synthCommits(n int) []domain.Commit {
	oid := func(i int) domain.Oid {
		return domain.Oid{Hex: fmt.Sprintf("%040x", i), Kind: "SHA1"}
	}
	commits := make([]domain.Commit, n)
	for i := 0; i < n; i++ {
		parents := make([]domain.Oid, 0, 2)
		if i+1 < n {
			parents = append(parents, oid(i+1))
		}
		if i%250 == 0 && i+3 < n {
			parents = append(parents, oid(i+3))
		}
		commits[i] = domain.Commit{Oid: oid(i), Parents: parents}
	}
	return commits
}

// TestLanes50kUnder100ms is the R1 perf guard: the 50k input is built OUTSIDE
// the timed region, then Lanes must finish well under the 100ms gate.
func TestLanes50kUnder100ms(t *testing.T) {
	const n = 50000
	commits := synthCommits(n)
	svc := NewGraphService(nil, nil)

	start := time.Now()
	lanes, err := svc.Lanes(context.Background(), domain.RepositoryId("repo"), commits)
	elapsed := time.Since(start)
	if err != nil {
		t.Fatalf("Lanes: %v", err)
	}
	if len(lanes) != n {
		t.Fatalf("len(lanes) = %d, want %d", len(lanes), n)
	}
	if elapsed >= 100*time.Millisecond {
		t.Fatalf("Lanes(%d) took %v, want <100ms", n, elapsed)
	}
	t.Logf("Lanes(%d) took %v", n, elapsed)
}

func BenchmarkLanes(b *testing.B) {
	commits := synthCommits(50000)
	svc := NewGraphService(nil, nil)
	ctx := context.Background()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := svc.Lanes(ctx, domain.RepositoryId("repo"), commits); err != nil {
			b.Fatalf("Lanes: %v", err)
		}
	}
}
