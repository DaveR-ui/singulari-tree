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
  /** Id of the repository currently being removed, or null when idle. */
  readonly removingId = signal<RepositoryId | null>(null);

  // -- ref lists for the active repository ---------------------------------
  /** Local branch display names (remote-tracking branches are excluded). */
  readonly branches = signal<string[]>([]);
  /** Remote-tracking branch display names, e.g. `origin/david/topic`. */
  readonly remoteBranches = signal<string[]>([]);
  readonly tags = signal<string[]>([]);
  readonly remotes = signal<string[]>([]);
  /**
   * Name of the current local branch (`isCurrent && !isRemote`), or `''` when
   * there is no active repo / detached HEAD.
   */
  readonly currentBranch = signal('');
  /**
   * Pull-pending count of the current local branch vs. its upstream; `0` when
   * the branch has no upstream, is not current, or there is no active repo.
   */
  readonly currentBranchBehind = signal(0);
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

  /**
   * Remove a persisted repository from the core (`removeRepository`).
   *
   * On success the repo is dropped from `repos`; if it was the active one,
   * `activeId` is cleared and `loadRefs()` runs to clear the ref lists and bump
   * the generation token. On failure the list/selection are left untouched:
   * `reposOffline` records a missing bridge, any other error goes to `reposError`.
   */
  async removeRepository(id: RepositoryId): Promise<boolean> {
    this.removingId.set(id);
    this.reposError.set(null);
    try {
      await this.bridge.invoke('removeRepository', { repoId: id });
      this.reposOffline.set(false);
      this.repos.update((prev) => prev.filter((repo) => repo.id !== id));
      if (this.activeId() === id) {
        this.activeId.set(null);
        void this.loadRefs();
      }
      return true;
    } catch (err) {
      if (isIpcUnavailable(err)) {
        this.reposOffline.set(true);
      } else {
        this.reposError.set(toAppError(err));
      }
      return false;
    } finally {
      this.removingId.set(null);
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
   * Load branch/tag/remote display names for the active repository. Local
   * branches (`!isRemote`) feed `branches`; remote-tracking branches
   * (`isRemote`) feed `remoteBranches`; `origin/HEAD` is never surfaced. Clears
   * the lists when there is no active repo; records `refsOffline` on a missing
   * bridge and any other failure on `refsError`. A monotonic generation token
   * discards late responses from a repository that is no longer active.
   */
  async loadRefs(): Promise<void> {
    const id = this.activeId();
    const generation = ++this.refsGeneration;
    this.refsError.set(null);

    if (!id) {
      this.refsOffline.set(false);
      this.clearRefLists();
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
      const refs = branches.branches ?? [];
      this.branches.set(refs.filter((b) => !b.isRemote).map((b) => b.name));
      // The current branch drives the toolbar/sidebar pull-pending badge; only
      // the current local branch is badged, and only when it is behind.
      const current = refs.find((b) => b.isCurrent && !b.isRemote);
      this.currentBranch.set(current?.name ?? '');
      this.currentBranchBehind.set(current?.behind ?? 0);
      // Defensive: never surface the symbolic `origin/HEAD` remote ref
      // (matched on the raw ref so it holds regardless of short-name form).
      this.remoteBranches.set(
        refs
          .filter((b) => b.isRemote && !b.refName.endsWith('/HEAD'))
          .map((b) => b.name),
      );
      this.tags.set(tags.tags.map((t) => t.name));
      this.remotes.set(remotes.remotes.map((r) => r.name));
    } catch (err) {
      // Stale failure: never mutate state for a newer active repo.
      if (generation !== this.refsGeneration) return;
      if (isIpcUnavailable(err)) {
        this.refsOffline.set(true);
      } else {
        this.refsError.set(toAppError(err));
      }
      this.clearRefLists();
    } finally {
      if (generation === this.refsGeneration) this.refsLoading.set(false);
    }
  }

  /** Clear every ref list; used when there is no active repo or on failure. */
  private clearRefLists(): void {
    this.branches.set([]);
    this.remoteBranches.set([]);
    this.tags.set([]);
    this.remotes.set([]);
    this.currentBranch.set('');
    this.currentBranchBehind.set(0);
  }
}
