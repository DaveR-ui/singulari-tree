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
import { EmptyStateComponent, InputComponent, SelectableRowDirective } from '@singularitree/ui-kit';
import { CommitSearchStore } from '../commit-search.store';

/**
 * Cross-repo commit search workspace (ADR-026).
 *
 * Renders a debounced search box plus results grouped by repository. The query
 * is scoped to the open tabs' repositories (ADR-024): search never invents a
 * core "workspace" entity and the core still owns the query itself. Activating a
 * hit emits `hitSelected`; the shell switches tab/repo and focuses the commit.
 *
 * Presentation follows the P5 language (plan §4.10): the search box is the
 * shared `st-input`, repo group headings are `.st-eyebrow`, hits ride the shared
 * `[stSelectableRow]` treatment (click, Enter and Space all activate), and the
 * four states are `st-empty-state`. It stays an in-shell workspace, not a route.
 */
@Component({
  selector: 'st-search-workspace',
  standalone: true,
  imports: [EmptyStateComponent, InputComponent, SelectableRowDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="st-search" data-testid="search-workspace">
      <header class="st-search__head">
        <h2 class="st-search__title" i18n>Search commits</h2>
        <st-input
          type="search"
          class="st-search__input"
          [testId]="'search-input'"
          [placeholder]="searchPlaceholder"
          [ariaLabel]="searchAriaLabel"
          [value]="store.query()"
          (valueChange)="onInput($event)"
          (keydown.enter)="onSubmit($event)"
        />
        @if (store.loading()) {
          <span class="st-search__status" data-testid="search-loading" i18n>Searching…</span>
        }
      </header>

      @if (repoIds().length === 0) {
        <st-empty-state
          data-testid="search-no-repos"
          tone="muted"
          message="Open a repository to search its commits."
          i18n-message
        />
      } @else if (store.offline()) {
        <st-empty-state
          data-testid="search-offline"
          tone="muted"
          message="Git core offline — search needs the desktop app."
          i18n-message
        />
      } @else if (store.error(); as err) {
        <st-empty-state data-testid="search-error" tone="error" [message]="err.message" />
      } @else if (store.hasSearched() && store.hits().length === 0 && !store.loading()) {
        <st-empty-state
          data-testid="search-empty"
          tone="muted"
          message="No commits match your search."
          i18n-message
        />
      } @else {
        @for (group of store.groups(); track group.repoId) {
          <div class="st-search__group" data-testid="search-group">
            <h3 class="st-search__repo st-eyebrow">{{ group.repoName }}</h3>
            <ul class="st-search__list">
              @for (hit of group.hits; track hit.repoId + ':' + hit.oid) {
                <li>
                  <button
                    type="button"
                    stSelectableRow
                    class="st-search__hit"
                    data-testid="search-hit"
                    [title]="hit.oid"
                    (rowActivated)="hitSelected.emit(hit)"
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
      color: var(--st-color-text);
    }

    .st-search {
      display: flex;
      flex-direction: column;
      gap: var(--st-space-2);
      padding: var(--st-space-2) var(--st-space-3);
    }

    .st-search__head {
      display: flex;
      align-items: center;
      gap: var(--st-space-2);
    }

    .st-search__title {
      margin: 0;
      font-size: var(--st-font-13);
      font-weight: 600;
      white-space: nowrap;
    }

    .st-search__head st-input {
      flex: 1 1 auto;
      min-width: 120px;
    }

    .st-search__status {
      font-size: var(--st-font-12);
      color: var(--st-color-muted);
    }

    .st-search__group {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .st-search__repo {
      margin: var(--st-space-1) 0 0;
    }

    .st-search__list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    /* Geometry only — the shared [stSelectableRow] treatment owns the hover
       wash, selection fill and focus ring; the transparent background keeps the
       native button from painting its default face over the row. */
    .st-search__hit {
      display: flex;
      align-items: baseline;
      gap: var(--st-space-2);
      width: 100%;
      padding: var(--st-space-1) var(--st-space-2);
      border: 0;
      border-radius: var(--st-radius-2);
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
    }

    .st-search__oid {
      flex: none;
      font-family: var(--st-font-mono);
      font-size: var(--st-font-11);
      color: var(--st-color-accent);
    }

    .st-search__msg {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--st-font-12);
    }

    .st-search__meta {
      flex: none;
      font-size: var(--st-font-11);
      color: var(--st-color-muted);
    }
  `,
})
export class SearchWorkspace implements OnDestroy {
  readonly store = inject(CommitSearchStore);
  private readonly workspaces = inject(WorkspacesStore);

  /** Emitted when the user picks a result; the shell owns navigation. */
  readonly hitSelected = output<CommitSearchHit>();

  readonly searchPlaceholder = $localize`Search commits across open repositories`;
  readonly searchAriaLabel = $localize`Search commits`;

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

  /** Template entry point for the `st-input` primitive's `valueChange` output. */
  onInput(value: string): void {
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
