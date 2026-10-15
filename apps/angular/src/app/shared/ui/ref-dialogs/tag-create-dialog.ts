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
import type { TagCreateValue } from './ref-dialog.models';

/**
 * Dumb create-tag dialog (ADR-028).
 *
 * The parent supplies the default target (HEAD, or the clicked commit oid from
 * the graph menu), the busy flag and an optional error, and reacts to
 * `submitted`. An annotated tag requires a message; the submit button stays
 * disabled until one is present. Reuses the shared `st-modal` shell.
 */
@Component({
  selector: 'st-tag-create-dialog',
  standalone: true,
  imports: [ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <st-modal [open]="open()" title="New tag" [closeOnBackdrop]="!running()" (closed)="cancel()">
      <label class="st-ref-dialog__field">
        <span i18n>Name</span>
        <input
          type="text"
          data-testid="tag-create-name"
          [value]="name()"
          (input)="onName($event)"
          placeholder="v1.0.0"
          i18n-placeholder
        />
      </label>

      <label class="st-ref-dialog__field">
        <span i18n>Target</span>
        <input
          type="text"
          data-testid="tag-create-target"
          [value]="targetValue()"
          (input)="onTarget($event)"
        />
      </label>

      <label class="st-ref-dialog__check">
        <input
          type="checkbox"
          data-testid="tag-create-annotated"
          [checked]="annotated()"
          (change)="onAnnotated($event)"
        />
        <span i18n>Annotated</span>
      </label>

      @if (annotated()) {
        <label class="st-ref-dialog__field">
          <span i18n>Message</span>
          <textarea
            rows="3"
            data-testid="tag-create-message"
            [value]="message()"
            (input)="onMessage($event)"
          ></textarea>
        </label>
      }

      <label class="st-ref-dialog__check">
        <input
          type="checkbox"
          data-testid="tag-create-force"
          [checked]="force()"
          (change)="onForce($event)"
        />
        <span i18n>Force (move an existing tag)</span>
      </label>

      @if (error(); as err) {
        <p class="st-ref-dialog__error" data-testid="tag-create-error">{{ err.message }}</p>
      }

      <button
        st-modal-footer
        type="button"
        data-testid="tag-create-cancel"
        [disabled]="running()"
        (click)="cancel()"
      >
        Cancel
      </button>
      <button
        st-modal-footer
        type="button"
        class="st-ref-dialog__primary"
        data-testid="tag-create-submit"
        [disabled]="!canSubmit() || running()"
        (click)="submit()"
      >
        Create tag
      </button>
    </st-modal>
  `,
  styles: `
    :host {
      display: contents;
    }

    .st-ref-dialog__field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 12px;
      font-size: 12px;
    }

    .st-ref-dialog__field input,
    .st-ref-dialog__field textarea {
      padding: 6px 8px;
      border-radius: 5px;
      border: 1px solid var(--st-color-border);
      background: var(--st-color-surface);
      color: inherit;
      font: inherit;
      resize: vertical;
    }

    .st-ref-dialog__check {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
      font-size: 12px;
    }

    .st-ref-dialog__error {
      margin: 8px 0 0;
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
export class TagCreateDialog {
  readonly open = input(false);
  /** Default target supplied by the container (HEAD or a clicked oid). */
  readonly defaultTarget = input('HEAD');
  readonly running = input(false);
  readonly error = input<AppError | null>(null);

  readonly submitted = output<TagCreateValue>();
  readonly cancelled = output<void>();

  readonly name = signal('');
  readonly targetValue = signal('HEAD');
  readonly annotated = signal(false);
  readonly message = signal('');
  readonly force = signal(false);

  readonly canSubmit = () => {
    if (this.name().trim().length === 0 || !this.targetValue().trim()) return false;
    return !this.annotated() || this.message().trim().length > 0;
  };

  constructor() {
    // Seed the form from the caller's default on every open.
    effect(() => {
      if (this.open()) {
        const target = this.defaultTarget();
        this.name.set('');
        this.targetValue.set(target.trim() || 'HEAD');
        this.annotated.set(false);
        this.message.set('');
        this.force.set(false);
      }
    });
  }

  onName(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  onTarget(event: Event): void {
    this.targetValue.set((event.target as HTMLInputElement).value);
  }

  onAnnotated(event: Event): void {
    this.annotated.set((event.target as HTMLInputElement).checked);
  }

  onMessage(event: Event): void {
    this.message.set((event.target as HTMLTextAreaElement).value);
  }

  onForce(event: Event): void {
    this.force.set((event.target as HTMLInputElement).checked);
  }

  submit(): void {
    if (!this.canSubmit() || this.running()) return;
    this.submitted.emit({
      name: this.name().trim(),
      target: this.targetValue().trim(),
      annotated: this.annotated(),
      message: this.message().trim(),
      force: this.force(),
    });
  }

  cancel(): void {
    this.cancelled.emit();
  }
}
