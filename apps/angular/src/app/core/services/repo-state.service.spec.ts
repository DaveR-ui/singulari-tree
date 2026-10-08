import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Branch, Remote, Repository, Stash, Tag } from '@contracts/domain';
import type { GitFlowConfig } from '@contracts/gitcore';
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
    behind: 0,
  };
}

function remoteBranch(name: string): Branch {
  return {
    name,
    refName: `refs/remotes/${name}`,
    tip: undefined,
    upstream: '',
    isCurrent: false,
    isRemote: true,
    behind: 0,
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

function stash(index: number, message = `WIP ${index}`): Stash {
  return { index, oid: undefined, message, branchName: 'main' };
}

function makeBridge(): IpcBridge & { invoke: Mock } {
  const invoke = vi.fn(async (method: string, req: { repoId: string }) => {
    const suffix = req.repoId === REPO_A.id ? 'a' : 'b';
    switch (method) {
      case 'getBranches':
        return {
          branches: [
            branch(`main-${suffix}`),
            branch(`feature-${suffix}`),
            remoteBranch(`origin/base-${suffix}`),
            remoteBranch(`origin/david/topic-${suffix}`),
            // Defensive: the symbolic HEAD must never reach the UI.
            remoteBranch('origin/HEAD'),
          ],
        };
      case 'getRemotes':
        return { remotes: [remote(`origin-${suffix}`)] };
      case 'getTags':
        return { tags: [tag(`v1-${suffix}`)] };
      case 'getStashes':
        return { stashes: [] };
      case 'listRepositories':
        return { repositories: [] };
      case 'checkout':
        return {};
      case 'stashPush':
        return { stash: undefined };
      default:
        throw new Error(`unexpected method ${method}`);
    }
  });
  return { invoke } as unknown as IpcBridge & { invoke: Mock };
}

/**
 * Bridge implementation that serves the ref reads plus the supplied mutation
 * handlers (throwing inside a handler models a rejected mutation).
 */
function refsImpl(extra: Record<string, () => unknown>) {
  return async (method: string, req: { repoId: string }) => {
    const handler = extra[method];
    if (handler) return handler();
    const suffix = req.repoId === REPO_A.id ? 'a' : 'b';
    switch (method) {
      case 'getBranches':
        return { branches: [branch(`main-${suffix}`), branch(`feature-${suffix}`), remoteBranch(`origin/base-${suffix}`)] };
      case 'getRemotes':
        return { remotes: [remote(`origin-${suffix}`)] };
      case 'getTags':
        return { tags: [tag(`v1-${suffix}`)] };
      case 'getStashes':
        return { stashes: [] };
      default:
        throw new Error(`unexpected method ${method}`);
    }
  };
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
    expect(store.remoteBranches()).toEqual(['origin/base-a', 'origin/david/topic-a']);
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

  it('whenRepositoriesLoaded waits for the first list load to settle', async () => {
    let resolveList!: (value: { repositories: Repository[] }) => void;
    bridge.invoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );

    expect(store.reposLoaded()).toBe(false);
    const pending = store.loadRepositories();
    const loaded = store.whenRepositoriesLoaded();

    let settled = false;
    void loaded.then(() => {
      settled = true;
    });
    await Promise.resolve();
    // Still in flight: the readiness promise must not resolve early.
    expect(settled).toBe(false);

    resolveList({ repositories: [REPO_A] });
    await pending;
    await loaded;

    expect(store.reposLoaded()).toBe(true);
    expect(store.repos()).toEqual([REPO_A]);
  });

  it('whenRepositoriesLoaded resolves immediately once the list is loaded', async () => {
    bridge.invoke.mockImplementation(async (method: string) => {
      if (method === 'listRepositories') return { repositories: [REPO_A] };
      throw new Error(`unexpected method ${method}`);
    });
    await store.loadRepositories();

    await expect(store.whenRepositoriesLoaded()).resolves.toBeUndefined();
  });

  it('clearActive drops the selection and clears the ref/stash lists', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));

    store.clearActive();

    expect(store.activeId()).toBeNull();
    await vi.waitFor(() => expect(store.branches()).toEqual([]));
    expect(store.remoteBranches()).toEqual([]);
    expect(store.tags()).toEqual([]);
    expect(store.remotes()).toEqual([]);
    expect(store.stashes()).toEqual([]);
  });

  it('opens a repository by path, upserts and activates it (deep link)', async () => {
    bridge.invoke.mockImplementation(async (method: string) => {
      if (method === 'openRepository') return REPO_A;
      if (method === 'getBranches') return { branches: [] };
      if (method === 'getRemotes') return { remotes: [] };
      if (method === 'getTags') return { tags: [] };
      if (method === 'getStashes') return { stashes: [] };
      throw new Error(`unexpected method ${method}`);
    });

    const opened = await store.openRepositoryPath('  /tmp/a  ');

    expect(opened).toEqual(REPO_A);
    expect(bridge.invoke).toHaveBeenCalledWith('openRepository', { fsPath: '/tmp/a' });
    expect(store.activeId()).toBe(REPO_A.id);
    expect(store.repos().some((r) => r.id === REPO_A.id)).toBe(true);
    expect(store.reposError()).toBeNull();
    expect(store.reposOffline()).toBe(false);
  });

  it('ignores a blank path without touching the bridge', async () => {
    const opened = await store.openRepositoryPath('   ');

    expect(opened).toBeNull();
    expect(bridge.invoke).not.toHaveBeenCalled();
  });

  it('sets reposOffline and returns null when openRepository hits IPC_UNAVAILABLE', async () => {
    bridge.invoke.mockRejectedValue({ code: 'IPC_UNAVAILABLE', message: 'no bridge' } as AppError);

    const opened = await store.openRepositoryPath('/tmp/a');

    expect(opened).toBeNull();
    expect(store.reposOffline()).toBe(true);
    expect(store.reposError()).toBeNull();
  });

  it('records a generic error and returns null when openRepository fails', async () => {
    bridge.invoke.mockRejectedValue({ code: 'REPO_NOT_FOUND', message: 'missing' } as AppError);

    const opened = await store.openRepositoryPath('/tmp/a');

    expect(opened).toBeNull();
    expect(store.reposError()).toEqual({ code: 'REPO_NOT_FOUND', message: 'missing', details: {} });
  });

  it('clears the lists without touching the bridge when there is no active repo', async () => {
    store.branches.set(['stale']);
    store.remoteBranches.set(['origin/stale']);
    store.tags.set(['stale']);
    store.remotes.set(['stale']);
    store.refsOffline.set(true);

    await store.loadRefs();

    expect(store.branches()).toEqual([]);
    expect(store.remoteBranches()).toEqual([]);
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
    expect(store.remoteBranches()).toEqual([]);
    expect(store.tags()).toEqual([]);
    expect(store.remotes()).toEqual([]);
    expect(store.refsLoading()).toBe(false);
    expect(store.refsError()).toBeNull();
  });

  it('records a generic error and clears stale lists', async () => {
    store.branches.set(['stale']);
    store.remoteBranches.set(['origin/stale']);
    store.tags.set(['stale']);
    store.remotes.set(['stale']);
    bridge.invoke.mockRejectedValue({ code: 'GIT_FAILED', message: 'boom' } as AppError);

    store.setActive(REPO_A);

    await vi.waitFor(() => expect(store.refsError()).toEqual({ code: 'GIT_FAILED', message: 'boom', details: {} }));
    expect(store.branches()).toEqual([]);
    expect(store.remoteBranches()).toEqual([]);
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
    expect(store.remoteBranches()).toEqual([]);
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
    expect(store.remoteBranches()).toEqual(['origin/base-a', 'origin/david/topic-a']);
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

  it('splits local and remote-tracking branches, excluding origin/HEAD', async () => {
    bridge.invoke.mockImplementation(async (method: string, req: { repoId: string }) => {
      switch (method) {
        case 'getBranches':
          return {
            branches: [
              branch('main'),
              remoteBranch('origin/main'),
              remoteBranch('upstream/develop'),
              remoteBranch('origin/HEAD'),
            ],
          };
        case 'getRemotes':
          return { remotes: [remote('origin')] };
        case 'getTags':
          return { tags: [tag('v1')] };
        default:
          throw new Error(`unexpected method ${method}`);
      }
    });

    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main']));

    expect(store.remoteBranches()).toEqual(['origin/main', 'upstream/develop']);
    expect(store.branches().some((name) => name.includes('/'))).toBe(false);
  });

  it('clears both branch lists when the repository has no refs', async () => {
    bridge.invoke.mockImplementation(async (method: string) => {
      switch (method) {
        case 'getBranches':
          return { branches: [] };
        case 'getRemotes':
          return { remotes: [] };
        case 'getTags':
          return { tags: [] };
        default:
          throw new Error(`unexpected method ${method}`);
      }
    });

    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.refsLoading()).toBe(false));

    expect(store.branches()).toEqual([]);
    expect(store.remoteBranches()).toEqual([]);
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
          return { branches: [branch('main-b'), remoteBranch('origin/base-b')] };
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
    expect(store.remoteBranches()).toEqual(['origin/base-b']);
    expect(store.remotes()).toEqual(['origin-b']);
    expect(store.tags()).toEqual(['v1-b']);

    // Now let repo A's stale response settle; it must not overwrite B.
    resolveA({
      branches: [branch('main-a'), remoteBranch('origin/base-a')],
      remotes: [remote('origin-a')],
      tags: [tag('v1-a')],
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.branches()).toEqual(['main-b']);
    expect(store.remoteBranches()).toEqual(['origin/base-b']);
    expect(store.remotes()).toEqual(['origin-b']);
    expect(store.tags()).toEqual(['v1-b']);
    expect(store.refsLoading()).toBe(false);
  });

  it('exposes display-name -> full-ref maps for local and remote branches', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));

    expect(store.localRefByName().get('main-a')).toBe('refs/heads/main-a');
    expect(store.localRefByName().get('feature-a')).toBe('refs/heads/feature-a');
    expect(store.remoteRefByName().get('origin/david/topic-a')).toBe(
      'refs/remotes/origin/david/topic-a',
    );
    // The symbolic origin/HEAD never enters the map.
    expect(store.remoteRefByName().has('origin/HEAD')).toBe(false);

    await store.loadRefs();
    expect(store.localRefByName().size).toBe(2);
  });

  it('checkoutBranch resolves the full local ref, calls checkout and reloads refs', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockClear();

    await store.checkoutBranch('feature-a', false);

    expect(bridge.invoke).toHaveBeenCalledWith('checkout', {
      repoId: REPO_A.id,
      refName: 'refs/heads/feature-a',
      force: false,
      discardUntracked: false,
    });
    expect(bridge.invoke.mock.calls.filter((c) => c[0] === 'getBranches')).toHaveLength(1);
    expect(store.checkoutError()).toBeNull();
    expect(store.checkoutRunning()).toBe(false);
  });

  it('checkoutBranch resolves the raw remote-tracking ref', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockClear();

    await store.checkoutBranch('origin/david/topic-a', true);

    expect(bridge.invoke).toHaveBeenCalledWith('checkout', {
      repoId: REPO_A.id,
      refName: 'refs/remotes/origin/david/topic-a',
      force: false,
      discardUntracked: false,
    });
  });

  it('checkoutBranch falls back to the provided name when the map has no entry', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockClear();

    await store.checkoutBranch('unmapped', false);

    expect(bridge.invoke).toHaveBeenCalledWith('checkout', {
      repoId: REPO_A.id,
      refName: 'unmapped',
      force: false,
      discardUntracked: false,
    });
  });

  it('checkoutBranch no-ops without an active repo', async () => {
    await store.checkoutBranch('main', false);

    expect(bridge.invoke).not.toHaveBeenCalledWith('checkout', expect.anything());
    expect(store.checkoutError()).toBeNull();
    expect(store.checkoutRunning()).toBe(false);
  });

  it('checkoutBranch no-ops when the local click targets the current branch', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    store.currentBranch.set('main-a');
    bridge.invoke.mockClear();

    await store.checkoutBranch('main-a', false);

    expect(bridge.invoke).not.toHaveBeenCalledWith('checkout', expect.anything());
  });

  it('checkoutBranch records refsOffline on IPC_UNAVAILABLE', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockImplementation(async (method: string) => {
      if (method === 'checkout') throw { code: 'IPC_UNAVAILABLE', message: 'no bridge' } as AppError;
      throw new Error(`unexpected method ${method}`);
    });

    await store.checkoutBranch('feature-a', false);

    expect(store.refsOffline()).toBe(true);
    expect(store.checkoutError()).toBeNull();
    expect(store.checkoutRunning()).toBe(false);
  });

  it('checkoutBranch records checkoutError on a generic failure', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockImplementation(async (method: string) => {
      if (method === 'checkout') throw { code: 'GIT_FAILED', message: 'boom' } as AppError;
      throw new Error(`unexpected method ${method}`);
    });

    await store.checkoutBranch('feature-a', false);

    expect(store.checkoutError()).toEqual({ code: 'GIT_FAILED', message: 'boom', details: {} });
    expect(store.refsOffline()).toBe(false);
    expect(store.checkoutRunning()).toBe(false);
  });

  it('checkoutBranch preserves the CHECKOUT_FAILED details on failure', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    const details = {
      reason: 'dirty_working_tree',
      paths: 'src/a.ts\nsrc/b.ts',
      raw: 'fatal: your local changes would be overwritten',
    };
    bridge.invoke.mockImplementation(async (method: string) => {
      if (method === 'checkout') {
        throw {
          code: 'CHECKOUT_FAILED',
          message: 'Your local changes would be overwritten by checkout.',
          details,
        } as AppError;
      }
      throw new Error(`unexpected method ${method}`);
    });

    await store.checkoutBranch('feature-a', false);

    expect(store.checkoutError()).toEqual({
      code: 'CHECKOUT_FAILED',
      message: 'Your local changes would be overwritten by checkout.',
      details,
    });
    expect(store.refsOffline()).toBe(false);
    expect(store.checkoutRunning()).toBe(false);
  });

  it('checkoutBranch forwards force and discardUntracked for the conflict flow', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockClear();

    await store.checkoutBranch('feature-a', false, true, false);
    await store.checkoutBranch('feature-a', false, true, true);

    const checkoutCalls = bridge.invoke.mock.calls.filter((c) => c[0] === 'checkout');
    expect(checkoutCalls[0]).toEqual([
      'checkout',
      {
        repoId: REPO_A.id,
        refName: 'refs/heads/feature-a',
        force: true,
        discardUntracked: false,
      },
    ]);
    expect(checkoutCalls[1]).toEqual([
      'checkout',
      {
        repoId: REPO_A.id,
        refName: 'refs/heads/feature-a',
        force: true,
        discardUntracked: true,
      },
    ]);
  });

  it('stashPush sends the message, reloads refs and returns true', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockClear();

    const ok = await store.stashPush('Auto-stash before switching');

    expect(ok).toBe(true);
    expect(bridge.invoke).toHaveBeenCalledWith('stashPush', {
      repoId: REPO_A.id,
      message: 'Auto-stash before switching',
    });
    expect(bridge.invoke.mock.calls.filter((c) => c[0] === 'getBranches')).toHaveLength(1);
    expect(store.stashRunning()).toBe(false);
    expect(store.checkoutError()).toBeNull();
  });

  it('stashPush records checkoutError and returns false on a generic failure', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockImplementation(async (method: string) => {
      if (method === 'stashPush') throw { code: 'STASH_FAILED', message: 'boom' } as AppError;
      throw new Error(`unexpected method ${method}`);
    });

    const ok = await store.stashPush('msg');

    expect(ok).toBe(false);
    expect(store.checkoutError()).toEqual({ code: 'STASH_FAILED', message: 'boom', details: {} });
    expect(store.refsOffline()).toBe(false);
    expect(store.stashRunning()).toBe(false);
  });

  it('stashPush maps IPC_UNAVAILABLE to refsOffline and returns false', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockImplementation(async (method: string) => {
      if (method === 'stashPush') throw { code: 'IPC_UNAVAILABLE', message: 'no bridge' } as AppError;
      throw new Error(`unexpected method ${method}`);
    });

    const ok = await store.stashPush('msg');

    expect(ok).toBe(false);
    expect(store.refsOffline()).toBe(true);
    expect(store.checkoutError()).toBeNull();
  });

  it('stashPush no-ops without an active repo', async () => {
    const ok = await store.stashPush('msg');

    expect(ok).toBe(false);
    expect(bridge.invoke).not.toHaveBeenCalledWith('stashPush', expect.anything());
  });

  it('stashPush ignores a re-entrant call while running', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockClear();

    let resolveStash: (value: unknown) => void = () => {};
    bridge.invoke.mockImplementation((method: string) => {
      if (method === 'stashPush') {
        return new Promise((resolve) => {
          resolveStash = resolve;
        });
      }
      throw new Error(`unexpected method ${method}`);
    });

    const first = store.stashPush('msg');
    expect(store.stashRunning()).toBe(true);

    const second = await store.stashPush('msg');
    expect(second).toBe(false);
    expect(bridge.invoke.mock.calls.filter((c) => c[0] === 'stashPush')).toHaveLength(1);

    resolveStash({ stash: undefined });
    await first;
    expect(store.stashRunning()).toBe(false);
  });

  it('dismissCheckoutError clears the recorded checkout failure', () => {
    store.checkoutError.set({
      code: 'CHECKOUT_FAILED',
      message: 'boom',
      details: { reason: 'git_error' },
    });

    store.dismissCheckoutError();

    expect(store.checkoutError()).toBeNull();
  });

  it('loadRefs clears a prior checkout failure', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    store.checkoutError.set({ code: 'CHECKOUT_FAILED', message: 'boom' });

    await store.loadRefs();

    expect(store.checkoutError()).toBeNull();
  });

  it('checkoutBranch ignores a re-entrant call while running', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));

    let resolveCheckout: (value: unknown) => void = () => {};
    bridge.invoke.mockImplementation((method: string) => {
      if (method === 'checkout') {
        return new Promise((resolve) => {
          resolveCheckout = resolve;
        });
      }
      throw new Error(`unexpected method ${method}`);
    });

    const first = store.checkoutBranch('feature-a', false);
    expect(store.checkoutRunning()).toBe(true);

    await store.checkoutBranch('feature-a', false);
    expect(bridge.invoke.mock.calls.filter((c) => c[0] === 'checkout')).toHaveLength(1);

    resolveCheckout({});
    await first;
    expect(store.checkoutRunning()).toBe(false);
  });

  // -- ref mutations (ADR-028) ---------------------------------------------

  it('createBranch sends the request, reloads refs and bumps status refresh on checkout', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockImplementation(refsImpl({ createBranch: () => ({ name: 'topic' }) }));
    bridge.invoke.mockClear();
    const before = store.statusRefreshRequested();

    const ok = await store.createBranch('topic', 'main-a', true);

    expect(ok).toBe(true);
    expect(bridge.invoke).toHaveBeenCalledWith('createBranch', {
      repoId: REPO_A.id,
      name: 'topic',
      startPoint: 'main-a',
      checkout: true,
    });
    expect(bridge.invoke.mock.calls.filter((c) => c[0] === 'getBranches')).toHaveLength(1);
    expect(store.statusRefreshRequested()).toBe(before + 1);
    expect(store.refOpRunning()).toBe(false);
    expect(store.refOpError()).toBeNull();
  });

  it('createBranch without checkout does not bump the status refresh', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockImplementation(refsImpl({ createBranch: () => ({ name: 'topic' }) }));
    const before = store.statusRefreshRequested();

    expect(await store.createBranch('topic', 'main-a', false)).toBe(true);

    expect(store.statusRefreshRequested()).toBe(before);
  });

  it('createBranch no-ops without an active repo or with a blank name', async () => {
    expect(await store.createBranch('topic', 'HEAD', false)).toBe(false);

    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockClear();

    expect(await store.createBranch('   ', 'HEAD', false)).toBe(false);
    expect(bridge.invoke).not.toHaveBeenCalledWith('createBranch', expect.anything());
  });

  it('createBranch records refOpError on a generic failure', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockImplementation(
      refsImpl({
        createBranch: () => {
          throw { code: 'BRANCH_EXISTS', message: 'already exists' } as AppError;
        },
      }),
    );

    expect(await store.createBranch('main-a', 'HEAD', true)).toBe(false);
    expect(store.refOpError()).toEqual({ code: 'BRANCH_EXISTS', message: 'already exists', details: {} });
    expect(store.refOpRunning()).toBe(false);
  });

  it('renameBranch sends the request and reloads the refs', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockImplementation(refsImpl({ renameBranch: () => ({ name: 'trunk' }) }));
    bridge.invoke.mockClear();

    expect(await store.renameBranch('main-a', 'trunk')).toBe(true);

    expect(bridge.invoke).toHaveBeenCalledWith('renameBranch', {
      repoId: REPO_A.id,
      oldName: 'main-a',
      newName: 'trunk',
    });
    expect(bridge.invoke.mock.calls.filter((c) => c[0] === 'getBranches')).toHaveLength(1);
  });

  it('renameBranch no-ops without an active repo or with a blank new name', async () => {
    expect(await store.renameBranch('main', 'trunk')).toBe(false);

    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockClear();

    expect(await store.renameBranch('main-a', '  ')).toBe(false);
    expect(bridge.invoke).not.toHaveBeenCalledWith('renameBranch', expect.anything());
  });

  it('deleteBranch forwards the force flag', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockImplementation(refsImpl({ deleteBranch: () => ({}) }));
    bridge.invoke.mockClear();

    expect(await store.deleteBranch('feature-a', true)).toBe(true);

    expect(bridge.invoke).toHaveBeenCalledWith('deleteBranch', {
      repoId: REPO_A.id,
      name: 'feature-a',
      force: true,
    });
  });

  it('createTag sends the request and reloads the refs', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.tags()).toEqual(['v1-a']));
    bridge.invoke.mockImplementation(refsImpl({ createTag: () => ({ name: 'v2' }) }));
    bridge.invoke.mockClear();

    expect(await store.createTag('v2', 'abc', true, 'notes', false)).toBe(true);

    expect(bridge.invoke).toHaveBeenCalledWith('createTag', {
      repoId: REPO_A.id,
      name: 'v2',
      target: 'abc',
      annotated: true,
      message: 'notes',
      force: false,
    });
    expect(bridge.invoke.mock.calls.filter((c) => c[0] === 'getTags')).toHaveLength(1);
  });

  it('createTag rejects an annotated tag without a message', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockClear();

    expect(await store.createTag('v2', 'abc', true, '   ', false)).toBe(false);
    expect(bridge.invoke).not.toHaveBeenCalledWith('createTag', expect.anything());
  });

  it('deleteTag sends the request and reloads the refs', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.tags()).toEqual(['v1-a']));
    bridge.invoke.mockImplementation(refsImpl({ deleteTag: () => ({}) }));
    bridge.invoke.mockClear();

    expect(await store.deleteTag('v1-a')).toBe(true);

    expect(bridge.invoke).toHaveBeenCalledWith('deleteTag', {
      repoId: REPO_A.id,
      name: 'v1-a',
    });
  });

  it('merge sends the strategy request, reloads refs and refreshes status', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockImplementation(
      refsImpl({ merge: () => ({ hasConflict: false, oid: 'abc' }) }),
    );
    bridge.invoke.mockClear();
    const before = store.statusRefreshRequested();

    expect(await store.merge('feature-a', 'MERGE', false, 'msg')).toBe(true);

    expect(bridge.invoke).toHaveBeenCalledWith('merge', {
      repoId: REPO_A.id,
      ref: 'feature-a',
      strategy: 'MERGE',
      noCommit: false,
      message: 'msg',
    });
    expect(store.mergeConflict()).toBeNull();
    expect(store.statusRefreshRequested()).toBe(before + 1);
  });

  it('merge publishes the conflict result when hasConflict is true', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockImplementation(
      refsImpl({ merge: () => ({ hasConflict: true, oid: 'abc' }) }),
    );

    expect(await store.merge('feature-a', 'NO_FF', true, '')).toBe(true);
    expect(store.mergeConflict()).toEqual({ hasConflict: true, oid: 'abc' });

    store.dismissMergeConflict();
    expect(store.mergeConflict()).toBeNull();
  });

  it('merge treats a MERGE_CONFLICT rejection as a surfaced conflict', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockImplementation(
      refsImpl({
        merge: () => {
          throw { code: 'MERGE_CONFLICT', message: 'conflict' } as AppError;
        },
      }),
    );

    expect(await store.merge('feature-a', 'MERGE', false, '')).toBe(true);
    expect(store.mergeConflict()).toEqual({ hasConflict: true, oid: '' });
    expect(store.refOpError()).toBeNull();
  });

  it('merge records refOpError on a generic failure', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockImplementation(
      refsImpl({
        merge: () => {
          throw { code: 'MERGE_FAILED', message: 'boom' } as AppError;
        },
      }),
    );

    expect(await store.merge('feature-a', 'SQUASH', false, '')).toBe(false);
    expect(store.refOpError()).toEqual({ code: 'MERGE_FAILED', message: 'boom', details: {} });
    expect(store.refOpRunning()).toBe(false);
  });

  it('a ref mutation maps IPC_UNAVAILABLE to refsOffline', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockImplementation(
      refsImpl({
        deleteTag: () => {
          throw { code: 'IPC_UNAVAILABLE', message: 'no bridge' } as AppError;
        },
      }),
    );

    expect(await store.deleteTag('v1-a')).toBe(false);
    expect(store.refsOffline()).toBe(true);
    expect(store.refOpError()).toBeNull();
  });

  it('ref mutations no-op without an active repo and clearRefOpError resets the error', async () => {
    expect(await store.deleteBranch('main', false)).toBe(false);
    expect(await store.deleteTag('v1')).toBe(false);
    expect(await store.merge('main', 'MERGE', false, '')).toBe(false);

    store.refOpError.set({ code: 'GIT_FAILED', message: 'boom' });
    store.clearRefOpError();
    expect(store.refOpError()).toBeNull();
  });

  it('ignores a re-entrant ref mutation while running', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));

    let resolveCreate: (value: unknown) => void = () => {};
    bridge.invoke.mockImplementation((method: string) => {
      if (method === 'createBranch') {
        return new Promise((resolve) => {
          resolveCreate = resolve;
        });
      }
      throw new Error(`unexpected method ${method}`);
    });

    const first = store.createBranch('topic', 'HEAD', false);
    expect(store.refOpRunning()).toBe(true);

    expect(await store.deleteTag('v1-a')).toBe(false);
    expect(bridge.invoke.mock.calls.filter((c) => c[0] === 'deleteTag')).toHaveLength(0);

    resolveCreate({});
    await first;
    expect(store.refOpRunning()).toBe(false);
  });

  // -- stashes (ADR-028) ---------------------------------------------------

  it('loadStashes maps the entries for the active repository', async () => {
    bridge.invoke.mockImplementation(async (method: string) => {
      if (method === 'getStashes') return { stashes: [stash(0, 'first'), stash(1, 'second')] };
      throw new Error(`unexpected method ${method}`);
    });

    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.stashes()).toEqual([stash(0, 'first'), stash(1, 'second')]));

    expect(bridge.invoke).toHaveBeenCalledWith('getStashes', { repoId: REPO_A.id });
    expect(store.stashesLoading()).toBe(false);
    expect(store.stashesError()).toBeNull();
  });

  it('loadStashes clears the list without an active repo', async () => {
    store.stashes.set([stash(0)]);
    bridge.invoke.mockClear();

    await store.loadStashes();

    expect(store.stashes()).toEqual([]);
    expect(bridge.invoke).not.toHaveBeenCalled();
  });

  it('loadStashes records an error and clears stale entries on failure', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.stashesLoading()).toBe(false));
    bridge.invoke.mockImplementation(async (method: string) => {
      if (method === 'getStashes') throw { code: 'GIT_FAILED', message: 'boom' } as AppError;
      throw new Error(`unexpected method ${method}`);
    });

    await store.loadStashes();

    expect(store.stashesError()).toEqual({ code: 'GIT_FAILED', message: 'boom', details: {} });
    expect(store.stashes()).toEqual([]);
  });

  it('loadStashes maps IPC_UNAVAILABLE to refsOffline', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.stashesLoading()).toBe(false));
    bridge.invoke.mockImplementation(async (method: string) => {
      if (method === 'getStashes') throw { code: 'IPC_UNAVAILABLE', message: 'no bridge' } as AppError;
      throw new Error(`unexpected method ${method}`);
    });

    await store.loadStashes();

    expect(store.refsOffline()).toBe(true);
    expect(store.stashesError()).toBeNull();
  });

  it('stashApply sends the index, reloads stashes and refreshes status', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.stashesLoading()).toBe(false));
    bridge.invoke.mockImplementation(refsImpl({ stashApply: () => ({}) }));
    const before = store.statusRefreshRequested();

    expect(await store.stashApply(2, true)).toBe(true);

    expect(bridge.invoke).toHaveBeenCalledWith('stashApply', {
      repoId: REPO_A.id,
      index: 2,
      restoreIndex: true,
    });
    expect(store.statusRefreshRequested()).toBe(before + 1);
    expect(store.stashOpRunning()).toBe(false);
    expect(store.stashOpError()).toBeNull();
  });

  it('stashApply defaults restoreIndex to false', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.stashesLoading()).toBe(false));
    bridge.invoke.mockImplementation(refsImpl({ stashApply: () => ({}) }));

    await store.stashApply(0);

    expect(bridge.invoke).toHaveBeenCalledWith('stashApply', {
      repoId: REPO_A.id,
      index: 0,
      restoreIndex: false,
    });
  });

  it('stashPop sends the index and reloads stashes', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.stashesLoading()).toBe(false));
    bridge.invoke.mockImplementation(refsImpl({ stashPop: () => ({}) }));
    const before = store.statusRefreshRequested();

    expect(await store.stashPop(1)).toBe(true);

    expect(bridge.invoke).toHaveBeenCalledWith('stashPop', { repoId: REPO_A.id, index: 1 });
    expect(store.statusRefreshRequested()).toBe(before + 1);
  });

  it('stashDrop sends the index and reloads stashes without a status refresh', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.stashesLoading()).toBe(false));
    bridge.invoke.mockImplementation(refsImpl({ stashDrop: () => ({}) }));
    const before = store.statusRefreshRequested();

    expect(await store.stashDrop(3)).toBe(true);

    expect(bridge.invoke).toHaveBeenCalledWith('stashDrop', { repoId: REPO_A.id, index: 3 });
    expect(store.statusRefreshRequested()).toBe(before);
  });

  it('stash mutations no-op without an active repo', async () => {
    expect(await store.stashApply(0)).toBe(false);
    expect(await store.stashPop(0)).toBe(false);
    expect(await store.stashDrop(0)).toBe(false);

    expect(bridge.invoke).not.toHaveBeenCalledWith('stashApply', expect.anything());
    expect(bridge.invoke).not.toHaveBeenCalledWith('stashPop', expect.anything());
    expect(bridge.invoke).not.toHaveBeenCalledWith('stashDrop', expect.anything());
  });

  it('a stash mutation records stashOpError on a generic failure', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.stashesLoading()).toBe(false));
    bridge.invoke.mockImplementation(
      refsImpl({
        stashPop: () => {
          throw { code: 'STASH_FAILED', message: 'boom' } as AppError;
        },
      }),
    );

    expect(await store.stashPop(0)).toBe(false);
    expect(store.stashOpError()).toEqual({ code: 'STASH_FAILED', message: 'boom', details: {} });
    expect(store.stashOpRunning()).toBe(false);
  });

  it('a stash mutation maps IPC_UNAVAILABLE to refsOffline', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.stashesLoading()).toBe(false));
    bridge.invoke.mockImplementation(
      refsImpl({
        stashDrop: () => {
          throw { code: 'IPC_UNAVAILABLE', message: 'no bridge' } as AppError;
        },
      }),
    );

    expect(await store.stashDrop(0)).toBe(false);
    expect(store.refsOffline()).toBe(true);
    expect(store.stashOpError()).toBeNull();
  });

  it('ignores a re-entrant stash mutation while running', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.stashesLoading()).toBe(false));

    let resolveApply: (value: unknown) => void = () => {};
    bridge.invoke.mockImplementation((method: string) => {
      if (method === 'stashApply') {
        return new Promise((resolve) => {
          resolveApply = resolve;
        });
      }
      throw new Error(`unexpected method ${method}`);
    });

    const first = store.stashApply(0);
    expect(store.stashOpRunning()).toBe(true);

    expect(await store.stashDrop(0)).toBe(false);
    expect(bridge.invoke.mock.calls.filter((c) => c[0] === 'stashDrop')).toHaveLength(0);

    resolveApply({});
    await first;
    expect(store.stashOpRunning()).toBe(false);
  });

  it('clearStashOpError resets the recorded failure', () => {
    store.stashOpError.set({ code: 'STASH_FAILED', message: 'boom' });

    store.clearStashOpError();

    expect(store.stashOpError()).toBeNull();
  });

  it('stashPush reloads stashes and refreshes status on success', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockClear();
    const before = store.statusRefreshRequested();

    expect(await store.stashPush('msg')).toBe(true);

    expect(bridge.invoke.mock.calls.filter((c) => c[0] === 'getStashes')).toHaveLength(1);
    expect(store.statusRefreshRequested()).toBe(before + 1);
  });

  // -- git-flow presets (ADR-027) ------------------------------------------

  const GIT_FLOW_CONFIG: GitFlowConfig = {
    mainBranch: 'main',
    developBranch: 'develop',
    featurePrefix: 'feature/',
    releasePrefix: 'release/',
    hotfixPrefix: 'hotfix/',
    versionTagPrefix: 'v',
  };

  it('loadGitFlowConfig stores the config for the active repository', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.stashesLoading()).toBe(false));
    bridge.invoke.mockImplementation(async (method: string) => {
      if (method === 'getGitFlowConfig') return GIT_FLOW_CONFIG;
      throw new Error(`unexpected method ${method}`);
    });

    await store.loadGitFlowConfig();

    expect(bridge.invoke).toHaveBeenCalledWith('getGitFlowConfig', { repoId: REPO_A.id });
    expect(store.gitFlowConfig()).toEqual(GIT_FLOW_CONFIG);
    expect(store.gitFlowConfigLoading()).toBe(false);
    expect(store.gitFlowConfigError()).toBeNull();
  });

  it('loadGitFlowConfig clears without an active repo and records errors', async () => {
    store.gitFlowConfig.set(GIT_FLOW_CONFIG);
    await store.loadGitFlowConfig();
    expect(store.gitFlowConfig()).toBeNull();

    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.stashesLoading()).toBe(false));
    bridge.invoke.mockImplementation(async (method: string) => {
      if (method === 'getGitFlowConfig') throw { code: 'GIT_FAILED', message: 'boom' } as AppError;
      throw new Error(`unexpected method ${method}`);
    });

    await store.loadGitFlowConfig();

    expect(store.gitFlowConfigError()).toEqual({ code: 'GIT_FAILED', message: 'boom', details: {} });
  });

  it('saveGitFlowConfig stores the normalized config returned by the core', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.stashesLoading()).toBe(false));
    const saved: GitFlowConfig = { ...GIT_FLOW_CONFIG, mainBranch: 'trunk' };
    bridge.invoke.mockImplementation(refsImpl({ setGitFlowConfig: () => saved }));

    expect(await store.saveGitFlowConfig(GIT_FLOW_CONFIG)).toBe(true);

    expect(bridge.invoke).toHaveBeenCalledWith('setGitFlowConfig', {
      repoId: REPO_A.id,
      config: GIT_FLOW_CONFIG,
    });
    expect(store.gitFlowConfig()).toEqual(saved);
    expect(store.gitFlowRunning()).toBe(false);
  });

  it('startGitFlow sends the request, reloads and publishes the result', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockImplementation(
      refsImpl({ startGitFlow: () => ({ branch: 'feature/login', steps: ['checkout develop'], hasConflict: false }) }),
    );
    const before = store.statusRefreshRequested();

    expect(await store.startGitFlow('FEATURE', 'login', 'develop')).toBe(true);

    expect(bridge.invoke).toHaveBeenCalledWith('startGitFlow', {
      repoId: REPO_A.id,
      kind: 'FEATURE',
      name: 'login',
      base: 'develop',
    });
    expect(store.gitFlowResult()).toEqual({
      branch: 'feature/login',
      steps: ['checkout develop'],
      hasConflict: false,
    });
    expect(store.statusRefreshRequested()).toBe(before + 1);
    expect(store.gitFlowRunning()).toBe(false);
  });

  it('startGitFlow no-ops without an active repo, a blank name or while running', async () => {
    expect(await store.startGitFlow('FEATURE', 'login', '')).toBe(false);

    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockClear();

    expect(await store.startGitFlow('FEATURE', '   ', '')).toBe(false);
    expect(bridge.invoke).not.toHaveBeenCalledWith('startGitFlow', expect.anything());
  });

  it('finishGitFlow publishes the steps and clears a previous conflict on success', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    store.mergeConflict.set({ hasConflict: true, oid: 'old' });
    bridge.invoke.mockImplementation(
      refsImpl({ finishGitFlow: () => ({ branch: 'feature/login', steps: ['merge feature/login'], hasConflict: false }) }),
    );

    expect(await store.finishGitFlow('FEATURE', 'login', true)).toBe(true);

    expect(bridge.invoke).toHaveBeenCalledWith('finishGitFlow', {
      repoId: REPO_A.id,
      kind: 'FEATURE',
      name: 'login',
      deleteBranch: true,
    });
    expect(store.gitFlowResult()?.steps).toEqual(['merge feature/login']);
    expect(store.mergeConflict()).toBeNull();
  });

  it('finishGitFlow surfaces a hasConflict result and refreshes', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockImplementation(
      refsImpl({ finishGitFlow: () => ({ branch: 'release/1.0', steps: ['merge release/1.0'], hasConflict: true }) }),
    );
    const before = store.statusRefreshRequested();

    expect(await store.finishGitFlow('RELEASE', '1.0', true)).toBe(true);

    expect(store.gitFlowResult()?.hasConflict).toBe(true);
    expect(store.mergeConflict()).toEqual({ hasConflict: true, oid: '' });
    expect(store.statusRefreshRequested()).toBe(before + 1);
    expect(store.gitFlowError()).toBeNull();
  });

  it('finishGitFlow treats a MERGE_CONFLICT rejection as a surfaced conflict', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockImplementation(
      refsImpl({
        finishGitFlow: () => {
          throw { code: 'MERGE_CONFLICT', message: 'conflict' } as AppError;
        },
      }),
    );

    expect(await store.finishGitFlow('HOTFIX', '1.0.1', false)).toBe(true);

    expect(store.gitFlowResult()).toEqual({ branch: '', steps: [], hasConflict: true });
    expect(store.mergeConflict()).toEqual({ hasConflict: true, oid: '' });
    expect(store.gitFlowError()).toBeNull();
  });

  it('finishGitFlow records gitFlowError on a generic failure', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockImplementation(
      refsImpl({
        finishGitFlow: () => {
          throw { code: 'GIT_FLOW_FAILED', message: 'boom' } as AppError;
        },
      }),
    );

    expect(await store.finishGitFlow('FEATURE', 'login', true)).toBe(false);
    expect(store.gitFlowError()).toEqual({ code: 'GIT_FLOW_FAILED', message: 'boom', details: {} });
    expect(store.gitFlowRunning()).toBe(false);
  });

  it('git-flow mutations map IPC_UNAVAILABLE to refsOffline', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));
    bridge.invoke.mockImplementation(
      refsImpl({
        startGitFlow: () => {
          throw { code: 'IPC_UNAVAILABLE', message: 'no bridge' } as AppError;
        },
      }),
    );

    expect(await store.startGitFlow('FEATURE', 'login', '')).toBe(false);
    expect(store.refsOffline()).toBe(true);
    expect(store.gitFlowError()).toBeNull();
  });

  it('clearGitFlowError and dismissGitFlowResult reset the git-flow signals', () => {
    store.gitFlowError.set({ code: 'GIT_FLOW_FAILED', message: 'boom' });
    store.gitFlowResult.set({ branch: 'feature/x', steps: [], hasConflict: false });

    store.clearGitFlowError();
    store.dismissGitFlowResult();

    expect(store.gitFlowError()).toBeNull();
    expect(store.gitFlowResult()).toBeNull();
  });

  it('ignores a re-entrant git-flow mutation while running', async () => {
    store.setActive(REPO_A);
    await vi.waitFor(() => expect(store.branches()).toEqual(['main-a', 'feature-a']));

    let resolveStart: (value: unknown) => void = () => {};
    bridge.invoke.mockImplementation((method: string) => {
      if (method === 'startGitFlow') {
        return new Promise((resolve) => {
          resolveStart = resolve;
        });
      }
      throw new Error(`unexpected method ${method}`);
    });

    const first = store.startGitFlow('FEATURE', 'login', '');
    expect(store.gitFlowRunning()).toBe(true);

    expect(await store.finishGitFlow('FEATURE', 'login', true)).toBe(false);
    expect(await store.saveGitFlowConfig(GIT_FLOW_CONFIG)).toBe(false);
    expect(bridge.invoke.mock.calls.filter((c) => c[0] === 'finishGitFlow')).toHaveLength(0);
    expect(bridge.invoke.mock.calls.filter((c) => c[0] === 'setGitFlowConfig')).toHaveLength(0);

    resolveStart({ branch: 'feature/login', steps: [], hasConflict: false });
    await first;
    expect(store.gitFlowRunning()).toBe(false);
  });
});
