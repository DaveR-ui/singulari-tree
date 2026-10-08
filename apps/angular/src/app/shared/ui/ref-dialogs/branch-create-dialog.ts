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
import type { BranchCreateValue } from './ref-dialog.models';

/**
 * Dumb create-branch dialog (ADR-028).
 *
 * It owns no domain state: the parent supplies the default start point (the
 * current branch/HEAD from the sidebar, or the clicked commit oid from the graph
 * menu), an optional error and the busy flag, and reacts to `submitted`.
 * Reuses the shared `st-modal` shell; Escape/backdrop map to `cancelled`.
 * The renderer never talks to Git — the owning container calls `IpcBridge`.
 */
@Component({
  selector: 'st-branch-create-dialog',
  standalone: true,
  imports: [ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <st-modal [open]="open()" title="New branch" [closeOnBackdrop]="!running()" (closed)="cancel()">
      <label class="st-ref-dialog__field">
        <span i18n>Name</span>
        <input
          type="text"
          data-testid="branch-create-name"
          [value]="name()"
          (input)="onName($event)"
          placeholder="feature/login"
          i18n-placeholder
        />
      </label>

      <label class="st-ref-dialog__field">
        <span i18n>Start point</span>
        <input
          type="text"
          data-testid="branch-create-start"
          [value]="startPointValue()"
          (input)="onStartPoint($event)"
        />
      </label>

      <label class="st-ref-dialog__check">
        <input
          type="checkbox"
          data-testid="branch-create-checkout"
          [checked]="checkout()"
          (change)="onCheckout($event)"
        />
        <span i18n>Check out after creating</span>
      </label>

      @if (error(); as err) {
        <p class="st-ref-dialog__error" data-testid="branch-create-error">{{ err.message }}</p>
      }

      <button
        st-modal-footer
        type="button"
        data-testid="branch-create-cancel"
        [disabled]="running()"
        (click)="cancel()"
      >
        Cancel
      </button>
      <button
        st-modal-footer
        type="button"
        class="st-ref-dialog__primary"
        data-testid="branch-create-submit"
        [disabled]="!canSubmit() || running()"
        (click)="submit()"
      >
        Create branch
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

    .st-ref-dialog__field input {
      padding: 6px 8px;
      border-radius: 5px;
      border: 1px solid var(--st-color-border, #2f2f44);
      background: var(--st-color-surface, #252536);
      color: inherit;
      font: inherit;
    }

    .st-ref-dialog__check {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
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
export class BranchCreateDialog {
  readonly open = input(false);
  /** Default start point supplied by the container (current branch or an oid). */
  readonly defaultStartPoint = input('HEAD');
  readonly running = input(false);
  readonly error = input<AppError | null>(null);

  readonly submitted = output<BranchCreateValue>();
  readonly cancelled = output<void>();

  readonly name = signal('');
  readonly startPointValue = signal('HEAD');
  readonly checkout = signal(true);

  readonly canSubmit = () => this.name().trim().length > 0 && !!this.startPointValue().trim();

  constructor() {
    // Seed the form from the caller's default on every open, and re-arm the
    // checkout default, so a previous edit never carries over.
    effect(() => {
      if (this.open()) {
        const startPoint = this.defaultStartPoint();
        this.name.set('');
        this.startPointValue.set(startPoint.trim() || 'HEAD');
        this.checkout.set(true);
      }
    });
  }

  onName(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  onStartPoint(event: Event): void {
    this.startPointValue.set((event.target as HTMLInputElement).value);
  }

  onCheckout(event: Event): void {
    this.checkout.set((event.target as HTMLInputElement).checked);
  }

  submit(): void {
    if (!this.canSubmit() || this.running()) return;
    this.submitted.emit({
      name: this.name().trim(),
      startPoint: this.startPointValue().trim(),
      checkout: this.checkout(),
    });
  }

  cancel(): void {
    this.cancelled.emit();
  }
}
