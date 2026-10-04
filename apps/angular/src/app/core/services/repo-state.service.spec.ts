import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Branch, Remote, Repository, Tag } from '@contracts/domain';
import type { AppError } from './ipc-bridge.service';
import { IpcBridge } from './ipc-bridge.service';
import { RepoState } from './repo-state.service';

const REPO_A: Repository = {
  id: 'repo-a',
  fsPath: '/tmp/a',
  commonDir: '/tmp/a/.git',
  name: 'a',
  createdAt: '2026-01-01T00:00:00Z',
  lastOpenedAt: '2026-01-01T00:00:00Z',
};

const REPO_B: Repository = {
  ...REPO_A,
  id: 'repo-b',
  fsPath: '/tmp/b',
  name: 'b',
};

function branch(name: string): Branch {
  return {
    name,
    refName: `refs/heads/${name}`,
    tip: undefined,
    upstream: '',
    isCurrent: false,
    isRemote: false,
  };
}

function remote(name: string): Remote {
  return { name, urls: [], fetchSpecs: [] };
}

function tag(name: string): Tag {
  return {
    name,
    refName: `refs/tags/${name}`,
    target: undefined,
    tagger: undefined,
    message: '',
    annotated: false,
  };
}

function makeBridge(): IpcBridge & { invoke: Mock } {
  const invoke = vi.fn(async (method: string, req: { repoId: string }) => {
    const suffix = req.repoId === REPO_A.id ? 'a' : 'b';
    switch (method) {
      case 'getBranches':
        return { branches: [branch(`main-${suffix}`), branch(`feature-${suffix}`)] };
      case 'getRemotes':
        return { remotes: [remote(`origin-${suffix}`)] };
      case 'getTags':
        return { tags: [tag(`v1-${suffix}`)] };
      case 'listRepositories':
        return { repositories: [] };
      default:
        throw new Error(`unexpected method ${method}`);
    }
  });
  return { invoke } as unknown as IpcBridge & { invoke: Mock };
}

