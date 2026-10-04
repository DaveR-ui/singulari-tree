import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { Branch, Remote, Tag } from '@contracts/domain';
import type { FetchRequest, PullRequest, PushRequest } from '@contracts/gitcore';
import { IpcBridge, toAppError, type AppError } from '@core/services/ipc-bridge.service';
import { RepoState } from '@core/services/repo-state.service';
import {
  parseRemoteTracking,
  type FetchIntent,
  type PullIntent,
  type PushIntent,
  type PushRowView,
  type RemoteBranchOption,
  type RemoteDialogKind,
  type RemoteOpProgress,
  type RemoteOption,
} from './remote-models';

function isIpcUnavailable(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'IPC_UNAVAILABLE'
  );
}

/**
 * Root store for the Git remote dialogs (Pull/Push/Fetch).
 *
 * Owns the active dialog, the ref data loaded for the active repository and the
 * running/progress/error state of a remote operation. It mirrors `RepoState`'s
 * graceful degradation when the Electron bridge is absent and reuses its active
 * repository as the operation target. The bridge/state/DestroyRef are
 * constructor parameters (defaulting to DI) so the store is unit-testable
 * without TestBed.
 */
@Injectable({ providedIn: 'root' })
export class RemoteOpsStore {
  private readonly bridge: IpcBridge;
  private readonly repoState: RepoState;

  /** Monotonic token for `loadRefs` (discards late responses). */
  private refsGeneration = 0;

  constructor(
    bridge: IpcBridge = inject(IpcBridge),
    repoState: RepoState = inject(RepoState),
    destroyRef: DestroyRef = inject(DestroyRef),
  ) {
    this.bridge = bridge;
    this.repoState = repoState;

    const unsubscribe = this.bridge.onProgress((p) => {
      this.progress.set({ percent: p.percent, message: p.message });
    });
    destroyRef.onDestroy(unsubscribe);
  }

  // -- dialog state --------------------------------------------------------
  readonly activeDialog = signal<RemoteDialogKind | null>(null);
  readonly dialogOpen = computed(() => this.activeDialog() !== null);

  // -- ref data for the active repository ----------------------------------
  readonly remotes = signal<Remote[]>([]);
  readonly locals = signal<Branch[]>([]);
  readonly tags = signal<Tag[]>([]);
  readonly refsLoading = signal(false);
  readonly refsError = signal<AppError | null>(null);
  readonly offline = signal(false);

  // -- remote operation state ----------------------------------------------
  readonly running = signal(false);
  readonly progress = signal<RemoteOpProgress | null>(null);
  readonly opError = signal<AppError | null>(null);

  // -- derived -------------------------------------------------------------
  readonly remoteOptions = computed<RemoteOption[]>(() =>
    this.remotes().map((r) => ({ name: r.name, url: r.urls[0] ?? '' })),
  );

  readonly localBranchNames = computed<string[]>(() => this.locals().map((b) => b.name));

  readonly currentBranch = computed(() => this.locals().find((b) => b.isCurrent)?.name ?? '');

  readonly pushRows = computed<PushRowView[]>(() =>
    this.locals().map((b) => ({
      localBranch: b.name,
      isCurrent: b.isCurrent,
      upstream: b.upstream,
      defaultRemoteBranch: parseRemoteTracking(b.upstream)?.branch ?? b.name,
    })),
  );

  /**
   * Remote branches discovered from the local branches' upstreams, keyed by
   * remote name and deduplicated by branch name. Empty when no local branch
   * tracks a remote (there is no RPC that enumerates remote branches yet).
   */
  readonly remoteBranchesByRemote = computed<Record<string, RemoteBranchOption[]>>(() => {
    const byRemote: Record<string, RemoteBranchOption[]> = {};
    for (const branch of this.locals()) {
      const parsed = parseRemoteTracking(branch.upstream);
      if (!parsed) continue;
      const list = byRemote[parsed.remote] ?? [];
      if (list.some((option) => option.name === parsed.branch)) continue;
      list.push({ name: parsed.branch, refName: branch.upstream, derivedFromUpstream: true });
      byRemote[parsed.remote] = list;
    }
    return byRemote;
  });

  // -- dialog actions ------------------------------------------------------

  /**
   * Open a remote dialog. No-op when no repository is active so the toolbar
   * cannot open a dialog without a target. Loads the ref lists in the
   * background.
   */
  openDialog(kind: RemoteDialogKind): void {
    if (this.repoState.activeId() === null) return;
    this.activeDialog.set(kind);
    this.opError.set(null);
    this.progress.set(null);
    void this.loadRefs();
  }

