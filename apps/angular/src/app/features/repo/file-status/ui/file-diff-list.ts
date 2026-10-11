import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { FileDiff } from '@contracts/domain';

/**
 * Changed-file list of the commit/PR variants of the "File Status" screen
 * (ADR-0029). Dumb and presentational: it renders the per-file sections of the
 * diff and emits the path the user picked, which the page forwards to
 * `FileStatusStore.selectFile` so the right pane re-projects that single file.
 *
 * A renamed file is addressed by its NEW path (`oldPath` is never shown as the
 * row identity, because that is the path the diff viewer addresses). Binary
 * files carry no hunks, so they render a `binary` marker instead of the
 * additions/deletions counts.
 */
@Component({
  selector: 'st-file-diff-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="st-file-diff-list">
      <h3 class="st-file-diff-list__heading" i18n>Changed files</h3>

      @if (files().length === 0) {
        <p class="st-file-diff-list__empty" data-testid="file-list-empty" i18n>No changed files.</p>
      } @else {
        <ul class="st-file-diff-list__list">
          @for (file of files(); track file.path) {
            <li
              class="st-file-diff-list__row"
              data-testid="file-diff-row"
              [attr.data-path]="file.path"
              [attr.data-selected]="file.path === selectedPath()"
              [class.st-file-diff-list__row--selected]="file.path === selectedPath()"
              (click)="fileSelect.emit(file.path)"
            >
              <span
                class="st-file-diff-list__badge"
                data-testid="file-diff-status"
                [attr.data-status]="file.status"
                >{{ file.status }}</span
              >
              <span class="st-file-diff-list__path">{{ file.path }}</span>
              @if (file.isBinary) {
                <span class="st-file-diff-list__binary" data-testid="file-diff-binary" i18n>binary</span>
              } @else {
                <span class="st-file-diff-list__counts">
                  <span class="st-file-diff-list__additions" data-testid="file-diff-additions"
                    >+{{ file.additions }}</span
                  >
                  <span class="st-file-diff-list__deletions" data-testid="file-diff-deletions"
                    >−{{ file.deletions }}</span
                  >
                </span>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-height: 0;
      color: var(--st-color-text, #d6d6de);
    }

    .st-file-diff-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12px;
    }

    .st-file-diff-list__heading {
      margin: 0;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      opacity: 0.6;
    }

    .st-file-diff-list__list {
      margin: 0;
      padding: 0;
      list-style: none;
      overflow: auto;
    }

    .st-file-diff-list__row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 2px 4px;
      border-radius: 4px;
      cursor: pointer;
    }

    .st-file-diff-list__row:hover {
      background: color-mix(in srgb, var(--st-color-text, #d6d6de) 8%, transparent);
    }

    .st-file-diff-list__row--selected {
      background: color-mix(in srgb, var(--st-color-accent, #0a84ff) 22%, transparent);
    }

    .st-file-diff-list__badge {
      flex: 0 0 auto;
      min-width: 18px;
      padding: 0 4px;
      border: 1px solid var(--st-color-border, #2f2f44);
      border-radius: 3px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      text-align: center;
      text-transform: uppercase;
    }

    .st-file-diff-list__badge[data-status='M'] {
      color: #e0a458;
    }

    .st-file-diff-list__badge[data-status='A'] {
      color: #30d158;
    }

    .st-file-diff-list__badge[data-status='D'] {
      color: #ff6b6b;
    }

    .st-file-diff-list__badge[data-status='R'] {
      color: #0a84ff;
    }

    .st-file-diff-list__path {
      flex: 1 1 auto;
      min-width: 0;
      word-break: break-all;
    }

    .st-file-diff-list__counts {
      flex: 0 0 auto;
      display: flex;
      gap: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
    }

    .st-file-diff-list__additions {
      color: #30d158;
    }

    .st-file-diff-list__deletions {
      color: #ff6b6b;
    }

    .st-file-diff-list__binary {
      flex: 0 0 auto;
      opacity: 0.6;
      font-style: italic;
    }

    .st-file-diff-list__empty {
      margin: 0;
      opacity: 0.55;
    }
  `,
})
export class FileDiffList {
  /** Per-file sections of the diff being listed (never the whole `Diff`). */
  readonly files = input<FileDiff[]>([]);
  /** Path currently selected, or null when nothing is selected. */
  readonly selectedPath = input<string | null>(null);

  readonly fileSelect = output<string>();
}
