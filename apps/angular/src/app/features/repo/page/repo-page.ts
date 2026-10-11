import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject } from '@angular/core';
import { CommitFocusService } from '@core/services/commit-focus.service';
import { IpcBridge } from '@core/services/ipc-bridge.service';
import { RepoState } from '@core/services/repo-state.service';
import { GraphStore } from '../graph/graph.store';
import { GraphPage } from '../graph/page/graph-page';
import { RepoPicker } from '../ui/repo-picker';

/**
 * Routed repository page: picker + real commit graph, filling the shell center.
 *
 * It also hydrates the route-scoped `GraphStore` from the root `RepoState`: the
 * repository list route only calls `RepoState.setActive()` (or opens the repo
 * itself) before navigating here, so without this sync the graph would stay
 * empty until the user re-picked from the in-page picker.
 */
@Component({
  selector: 'st-repo-page',
  standalone: true,
  imports: [RepoPicker, GraphPage],
  template: `
    <section class="st-repo-page">
      <header class="st-repo-page__head">
        <h1 class="st-repo-page__title">Repository</h1>
      </header>
      <st-repo-picker />
      <div class="st-repo-page__graph">
        <st-graph-page />
      </div>
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      color: var(--st-color-text, #d6d6de);
    }

    .st-repo-page {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    .st-repo-page__head {
      flex: 0 0 auto;
      padding: 8px 12px;
      border-bottom: 1px solid var(--st-color-border, #2f2f44);
    }

    .st-repo-page__title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }

    .st-repo-page__graph {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
    }

    .st-repo-page__graph st-graph-page {
      flex: 1 1 auto;
      min-height: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepoPage {
  private readonly repoState = inject(RepoState);
  private readonly graphStore = inject(GraphStore);
  private readonly commitFocus = inject(CommitFocusService);
  private readonly bridge = inject(IpcBridge);
  private readonly destroyRef = inject(DestroyRef);

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
}
