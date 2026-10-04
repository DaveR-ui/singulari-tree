import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import type { AppError } from '@core/services/ipc-bridge.service';
import { ModalComponent } from '@shared/ui/modal/modal';
import {
  type PushIntent,
  type PushRowSelection,
  type PushRowView,
  type RemoteBranchOption,
  type RemoteOpProgress,
  type RemoteOption,
} from '../../remote-models';

/** Local per-row presentation state, keyed by local branch name. */
interface PushRowState {
  checked: boolean;
  remoteBranch: string;
  track: boolean;
}

/**
 * Dumb Push dialog: collects which local branches to push where and emits a
 * `PushIntent`. All ref data arrives through inputs from `RemoteOpsStore`; the
 * component owns only the transient selection so it stays presentation-only.
 */
@Component({
  selector: 'st-push-dialog',
  standalone: true,
  imports: [ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <st-modal
      [open]="open()"
      [title]="'Push' + (repoName() ? ' : ' + repoName() : '')"
      (closed)="closed.emit()"
    >
      <div class="st-push" data-testid="push-dialog">
        <div class="st-push__field">
          <label class="st-push__label" for="push-remote">Remote</label>
          <select
            id="push-remote"
            class="st-push__select"
            data-testid="push-remote-select"
            [value]="selectedRemote()"
            (change)="onRemoteChange($event)"
          >
            @for (remote of remotes(); track remote.name) {
              <option [value]="remote.name" [selected]="remote.name === selectedRemote()">
                {{ remote.name }}
              </option>
            }
          </select>
        </div>

        <div class="st-push__field">
          <label class="st-push__label" for="push-remote-url">URL</label>
          <input
            id="push-remote-url"
            class="st-push__input"
            type="text"
            readonly
            data-testid="push-remote-url"
            [value]="selectedRemoteUrl()"
          />
        </div>

        <button
          type="button"
          class="st-push__refresh"
          data-testid="push-refresh"
          (click)="refreshRequested.emit()"
        >
          ↻ Refresh
        </button>

        <h3 class="st-push__heading">Branches to push</h3>
        <table class="st-push__table" data-testid="push-table">
          <thead>
            <tr>
              <th scope="col">Push?</th>
              <th scope="col">Local branch</th>
              <th scope="col">Remote branch</th>
              <th scope="col">Track?</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.localBranch) {
              <tr data-testid="push-row">
                <td>
                  <input
                    type="checkbox"
                    data-testid="push-row-checkbox"
                    [checked]="stateFor(row).checked"
                    [attr.aria-label]="'Push ' + row.localBranch"
                    (change)="onRowChecked(row, $event)"
                  />
                </td>
                <td data-testid="push-row-local">{{ row.localBranch }}</td>
                <td>
                  <div class="st-push__track">
                    <select
                      class="st-push__select"
                      data-testid="push-row-remote-select"
                      [value]="stateFor(row).remoteBranch"
                      [attr.aria-label]="'Remote branch for ' + row.localBranch"
                      (change)="onRowRemoteBranchChange(row, $event)"
                    >
                      @for (branch of rowOptions()[row.localBranch]; track branch) {
                        <option [value]="branch" [selected]="branch === stateFor(row).remoteBranch">
                          {{ branch }}
                        </option>
                      }
                    </select>
                  </div>
                </td>
                <td class="st-push__track">
                  <input
                    type="checkbox"
                    data-testid="push-row-track"
                    [checked]="stateFor(row).track"
                    [attr.aria-label]="'Track ' + row.localBranch"
                    (change)="onRowTrackChange(row, $event)"
                  />
                </td>
              </tr>
            }
          </tbody>
        </table>

        <label class="st-push__check">
          <input
            type="checkbox"
            data-testid="push-select-all"
            [checked]="allChecked()"
            (change)="onToggleAll($event)"
          />
          Select all
        </label>

        <div class="st-push__options">
          <label class="st-push__check">
            <input
              type="checkbox"
              data-testid="push-option-tags"
              [checked]="tags()"
              (change)="onTagsChange($event)"
            />
            Push all tags
          </label>
          <label class="st-push__check">
            <input
              type="checkbox"
              data-testid="push-option-force"
              [checked]="force()"
              (change)="onForceChange($event)"
            />
            Force Push
          </label>
        </div>

        @if (loading()) {
          <p class="st-push__status" data-testid="push-loading">Loading branches…</p>
        }
        @if (progress(); as p) {
          <p class="st-push__status" data-testid="push-progress">
            {{ p.percent }}% — {{ p.message }}
          </p>
        }
        @if (error(); as err) {
          <p class="st-push__error" data-testid="push-error">{{ err.message }}</p>
        }
        @if (offline()) {
          <p class="st-push__status" data-testid="push-offline">
            Git core offline — run inside the desktop app.
          </p>
        }
      </div>

      <div class="st-push__footer" st-modal-footer>
        <button
          type="button"
          class="st-push__btn"
          data-testid="push-cancel"
          (click)="closed.emit()"
        >
          Cancel
        </button>
        <button
          type="button"
          class="st-push__btn st-push__btn--primary"
          data-testid="push-submit"
          [disabled]="!canSubmit()"
          (click)="onSubmit()"
        >
          Push
        </button>
      </div>
    </st-modal>
  `,
  styles: `
    :host {
      display: contents;
    }

    .st-push {
      display: flex;
      flex-direction: column;
      gap: 10px;
      color: var(--st-color-text, #d6d6de);
    }

    .st-push__field {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .st-push__label {
      width: 56px;
      font-size: 12px;
      font-weight: 600;
      opacity: 0.8;
    }

    .st-push__select,
    .st-push__input {
      flex: 1 1 auto;
      min-width: 0;
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid var(--st-color-border, #2f2f44);
      background: #1a1a2a;
      color: var(--st-color-text, #d6d6de);
      font-size: 12px;
      outline: none;
    }

    .st-push__select:focus,
    .st-push__input:focus {
      border-color: var(--st-color-accent, #0a84ff);
    }

    .st-push__input[readonly] {
      opacity: 0.7;
    }

    .st-push__refresh {
      align-self: flex-start;
      padding: 4px 10px;
      border-radius: 4px;
      border: 1px solid var(--st-color-border, #2f2f44);
      background: transparent;
      color: inherit;
      font-size: 12px;
      cursor: pointer;
    }

    .st-push__refresh:hover {
      background: rgba(255, 255, 255, 0.07);
    }

    .st-push__heading {
      margin: 4px 0 0;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }

    .st-push__table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .st-push__table th,
    .st-push__table td {
      padding: 6px 8px;
      text-align: left;
      border-bottom: 1px solid var(--st-color-border, #2f2f44);
      vertical-align: middle;
    }

    .st-push__table th {
      font-weight: 600;
      opacity: 0.7;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.04em;
    }

    .st-push__track {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .st-push__check {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
    }

    .st-push__options {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      padding-top: 2px;
    }

    .st-push__status {
      margin: 0;
      font-size: 12px;
      opacity: 0.7;
    }

    .st-push__error {
      margin: 0;
      font-size: 12px;
      color: #ff6b6b;
    }

    .st-push__footer {
      display: flex;
      gap: 8px;
    }

    .st-push__btn {
      padding: 6px 14px;
      border-radius: 6px;
      border: 1px solid var(--st-color-border, #2f2f44);
      background: transparent;
      color: var(--st-color-text, #d6d6de);
      font-size: 12px;
      cursor: pointer;
    }

    .st-push__btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.07);
    }

    .st-push__btn--primary {
      background: var(--st-color-accent, #0a84ff);
      border-color: var(--st-color-accent, #0a84ff);
      color: #fff;
    }

    .st-push__btn:disabled {
      opacity: 0.5;
      cursor: default;
    }
  `,
})
export class PushDialog {
  readonly open = input(false);
  readonly repoName = input('');
  readonly remotes = input<RemoteOption[]>([]);
  readonly rows = input<PushRowView[]>([]);
  readonly remoteBranchesByRemote = input<Record<string, RemoteBranchOption[]>>({});
  readonly loading = input(false);
  readonly running = input(false);
  readonly progress = input<RemoteOpProgress | null>(null);
  readonly error = input<AppError | null>(null);
  readonly offline = input(false);

  readonly closed = output<void>();
  readonly refreshRequested = output<void>();
  readonly submitted = output<PushIntent>();

  /** Selected remote name; defaults to `origin` (else the first remote). */
  readonly selectedRemote = signal('');
  /** Push all tags (`--tags`). */
  readonly tags = signal(false);
  /** Force-push (`--force`). */
  readonly force = signal(false);

  /**
   * Per-row selection, keyed by local branch. Re-seeded from `rows()` whenever
   * the dialog opens (and when the ref data reloads while it is open).
   */
  readonly rowState = signal<Record<string, PushRowState>>({});

  /** URL of the currently selected remote, for the read-only display. */
  readonly selectedRemoteUrl = computed(
    () => this.remotes().find((remote) => remote.name === this.selectedRemote())?.url ?? '',
  );

  /**
   * Selectable remote branches for each row: the branches known for the
   * selected remote, plus the row's default target and its local branch.
   *
   * Full remote-branch enumeration is unavailable (no RPC), so this derived
   * fallback list feeds the per-row target select. An empty selection means
   * "same name as the local branch" (the core's `PushRequest.remoteBranch`
   * contract).
   */
  readonly rowOptions = computed<Record<string, string[]>>(() => {
    const known = (this.remoteBranchesByRemote()[this.selectedRemote()] ?? []).map(
      (option) => option.name,
    );
    const result: Record<string, string[]> = {};
    for (const row of this.rows()) {
      const options: string[] = [];
      const add = (name: string): void => {
        if (name && !options.includes(name)) options.push(name);
      };
      for (const name of known) add(name);
      add(row.defaultRemoteBranch);
      add(row.localBranch);
      result[row.localBranch] = options;
    }
    return result;
  });

  /** True when every row is checked (and there is at least one row). */
  readonly allChecked = computed(() => {
    const rows = this.rows();
    if (rows.length === 0) return false;
    const state = this.rowState();
    return rows.every((row) => state[row.localBranch]?.checked ?? false);
  });

  /** Submit is blocked while running/offline or with no remote/selection. */
  readonly canSubmit = computed(
    () =>
      !this.running() &&
      !this.offline() &&
      this.selectedRemote() !== '' &&
      this.rows().some((row) => this.stateFor(row).checked),
  );

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const remotes = this.remotes();
      const rows = this.rows();
      this.selectedRemote.set(
        remotes.find((remote) => remote.name === 'origin')?.name ?? remotes[0]?.name ?? '',
      );
      this.tags.set(false);
      this.force.set(false);
      const next: Record<string, PushRowState> = {};
      for (const row of rows) {
        next[row.localBranch] = {
          checked: false,
          remoteBranch: row.defaultRemoteBranch,
          track: false,
        };
      }
      this.rowState.set(next);
    });
  }

  /** Stored state for a row, falling back to its unchecked default. */
  stateFor(row: PushRowView): PushRowState {
    return (
      this.rowState()[row.localBranch] ?? {
        checked: false,
        remoteBranch: row.defaultRemoteBranch,
        track: false,
      }
    );
  }

  onRemoteChange(event: Event): void {
    this.selectedRemote.set((event.target as HTMLSelectElement).value);
  }

  onRowChecked(row: PushRowView, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.rowState.update((state) => ({
      ...state,
      [row.localBranch]: { ...this.stateFor(row), checked },
    }));
  }

  onRowRemoteBranchChange(row: PushRowView, event: Event): void {
    const remoteBranch = (event.target as HTMLSelectElement).value;
    this.rowState.update((state) => ({
      ...state,
      [row.localBranch]: { ...this.stateFor(row), remoteBranch },
    }));
  }

  onRowTrackChange(row: PushRowView, event: Event): void {
    const track = (event.target as HTMLInputElement).checked;
    this.rowState.update((state) => ({
      ...state,
      [row.localBranch]: { ...this.stateFor(row), track },
    }));
  }

  onTagsChange(event: Event): void {
    this.tags.set((event.target as HTMLInputElement).checked);
  }

  onForceChange(event: Event): void {
    this.force.set((event.target as HTMLInputElement).checked);
  }

  onToggleAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.rowState.update((state) => {
      const next: Record<string, PushRowState> = { ...state };
      for (const row of this.rows()) {
        next[row.localBranch] = { ...this.stateFor(row), checked };
      }
      return next;
    });
  }

  onSubmit(): void {
    const state = this.rowState();
    const branches: PushRowSelection[] = this.rows()
      .filter((row) => state[row.localBranch]?.checked ?? false)
      .map((row) => {
        const rowState = this.stateFor(row);
        return {
          localBranch: row.localBranch,
          remoteBranch: rowState.remoteBranch,
          track: rowState.track,
        };
      });
    this.submitted.emit({
      remote: this.selectedRemote(),
      branches,
      tags: this.tags(),
      force: this.force(),
    });
  }
}
