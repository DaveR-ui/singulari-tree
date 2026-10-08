import { Injectable, computed, inject, signal } from '@angular/core';
import type { CommitSearchHit } from '@contracts/gitcore';
import { IpcBridge, toAppError, type AppError } from '@core/services/ipc-bridge.service';
import { RepoState } from '@core/services/repo-state.service';

function isIpcUnavailable(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'IPC_UNAVAILABLE'
  );
}

/** Search hits for one repository, in core-returned order. */
export interface SearchHitGroup {
  readonly repoId: string;
  readonly repoName: string;
  readonly hits: CommitSearchHit[];
}

/** Default result cap sent to the core (`limit` is owned by the renderer). */
export const COMMIT_SEARCH_LIMIT = 50;

/**
 * Root store for cross-repo local commit search (ADR-026).
 *
 * The renderer sends only `{ query, repo_ids, limit }`; the core owns the query
 * over its metadata cache (never Git objects). Results are grouped by repository
 * for display. A monotonic generation token discards late responses so a slow
 * query can never overwrite a newer one.
 */
@Injectable({ providedIn: 'root' })
export class CommitSearchStore {
  private readonly bridge: IpcBridge;
  private readonly repoState: RepoState;

  /** Monotonic token for `search` (discards late responses). */
  private generation = 0;

  constructor(bridge: IpcBridge = inject(IpcBridge), repoState: RepoState = inject(RepoState)) {
    this.bridge = bridge;
    this.repoState = repoState;
  }

  /** Raw query text as typed by the user. */
  readonly query = signal('');
  readonly hits = signal<CommitSearchHit[]>([]);
  readonly loading = signal(false);
  readonly error = signal<AppError | null>(null);
  /** True when the bridge is unavailable (plain browser session). */
  readonly offline = signal(false);
  /** True once a non-empty query has been dispatched (drives the empty state). */
  readonly hasSearched = signal(false);

  /** Hits grouped by repository, labelled with the repository display name. */
  readonly groups = computed<SearchHitGroup[]>(() => {
    const byRepo = new Map<string, CommitSearchHit[]>();
    for (const hit of this.hits()) {
      const bucket = byRepo.get(hit.repoId);
      if (bucket) bucket.push(hit);
      else byRepo.set(hit.repoId, [hit]);
    }
    const repos = this.repoState.repos();
    return [...byRepo.entries()].map(([repoId, hits]) => ({
      repoId,
      repoName: repos.find((repo) => repo.id === repoId)?.name ?? repoId,
      hits,
    }));
  });

  /**
   * Run a cross-repo search over `repoIds`. A blank query clears the results
   * without an IPC round-trip. `IPC_UNAVAILABLE` degrades to `offline`, any other
   * failure is surfaced on `error`; both clear the previous hits.
   */
  async search(query: string, repoIds: readonly string[]): Promise<void> {
    this.query.set(query);
    const trimmed = query.trim();
    const generation = ++this.generation;

    if (!trimmed) {
      this.hits.set([]);
      this.hasSearched.set(false);
      this.loading.set(false);
      this.error.set(null);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.hasSearched.set(true);
    try {
      const res = await this.bridge.invoke('searchCommits', {
        query: trimmed,
        repoIds: [...repoIds],
        limit: COMMIT_SEARCH_LIMIT,
      });
      if (generation !== this.generation) return;
      this.offline.set(false);
      this.hits.set(res.hits ?? []);
    } catch (err) {
      if (generation !== this.generation) return;
      this.hits.set([]);
      if (isIpcUnavailable(err)) {
        this.offline.set(true);
      } else {
        this.error.set(toAppError(err));
      }
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  /** Clear the query and every result/error state. */
  clear(): void {
    this.generation++;
    this.query.set('');
    this.hits.set([]);
    this.hasSearched.set(false);
    this.loading.set(false);
    this.error.set(null);
  }
}
