import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ModalComponent } from '@shared/ui/modal/modal';
import type { AppError } from '@core/services/ipc-bridge.service';

/**
 * Dumb destructive-confirmation gate for dropping a stash entry (ADR-028).
 *
 * Dropping a stash is irreversible from the UI, so the renderer confirms first.
 * Reuses the shared `st-modal` shell; Escape/backdrop map to `cancelled`.
 */
@Component({
  selector: 'st-stash-drop-confirm-dialog',
  standalone: true,
  imports: [ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <st-modal [open]="open()" title="Drop stash" i18n-title [closeOnBackdrop]="!running()" (closed)="cancel()">
      <p class="st-stash-dialog__warning" data-testid="stash-drop-warning">
        <span i18n>Drop</span> <strong>{{ label() }}</strong>?
        <span i18n>This cannot be undone from the UI.</span>
      </p>

      @if (message()) {
        <p class="st-stash-dialog__message" data-testid="stash-drop-message">{{ message() }}</p>
      }

      @if (error(); as err) {
        <p class="st-stash-dialog__error" data-testid="stash-drop-error">{{ err.message }}</p>
      }

      <button
        st-modal-footer
        type="button"
        data-testid="stash-drop-cancel"
        [disabled]="running()"
        (click)="cancel()"
      >
        <span i18n>Cancel</span>
      </button>
      <button
        st-modal-footer
        type="button"
        class="st-stash-dialog__danger"
        data-testid="stash-drop-confirm"
        [disabled]="running()"
        (click)="confirm()"
      >
        <span i18n>Drop</span>
      </button>
    </st-modal>
  `,
  styles: `
    :host {
      display: contents;
    }

    .st-stash-dialog__warning {
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
    }

    .st-stash-dialog__message {
      margin: 10px 0 0;
      color: var(--muted, #8a8a9a);
      font-size: 12px;
    }

    .st-stash-dialog__error {
      margin: 12px 0 0;
      color: #ff8a80;
      font-size: 12px;
    }

    .st-stash-dialog__danger {
      background: #ff453a;
      border-color: #ff453a;
      color: #fff;
    }

    .st-stash-dialog__danger:disabled {
      opacity: 0.5;
    }
  `,
})
export class StashDropConfirmDialog {
  readonly open = input(false);
  readonly index = input(0);
  /** Stash message shown for context; empty hides the line. */
  readonly message = input('');
  readonly running = input(false);
  readonly error = input<AppError | null>(null);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  /** Git-style stash label, e.g. `stash@{0}` (syntax, not prose). */
  readonly label = computed(() => `stash@{${this.index()}}`);

  confirm(): void {
    if (this.running()) return;
    this.confirmed.emit();
  }

  cancel(): void {
    this.cancelled.emit();
  }
}