describe('RepoState', () => {
  let bridge: IpcBridge & { invoke: Mock };
  let store: RepoState;

  beforeEach(() => {
    vi.restoreAllMocks();
    bridge = makeBridge();
    store = new RepoState(bridge);
  });

  it('loads and maps refs for the active repository', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));

    expect(bridge.invoke).toHaveBeenCalledWith('getBranches', { repoId: REPO_A.id });
    expect(bridge.invoke).toHaveBeenCalledWith('getRemotes', { repoId: REPO_A.id });
    expect(bridge.invoke).toHaveBeenCalledWith('getTags', { repoId: REPO_A.id });
    expect(bridge.invoke.mock.calls.filter((c) => c[0] === 'getBranches')).toHaveLength(1);
    expect(store.tags()).toEqual(['v1-a']);
    expect(store.remotes()).toEqual(['origin-a']);
    expect(store.refsLoading()).toBe(false);
    expect(store.refsError()).toBeNull();
    expect(store.refsOffline()).toBe(false);

    // The repo is upserted and marked active.
    expect(store.activeId()).toBe(REPO_A.id);
    expect(store.repos().some((r) => r.id === REPO_A.id)).toBe(true);
  });

  it('loads the repository list and toggles reposLoading', async () => {
    bridge.invoke.mockImplementation(async (method: string) => {
      if (method === 'listRepositories') return { repositories: [REPO_A, REPO_B] };
      throw new Error(`unexpected method ${method}`);
    });

    const pending = store.loadRepositories();
    expect(store.reposLoading()).toBe(true);

    await pending;

    expect(store.repos()).toEqual([REPO_A, REPO_B]);
    expect(store.reposLoading()).toBe(false);
    expect(store.reposError()).toBeNull();
    expect(store.reposOffline()).toBe(false);
  });

  it('sets reposOffline on IPC_UNAVAILABLE and keeps the loaded list', async () => {
    store.repos.set([REPO_A]);
    bridge.invoke.mockRejectedValue({ code: 'IPC_UNAVAILABLE', message: 'no bridge' } as AppError);

    await store.loadRepositories();

    expect(store.reposOffline()).toBe(true);
    expect(store.repos()).toEqual([REPO_A]);
    expect(store.reposError()).toBeNull();
    expect(store.reposLoading()).toBe(false);
  });

  it('records a generic repository-list error and keeps the loaded list', async () => {
    store.repos.set([REPO_A]);
    bridge.invoke.mockRejectedValue({ code: 'GIT_FAILED', message: 'boom' } as AppError);

    await store.loadRepositories();

    expect(store.reposError()).toEqual({ code: 'GIT_FAILED', message: 'boom', details: {} });
    expect(store.repos()).toEqual([REPO_A]);
    expect(store.reposOffline()).toBe(false);
    expect(store.reposLoading()).toBe(false);
  });

  it('clears the lists without touching the bridge when there is no active repo', async () => {
    store.branches.set(['stale']);
    store.tags.set(['stale']);
    store.remotes.set(['stale']);
    store.refsOffline.set(true);

    await store.loadRefs();

    expect(store.branches()).toEqual([]);
    expect(store.tags()).toEqual([]);
    expect(store.remotes()).toEqual([]);
    expect(store.refsOffline()).toBe(false);
    expect(store.refsLoading()).toBe(false);
    expect(bridge.invoke).not.toHaveBeenCalled();
  });

  it('sets refsOffline and clears the lists when the bridge is unavailable', async () => {
    bridge.invoke.mockRejectedValue({ code: 'IPC_UNAVAILABLE', message: 'no bridge' } as AppError);

    store.setActive(REPO_A);

    await vi.waitFor(() => expect(store.refsOffline()).toBe(true));
    expect(store.branches()).toEqual([]);
    expect(store.tags()).toEqual([]);
    expect(store.remotes()).toEqual([]);
    expect(store.refsLoading()).toBe(false);
    expect(store.refsError()).toBeNull();
  });

  it('records a generic error and clears stale lists', async () => {
    store.branches.set(['stale']);
    store.tags.set(['stale']);
    store.remotes.set(['stale']);
    bridge.invoke.mockRejectedValue({ code: 'GIT_FAILED', message: 'boom' } as AppError);

    store.setActive(REPO_A);

    await vi.waitFor(() => expect(store.refsError()).toEqual({ code: 'GIT_FAILED', message: 'boom', details: {} }));
    expect(store.branches()).toEqual([]);
    expect(store.tags()).toEqual([]);
    expect(store.remotes()).toEqual([]);
    expect(store.refsLoading()).toBe(false);
    expect(store.refsOffline()).toBe(false);
  });

  it('removes an active repository, clears the selection and reloads empty refs', async () => {
    store.repos.set([REPO_A, REPO_B]);
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockResolvedValue({});

    const removed = await store.removeRepository(REPO_A.id);

    expect(removed).toBe(true);
    expect(bridge.invoke).toHaveBeenCalledWith('removeRepository', { repoId: REPO_A.id });
    expect(store.repos()).toEqual([REPO_B]);
    expect(store.activeId()).toBeNull();
    expect(store.branches()).toEqual([]);
    expect(store.tags()).toEqual([]);
    expect(store.remotes()).toEqual([]);
    expect(store.reposError()).toBeNull();
    expect(store.removingId()).toBeNull();
  });

  it('keeps the active selection when a different repository is removed', async () => {
    store.repos.set([REPO_A, REPO_B]);
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockResolvedValue({});

    const removed = await store.removeRepository(REPO_B.id);

    expect(removed).toBe(true);
    expect(store.repos()).toEqual([REPO_A]);
    expect(store.activeId()).toBe(REPO_A.id);
    expect(store.branches()).toEqual(['main-a', 'feature-a']);
  });

  it('keeps the list and selection and records the error when removal fails', async () => {
    store.repos.set([REPO_A, REPO_B]);
    store.activeId.set(REPO_A.id);
    bridge.invoke.mockRejectedValue({ code: 'GIT_FAILED', message: 'boom' } as AppError);

    const removed = await store.removeRepository(REPO_A.id);

    expect(removed).toBe(false);
    expect(store.repos()).toEqual([REPO_A, REPO_B]);
    expect(store.activeId()).toBe(REPO_A.id);
    expect(store.reposError()).toEqual({ code: 'GIT_FAILED', message: 'boom', details: {} });
    expect(store.reposOffline()).toBe(false);
    expect(store.removingId()).toBeNull();
  });

  it('sets reposOffline and keeps state when removal hits IPC_UNAVAILABLE', async () => {
    store.repos.set([REPO_A, REPO_B]);
    store.activeId.set(REPO_A.id);
    bridge.invoke.mockRejectedValue({ code: 'IPC_UNAVAILABLE', message: 'no bridge' } as AppError);

    const removed = await store.removeRepository(REPO_A.id);

    expect(removed).toBe(false);
    expect(store.reposOffline()).toBe(true);
    expect(store.repos()).toEqual([REPO_A, REPO_B]);
    expect(store.activeId()).toBe(REPO_A.id);
    expect(store.reposError()).toBeNull();
  });

  it('exposes removingId while a removal is in flight', async () => {
    store.repos.set([REPO_A]);
    let resolveRemove: (value: unknown) => void = () => {};
    bridge.invoke.mockImplementation((method: string) => {
      if (method === 'removeRepository') {
        return new Promise((resolve) => {
          resolveRemove = resolve;
        });
      }
      throw new Error(`unexpected method ${method}`);
    });

    const pending = store.removeRepository(REPO_A.id);
    expect(store.removingId()).toBe(REPO_A.id);

    resolveRemove({});
    await pending;

    expect(store.removingId()).toBeNull();
  });

  it('discards a stale response when a newer repository becomes active', async () => {
    let resolveA: (value: unknown) => void = () => {};
    const deferredA = new Promise((resolve) => {
      resolveA = resolve;
    });

    // Repo A's ref calls hang until we resolve them; repo B resolves immediately.
    bridge.invoke.mockImplementation(async (method: string, req: { repoId: string }) => {
      if (req.repoId === REPO_A.id) return deferredA;
      switch (method) {
        case 'getBranches':
          return { branches: [branch('main-b')] };
        case 'getRemotes':
          return { remotes: [remote('origin-b')] };
        case 'getTags':
          return { tags: [tag('v1-b')] };
        default:
          throw new Error(`unexpected method ${method}`);
      }
    });

    store.setActive(REPO_A);
    store.setActive(REPO_B);

    await vi.waitFor(() => expect(store.branches()).toEqual(['main-b']));
    expect(store.remotes()).toEqual(['origin-b']);
    expect(store.tags()).toEqual(['v1-b']);

    // Now let repo A's stale response settle; it must not overwrite B.
    resolveA({
      branches: [branch('main-a')],
      remotes: [remote('origin-a')],
      tags: [tag('v1-a')],
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.branches()).toEqual(['main-b']);
    expect(store.remotes()).toEqual(['origin-b']);
    expect(store.tags()).toEqual(['v1-b']);
    expect(store.refsLoading()).toBe(false);
  });
});
