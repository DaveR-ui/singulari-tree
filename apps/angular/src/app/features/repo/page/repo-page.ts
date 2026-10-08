import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { CommitFocusService } from '@core/services/commit-focus.service';
import { RepoState } from '@core/services/repo-state.service';
import { GraphStore } from '../graph/graph.store';
import { GraphPage } from '../graph/page/graph-page';
import { StatusWorkspace } from '../status/status-workspace';
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
  imports: [RepoPicker, GraphPage, StatusWorkspace],
  template: `
    <section class="st-repo-page">
      <header class="st-repo-page__head">
        <h1 class="st-repo-page__title">Repository</h1>
      </header>
      <st-repo-picker />
      <div class="st-repo-page__graph">
        <st-graph-page />
      </div>
      <div class="st-repo-page__status" data-testid="repo-status-workspace">
        <st-status-workspace />
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

    .st-repo-page__status {
      flex: 0 0 260px;
      min-height: 0;
      border-top: 1px solid var(--st-color-border, #2f2f44);
      overflow: hidden;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepoPage {
  private readonly repoState = inject(RepoState);
  private readonly graphStore = inject(GraphStore);
  private readonly commitFocus = inject(CommitFocusService);

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
  }
}
