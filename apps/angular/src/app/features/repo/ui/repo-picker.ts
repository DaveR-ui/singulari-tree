import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RepoState } from '@core/services/repo-state.service';
import { GraphStore } from '../graph/graph.store';

/**
 * Repository picker: a filesystem-path input plus a recent-repositories list.
 *
 * Presentation-light wrapper over `GraphStore`: it owns only the typed path and
 * delegates every IPC action to the store, so the graph below renders as soon as
 * a repo is opened. On init it asks the store for the recents.
 */
@Component({
  selector: 'st-repo-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="st-repo-picker" aria-label="Repository picker">
      <div class="st-repo-picker__row">
        <label class="st-repo-picker__label" for="repo-path-input">Repository path</label>
        <input
          id="repo-path-input"
          type="text"
          class="st-repo-picker__input"
          placeholder="/path/to/repository"
          aria-label="Repository filesystem path"
          data-testid="repo-path-input"
          [value]="path()"
          (input)="onInput($event)"
          (keydown.enter)="open()"
        />
        <button
          type="button"
          class="st-repo-picker__open"
          data-testid="repo-open"
          [disabled]="!path().trim()"
          (click)="open()"
        >
          Open
        </button>
      </div>

      @if (store.error(); as error) {
        <p class="st-repo-picker__error" data-testid="repo-picker-error">{{ error.message }}</p>
      }
      @if (store.offline()) {
        <p class="st-repo-picker__status" data-testid="repo-picker-offline">
          Git core offline — open a repository inside the desktop app.
        </p>
      }

      <div class="st-repo-picker__recents">
        <h2 class="st-repo-picker__recents-title">Recent repositories</h2>
        @if (store.recentRepos().length === 0) {
          <p class="st-repo-picker__empty" data-testid="repo-recent-empty">
            No recent repositories yet.
          </p>
        } @else {
          <ul class="st-repo-picker__list" data-testid="repo-recent">
            @for (repo of store.recentRepos(); track repo.id) {
              <li>
                <button
                  type="button"
                  class="st-repo-picker__recent"
                  data-testid="repo-recent-item"
                  [title]="repo.fsPath"
                  (click)="openPath(repo.fsPath)"
                >
                  {{ repo.name }}
                </button>
              </li>
            }
          </ul>
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      color: var(--st-color-text, #d6d6de);
    }

    .st-repo-picker {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--st-color-border, #2f2f44);
    }

    .st-repo-picker__row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .st-repo-picker__label {
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }

    .st-repo-picker__input {
      flex: 1 1 auto;
      min-width: 120px;
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid var(--st-color-border, #2f2f44);
      background: var(--st-color-surface, #252536);
      color: inherit;
      font-size: 12px;
    }

    .st-repo-picker__open {
      padding: 4px 12px;
      border-radius: 4px;
      border: 1px solid var(--st-color-border, #2f2f44);
      background: var(--st-color-surface, #252536);
      color: inherit;
      font-size: 12px;
      cursor: pointer;
    }

    .st-repo-picker__open:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .st-repo-picker__recents-title {
      margin: 0;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      opacity: 0.6;
    }

    .st-repo-picker__list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .st-repo-picker__recent {
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid var(--st-color-border, #2f2f44);
      background: var(--st-color-surface, #252536);
      color: inherit;
      font-size: 12px;
      cursor: pointer;
    }

    .st-repo-picker__empty,
    .st-repo-picker__status {
      margin: 0;
      font-size: 12px;
      opacity: 0.6;
    }

    .st-repo-picker__error {
      margin: 0;
      font-size: 12px;
      color: #ff6b6b;
    }
  `,
})
export class RepoPicker {
  readonly store = inject(GraphStore);
  readonly repoState = inject(RepoState);

  /** Path typed by the user; trimmed before opening. */
  readonly path = signal('');

  constructor() {
    void this.store.loadRecentRepos();
  }

  onInput(event: Event): void {
    this.path.set((event.target as HTMLInputElement).value);
  }

  /** Open the currently typed path (no-op for empty/whitespace). */
  async open(): Promise<void> {
    const value = this.path().trim();
    if (!value) return;
    const repo = await this.store.openRepository(value);
    if (repo) this.repoState.setActive(repo);
  }

  /** Open a repository picked from the recents list. */
  openPath(fsPath: string): void {
    void this.store.openRepository(fsPath).then((repo) => {
      if (repo) this.repoState.setActive(repo);
    });
  }
}
