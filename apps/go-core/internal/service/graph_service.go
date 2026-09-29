package service

import (
	"container/heap"
	"context"

	"github.com/SingulariTree/go-core/internal/domain"
)

// lanePaletteSize is the number of color slots exposed to the renderer. Lane
// colors are derived deterministically as Index % lanePaletteSize, so the same
// lane always gets the same color and adjacent lanes usually differ.
const lanePaletteSize = 8

// GraphService owns commit graph and lanes (service-design.md §1.3).
type GraphService struct {
	gitPort   domain.GitPort
	cachePort domain.CachePort
}

// NewGraphService creates a GraphService.
func NewGraphService(gitPort domain.GitPort, cachePort domain.CachePort) *GraphService {
	return &GraphService{gitPort: gitPort, cachePort: cachePort}
}

// Commits returns windowed commits (200+100 pattern, handled by Angular GraphStore).
func (s *GraphService) Commits(ctx context.Context, repoID domain.RepositoryId, offset, limit int) ([]domain.Commit, int, error) {
	if s.cachePort != nil {
		if commits, total, ok := s.cachePort.GetCommits(ctx, repoID, offset, limit); ok {
			return commits, total, nil
		}
	}
	if s.gitPort == nil {
		return nil, 0, nil
	}
	// Real implementation would delegate to a GraphPort; stub returns empty window
	commits, total, err := s.gitPort.List(ctx, repoID, offset, limit)
	if err != nil {
		return nil, 0, err
	}
	return commits, total, nil
}

