import { Injectable, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { catchError, from, map, of } from 'rxjs';
import type { Observable } from 'rxjs';
import type { Repository } from '@contracts/domain';
import type { GetCommitsRequest } from '@contracts/gitcore';
import { IpcBridge } from '@core/services/ipc-bridge.service';
import type { CommitRow } from './repo-models';
import { mapCommitRows } from './repo-mappers';

interface CommitsPage {
  commits: CommitRow[];
  total: number;
}

const EMPTY_PAGE: CommitsPage = { commits: [], total: 0 };

function isIpcUnavailable(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'IPC_UNAVAILABLE'
  );
}

@Injectable()
export class RepoService {
  private readonly bridge = inject(IpcBridge);

  readonly repoId = signal<string | null>(null);
  readonly cursor = signal(0);
  // Window size 200 + prefetch 100 = 300, matching the frontend LRU window (ADR-008).
  readonly windowSize = 200;
  readonly prefetch = 100;
  // True when the renderer runs without the Electron preload bridge (plain browser).
  readonly offline = signal(false);

  // Windowed commits via gRPC-backed IPC (service-design.md §3).
  private readonly raw = rxResource({
    params: () => ({ id: this.repoId(), cursor: this.cursor() }),
    stream: ({ params }): Observable<CommitsPage> => {
      const id = params.id;
      if (!id) return of(EMPTY_PAGE);

      const req: GetCommitsRequest = {
        repoId: id,
        offset: params.cursor,
        limit: this.windowSize + this.prefetch,
      };

      try {
        return from(this.bridge.invoke('getCommits', req)).pipe(
          map((resp) => {
            this.offline.set(false);
            return { commits: mapCommitRows(resp), total: resp.total };
          }),
          catchError((err: unknown) => {
            if (isIpcUnavailable(err)) this.offline.set(true);
            return of(EMPTY_PAGE);
          }),
        );
      } catch (err) {
        // `invoke` throws synchronously when the preload bridge is missing
        // (IPC_UNAVAILABLE) — degrade to an empty page instead of crashing.
        if (isIpcUnavailable(err)) this.offline.set(true);
        return of(EMPTY_PAGE);
      }
    },
  });

  readonly commits = computed(() => this.raw.value()?.commits ?? []);
  readonly total = computed(() => this.raw.value()?.total ?? 0);
  readonly hasMore = computed(() => this.commits().length < this.total());
  readonly isLoading = computed(() => this.raw.isLoading());

  /** Open a repository by filesystem path and load its commit window. */
  async openRepository(fsPath: string): Promise<Repository | null> {
    try {
      const repo = await this.bridge.invoke('openRepository', { fsPath });
      this.offline.set(false);
      this.cursor.set(0);
      this.repoId.set(repo.id);
      return repo;
    } catch (err) {
      if (isIpcUnavailable(err)) this.offline.set(true);
      return null;
    }
  }

  reload(): void {
    this.cursor.set(0);
    this.raw.reload();
  }
}
