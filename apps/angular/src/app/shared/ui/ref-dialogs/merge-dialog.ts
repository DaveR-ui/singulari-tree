import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import type { MergeResponse } from '@contracts/gitcore';
import { ModalComponent } from '@shared/ui/modal/modal';
import type { AppError } from '@core/services/ipc-bridge.service';
import {
  MERGE_STRATEGIES,
  type MergeStrategyName,
  type MergeValue,
} from './ref-dialog.models';

/**
 * Dumb merge dialog (ADR-028).
 *
 * The parent supplies the mergeable refs (local branches), the current branch,
 * the busy flag, an optional error and a conflict result, and reacts to
 * `submitted`. M3 surfaces conflicts instead of resolving them: when a merge
 * produces `hasConflict`, the container shows the conflict notice and refreshes
 * the working tree (no 3-way editor in M3). Reuses the shared `st-modal` shell.
 */
@Component({
  selector: 'st-merge-dialog',
  standalone: true,
  imports: [ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <st-modal [open]="open()" title="Merge into current" [closeOnBackdrop]="!running()" (closed)="cancel()">
      @if (currentBranch()) {
        <p class="st-ref-dialog__current" data-testid="merge-current">
          <span i18n>Current branch</span>: <strong>{{ currentBranch() }}</strong>
        </p>
      }

      <label class="st-ref-dialog__field">
        <span i18n>Branch to merge</span>
        <select data-testid="merge-ref" [value]="ref()" (change)="onRef($event)">
          @if (available().length === 0) {
            <option value="" i18n>No other branch</option>
          }
          @for (branch of available(); track branch) {
            <option [value]="branch">{{ branch }}</option>
          }
        </select>
      </label>

      <label class="st-ref-dialog__field">
        <span i18n>Strategy</span>
        <select data-testid="merge-strategy" [value]="strategy()" (change)="onStrategy($event)">
          @for (option of STRATEGIES; track option) {
            <option [value]="option">{{ option }}</option>
          }
        </select>
      </label>

      <label class="st-ref-dialog__check">
        <input
          type="checkbox"
          data-testid="merge-nocommit"
          [checked]="noCommit()"
          (change)="onNoCommit($event)"
        />
        <span i18n>Do not commit (leave staged)</span>
      </label>

      <label class="st-ref-dialog__field">
        <span i18n>Message (optional)</span>
        <input
          type="text"
          data-testid="merge-message"
          [value]="message()"
          (input)="onMessage($event)"
        />
      </label>

      @if (conflict()?.hasConflict) {
        <p class="st-ref-dialog__conflict" data-testid="merge-conflict" i18n>
          The merge produced conflicts. Resolve them in the working tree.
        </p>
      }

      @if (error(); as err) {
        <p class="st-ref-dialog__error" data-testid="merge-error">{{ err.message }}</p>
      }

      <button
        st-modal-footer
        type="button"
        data-testid="merge-cancel"
        [disabled]="running()"
        (click)="cancel()"
      >
        Cancel
      </button>
      <button
        st-modal-footer
        type="button"
        class="st-ref-dialog__primary"
        data-testid="merge-submit"
        [disabled]="!ref() || running()"
        (click)="submit()"
      >
        Merge
      </button>
    </st-modal>
  `,
  styles: `
    :host {
      display: contents;
    }

    .st-ref-dialog__current {
      margin: 0 0 10px;
      font-size: 12px;
      opacity: 0.8;
    }

    .st-ref-dialog__field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 12px;
      font-size: 12px;
    }

    .st-ref-dialog__field input,
    .st-ref-dialog__field select {
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
      margin-bottom: 12px;
      font-size: 12px;
    }

    .st-ref-dialog__conflict {
      margin: 0 0 10px;
      color: #ffcf6b;
      font-size: 12px;
    }

    .st-ref-dialog__error {
      margin: 0 0 10px;
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
export class MergeDialog {
  readonly open = input(false);
  /** Selectable refs (local branch names) — the current branch should be excluded. */
  readonly branches = input<readonly string[]>([]);
  readonly currentBranch = input('');
  /** Ref preselected when the dialog opens (the row the menu was opened on). */
  readonly defaultRef = input('');
  readonly running = input(false);
  readonly error = input<AppError | null>(null);
  readonly conflict = input<MergeResponse | null>(null);

  readonly submitted = output<MergeValue>();
  readonly cancelled = output<void>();

  readonly STRATEGIES = MERGE_STRATEGIES;

  readonly ref = signal('');
  readonly strategy = signal<MergeStrategyName>('MERGE');
  readonly noCommit = signal(false);
  readonly message = signal('');

  /** Refs offered for selection: every branch except the current one. */
  readonly available = computed(() =>
    this.branches().filter((branch) => branch !== this.currentBranch()),
  );

  constructor() {
    // Re-seed the form on every open: prefer the requested ref, else the first
    // mergeable one.
    effect(() => {
      if (this.open()) {
        const options = this.available();
        const preferred = this.defaultRef();
        this.ref.set(options.includes(preferred) ? preferred : (options[0] ?? ''));
        this.strategy.set('MERGE');
        this.noCommit.set(false);
        this.message.set('');
      }
    });
  }

  onRef(event: Event): void {
    this.ref.set((event.target as HTMLSelectElement).value);
  }

  onStrategy(event: Event): void {
    this.strategy.set((event.target as HTMLSelectElement).value as MergeStrategyName);
  }

  onNoCommit(event: Event): void {
    this.noCommit.set((event.target as HTMLInputElement).checked);
  }

  onMessage(event: Event): void {
    this.message.set((event.target as HTMLInputElement).value);
  }

  submit(): void {
    if (!this.ref() || this.running()) return;
    this.submitted.emit({
      ref: this.ref(),
      strategy: this.strategy(),
      noCommit: this.noCommit(),
      message: this.message().trim(),
    });
  }

  cancel(): void {
    this.cancelled.emit();
  }
}
