import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { AppError } from '@core/services/ipc-bridge.service';
import type { FetchAllProgress, RepoFetchState } from '../../remote-models';

/**
 * Dumb status line for the renderer-orchestrated "fetch all" fan-out (ADR-024).
 *
 * Compacted in P2 to a single line that renders inside the shell status-bar
 * live region next to the 31px bar: `Fetching repositories {done}/{total}`, a
 * failed count, the last error and a dismiss control. The parent owns the store
 * state and the dismiss intent; no per-repository rows remain.
 */
@Component({
  selector: 'st-fetch-all-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="st-fetch-all" data-testid="fetch-all-status">
        <span class="st-fetch-all__title" i18n>Fetching repositories</span>
        @if (progress(); as p) {
          <span class="st-fetch-all__count st-tabular-nums" data-testid="fetch-all-count">
            {{ p.done }}/{{ p.total }}
          </span>
        }
        @if (failedCount() > 0) {
          <span class="st-fetch-all__failed st-tabular-nums" data-testid="fetch-all-failed">
            <span class="st-fetch-all__failed-icon" aria-hidden="true">✕</span>{{ failedCount() }}
          </span>
        }
        @if (error(); as err) {
          <span class="st-fetch-all__error" data-testid="fetch-all-error">{{ err.message }}</span>
        }
        <button
          type="button"
          class="st-fetch-all__dismiss"
          data-testid="fetch-all-dismiss"
          i18n
          (click)="dismissed.emit()"
        >
          Dismiss
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .st-fetch-all {
      display: flex;
      align-items: center;
      gap: var(--st-space-2);
      min-width: 0;
      font-size: var(--st-font-12);
      color: var(--st-color-muted);
    }

    .st-fetch-all__title {
      font-weight: 600;
      color: var(--st-color-text);
      white-space: nowrap;
    }

    .st-fetch-all__count {
      color: var(--st-color-text);
    }

    .st-fetch-all__failed {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      color: var(--st-color-remove);
    }

    .st-fetch-all__failed-icon {
      font-size: var(--st-font-11);
    }

    .st-fetch-all__error {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--st-color-danger);
    }

    .st-fetch-all__dismiss {
      margin-left: var(--st-space-2);
      padding: 1px 8px;
      border: var(--st-hairline) solid var(--st-color-border);
      border-radius: var(--st-radius-2);
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: var(--st-font-11);
      cursor: pointer;
    }

    .st-fetch-all__dismiss:hover {
      color: var(--st-color-text);
    }
  `,
})
export class FetchAllStatus {
  /** Whether the line is visible (running or showing a finished fan-out). */
  readonly open = input(false);
  /** Aggregate progress, or null when unknown/idle. */
  readonly progress = input<FetchAllProgress | null>(null);
  /** Per-repository status keyed by repo id. */
  readonly status = input<Readonly<Record<string, RepoFetchState>>>({});
  /** Last fan-out failure, or null. */
  readonly error = input<AppError | null>(null);

  readonly dismissed = output<void>();

  /** Number of repositories whose last fan-out attempt failed. */
  readonly failedCount = computed<number>(
    () => Object.values(this.status()).filter((state) => state === 'failed').length,
  );
}
