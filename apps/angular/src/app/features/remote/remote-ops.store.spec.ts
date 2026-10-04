import { signal } from '@angular/core';
import type { DestroyRef } from '@angular/core';
import type { Branch, Remote, Tag } from '@contracts/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcBridge } from '@core/services/ipc-bridge.service';
import type { RepoState } from '@core/services/repo-state.service';
import { parseRemoteTracking } from './remote-models';
import { RemoteOpsStore } from './remote-ops.store';

// -- fixtures ---------------------------------------------------------------

function branch(overrides: Partial<Branch> & { name: string }): Branch {
  return {
    name: overrides.name,
    refName: overrides.refName ?? `refs/heads/${overrides.name}`,
    tip: overrides.tip ?? undefined,
    upstream: overrides.upstream ?? '',
    isCurrent: overrides.isCurrent ?? false,
    isRemote: overrides.isRemote ?? false,
  };
}

function remote(name: string, url = `https://example.com/${name}.git`): Remote {
  return { name, urls: [url], fetchSpecs: [] };
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

type Handler = (req: unknown) => unknown;

function makeBridge(overrides: Partial<Record<string, Handler>> = {}) {
  const handlers: Record<string, Handler> = {
    getBranches: () => ({ branches: [] }),
    getRemotes: () => ({ remotes: [] }),
    getTags: () => ({ tags: [] }),
    fetch: () => Promise.resolve(),
    pull: () => Promise.resolve(),
    push: () => Promise.resolve(),
    ...overrides,
  };

  const invoke = vi.fn((method: string, req: unknown): unknown => {
    const handler = handlers[method];
    if (!handler) throw new Error(`unexpected method ${method}`);
    return handler(req);
  });
  const onProgress = vi.fn(
    (_cb: (payload: { percent: number; message: string }) => void) => () => {},
  );

  return {
    bridge: { invoke, onProgress } as unknown as IpcBridge,
    invoke,
    onProgress,
  };
}

function makeRepoState(id: string | null = 'repo-1'): RepoState {
  return { activeId: signal<string | null>(id) } as unknown as RepoState;
}

function makeDestroyRef(): DestroyRef {
  return { onDestroy: vi.fn() } as unknown as DestroyRef;
}

function makeStore(
  bridge: IpcBridge,
  repoState: RepoState = makeRepoState(),
  destroyRef: DestroyRef = makeDestroyRef(),
): RemoteOpsStore {
  return new RemoteOpsStore(bridge, repoState, destroyRef);
}

function callsTo(invoke: ReturnType<typeof vi.fn>, method: string): unknown[][] {
  return (invoke.mock.calls as unknown[][]).filter(([m]) => m === method);
}

// -- tests ------------------------------------------------------------------

describe('parseRemoteTracking', () => {
  it('splits a remote-tracking ref, preserving slashes in the branch', () => {
    expect(parseRemoteTracking('refs/remotes/origin/david/fix-x')).toEqual({
      remote: 'origin',
      branch: 'david/fix-x',
    });
  });

  it('returns null for non remote-tracking refs and malformed input', () => {
    expect(parseRemoteTracking('refs/heads/main')).toBeNull();
    expect(parseRemoteTracking('refs/remotes/origin')).toBeNull();
    expect(parseRemoteTracking('')).toBeNull();
  });
});

describe('RemoteOpsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subscribes to progress once and unsubscribes on destroy', () => {
    const { bridge, onProgress, invoke } = makeBridge();
    const onDestroy = vi.fn();
    const destroyRef = { onDestroy } as unknown as DestroyRef;

    const store = makeStore(bridge, makeRepoState(), destroyRef);

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onDestroy).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();

    const unsubscribe = (onProgress.mock.results[0]?.value as () => void) ?? (() => {});
    expect(onDestroy).toHaveBeenCalledWith(unsubscribe);

    const emit = onProgress.mock.calls[0]?.[0] as ((p: { percent: number; message: string }) => void) | undefined;
    emit?.({ percent: 42, message: 'Receiving objects' });
    expect(store.progress()).toEqual({ percent: 42, message: 'Receiving objects' });
  });

  it('openDialog sets the active dialog and triggers the ref reads', () => {
    const { bridge, invoke } = makeBridge();
    const store = makeStore(bridge);

    store.openDialog('pull');

    expect(store.activeDialog()).toBe('pull');
    expect(store.dialogOpen()).toBe(true);
    expect(callsTo(invoke, 'getBranches')).toHaveLength(1);
    expect(callsTo(invoke, 'getRemotes')).toHaveLength(1);
    expect(callsTo(invoke, 'getTags')).toHaveLength(1);
  });

  it('openDialog is a no-op without an active repository', () => {
    const { bridge, invoke } = makeBridge();
    const store = makeStore(bridge, makeRepoState(null));

    store.openDialog('push');

    expect(store.activeDialog()).toBeNull();
    expect(store.dialogOpen()).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('closeDialog clears the dialog, progress and error', () => {
    const { bridge } = makeBridge();
    const store = makeStore(bridge);
    store.openDialog('fetch');
    store.opError.set({ code: 'X', message: 'boom' });
    store.progress.set({ percent: 10, message: 'go' });

    store.closeDialog();

    expect(store.activeDialog()).toBeNull();
    expect(store.progress()).toBeNull();
    expect(store.opError()).toBeNull();
  });

  it('loadRefs maps remote options, push rows and remote branches by remote', async () => {
    const locals = [
      branch({ name: 'main', isCurrent: true, upstream: 'refs/remotes/origin/main' }),
      branch({ name: 'feature', upstream: 'refs/remotes/origin/feature' }),
      branch({ name: 'feature-copy', upstream: 'refs/remotes/origin/feature' }),
      branch({ name: 'local-only' }),
    ];
    const { bridge } = makeBridge({
      getBranches: () => ({ branches: locals }),
      getRemotes: () => ({ remotes: [remote('origin', 'git@example.com:origin.git')] }),
      getTags: () => ({ tags: [tag('v1.0.0')] }),
    });
    const store = makeStore(bridge);

    await store.loadRefs();

    expect(store.refsLoading()).toBe(false);
    expect(store.refsError()).toBeNull();
    expect(store.remoteOptions()).toEqual([{ name: 'origin', url: 'git@example.com:origin.git' }]);
    expect(store.localBranchNames()).toEqual(['main', 'feature', 'feature-copy', 'local-only']);
    expect(store.currentBranch()).toBe('main');
    expect(store.tags().map((t) => t.name)).toEqual(['v1.0.0']);
    expect(store.pushRows().map((row) => row.defaultRemoteBranch)).toEqual([
      'main',
      'feature',
      'feature',
      'local-only',
    ]);
    expect(store.pushRows()[0]?.isCurrent).toBe(true);
    expect(store.remoteBranchesByRemote()['origin']).toEqual([
      { name: 'main', refName: 'refs/remotes/origin/main', derivedFromUpstream: true },
      { name: 'feature', refName: 'refs/remotes/origin/feature', derivedFromUpstream: true },
    ]);
  });

  it('loadRefs sets offline and clears lists on IPC_UNAVAILABLE', async () => {
    const { bridge } = makeBridge({
      getBranches: () => {
        throw { code: 'IPC_UNAVAILABLE', message: 'Not running inside Electron' };
      },
    });
    const store = makeStore(bridge);
    store.remotes.set([remote('origin')]);

    await store.loadRefs();

    expect(store.offline()).toBe(true);
    expect(store.refsError()).toBeNull();
    expect(store.remotes()).toEqual([]);
    expect(store.locals()).toEqual([]);
    expect(store.tags()).toEqual([]);
    expect(store.refsLoading()).toBe(false);
  });

  it('loadRefs records non-IPC failures on refsError and clears lists', async () => {
    const { bridge } = makeBridge({
      getBranches: () => Promise.reject({ code: 'GIT_FAILED', message: 'boom' }),
    });
    const store = makeStore(bridge);
    store.remotes.set([remote('origin')]);

    await store.loadRefs();

    expect(store.offline()).toBe(false);
    expect(store.refsError()).toEqual({ code: 'GIT_FAILED', message: 'boom', details: {} });
    expect(store.remotes()).toEqual([]);
  });

  it('clears the ref lists when there is no active repository', async () => {
    const { bridge, invoke } = makeBridge();
    const store = makeStore(bridge, makeRepoState(null));
    store.locals.set([branch({ name: 'main' })]);

    await store.loadRefs();

    expect(invoke).not.toHaveBeenCalled();
    expect(store.locals()).toEqual([]);
    expect(store.refsLoading()).toBe(false);
  });

  it('discards a stale loadRefs response after the active repo changes', async () => {
    const activeId = signal<string | null>('repo-a');
    const repoState = { activeId } as unknown as RepoState;
    const pending: Array<{ repoId: string; resolve: (value: unknown) => void }> = [];
    const { bridge } = makeBridge({
      getBranches: (req) =>
        new Promise((resolve) => {
          pending.push({ repoId: (req as { repoId: string }).repoId, resolve });
        }),
    });
    const store = makeStore(bridge, repoState);

    const first = store.loadRefs();
    activeId.set('repo-b');
    const second = store.loadRefs();

    pending.find((p) => p.repoId === 'repo-b')!.resolve({ branches: [branch({ name: 'b-main' })] });
    await second;
    expect(store.localBranchNames()).toEqual(['b-main']);

    // The first (now stale) response resolves last and must not overwrite repo B.
    pending.find((p) => p.repoId === 'repo-a')!.resolve({ branches: [branch({ name: 'a-main' })] });
    await first;
    expect(store.localBranchNames()).toEqual(['b-main']);
  });

  it('runFetch with allRemotes fetches every remote sequentially', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const { bridge, invoke } = makeBridge({
      fetch: async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight--;
      },
    });
    const store = makeStore(bridge);
    store.remotes.set([remote('origin'), remote('upstream')]);

    await store.runFetch({ allRemotes: true, remote: '', prune: true, tags: true, force: true });

    expect(invoke).toHaveBeenCalledWith('fetch', {
      repoId: 'repo-1',
      remote: 'origin',
      prune: true,
      tags: true,
      force: true,
    });
    expect(invoke).toHaveBeenCalledWith('fetch', {
      repoId: 'repo-1',
      remote: 'upstream',
      prune: true,
      tags: true,
      force: true,
    });
    expect(callsTo(invoke, 'fetch')).toHaveLength(2);
    expect(maxInFlight).toBe(1);
    expect(store.running()).toBe(false);
    expect(store.progress()).toBeNull();
  });

  it('runFetch with a single remote fetches just that one', async () => {
    const { bridge, invoke } = makeBridge();
    const store = makeStore(bridge);

    await store.runFetch({ allRemotes: false, remote: 'origin', prune: false, tags: false, force: false });

    expect(callsTo(invoke, 'fetch')).toEqual([
      ['fetch', { repoId: 'repo-1', remote: 'origin', prune: false, tags: false, force: false }],
    ]);
  });

  it('runPull invokes the pull RPC with every option', async () => {
    const { bridge, invoke } = makeBridge();
    const store = makeStore(bridge);

    await store.runPull({
      remote: 'origin',
      branch: 'main',
      intoLocalBranch: 'release',
      noCommit: true,
      log: true,
      noFf: true,
      rebase: true,
    });

    expect(invoke).toHaveBeenCalledWith('pull', {
      repoId: 'repo-1',
      remote: 'origin',
      branch: 'main',
      localBranch: 'release',
      noCommit: true,
      log: true,
      noFf: true,
      rebase: true,
    });
    expect(store.running()).toBe(false);
  });

  it('runPush invokes once per selected row forwarding remoteBranch, track, tags and force', async () => {
    const { bridge, invoke } = makeBridge();
    const store = makeStore(bridge);

    await store.runPush({
      remote: 'origin',
      tags: true,
      force: true,
      branches: [
        { localBranch: 'main', remoteBranch: 'main', track: true },
        { localBranch: 'feature', remoteBranch: 'feature-x', track: false },
        { localBranch: 'local-only', remoteBranch: '', track: false },
        { localBranch: '', remoteBranch: 'ignored', track: false },
      ],
    });

    const pushes = callsTo(invoke, 'push');
    expect(pushes).toEqual([
      [
        'push',
        {
          repoId: 'repo-1',
          remote: 'origin',
          branch: 'main',
          remoteBranch: 'main',
          setUpstream: true,
          tags: true,
          force: true,
        },
      ],
      [
        'push',
        {
          repoId: 'repo-1',
          remote: 'origin',
          branch: 'feature',
          remoteBranch: 'feature-x',
          setUpstream: false,
          tags: true,
          force: true,
        },
      ],
      [
        'push',
        {
          repoId: 'repo-1',
          remote: 'origin',
          branch: 'local-only',
          remoteBranch: '',
          setUpstream: false,
          tags: true,
          force: true,
        },
      ],
    ]);
  });

  it('surfaces a real failure opError as-is and stops running', async () => {
    const { bridge } = makeBridge({
      pull: () => Promise.reject({ code: 'PULL_FAILED', message: 'merge conflict' }),
    });
    const store = makeStore(bridge);

    await store.runPull({
      remote: 'origin',
      branch: 'main',
      intoLocalBranch: 'main',
      noCommit: false,
      log: false,
      noFf: false,
      rebase: false,
    });

    expect(store.running()).toBe(false);
    expect(store.opError()).toEqual({
      code: 'PULL_FAILED',
      message: 'merge conflict',
      details: {},
    });
    expect(store.offline()).toBe(false);
  });

  it('surfaces fetch and push failures verbatim too', async () => {
    const { bridge: fetchBridge } = makeBridge({
      fetch: () => Promise.reject({ code: 'FETCH_FAILED', message: 'network down' }),
    });
    const fetchStore = makeStore(fetchBridge);
    await fetchStore.runFetch({
      allRemotes: false,
      remote: 'origin',
      prune: false,
      tags: false,
      force: false,
    });
    expect(fetchStore.opError()?.code).toBe('FETCH_FAILED');
    expect(fetchStore.opError()?.message).toBe('network down');

    const { bridge: pushBridge } = makeBridge({
      push: () => Promise.reject({ code: 'PUSH_FAILED', message: 'rejected' }),
    });
    const pushStore = makeStore(pushBridge);
    await pushStore.runPush({
      remote: 'origin',
      tags: false,
      force: false,
      branches: [{ localBranch: 'main', remoteBranch: 'main', track: false }],
    });
    expect(pushStore.opError()?.code).toBe('PUSH_FAILED');
    expect(pushStore.opError()?.message).toBe('rejected');
  });

  it('marks offline when a remote operation finds no bridge', async () => {
    const { bridge } = makeBridge({
      fetch: () => {
        throw { code: 'IPC_UNAVAILABLE', message: 'Not running inside Electron' };
      },
    });
    const store = makeStore(bridge);

    await store.runFetch({ allRemotes: false, remote: 'origin', prune: false, tags: false, force: false });

    expect(store.offline()).toBe(true);
    expect(store.opError()).toBeNull();
    expect(store.running()).toBe(false);
  });

  it('guards re-entrancy while an operation is pending', async () => {
    let resolvePull: (() => void) | undefined;
    const { bridge, invoke } = makeBridge({
      pull: () =>
        new Promise<void>((resolve) => {
          resolvePull = resolve;
        }),
    });
    const store = makeStore(bridge);

    const pullIntent = {
      remote: 'origin',
      intoLocalBranch: 'main',
      noCommit: false,
      log: false,
      noFf: false,
      rebase: false,
    };
    const first = store.runPull({ ...pullIntent, branch: 'main' });
    await store.runPull({ ...pullIntent, branch: 'dev', intoLocalBranch: 'dev' });

    expect(store.running()).toBe(true);
    expect(callsTo(invoke, 'pull')).toHaveLength(1);

    resolvePull?.();
    await first;

    expect(store.running()).toBe(false);
  });

  it('never runs without an active repository', async () => {
    const { bridge, invoke } = makeBridge();
    const store = makeStore(bridge, makeRepoState(null));

    await store.runFetch({ allRemotes: true, remote: '', prune: false, tags: false, force: false });
    await store.runPull({
      remote: 'origin',
      branch: 'main',
      intoLocalBranch: 'main',
      noCommit: false,
      log: false,
      noFf: false,
      rebase: false,
    });
    await store.runPush({
      remote: 'origin',
      tags: false,
      force: false,
      branches: [{ localBranch: 'main', remoteBranch: 'main', track: false }],
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(store.running()).toBe(false);
  });
});
