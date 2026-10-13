import { Injectable, computed, inject, signal } from '@angular/core';
import type { Commit, CommitStats, Lane, Repository } from '@contracts/domain';
import type { GetCommitsRequest, GetCommitsResponse, ResetRequest } from '@contracts/gitcore';
import { IpcBridge, toAppError, type AppError } from '@core/services/ipc-bridge.service';
import type { CommitRow } from '../repo-models';
import { filterRows, joinRows, mapPageLanes, maxLaneIndex } from '../repo-mappers';
import type { ResetModeName } from './graph-menu.models';

/** Pseudo-oid for the synthetic working-tree (uncommitted) node. UI-only: no IPC. */
export const WIP_OID = 'worktree';

/** Visible window (rows kept in memory) — matches the Go cache LRU window. */
export const GRAPH_WINDOW_SIZE = 200;
/** Extra rows fetched ahead of the window to hide fetch latency. */
export const GRAPH_PREFETCH = 100;
/** Trigger prefetch when the rendered range is within this many rows of the end. */
export const GRAPH_PREFETCH_THRESHOLD = 20;
/** Max extra windows loaded to reveal a commit requested from cross-repo search. */
export const COMMIT_FOCUS_MAX_LOADS = 10;

function isIpcUnavailable(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'IPC_UNAVAILABLE'
  );
}

/**
 * Signal store for the commit graph (service-design.md §2.2/§3).
 *
 * Owns the windowed `getCommits` pagination (window 200 + prefetch 100) and the
 * parallel `commits`/`lanes` arrays from the Go core. The bridge is a constructor
 * parameter (defaulting to DI) so the store can be unit-tested without TestBed.
 */
@Injectable()
export class GraphStore {
  private readonly bridge: IpcBridge;

  constructor(bridge: IpcBridge = inject(IpcBridge)) {
    this.bridge = bridge;
  }

  readonly windowSize = GRAPH_WINDOW_SIZE;
  readonly prefetch = GRAPH_PREFETCH;

  // -- state ---------------------------------------------------------------
  /**
   * Monotonic request sequence for `loadWindow`.
   *
   * Overlapping reloads are normal: every working-tree mutation
   * (stage/unstage/commit) fires `fs:changed`, coalesced by the core watcher's
   * 150ms debounce into `FileStatusPage.refreshForExternalChange()`, and a
   * successful commit additionally bumps `graphReloadRequested`; both call
   * `reload()`. Without a guard the *last response to resolve* wins rather than
   * the last request, so on a slow CI box an earlier `getCommits` — served from
   * the pre-invalidation L1 cache window and thereby missing the new commit — can
   * land after the post-commit one and install a stale page. Only the newest
   * request is allowed to touch the state signals.
   */
  private loadSeq = 0;

