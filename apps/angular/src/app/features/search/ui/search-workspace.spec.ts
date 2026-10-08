import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CommitSearchHit } from '@contracts/gitcore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppError } from '@core/services/ipc-bridge.service';
import { WorkspacesStore, type RepoTab } from '@core/services/workspaces.store';
import { CommitSearchStore, type SearchHitGroup } from '../commit-search.store';
import { SearchWorkspace } from './search-workspace';

function hit(overrides: Partial<CommitSearchHit> & { repoId: string; oid: string }): CommitSearchHit {
  return {
    repoId: overrides.repoId,
    oid: overrides.oid,
    message: overrides.message ?? 'fix the thing',
    authorName: overrides.authorName ?? 'Ada',
    authorEmail: overrides.authorEmail ?? 'ada@example.com',
    committedAt: overrides.committedAt ?? 1_700_000_000,
  };
}

interface StoreOptions {
  query?: string;
  loading?: boolean;
  offline?: boolean;
  error?: AppError | null;
  hasSearched?: boolean;
  hits?: CommitSearchHit[];
  groups?: SearchHitGroup[];
}

function makeStoreStub(opts: StoreOptions = {}) {
  return {
    query: signal(opts.query ?? ''),
    loading: signal(opts.loading ?? false),
    offline: signal(opts.offline ?? false),
    error: signal<AppError | null>(opts.error ?? null),
    hasSearched: signal(opts.hasSearched ?? false),
    hits: signal<CommitSearchHit[]>(opts.hits ?? []),
    groups: signal<SearchHitGroup[]>(opts.groups ?? []),
    search: vi.fn(async () => {}),
    clear: vi.fn(),
  };
}

function makeWorkspaces(tabs: RepoTab[] = []) {
  return { tabs: signal<RepoTab[]>(tabs) } as unknown as WorkspacesStore;
}

function query<T extends Element>(fixture: { nativeElement: unknown }, testId: string): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${testId}"]`);
}

function queryAll<T extends Element>(fixture: { nativeElement: unknown }, testId: string): T[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<T>(`[data-testid="${testId}"]`),
  );
}

describe('SearchWorkspace', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  async function render(
    storeOpts: StoreOptions = {},
    tabs: RepoTab[] = [{ repoId: 'repo-1', fsPath: '/tmp/a', name: 'a' }],
  ) {
    const store = makeStoreStub(storeOpts);
    const workspaces = makeWorkspaces(tabs);
    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: CommitSearchStore, useValue: store },
        { provide: WorkspacesStore, useValue: workspaces },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(SearchWorkspace);
    fixture.detectChanges();
    return { fixture, store, workspaces };
  }

  it('prompts to open a repository when no tab is open', async () => {
    const { fixture } = await render({}, []);

    expect(query(fixture, 'search-no-repos')).not.toBeNull();
  });

  it('debounces input and searches the open tabs', async () => {
    const { fixture, store } = await render();
    fixture.componentInstance.debounceMs = 0;

    const input = query<HTMLInputElement>(fixture, 'search-input')!;
    input.value = 'fix';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.search).toHaveBeenCalledTimes(1);
    expect(store.search).toHaveBeenCalledWith('fix', ['repo-1']);
  });

  it('collapses rapid keystrokes into one debounced search', async () => {
    const { fixture, store } = await render();
    fixture.componentInstance.debounceMs = 20;
    const input = query<HTMLInputElement>(fixture, 'search-input')!;

    input.value = 'f';
    input.dispatchEvent(new Event('input'));
    input.value = 'fi';
    input.dispatchEvent(new Event('input'));
    input.value = 'fix';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(store.search).toHaveBeenCalledTimes(1);
    expect(store.search).toHaveBeenCalledWith('fix', ['repo-1']);
  });

  it('searches immediately on Enter', async () => {
    const { fixture, store } = await render();

    const input = query<HTMLInputElement>(fixture, 'search-input')!;
    input.value = 'fix';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await Promise.resolve();

    expect(store.search).toHaveBeenCalledWith('fix', ['repo-1']);
  });

  it('shows the loading indicator while searching', async () => {
    const { fixture } = await render({ loading: true, query: 'fix' });

    expect(query(fixture, 'search-loading')).not.toBeNull();
  });

  it('shows the empty state once a search returns nothing', async () => {
    const { fixture } = await render({ hasSearched: true, hits: [], query: 'fix' });

    expect(query(fixture, 'search-empty')).not.toBeNull();
  });

  it('shows the offline state when the bridge is unavailable', async () => {
    const { fixture } = await render({ offline: true, hasSearched: true });

    expect(query(fixture, 'search-offline')).not.toBeNull();
  });

  it('shows the error message on a search failure', async () => {
    const { fixture } = await render({
      error: { code: 'GIT_FAILED', message: 'boom' },
      hasSearched: true,
    });

    expect(query(fixture, 'search-error')?.textContent).toContain('boom');
  });

  it('renders results grouped by repository and emits the clicked hit', async () => {
    const a = hit({ repoId: 'repo-1', oid: 'a'.repeat(40), message: 'alpha subject\nbody' });
    const b = hit({ repoId: 'repo-2', oid: 'b'.repeat(40), message: 'beta' });
    const { fixture } = await render({
      hasSearched: true,
      hits: [a, b],
      groups: [
        { repoId: 'repo-1', repoName: 'Alpha', hits: [a] },
        { repoId: 'repo-2', repoName: 'Beta', hits: [b] },
      ],
    });

    const groups = queryAll(fixture, 'search-group');
    expect(groups).toHaveLength(2);
    expect(groups[0].textContent).toContain('Alpha');
    expect(groups[0].textContent).toContain('alpha subject');
    expect(groups[0].textContent).toContain('aaaaaaa');

    const emitted: CommitSearchHit[] = [];
    fixture.componentInstance.hitSelected.subscribe((value) => emitted.push(value));
    queryAll<HTMLButtonElement>(fixture, 'search-hit')[0].click();
    expect(emitted).toEqual([a]);
  });

  it('shortOid and firstLine helpers format a hit', async () => {
    const { fixture } = await render();
    const instance = fixture.componentInstance;

    expect(instance.shortOid('abcdef1234567890')).toBe('abcdef1');
    expect(instance.firstLine('subject\n\nbody')).toBe('subject');
    expect(instance.firstLine('')).toBe('');
  });

  it('cancels a pending debounce on destroy', async () => {
    const { fixture, store } = await render();
    fixture.componentInstance.debounceMs = 10;
    const input = query<HTMLInputElement>(fixture, 'search-input')!;
    input.value = 'fix';
    input.dispatchEvent(new Event('input'));

    fixture.destroy();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(store.search).not.toHaveBeenCalled();
  });
});