  closeDialog(): void {
    this.activeDialog.set(null);
    this.progress.set(null);
    this.opError.set(null);
  }

  // -- ref loading ---------------------------------------------------------

  /**
   * Load the remote/branch/tag objects for the active repository. Mirrors
   * `RepoState.loadRefs`: monotonic generation guard, `offline` on a missing
   * bridge, `refsError` on any other failure, empty lists on failure and a
   * guaranteed `refsLoading` reset.
   */
  async loadRefs(): Promise<void> {
    const id = this.repoState.activeId();
    const generation = ++this.refsGeneration;
    this.refsError.set(null);

    if (!id) {
      this.offline.set(false);
      this.remotes.set([]);
      this.locals.set([]);
      this.tags.set([]);
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
      this.offline.set(false);
      this.locals.set(branches.branches ?? []);
      this.remotes.set(remotes.remotes ?? []);
      this.tags.set(tags.tags ?? []);
    } catch (err) {
      // Stale failure: never mutate state for a newer active repo.
      if (generation !== this.refsGeneration) return;
      if (isIpcUnavailable(err)) {
        this.offline.set(true);
      } else {
        this.refsError.set(toAppError(err));
      }
      this.remotes.set([]);
      this.locals.set([]);
      this.tags.set([]);
    } finally {
      if (generation === this.refsGeneration) this.refsLoading.set(false);
    }
  }

  // -- remote operations ---------------------------------------------------

  /** Fetch every remote (sequentially) or a single one. */
  async runFetch(intent: FetchIntent): Promise<void> {
    const repoId = this.repoState.activeId();
    if (!repoId || this.running()) return;

    this.running.set(true);
    this.opError.set(null);
    this.progress.set({ percent: 0, message: 'Starting…' });
    try {
      if (intent.allRemotes) {
        for (const remote of this.remotes()) {
          await this.bridge.invoke('fetch', {
            repoId,
            remote: remote.name,
            prune: intent.prune,
            tags: intent.tags,
            force: intent.force,
          } satisfies FetchRequest);
        }
      } else {
        await this.bridge.invoke('fetch', {
          repoId,
          remote: intent.remote,
          prune: intent.prune,
          tags: intent.tags,
          force: intent.force,
        } satisfies FetchRequest);
      }
      await this.loadRefs();
    } catch (err) {
      this.handleRunError(err);
    } finally {
      this.running.set(false);
      this.progress.set(null);
    }
  }

  /** Pull `intent.branch` from `intent.remote` into the active repository. */
  async runPull(intent: PullIntent): Promise<void> {
    const repoId = this.repoState.activeId();
    if (!repoId || this.running()) return;

    this.running.set(true);
    this.opError.set(null);
    this.progress.set({ percent: 0, message: 'Starting…' });
    try {
      await this.bridge.invoke('pull', {
        repoId,
        remote: intent.remote,
        branch: intent.branch,
        localBranch: intent.intoLocalBranch,
        noCommit: intent.noCommit,
        log: intent.log,
        noFf: intent.noFf,
        rebase: intent.rebase,
      } satisfies PullRequest);
      await this.loadRefs();
    } catch (err) {
      this.handleRunError(err);
    } finally {
      this.running.set(false);
      this.progress.set(null);
    }
  }

  /** Push every selected row (sequentially) to `intent.remote`. */
  async runPush(intent: PushIntent): Promise<void> {
    const repoId = this.repoState.activeId();
    if (!repoId || this.running()) return;

    this.running.set(true);
    this.opError.set(null);
    this.progress.set({ percent: 0, message: 'Starting…' });
    try {
      for (const row of intent.branches) {
        if (!row.localBranch) continue;
        await this.bridge.invoke('push', {
          repoId,
          remote: intent.remote,
          branch: row.localBranch,
          // Empty `remoteBranch` means "same name as `branch`" (core contract).
          remoteBranch: row.remoteBranch,
          setUpstream: row.track,
          tags: intent.tags,
          force: intent.force,
        } satisfies PushRequest);
      }
      await this.loadRefs();
    } catch (err) {
      this.handleRunError(err);
    } finally {
      this.running.set(false);
      this.progress.set(null);
    }
  }

  private handleRunError(err: unknown): void {
    if (isIpcUnavailable(err)) {
      this.offline.set(true);
      return;
    }
    // Surface real core failures (FETCH_FAILED/PULL_FAILED/PUSH_FAILED, …) as-is.
    this.opError.set(toAppError(err));
  }
}
