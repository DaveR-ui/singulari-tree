import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Two-pane workspace primitive (plan §4.5/§4.6): a pinned detail pane plus a
 * flexible primary pane — never the sketch's two equal columns, which starve
 * the graph and the 12px-mono diff below ~1200px.
 *
 * Content projection: the default slot is the primary pane; elements marked
 * with the `detail` attribute are projected into the pinned detail pane, which
 * only renders while `showDetail()` is true. P2 mounts the split with the
 * primary slot only; P3 starts projecting the detail pane.
 */
@Component({
  selector: 'st-workspace-split',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showDetail()) {
      <section
        class="st-workspace-split__detail"
        data-testid="workspace-detail"
        [style.width]="detailWidth()"
      >
        @if (detailTitle()) {
          <header class="st-workspace-split__detail-header" data-testid="workspace-detail-header">
            {{ detailTitle() }}
          </header>
        }
        <div class="st-workspace-split__detail-body"><ng-content select="[detail]" /></div>
      </section>
    }
    <section class="st-workspace-split__primary" data-testid="workspace-primary">
      <ng-content />
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex: 1 1 auto;
      min-width: 0;
      height: 100%;
    }

    .st-workspace-split__detail {
      display: flex;
      flex: none;
      flex-direction: column;
      min-width: 0;
      background: var(--st-color-surface);
      border-right: var(--st-hairline) solid var(--st-color-border);
    }

    .st-workspace-split__detail-header {
      display: flex;
      align-items: center;
      flex: none;
      height: var(--st-size-row-tree-dense);
      padding: 0 var(--st-space-3);
      border-bottom: var(--st-hairline) solid var(--st-color-border);
      font-size: var(--st-font-13);
      font-weight: 600;
    }

    .st-workspace-split__detail-body {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      min-width: 0;
    }

    .st-workspace-split__primary {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
    }
  `,
})
export class WorkspaceSplitComponent {
  readonly showDetail = input(false);
  readonly detailWidth = input('var(--st-size-detail-pane)');
  readonly detailTitle = input('');
}
