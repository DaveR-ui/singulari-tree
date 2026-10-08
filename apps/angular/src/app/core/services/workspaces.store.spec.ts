import { signal } from '@angular/core';
import type { Repository } from '@contracts/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepoState } from './repo-state.service';
import { WORKSPACES_STORAGE_KEY, WorkspacesStore } from './workspaces.store';

/** In-memory Storage (jsdom does not expose `localStorage` as a bare global). */
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

function makeRepo(id: string, name = id): Repository {
  return {
    id,
    fsPath: `/tmp/${id}`,
    commonDir: `/tmp/${id}/.git`,
    name,
    createdAt: '2026-01-01T00:00:00Z',
    lastOpenedAt: '2026-01-01T00:00:00Z',
  };
}

function makeRepoState(repos: Repository[] = []) {
  const reposSignal = signal<Repository[]>(repos);
  const activeId = signal<string | null>(null);
  return {
    repos: reposSignal,
    activeId,
    setActive: vi.fn((repo: Repository) => activeId.set(repo.id)),
    clearActive: vi.fn(() => activeId.set(null)),
  };
}

type StubRepoState = ReturnType<typeof makeRepoState>;

function makeStore(repoState: StubRepoState = makeRepoState()): WorkspacesStore {
  return new WorkspacesStore(repoState as unknown as RepoState);
}

