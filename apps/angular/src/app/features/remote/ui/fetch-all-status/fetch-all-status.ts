import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { AppError } from '@core/services/ipc-bridge.service';
import type { FetchAllProgress, RepoFetchEntry, RepoFetchState } from '../../remote-models';

/**
 * Dumb status panel for the renderer-orchestrated "fetch all" fan-out (ADR-024).
 *
 * Shows one row per repository (pending / done / failed) plus an aggregate
 * `done/total` counter, so a single failing repository is visible without
 * aborting the others. The parent owns the store state and the dismiss intent.
 */
@Component({
  selector: 'st-fetch-all-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <section class="st-fetch-all" data-testid="fetch-all-status">
        <header class="st-fetch-all__head">
          <span class="st-fetch-all__title" i18n>Fetching repositories</span>
          @if (progress(); as p) {
            <span class="st-fetch-all__count" data-testid="fetch-all-count">
              {{ p.done }}/{{ p.total }}
            </span>
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
        </header>

        <ul class="st-fetch-all__list">
          @for (repo of repos(); track repo.repoId) {
            <li class="st-fetch-all__row" data-testid="fetch-all-row">
              <span
                class="st-fetch-all__icon"
                [class.st-fetch-all__icon--success]="stateOf(repo.repoId) === 'success'"
                [class.st-fetch-all__icon--failed]="stateOf(repo.repoId) === 'failed'"
                aria-hidden="true"
                >{{ iconOf(repo.repoId) }}</span
              >
              <span class="st-fetch-all__name">{{ repo.name }}</span>
              <span class="st-fetch-all__state">{{ labelOf(repo.repoId) }}</span>
            </li>
          }
        </ul>

        @if (error(); as err) {
          <p class="st-fetch-all__error" data-testid="fetch-all-error">{{ err.message }}</p>
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .st-fetch-all {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0;
      padding: 6px 12px;
      border-bottom: 1px solid var(--st-color-border, #2f2f44);
      background: var(--st-color-surface, #252536);
      color: var(--st-color-text, #d6d6de);
      font-size: 12px;
    }

    .st-fetch-all__head {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .st-fetch-all__title {
      font-weight: 600;
    }

    .st-fetch-all__count {
      opacity: 0.7;
      font-variant-numeric: tabular-nums;
    }

    .st-fetch-all__dismiss {
      margin-left: auto;
      padding: 1px 8px;
      border: 1px solid var(--st-color-border, #2f2f44);
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 11px;
      cursor: pointer;
    }

    .st-fetch-all__list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
    }

    .st-fetch-all__row {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .st-fetch-all__icon {
      width: 12px;
      text-align: center;
      opacity: 0.7;
    }

    .st-fetch-all__icon--success {
      color: #4caf50;
      opacity: 1;
    }

    .st-fetch-all__icon--failed {
      color: #ff6b6b;
      opacity: 1;
    }

    .st-fetch-all__name {
      font-weight: 500;
    }

    .st-fetch-all__state {
      opacity: 0.6;
    }

    .st-fetch-all__error {
      margin: 0;
      color: #ff6b6b;
    }
  `,
})
export class FetchAllStatus {
  /** Whether the panel is visible (running or showing a finished fan-out). */
  readonly open = input(false);
  /** Aggregate progress, or null when unknown/idle. */
  readonly progress = input<FetchAllProgress | null>(null);
  /** Per-repository status keyed by repo id. */
  readonly status = input<Readonly<Record<string, RepoFetchState>>>({});
  /** Repositories targeted by the fan-out, in display order. */
  readonly repos = input<readonly RepoFetchEntry[]>([]);
  /** Last fan-out failure, or null. */
  readonly error = input<AppError | null>(null);

  readonly dismissed = output<void>();

  /** Per-repo status, defaulting to pending while unknown. */
  stateOf(repoId: string): RepoFetchState {
    return this.status()[repoId] ?? 'pending';
  }

  /** Symbol for a repository's current status. */
  iconOf(repoId: string): string {
    switch (this.stateOf(repoId)) {
      case 'success':
        return '✓';
      case 'failed':
        return '✕';
      default:
        return '…';
    }
  }

  /** Localized text label for a repository's current status. */
  labelOf(repoId: string): string {
    switch (this.stateOf(repoId)) {
      case 'success':
        return $localize`Done`;
      case 'failed':
        return $localize`Failed`;
      default:
        return $localize`Pending`;
    }
  }
}
