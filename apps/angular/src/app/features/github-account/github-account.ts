import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import type { AuthSource, GitHubRepo } from '@contracts/auth';
import { GithubAccountStore } from './github-account.store';

/** Human label for the token source (never shown when unauthenticated). */
const SOURCE_LABELS: Record<AuthSource, string> = {
  0: 'unknown',
  1: 'none',
  2: 'gh CLI',
  3: 'OAuth',
  [-1]: 'unknown',
};

/**
 * GitHub account feature page. Account linking + repository listing are served
 * entirely through `GithubAccountStore` (`auth:*` IPC); this component never
 * talks to GitHub.
 */
@Component({
  selector: 'st-github-account',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="st-gh-account">
      <header class="st-gh-account__header">
        <h1 class="st-gh-account__title">GitHub account</h1>
        <button
          type="button"
          class="st-gh-account__button"
          data-testid="gh-connect"
          [disabled]="store.loading()"
          (click)="connect()"
        >
          {{ store.authenticated() ? 'Reconnect' : 'Connect GitHub' }}
        </button>
        @if (store.authenticated()) {
          <button
            type="button"
            class="st-gh-account__button st-gh-account__button--ghost"
            data-testid="gh-logout"
            [disabled]="store.loading()"
            (click)="logout()"
          >
            Logout
          </button>
        }
        @if (store.loading()) {
          <span class="st-gh-account__status" data-testid="gh-loading">Loading…</span>
        }
        @if (store.offline()) {
          <span class="st-gh-account__status" data-testid="gh-offline">
            GitHub core offline — run inside the desktop app.
          </span>
        }
      </header>

      @if (store.error(); as error) {
        <p class="st-gh-account__error" data-testid="gh-error">{{ error.message }}</p>
      }

      @if (store.status(); as status) {
        <div class="st-gh-account__profile" data-testid="gh-profile">
          @if (status.avatarUrl) {
            <img class="st-gh-account__avatar" [src]="status.avatarUrl" [alt]="status.accountLogin" />
          }
          <div class="st-gh-account__identity">
            <p class="st-gh-account__login">
              {{ status.accountLogin || 'Not connected' }}
              <span class="st-gh-account__badge">{{ sourceLabel(status.source) }}</span>
            </p>
            @if (status.name) {
              <p class="st-gh-account__name">{{ status.name }}</p>
            }
            <p class="st-gh-account__email" data-testid="gh-email">
              {{ status.email || 'no disponible' }}
            </p>
          </div>
        </div>
      }

      @if (rateLimit(); as limit) {
        <p class="st-gh-account__rate" data-testid="gh-rate-limit">
          Rate limit ({{ limit.resource || 'core' }}): {{ limit.remaining }}/{{
            limit.limit
          }}
        </p>
      }

      <h2 class="st-gh-account__subtitle">Repositories</h2>
      @if (store.repos().length === 0) {
        <p class="st-gh-account__status" data-testid="gh-repos-empty">
          No repositories loaded.
        </p>
      } @else {
        <ul class="st-gh-account__repos" data-testid="gh-repos">
          @for (repo of store.repos(); track repo.id) {
            <li class="st-gh-account__repo">
              <span class="st-gh-account__repo-name">{{ repo.fullName || repo.name }}</span>
              <span class="st-gh-account__badge">{{ visibilityOf(repo) }}</span>
              @if (repo.language) {
                <span class="st-gh-account__lang">{{ repo.language }}</span>
              }
            </li>
          }
        </ul>

        @if (store.hasMore()) {
          <button
            type="button"
            class="st-gh-account__button"
            data-testid="gh-load-more"
            [disabled]="store.loading()"
            (click)="loadMore()"
          >
            Load more
          </button>
        }
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      padding: 16px;
      color: var(--st-color-text, #d6d6de);
    }

    .st-gh-account__header {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .st-gh-account__title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .st-gh-account__subtitle {
      margin: 18px 0 8px;
      font-size: 14px;
      font-weight: 600;
    }

    .st-gh-account__button {
      padding: 4px 12px;
      border-radius: 4px;
      border: 1px solid var(--st-color-border, #2f2f44);
      background: var(--st-color-surface, #252536);
      color: inherit;
      font-size: 12px;
      cursor: pointer;
    }

    .st-gh-account__button:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .st-gh-account__button--ghost {
      background: transparent;
    }

    .st-gh-account__status {
      font-size: 12px;
      opacity: 0.6;
    }

    .st-gh-account__error {
      margin: 8px 0 0;
      font-size: 12px;
      color: #ff6b6b;
    }

    .st-gh-account__profile {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 14px;
    }

    .st-gh-account__avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
    }

    .st-gh-account__identity p {
      margin: 0;
    }

    .st-gh-account__login {
      font-weight: 600;
    }

    .st-gh-account__name,
    .st-gh-account__email {
      font-size: 12px;
      opacity: 0.8;
    }

    .st-gh-account__rate {
      margin: 10px 0 0;
      font-size: 12px;
      opacity: 0.7;
    }

    .st-gh-account__repos {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-width: 640px;
    }

    .st-gh-account__repo {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border: 1px solid var(--st-color-border, #2f2f44);
      border-radius: 4px;
    }

    .st-gh-account__repo-name {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
    }

    .st-gh-account__badge {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 1px 6px;
      border-radius: 8px;
      background: var(--st-color-surface, #252536);
      opacity: 0.8;
    }

    .st-gh-account__lang {
      font-size: 11px;
      opacity: 0.7;
    }
  `,
})
export class GithubAccount implements OnInit {
  readonly store = inject(GithubAccountStore);

  /** Prefer the list-response rate limit, fall back to the one on the status. */
  readonly rateLimit = computed(() => this.store.rateLimit() ?? this.store.status()?.rateLimit);

  async ngOnInit(): Promise<void> {
    await this.store.refreshStatus();
    if (this.store.authenticated()) {
      await this.store.loadRepos();
    }
  }

  async connect(): Promise<void> {
    await this.store.connect();
    if (this.store.authenticated()) {
      await this.store.loadRepos();
    }
  }

  async loadMore(): Promise<void> {
    await this.store.loadMore();
  }

  async logout(): Promise<void> {
    await this.store.logout();
  }

  sourceLabel(source: AuthSource): string {
    return SOURCE_LABELS[source] ?? 'unknown';
  }

  visibilityOf(repo: GitHubRepo): string {
    return repo.visibility || (repo.private ? 'private' : 'public');
  }
}
