import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { ModalComponent } from '@shared/ui/modal/modal';

/**
 * Mode of the branch-switch confirmation:
 * - `confirm`: pre-checkout confirmation shown on every branch selection; the
 *   user can switch normally or tick `force (discard changes)` and switch
 *   forcefully.
 * - `dirty`: the checkout is blocked by tracked working-tree modifications;
 *   the user can force the checkout (discarding them), stash them first, or
 *   cancel.
 * - `untracked`: a forced checkout is still blocked by untracked files; the
 *   user must accept their permanent deletion or cancel.
 */
export type SwitchBranchMode = 'confirm' | 'dirty' | 'untracked';

/**
 * Dumb confirmation dialog for the branch-switch flow.
 *
 * It owns no domain state: the parent supplies the clicked branch display name
 * and the `mode`, and reacts to the emitted actions. Reuses the shared
 * `st-modal` shell (Escape/backdrop `closed` maps to `cancel`). In `confirm`
 * mode the `force (discard changes)` checkbox is read at Switch time and its
 * value is emitted via `confirmed`; in `dirty` mode the same checkbox arms the
 * destructive Force checkout action, so a destructive checkout is always an
 * explicit choice.
 */
@Component({
  selector: 'st-switch-branch-confirm-dialog',
  standalone: true,
  imports: [ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <st-modal [open]="open()" [title]="title()" (closed)="cancel.emit()">
      <p class="st-switch__message" data-testid="switch-branch-message">
        {{ message() }}
      </p>

      @if (mode() === 'dirty') {
        <p class="st-switch__hint" data-testid="switch-branch-hint">
          <strong>Force checkout</strong> discards ALL uncommitted tracked changes.
          <strong>Save changes</strong> stashes them so you can restore them later.
        </p>
        <label class="st-switch__check">
          <input
            type="checkbox"
            data-testid="switch-branch-force-checkbox"
            [checked]="forceArmed()"
            (change)="onForceArmedChange($event)"
          />
          force (discard changes)
        </label>
      } @else if (mode() === 'confirm') {
        <label class="st-switch__check">
          <input
            type="checkbox"
            data-testid="switch-branch-force-checkbox"
            [checked]="forceArmed()"
            (change)="onForceArmedChange($event)"
          />
          force (discard changes)
        </label>
      } @else {
        <p class="st-switch__warning" data-testid="switch-branch-warning">
          All untracked files and folders will be permanently deleted. Ignored files
          are kept.
        </p>
      }

      <div class="st-switch__footer" st-modal-footer>
        <button
          type="button"
          class="st-switch__btn"
          data-testid="switch-branch-cancel"
          (click)="cancel.emit()"
        >
          Cancel
        </button>
        @if (mode() === 'dirty') {
          <button
            type="button"
            class="st-switch__btn"
            data-testid="switch-branch-save"
            (click)="saveChanges.emit()"
          >
            Save changes (stash)
          </button>
          <button
            type="button"
            class="st-switch__btn st-switch__btn--danger"
            data-testid="switch-branch-force"
            [disabled]="!forceArmed()"
            (click)="forceCheckout.emit()"
          >
            Force checkout
          </button>
        } @else if (mode() === 'confirm') {
          <button
            type="button"
            class="st-switch__btn st-switch__btn--primary"
            data-testid="switch-branch-confirm"
            (click)="confirmed.emit(forceArmed())"
          >
            Switch
          </button>
        } @else {
          <button
            type="button"
            class="st-switch__btn st-switch__btn--danger"
            data-testid="switch-branch-force"
            (click)="forceCheckout.emit()"
          >
            Delete untracked files and checkout
          </button>
        }
      </div>
    </st-modal>
  `,
  styles: `
    :host {
      display: contents;
    }

    .st-switch__message {
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
      color: var(--st-color-text, #d6d6de);
    }

    .st-switch__hint,
    .st-switch__warning {
      margin: 10px 0 0;
      font-size: 12px;
      line-height: 1.5;
      opacity: 0.8;
    }

    .st-switch__warning {
      color: #ff8a80;
      opacity: 1;
    }

    .st-switch__check {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 12px;
      font-size: 12px;
    }

    .st-switch__footer {
      display: flex;
      gap: 8px;
    }

    .st-switch__btn {
      padding: 6px 14px;
      border-radius: 6px;
      border: 1px solid var(--st-color-border, #2f2f44);
      background: transparent;
      color: var(--st-color-text, #d6d6de);
      font-size: 12px;
      cursor: pointer;
    }

    .st-switch__btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.07);
    }

    .st-switch__btn:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .st-switch__btn--danger {
      background: rgba(255, 69, 58, 0.16);
      border-color: rgba(255, 69, 58, 0.55);
      color: #ff8a80;
    }

    .st-switch__btn--danger:hover:not(:disabled) {
      background: rgba(255, 69, 58, 0.26);
    }

    .st-switch__btn--primary {
      background: rgba(90, 140, 255, 0.2);
      border-color: rgba(90, 140, 255, 0.6);
      color: #9db8ff;
    }

    .st-switch__btn--primary:hover:not(:disabled) {
      background: rgba(90, 140, 255, 0.3);
    }
  `,
})
export class SwitchBranchConfirmDialog {
  readonly open = input(false);
  /** Display name of the branch the user is switching to. */
  readonly branchName = input('');
  readonly mode = input<SwitchBranchMode>('dirty');

  /** Force the checkout, discarding tracked changes (or untracked files too). */
  readonly forceCheckout = output<void>();
  /** Stash the working-tree changes first, then retry the checkout. */
  readonly saveChanges = output<void>();
  /** Dismiss the dialog without changing state. */
  readonly cancel = output<void>();
  /** `confirm` mode: switch the branch, carrying the force checkbox value. */
  readonly confirmed = output<boolean>();

  /** True once the user ticked `force (discard changes)`. */
  readonly forceArmed = signal(false);

  /** Exact confirmation copy; the untracked mode swaps in the deletion warning. */
  readonly message = computed(() => {
    const name = this.branchName();
    if (this.mode() === 'untracked') {
      return `Switching your working copy to a branch '${name}' will permanently delete untracked files.`;
    }
    return `Are you sure you want to switch your working copy to a branch '${name}'?`;
  });

  readonly title = computed(() =>
    this.mode() === 'untracked' ? 'Switch branch — untracked files' : 'Switch branch',
  );

  constructor() {
    // Re-arm the destructive action from a clean state on every open / mode
    // change, so a previous confirmation never carries over.
    effect(() => {
      if (this.open()) {
        this.mode();
        this.forceArmed.set(false);
      }
    });
  }

  onForceArmedChange(event: Event): void {
    this.forceArmed.set((event.target as HTMLInputElement).checked);
  }
}
