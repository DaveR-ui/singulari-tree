import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { FileDiff, Hunk } from '@contracts/domain';
import { ButtonComponent, IconComponent } from '@singularitree/ui-kit';

/** A hunk/line action addressed by indices (the renderer never builds patches). */
export interface HunkActionEvent {
  path: string;
  hunkIndex: number;
  /** 0-based indices into the hunk's `lines`; empty = the whole hunk. */
  lineIndices: number[];
}

/** One file rendered in the action list, tagged with its staging side. */
interface HunkGroup {
  key: 'unstaged' | 'staged';
  file: FileDiff;
  staged: boolean;
}

/** True when the file supports hunk/line actions (tracked, textual, hunks present). */
export function isHunkActionable(file: FileDiff): boolean {
  return (
    !file.isBinary &&
    !file.hasConflictMarkers &&
    file.status !== 'D' &&
    file.hunks.length > 0
  );
}

function hunkLabel(hunk: Hunk): string {
  return `@@ -${hunk.fromStart},${hunk.fromLines} +${hunk.toStart},${hunk.toLines} @@`;
}

function countLines(hunk: Hunk, kind: 'added' | 'removed'): number {
  return hunk.lines.filter((line) => line.kind === kind).length;
}

function isChangedLine(kind: string): boolean {
  return kind === 'added' || kind === 'removed';
}

/**
 * Destructive file-level discard confirmation. Kept as a module function so the
 * component stays pure and tests can stub `window.confirm`.
 */
function confirmFileDiscard(path: string): boolean {
  return typeof confirm === 'function'
    ? confirm(`Discard changes to "${path}"? This cannot be undone.`)
    : true;
}

/**
 * Hunk/line action list rendered alongside the diff viewer (never hacking
 * Monaco's DOM). For a selected file it lists every hunk with Stage/Discard
 * (unstaged side) or Unstage (staged side), per-hunk additions/deletions, and
 * optional per-line selection. Untracked/binary/deleted files expose file-level
 * actions only (ADR-0020 (b)).
 */
