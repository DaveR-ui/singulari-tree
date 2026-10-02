import { Injectable, computed, inject, signal } from '@angular/core';
import type { Repository } from '@contracts/domain';
import { IpcBridge, toAppError, type AppError } from './ipc-bridge.service';

type RepositoryId = string;

function isIpcUnavailable(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'IPC_UNAVAILABLE'
  );
}

/**
 * Root active-repository source of truth for the shell.
 *
 * The route-scoped `GraphStore` owns the graph and knows which repository is
 * open; this store mirrors that selection so the layout chrome (left sidebar
 * ref lists) can observe it without depending on a route-scoped provider.
 * Ref reads (`getBranches`/`getRemotes`/`getTags`) degrade gracefully when the
 * Electron bridge is unavailable.
 */
@Injectable({ providedIn: 'root' })
export class RepoState {
  private readonly bridge: IpcBridge;

  /**
   * Monotonic token for `loadRefs`. Incremented on every call so a late
   * response for a previous repository can never overwrite a newer one.
   */
  private refsGeneration = 0;

  constructor(bridge: IpcBridge = inject(IpcBridge)) {
    this.bridge = bridge;
  }

  readonly repos = signal<Repository[]>([]);
  readonly activeId = signal<RepositoryId | null>(null);
  readonly reposLoading = signal(false);
  readonly reposError = signal<AppError | null>(null);
  /** True when the repository list could not be read because the bridge is absent. */
  readonly reposOffline = signal(false);

  // -- ref lists for the active repository ---------------------------------
  readonly branches = signal<string[]>([]);
  readonly tags = signal<string[]>([]);
  readonly remotes = signal<string[]>([]);
  readonly refsLoading = signal(false);
  readonly refsError = signal<AppError | null>(null);
  /** True when the renderer runs without the Electron preload bridge. */
  readonly refsOffline = signal(false);

  readonly activeRepo = computed(() => {
    const id = this.activeId();
    if (!id) return null;
    return this.repos().find((r) => r.id === id) ?? null;
  });

  /**
   * Load the persisted repository list from the Go core (`listRepositories`).
   *
   * Mirrors the refs pattern: records `reposOffline` when the bridge is absent,
   * any other failure on `reposError`, and always clears `reposLoading`. The
   * currently loaded list is kept on failure so a transient error never blanks
   * the drawer.
   */
  async loadRepositories(): Promise<void> {
    this.reposLoading.set(true);
    this.reposError.set(null);
    try {
      const res = await this.bridge.invoke('listRepositories', {});
      this.reposOffline.set(false);
      this.repos.set(res.repositories ?? []);
    } catch (err) {
      if (isIpcUnavailable(err)) {
        this.reposOffline.set(true);
      } else {
        this.reposError.set(toAppError(err));
      }
    } finally {
      this.reposLoading.set(false);
    }
  }

  /** Upsert `repo`, make it active and (re)load its ref lists. */
  setActive(repo: Repository): void {
    this.repos.update((prev) => {
      const index = prev.findIndex((r) => r.id === repo.id);
      if (index === -1) return [...prev, repo];
      const next = [...prev];
      next[index] = repo;
      return next;
    });
    this.activeId.set(repo.id);
    void this.loadRefs();
  }

  /**
   * Load branch/tag/remote display names for the active repository. Clears the
   * lists when there is no active repo; records `refsOffline` on a missing
   * bridge and any other failure on `refsError`. A monotonic generation token
   * discards late responses from a repository that is no longer active.
   */
  async loadRefs(): Promise<void> {
    const id = this.activeId();
    const generation = ++this.refsGeneration;
    this.refsError.set(null);

    if (!id) {
      this.refsOffline.set(false);
      this.branches.set([]);
      this.tags.set([]);
      this.remotes.set([]);
      this.refsLoading.set(false);
      return;
    }

    this.refsLoading.set(true);
    try {
      const [branches, remotes, tags] = await Promise.all([
        this.bridge.invoke('getBranches', { repoId: id }),
        this.bridge.invoke('getRemotes', { repoId: id }),
        this.bridge.invoke('getTags', { repoId: id }),
      ]);
      // Stale response: a newer loadRefs superseded this one.
      if (generation !== this.refsGeneration) return;
      this.refsOffline.set(false);
      this.branches.set(branches.branches.map((b) => b.name));
      this.tags.set(tags.tags.map((t) => t.name));
      this.remotes.set(remotes.remotes.map((r) => r.name));
    } catch (err) {
      // Stale failure: never mutate state for a newer active repo.
      if (generation !== this.refsGeneration) return;
      if (isIpcUnavailable(err)) {
        this.refsOffline.set(true);
        this.branches.set([]);
        this.tags.set([]);
        this.remotes.set([]);
      } else {
        this.refsError.set(toAppError(err));
        this.branches.set([]);
        this.tags.set([]);
        this.remotes.set([]);
      }
    } finally {
      if (generation === this.refsGeneration) this.refsLoading.set(false);
    }
  }
}
