package service

import (
	"container/heap"
	"context"
	"sync"

	"github.com/SingulariTree/go-core/internal/domain"
)

// lanePaletteSize is the number of color slots exposed to the renderer. Lane
// colors are derived deterministically as Index % lanePaletteSize, so the same
// lane always gets the same color and adjacent lanes usually differ.
const lanePaletteSize = 8

// GraphService owns commit graph and lanes (service-design.md §1.3).
//
// It keeps stateful per-repo lane layout (see WindowLanes) behind mu so a
// scroll window's lanes match the full-history layout from HEAD. gitPort is the
// narrow CommitLister: the service never needs the rest of the Git port.
type GraphService struct {
	gitPort   domain.CommitLister
	cachePort domain.CachePort

	mu     sync.Mutex
	states map[domain.RepositoryId]*repoLaneState
}

// repoLaneState is the resumable lane layout for one repository, folding
// history from HEAD in topological order. next is the number of commits already
// folded from the tip; lanes[i] is the lane of the commit at history position i.
type repoLaneState struct {
	tip    string
	next   int
	folder *laneFolder
	lanes  []domain.Lane
}

// NewGraphService creates a GraphService.
func NewGraphService(gitPort domain.CommitLister, cachePort domain.CachePort) *GraphService {
	return &GraphService{
		gitPort:   gitPort,
		cachePort: cachePort,
		states:    make(map[domain.RepositoryId]*repoLaneState),
	}
}

// invalidationGeneration is an optional capability a domain.CachePort may
// implement to expose its invalidation generation (see CacheService.Generation).
// GraphService uses it to skip a write-through whose read straddled an
// invalidation: an invalidation that races the read means the fetched window
// may predate the mutation that invalidated it, so caching it would resurrect
// pre-commit data after the mutation's Invalidate. Ports that do not implement
// it (test stubs, alternate implementations) keep the unconditional
// write-through behavior.
type invalidationGeneration interface {
	Generation() uint64
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
	// Capture the invalidation generation before the read when the port exposes
	// one, so a mutation's Invalidate racing this read can be detected after it.
	gen, hasGen := s.cachePort.(invalidationGeneration)
	var genBefore uint64
	if hasGen {
		genBefore = gen.Generation()
	}
	commits, total, err := s.gitPort.List(ctx, repoID, offset, limit)
	if err != nil {
		return nil, 0, err
	}
	// Write-through to the persistent cache is best-effort: a failed write must
	// never turn a successful read into an error. It is skipped when an
	// invalidation raced the read (the generation moved): the window may predate
	// the mutation, and caching it would resurrect stale pre-commit data after
	// the mutation's Invalidate; the next read repopulates from Git instead.
	if s.cachePort != nil {
		if hasGen && gen.Generation() != genBefore {
			return commits, total, nil
		}
		_ = s.cachePort.PutCommits(ctx, repoID, offset, total, commits)
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
// its ancestors, so for offset>0 the oldest commits have parents outside the
// window and those edges are dropped (Continues=false). Callers serving
// paginated windows should use WindowLanes, which folds the full history from
// HEAD and keeps columns continuous across windows.
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
	present := func(hex string) bool {
		_, ok := inWindow[hex]
		return ok
	}

	folder := newLaneFolder(present)
	for i := range commits {
		lanes[i] = folder.fold(&commits[i])
	}
	return lanes, nil
}

// windowCatchUpChunk bounds how many prefix commits are fetched and folded per
// Git call while resuming a window.
const windowCatchUpChunk = 1000

// WindowLanes lays out one window of commits while keeping lane columns
// continuous with the full history from HEAD. Unlike the pure, window-local
// Lanes it folds commits from the tip in order and remembers the slot state per
// repository, so the same commit always lands in the same column no matter
// which scroll window requested it (no per-window re-layout seams).
//
// offset is the commit's index in the topological history from HEAD and commits
// must be the contiguous window starting at offset. The returned slice is a
// fresh copy and never aliases internal state.
//
// When the Git port is unavailable, or history cannot be fetched, it falls back
// to the pure Lanes for the given window. In the stateful path a commit is
// considered to continue whenever it has at least one parent: the full history
// from HEAD is folded, so a parent is always eventually shown and its lane is
// reserved unconditionally.
func (s *GraphService) WindowLanes(ctx context.Context, repoID domain.RepositoryId, commits []domain.Commit, offset int) ([]domain.Lane, error) {
	if s.gitPort == nil {
		return s.Lanes(ctx, repoID, commits)
	}
	if len(commits) == 0 {
		return []domain.Lane{}, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	st := s.states[repoID]

	// (Re)anchor the layout to the current HEAD so a moved tip (external commit,
	// rebase) invalidates stale columns. This costs one tiny List(0,1) per call,
	// which buys detection of HEAD moves that no watcher event reported (the
	// fsnotify adapter is still a stub) and of any missed invalidation; offset 0
	// always re-anchors (a reload must not resume stale state).
	tipCommits, _, err := s.gitPort.List(ctx, repoID, 0, 1)
	if err != nil || len(tipCommits) == 0 {
		return s.Lanes(ctx, repoID, commits)
	}
	tip := tipCommits[0].Oid.Hex
	if st == nil || offset == 0 || st.tip != tip {
		st = &repoLaneState{tip: tip, folder: newLaneFolder(alwaysPresent)}
		s.states[repoID] = st
	}

	// Fold any history between the last folded commit and this window.
	for st.next < offset {
		chunk := offset - st.next
		if chunk > windowCatchUpChunk {
			chunk = windowCatchUpChunk
		}
		prefix, _, err := s.gitPort.List(ctx, repoID, st.next, chunk)
		if err != nil || len(prefix) == 0 {
			return s.Lanes(ctx, repoID, commits)
		}
		for i := range prefix {
			st.lanes = append(st.lanes, st.folder.fold(&prefix[i]))
			st.next++
		}
	}

	if st.next == offset {
		for i := range commits {
			st.lanes = append(st.lanes, st.folder.fold(&commits[i]))
			st.next++
		}
		out := make([]domain.Lane, len(commits))
		copy(out, st.lanes[offset:offset+len(commits)])
		return out, nil
	}

	// The window was already folded (st.next > offset): serve it from state when
	// it is fully covered, otherwise fall back to the pure window-local layout.
	if offset+len(commits) <= len(st.lanes) {
		out := make([]domain.Lane, len(commits))
		copy(out, st.lanes[offset:offset+len(commits)])
		return out, nil
	}
	return s.Lanes(ctx, repoID, commits)
}

// Invalidate drops any remembered lane layout for a repository, so the next
// WindowLanes call re-folds history from HEAD (e.g. after a HEAD move).
func (s *GraphService) Invalidate(repoID domain.RepositoryId) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.states, repoID)
}

