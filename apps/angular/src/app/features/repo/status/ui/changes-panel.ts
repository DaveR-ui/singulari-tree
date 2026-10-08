import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { FileDiff, FileStatus } from '@contracts/domain';
import { HunkActions, type HunkActionEvent } from './hunk-actions';

/**
 * Working-tree changes panel: staged + unstaged file sections, file-level
 * stage/unstage/discard, the hunk/line action list for the selected file, and
 * the commit box. Dumb and presentational — it renders its inputs and emits
 * user intent; the owning page binds those events to `StatusStore`.
 */
@Component({
  selector: 'st-changes-panel',
  standalone: true,
  imports: [HunkActions],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="st-changes">
      @if (statusError(); as error) {
        <p class="st-changes__error" data-testid="status-error">{{ error }}</p>
      }

      <div class="st-changes__sections">
        <section class="st-changes__section">
          <h3 class="st-changes__heading" i18n>Staged changes</h3>
          @if (stagedFiles().length) {
            <ul class="st-changes__list">
              @for (file of stagedFiles(); track file.path) {
                <li
                  class="st-changes__row"
                  data-testid="status-file"
                  [class.st-changes__row--selected]="file.path === selectedPath()"
                  (click)="fileSelect.emit(file.path)"
                >
                  <span class="st-changes__path">{{ file.path }}</span>
                  <button
                    type="button"
                    class="st-changes__action"
                    data-testid="status-unstage"
                    (click)="onUnstage($event, file.path)"
                    i18n
                  >
                    Unstage
                  </button>
                </li>
              }
            </ul>
          } @else {
            <p class="st-changes__empty" i18n>No staged changes.</p>
          }
        </section>

        <section class="st-changes__section">
          <h3 class="st-changes__heading" i18n>Unstaged changes</h3>
          @if (unstagedFiles().length) {
            <ul class="st-changes__list">
              @for (file of unstagedFiles(); track file.path) {
                <li
                  class="st-changes__row"
                  data-testid="status-file"
                  [class.st-changes__row--selected]="file.path === selectedPath()"
                  (click)="fileSelect.emit(file.path)"
                >
                  <span class="st-changes__path">{{ file.path }}</span>
                  <button
                    type="button"
                    class="st-changes__action"
                    data-testid="status-stage"
                    (click)="onStage($event, file.path)"
                    i18n
                  >
                    Stage
                  </button>
                  <button
                    type="button"
                    class="st-changes__action st-changes__action--danger"
                    data-testid="status-discard"
                    (click)="onDiscard($event, file.path)"
                    i18n
                  >
                    Discard
                  </button>
                </li>
              }
            </ul>
          } @else {
            <p class="st-changes__empty" i18n>No unstaged changes.</p>
          }
        </section>
      </div>

      @if (!stagedFiles().length && !unstagedFiles().length) {
        <p class="st-changes__empty" data-testid="status-empty" i18n>No changes.</p>
      }

      @if (selectedPath() && (unstagedFile() || stagedFile())) {
        <div class="st-changes__hunks" data-testid="changes-hunks">
          <h3 class="st-changes__heading" i18n>Hunk actions</h3>
          <st-hunk-actions
            [unstagedFile]="unstagedFile()"
            [stagedFile]="stagedFile()"
            [busy]="busy()"
            [truncated]="diffTruncated()"
            (stageHunk)="stageHunk.emit($event)"
            (unstageHunk)="unstageHunk.emit($event)"
            (discardHunk)="discardHunk.emit($event)"
            (discardFile)="discardFile.emit($event)"
          />
        </div>
      }

      <div class="st-changes__commit">
        @if (commitError(); as error) {
          <p class="st-changes__error" data-testid="commit-error">{{ error }}</p>
        }
        <textarea
          class="st-changes__message"
          rows="2"
          data-testid="commit-message-input"
          placeholder="Commit message"
          i18n-placeholder
          [value]="message()"
          [disabled]="busy()"
          (input)="onMessage($event)"
        ></textarea>
        <button
          type="button"
          class="st-changes__commit-button"
          data-testid="commit-button"
          [disabled]="!canCommit()"
          (click)="commit.emit()"
          i18n
        >
          Commit
        </button>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      color: var(--st-color-text, #d6d6de);
    }

    .st-changes {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px 12px;
      font-size: 12px;
    }

    .st-changes__sections {
      display: flex;
      flex-direction: column;
      gap: 10px;
      overflow: auto;
    }

    .st-changes__heading {
      margin: 0 0 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      opacity: 0.6;
    }

    .st-changes__list {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .st-changes__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 2px 4px;
      border-radius: 4px;
      cursor: pointer;
    }

    .st-changes__row:hover {
      background: color-mix(in srgb, var(--st-color-text, #d6d6de) 8%, transparent);
    }

    .st-changes__row--selected {
      background: color-mix(in srgb, var(--st-color-accent, #0a84ff) 22%, transparent);
    }

    .st-changes__path {
      word-break: break-all;
    }

    .st-changes__action,
    .st-changes__commit-button {
      border: 1px solid var(--st-color-border, #2f2f44);
      border-radius: 4px;
      background: var(--st-color-surface, #252536);
      color: inherit;
      font-size: 11px;
      cursor: pointer;
    }

    .st-changes__action {
      padding: 1px 6px;
    }

    .st-changes__action--danger {
      border-color: color-mix(in srgb, #ff6b6b 55%, var(--st-color-border, #2f2f44));
      color: #ff8f8f;
    }

    .st-changes__hunks {
      border-top: 1px solid var(--st-color-border, #2f2f44);
      padding-top: 8px;
    }

    .st-changes__commit-button {
      padding: 4px 12px;
      align-self: flex-end;
    }

    .st-changes__commit-button:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .st-changes__message {
      width: 100%;
      box-sizing: border-box;
      resize: vertical;
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid var(--st-color-border, #2f2f44);
      background: var(--st-color-surface, #252536);
      color: inherit;
      font-family: inherit;
      font-size: 12px;
    }

    .st-changes__commit {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .st-changes__empty {
      margin: 0;
      opacity: 0.55;
    }

    .st-changes__error {
      margin: 0;
      color: #ff6b6b;
    }
  `,
})
export class ChangesPanel {
  readonly stagedFiles = input<FileStatus[]>([]);
  readonly unstagedFiles = input<FileStatus[]>([]);
  readonly message = input('');
  readonly busy = input(false);
  readonly selectedPath = input<string | null>(null);
  readonly statusError = input<string | null>(null);
  readonly commitError = input<string | null>(null);
  /** Selected file's worktree FileDiff (Stage/Discard), or null. */
  readonly unstagedFile = input<FileDiff | null>(null);
  /** Selected file's staged FileDiff (Unstage), or null. */
  readonly stagedFile = input<FileDiff | null>(null);
  /** True when the addressed diff was capped by the core (ADR-0020 (c)). */
  readonly diffTruncated = input(false);

  readonly stage = output<string[]>();
  readonly unstage = output<string[]>();
  readonly discardFile = output<string>();
  readonly stageHunk = output<HunkActionEvent>();
  readonly unstageHunk = output<HunkActionEvent>();
  readonly discardHunk = output<HunkActionEvent>();
  readonly messageChange = output<string>();
  readonly commit = output<void>();
  readonly fileSelect = output<string>();

  /** Enable Commit only with a staged file and a non-blank message. */
  readonly canCommit = computed(
    () => this.stagedFiles().length > 0 && this.message().trim().length > 0 && !this.busy(),
  );

  onStage(event: Event, path: string): void {
    event.stopPropagation();
    this.stage.emit([path]);
  }

  onUnstage(event: Event, path: string): void {
    event.stopPropagation();
    this.unstage.emit([path]);
  }

  /** File-level discard is destructive: confirm before emitting. */
  onDiscard(event: Event, path: string): void {
    event.stopPropagation();
    if (this.busy()) return;
    if (!confirmFileDiscard(path)) return;
    this.discardFile.emit(path);
  }

  onMessage(event: Event): void {
    this.messageChange.emit((event.target as HTMLTextAreaElement).value);
  }
}

/** Confirm a destructive file-level discard; stubbable in tests. */
function confirmFileDiscard(path: string): boolean {
  return typeof confirm === 'function'
    ? confirm(`Discard changes to "${path}"? This cannot be undone.`)
    : true;
}
