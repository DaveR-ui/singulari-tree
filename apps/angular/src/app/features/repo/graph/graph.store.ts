import { Injectable, computed, inject, signal } from '@angular/core';
import type { Commit, Lane, Repository } from '@contracts/domain';
import type { GetCommitsRequest, GetCommitsResponse } from '@contracts/gitcore';
import { IpcBridge, type AppError } from '@core/services/ipc-bridge.service';
import type { CommitRow } from '../repo-models';
import { filterRows, joinRows, mapPageLanes, maxLaneIndex } from '../repo-mappers';

/** Pseudo-oid for the synthetic working-tree (uncommitted) node. UI-only: no IPC. */
export const WIP_OID = 'worktree';

/** Visible window (rows kept in memory) — matches the Go cache LRU window. */
export const GRAPH_WINDOW_SIZE = 200;
/** Extra rows fetched ahead of the window to hide fetch latency. */
export const GRAPH_PREFETCH = 100;
/** Trigger prefetch when the rendered range is within this many rows of the end. */
export const GRAPH_PREFETCH_THRESHOLD = 20;

function isIpcUnavailable(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'IPC_UNAVAILABLE'
  );
}

function toAppError(err: unknown): AppError {
  if (typeof err === 'object' && err !== null) {
    const code = 'code' in err ? String((err as { code?: unknown }).code) : 'UNKNOWN';
    const message = 'message' in err ? String((err as { message?: unknown }).message) : 'Unknown error';
    return { code, message };
  }
  return { code: 'UNKNOWN', message: String(err) };
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
  /** True when the renderer runs without the Electron preload bridge. */
  readonly offline = signal(false);

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
   * Load a commit window at `offset`. `offset <= 0` replaces the current page
   * (reload); a positive offset appends (infinite scroll).
   */
  async loadWindow(offset: number): Promise<void> {
    const id = this.repoId();
    if (!id) return;

    this.loading.set(true);
    this.error.set(null);

    const req: GetCommitsRequest = {
      repoId: id,
      offset,
      limit: this.windowSize + this.prefetch,
    };

    try {
      const resp = await this.bridge.invoke('getCommits', req);
      this.offline.set(false);
      this.applyPage(offset, resp);
    } catch (err) {
      if (isIpcUnavailable(err)) {
        // Degrade to an empty page instead of crashing a plain browser session.
        this.offline.set(true);
        if (offset <= 0) this.applyPage(0, { commits: [], total: 0, lanes: [] });
      } else {
        this.error.set(toAppError(err));
      }
    } finally {
      this.loading.set(false);
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

  select(oid: string | null): void {
    this.selectedOid.set(oid);
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
  }
}
