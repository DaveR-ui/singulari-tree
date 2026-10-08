import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ModalComponent } from '@shared/ui/modal/modal';
import type { AppError } from '@core/services/ipc-bridge.service';

/** Which ref kind is being deleted; only affects the copy. */
export type RefDeleteKind = 'branch' | 'tag';

/**
 * Dumb destructive-confirmation gate for deleting a branch or a tag (ADR-028).
 *
 * Branches additionally offer the `force` flag (`git branch -D`), which the
 * parent can hide for tags. Reuses the shared `st-modal` shell; Escape/backdrop
 * map to `cancelled`. Core stays headless and does exactly what it is told, so
 * the renderer confirms first.
 */
@Component({
  selector: 'st-ref-delete-confirm-dialog',
  standalone: true,
  imports: [ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <st-modal [open]="open()" [title]="title()" [closeOnBackdrop]="!running()" (closed)="cancel()">
      <p class="st-ref-dialog__warning" data-testid="ref-delete-warning">
        Delete {{ kind() }} <strong>{{ name() }}</strong>? This cannot be undone from the UI.
      </p>

      @if (showForce()) {
        <label class="st-ref-dialog__check">
          <input
            type="checkbox"
            data-testid="ref-delete-force"
            [checked]="force()"
            (change)="onForce($event)"
          />
          <span i18n>Force (delete even if unmerged)</span>
        </label>
      }

      @if (error(); as err) {
        <p class="st-ref-dialog__error" data-testid="ref-delete-error">{{ err.message }}</p>
      }

      <button
        st-modal-footer
        type="button"
        data-testid="ref-delete-cancel"
        [disabled]="running()"
        (click)="cancel()"
      >
        Cancel
      </button>
      <button
        st-modal-footer
        type="button"
        class="st-ref-dialog__danger"
        data-testid="ref-delete-confirm"
        [disabled]="running()"
        (click)="confirm()"
      >
        Delete
      </button>
    </st-modal>
  `,
  styles: `
    :host {
      display: contents;
    }

    .st-ref-dialog__warning {
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
    }

    .st-ref-dialog__check {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 12px;
      font-size: 12px;
    }

    .st-ref-dialog__error {
      margin: 12px 0 0;
      color: #ff8a80;
      font-size: 12px;
    }

    .st-ref-dialog__danger {
      background: #ff453a;
      border-color: #ff453a;
      color: #fff;
    }

    .st-ref-dialog__danger:disabled {
      opacity: 0.5;
    }
  `,
})
export class RefDeleteConfirmDialog {
  readonly open = input(false);
  readonly kind = input<RefDeleteKind>('branch');
  readonly name = input('');
  readonly showForce = input(true);
  readonly running = input(false);
  readonly error = input<AppError | null>(null);

  readonly confirmed = output<boolean>();
  readonly cancelled = output<void>();

  readonly force = signal(false);

  readonly title = computed(() => (this.kind() === 'tag' ? 'Delete tag' : 'Delete branch'));

  onForce(event: Event): void {
    this.force.set((event.target as HTMLInputElement).checked);
  }

  confirm(): void {
    if (this.running()) return;
    this.confirmed.emit(this.force());
  }

  cancel(): void {
    this.cancelled.emit();
  }
}
