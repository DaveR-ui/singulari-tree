import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { MergeResponse } from '@contracts/gitcore';

/**
 * Dumb notice shown when a merge produced conflicts (ADR-028).
 *
 * M3 surfaces conflicts instead of resolving them: the banner tells the user the
 * tree is conflicted and that resolved files must be committed. The parent owns
 * the conflict state and the dismiss side effect; this component only renders.
 */
@Component({
  selector: 'st-merge-conflict-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (conflict()?.hasConflict) {
      <div class="st-merge-conflict" role="alert" data-testid="merge-conflict-banner">
        <p class="st-merge-conflict__message" data-testid="merge-conflict-message" i18n>
          The merge produced conflicts. Resolve them in the working tree, then commit.
        </p>
        <button
          class="st-merge-conflict__dismiss"
          type="button"
          data-testid="merge-conflict-dismiss"
          title="Dismiss"
          i18n-title
          (click)="dismiss.emit()"
        >
          ✕
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .st-merge-conflict {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 8px 12px;
      background: rgba(255, 197, 66, 0.12);
      border-bottom: 1px solid rgba(255, 197, 66, 0.45);
      color: #ffcf6b;
      font-size: 12.5px;
    }

    .st-merge-conflict__message {
      flex: 1;
      min-width: 0;
      margin: 0;
      font-weight: 600;
    }

    .st-merge-conflict__dismiss {
      flex: none;
      background: transparent;
      border: 1px solid rgba(255, 197, 66, 0.45);
      color: #ffcf6b;
      border-radius: 4px;
      cursor: pointer;
      padding: 1px 6px;
      line-height: 1.4;
    }

    .st-merge-conflict__dismiss:hover {
      background: rgba(255, 197, 66, 0.18);
    }
  `,
})
export class MergeConflictBanner {
  readonly conflict = input<MergeResponse | null>(null);
  readonly dismiss = output<void>();
}
