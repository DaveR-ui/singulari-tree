import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Synthetic, UI-only row pinned above the virtualized graph, representing the
 * working tree (uncommitted changes). It never triggers a backend call and lives
 * outside `cdk-virtual-scroll-viewport`, so it cannot disturb lane alignment or
 * virtualization math (row height stays exactly one `itemSize`).
 */
@Component({
  selector: 'st-wip-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'st-wip-row',
    role: 'button',
    tabindex: '0',
    // Explicit height binding: the WIP node must occupy exactly one virtual row.
    '[style.height.px]': 'rowHeight',
    '[class.st-wip-row--selected]': 'selected()',
    '(click)': 'picked.emit()',
    '(keydown.enter)': 'picked.emit()',
  },
  template: `
    <svg class="st-wip-row__graph" width="14" height="28" viewBox="0 0 14 28" aria-hidden="true" focusable="false">
      <circle
        class="st-wip-row__node"
        cx="7"
        cy="14"
        r="4"
        fill="none"
        stroke="var(--st-color-text, #d6d6de)"
        stroke-width="2"
        stroke-dasharray="2 2"
      />
    </svg>
    <span class="st-wip-row__label" data-testid="wip-row-label">Uncommitted changes (WIP)</span>
    <span class="st-wip-row__hint">working tree</span>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 28px;
      padding: 0 8px;
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
      border-bottom: 1px solid var(--st-color-border, #2f2f44);
      color: var(--st-color-text, #d6d6de);
    }

    :host(:hover) {
      background: color-mix(in srgb, var(--st-color-accent, #0a84ff) 10%, transparent);
    }

    :host:focus-visible {
      outline: 1px solid var(--st-color-accent, #0a84ff);
      outline-offset: -1px;
    }

    :host(.st-wip-row--selected) {
      background: color-mix(in srgb, var(--st-color-accent, #0a84ff) 22%, transparent);
    }

    .st-wip-row__graph {
      flex: none;
      display: block;
    }

    .st-wip-row__label {
      font-style: italic;
    }

    .st-wip-row__hint {
      margin-left: auto;
      opacity: 0.5;
      font-size: 11px;
    }
  `,
})
export class WipRow {
  /** Same fixed height as `GRAPH_ROW_HEIGHT` so the pinned node aligns with rows. */
  readonly rowHeight = 28;

  readonly selected = input(false);
  readonly picked = output<void>();
}