@Component({
  selector: 'st-hunk-actions',
  standalone: true,
  imports: [ButtonComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-testid': 'hunk-actions' },
  template: `
    @if (truncated()) {
      <p
        class="st-hunk-actions__truncated"
        data-testid="hunk-actions-truncated"
        i18n
      >
        Diff truncated — some hunks are not shown.
      </p>
    }

    @for (group of groups(); track group.key) {
      <section
        class="st-hunk-actions__group"
        [attr.data-testid]="'hunk-group-' + group.key"
      >
        <header class="st-hunk-actions__group-header">
          <span class="st-hunk-actions__path" [title]="group.file.path">{{ group.file.path }}</span>
          <span class="st-hunk-actions__counts" data-testid="hunk-file-counts">
            <span class="st-hunk-actions__add">+{{ group.file.additions }}</span>
            <span class="st-hunk-actions__del">-{{ group.file.deletions }}</span>
          </span>
        </header>

        @if (isActionable(group.file)) {
          @for (hunk of group.file.hunks; track $index; let i = $index) {
            <div class="st-hunk-actions__hunk" data-testid="hunk-row">
              <div class="st-hunk-actions__hunk-header">
                <span class="st-hunk-actions__range">{{ label(hunk) }}</span>
                <span class="st-hunk-actions__hunk-counts" data-testid="hunk-counts">
                  +{{ additions(hunk) }} -{{ deletions(hunk) }}
                </span>
              </div>

              <ul class="st-hunk-actions__lines">
                @for (line of hunk.lines; track $index; let li = $index) {
                  @if (changed(line.kind)) {
                    <li class="st-hunk-actions__line">
                      <label class="st-hunk-actions__line-label">
                        <input
                          type="checkbox"
                          class="st-hunk-actions__line-check"
                          data-testid="hunk-line"
                          [checked]="isLineSelected(group.staged, i, li)"
                          [disabled]="busy()"
                          (change)="toggleLine(group.staged, i, li)"
                        />
                        <span
                          class="st-hunk-actions__line-text"
                          [class.st-hunk-actions__line-text--add]="line.kind === 'added'"
                          [class.st-hunk-actions__line-text--del]="line.kind === 'removed'"
                          >{{ line.kind === 'added' ? '+' : '-' }}{{ line.text }}</span
                        >
                      </label>
                    </li>
                  }
                }
              </ul>

              <div class="st-hunk-actions__buttons">
                @if (group.staged) {
                  <st-button
                    variant="icon"
                    size="sm"
                    data-testid="hunk-unstage"
                    [ariaLabel]="a11yUnstageHunk"
                    [disabled]="busy()"
                    (click)="onUnstageHunk(i)"
                  >
                    <st-icon name="minus"></st-icon>
                  </st-button>
                } @else {
                  <st-button
                    variant="icon"
                    size="sm"
                    data-testid="hunk-stage"
                    [ariaLabel]="a11yStageHunk"
                    [disabled]="busy()"
                    (click)="onStageHunk(i)"
                  >
                    <st-icon name="plus"></st-icon>
                  </st-button>
                  <st-button
                    variant="icon"
                    size="sm"
                    data-testid="hunk-discard"
                    [ariaLabel]="a11yDiscardHunk"
                    [disabled]="busy()"
                    (click)="onDiscardHunk(i)"
                  >
                    <st-icon name="discard"></st-icon>
                  </st-button>
                }
              </div>

              @if (selectedCount(group.staged, i); as count) {
                <p class="st-hunk-actions__selection" data-testid="hunk-selection">
                  {{ count }} selected line(s)
                </p>
              }
            </div>
          }
        } @else {
          <p class="st-hunk-actions__file-only" data-testid="hunk-file-only" i18n>
            File-level actions only.
          </p>
        }

        @if (!group.staged) {
          <div class="st-hunk-actions__file-buttons">
            <st-button
              variant="icon"
              size="sm"
              data-testid="hunk-file-discard"
              [ariaLabel]="a11yDiscardFile"
              [disabled]="busy()"
              (click)="onDiscardFile(group.file.path)"
            >
              <st-icon name="discard"></st-icon>
            </st-button>
          </div>
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      color: var(--st-color-text);
      font-size: 12px;
    }

    .st-hunk-actions__truncated {
      margin: 0 0 6px;
      color: var(--st-color-warn);
    }

    .st-hunk-actions__group {
      border-top: 1px solid var(--st-color-border);
      padding: 6px 0;
    }

    .st-hunk-actions__group-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-weight: 600;
    }

    .st-hunk-actions__path {
      word-break: break-all;
    }

    .st-hunk-actions__counts {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    .st-hunk-actions__add {
      color: var(--st-color-add);
    }

    .st-hunk-actions__del {
      color: var(--st-color-remove);
    }

    .st-hunk-actions__hunk {
      margin: 4px 0;
      padding: 4px 6px;
      border: 1px solid var(--st-color-border);
      border-radius: 4px;
      background: var(--st-color-surface-2);
    }

    .st-hunk-actions__hunk-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-family: var(--st-font-mono);
      font-size: 11px;
      color: var(--st-color-muted);
    }

    .st-hunk-actions__lines {
      margin: 4px 0;
      padding: 0;
      list-style: none;
      max-height: 160px;
      overflow: auto;
    }

    .st-hunk-actions__line-label {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }

    .st-hunk-actions__line-text {
      font-family: var(--st-font-mono);
      font-size: 11px;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .st-hunk-actions__line-text--add {
      color: var(--st-color-add);
    }

    .st-hunk-actions__line-text--del {
      color: var(--st-color-remove);
    }

    .st-hunk-actions__buttons,
    .st-hunk-actions__file-buttons {
      display: flex;
      gap: 6px;
    }

    .st-hunk-actions__file-buttons {
      margin-top: 6px;
    }

    .st-hunk-actions__selection,
    .st-hunk-actions__file-only {
      margin: 4px 0 0;
      color: var(--st-color-muted);
    }
  `,
})
export class HunkActions {
  /** Selected file's worktree FileDiff (Stage/Discard side), or null. */
  readonly unstagedFile = input<FileDiff | null>(null);
  /** Selected file's staged FileDiff (Unstage side), or null. */
  readonly stagedFile = input<FileDiff | null>(null);
  readonly busy = input(false);
  readonly truncated = input(false);

  readonly a11yStageHunk = $localize`Stage hunk`;
  readonly a11yUnstageHunk = $localize`Unstage hunk`;
  readonly a11yDiscardHunk = $localize`Discard hunk`;
  readonly a11yDiscardFile = $localize`Discard file`;

  readonly stageHunk = output<HunkActionEvent>();
  readonly unstageHunk = output<HunkActionEvent>();
  readonly discardHunk = output<HunkActionEvent>();
  readonly discardFile = output<string>();

  /** Selected changed-line indices, keyed by `${side}:${hunkIndex}`. */
  private readonly selectedLines = signal<Record<string, number[]>>({});

  readonly groups = computed<HunkGroup[]>(() => {
    const groups: HunkGroup[] = [];
    const unstaged = this.unstagedFile();
    if (unstaged) groups.push({ key: 'unstaged', file: unstaged, staged: false });
    const staged = this.stagedFile();
    if (staged) groups.push({ key: 'staged', file: staged, staged: true });
    return groups;
  });

  isActionable(file: FileDiff): boolean {
    return isHunkActionable(file);
  }

  label(hunk: Hunk): string {
    return hunkLabel(hunk);
  }

  additions(hunk: Hunk): number {
    return countLines(hunk, 'added');
  }

  deletions(hunk: Hunk): number {
    return countLines(hunk, 'removed');
  }

  changed(kind: string): boolean {
    return isChangedLine(kind);
  }

  private key(staged: boolean, hunkIndex: number): string {
    return `${staged ? 's' : 'u'}:${hunkIndex}`;
  }

  isLineSelected(staged: boolean, hunkIndex: number, lineIndex: number): boolean {
    return (this.selectedLines()[this.key(staged, hunkIndex)] ?? []).includes(lineIndex);
  }

  selectedCount(staged: boolean, hunkIndex: number): number {
    return this.lineIndices(staged, hunkIndex).length;
  }

  lineIndices(staged: boolean, hunkIndex: number): number[] {
    return this.selectedLines()[this.key(staged, hunkIndex)] ?? [];
  }

  toggleLine(staged: boolean, hunkIndex: number, lineIndex: number): void {
    this.selectedLines.update((map) => {
      const key = this.key(staged, hunkIndex);
      const current = map[key] ?? [];
      const next = current.includes(lineIndex)
        ? current.filter((index) => index !== lineIndex)
        : [...current, lineIndex].sort((a, b) => a - b);
      return { ...map, [key]: next };
    });
  }

  onStageHunk(hunkIndex: number): void {
    const file = this.unstagedFile();
    if (!file || this.busy()) return;
    this.stageHunk.emit({
      path: file.path,
      hunkIndex,
      lineIndices: this.lineIndices(false, hunkIndex),
    });
  }

  onUnstageHunk(hunkIndex: number): void {
    const file = this.stagedFile();
    if (!file || this.busy()) return;
    this.unstageHunk.emit({
      path: file.path,
      hunkIndex,
      lineIndices: this.lineIndices(true, hunkIndex),
    });
  }

  onDiscardHunk(hunkIndex: number): void {
    const file = this.unstagedFile();
    if (!file || this.busy()) return;
    this.discardHunk.emit({
      path: file.path,
      hunkIndex,
      lineIndices: this.lineIndices(false, hunkIndex),
    });
  }

  onDiscardFile(path: string): void {
    if (this.busy()) return;
    if (!confirmFileDiscard(path)) return;
    this.discardFile.emit(path);
  }
}
