import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { WorkspaceSplitComponent } from '@singularitree/ui-kit';
import { CommitFocusService } from '@core/services/commit-focus.service';
import { IpcBridge } from '@core/services/ipc-bridge.service';
import { RepoState } from '@core/services/repo-state.service';
import { GraphStore } from '../graph/graph.store';
import { CommitDetailsPanel } from '../graph/ui/commit-details-panel';
import { GraphPage } from '../graph/page/graph-page';
import { RepoPicker } from '../ui/repo-picker';

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
  imports: [WorkspaceSplitComponent, CommitDetailsPanel, RepoPicker, GraphPage],
  template: `
    <st-workspace-split [showDetail]="showDetail()" [detailTitle]="detailTitle()">
      <st-commit-details-panel
        detail
        [commit]="selectedCommit()"
        [isWip]="isWipSelected()"
        [showCta]="true"
        (reviewChanges)="openChanges()"
      />
      @if (graphStore.repoId()) {
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
    :host st-repo-picker {
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
  private readonly destroyRef = inject(DestroyRef);
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

  /** Last observed `RepoState.statusRefreshRequested` token (dedupes the effect). */
  private lastStatusRefresh = this.repoState.statusRefreshRequested();

  constructor() {
    // Sync the active repo into the route-scoped graph. `openRepository` is not
    // idempotent (it refreshes `last_opened_at`), so guard by id and only open
    // when the graph currently points at a different repository.
    //
    // The same effect consumes a pending cross-repo search focus (ADR-026): once
    // the matching repository is open it selects (and, if needed, pages to) the
    // requested commit. A focus for the already-open repo is handled in place.
    effect(() => {
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
}
