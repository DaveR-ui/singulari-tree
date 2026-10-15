import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { FileDiff } from '@contracts/domain';
import { ButtonComponent, SelectableRowDirective } from '@singularitree/ui-kit';

/** Preferred chip order: A, M, D, R first, then any other porcelain code alphabetically. */
const STATUS_ORDER = ['A', 'M', 'D', 'R'];

/**
 * Changed-file list of the commit/PR variants of the "File Status" screen
 * (ADR-0029). Dumb and presentational: it renders the per-file sections of the
 * diff and emits the path the user picked, which the page forwards to
 * `FileStatusStore.selectFile` so the right pane re-projects that single file.
 *
 * Above the heading sits a local, per-screen status filter: one toggle chip per
 * status present in the data, so the row never offers a status with zero files.
 * The store is never touched — the filter is view state the list owns; an empty
 * selection means "no filter", never "match nothing".
 *
 * A renamed file is addressed by its NEW path (`oldPath` is never shown as the
 * row identity, because that is the path the diff viewer addresses). Binary
 * files carry no hunks, so they render a `binary` marker instead of the
 * additions/deletions counts.
 */
@Component({
  selector: 'st-file-diff-list',
  standalone: true,
  imports: [ButtonComponent, SelectableRowDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="st-file-diff-list">
      @if (filterStatuses().length) {
        <div
          class="st-file-diff-list__filters"
          role="group"
          aria-label="Filter by status"
          i18n-aria-label
          data-testid="file-status-filters"
        >
          @for (status of filterStatuses(); track status) {
            <st-button
              class="st-file-diff-list__chip"
              variant="ghost"
              size="sm"
              data-testid="file-status-filter"
              [attr.data-status]="status"
              [pressed]="isActive(status)"
              [class.st-file-diff-list__chip--active]="isActive(status)"
              (click)="toggleStatus(status)"
            >
              <span class="st-file-diff-list__chip-letter" [attr.data-status]="status">{{
                status
              }}</span>
            </st-button>
          }
          @if (hasActiveFilters()) {
            <st-button
              class="st-file-diff-list__chip"
              variant="ghost"
              size="sm"
              data-testid="file-status-filters-clear"
              (click)="clearFilters()"
              i18n
            >
              Clear filters
            </st-button>
          }
        </div>
      }

      <h3 class="st-file-diff-list__heading st-eyebrow" i18n>Changed files</h3>

      @if (files().length === 0) {
        <p class="st-file-diff-list__empty" data-testid="file-list-empty" i18n>No changed files.</p>
      } @else if (filteredFiles().length === 0) {
        <p class="st-file-diff-list__empty" data-testid="file-list-filter-empty" i18n>
          No files match the selected filters.
        </p>
      } @else {
        <ul class="st-file-diff-list__list">
          @for (file of filteredFiles(); track file.path) {
            <li
              stSelectableRow
              class="st-file-diff-list__row"
              data-testid="file-diff-row"
              [selected]="file.path === selectedPath()"
              [attr.data-path]="file.path"
              [attr.data-selected]="file.path === selectedPath()"
              [class.st-file-diff-list__row--selected]="file.path === selectedPath()"
              (rowActivated)="fileSelect.emit(file.path)"
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
                <span class="st-file-diff-list__counts st-mono st-tabular-nums">
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
      color: var(--st-color-text);
    }

    .st-file-diff-list {
      display: flex;
      flex-direction: column;
      gap: var(--st-space-2);
      font-size: var(--st-font-12);
    }

    .st-file-diff-list__heading {
      margin: 0;
    }

    .st-file-diff-list__filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--st-space-1);
    }

    /* The ghost st-button inside stays transparent, so the host carries the
       pressed treatment — no reaching into the button's encapsulated styles. The
       accent outline marks the active chip without changing its geometry. */
    .st-file-diff-list__chip--active {
      border-radius: var(--st-radius-2);
      background: var(--st-color-selected);
      outline: var(--st-hairline) solid var(--st-color-accent);
    }

    /* The letter reuses the exact status colour mapping of the row badge. */
    .st-file-diff-list__chip-letter {
      font-family: var(--st-font-mono);
      text-transform: uppercase;
    }

    .st-file-diff-list__chip-letter[data-status='M'] {
      color: var(--st-color-warn);
    }

    .st-file-diff-list__chip-letter[data-status='A'] {
      color: var(--st-color-add);
    }

    .st-file-diff-list__chip-letter[data-status='D'] {
      color: var(--st-color-remove);
    }

    .st-file-diff-list__chip-letter[data-status='R'] {
      color: var(--st-color-accent);
    }

    /* The rule is a no-op for the current block host (:host is display: block),
       so its flex/min-height are inert and the page's
       .st-file-status__body { overflow: auto } does the scrolling. It only
       takes effect if the host ever becomes a flex column. */
    .st-file-diff-list__list {
      flex: 1 1 auto;
      min-height: 0;
      margin: 0;
      padding: 0;
      list-style: none;
      overflow: auto;
    }

    .st-file-diff-list__row {
      display: flex;
      align-items: center;
      gap: var(--st-space-2);
      padding: 2px 4px;
      border-radius: var(--st-radius-1);
    }

    .st-file-diff-list__row--selected {
      background: var(--st-color-selected);
      box-shadow: none;
    }

    .st-file-diff-list__badge {
      flex: 0 0 auto;
      min-width: 18px;
      padding: 0 4px;
      border: var(--st-hairline) solid var(--st-color-border);
      border-radius: var(--st-radius-1);
      font-family: var(--st-font-mono);
      font-size: 10px;
      text-align: center;
      text-transform: uppercase;
    }

    .st-file-diff-list__badge[data-status='M'] {
      color: var(--st-color-warn);
    }

    .st-file-diff-list__badge[data-status='A'] {
      color: var(--st-color-add);
    }

    .st-file-diff-list__badge[data-status='D'] {
      color: var(--st-color-remove);
    }

    .st-file-diff-list__badge[data-status='R'] {
      color: var(--st-color-accent);
    }

    .st-file-diff-list__path {
      flex: 1 1 auto;
      min-width: 0;
      word-break: break-all;
    }

    .st-file-diff-list__counts {
      flex: 0 0 auto;
      display: flex;
      gap: var(--st-space-2);
      font-size: 11px;
    }

    .st-file-diff-list__additions {
      color: var(--st-color-add);
    }

    .st-file-diff-list__deletions {
      color: var(--st-color-remove);
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

  /**
   * Statuses the user is currently including. Local view state: the owning page
   * and the store never see it. An empty set is "no filter", not "nothing".
   */
  private readonly activeStatuses = signal<ReadonlySet<string>>(new Set());

  /**
   * Distinct statuses present in `files()`, ordered A, M, D, R then the rest
   * alphabetically, so the filter row grows with the data and never offers a
   * status that has no files to show.
   */
  readonly filterStatuses = computed<string[]>(() => {
    const present = new Set(this.files().map((file) => file.status));
    return [...present].sort((a, b) => {
      const ai = STATUS_ORDER.indexOf(a);
      const bi = STATUS_ORDER.indexOf(b);
      if (ai !== -1 || bi !== -1) {
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
      return a.localeCompare(b);
    });
  });

  readonly hasActiveFilters = computed(() => this.activeStatuses().size > 0);

  /**
   * Rows actually rendered. An empty selection is the identity filter, so
   * clearing the last chip always restores every file rather than hiding all of
   * them.
   */
  readonly filteredFiles = computed<FileDiff[]>(() => {
    const active = this.activeStatuses();
    if (active.size === 0) return this.files();
    return this.files().filter((file) => active.has(file.status));
  });

  /** True when a chip represents a currently included status. */
  isActive(status: string): boolean {
    return this.activeStatuses().has(status);
  }

  /** Multi-select toggle: an off chip adds its status, an on chip removes it. */
  toggleStatus(status: string): void {
    this.activeStatuses.update((current) => {
      const next = new Set(current);
      // `delete` returns whether the status was present, so one call covers both
      // the "add" and the "remove" arm without a separate membership check.
      if (!next.delete(status)) next.add(status);
      return next;
    });
  }

  clearFilters(): void {
    this.activeStatuses.set(new Set());
  }
}
