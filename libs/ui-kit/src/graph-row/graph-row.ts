import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { Commit, Lane } from '@contracts/domain';
import { laneColor } from './lane-palette';
import { authorName, firstLine, formatShortDate, normalizeRefKind, shortOidHex } from './graph-row.utils';

/** Fixed row height in px — MUST match the CDK virtual-scroll `itemSize`. */
export const GRAPH_ROW_HEIGHT = 28;
/** Width in px of a single lane column inside the SVG graph segment. */
export const LANE_COLUMN_WIDTH = 14;

/**
 * Dumb, presentational commit row: one SVG lane segment + short oid, ref labels,
 * message subject, author and date. Holds no services — the parent owns data.
 */
@Component({
  selector: 'st-graph-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'st-graph-row',
    role: 'button',
    tabindex: '0',
    '[style.height.px]': 'rowHeight',
    '[class.st-graph-row--selected]': 'selected()',
    '(click)': 'picked.emit()',
    '(keydown.enter)': 'picked.emit()',
  },
  template: `
    <svg
      class="st-graph-row__graph"
      [attr.width]="graphWidth()"
      [attr.height]="rowHeight"
      [attr.viewBox]="'0 0 ' + graphWidth() + ' ' + rowHeight"
      aria-hidden="true"
      focusable="false"
    >
      @if (lane().continues) {
        <line
          class="st-graph-row__lane-line"
          [attr.x1]="laneX()"
          [attr.y1]="0"
          [attr.x2]="laneX()"
          [attr.y2]="rowHeight"
          [attr.stroke]="color()"
          stroke-width="2"
        />
      }
      <circle
        class="st-graph-row__node"
        [attr.cx]="laneX()"
        [attr.cy]="rowHeight / 2"
        r="4"
        [attr.fill]="color()"
      />
    </svg>

    <div class="st-graph-row__content">
      <span class="st-graph-row__oid" data-testid="graph-row-oid">{{ shortOid() }}</span>
      @for (ref of refs(); track ref.kind + ':' + ref.name) {
        <span class="st-graph-row__ref" [class]="refClass(ref.kind)" data-testid="graph-row-ref">{{
          ref.name
        }}</span>
      }
      <span class="st-graph-row__message" [title]="message()" data-testid="graph-row-message">{{
        message()
      }}</span>
      <span class="st-graph-row__author" data-testid="graph-row-author">{{ author() }}</span>
      <span class="st-graph-row__date" data-testid="graph-row-date">{{ date() }}</span>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 28px;
      padding: 0 8px;
      overflow: hidden;
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
      border-bottom: 1px solid var(--st-color-border, #2f2f44);
      color: var(--st-color-text, #d6d6de);
      contain: layout style;
    }

    :host(:hover) {
      background: color-mix(in srgb, var(--st-color-accent, #0a84ff) 10%, transparent);
    }

    :host:focus-visible {
      outline: 1px solid var(--st-color-accent, #0a84ff);
      outline-offset: -1px;
    }

    :host(.st-graph-row--selected) {
      background: color-mix(in srgb, var(--st-color-accent, #0a84ff) 22%, transparent);
    }

    .st-graph-row__graph {
      flex: none;
      display: block;
    }

    .st-graph-row__content {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
    }

    .st-graph-row__oid {
      flex: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      opacity: 0.6;
    }

    .st-graph-row__ref {
      flex: none;
      padding: 1px 5px;
      border-radius: 999px;
      border: 1px solid currentColor;
      font-size: 10px;
      line-height: 14px;
      white-space: nowrap;
    }

    .st-graph-row__ref--head {
      color: #0a84ff;
    }

    .st-graph-row__ref--branch {
      color: #30d158;
    }

    .st-graph-row__ref--remote {
      color: #ff9f0a;
    }

    .st-graph-row__ref--tag {
      color: #bf5af2;
    }

    .st-graph-row__ref--other {
      color: var(--st-color-text, #d6d6de);
      opacity: 0.7;
    }

    .st-graph-row__message {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .st-graph-row__author {
      flex: none;
      margin-left: auto;
      opacity: 0.75;
      white-space: nowrap;
    }

    .st-graph-row__date {
      flex: none;
      opacity: 0.5;
      white-space: nowrap;
    }
  `,
})
export class GraphRow {
  readonly commit = input.required<Commit>();
  readonly lane = input.required<Lane>();
  readonly selected = input(false);
  /** Highest lane index currently in the viewport; keeps every row's graph column aligned. */
  readonly maxLane = input(0);

  readonly picked = output<void>();

  readonly rowHeight = GRAPH_ROW_HEIGHT;

  readonly refs = computed(() => this.commit().refs ?? []);
  readonly shortOid = computed(() => shortOidHex(this.commit().oid?.hex));
  readonly message = computed(() => firstLine(this.commit().message));
  readonly author = computed(() =>
    authorName(this.commit().author?.name, this.commit().committer?.name),
  );
  readonly date = computed(() => formatShortDate(this.commit().committedAt));

  readonly laneX = computed(() => this.lane().index * LANE_COLUMN_WIDTH + LANE_COLUMN_WIDTH / 2);
  readonly graphWidth = computed(
    () => (Math.max(this.maxLane(), this.lane().index) + 1) * LANE_COLUMN_WIDTH,
  );
  readonly color = computed(() => laneColor(this.lane().color));

  refClass(kind: string): string {
    return `st-graph-row__ref st-graph-row__ref--${normalizeRefKind(kind)}`;
  }
}
