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
import type { AppError } from '@core/services/ipc-bridge.service';
import {
  DEFERRED as DEFERRED_OPTIONS,
  type PullIntent,
  type RemoteBranchOption,
  type RemoteOpProgress,
  type RemoteOption,
} from '../../remote-models';

/**
 * Build the branch-candidate list from a remote's known branches (falling back
 * to local branch names when none are known), always including the current
 * branch and de-duplicating while preserving order.
 */
function deriveBranchOptions(
  known: readonly string[],
  local: readonly string[],
  current: string,
): string[] {
  const base = known.length > 0 ? known : local;
  const result: string[] = [];
  for (const name of base) {
    if (!name || result.includes(name)) continue;
    result.push(name);
  }
  if (current && !result.includes(current)) result.push(current);
  return result;
}

/**
 * Dumb Pull dialog: collects the remote/branch pair to pull and emits a
 * {@link PullIntent}. Ref data is supplied by `RemoteOpsStore`; the component
 * only owns the transient selection and never talks to Git.
 *
 * Options that need a proto/core contract field are rendered disabled with a
 * tooltip sourced from the centralized {@link DEFERRED} table.
 */
@Component({
  selector: 'st-pull-dialog',
  standalone: true,
  imports: [ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <st-modal [open]="open()" title="Pull" (closed)="closed.emit()">
      <div class="st-pull" data-testid="pull-dialog">
        @if (loading()) {
          <p class="st-pull__note" data-testid="pull-loading">Loading…</p>
        }

        <label class="st-pull__field">
          <span class="st-pull__label">Remote</span>
          <select
            class="st-pull__control"
            data-testid="pull-remote-select"
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

        <label class="st-pull__field">
          <span class="st-pull__label">Remote URL</span>
          <input
            class="st-pull__control"
            type="text"
            data-testid="pull-remote-url"
            [value]="selectedRemoteUrl()"
            readonly
            aria-readonly="true"
          />
        </label>

        <label class="st-pull__field">
          <span class="st-pull__label">Branch</span>
          <!-- No RPC enumerates remote branches, so the options are derived from
               upstreams/local branches — the select is intentionally partial. -->
          <select
            class="st-pull__control"
            data-testid="pull-branch-select"
            [value]="selectedBranch()"
            (change)="onBranchChange($event)"
          >
            @for (branch of branchOptions(); track branch) {
              <option [value]="branch" [selected]="branch === selectedBranch()">{{ branch }}</option>
            }
          </select>
        </label>

        <div class="st-pull__field">
          <span class="st-pull__label">&nbsp;</span>
          <button
            class="st-pull__refresh"
            type="button"
            data-testid="pull-refresh"
            (click)="refreshRequested.emit()"
          >
            Refresh
          </button>
        </div>

        <label class="st-pull__field">
          <span class="st-pull__label">Local branch</span>
          <input
            class="st-pull__control"
            type="text"
            data-testid="pull-into-local"
            [value]="currentBranch()"
            disabled
            aria-disabled="true"
          />
          <span
            class="st-deferred-badge"
            data-testid="pull-into-local-deferred"
            [title]="DEFERRED['pull.intoLocal'].reason"
            >Deferred</span
          >
        </label>

        <fieldset class="st-pull__options">
          <legend>Options</legend>

          <label class="st-pull__option" [title]="DEFERRED['pull.commitMerged'].reason">
            <input
              type="checkbox"
              data-testid="pull-option-commit-merged"
              disabled
              aria-disabled="true"
              [title]="DEFERRED['pull.commitMerged'].reason"
            />
            <span>Commit merged changes immediately</span>
            <span
              class="st-deferred-badge"
              data-testid="pull-option-commit-merged-deferred"
              [title]="DEFERRED['pull.commitMerged'].reason"
              >Deferred</span
            >
          </label>

          <label class="st-pull__option" [title]="DEFERRED['pull.includeMergedMessages'].reason">
            <input
              type="checkbox"
              data-testid="pull-option-log"
              disabled
              aria-disabled="true"
              [title]="DEFERRED['pull.includeMergedMessages'].reason"
            />
            <span>Include messages from commits being merged in merge commit</span>
            <span
              class="st-deferred-badge"
              data-testid="pull-option-log-deferred"
              [title]="DEFERRED['pull.includeMergedMessages'].reason"
              >Deferred</span
            >
          </label>

          <label class="st-pull__option" [title]="DEFERRED['pull.noFF'].reason">
            <input
              type="checkbox"
              data-testid="pull-option-no-ff"
              disabled
              aria-disabled="true"
              [title]="DEFERRED['pull.noFF'].reason"
            />
            <span>Create a new commit even if fast-forward is possible</span>
            <span
              class="st-deferred-badge"
              data-testid="pull-option-no-ff-deferred"
              [title]="DEFERRED['pull.noFF'].reason"
              >Deferred</span
            >
          </label>

          <label class="st-pull__option" [title]="DEFERRED['pull.rebase'].reason">
            <input
              type="checkbox"
              data-testid="pull-option-rebase"
              disabled
              aria-disabled="true"
              [title]="DEFERRED['pull.rebase'].reason"
            />
            <span>Rebase instead of merge</span>
            <span
              class="st-deferred-badge"
              data-testid="pull-option-rebase-deferred"
              [title]="DEFERRED['pull.rebase'].reason"
              >Deferred</span
            >
          </label>
        </fieldset>

        @if (progress(); as p) {
          <p class="st-pull__progress" data-testid="pull-progress">
            {{ p.percent }}% — {{ p.message }}
          </p>
        }

        @if (error(); as err) {
          <p class="st-pull__error" data-testid="pull-error">{{ err.message }}</p>
        }

        @if (offline()) {
          <p class="st-pull__offline" data-testid="pull-offline">
            Git core offline — run inside the desktop app.
          </p>
        }
      </div>

      <button
        class="st-pull__btn"
        type="button"
        data-testid="pull-cancel"
        st-modal-footer
        (click)="closed.emit()"
      >
        Cancel
      </button>
      <button
        class="st-pull__btn st-pull__btn--primary"
        type="button"
        data-testid="pull-submit"
        st-modal-footer
        (click)="onSubmit()"
        [disabled]="running() || offline() || !selectedRemote() || !selectedBranch()"
      >
        Pull
      </button>
    </st-modal>
  `,
  styles: `
    :host {
      display: contents;
    }

    .st-pull {
      display: flex;
      flex-direction: column;
      gap: 12px;
      color: var(--st-color-text, #d6d6de);
    }

    .st-pull__field {
      display: grid;
      grid-template-columns: 110px 1fr auto;
      align-items: center;
      gap: 8px;
    }

    .st-pull__label {
      color: var(--muted, #8a8a9a);
      font-size: 12px;
    }

    .st-pull__control {
      min-width: 0;
      background: #1a1a2a;
      border: 1px solid var(--st-color-border, #2f2f44);
      color: var(--st-color-text, #d6d6de);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 12px;
      outline: none;
    }

    .st-pull__control:focus {
      border-color: var(--st-color-accent, #0a84ff);
    }

    .st-pull__control:disabled {
      color: var(--muted, #8a8a9a);
      opacity: 0.7;
      cursor: not-allowed;
    }

    .st-pull__refresh {
      background: transparent;
      border: 1px solid var(--st-color-border, #2f2f44);
      color: var(--st-color-text, #d6d6de);
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
    }

    .st-pull__refresh:hover {
      border-color: var(--st-color-accent, #0a84ff);
      color: var(--st-color-accent, #0a84ff);
    }

    .st-pull__options {
      margin: 4px 0 0;
      padding: 10px 12px;
      border: 1px solid var(--st-color-border, #2f2f44);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .st-pull__options legend {
      padding: 0 4px;
      color: var(--muted, #8a8a9a);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .st-pull__option {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      cursor: not-allowed;
    }

    .st-pull__option input:disabled {
      cursor: not-allowed;
    }

    .st-deferred-badge {
      flex-shrink: 0;
      border: 1px solid var(--st-color-border, #2f2f44);
      border-radius: 999px;
      padding: 1px 8px;
      font-size: 10px;
      color: var(--muted, #8a8a9a);
      background: rgba(255, 255, 255, 0.04);
      cursor: help;
    }

    .st-pull__note {
      margin: 0;
      color: var(--muted, #8a8a9a);
      font-size: 12px;
    }

    .st-pull__progress {
      margin: 0;
      color: var(--st-color-accent, #0a84ff);
      font-size: 12px;
    }

    .st-pull__error {
      margin: 0;
      color: #ff6b6b;
      font-size: 12px;
    }

    .st-pull__offline {
      margin: 0;
      color: var(--muted, #8a8a9a);
      font-size: 12px;
    }

    .st-pull__btn {
      background: transparent;
      border: 1px solid var(--st-color-border, #2f2f44);
      color: var(--st-color-text, #d6d6de);
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 12px;
      cursor: pointer;
    }

    .st-pull__btn:hover {
      border-color: var(--muted, #8a8a9a);
    }

    .st-pull__btn--primary {
      background: var(--st-color-accent, #0a84ff);
      border-color: var(--st-color-accent, #0a84ff);
      color: #fff;
      font-weight: 600;
    }

    .st-pull__btn--primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,
})
export class PullDialog {
  readonly open = input(false);
  readonly repoName = input('');
  readonly remotes = input<RemoteOption[]>([]);
  readonly remoteBranchesByRemote = input<Record<string, RemoteBranchOption[]>>({});
  readonly localBranchNames = input<string[]>([]);
  readonly currentBranch = input('');
  readonly loading = input(false);
  readonly running = input(false);
  readonly progress = input<RemoteOpProgress | null>(null);
  readonly error = input<AppError | null>(null);
  readonly offline = input(false);

  readonly closed = output<void>();
  readonly refreshRequested = output<void>();
  readonly submitted = output<PullIntent>();

  /** Deferred-option table exposed to the template for tooltips. */
  readonly DEFERRED = DEFERRED_OPTIONS;

  readonly selectedRemote = signal('');
  readonly selectedBranch = signal('');

  /** The selected remote's primary URL (empty when no remote matches). */
  readonly selectedRemoteUrl = computed(
    () => this.remotes().find((remote) => remote.name === this.selectedRemote())?.url ?? '',
  );

  /**
   * Branch candidates for the selected remote. Derived from the remote's known
   * branches, falling back to local branch names when none are known, and always
   * including the current branch. De-duplicated preserving order.
   */
  readonly branchOptions = computed<string[]>(() =>
    deriveBranchOptions(
      (this.remoteBranchesByRemote()[this.selectedRemote()] ?? []).map((option) => option.name),
      this.localBranchNames(),
      this.currentBranch(),
    ),
  );

  constructor() {
    // Reset the local selection each time the dialog opens or the ref data it
    // depends on changes. The branch default prefers the current branch when it
    // is among the options, else the first. Deliberately does not read
    // `selectedRemote`, so a manual remote change is not reverted.
    effect(() => {
      if (!this.open()) return;
      const remotes = this.remotes();
      const knownByRemote = this.remoteBranchesByRemote();
      const locals = this.localBranchNames();
      const current = this.currentBranch();

      const preferred = remotes.find((remote) => remote.name === 'origin') ?? remotes[0];
      const remoteName = preferred?.name ?? '';
      this.selectedRemote.set(remoteName);

      const options = deriveBranchOptions(
        (knownByRemote[remoteName] ?? []).map((option) => option.name),
        locals,
        current,
      );
      this.selectedBranch.set(current && options.includes(current) ? current : (options[0] ?? ''));
    });
  }

  onRemoteChange(event: Event): void {
    this.selectedRemote.set((event.target as HTMLSelectElement).value);
    const options = this.branchOptions();
    const current = this.currentBranch();
    this.selectedBranch.set(current && options.includes(current) ? current : (options[0] ?? ''));
  }

  onBranchChange(event: Event): void {
    this.selectedBranch.set((event.target as HTMLSelectElement).value);
  }

  onSubmit(): void {
    this.submitted.emit({
      remote: this.selectedRemote(),
      branch: this.selectedBranch(),
      intoLocalBranch: this.currentBranch(),
    });
  }
}
