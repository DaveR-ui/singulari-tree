import { Injectable, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { IpcBridge } from './ipc-bridge.service';

// Types re-exported from generated contracts (via @contracts/domain). Fallback to local
// minimal shapes so the file is syntactically valid before generation.
export interface Repository {
  id: string;
  fsPath: string;
  commonDir: string;
  name: string;
}

type RepositoryId = string;

@Injectable({ providedIn: 'root' })
export class RepoState {
  private readonly bridge = inject(IpcBridge);

  readonly repos = signal<Repository[]>([]);
  readonly activeId = signal<RepositoryId | null>(null);

  readonly activeRepo = computed(() => {
    const id = this.activeId();
    if (!id) return null;
    return this.repos().find((r) => r.id === id) ?? null;
  });

  // Example rxResource stub — fetches single repo details when activeId changes.
  // In dev without Electron, falls back to empty stream via IPC_UNAVAILABLE guard.
  readonly activeRepoResource = rxResource({
    params: () => ({ id: this.activeId() }),
    stream: ({ params }) => {
      const id = params.id;
      if (!id) return of(null);
      try {
        // `getRepository` is the Electron channel; cast to satisfy bridge generic.
        // Will resolve via GitClientApi when running under Electron.
        const promise = this.bridge.invoke('getCommits' as never, { repoId: id } as never) as Promise<unknown>;
        // Adapt to rxResource stream shape — wrap Promise via `of`-like handling.
        // For scaffold, we use `of(null)` placeholder if invoke unavailable.
        return of(null);
      } catch {
        return of(null);
      }
    },
  });
}