describe('WorkspacesStore', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('opens a tab, makes it active and persists the UI-state', () => {
    const store = makeStore();
    const repo = makeRepo('a');

    store.openTab(repo);

    expect(store.tabs()).toEqual([{ repoId: 'a', fsPath: '/tmp/a', name: 'a' }]);
    expect(store.activeTabId()).toBe('a');
    expect(store.activeTab()?.repoId).toBe('a');
    const persisted = JSON.parse(localStorage.getItem(WORKSPACES_STORAGE_KEY) as string);
    expect(persisted).toEqual({
      tabs: [{ repoId: 'a', fsPath: '/tmp/a', name: 'a' }],
      activeTabId: 'a',
    });
  });

  it('does not duplicate an existing tab and refreshes its cached name/path', () => {
    const store = makeStore();
    store.openTab(makeRepo('a', 'old'));
    store.openTab(makeRepo('a', 'new'));

    expect(store.tabs()).toHaveLength(1);
    expect(store.tabs()[0].name).toBe('new');
  });

  it('selects a tab and mirrors it into RepoState', () => {
    const repoState = makeRepoState([makeRepo('a'), makeRepo('b')]);
    const store = makeStore(repoState);
    store.openTab(makeRepo('a'));
    store.openTab(makeRepo('b'));

    store.selectTab('a');

    expect(store.activeTabId()).toBe('a');
    expect(repoState.setActive).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('ignores selecting an unknown tab', () => {
    const store = makeStore();
    store.openTab(makeRepo('a'));

    store.selectTab('missing');

    expect(store.activeTabId()).toBe('a');
  });

  it('closing a non-active tab keeps the active selection', () => {
    const repoState = makeRepoState([makeRepo('a'), makeRepo('b')]);
    const store = makeStore(repoState);
    store.openTab(makeRepo('a'));
    store.openTab(makeRepo('b'));
    store.selectTab('b');

    store.closeTab('a');

    expect(store.tabs().map((t) => t.repoId)).toEqual(['b']);
    expect(store.activeTabId()).toBe('b');
    expect(repoState.setActive).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('closing the active tab selects the next neighbour and mirrors it', () => {
    const repoState = makeRepoState([makeRepo('a'), makeRepo('b'), makeRepo('c')]);
    const store = makeStore(repoState);
    store.openTab(makeRepo('a'));
    store.openTab(makeRepo('b'));
    store.openTab(makeRepo('c'));
    store.selectTab('b');

    store.closeTab('b');

    expect(store.tabs().map((t) => t.repoId)).toEqual(['a', 'c']);
    expect(store.activeTabId()).toBe('c');
    expect(repoState.setActive).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'c' }));
  });

  it('closing the last active tab falls back to the previous one', () => {
    const repoState = makeRepoState([makeRepo('a'), makeRepo('b')]);
    const store = makeStore(repoState);
    store.openTab(makeRepo('a'));
    store.openTab(makeRepo('b'));
    store.selectTab('b');

    store.closeTab('b');

    expect(store.activeTabId()).toBe('a');
    expect(repoState.setActive).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('closing the only tab clears the active id and clears RepoState', () => {
    const repoState = makeRepoState([makeRepo('a')]);
    const store = makeStore(repoState);
    store.openTab(makeRepo('a'));

    store.closeTab('a');

    expect(store.tabs()).toEqual([]);
    expect(store.activeTabId()).toBeNull();
    expect(repoState.setActive).not.toHaveBeenCalled();
    // The active repo must be cleared so the sidebar/toolbar stop showing refs
    // for a repository with no open tab.
    expect(repoState.clearActive).toHaveBeenCalledTimes(1);
    expect(repoState.activeId()).toBeNull();
  });

  it('ignores closing an unknown tab', () => {
    const store = makeStore();
    store.openTab(makeRepo('a'));

    store.closeTab('missing');

    expect(store.tabs()).toHaveLength(1);
  });

  it('reorders tabs and ignores out-of-range moves', () => {
    const store = makeStore();
    store.openTab(makeRepo('a'));
    store.openTab(makeRepo('b'));
    store.openTab(makeRepo('c'));

    store.moveTab(0, 2);
    expect(store.tabs().map((t) => t.repoId)).toEqual(['b', 'c', 'a']);

    store.moveTab(5, 0);
    store.moveTab(1, 1);
    expect(store.tabs().map((t) => t.repoId)).toEqual(['b', 'c', 'a']);
  });

  it('rehydrates a valid persisted state', () => {
    localStorage.setItem(
      WORKSPACES_STORAGE_KEY,
      JSON.stringify({
        tabs: [
          { repoId: 'a', fsPath: '/tmp/a', name: 'a' },
          { repoId: 'b', fsPath: '/tmp/b', name: 'b' },
        ],
        activeTabId: 'b',
      }),
    );
    const store = makeStore();

    store.rehydrate();

    expect(store.tabs()).toHaveLength(2);
    expect(store.activeTabId()).toBe('b');
  });

  it('ignores missing or malformed persisted state', () => {
    const store = makeStore();
    store.rehydrate();
    expect(store.tabs()).toEqual([]);

    localStorage.setItem(WORKSPACES_STORAGE_KEY, '{not json');
    store.rehydrate();
    expect(store.tabs()).toEqual([]);

    localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify({ tabs: 'nope', activeTabId: 3 }));
    store.rehydrate();
    expect(store.tabs()).toEqual([]);
    expect(store.activeTabId()).toBeNull();
  });

  it('drops a persisted active id that does not match any tab', () => {
    localStorage.setItem(
      WORKSPACES_STORAGE_KEY,
      JSON.stringify({ tabs: [{ repoId: 'a', fsPath: '/tmp/a', name: 'a' }], activeTabId: 'ghost' }),
    );
    const store = makeStore();

    store.rehydrate();

    expect(store.activeTabId()).toBeNull();
  });

  it('reconciles against the core list: drops stale ids and refreshes fields', () => {
    const store = makeStore();
    store.openTab(makeRepo('a', 'old-a'));
    store.openTab(makeRepo('gone'));

    store.reconcile([makeRepo('a', 'new-a')]);

    expect(store.tabs()).toEqual([{ repoId: 'a', fsPath: '/tmp/a', name: 'new-a' }]);
    expect(store.activeTabId()).toBe('a');
  });

  it('reconcile moves the active selection to the first remaining tab when dropped', () => {
    const repoState = makeRepoState();
    const store = makeStore(repoState);
    store.openTab(makeRepo('a'));
    store.openTab(makeRepo('gone'));
    store.selectTab('gone');

    store.reconcile([makeRepo('a')]);

    expect(store.tabs().map((t) => t.repoId)).toEqual(['a']);
    expect(store.activeTabId()).toBe('a');
    // The fallback tab is mirrored into RepoState (the active-repo source of truth).
    expect(repoState.setActive).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a' }));
    expect(repoState.clearActive).not.toHaveBeenCalled();
  });

  it('reconcile with no repositories clears every tab and RepoState', () => {
    const repoState = makeRepoState([makeRepo('a')]);
    const store = makeStore(repoState);
    store.openTab(makeRepo('a'));

    store.reconcile([]);

    expect(store.tabs()).toEqual([]);
    expect(store.activeTabId()).toBeNull();
    expect(repoState.clearActive).toHaveBeenCalledTimes(1);
    expect(repoState.activeId()).toBeNull();
  });

  it('survives localStorage being unavailable', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const store = makeStore();

    expect(() => store.openTab(makeRepo('a'))).not.toThrow();
    expect(() => store.rehydrate()).not.toThrow();
    expect(store.tabs()).toHaveLength(1);
  });
});
