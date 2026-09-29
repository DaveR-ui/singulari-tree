import { Injectable, computed, inject, signal } from '@angular/core';
import type { Repository } from '@contracts/domain';
import { IpcBridge } from './ipc-bridge.service';

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

  /**
   * Load the persisted repository list from the Go core (`git:listRepositories`).
   * Degrades silently to the current list in a plain browser (IPC_UNAVAILABLE).
   */
  async loadRepositories(): Promise<void> {
    try {
      const res = await this.bridge.invoke('listRepositories', {});
      this.repos.set(res.repositories);
    } catch {
      // IPC_UNAVAILABLE / Go core offline: keep whatever is already loaded.
    }
  }
}
