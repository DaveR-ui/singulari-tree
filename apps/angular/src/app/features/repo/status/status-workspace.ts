import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject } from '@angular/core';
import type { FileDiff } from '@contracts/domain';
import { DiffViewer } from '@singularitree/ui-kit';
import { IpcBridge } from '@core/services/ipc-bridge.service';
import { RepoState } from '@core/services/repo-state.service';
import { GraphStore, WIP_OID } from '../graph/graph.store';
import { StatusStore } from './status.store';
import { ChangesPanel } from './ui/changes-panel';
import type { HunkActionEvent } from './ui/hunk-actions';

/**
 * Bottom working-tree region of the repo page: the changes panel (status +
 * staging + commit) and the diff viewer.
 *
 * It is the only place that bridges the two stores: it pushes the graph's
 * `repoId`/HEAD/selection into `StatusStore`, loads the right diff (working
 * tree for the WIP row, first-parent diff for a commit), reloads the graph
 * after a successful commit, and mirrors `fs:changed` into both stores.
 */
@Component({
  selector: 'st-status-workspace',
  standalone: true,
  imports: [ChangesPanel, DiffViewer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="st-status-workspace">
      <div class="st-status-workspace__changes">
        <st-changes-panel
          [stagedFiles]="status.stagedFiles()"
          [unstagedFiles]="status.unstagedFiles()"
          [message]="status.commitMessage()"
          [busy]="status.loading()"
          [selectedPath]="status.selectedPath()"
          [statusError]="status.error()?.message ?? null"
          [commitError]="status.commitError()?.message ?? null"
          [unstagedFile]="selectedUnstagedFile()"
          [stagedFile]="selectedStagedFile()"
          [diffTruncated]="hunkActionsTruncated()"
          (stage)="status.stage($event)"
          (unstage)="status.unstage($event)"
          (discardFile)="status.discardFiles([$event])"
          (stageHunk)="onStageHunk($event)"
          (unstageHunk)="onUnstageHunk($event)"
          (discardHunk)="onDiscardHunk($event)"
          (messageChange)="status.setMessage($event)"
          (commit)="status.commit()"
          (fileSelect)="status.setSelectedPath($event)"
        />
      </div>
      <div class="st-status-workspace__diff">
        <st-diff-viewer
          [diff]="status.diff()"
          [loading]="status.diffLoading()"
          [errorMsg]="status.diffError()?.message ?? null"
          [truncated]="status.diffTruncated()"
        />
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-height: 0;
      color: var(--st-color-text, #d6d6de);
    }

    .st-status-workspace {
      display: flex;
      height: 100%;
      min-height: 0;
    }

    .st-status-workspace__changes {
      flex: 0 0 320px;
      min-width: 0;
      border-right: 1px solid var(--st-color-border, #2f2f44);
      overflow: auto;
    }

    .st-status-workspace__diff {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
    }
  `,
})
export class StatusWorkspace {
  readonly status = inject(StatusStore);

  private readonly graph = inject(GraphStore);
  private readonly bridge = inject(IpcBridge);
  private readonly repoState = inject(RepoState);
  private readonly destroyRef = inject(DestroyRef);

  /** Last observed `RepoState.statusRefreshRequested` token (dedupes the effect). */
  private lastStatusRefresh = this.repoState.statusRefreshRequested();

  /** Selected file's worktree FileDiff (Stage/Discard side), if present. */
  readonly selectedUnstagedFile = computed<FileDiff | null>(() =>
    this.findSelectedFile(this.status.unstagedDiffFiles()),
  );

  /** Selected file's staged FileDiff (Unstage side), if present. */
  readonly selectedStagedFile = computed<FileDiff | null>(() =>
    this.findSelectedFile(this.status.stagedDiffFiles()),
  );

  /** True when either addressing diff was capped (hunk list may be incomplete). */
  readonly hunkActionsTruncated = computed(
    () => this.status.unstagedDiffTruncated() || this.status.stagedDiffTruncated(),
  );

  constructor() {
    // Follow the graph's repository lifecycle.
    effect(() => {
      const id = this.graph.repoId();
      if (id && this.status.repoId() !== id) {
        this.status.setRepoId(id);
        void this.status.loadStatus();
        // Start the background filesystem watch for this repo. Fire-and-forget:
        // `fs:changed` drives the reloads below; the store already degrades to
        // `offline` when the bridge is unavailable, so failures stay silent.
        void this.startWatch(id);
      }
    });

    // HEAD is the newest loaded commit; it is the `from` side of the worktree diff.
    effect(() => {
      this.status.setHeadOid(this.graph.commits()[0]?.oid?.hex ?? null);
    });

    // Selection drives diff loading: WIP -> status + worktree diff; commit -> parent diff.
    effect(() => {
      const oid = this.graph.selectedOid();
      if (oid === WIP_OID) {
        void this.status.loadStatus();
        void this.status.loadWorkingTreeDiff();
        void this.status.loadStagedDiff();
      } else if (oid) {
        const commit = this.graph.commits().find((candidate) => candidate.oid?.hex === oid);
        if (commit) void this.status.loadCommitDiff(commit);
      }
    });

    // A successful commit moves HEAD: reload the graph window.
    effect(() => {
      if (this.status.graphReloadRequested() > 0) this.graph.reload();
    });

    // A ref mutation that may have moved HEAD or dirtied the tree (a checkout on
    // branch create, or a merge — conflict or not) refreshes the graph and the
    // working tree so newly conflicted files appear (ADR-028).
    effect(() => {
      const token = this.repoState.statusRefreshRequested();
      if (token === this.lastStatusRefresh) return;
      this.lastStatusRefresh = token;
      this.graph.reload();
      this.status.reload();
      void this.status.loadWorkingTreeDiff();
      void this.status.loadStagedDiff();
    });

    // External file changes invalidate the graph, the status list and the
    // currently displayed working-tree diff (otherwise the diff pane is stale).
    const unsubscribe = this.bridge.onFsChanged(() => {
      this.graph.reload();
      this.status.reload();
      if (this.graph.selectedOid() === WIP_OID) {
        void this.status.loadWorkingTreeDiff();
        void this.status.loadStagedDiff();
      }
    });
    this.destroyRef.onDestroy(unsubscribe);
  }

  /** Stage a hunk/line selection on the selected file. */
  onStageHunk(event: HunkActionEvent): void {
    void this.status.stageHunk(event.path, event.hunkIndex, event.lineIndices);
  }

  /** Unstage a hunk/line selection on the selected file. */
  onUnstageHunk(event: HunkActionEvent): void {
    void this.status.unstageHunk(event.path, event.hunkIndex, event.lineIndices);
  }

  /** Discard a hunk/line selection on the selected file (worktree). */
  onDiscardHunk(event: HunkActionEvent): void {
    void this.status.discardHunk(event.path, event.hunkIndex, event.lineIndices);
  }

  private findSelectedFile(files: FileDiff[]): FileDiff | null {
    const path = this.status.selectedPath();
    if (!path) return null;
    return files.find((file) => file.path === path) ?? null;
  }

  /**
   * Ask the shell to start the background `Watch` stream for `repoId`. Fire-and-
   * forget: the promise resolves an ack immediately and the store already
   * degrades when the bridge is absent, so a failure here is swallowed.
   */
  private async startWatch(repoId: string): Promise<void> {
    try {
      await this.bridge.invoke('watch', { repoId });
    } catch {
      // Intentionally ignored: the store's offline/error state covers it.
    }
  }
}
