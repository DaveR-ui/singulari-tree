import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { ModalComponent } from '@shared/ui/modal/modal';

/**
 * Clone dialog stub (ADR-025).
 *
 * Prefill only: the shell/renderer validate a git URL and hand it here, but
 * cloning itself is V1.4 onboarding, so the primary action is deliberately
 * inert. The renderer never contacts Git. The parent supplies the prefilled URL
 * (from a `singularitree://clone?url=…` deep link or the clipboard) and an
 * optional validation error; the dialog owns only its editable field.
 */
@Component({
  selector: 'st-clone-dialog',
  standalone: true,
  imports: [ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <st-modal [open]="open()" title="Clone repository" i18n-title (closed)="cancelled.emit()">
      <label class="st-clone-dialog__field">
        <span i18n>Repository URL</span>
        <input
          type="text"
          data-testid="clone-url"
          [value]="urlValue()"
          (input)="onUrl($event)"
          placeholder="https://example.com/me/app.git"
          i18n-placeholder
        />
      </label>

      @if (error(); as err) {
        <p class="st-clone-dialog__error" data-testid="clone-error">{{ err }}</p>
      } @else {
        <p class="st-clone-dialog__note" data-testid="clone-note" i18n>
          Cloning is not available yet. This dialog only prefills the URL.
        </p>
      }

      <button
        st-modal-footer
        type="button"
        data-testid="clone-cancel"
        (click)="cancelled.emit()"
        i18n
      >
        Cancel
      </button>
      <button
        st-modal-footer
        type="button"
        class="st-clone-dialog__primary"
        data-testid="clone-submit"
        disabled
        i18n
      >
        Clone
      </button>
    </st-modal>
  `,
  styles: `
    :host {
      display: contents;
    }

    .st-clone-dialog__field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 12px;
      font-size: 12px;
    }

    .st-clone-dialog__field input {
      padding: 6px 8px;
      border-radius: 5px;
      border: 1px solid var(--st-color-border);
      background: var(--st-color-surface);
      color: inherit;
      font: inherit;
    }

    .st-clone-dialog__note {
      margin: 12px 0 0;
      color: var(--st-color-muted);
      font-size: 12px;
    }

    .st-clone-dialog__error {
      margin: 12px 0 0;
      color: #ff8a80;
      font-size: 12px;
    }

    .st-clone-dialog__primary {
      background: rgba(90, 140, 255, 0.2);
      border-color: rgba(90, 140, 255, 0.6);
      color: #9db8ff;
    }

    .st-clone-dialog__primary:disabled {
      opacity: 0.5;
    }
  `,
})
export class CloneDialog {
  readonly open = input(false);
  /** Prefilled git URL supplied by the caller. */
  readonly url = input('');
  /** Optional validation message (e.g. clipboard did not contain a git URL). */
  readonly error = input<string | null>(null);

  readonly cancelled = output<void>();

  /** Editable copy of the prefilled URL; re-seeded on every open. */
  readonly urlValue = signal('');

  constructor() {
    effect(() => {
      if (this.open()) this.urlValue.set(this.url());
    });
  }

  onUrl(event: Event): void {
    this.urlValue.set((event.target as HTMLInputElement).value);
  }
}
