import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { AppError } from '@core/services/ipc-bridge.service';
import { ModalComponent } from '@shared/ui/modal/modal';
import {
  DEFERRED,
  type FetchIntent,
  type RemoteOpProgress,
  type RemoteOption,
} from '../../remote-models';

/**
 * Dumb Fetch dialog. Collects a {@link FetchIntent} (all remotes or one) and
 * surfaces the running/progress/error state supplied by the shell. Options that
 * need a proto contract field the renderer cannot add yet are rendered disabled
 * with the centralized `DEFERRED` tooltip/badge; the dialog never pretends they
 * apply (`prune` is always emitted as `false`).
 */
@Component({
  selector: 'st-fetch-dialog',
  standalone: true,
  imports: [ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <st-modal [open]="open()" title="Fetch" (closed)="closed.emit()">
      <div class="st-fetch" data-testid="fetch-dialog">
        @if (loading()) {
          <div class="st-fetch__banner" data-testid="fetch-loading">Loading remotes…</div>
        }

        <label class="st-fetch__option">
          <input
            type="checkbox"
            data-testid="fetch-all-remotes"
            [checked]="allRemotes()"
            (change)="onAllRemotesChange($event)"
          />
          <span class="st-fetch__label">Fetch from all remotes</span>
        </label>

        @if (!allRemotes()) {
          <label class="st-fetch__option">
            <span class="st-fetch__label">Remote</span>
            <select
              class="st-fetch__select"
              data-testid="fetch-remote-select"
              [value]="selectedRemote()"
              (change)="onRemoteChange($event)"
            >
              @for (remote of remotes(); track remote.name) {
                <option [value]="remote.name" [selected]="remote.name === selectedRemote()">
                  {{ remote.name }}
                </option>
              }
            </select>
          </label>
        }

        <label class="st-fetch__option st-fetch__option--deferred">
          <input
            type="checkbox"
            data-testid="fetch-prune"
            disabled
            aria-disabled="true"
            [title]="DEFERRED['fetch.prune'].reason"
          />
          <span class="st-fetch__label">
            Prune tracking branches no longer present on remote(s)
          </span>
          <span class="st-deferred-badge" data-testid="fetch-prune-deferred">Deferred</span>
        </label>

        <label class="st-fetch__option st-fetch__option--deferred">
          <input
            type="checkbox"
            data-testid="fetch-option-tags"
            disabled
            aria-disabled="true"
            [title]="DEFERRED['fetch.tags'].reason"
          />
          <span class="st-fetch__label">Fetch all tags</span>
          <span class="st-deferred-badge" data-testid="fetch-option-tags-deferred">Deferred</span>
        </label>

        <label class="st-fetch__option st-fetch__option--deferred">
          <input
            type="checkbox"
            data-testid="fetch-option-overwrite-tags"
            disabled
            aria-disabled="true"
            [title]="DEFERRED['fetch.overwriteTags'].reason"
          />
          <span class="st-fetch__label">Overwrite Local Tags (--force)</span>
          <span class="st-deferred-badge" data-testid="fetch-option-overwrite-tags-deferred">
            Deferred
          </span>
        </label>

        @if (progress(); as p) {
          <div class="st-fetch__progress" data-testid="fetch-progress">
            {{ p.percent }}% — {{ p.message }}
          </div>
        }

        @if (error(); as err) {
          <div class="st-fetch__banner st-fetch__banner--error" data-testid="fetch-error">
            {{ err.message }}
          </div>
        }

        @if (offline()) {
          <div class="st-fetch__banner st-fetch__banner--offline" data-testid="fetch-offline">
            Git core offline — run inside the desktop app.
          </div>
        }
      </div>

      <button
        st-modal-footer
        class="st-btn"
        type="button"
        data-testid="fetch-cancel"
        (click)="closed.emit()"
      >
        Cancel
      </button>
      <button
        st-modal-footer
        class="st-btn st-btn--primary"
        type="button"
        data-testid="fetch-submit"
        [disabled]="submitDisabled()"
        (click)="submit()"
      >
        OK
      </button>
    </st-modal>
  `,
  styles: `
    :host {
      display: contents;
    }

    .st-fetch {
      display: flex;
      flex-direction: column;
      gap: 10px;
      color: var(--st-color-text, #d6d6de);
      font-size: 13px;
    }

    .st-fetch__option {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }

    .st-fetch__option--deferred {
      cursor: not-allowed;
      opacity: 0.7;
    }

    .st-fetch__option input[type='checkbox'] {
      accent-color: var(--st-color-accent, #0a84ff);
      margin: 0;
    }

    .st-fetch__label {
      flex: 1;
    }

    .st-fetch__select {
      background: var(--st-color-bg, #1e1e2e);
      border: 1px solid var(--st-color-border, #2f2f44);
      color: var(--st-color-text, #d6d6de);
      border-radius: 6px;
      padding: 5px 8px;
      font-size: 12px;
      outline: none;
    }

    .st-fetch__select:focus {
      border-color: var(--st-color-accent, #0a84ff);
    }

    .st-deferred-badge {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--st-color-border, #2f2f44);
      color: var(--muted, #8a8a9a);
      border-radius: 999px;
      padding: 1px 7px;
      font-size: 10px;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .st-fetch__progress {
      color: var(--muted, #8a8a9a);
      font-size: 12px;
    }

    .st-fetch__banner {
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 12px;
    }

    .st-fetch__banner--error {
      background: rgba(255, 69, 58, 0.12);
      border: 1px solid rgba(255, 69, 58, 0.45);
      color: #ff8a80;
    }

    .st-fetch__banner--offline {
      background: rgba(255, 214, 10, 0.1);
      border: 1px solid rgba(255, 214, 10, 0.4);
      color: #ffd60a;
    }

    .st-btn {
      background: transparent;
      border: 1px solid var(--st-color-border, #2f2f44);
      color: var(--st-color-text, #d6d6de);
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 13px;
      cursor: pointer;
    }

    .st-btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.07);
    }

    .st-btn--primary {
      background: var(--st-color-accent, #0a84ff);
      border-color: var(--st-color-accent, #0a84ff);
      color: #fff;
    }

    .st-btn--primary:hover:not(:disabled) {
      background: #3a9bff;
    }

    .st-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,
})
export class FetchDialog {
  /** Exposed to the template for the disabled-option tooltips. */
  readonly DEFERRED = DEFERRED;

  readonly open = input(false);
  readonly remotes = input<RemoteOption[]>([]);
  readonly loading = input(false);
  readonly running = input(false);
  readonly progress = input<RemoteOpProgress | null>(null);
  readonly error = input<AppError | null>(null);
  readonly offline = input(false);

  readonly closed = output<void>();
  readonly submitted = output<FetchIntent>();

  /** Fetch every remote (default) vs. a single selected one. */
  readonly allRemotes = signal(true);
  /** Name of the selected remote; falls back to `origin`, then the first. */
  readonly selectedRemote = signal('');

  readonly submitDisabled = computed(
    () => this.running() || this.offline() || (!this.allRemotes() && !this.selectedRemote()),
  );

  constructor() {
    // Re-initialise the local presentation state every time the dialog opens.
    effect(() => {
      if (!this.open()) return;
      untracked(() => this.resetLocalState());
    });
  }

  private resetLocalState(): void {
    this.allRemotes.set(true);
    const preferred = this.remotes().find((remote) => remote.name === 'origin');
    this.selectedRemote.set(preferred?.name ?? this.remotes()[0]?.name ?? '');
  }

  onAllRemotesChange(event: Event): void {
    this.allRemotes.set((event.target as HTMLInputElement).checked);
  }

  onRemoteChange(event: Event): void {
    this.selectedRemote.set((event.target as HTMLSelectElement).value);
  }

  submit(): void {
    if (this.submitDisabled()) return;
    this.submitted.emit({
      allRemotes: this.allRemotes(),
      remote: this.selectedRemote(),
      prune: false,
    });
  }
}
