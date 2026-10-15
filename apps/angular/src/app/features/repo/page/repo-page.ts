import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Repository } from '@contracts/domain';
import { WorkspaceSplitComponent } from '@singularitree/ui-kit';
import { CommitFocusService } from '@core/services/commit-focus.service';
import { IpcBridge } from '@core/services/ipc-bridge.service';
import { RepoState } from '@core/services/repo-state.service';
import { WorkspacesStore } from '@core/services/workspaces.store';
import { GraphStore } from '../graph/graph.store';
import { CommitDetailsPanel } from '../graph/ui/commit-details-panel';
import { GraphPage } from '../graph/page/graph-page';
import { StatusStore } from '../status/status.store';
import { RepoPicker } from '../ui/repo-picker';
import { RepoRelocatePanel } from '../ui/repo-relocate-panel';

/**
 * Routed repository page: the History workspace. It mounts the shared
 * `st-workspace-split` (pinned commit-detail pane + flexible graph pane) and
 * first-run `st-repo-picker` empty state.
 *
 * It also hydrates the route-scoped `GraphStore` from the root `RepoState`: the
 * repository list route only calls `RepoState.setActive()` (or opens the repo
 * itself) before navigating here, so without this sync the graph would stay
 * empty until the user re-picked from the in-page picker.
 */
