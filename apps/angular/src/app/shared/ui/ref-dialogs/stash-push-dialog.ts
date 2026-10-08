import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { ModalComponent } from '@shared/ui/modal/modal';
import type { AppError } from '@core/services/ipc-bridge.service';

/**
 * Dumb stash-push dialog (ADR-028).
 *
 * Collects an optional message for `stashPush`; the parent owns the store call
 * and the busy/error state. An empty message lets the core pick a default.
 * Reuses the shared `st-modal` shell; Escape/backdrop map to `cancelled`.
 */
@Component({
  selector: 'st-stash-push-dialog',
  standalone: true,
  imports: [ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <st-modal
      [open]="open()"
      title="Stash current changes"
      i18n-title
      [closeOnBackdrop]="!running()"
      (closed)="cancel()"
    >
      <label class="st-stash-dialog__field">
        <span i18n>Message (optional)</span>
        <input
          type="text"
          data-testid="stash-push-message"
          [value]="message()"
          (input)="onMessage($event)"
        />
      </label>

      @if (error(); as err) {
        <p class="st-stash-dialog__error" data-testid="stash-push-error">{{ err.message }}</p>
      }

      <button
        st-modal-footer
        type="button"
        data-testid="stash-push-cancel"
        [disabled]="running()"
        (click)="cancel()"
      >
        <span i18n>Cancel</span>
      </button>
      <button
        st-modal-footer
        type="button"
        class="st-stash-dialog__primary"
        data-testid="stash-push-submit"
        [disabled]="running()"
        (click)="submit()"
      >
        <span i18n>Stash</span>
      </button>
    </st-modal>
  `,
  styles: `
    :host {
      display: contents;
    }

    .st-stash-dialog__field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 12px;
      font-size: 12px;
    }

    .st-stash-dialog__field input {
      padding: 6px 8px;
      border-radius: 5px;
      border: 1px solid var(--st-color-border, #2f2f44);
      background: var(--st-color-surface, #252536);
      color: inherit;
      font: inherit;
    }

    .st-stash-dialog__error {
      margin: 0 0 10px;
      color: #ff8a80;
      font-size: 12px;
    }

    .st-stash-dialog__primary {
      background: rgba(90, 140, 255, 0.2);
      border-color: rgba(90, 140, 255, 0.6);
      color: #9db8ff;
    }

    .st-stash-dialog__primary:disabled {
      opacity: 0.5;
    }
  `,
})
export class StashPushDialog {
  readonly open = input(false);
  readonly running = input(false);
  readonly error = input<AppError | null>(null);

  readonly submitted = output<string>();
  readonly cancelled = output<void>();

  readonly message = signal('');

  constructor() {
    // Clear the field on every open so a previous message never carries over.
    effect(() => {
      if (this.open()) this.message.set('');
    });
  }

  onMessage(event: Event): void {
    this.message.set((event.target as HTMLInputElement).value);
  }

  submit(): void {
    if (this.running()) return;
    this.submitted.emit(this.message().trim());
  }

  cancel(): void {
    this.cancelled.emit();
  }
}
