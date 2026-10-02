import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type BadgeVariant = 'neutral' | 'branch' | 'tag' | 'success' | 'warning';

/**
 * Dumb pill badge for branch/tag/status labels. Renders projected text only.
 */
@Component({
  selector: 'st-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="st-badge st-badge--{{ variant() }}" data-testid="badge"><ng-content /></span>
  `,
  styles: `
    :host {
      display: inline-block;
    }

    .st-badge {
      display: inline-flex;
      align-items: center;
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 10px;
      line-height: 14px;
      white-space: nowrap;
    }

    .st-badge--neutral {
      background: var(--st-color-surface, #252536);
      color: var(--st-color-text, #d6d6de);
      border: 1px solid var(--st-color-border, #2f2f44);
    }

    .st-badge--branch {
      background: #1a3a5a;
      color: #7ec8ff;
    }

    .st-badge--tag {
      background: #3a2a1a;
      color: #ffb86a;
    }

    .st-badge--success {
      background: #163a24;
      color: #4ade80;
    }

    .st-badge--warning {
      background: #3a321a;
      color: #ffd60a;
    }
  `,
})
export class BadgeComponent {
  readonly variant = input<BadgeVariant>('neutral');
}