@Component({
  selector: 'st-repo-page',
  standalone: true,
  imports: [
    WorkspaceSplitComponent,
    CommitDetailsPanel,
    RepoPicker,
    RepoRelocatePanel,
    GraphPage,
  ],
  template: `
    <st-workspace-split [showDetail]="showDetail()" [detailTitle]="detailTitle()">
      <st-commit-details-panel
        detail
        [commit]="selectedCommit()"
        [isWip]="isWipSelected()"
        [changedFiles]="changedFiles()"
        [showCta]="true"
        [showNavigation]="true"
        (reviewChanges)="openChanges()"
        (viewInTree)="viewInTree()"
        (back)="clearSelection()"
      />
      <!--
        Recovery wins over the picker: GraphStore.openRepository leaves repoId()
        null on failure, so without this branch a missing repo would silently
        fall back to the first-run picker — the exact "did not detect the error"
        complaint. The recovery panel names the state and offers the
        relocate/remove fallbacks instead of deleting the registration.
      -->
      @if (relocateRepo(); as repo) {
        <st-repo-relocate-panel
          [repo]="repo"
          [reason]="relocateReason()"
          [busy]="relocating()"
          (relocated)="onRelocated($event)"
          (removed)="onRemoved()"
        />
      } @else if (graphStore.repoId()) {
        <st-graph-page />
      } @else {
        <st-repo-picker />
      }
    </st-workspace-split>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      color: var(--st-color-text);
    }

    /* The split fills the routed host; the graph/picker fills the primary pane. */
    :host st-workspace-split {
      flex: 1 1 auto;
      min-height: 0;
    }

    :host st-graph-page,
    :host st-repo-picker,
    :host st-repo-relocate-panel {
      flex: 1 1 auto;
      min-height: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepoPage {
  private readonly repoState = inject(RepoState);
  readonly graphStore = inject(GraphStore);
  private readonly commitFocus = inject(CommitFocusService);
  private readonly bridge = inject(IpcBridge);
  private readonly workspaces = inject(WorkspacesStore);
  private readonly destroyRef = inject(DestroyRef);
  /**
   * The route-scoped `StatusStore` (the same instance `FileStatusStore` composes),
   * used read-only for the History aside's changed-file tooltip (ADR-032).
   */
  private readonly status = inject(StatusStore);
  /**
   * Optional: the page is also constructed outside a router (unit spec), so the
   * primary CTA's navigation degrades to a no-op there.
   */
  private readonly router = inject(Router, { optional: true });

  /** Selected commit row's commit, or null when nothing/WIP is selected. */
  readonly selectedCommit = computed(() => this.graphStore.selectedRow()?.commit ?? null);
  /** Whether the synthetic working-tree (WIP) node is the current selection. */
  readonly isWipSelected = computed(() => this.graphStore.isWipSelected());
  /** The detail pane is pinned whenever any row (commit or WIP) is selected. */
  readonly showDetail = computed(() => this.graphStore.selectedOid() !== null);
  /** Header label of the pinned detail pane. */
  readonly detailTitle = computed(() =>
    this.isWipSelected() ? $localize`Working tree` : $localize`Commit`,
  );

  /**
   * The active repository whose folder could not be opened, or null.
   *
   * `GraphStore.error.code` is a plain string (not an enum), matched here by its
   * core error codes. Recovery is only offered while the *active* repo's folder
   * is the problem, so an unrelated stale graph error never blocks the picker.
   */
  readonly relocateRepo = computed<Repository | null>(() => {
    const code = this.graphStore.error()?.code;
    if (code !== 'REPO_PATH_MISSING' && code !== 'NOT_A_GIT_REPO') return null;
    return this.repoState.activeRepo();
  });

  /** 'missing' when the recorded folder is gone; 'not-a-repo' when it exists but isn't a Git repo. */
  readonly relocateReason = computed<'missing' | 'not-a-repo'>(() =>
    this.graphStore.error()?.code === 'NOT_A_GIT_REPO' ? 'not-a-repo' : 'missing',
  );

  /** True while the graph is being reopened after an explicit relocation. */
  readonly relocating = signal(false);

  /**
   * True while a relocation owns the graph open. `onRelocated` opens the graph
   * explicitly; this gate suppresses the hydration effect for that window so
   * `setActive` — which replaces the repo object and re-runs the effect — cannot
   * race a second `openRepository`.
   */
  private readonly relocateOpening = signal(false);

  /** Last observed `RepoState.statusRefreshRequested` token (dedupes the effect). */
  private lastStatusRefresh = this.repoState.statusRefreshRequested();

  /**
   * Changed-file paths of the selected commit, for the aside's read-only
   * tooltip (ADR-032). Empty for the WIP row and for a cleared selection; the
   * panel owns the disclosure, this page owns the read.
   */
  readonly changedFiles = signal<readonly string[]>([]);

  /**
   * Monotonic token guarding the async file-list read: a response whose commit
   * is no longer selected is dropped instead of overwriting the current list.
   */
  private changedFilesSeq = 0;

  constructor() {
    // Sync the active repo into the route-scoped graph. `openRepository` is not
    // idempotent (it refreshes `last_opened_at`), so guard by id and only open
    // when the graph currently points at a different repository.
    //
    // The gate skips this while a relocation owns the open (see `onRelocated`):
    // `setActive` swaps the repo object, so without it the effect would fire a
    // second `openRepository` that races the explicit one.
    //
    // The same effect consumes a pending cross-repo search focus (ADR-026): once
    // the matching repository is open it selects (and, if needed, pages to) the
    // requested commit. A focus for the already-open repo is handled in place.
    effect(() => {
      if (this.relocateOpening()) return;
      const active = this.repoState.activeRepo();
      const pending = this.commitFocus.pending();
      if (!active) return;

      if (this.graphStore.repoId() === active.id) {
        if (pending && pending.repoId === active.id) {
          this.commitFocus.clear();
          void this.graphStore.focusCommit(pending.oid);
        }
        return;
      }

      void this.graphStore.openRepository(active.fsPath).then(() => {
        const oid = this.commitFocus.consume(active.id);
        if (oid) void this.graphStore.focusCommit(oid);
      });
    });

    // A ref mutation that may have moved HEAD or dirtied the tree (a checkout on
    // branch create, a merge — ADR-028) used to be observed by `StatusWorkspace`,
    // the band ADR-0030 item 1 removed. Its graph half lives here now: the
    // History screen must not show a stale window after HEAD moves. The
    // working-tree half of the same token is owned by `FileStatusPage`.
    effect(() => {
      const token = this.repoState.statusRefreshRequested();
      if (token === this.lastStatusRefresh) return;
      this.lastStatusRefresh = token;
      this.graphStore.reload();
    });

    // External file changes invalidate the graph window — the reload
    // `StatusWorkspace` fired on `fs:changed` before the band was removed.
    const unsubscribe = this.bridge.onFsChanged(() => this.graphStore.reload());
    this.destroyRef.onDestroy(unsubscribe);

    // ADR-032: the aside's changed-file tooltip. Point the route-scoped
    // `StatusStore` at the open repository (mirroring `FileStatusPage`) and,
    // when a real commit is selected, read its first-parent / empty-tree file
    // list. The read is deliberately non-mutating (`readCommitChangedFiles`), so
    // it never disturbs the File-status viewer or its staging substrates, and
    // `headOid` is not needed — the read takes its `from`/`to` explicitly. The
    // WIP row and a cleared selection both clear the list; the monotonic token
    // drops a late response for a commit that is no longer selected.
    effect(() => {
      const repoId = this.graphStore.repoId();
      this.status.setRepoId(repoId);

      const commit = this.selectedCommit();
      const seq = ++this.changedFilesSeq;
      if (!repoId || !commit) {
        this.changedFiles.set([]);
        return;
      }
      void this.status.readCommitChangedFiles(commit).then((paths) => {
        if (seq !== this.changedFilesSeq) return;
        this.changedFiles.set(paths);
      });
    });
  }

  /**
   * Detail-pane primary CTA: route to the File status screen, which reads the
   * shared graph store's selection to choose its variant (ADR-0029/0030).
   *
   * Defence-in-depth for the headline path: `GraphPage`'s destroy hook also
   * queues the restore, and this explicit call keeps the CTA correct even if the
   * pane is ever unmounted in a way that skips that hook.
   */
  openChanges(): void {
    this.graphStore.requestScrollRestore();
    void this.router?.navigate(['/repo', 'file-status']);
  }

  /**
   * The recovery panel relocated the active repository. The id is unchanged, so
   * `openTab` refreshes the tab's cached path in place (no duplicate tab) and
   * `setActive` keeps the single active-repo source of truth on it.
   *
   * `openRepository` is then called *directly* while `relocateOpening` gates the
   * hydration effect. `setActive` REPLACES the repo object inside `repos`, so
   * `activeRepo()` yields a new reference and the effect re-runs; the failed open
   * left `repoId()` null, so an ungated effect would call `openRepository` itself
   * and race this explicit one. The gate keeps a single open. On success
   * `loadWindow` clears the error, the graph renders and the panel disappears.
   */
  onRelocated(repo: Repository): void {
    this.relocateOpening.set(true);
    this.workspaces.openTab(repo);
    this.repoState.setActive(repo);
    this.relocating.set(true);
    void this.graphStore.openRepository(repo.fsPath).finally(() => {
      this.relocateOpening.set(false);
      this.relocating.set(false);
    });
  }

  /**
   * The recovery panel removed the active repository explicitly. `removeRepository`
   * already cleared `activeId`, so the picker is what renders next; nothing else
   * to do here — and, crucially, this is only reached by the user's own action.
   */
  onRemoved(): void {
    // No-op by design; kept as the panel's explicit-intent seam.
  }

  /** Item 7a: reveal the selected commit's node in the graph list (no-op for WIP/none). */
  viewInTree(): void {
    const oid = this.selectedCommit()?.oid?.hex;
    if (!oid) return;
    void this.graphStore.focusCommit(oid);
  }

  /** Item 7a: clear the selection so the aside returns to "select a commit". */
  clearSelection(): void {
    this.graphStore.select(null);
  }
}
