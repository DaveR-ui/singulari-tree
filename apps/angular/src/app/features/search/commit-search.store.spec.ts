import { signal } from '@angular/core';
import type { CommitSearchHit, SearchCommitsResponse } from '@contracts/gitcore';
import type { Repository } from '@contracts/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcBridge } from '@core/services/ipc-bridge.service';
import type { RepoState } from '@core/services/repo-state.service';
import { COMMIT_SEARCH_LIMIT, CommitSearchStore } from './commit-search.store';

function makeHit(overrides: Partial<CommitSearchHit> & { repoId: string; oid: string }): CommitSearchHit {
  return {
    repoId: overrides.repoId,
    oid: overrides.oid,
    message: overrides.message ?? `commit ${overrides.oid}`,
    authorName: overrides.authorName ?? 'Ada',
    authorEmail: overrides.authorEmail ?? 'ada@example.com',
    committedAt: overrides.committedAt ?? 1_700_000_000,
  };
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

function makeBridge(
  handler: (req: { query: string; repoIds: string[]; limit: number }) => Promise<SearchCommitsResponse>,
) {
  const invoke = vi.fn((method: string, req: unknown) => {
    if (method === 'searchCommits') return handler(req as never);
    throw new Error(`unexpected method ${method}`);
  });
  return { bridge: { invoke } as unknown as IpcBridge, invoke };
}

function makeRepoState(repos: Repository[] = []) {
  return { repos: signal(repos) } as unknown as RepoState;
}

function makeStore(bridge: IpcBridge, repos: Repository[] = []) {
  return new CommitSearchStore(bridge, makeRepoState(repos));
}

describe('CommitSearchStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends only {query, repo_ids, limit} and stores the hits', async () => {
    const hit = makeHit({ repoId: 'repo-1', oid: 'a'.repeat(40) });
    const { bridge, invoke } = makeBridge(async () => ({ hits: [hit] }));
    const store = makeStore(bridge);

    await store.search('  fix bug  ', ['repo-1', 'repo-2']);

    expect(invoke).toHaveBeenCalledWith('searchCommits', {
      query: 'fix bug',
      repoIds: ['repo-1', 'repo-2'],
      limit: COMMIT_SEARCH_LIMIT,
    });
    expect(store.hits()).toEqual([hit]);
    expect(store.loading()).toBe(false);
    expect(store.hasSearched()).toBe(true);
  });

  it('clears results for a blank query without calling the bridge', async () => {
    const { bridge, invoke } = makeBridge(async () => ({ hits: [] }));
    const store = makeStore(bridge);
    store.hits.set([makeHit({ repoId: 'r', oid: 'x' })]);

    await store.search('   ', ['repo-1']);

    expect(invoke).not.toHaveBeenCalled();
    expect(store.hits()).toEqual([]);
    expect(store.hasSearched()).toBe(false);
  });

  it('groups hits by repository using the repository display name', async () => {
    const { bridge } = makeBridge(async () => ({
      hits: [
        makeHit({ repoId: 'repo-1', oid: 'a' }),
        makeHit({ repoId: 'repo-2', oid: 'b' }),
        makeHit({ repoId: 'repo-1', oid: 'c' }),
      ],
    }));
    const store = makeStore(bridge, [makeRepo('repo-1', 'Alpha'), makeRepo('repo-2', 'Beta')]);

    await store.search('x', ['repo-1', 'repo-2']);

    expect(store.groups()).toEqual([
      { repoId: 'repo-1', repoName: 'Alpha', hits: [expect.objectContaining({ oid: 'a' }), expect.objectContaining({ oid: 'c' })] },
      { repoId: 'repo-2', repoName: 'Beta', hits: [expect.objectContaining({ oid: 'b' })] },
    ]);
  });

  it('falls back to the repo id when the repository is unknown', async () => {
    const { bridge } = makeBridge(async () => ({ hits: [makeHit({ repoId: 'ghost', oid: 'a' })] }));
    const store = makeStore(bridge);

    await store.search('x', ['ghost']);

    expect(store.groups()[0].repoName).toBe('ghost');
  });

  it('surfaces a non-IPC failure on error and clears hits', async () => {
    const { bridge } = makeBridge(async () => {
      throw { code: 'GIT_FAILED', message: 'boom' };
    });
    const store = makeStore(bridge);
    store.hits.set([makeHit({ repoId: 'r', oid: 'x' })]);

    await store.search('x', ['r']);

    expect(store.error()?.message).toBe('boom');
    expect(store.hits()).toEqual([]);
    expect(store.loading()).toBe(false);
  });

  it('degrades to offline on IPC_UNAVAILABLE', async () => {
    const { bridge } = makeBridge(async () => {
      throw { code: 'IPC_UNAVAILABLE', message: 'no bridge' };
    });
    const store = makeStore(bridge);

    await store.search('x', ['r']);

    expect(store.offline()).toBe(true);
    expect(store.error()).toBeNull();
  });

  it('discards a stale response that resolves after a newer search', async () => {
    let resolveFirst: ((res: SearchCommitsResponse) => void) | null = null;
    let resolveSecond: ((res: SearchCommitsResponse) => void) | null = null;
    let call = 0;
    const { bridge } = makeBridge(
      () =>
        new Promise<SearchCommitsResponse>((resolve) => {
          call++;
          if (call === 1) resolveFirst = resolve;
          else resolveSecond = resolve;
        }),
    );
    const store = makeStore(bridge);

    const first = store.search('one', ['r']);
    const second = store.search('two', ['r']);

    resolveSecond!({ hits: [makeHit({ repoId: 'r', oid: 'second' })] });
    await second;
    resolveFirst!({ hits: [makeHit({ repoId: 'r', oid: 'first' })] });
    await first;

    expect(store.hits().map((h) => h.oid)).toEqual(['second']);
  });

  it('clear resets every state', async () => {
    const { bridge } = makeBridge(async () => ({ hits: [makeHit({ repoId: 'r', oid: 'a' })] }));
    const store = makeStore(bridge);
    await store.search('x', ['r']);

    store.clear();

    expect(store.query()).toBe('');
    expect(store.hits()).toEqual([]);
    expect(store.hasSearched()).toBe(false);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });
});
