import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import type { Repository } from '@contracts/domain';
import { IpcBridge, toAppError, type AppError } from '@core/services/ipc-bridge.service';
import { RepoState } from '@core/services/repo-state.service';
import { WorkspacesStore } from '@core/services/workspaces.store';

/**
 * Dedicated repository-list page: add, open and remove persisted repositories.
 *
 * Additive to the route-scoped graph: it owns no repository state itself and
 * delegates list/selection to the root `RepoState` plus the open/remove RPCs to
 * the `IpcBridge` (the renderer never talks to Git directly). Opening navigates
 * to `/repo` where the graph is provided.
 */
@Component({
  selector: 'st-repos-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="st-repos-page" data-testid="repos-page" aria-label="Repositories">
      <header class="st-repos-page__head">
        <h1 class="st-repos-page__title">Repositories</h1>
      </header>

      <div class="st-repos-page__add">
        <label class="st-repos-page__label" for="repos-add-input">Repository path</label>
        <input
          id="repos-add-input"
          type="text"
          class="st-repos-page__input"
          placeholder="/path/to/repository"
          aria-label="Repository filesystem path"
          data-testid="repos-add-input"
          [value]="path()"
          (input)="onInput($event)"
          (keydown.enter)="add()"
        />
        <button
          type="button"
          class="st-repos-page__button"
          data-testid="repos-browse"
          [disabled]="browsing()"
          (click)="browse()"
        >
          Browse…
        </button>
        <button
          type="button"
          class="st-repos-page__button"
          data-testid="repos-add"
          [disabled]="!path().trim() || adding()"
          (click)="add()"
        >
          Add repository
        </button>
      </div>

      @if (repoState.reposLoading() && repoState.repos().length === 0) {
        <p class="st-repos-page__status" data-testid="repos-loading">Loading repositories…</p>
      } @else if (error(); as err) {
        <p class="st-repos-page__error" data-testid="repos-error">{{ err.message }}</p>
      } @else if (offline()) {
        <p class="st-repos-page__status" data-testid="repos-offline">
          Git core offline — manage repositories inside the desktop app.
        </p>
      } @else if (repoState.repos().length === 0) {
        <p class="st-repos-page__empty" data-testid="repos-empty">
          No repositories yet. Add one to get started.
        </p>
      } @else {
        <ul class="st-repos-page__list">
          @for (repo of repoState.repos(); track repo.id) {
            <li class="st-repos-page__row" data-testid="repos-row">
              <span class="st-repos-page__name">{{ repo.name }}</span>
              <span class="st-repos-page__path">{{ repo.fsPath }}</span>
              <button
                type="button"
                class="st-repos-page__action"
                data-testid="repos-open"
                (click)="open(repo)"
              >
                Open
              </button>
              <button
                type="button"
                class="st-repos-page__action st-repos-page__action--danger"
                data-testid="repos-remove"
                [disabled]="isRemoving(repo.id)"
                (click)="remove(repo.id)"
              >
                Remove
              </button>
            </li>
          }
        </ul>
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

    .st-repos-page {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px 16px;
    }

    .st-repos-page__head {
      display: flex;
      align-items: center;
    }

    .st-repos-page__title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }

    .st-repos-page__add {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .st-repos-page__label {
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }

    .st-repos-page__input {
      flex: 1 1 auto;
      min-width: 120px;
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid var(--st-color-border, #2f2f44);
      background: var(--st-color-surface, #252536);
      color: inherit;
      font-size: 12px;
    }

    .st-repos-page__button {
      padding: 4px 12px;
      border-radius: 4px;
      border: 1px solid var(--st-color-border, #2f2f44);
      background: var(--st-color-surface, #252536);
      color: inherit;
      font-size: 12px;
      cursor: pointer;
    }

    .st-repos-page__button:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .st-repos-page__list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .st-repos-page__row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border: 1px solid var(--st-color-border, #2f2f44);
      border-radius: 6px;
      background: var(--st-color-surface, #252536);
    }

    .st-repos-page__name {
      font-size: 13px;
      font-weight: 600;
    }

    .st-repos-page__path {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
      opacity: 0.6;
    }

    .st-repos-page__action {
      padding: 3px 10px;
      border-radius: 4px;
      border: 1px solid var(--st-color-border, #2f2f44);
      background: transparent;
      color: inherit;
      font-size: 12px;
      cursor: pointer;
    }

    .st-repos-page__action--danger {
      color: #ff6b6b;
    }

    .st-repos-page__action:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .st-repos-page__status,
    .st-repos-page__empty {
      margin: 0;
      font-size: 12px;
      opacity: 0.6;
    }

    .st-repos-page__error {
      margin: 0;
      font-size: 12px;
      color: #ff6b6b;
    }
  `,
})
export class ReposPage implements OnInit {
  readonly repoState = inject(RepoState);
  private readonly workspaces = inject(WorkspacesStore);
  private readonly bridge = inject(IpcBridge);
  private readonly router = inject(Router);

  /** Path typed by the user; trimmed before opening. */
  readonly path = signal('');
  /** True while an `openRepository` add is in flight. */
  readonly adding = signal(false);
  /** True while the native folder dialog is open. */
  readonly browsing = signal(false);
  /** Last add failure (non-offline). */
  readonly addError = signal<AppError | null>(null);
  /** True when add failed because the Electron bridge is absent. */
  readonly addOffline = signal(false);
  /** Last Browse failure (non-IPC). */
  readonly browseError = signal<AppError | null>(null);

  /** A local add/browse error takes precedence over the list-load error. */
  readonly error = computed<AppError | null>(
    () => this.addError() ?? this.browseError() ?? this.repoState.reposError(),
  );
  /** The page is offline when either the list or the last add could not reach the core. */
  readonly offline = computed(() => this.repoState.reposOffline() || this.addOffline());

  ngOnInit(): void {
    // Refresh the persisted list so the page is self-sufficient when deep-linked.
    void this.repoState.loadRepositories();
  }

  onInput(event: Event): void {
    this.path.set((event.target as HTMLInputElement).value);
  }

  /**
   * Open the native folder picker and adopt the chosen path (enables Add).
   *
   * Degrades gracefully when the bridge is absent or the dialog fails: the
   * typed state is left untouched. `IPC_UNAVAILABLE` is silent (matching the
   * toolbar's offline behavior); any other failure is surfaced as a
   * non-fatal error while keeping the typed state unchanged.
   */
  async browse(): Promise<void> {
    if (this.browsing()) return;
    this.browsing.set(true);
    this.browseError.set(null);
    try {
      const res = await this.bridge.invoke('chooseDirectory', {});
      if (!res.canceled && res.path) this.path.set(res.path);
    } catch (err) {
      const appError = toAppError(err);
      if (appError.code !== 'IPC_UNAVAILABLE') {
        this.browseError.set(appError);
      }
    } finally {
      this.browsing.set(false);
    }
  }

  /** True while `id` is being removed (drives the per-row disabled state). */
  isRemoving(id: string): boolean {
    return this.repoState.removingId() === id;
  }

  /** Register `repo` as a tab, activate it and route to the graph page. */
  open(repo: Repository): void {
    this.workspaces.openTab(repo);
    this.repoState.setActive(repo);
    void this.router.navigate(['/repo']);
  }

  /** Open the typed path, register it as a tab, activate it and route to the graph. */
  async add(): Promise<void> {
    const fsPath = this.path().trim();
    if (!fsPath) return;

    this.addError.set(null);
    this.addOffline.set(false);
    this.adding.set(true);
    try {
      const repo = await this.bridge.invoke('openRepository', { fsPath });
      this.workspaces.openTab(repo);
      this.repoState.setActive(repo);
      void this.router.navigate(['/repo']);
    } catch (err) {
      const appError = toAppError(err);
      if (appError.code === 'IPC_UNAVAILABLE') {
        this.addOffline.set(true);
      } else {
        this.addError.set(appError);
      }
    } finally {
      this.adding.set(false);
    }
  }

  /** Remove a repository; the page stays open even when the active one is removed. */
  async remove(id: string): Promise<void> {
    await this.repoState.removeRepository(id);
  }
}