// Lanes computes one domain.Lane per commit for graph rendering (ADR-008:
// lanes are computed in Go only; the renderer never computes them).
//
// Input must be topologically ordered newest-first, as returned by
// `git log --topo-order`, so every parent is guaranteed to appear at or after
// its children. The algorithm is O(n * avgParents):
//
//   - A finite set of lane slots (columns) is kept. Each active slot "expects"
//     the oid of some not-yet-seen commit; when that commit arrives it reuses
//     the slot's index, keeping the child→parent line in one column.
//   - A commit that no slot expects is an independent/new tip and takes the
//     lowest free slot.
//   - A commit's first parent continues in the same slot; 2nd+ parents (merge,
//     octopus) reserve extra slots. If the first parent is already expected by
//     another slot the two lanes converge: `git log --graph` preserves the
//     leftmost (lowest-indexed) column and folds the other lane into it, so the
//     higher-indexed of the two lanes is released. (In the common case the
//     current lane is the lower one and keeps the parent; when a side lane
//     already holds it, the current lane folds into that side lane.) No
//     duplicate slot is created.
//   - A slot whose expected commit is not part of the input is never reserved,
//     so dangling lanes are not left open.
//
// Determinism: output depends only on commit/parent order; maps are used for
// O(1) lookups and never iterated, and the free-slot pool is a min-heap, so
// repeated calls on the same input produce identical lanes.
//
// Limitation (wire contract): a row carries only Lane{index,color,continues},
// so the renderer learns the column a commit sits in but receives no edge
// geometry. Convergences and crossings therefore cannot be drawn as diagonals:
// the renderer can keep each row in its column at most. The column
// *assignment* is what this method guarantees; no crossing geometry is
// promised.
//
// Limitation (fixed slots vs git column shifting): lanes are stable slots,
// assigned from the lowest free column. `git log --graph` instead numbers
// display columns positionally and shifts/compacts them as branches open. The
// results agree for linear, single branch+merge and octopus histories (the
// committed parity contract), but can differ when a new branch is opened while
// an unrelated side lane already occupies the column to its right: git shifts
// that side lane further right, while Lanes keeps it fixed and opens the new
// branch in the next free column. Reconciling this would mean reimplementing
// git's column compaction (a different, larger change).
//
// Limitation (mid-history windows): Lanes only sees the requested window, not
// its ancestors. For offset>0 the oldest commits in the window have parents
// outside the window; those edges are dropped (Continues=false) and the exact
// `git log --graph` column layout can differ because git walks the full history
// from HEAD.
func (s *GraphService) Lanes(_ context.Context, _ domain.RepositoryId, commits []domain.Commit) ([]domain.Lane, error) {
	n := len(commits)
	lanes := make([]domain.Lane, n)
	if n == 0 {
		return lanes, nil
	}

	inWindow := make(map[string]struct{}, n)
	for i := range commits {
		inWindow[commits[i].Oid.Hex] = struct{}{}
	}

	var slots []laneSlot
	waiting := make(map[string]int) // oid hex -> slot index expecting it
	free := &intHeap{}
	heap.Init(free)

	alloc := func() int {
		if free.Len() > 0 {
			idx := heap.Pop(free).(int)
			slots[idx].inUse = true
			return idx
		}
		slots = append(slots, laneSlot{inUse: true})
		return len(slots) - 1
	}
	release := func(idx int) {
		if idx < 0 || idx >= len(slots) || !slots[idx].inUse {
			return
		}
		if slots[idx].expected != "" {
			delete(waiting, slots[idx].expected)
		}
		slots[idx] = laneSlot{}
		heap.Push(free, idx)
	}
	expect := func(idx int, oidHex string) {
		slots[idx].expected = oidHex
		waiting[oidHex] = idx
	}

	for i := range commits {
		c := &commits[i]

		idx, expected := waiting[c.Oid.Hex]
		if expected {
			delete(waiting, c.Oid.Hex)
		} else {
			idx = alloc()
		}

		lanes[i] = domain.Lane{Index: idx, Color: idx % lanePaletteSize}

		parents := c.Parents
		if len(parents) == 0 {
			release(idx)
			continue
		}

		// Whether the commit draws at least one downward edge inside the window.
		continues := false
		for _, p := range parents {
			if _, ok := inWindow[p.Hex]; ok {
				continues = true
				break
			}
		}
		lanes[i].Continues = continues

		// Reserve lanes for extra parents (merge/octopus) while idx is still
		// held, so a released idx is not immediately reused by a sibling branch.
		for _, p := range parents[1:] {
			ph := p.Hex
			if _, ok := inWindow[ph]; !ok {
				continue
			}
			if _, ok := waiting[ph]; ok {
				continue // another lane already expects this parent
			}
			expect(alloc(), ph)
		}

		// First parent continues the line in this slot. If another lane already
		// expects it, the two lanes converge: `git log --graph` preserves the
		// leftmost (lowest-indexed) column and folds the other lane into it.
		// So keep whichever of idx/other is smaller and release the other.
		first := parents[0].Hex
		if _, ok := inWindow[first]; !ok {
			release(idx)
			continue
		}
		if other, ok := waiting[first]; ok && other != idx {
			if other < idx {
				// The parent's existing (leftmost) lane wins; the current
				// lane folds into it and is released. lanes[i].Index keeps the
				// column the commit itself was drawn in.
				release(idx)
				idx = other
			} else {
				// The current lane is leftmost; it keeps the parent and the
				// other lane is released. release(other) deletes
				// waiting[first]; expect(idx, first) below re-adds it here.
				release(other)
			}
		}
		expect(idx, first)
	}

	return lanes, nil
}

// laneSlot is one graph column. inUse marks an allocated (non-free) column;
// expected is the oid it awaits ("" while it only holds the current commit).
type laneSlot struct {
	expected string
	inUse    bool
}

// intHeap is a min-heap of free lane indices, so allocation always reuses the
// lowest free column in O(log n).
type intHeap []int

func (h intHeap) Len() int           { return len(h) }
func (h intHeap) Less(i, j int) bool { return h[i] < h[j] }
func (h intHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }
func (h *intHeap) Push(x any)        { *h = append(*h, x.(int)) }
func (h *intHeap) Pop() any {
	old := *h
	n := len(old)
	x := old[n-1]
	*h = old[:n-1]
	return x
}