// presentFunc reports whether an oid belongs to the history being laid out.
type presentFunc func(hex string) bool

// alwaysPresent marks every oid as part of the history; used by the stateful
// folder, which walks the full history from HEAD.
func alwaysPresent(string) bool { return true }

// laneFolder holds the resumable lane-slot state (columns, expectations, free
// pool) for one history walk. present decides which oids belong to the history.
// It is not safe for concurrent use; GraphService guards each repository's
// folder with its mutex.
type laneFolder struct {
	slots   []laneSlot
	waiting map[string]int // oid hex -> slot index expecting it
	free    *intHeap
	present presentFunc
}

func newLaneFolder(present presentFunc) *laneFolder {
	if present == nil {
		present = alwaysPresent
	}
	f := &laneFolder{
		waiting: make(map[string]int),
		free:    &intHeap{},
		present: present,
	}
	heap.Init(f.free)
	return f
}

func (f *laneFolder) alloc() int {
	if f.free.Len() > 0 {
		idx := heap.Pop(f.free).(int)
		f.slots[idx].inUse = true
		return idx
	}
	f.slots = append(f.slots, laneSlot{inUse: true})
	return len(f.slots) - 1
}

func (f *laneFolder) release(idx int) {
	if idx < 0 || idx >= len(f.slots) || !f.slots[idx].inUse {
		return
	}
	if f.slots[idx].expected != "" {
		delete(f.waiting, f.slots[idx].expected)
	}
	f.slots[idx] = laneSlot{}
	heap.Push(f.free, idx)
}

func (f *laneFolder) expect(idx int, oidHex string) {
	f.slots[idx].expected = oidHex
	f.waiting[oidHex] = idx
}

// fold lays out one commit and returns its lane, mutating the folder's slot
// state so it can be resumed. The folder's present predicate decides whether an
// oid belongs to the history: the pure Lanes passes an in-window membership
// test while the stateful window passes alwaysPresent. See GraphService.Lanes
// for the full algorithm description.
func (f *laneFolder) fold(c *domain.Commit) domain.Lane {
	idx, expected := f.waiting[c.Oid.Hex]
	if expected {
		delete(f.waiting, c.Oid.Hex)
	} else {
		idx = f.alloc()
	}

	lane := domain.Lane{Index: idx, Color: idx % lanePaletteSize}

	parents := c.Parents
	if len(parents) == 0 {
		f.release(idx)
		return lane
	}

	// Whether the commit draws at least one downward edge in the history.
	continues := false
	for _, p := range parents {
		if f.present(p.Hex) {
			continues = true
			break
		}
	}
	lane.Continues = continues

	// Reserve lanes for extra parents (merge/octopus) while idx is still
	// held, so a released idx is not immediately reused by a sibling branch.
	for _, p := range parents[1:] {
		ph := p.Hex
		if !f.present(ph) {
			continue
		}
		if _, ok := f.waiting[ph]; ok {
			continue // another lane already expects this parent
		}
		f.expect(f.alloc(), ph)
	}

	// First parent continues the line in this slot. If another lane already
	// expects it, the two lanes converge: `git log --graph` preserves the
	// leftmost (lowest-indexed) column and folds the other lane into it.
	// So keep whichever of idx/other is smaller and release the other.
	first := parents[0].Hex
	if !f.present(first) {
		f.release(idx)
		return lane
	}
	if other, ok := f.waiting[first]; ok && other != idx {
		if other < idx {
			// The parent's existing (leftmost) lane wins; the current
			// lane folds into it and is released. lane.Index keeps the
			// column the commit itself was drawn in.
			f.release(idx)
			idx = other
		} else {
			// The current lane is leftmost; it keeps the parent and the
			// other lane is released. release(other) deletes
			// waiting[first]; expect(idx, first) below re-adds it here.
			f.release(other)
		}
	}
	f.expect(idx, first)
	return lane
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
