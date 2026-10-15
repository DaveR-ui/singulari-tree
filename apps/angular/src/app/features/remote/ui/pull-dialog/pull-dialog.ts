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
 * Dumb Pull dialog: collects the remote/branch pair, the local target branch
 * and the merge/rebase options, then emits a {@link PullIntent}. Ref data is
 * supplied by `RemoteOpsStore`; the component only owns the transient selection
 * and never talks to Git.
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
          <!-- Options come from the real remote-tracking branches known for the
               selected remote (plus upstream-derived fallbacks), so the select
               stays in sync with the remote. -->
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
            [value]="intoLocalBranch()"
            (input)="onIntoLocalBranchChange($event)"
          />
        </label>

        <fieldset class="st-pull__options">
          <legend>Options</legend>

          <label class="st-pull__option">
            <input
              type="checkbox"
              data-testid="pull-option-commit-merged"
              [checked]="commitMerged()"
              (change)="onCommitMergedChange($event)"
            />
            <span>Commit merged changes immediately</span>
          </label>

          <label class="st-pull__option">
            <input
              type="checkbox"
              data-testid="pull-option-log"
              [checked]="log()"
              (change)="onLogChange($event)"
            />
            <span>Include messages from commits being merged in merge commit</span>
          </label>

          <label class="st-pull__option">
            <input
              type="checkbox"
              data-testid="pull-option-no-ff"
              [checked]="noFf()"
              (change)="onNoFfChange($event)"
            />
            <span>Create a new commit even if fast-forward is possible</span>
          </label>

          <label class="st-pull__option">
            <input
              type="checkbox"
              data-testid="pull-option-rebase"
              [checked]="rebase()"
              (change)="onRebaseChange($event)"
            />
            <span>Rebase instead of merge</span>
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
      color: var(--st-color-text);
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
      border: 1px solid var(--st-color-border);
      color: var(--st-color-text);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 12px;
      outline: none;
    }

    .st-pull__control:focus {
      border-color: var(--st-color-accent);
    }

    .st-pull__control:disabled {
      color: var(--muted, #8a8a9a);
      opacity: 0.7;
      cursor: not-allowed;
    }

    .st-pull__refresh {
      background: transparent;
      border: 1px solid var(--st-color-border);
      color: var(--st-color-text);
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
    }

    .st-pull__refresh:hover {
      border-color: var(--st-color-accent);
      color: var(--st-color-accent);
    }

    .st-pull__options {
      margin: 4px 0 0;
      padding: 10px 12px;
      border: 1px solid var(--st-color-border);
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
      cursor: pointer;
    }

    .st-pull__note {
      margin: 0;
      color: var(--muted, #8a8a9a);
      font-size: 12px;
    }

    .st-pull__progress {
      margin: 0;
      color: var(--st-color-accent);
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
      border: 1px solid var(--st-color-border);
      color: var(--st-color-text);
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 12px;
      cursor: pointer;
    }

    .st-pull__btn:hover {
      border-color: var(--muted, #8a8a9a);
    }

    .st-pull__btn--primary {
      background: var(--st-color-accent);
      border-color: var(--st-color-accent);
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

  readonly selectedRemote = signal('');
  readonly selectedBranch = signal('');
  /** Local branch to pull into (empty = currently checked-out branch). */
  readonly intoLocalBranch = signal('');
  /** "Commit merged changes immediately" — when false, emit `noCommit`. */
  readonly commitMerged = signal(true);
  readonly log = signal(false);
  readonly noFf = signal(false);
  readonly rebase = signal(false);

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
      this.intoLocalBranch.set(current);
      this.commitMerged.set(true);
      this.log.set(false);
      this.noFf.set(false);
      this.rebase.set(false);
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

  onIntoLocalBranchChange(event: Event): void {
    this.intoLocalBranch.set((event.target as HTMLInputElement).value);
  }

  onCommitMergedChange(event: Event): void {
    this.commitMerged.set((event.target as HTMLInputElement).checked);
  }

  onLogChange(event: Event): void {
    this.log.set((event.target as HTMLInputElement).checked);
  }

  onNoFfChange(event: Event): void {
    this.noFf.set((event.target as HTMLInputElement).checked);
  }

  onRebaseChange(event: Event): void {
    this.rebase.set((event.target as HTMLInputElement).checked);
  }

  onSubmit(): void {
    this.submitted.emit({
      remote: this.selectedRemote(),
      branch: this.selectedBranch(),
      intoLocalBranch: this.intoLocalBranch(),
      noCommit: !this.commitMerged(),
      log: this.log(),
      noFf: this.noFf(),
      rebase: this.rebase(),
    });
  }
}