  readonly repoId = signal<string | null>(null);
  readonly commits = signal<Commit[]>([]);
  /** Normalized to one entry per commit (index-aligned with `commits`). */
  readonly lanes = signal<Lane[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly loading = signal(false);
  readonly error = signal<AppError | null>(null);
  readonly selectedOid = signal<string | null>(null);
  readonly filter = signal('');
  /** Recently opened repositories (from `listRepositories`), newest first. */
  readonly recentRepos = signal<Repository[]>([]);
  /** True when the renderer runs without the Electron preload bridge. */
  readonly offline = signal(false);

  // -- commit change-size gauge (ADR-0023) ---------------------------------
  /** Counts per oid, lazily fetched for the visited window and cached. */
  readonly commitStats = signal<ReadonlyMap<string, CommitStats>>(new Map());
  /** Last non-IPC failure while loading the gauge, or null. */
  readonly statsError = signal<AppError | null>(null);

  // -- reset (ADR-0021) ----------------------------------------------------
  /** True while a `reset` call is in flight. */
  readonly resetRunning = signal(false);
  /** Last reset failure, or null when idle/successful. */
  readonly resetError = signal<AppError | null>(null);

  // -- derived -------------------------------------------------------------
  readonly rows = computed<CommitRow[]>(() => joinRows(this.commits(), this.lanes()));
  readonly filteredRows = computed<CommitRow[]>(() => filterRows(this.rows(), this.filter()));
  readonly maxLane = computed(() => maxLaneIndex(this.rows()));
  readonly hasMore = computed(() => this.commits().length < this.total());
  readonly isLoading = computed(() => this.loading());
  readonly isWipSelected = computed(() => this.selectedOid() === WIP_OID);
  readonly selectedRow = computed<CommitRow | null>(() => {
    const oid = this.selectedOid();
    if (!oid || oid === WIP_OID) return null;
    return this.rows().find((row) => row.commit.oid?.hex === oid) ?? null;
  });
  /**
   * Index of the selected row within `filteredRows()`; -1 when nothing is
   * selected, the synthetic WIP node is selected, or the selected oid is
   * filtered out / absent.
   */
  readonly selectedIndex = computed<number>(() => {
    const oid = this.selectedOid();
    if (!oid || oid === WIP_OID) return -1;
    return this.filteredRows().findIndex((row) => row.commit.oid?.hex === oid);
  });

  /**
   * Cached gauge for one oid, or null when it has not been measured yet. A
   * missing entry is rendered as "no gauge" (never a zeroed placeholder).
   */
  statsFor(oid: string | undefined): CommitStats | null {
    if (!oid) return null;
    return this.commitStats().get(oid) ?? null;
  }

  // -- actions -------------------------------------------------------------

  /** Open a repository by filesystem path and load its first commit window. */
  async openRepository(fsPath: string): Promise<Repository | null> {
    try {
      const repo = await this.bridge.invoke('openRepository', { fsPath });
      this.offline.set(false);
      this.repoId.set(repo.id);
      this.selectedOid.set(null);
      this.filter.set('');
      await this.loadWindow(0);
      // Refresh the picker's recents now that this repo is the most recent.
      await this.loadRecentRepos();
      // Start the repository-scoped background watch: `fs:changed` drives the
      // graph/status refresh both repo screens subscribe to. Fire-and-forget — a
      // missing bridge or a failing watch can never fail the open.
      this.startWatch(repo.id);
      return repo;
    } catch (err) {
      if (isIpcUnavailable(err)) {
        this.offline.set(true);
      } else {
        this.error.set(toAppError(err));
      }
      return null;
    }
  }

  /**
   * Load the recently opened repositories. Degrades to an empty list when the
   * Electron bridge is unavailable (plain browser session); records any other
   * failure on the `error` signal.
   */
  async loadRecentRepos(): Promise<void> {
    try {
      const resp = await this.bridge.invoke('listRepositories', {});
      this.offline.set(false);
      this.recentRepos.set(resp.repositories ?? []);
    } catch (err) {
      if (isIpcUnavailable(err)) {
        this.offline.set(true);
        this.recentRepos.set([]);
      } else {
        this.error.set(toAppError(err));
      }
    }
  }

  /**
   * Load a commit window at `offset`. `offset <= 0` replaces the current page
   * (reload); a positive offset appends (infinite scroll).
   */
  async loadWindow(offset: number): Promise<void> {
    const id = this.repoId();
    if (!id) return;

    // Claim the newest sequence before awaiting: a later loadWindow supersedes
    // this one, and only the newest response may mutate state (see `loadSeq`).
    const seq = ++this.loadSeq;

    this.loading.set(true);
    this.error.set(null);

    const req: GetCommitsRequest = {
      repoId: id,
      offset,
      limit: this.windowSize + this.prefetch,
    };

    try {
      const resp = await this.bridge.invoke('getCommits', req);
      // Superseded while in flight: drop the stale page instead of clobbering
      // the newer one.
      if (seq !== this.loadSeq) return;
      this.offline.set(false);
      this.applyPage(offset, resp);
    } catch (err) {
      // Superseded failure: it must not clobber the newer page's `error`, and an
      // IPC_UNAVAILABLE must not blank the screen either.
      if (seq !== this.loadSeq) return;
      if (isIpcUnavailable(err)) {
        // Degrade to an empty page instead of crashing a plain browser session.
        this.offline.set(true);
        if (offset <= 0) this.applyPage(0, { commits: [], total: 0, lanes: [] });
      } else {
        this.error.set(toAppError(err));
      }
    } finally {
      // Only the newest request owns `loading`; a superseded one must not report
      // completion while a newer window is still in flight. The newest request
      // always reaches this branch, so `loading` can never stay stuck true.
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }

  /** Fetch the next window when the viewport approaches the end of loaded rows. */
  loadMore(): void {
    if (this.loading() || !this.repoId() || !this.hasMore()) return;
    void this.loadWindow(this.commits().length);
  }

  /** Invalidate and reload the first window (fs:changed / HEAD move). */
  reload(): void {
    void this.loadWindow(0);
  }

  /**
   * Ask the shell to start the background `Watch` stream for `repoId`.
   * Fire-and-forget: the ack resolves immediately and a missing bridge or a
   * failing watch degrades to this store's own offline/error state, so it can
   * never fail the repository open. Relocated from `StatusWorkspace` when
   * ADR-0030 removed the band `RepoPage` no longer mounts.
   */
  private startWatch(repoId: string): void {
    try {
      void this.bridge.invoke('watch', { repoId }).catch(() => {});
    } catch {
      // Intentionally ignored: the open already recorded the failure.
    }
  }

  /**
   * Lazily measure the change-size gauge for a batch of oids (ADR-0023).
   *
   * Only oids absent from the cache are requested, in one `getCommitStats`
   * call, so a re-render or a repeated window never re-measures. Failures are
   * silent for the gauge: `IPC_UNAVAILABLE` degrades to `offline`, any other
   * error is recorded on `statsError` — a missing gauge must not break the graph.
   */
  async loadStats(oids: readonly string[]): Promise<void> {
    const id = this.repoId();
    if (!id) return;

    const cached = this.commitStats();
    const missing = [...new Set(oids)].filter((oid) => !!oid && !cached.has(oid));
    if (missing.length === 0) return;

    try {
      const resp = await this.bridge.invoke('getCommitStats', { repoId: id, oids: missing });
      this.offline.set(false);
      this.statsError.set(null);
      const next = new Map(cached);
      for (const stat of resp.stats ?? []) next.set(stat.oid, stat);
      this.commitStats.set(next);
    } catch (err) {
      if (isIpcUnavailable(err)) {
        this.offline.set(true);
      } else {
        this.statsError.set(toAppError(err));
      }
    }
  }

  /**
   * Run `git reset --<mode> <to>` (ADR-0021) and reload the graph on success.
   *
   * No-ops without a repository, while another reset is in flight, or when the
   * mode is unspecified. `HARD` is gated by a renderer confirmation *before*
   * this method is reached; the store never downgrades or defaults a mode.
   */
  async reset(to: string, mode: ResetModeName): Promise<boolean> {
    const id = this.repoId();
    if (!id || this.resetRunning() || !to) return false;
    if (mode !== 'SOFT' && mode !== 'MIXED' && mode !== 'HARD') return false;

    this.resetRunning.set(true);
    this.resetError.set(null);
    try {
      // `mode` is the enum value name: proto-loader decodes with `enums: String`.
      await this.bridge.invoke('reset', { repoId: id, to, mode } as unknown as ResetRequest);
      this.offline.set(false);
      // A reset moves HEAD: refresh the graph through the normal flow.
      this.reload();
      return true;
    } catch (err) {
      if (isIpcUnavailable(err)) {
        this.offline.set(true);
      } else {
        this.resetError.set(toAppError(err));
      }
      return false;
    } finally {
      this.resetRunning.set(false);
    }
  }

  select(oid: string | null): void {
    this.selectedOid.set(oid);
  }

  /**
   * Select `oid` and, when it is not yet in the loaded window, page forward
   * (bounded by {@link COMMIT_FOCUS_MAX_LOADS}) until it appears or the history
   * ends. Used by the cross-repo search hand-off (ADR-026) to reveal a hit that
   * lives beyond the first window; the selection is always applied, even when
   * the commit is not reached.
   */
  async focusCommit(oid: string): Promise<void> {
    if (!oid) return;
    this.select(oid);

    const contains = (): boolean =>
      this.rows().some((row) => row.commit.oid?.hex === oid);
    if (contains()) return;

    let loads = 0;
    while (loads < COMMIT_FOCUS_MAX_LOADS && this.hasMore() && !contains()) {
      const before = this.commits().length;
      await this.loadWindow(before);
      loads++;
      // Stop early when a page made no progress (avoids an infinite loop).
      if (this.commits().length === before) break;
    }
    this.select(oid);
  }

  /** Move the selection down one visible row, clamping at the last row. */
  selectNext(): void {
    this.moveSelection(1);
  }

  /** Move the selection up one visible row, clamping at the first row. */
  selectPrevious(): void {
    this.moveSelection(-1);
  }

  private moveSelection(delta: number): void {
    const rows = this.filteredRows();
    if (rows.length === 0) return;
    const current = this.selectedIndex();
    const target =
      current < 0 ? 0 : Math.min(Math.max(current + delta, 0), rows.length - 1);
    this.selectedOid.set(rows[target].commit.oid?.hex ?? null);
  }

  setFilter(query: string): void {
    this.filter.set(query);
  }

  private applyPage(offset: number, resp: GetCommitsResponse): void {
    const page = resp.commits ?? [];
    const lanes = mapPageLanes(resp);

    if (offset <= 0) {
      this.commits.set([...page]);
      this.lanes.set(lanes);
      this.offset.set(page.length);
    } else {
      this.commits.update((prev) => [...prev, ...page]);
      this.lanes.update((prev) => [...prev, ...lanes]);
      this.offset.set(offset + page.length);
    }

    this.total.set(resp.total ?? 0);

    // Measure the gauge for the rows just loaded (ADR-0023): lazily, for the
    // visited window only, never the whole history. Fire-and-forget so the
    // window renders immediately and the gauge fills in when it arrives.
    void this.loadStats(
      page.map((commit) => commit.oid?.hex).filter((oid): oid is string => !!oid),
    );
  }
}
