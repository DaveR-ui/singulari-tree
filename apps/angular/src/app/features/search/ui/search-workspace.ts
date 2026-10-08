import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  output,
} from '@angular/core';
import type { CommitSearchHit } from '@contracts/gitcore';
import { WorkspacesStore } from '@core/services/workspaces.store';
import { CommitSearchStore } from '../commit-search.store';

/**
 * Cross-repo commit search workspace (ADR-026).
 *
 * Renders a debounced search box plus results grouped by repository. The query
 * is scoped to the open tabs' repositories (ADR-024): search never invents a
 * core "workspace" entity and the core still owns the query itself. Clicking a
 * hit emits `hitSelected`; the shell switches tab/repo and focuses the commit.
 */
@Component({
  selector: 'st-search-workspace',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="st-search" data-testid="search-workspace">
      <header class="st-search__head">
        <h2 class="st-search__title" i18n>Search commits</h2>
        <input
          type="search"
          class="st-search__input"
          data-testid="search-input"
          placeholder="Search commits across open repositories"
          aria-label="Search commits"
          i18n-placeholder
          i18n-aria-label
          [value]="store.query()"
          (input)="onInput($event)"
          (keydown.enter)="onSubmit($event)"
        />
        @if (store.loading()) {
          <span class="st-search__status" data-testid="search-loading" i18n>Searching…</span>
        }
      </header>

      @if (repoIds().length === 0) {
        <p class="st-search__empty" data-testid="search-no-repos" i18n>
          Open a repository to search its commits.
        </p>
      } @else if (store.offline()) {
        <p class="st-search__empty" data-testid="search-offline" i18n>
          Git core offline — search needs the desktop app.
        </p>
      } @else if (store.error(); as err) {
        <p class="st-search__error" data-testid="search-error">{{ err.message }}</p>
      } @else if (store.hasSearched() && store.hits().length === 0 && !store.loading()) {
        <p class="st-search__empty" data-testid="search-empty" i18n>No commits match your search.</p>
      } @else {
        @for (group of store.groups(); track group.repoId) {
          <div class="st-search__group" data-testid="search-group">
            <h3 class="st-search__repo">{{ group.repoName }}</h3>
            <ul class="st-search__list">
              @for (hit of group.hits; track hit.repoId + ':' + hit.oid) {
                <li>
                  <button
                    type="button"
                    class="st-search__hit"
                    data-testid="search-hit"
                    [title]="hit.oid"
                    (click)="hitSelected.emit(hit)"
                  >
                    <span class="st-search__oid">{{ shortOid(hit.oid) }}</span>
                    <span class="st-search__msg">{{ firstLine(hit.message) }}</span>
                    <span class="st-search__meta">{{ hit.authorName }}</span>
                  </button>
                </li>
              }
            </ul>
          </div>
        }
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      min-height: 0;
      overflow: auto;
      color: var(--st-color-text, #d6d6de);
    }

    .st-search {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px 12px;
    }

    .st-search__head {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .st-search__title {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
    }

    .st-search__input {
      flex: 1 1 auto;
      min-width: 120px;
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid var(--st-color-border, #2f2f44);
      background: var(--st-color-surface, #252536);
      color: inherit;
      font-size: 12px;
    }

    .st-search__status,
    .st-search__empty {
      margin: 0;
      font-size: 12px;
      opacity: 0.6;
    }

    .st-search__error {
      margin: 0;
      font-size: 12px;
      color: #ff6b6b;
    }

    .st-search__group {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .st-search__repo {
      margin: 4px 0 2px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      opacity: 0.6;
    }

    .st-search__list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .st-search__hit {
      display: flex;
      align-items: baseline;
      gap: 8px;
      width: 100%;
      padding: 4px 6px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .st-search__hit:hover,
    .st-search__hit:focus-visible {
      background: color-mix(in srgb, var(--st-color-accent, #0a84ff) 18%, transparent);
      outline: none;
    }

    .st-search__oid {
      flex: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      color: var(--st-color-accent, #0a84ff);
    }

    .st-search__msg {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12.5px;
    }

    .st-search__meta {
      flex: none;
      font-size: 11px;
      opacity: 0.6;
    }
  `,
})
export class SearchWorkspace implements OnDestroy {
  readonly store = inject(CommitSearchStore);
  private readonly workspaces = inject(WorkspacesStore);

  /** Emitted when the user picks a result; the shell owns navigation. */
  readonly hitSelected = output<CommitSearchHit>();

  /** Debounce for the search box (mutable so tests can shorten it). */
  debounceMs = 300;

  private timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Repository ids the search is scoped to: the open tabs (ADR-024). Documented
   * choice — cross-repo search covers exactly the repositories the user has open.
   */
  readonly repoIds = computed(() => this.workspaces.tabs().map((tab) => tab.repoId));

  ngOnDestroy(): void {
    this.clearTimer();
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.store.search(value, this.repoIds());
    }, this.debounceMs);
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    this.clearTimer();
    const value = (event.target as HTMLInputElement).value;
    void this.store.search(value, this.repoIds());
  }

  /** Short (7-char) oid for the result row. */
  shortOid(oid: string): string {
    return oid.slice(0, 7);
  }

  /** First line of a commit message (the subject). */
  firstLine(message: string): string {
    return message.split('\n', 1)[0] ?? '';
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
