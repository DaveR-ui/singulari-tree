import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { GRAPH_ROW_HEIGHT, GraphRow } from '@singularitree/ui-kit';
import { GRAPH_PREFETCH_THRESHOLD, GraphStore, WIP_OID } from '../graph.store';
import { CommitDetailsPanel } from '../ui/commit-details-panel';
import { WipRow } from '../ui/wip-row';

/**
 * Commit graph feature page: virtualized graph rows (CDK) + pinned WIP node +
 * details panel + local filter. Data comes exclusively from `GraphStore`
 * (`getCommits` via `IpcBridge`); the page never talks to Git.
 */
@Component({
  selector: 'st-graph-page',
  standalone: true,
  imports: [ScrollingModule, GraphRow, WipRow, CommitDetailsPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="st-graph-page">
      <header class="st-graph-page__toolbar">
        <h2 class="st-graph-page__title">History</h2>
        <input
          type="search"
          class="st-graph-page__filter"
          placeholder="Filter by message, author or oid"
          aria-label="Filter commits"
          data-testid="graph-filter"
          [value]="store.filter()"
          (input)="onFilter($event)"
        />
        @if (store.isLoading()) {
          <span class="st-graph-page__status" data-testid="graph-loading">Loading…</span>
        }
        @if (store.offline()) {
          <span class="st-graph-page__status" data-testid="graph-offline">
            Git core offline — open a repository inside the desktop app to load history.
          </span>
        }
      </header>

      @if (store.error(); as error) {
        <p class="st-graph-page__error" data-testid="graph-error">{{ error.message }}</p>
      }

      <div class="st-graph-page__body">
        <div class="st-graph-page__graph">
          <!-- Pinned outside the virtual viewport so it never affects lane math. -->
          <st-wip-row [selected]="store.isWipSelected()" (picked)="selectWip()" data-testid="graph-wip" />

          <cdk-virtual-scroll-viewport
            class="st-graph-page__viewport"
            [itemSize]="rowHeight"
            (scrolledIndexChange)="onScrolledIndexChange($event)"
          >
            <st-graph-row
              *cdkVirtualFor="let row of store.filteredRows()"
              [commit]="row.commit"
              [lane]="row.lane"
              [maxLane]="maxLane()"
              [selected]="store.selectedOid() === row.commit.oid?.hex"
              (picked)="store.select(row.commit.oid?.hex ?? null)"
            />
          </cdk-virtual-scroll-viewport>

          @if (store.filteredRows().length === 0) {
            <p class="st-graph-page__empty" data-testid="graph-empty">
              {{ store.commits().length === 0 ? 'No commits to display.' : 'No commits match the filter.' }}
            </p>
          }
        </div>

        <aside class="st-graph-page__details" data-testid="graph-details">
          <st-commit-details-panel
            [commit]="store.selectedRow()?.commit ?? null"
            [isWip]="store.isWipSelected()"
          />
        </aside>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      min-height: 0;
      color: var(--st-color-text, #d6d6de);
    }

    .st-graph-page {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    .st-graph-page__toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--st-color-border, #2f2f44);
    }

    .st-graph-page__title {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
    }

    .st-graph-page__filter {
      flex: 0 1 320px;
      min-width: 120px;
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid var(--st-color-border, #2f2f44);
      background: var(--st-color-surface, #252536);
      color: inherit;
      font-size: 12px;
    }

    .st-graph-page__status,
    .st-graph-page__empty {
      opacity: 0.6;
      font-size: 12px;
    }

    .st-graph-page__error {
      margin: 0;
      padding: 6px 12px;
      font-size: 12px;
      color: #ff6b6b;
    }

    .st-graph-page__body {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
    }

    .st-graph-page__graph {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
    }

    .st-graph-page__viewport {
      flex: 1 1 auto;
      min-height: 0;
      width: 100%;
    }

    .st-graph-page__details {
      flex: 0 0 320px;
      min-width: 0;
      border-left: 1px solid var(--st-color-border, #2f2f44);
      overflow: hidden;
    }
  `,
})
export class GraphPage {
  readonly store = inject(GraphStore);

  /** Must match `GRAPH_ROW_HEIGHT` so CDK virtualization delegates row height. */
  readonly rowHeight = GRAPH_ROW_HEIGHT;
  readonly maxLane = computed(() => this.store.maxLane());

  onFilter(event: Event): void {
    this.store.setFilter((event.target as HTMLInputElement).value);
  }

  selectWip(): void {
    this.store.select(WIP_OID);
  }

  /** Infinite scroll: prefetch when the rendered range approaches the loaded end. */
  onScrolledIndexChange(index: number): void {
    if (index >= this.store.filteredRows().length - GRAPH_PREFETCH_THRESHOLD) {
      this.store.loadMore();
    }
  }
}
