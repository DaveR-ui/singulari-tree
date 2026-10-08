import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { ModalComponent } from '@shared/ui/modal/modal';
import type { AppError } from '@core/services/ipc-bridge.service';

/**
 * Dumb rename dialog (ADR-028) for a branch ref.
 *
 * The parent supplies the current name, the busy flag and an optional error,
 * and reacts to `submitted` with the new name. Reuses the shared `st-modal`
 * shell; Escape/backdrop map to `cancelled`.
 */
@Component({
  selector: 'st-ref-rename-dialog',
  standalone: true,
  imports: [ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <st-modal
      [open]="open()"
      title="Rename branch"
      [closeOnBackdrop]="!running()"
      (closed)="cancel()"
    >
      <p class="st-ref-dialog__current" data-testid="ref-rename-current">
        {{ currentName() }}
      </p>
      <label class="st-ref-dialog__field">
        <span i18n>New name</span>
        <input
          type="text"
          data-testid="ref-rename-input"
          [value]="newName()"
          (input)="onName($event)"
          (keydown.enter)="submit()"
        />
      </label>

      @if (error(); as err) {
        <p class="st-ref-dialog__error" data-testid="ref-rename-error">{{ err.message }}</p>
      }

      <button
        st-modal-footer
        type="button"
        data-testid="ref-rename-cancel"
        [disabled]="running()"
        (click)="cancel()"
      >
        Cancel
      </button>
      <button
        st-modal-footer
        type="button"
        class="st-ref-dialog__primary"
        data-testid="ref-rename-submit"
        [disabled]="!canSubmit() || running()"
        (click)="submit()"
      >
        Rename
      </button>
    </st-modal>
  `,
  styles: `
    :host {
      display: contents;
    }

    .st-ref-dialog__current {
      margin: 0 0 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      opacity: 0.75;
      word-break: break-all;
    }

    .st-ref-dialog__field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
    }

    .st-ref-dialog__field input {
      padding: 6px 8px;
      border-radius: 5px;
      border: 1px solid var(--st-color-border, #2f2f44);
      background: var(--st-color-surface, #252536);
      color: inherit;
      font: inherit;
    }

    .st-ref-dialog__error {
      margin: 12px 0 0;
      color: #ff8a80;
      font-size: 12px;
    }

    .st-ref-dialog__primary {
      background: rgba(90, 140, 255, 0.2);
      border-color: rgba(90, 140, 255, 0.6);
      color: #9db8ff;
    }

    .st-ref-dialog__primary:disabled {
      opacity: 0.5;
    }
  `,
})
export class RefRenameDialog {
  readonly open = input(false);
  readonly currentName = input('');
  readonly running = input(false);
  readonly error = input<AppError | null>(null);

  readonly submitted = output<string>();
  readonly cancelled = output<void>();

  readonly newName = signal('');

  readonly canSubmit = () =>
    this.newName().trim().length > 0 && this.newName().trim() !== this.currentName();

  constructor() {
    // Seed the input with the current name on every open so a previous edit
    // never carries over.
    effect(() => {
      if (this.open()) {
        this.newName.set(this.currentName());
      }
    });
  }

  onName(event: Event): void {
    this.newName.set((event.target as HTMLInputElement).value);
  }

  submit(): void {
    if (!this.canSubmit() || this.running()) return;
    this.submitted.emit(this.newName().trim());
  }

  cancel(): void {
    this.cancelled.emit();
  }
}
