import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthStatus, GitHubRepo } from '@contracts/auth';
import type { AppError } from '@core/services/ipc-bridge.service';
import { GithubAccountStore } from '@features/github-account/github-account.store';
import { LayoutComponent } from './layout';

@Component({
  selector: 'st-spec-stub-page',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class StubPageComponent {}

/**
 * The vitest jsdom environment exposes `window.localStorage` but does not copy
 * it onto `globalThis`, which the shell reads as a bare global. Install a small
 * in-memory implementation so persistence can be asserted deterministically.
 */
class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

function makeRepo(index: number): GitHubRepo {
  return {
    id: index,
    name: `repo-${index}`,
    fullName: `DaveR-ui/repo-${index}`,
    private: index % 2 === 0,
    htmlUrl: `https://github.com/DaveR-ui/repo-${index}`,
    description: `repo ${index}`,
    language: 'TypeScript',
    stargazersCount: 0,
    updatedAt: '2026-01-02T10:00:00Z',
    nodeId: `node-${index}`,
    defaultBranch: 'main',
    ownerLogin: 'DaveR-ui',
    ownerAvatarUrl: 'https://avatars.example/u',
    visibility: index % 2 === 0 ? 'private' : 'public',
    fork: false,
    archived: false,
    disabled: false,
    cloneUrl: `https://github.com/DaveR-ui/repo-${index}.git`,
    sshUrl: `git@github.com:DaveR-ui/repo-${index}.git`,
    gitUrl: `git://github.com/DaveR-ui/repo-${index}.git`,
    pushedAt: '2026-01-02T10:00:00Z',
    createdAt: '2025-01-02T10:00:00Z',
    forksCount: 0,
    openIssuesCount: 0,
    topics: [],
    licenseSpdxId: 'MIT',
    isTemplate: false,
    homepage: '',
  };
}

interface StubStoreOptions {
  authenticated?: boolean;
  repos?: GitHubRepo[];
}

function makeStore(opts: StubStoreOptions = {}) {
  const status = signal<AuthStatus | undefined>(undefined);
  const repos = signal<GitHubRepo[]>(opts.repos ?? []);
  const authenticated = signal(opts.authenticated ?? false);
  const offline = signal(false);
  const loading = signal(false);
  const error = signal<AppError | null>(null);

  return {
    status,
    repos,
    authenticated,
    offline,
    loading,
    error,
    pageInfo: signal(undefined),
    rateLimit: signal(undefined),
    hasMore: computed(() => false),
    refreshStatus: vi.fn(async () => {}),
    loadRepos: vi.fn(async () => {}),
    loadMore: vi.fn(async () => {}),
    connect: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
  };
}

async function setup(opts: StubStoreOptions = {}) {
  const store = makeStore(opts);
  await TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: '**', component: StubPageComponent }]),
      { provide: GithubAccountStore, useValue: store },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(LayoutComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, store };
}

function text(fixture: { nativeElement: unknown }): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function query<T extends Element>(fixture: { nativeElement: unknown }, testId: string): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${testId}"]`);
}

describe('LayoutComponent', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('renders no hardcoded mock data', async () => {
    const { fixture } = await setup({ authenticated: false, repos: [] });

    const rendered = text(fixture);
    for (const mock of [
      'DFCustomerPortal_SPA_AIR.X',
      'feature/layout-shell',
      'v0.1.0',
      'david',
      'origin/main',
    ]) {
      expect(rendered).not.toContain(mock);
    }
  });

  it('shows the not-connected empty state when unauthenticated', async () => {
    const { fixture } = await setup({ authenticated: false, repos: [] });

    expect(query(fixture, 'repo-drawer-empty')).not.toBeNull();
  });

  it('renders a repo card per repository when authenticated', async () => {
    const { fixture } = await setup({
      authenticated: true,
      repos: [makeRepo(1), makeRepo(2)],
    });

    expect(query(fixture, 'repo-drawer-list')).not.toBeNull();
    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="repo-card"]',
    );
    expect(cards.length).toBe(2);
  });

  it('persists the right-collapsed state to localStorage', async () => {
    const { fixture } = await setup({ authenticated: false, repos: [] });

    expect(localStorage.getItem('st:rightCollapsed')).toBe('false');

    fixture.componentInstance.toggleRight();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(localStorage.getItem('st:rightCollapsed')).toBe('true');
  });

  it('restores an in-range persisted right width', async () => {
    localStorage.setItem('st:rightWidth', '400');

    const { fixture } = await setup({ authenticated: false, repos: [] });

    expect(fixture.componentInstance.rightWidth()).toBe(400);
  });

  it('rejects an out-of-range persisted right width', async () => {
    localStorage.setItem('st:rightWidth', '9999');

    const { fixture } = await setup({ authenticated: false, repos: [] });

    expect(fixture.componentInstance.rightWidth()).toBe(320);
  });

  it('refreshes the account status on init and loads repos only when authenticated', async () => {
    const { store } = await setup({ authenticated: true, repos: [makeRepo(1)] });

    expect(store.refreshStatus).toHaveBeenCalledTimes(1);
    expect(store.loadRepos).toHaveBeenCalledTimes(1);
  });

  it('does not load repos on init when unauthenticated', async () => {
    const { store } = await setup({ authenticated: false, repos: [] });

    expect(store.refreshStatus).toHaveBeenCalledTimes(1);
    expect(store.loadRepos).not.toHaveBeenCalled();
  });

  it('controls the sidebar workspace selection through the parent signal', async () => {
    const { fixture } = await setup({ authenticated: false, repos: [] });
    const el = fixture.nativeElement as HTMLElement;

    const items = el.querySelectorAll<HTMLElement>('.st-left__item');
    expect(items.length).toBeGreaterThanOrEqual(3);
    items[2].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.activeWorkspace()).toBe('search');
    expect(items[2].classList.contains('st-left__item--active')).toBe(true);
  });
});
