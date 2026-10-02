import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  EmptyStateComponent,
  RepoCardComponent,
  type RepoCardView,
} from '@singularitree/ui-kit';
import type { AppError } from '@core/services/ipc-bridge.service';

/**
 * Dumb right drawer: local repository list with search, a close control and a
 * resize handle. Data is supplied by the shell from the LOCAL `RepoState`; the
 * component only filters locally and emits selection / add intents.
 */
@Component({
  selector: 'st-repo-drawer',
  standalone: true,
  imports: [RepoCardComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'st-right',
    'data-testid': 'repo-drawer',
    '[class.st-right--collapsed]': 'collapsed()',
    '[class.st-right--overlay]': 'overlay()',
    '[style.width.px]': 'width()',
    '[attr.aria-hidden]': "collapsed() && !overlay() ? 'true' : null",
  },
  template: `
    @if (!collapsed() || overlay()) {
      <div class="st-right__resize" (mousedown)="resizeStart.emit($event)" title="Drag to resize"></div>
    }
    <div class="st-right__head">
      <span class="st-right__title">Local repositories</span>
      <span class="st-right__spacer"></span>
      <button
        class="st-icon-btn st-icon-btn--sm"
        type="button"
        (click)="toggleRight.emit()"
        title="Close"
      >
        ✕
      </button>
    </div>
    <div class="st-right__search">
      <input
        class="st-search st-search--full"
        type="search"
        data-testid="repo-drawer-search"
        placeholder="Search repositories…"
        [value]="search()"
        (input)="onSearch($event)"
      />
    </div>
    <div class="st-right__list">
      @if (loading() && repos().length === 0) {
        <st-empty-state title="Loading repositories…" data-testid="repo-drawer-loading" />
      } @else if (error(); as err) {
        <st-empty-state
          tone="error"
          [message]="err.message"
          data-testid="repo-drawer-error"
        />
      } @else if (offline()) {
        <st-empty-state
          icon="🔌"
          title="Desktop app required"
          message="Git core offline — run inside the desktop app."
          data-testid="repo-drawer-offline"
        />
      } @else if (filteredRepos().length === 0) {
        @if (search().trim() === '') {
          <st-empty-state
            icon="📭"
            title="No repositories"
            message="No local repositories yet. Add one to get started."
            data-testid="repo-drawer-no-repos"
          />
        } @else {
          <st-empty-state title="No matches" data-testid="repo-drawer-no-matches" />
        }
      } @else {
        <div data-testid="repo-drawer-list">
          @for (repo of filteredRepos(); track repo.id) {
            <st-repo-card
              [repo]="repo"
              [selected]="selectedId() === repo.id"
              (picked)="select(repo.id)"
            />
          }
        </div>
      }
      <button class="st-right__add" type="button" (click)="addRequested.emit()">
        + Add repository
      </button>
    </div>
  `,
  styles: `
    :host {
      width: var(--right-w, 320px);
      min-width: 0;
      background: var(--st-color-surface, #252536);
      border-left: 1px solid var(--st-color-border, #2f2f44);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition:
        transform 200ms ease,
        width 200ms ease,
        opacity 200ms ease;
      position: relative;
      color: var(--st-color-text, #d6d6de);
    }

    :host(.st-right--collapsed):not(.st-right--overlay) {
      width: 0;
      min-width: 0;
      opacity: 0;
      pointer-events: none;
      border-left: none;
    }

    :host(.st-right--overlay) {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      z-index: 20;
      box-shadow: -12px 0 32px rgba(0, 0, 0, 0.5);
    }

    :host(.st-right--overlay.st-right--collapsed) {
      transform: translateX(100%);
      opacity: 0;
      pointer-events: none;
    }

    .st-right__resize {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 6px;
      cursor: col-resize;
      z-index: 2;
    }

    .st-right__resize:hover {
      background: var(--accent-soft, rgba(10, 132, 255, 0.15));
    }

    .st-right__head {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 10px 8px 14px;
      border-bottom: 1px solid var(--st-color-border, #2f2f44);
      background: #23233a;
      flex-shrink: 0;
    }

    .st-right__title {
      font-weight: 700;
      font-size: 12px;
      letter-spacing: 0.3px;
    }

    .st-right__spacer {
      flex: 1;
    }

    .st-right__search {
      padding: 8px 10px;
      border-bottom: 1px solid var(--st-color-border, #2f2f44);
    }

    .st-search {
      background: #1a1a2a;
      border: 1px solid var(--st-color-border, #2f2f44);
      color: var(--st-color-text, #d6d6de);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 12px;
      outline: none;
    }

    .st-search:focus {
      border-color: var(--st-color-accent, #0a84ff);
    }

    .st-search--full {
      width: 100%;
    }

    .st-right__list {
      flex: 1;
      overflow: auto;
      padding: 6px 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .st-right__list st-repo-card {
      margin: 0 8px;
    }

    .st-right__add {
      margin: 8px 10px;
      background: transparent;
      border: 1px dashed var(--st-color-border, #2f2f44);
      color: var(--muted, #8a8a9a);
      border-radius: 6px;
      padding: 8px;
      width: calc(100% - 20px);
      cursor: pointer;
    }

    .st-right__add:hover {
      color: var(--st-color-text, #d6d6de);
      border-color: var(--muted, #8a8a9a);
    }

    .st-icon-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--muted, #8a8a9a);
      border-radius: 6px;
      cursor: pointer;
      padding: 4px 7px;
      line-height: 1;
    }

    .st-icon-btn:hover {
      color: var(--st-color-text, #d6d6de);
      background: rgba(255, 255, 255, 0.07);
      border-color: var(--st-color-border, #2f2f44);
    }

    .st-icon-btn--sm {
      padding: 3px 6px;
      font-size: 12px;
    }
  `,
})
export class RepoDrawer {
  readonly repos = input<readonly RepoCardView[]>([]);
  readonly collapsed = input(false);
  readonly overlay = input(false);
  readonly width = input<number | null>(null);
  readonly loading = input(false);
  readonly offline = input(false);
  readonly error = input<AppError | null>(null);
  /** Controlled by the parent; this component never mutates the highlight locally. */
  readonly selectedId = input<string | null>(null);

  readonly toggleRight = output<void>();
  readonly resizeStart = output<MouseEvent>();
  readonly repoSelected = output<string>();
  readonly addRequested = output<void>();

  readonly search = signal('');

  readonly filteredRepos = computed<readonly RepoCardView[]>(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.repos();
    return this.repos().filter(
      (repo) =>
        repo.name.toLowerCase().includes(term) ||
        (repo.subtitle ?? '').toLowerCase().includes(term),
    );
  });

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  select(id: string): void {
    this.repoSelected.emit(id);
  }
}
