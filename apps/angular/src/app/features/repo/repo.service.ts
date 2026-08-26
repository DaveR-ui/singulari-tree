import { Injectable, inject, signal, computed } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { IpcBridge } from '@core/services/ipc-bridge.service';
import type { CommitRow } from './repo-models';

@Injectable()
export class RepoService {
  private readonly bridge = inject(IpcBridge);

  readonly repoId = signal<string | null>(null);
  readonly cursor = signal(0);
  readonly windowSize = 200;
  readonly prefetch = 100;

  // Windowed commits via gRPC-backed IPC — stubbed for scaffold.
  private readonly raw = rxResource({
    params: () => ({ id: this.repoId(), cursor: this.cursor() }),
    stream: ({ params }) => {
      if (!params.id) return of({ commits: [] as CommitRow[], total: 0 });
      try {
        // Real call when contracts generated:
        // return from(this.bridge.invoke('getCommits', { repoId: params.id, offset: params.cursor, limit: this.windowSize + this.prefetch }));
        return of({ commits: [] as CommitRow[], total: 0 });
      } catch {
        return of({ commits: [] as CommitRow[], total: 0 });
      }
    },
  });

  readonly commits = computed(() => this.raw.value()?.commits ?? []);
  readonly total = computed(() => this.raw.value()?.total ?? 0);
  readonly hasMore = computed(() => this.commits().length < this.total());
  readonly isLoading = computed(() => this.raw.isLoading());

  reload(): void {
    this.raw.reload();
  }
}
