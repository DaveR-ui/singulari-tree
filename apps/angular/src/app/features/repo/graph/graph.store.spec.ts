import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Commit, Diff, Lane, Repository } from '@contracts/domain';
import type { GetCommitsResponse } from '@contracts/gitcore';
import { IpcBridge } from '@core/services/ipc-bridge.service';
import { COMMIT_FOCUS_MAX_LOADS, GRAPH_WINDOW_SIZE, GraphStore, WIP_OID } from './graph.store';

const REPO: Repository = {
  id: 'repo-1',
  fsPath: '/tmp/repo',
  commonDir: '/tmp/repo/.git',
  name: 'repo',
  createdAt: '2026-01-01T00:00:00Z',
  lastOpenedAt: '2026-01-01T00:00:00Z',
};

function makeCommit(index: number, refs: Commit['refs'] = []): Commit {
  const hex = index.toString(16).padStart(40, '0');
  return {
    oid: { hex, kind: 'SHA1' },
    parents: [],
    author: { name: `Author ${index}`, email: `author${index}@example.com`, when: '2026-01-02T10:00:00Z' },
    committer: undefined,
    message: `commit ${index}`,
    treeOid: undefined,
    committedAt: '2026-01-02T10:05:00Z',
    refs,
  };
}

function makePage(count: number, startIndex = 0, total = count): GetCommitsResponse {
  const commits = Array.from({ length: count }, (_, i) => makeCommit(startIndex + i));
  const lanes: Lane[] = commits.map((_, i) => ({
    index: i % 3,
    color: i % 8,
    continues: i % 2 === 0,
  }));
  return { commits, total, lanes };
}

type Handler = (req: unknown) => unknown;
type Handlers = Partial<
  Record<
    'getCommits' | 'openRepository' | 'listRepositories' | 'getCommitStats' | 'reset' | 'getDiff',
    Handler
  >
>;

function makeBridge(handlers: Handlers): IpcBridge {
  return {
    invoke: vi.fn((method: string, req: unknown) => {
      // The gauge is fetched after every page; default it to "no stats" so
      // existing window tests stay focused and need not declare a handler.
      if (method === 'getCommitStats' && !handlers.getCommitStats) {
        return Promise.resolve({ stats: [] });
      }
      const handler = handlers[method as keyof Handlers];
      if (!handler) throw new Error(`unexpected method ${method}`);
      return handler(req);
    }),
  } as unknown as IpcBridge;
}

const EMPTY_DIFF: Diff = {
  from: undefined,
  to: undefined,
  hunks: [],
  additions: 0,
  deletions: 0,
  isBinary: false,
  hasConflictMarkers: false,
  files: [],
  truncated: false,
};

/** Install a mocked `window.gitClientApi` and return the IpcBridge over it. */
function installApi(impl: Record<string, (req: unknown) => unknown>): IpcBridge {
  (window as unknown as { gitClientApi?: unknown }).gitClientApi = impl;
  return new IpcBridge();
}

function clearApi(): void {
  delete (window as unknown as { gitClientApi?: unknown }).gitClientApi;
}

describe('GraphStore', () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore(
      makeBridge({
        getCommits: () => makePage(0),
      }),
    );
  });

  afterEach(() => {
    clearApi();
  });

  it('loads a window and builds lane-aligned rows with the 200+100 limit', async () => {
    const getCommits = vi.fn(() => Promise.resolve(makePage(300, 0, 1000)));
    store = new GraphStore(makeBridge({ getCommits }));
    store.repoId.set(REPO.id);

    await store.loadWindow(0);

    expect(getCommits).toHaveBeenCalledWith({
      repoId: REPO.id,
      offset: 0,
      limit: GRAPH_WINDOW_SIZE + 100,
    });
    expect(store.commits()).toHaveLength(300);
    expect(store.lanes()).toHaveLength(300);
    expect(store.total()).toBe(1000);
    expect(store.hasMore()).toBe(true);
    expect(store.isLoading()).toBe(false);
    expect(store.offline()).toBe(false);

    const rows = store.rows();
    expect(rows).toHaveLength(300);
    // lanes[i] is index-aligned with commits[i] (parallel-array contract).
    rows.forEach((row, i) => {
      expect(row.commit.oid?.hex).toBe(makeCommit(i).oid?.hex);
      expect(row.lane.index).toBe(i % 3);
    });
    expect(store.maxLane()).toBe(2);
  });

  it('appends the next window on loadMore and is a no-op while loading or exhausted', async () => {
    let resolveFirst: ((value: GetCommitsResponse) => void) | undefined;
    const getCommits = vi.fn((req: unknown) => {
      const { offset } = req as { offset: number };
      if (offset === 0) {
        return new Promise<GetCommitsResponse>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve(makePage(300, offset, 1000));
    });
    store = new GraphStore(makeBridge({ getCommits }));
    store.repoId.set(REPO.id);

    const first = store.loadWindow(0);
    expect(store.isLoading()).toBe(true);
    store.loadMore(); // ignored: still loading
    expect(getCommits).toHaveBeenCalledTimes(1);

    resolveFirst?.(makePage(300, 0, 1000));
    await first;

    store.loadMore();
    await vi.waitFor(() => expect(store.commits()).toHaveLength(600));

    expect(getCommits).toHaveBeenCalledTimes(2);
    expect(getCommits).toHaveBeenLastCalledWith({ repoId: REPO.id, offset: 300, limit: 300 });
    expect(store.lanes()).toHaveLength(600);
    expect(store.offset()).toBe(600);
  });

  it('tolerates a missing lanes array by defaulting neutral lanes', async () => {
    const getCommits = vi.fn(() =>
      Promise.resolve({ commits: [makeCommit(0), makeCommit(1)], total: 2 } as GetCommitsResponse),
    );
    store = new GraphStore(makeBridge({ getCommits }));
    store.repoId.set(REPO.id);

    await store.loadWindow(0);

    expect(store.lanes()).toEqual([
      { index: 0, color: 0, continues: false },
      { index: 0, color: 0, continues: false },
    ]);
    expect(store.rows().every((row) => row.lane.index === 0)).toBe(true);
  });

  it('degrades to an empty page when the IPC bridge is unavailable', async () => {
    const getCommits = vi.fn(() => {
      throw { code: 'IPC_UNAVAILABLE', message: 'Not running inside Electron' };
    });
    store = new GraphStore(makeBridge({ getCommits }));
    store.repoId.set(REPO.id);

    await store.loadWindow(0);

    expect(store.offline()).toBe(true);
    expect(store.error()).toBeNull();
    expect(store.commits()).toEqual([]);
    expect(store.total()).toBe(0);
    expect(store.rows()).toEqual([]);
    expect(store.isLoading()).toBe(false);
  });

  it('records non-IPC failures on the error signal', async () => {
    const getCommits = vi.fn(() => Promise.reject({ code: 'GIT_FAILED', message: 'boom' }));
    store = new GraphStore(makeBridge({ getCommits }));
    store.repoId.set(REPO.id);

    await store.loadWindow(0);

    expect(store.error()).toEqual({ code: 'GIT_FAILED', message: 'boom', details: {} });
    expect(store.offline()).toBe(false);
  });

  it('opens a repository and loads its first window', async () => {
    const getCommits = vi.fn(() => Promise.resolve(makePage(2, 0, 2)));
    const openRepository = vi.fn(() => Promise.resolve(REPO));
    const listRepositories = vi.fn(() => Promise.resolve({ repositories: [REPO] }));
    store = new GraphStore(makeBridge({ getCommits, openRepository, listRepositories }));

    const repo = await store.openRepository('/tmp/repo');

    expect(openRepository).toHaveBeenCalledWith({ fsPath: '/tmp/repo' });
    expect(repo).toEqual(REPO);
    expect(store.repoId()).toBe('repo-1');
    expect(store.offline()).toBe(false);
    expect(store.commits()).toHaveLength(2);
  });

  it('loads recent repositories from listRepositories', async () => {
    const listRepositories = vi.fn(() => Promise.resolve({ repositories: [REPO] }));
    store = new GraphStore(makeBridge({ listRepositories }));

    await store.loadRecentRepos();

    expect(listRepositories).toHaveBeenCalledWith({});
    expect(store.recentRepos()).toEqual([REPO]);
    expect(store.offline()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('degrades loadRecentRepos to an empty list when the bridge is unavailable', async () => {
    const listRepositories = vi.fn(() => {
      throw { code: 'IPC_UNAVAILABLE', message: 'Not running inside Electron' };
    });
    store = new GraphStore(makeBridge({ listRepositories }));
    store.recentRepos.set([REPO]);

    await store.loadRecentRepos();

    expect(store.offline()).toBe(true);
    expect(store.error()).toBeNull();
    expect(store.recentRepos()).toEqual([]);
  });

  it('records non-IPC failures from listRepositories on the error signal', async () => {
    const listRepositories = vi.fn(() => Promise.reject({ code: 'GIT_FAILED', message: 'boom' }));
    store = new GraphStore(makeBridge({ listRepositories }));

    await store.loadRecentRepos();

    expect(store.error()).toEqual({ code: 'GIT_FAILED', message: 'boom', details: {} });
    expect(store.offline()).toBe(false);
  });

  it('refreshes the recents list after a successful open', async () => {
    const getCommits = vi.fn(() => Promise.resolve(makePage(2, 0, 2)));
    const openRepository = vi.fn(() => Promise.resolve(REPO));
    const listRepositories = vi.fn(() => Promise.resolve({ repositories: [REPO] }));
    store = new GraphStore(makeBridge({ getCommits, openRepository, listRepositories }));

    await store.openRepository('/tmp/repo');

    expect(listRepositories).toHaveBeenCalledWith({});
    expect(store.recentRepos()).toEqual([REPO]);
  });

  it('degrades openRepository to null when the bridge is unavailable', async () => {
    store = new GraphStore(
      makeBridge({
        openRepository: () => {
          throw { code: 'IPC_UNAVAILABLE', message: 'offline' };
        },
      }),
    );

    await expect(store.openRepository('/tmp/repo')).resolves.toBeNull();
    expect(store.offline()).toBe(true);
  });

  it('filters loaded rows by message, author, oid and refs', async () => {
    const page: GetCommitsResponse = {
      commits: [
        makeCommit(0, [{ name: 'main', kind: 'head' }]),
        makeCommit(1),
      ],
      total: 2,
      lanes: [
        { index: 0, color: 0, continues: false },
        { index: 1, color: 1, continues: false },
      ],
    };
    store = new GraphStore(makeBridge({ getCommits: () => Promise.resolve(page) }));
    store.repoId.set(REPO.id);
    await store.loadWindow(0);

    expect(store.filteredRows()).toHaveLength(2);

    store.setFilter('Author 1');
    expect(store.filteredRows().map((row) => row.commit.message)).toEqual(['commit 1']);

    store.setFilter('main');
    expect(store.filteredRows().map((row) => row.commit.message)).toEqual(['commit 0']);

    store.setFilter('0000000');
    expect(store.filteredRows()).toHaveLength(2);

    store.setFilter('   ');
    expect(store.filteredRows()).toHaveLength(2);
  });

  it('selects commits and the synthetic WIP node', async () => {
    store = new GraphStore(
      makeBridge({ getCommits: () => Promise.resolve(makePage(2)) }),
    );
    store.repoId.set(REPO.id);
    await store.loadWindow(0);

    expect(store.selectedRow()).toBeNull();
    expect(store.isWipSelected()).toBe(false);

    const oid = makeCommit(1).oid?.hex ?? '';
    store.select(oid);
    expect(store.selectedRow()?.commit.oid?.hex).toBe(oid);
    expect(store.isWipSelected()).toBe(false);

    store.select(WIP_OID);
    expect(store.isWipSelected()).toBe(true);
    expect(store.selectedRow()).toBeNull();
  });

  it('does nothing while no repository is open', async () => {
    const getCommits = vi.fn(() => Promise.resolve(makePage(1)));
    store = new GraphStore(makeBridge({ getCommits }));

    await store.loadWindow(0);
    store.loadMore();

    expect(getCommits).not.toHaveBeenCalled();
    expect(store.rows()).toEqual([]);
  });

  it('tracks selectedIndex over filteredRows (-1 when none/WIP/not found)', async () => {
    store = new GraphStore(makeBridge({ getCommits: () => Promise.resolve(makePage(3)) }));
    store.repoId.set(REPO.id);
    await store.loadWindow(0);

    expect(store.selectedIndex()).toBe(-1);

    store.select(makeCommit(1).oid?.hex ?? '');
    expect(store.selectedIndex()).toBe(1);

    store.select(WIP_OID);
    expect(store.selectedIndex()).toBe(-1);

    store.select('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    expect(store.selectedIndex()).toBe(-1);
  });

  it('selectNext/selectPrevious move within filtered rows and clamp at bounds', async () => {
    store = new GraphStore(makeBridge({ getCommits: () => Promise.resolve(makePage(3)) }));
    store.repoId.set(REPO.id);
    await store.loadWindow(0);

    store.selectNext();
    expect(store.selectedIndex()).toBe(0);
    expect(store.selectedOid()).toBe(makeCommit(0).oid?.hex);

    store.selectNext();
    expect(store.selectedIndex()).toBe(1);

    store.selectPrevious();
    expect(store.selectedIndex()).toBe(0);

    store.selectPrevious(); // clamp at first
    expect(store.selectedIndex()).toBe(0);

    store.selectNext();
    store.selectNext();
    store.selectNext(); // clamp at last
    expect(store.selectedIndex()).toBe(2);
    expect(store.selectedOid()).toBe(makeCommit(2).oid?.hex);
  });

  it('navigates only within the filtered rows', async () => {
    const page: GetCommitsResponse = {
      commits: [makeCommit(0, [{ name: 'main', kind: 'head' }]), makeCommit(1), makeCommit(2)],
      total: 3,
      lanes: [
        { index: 0, color: 0, continues: false },
        { index: 1, color: 1, continues: false },
        { index: 2, color: 2, continues: false },
      ],
    };
    store = new GraphStore(makeBridge({ getCommits: () => Promise.resolve(page) }));
    store.repoId.set(REPO.id);
    await store.loadWindow(0);

    store.setFilter('Author 2');
    expect(store.filteredRows()).toHaveLength(1);

    store.selectNext();
    expect(store.selectedOid()).toBe(makeCommit(2).oid?.hex);
    expect(store.selectedIndex()).toBe(0);
  });

  it('is a no-op for keyboard navigation when there are no rows', () => {
    store = new GraphStore(makeBridge({ getCommits: () => Promise.resolve(makePage(0)) }));
    store.repoId.set(REPO.id);

    store.selectNext();
    store.selectPrevious();

    expect(store.selectedOid()).toBeNull();
    expect(store.selectedIndex()).toBe(-1);
  });

  it('openDiff selects the first row when none is selected and records the intent', async () => {
    store = new GraphStore(makeBridge({ getCommits: () => Promise.resolve(makePage(2)) }));
    store.repoId.set(REPO.id);
    await store.loadWindow(0);

    expect(store.diffIntent()).toBeNull();

    store.openDiff();

    expect(store.selectedOid()).toBe(makeCommit(0).oid?.hex);
    expect(store.diffIntent()).toEqual({ oid: makeCommit(0).oid?.hex });
  });

  it('openDiff records the already-selected row without moving it', async () => {
    store = new GraphStore(makeBridge({ getCommits: () => Promise.resolve(makePage(3)) }));
    store.repoId.set(REPO.id);
    await store.loadWindow(0);

    store.select(makeCommit(2).oid?.hex ?? '');
    store.openDiff();

    expect(store.selectedOid()).toBe(makeCommit(2).oid?.hex);
    expect(store.diffIntent()).toEqual({ oid: makeCommit(2).oid?.hex });
  });

  it('openDiff is a no-op with no rows', () => {
    store = new GraphStore(makeBridge({ getCommits: () => Promise.resolve(makePage(0)) }));
    store.repoId.set(REPO.id);

    store.openDiff();

    expect(store.selectedOid()).toBeNull();
    expect(store.diffIntent()).toBeNull();
  });

  // -- commit change-size gauge (ADR-0023) ---------------------------------

  it('loads the gauge for the loaded window in one batched call and caches it', async () => {
    const getCommits = vi.fn(() => Promise.resolve(makePage(3, 0, 3)));
    const getCommitStats = vi.fn((req: unknown) => {
      const { oids } = req as { oids: string[] };
      return Promise.resolve({
        stats: oids.map((oid, i) => ({
          oid,
          additions: i + 1,
          deletions: i,
          filesChanged: 1,
        })),
      });
    });
    store = new GraphStore(makeBridge({ getCommits, getCommitStats }));
    store.repoId.set(REPO.id);

    await store.loadWindow(0);

    await vi.waitFor(() => expect(getCommitStats).toHaveBeenCalledTimes(1));
    expect(getCommitStats).toHaveBeenCalledWith({
      repoId: REPO.id,
      oids: [0, 1, 2].map((i) => makeCommit(i).oid?.hex),
    });
    expect(store.statsFor(makeCommit(1).oid?.hex)).toEqual({
      oid: makeCommit(1).oid?.hex,
      additions: 2,
      deletions: 1,
      filesChanged: 1,
    });
    expect(store.statsError()).toBeNull();
  });

  it('never re-requests cached oids and asks only for the missing ones', async () => {
    const getCommits = vi.fn(() => Promise.resolve(makePage(2, 0, 2)));
    const getCommitStats = vi.fn((req: unknown) => {
      const { oids } = req as { oids: string[] };
      return Promise.resolve({
        stats: oids.map((oid) => ({ oid, additions: 1, deletions: 0, filesChanged: 1 })),
      });
    });
    store = new GraphStore(makeBridge({ getCommits, getCommitStats }));
    store.repoId.set(REPO.id);
    await store.loadWindow(0);
    await vi.waitFor(() => expect(getCommitStats).toHaveBeenCalledTimes(1));

    getCommitStats.mockClear();
    await store.loadStats([makeCommit(0).oid?.hex ?? '', makeCommit(1).oid?.hex ?? '']);
    expect(getCommitStats).not.toHaveBeenCalled();

    const fresh = 'f'.repeat(40);
    await store.loadStats([makeCommit(0).oid?.hex ?? '', fresh]);
    expect(getCommitStats).toHaveBeenCalledWith({ repoId: REPO.id, oids: [fresh] });
  });

  it('omits a gauge for an unmeasured oid and for an undefined oid', async () => {
    store.repoId.set(REPO.id);
    expect(store.statsFor(undefined)).toBeNull();
    expect(store.statsFor('a'.repeat(40))).toBeNull();
  });

  it('does not fetch stats without a repository', async () => {
    const getCommitStats = vi.fn(() => Promise.resolve({ stats: [] }));
    store = new GraphStore(makeBridge({ getCommitStats }));

    await store.loadStats(['a'.repeat(40)]);

    expect(getCommitStats).not.toHaveBeenCalled();
  });

  it('records a non-IPC gauge failure on statsError without breaking the window', async () => {
    const getCommits = vi.fn(() => Promise.resolve(makePage(1, 0, 1)));
    const getCommitStats = vi.fn(() => Promise.reject({ code: 'GIT_FAILED', message: 'numstat' }));
    store = new GraphStore(makeBridge({ getCommits, getCommitStats }));
    store.repoId.set(REPO.id);

    await store.loadWindow(0);

    await vi.waitFor(() =>
      expect(store.statsError()).toEqual({ code: 'GIT_FAILED', message: 'numstat', details: {} }),
    );
    expect(store.commits()).toHaveLength(1);
    expect(store.offline()).toBe(false);
  });

  it('degrades the gauge to offline when the bridge is unavailable', async () => {
    const getCommits = vi.fn(() => Promise.resolve(makePage(1, 0, 1)));
    const getCommitStats = vi.fn(() => {
      throw { code: 'IPC_UNAVAILABLE', message: 'offline' };
    });
    store = new GraphStore(makeBridge({ getCommits, getCommitStats }));
    store.repoId.set(REPO.id);

    await store.loadWindow(0);

    await vi.waitFor(() => expect(store.offline()).toBe(true));
    expect(store.statsError()).toBeNull();
  });

  it('loads the gauge through a real bridge over window.gitClientApi', async () => {
    const oid = makeCommit(0).oid?.hex ?? '';
    const getCommitStats = vi.fn(() =>
      Promise.resolve({ stats: [{ oid, additions: 3, deletions: 2, filesChanged: 1 }] }),
    );
    store = new GraphStore(installApi({ getCommitStats }));
    store.repoId.set(REPO.id);

    await store.loadStats([oid]);

    expect(getCommitStats).toHaveBeenCalledWith({ repoId: REPO.id, oids: [oid] });
    expect(store.statsFor(oid)?.additions).toBe(3);
  });

  // -- reset (ADR-0021) ----------------------------------------------------

  it('resets to an oid with the named mode and reloads the graph', async () => {
    const getCommits = vi.fn(() => Promise.resolve(makePage(2, 0, 2)));
    const reset = vi.fn(() => Promise.resolve({}));
    store = new GraphStore(makeBridge({ getCommits, reset }));
    store.repoId.set(REPO.id);
    await store.loadWindow(0);
    getCommits.mockClear();

    const ok = await store.reset('a'.repeat(40), 'HARD');

    expect(ok).toBe(true);
    expect(reset).toHaveBeenCalledWith({ repoId: REPO.id, to: 'a'.repeat(40), mode: 'HARD' });
    expect(store.resetRunning()).toBe(false);
    expect(store.resetError()).toBeNull();
    await vi.waitFor(() => expect(getCommits).toHaveBeenCalled());
  });

  it('rejects an unspecified reset mode without calling the bridge', async () => {
    const reset = vi.fn(() => Promise.resolve({}));
    store = new GraphStore(makeBridge({ reset }));
    store.repoId.set(REPO.id);

    const ok = await store.reset('a'.repeat(40), 'NOPE' as never);

    expect(ok).toBe(false);
    expect(reset).not.toHaveBeenCalled();
  });

  it('no-ops a reset without a repository or a target', async () => {
    const reset = vi.fn(() => Promise.resolve({}));
    store = new GraphStore(makeBridge({ reset }));

    await expect(store.reset('a'.repeat(40), 'SOFT')).resolves.toBe(false);
    store.repoId.set(REPO.id);
    await expect(store.reset('', 'SOFT')).resolves.toBe(false);
    expect(reset).not.toHaveBeenCalled();
  });

  it('ignores a re-entrant reset while one is running', async () => {
    let release: (() => void) | undefined;
    const reset = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    store = new GraphStore(makeBridge({ reset }));
    store.repoId.set(REPO.id);

    const first = store.reset('a'.repeat(40), 'MIXED');
    expect(store.resetRunning()).toBe(true);
    const second = await store.reset('b'.repeat(40), 'SOFT');
    expect(second).toBe(false);
    expect(reset).toHaveBeenCalledTimes(1);

    release?.();
    await expect(first).resolves.toBe(true);
  });

  it('records a non-IPC reset failure and returns false', async () => {
    const reset = vi.fn(() => Promise.reject({ code: 'RESET_FAILED', message: 'boom' }));
    store = new GraphStore(makeBridge({ reset }));
    store.repoId.set(REPO.id);

    const ok = await store.reset('a'.repeat(40), 'SOFT');

    expect(ok).toBe(false);
    expect(store.resetError()).toEqual({ code: 'RESET_FAILED', message: 'boom', details: {} });
    expect(store.resetRunning()).toBe(false);
  });

  it('degrades a reset to offline on IPC_UNAVAILABLE', async () => {
    const reset = vi.fn(() => {
      throw { code: 'IPC_UNAVAILABLE', message: 'offline' };
    });
    store = new GraphStore(makeBridge({ reset }));
    store.repoId.set(REPO.id);

    await expect(store.reset('a'.repeat(40), 'SOFT')).resolves.toBe(false);
    expect(store.offline()).toBe(true);
    expect(store.resetError()).toBeNull();
  });

  // -- compare (ADR-0022) --------------------------------------------------

  it('compares two commits via getDiff and publishes the diff', async () => {
    const getDiff = vi.fn(() => Promise.resolve(EMPTY_DIFF));
    store = new GraphStore(makeBridge({ getDiff }));
    store.repoId.set(REPO.id);

    await store.compareCommits('a'.repeat(40), 'b'.repeat(40));

    expect(getDiff).toHaveBeenCalledWith({
      repoId: REPO.id,
      from: 'a'.repeat(40),
      to: 'b'.repeat(40),
      path: '',
      staged: false,
    });
    expect(store.compare()).toEqual({ from: 'a'.repeat(40), to: 'b'.repeat(40) });
    expect(store.compareDiff()).toEqual(EMPTY_DIFF);
    expect(store.compareLoading()).toBe(false);
    expect(store.compareError()).toBeNull();
  });

  it('no-ops compare without a repository or either side', async () => {
    const getDiff = vi.fn(() => Promise.resolve(EMPTY_DIFF));
    store = new GraphStore(makeBridge({ getDiff }));

    await store.compareCommits('a'.repeat(40), 'b'.repeat(40));
    store.repoId.set(REPO.id);
    await store.compareCommits('', 'b'.repeat(40));
    await store.compareCommits('a'.repeat(40), '');

    expect(getDiff).not.toHaveBeenCalled();
    expect(store.compare()).toBeNull();
  });

  it('records a compare failure and clears the transient diff', async () => {
    const getDiff = vi.fn(() => Promise.reject({ code: 'DIFF_FAILED', message: 'boom' }));
    store = new GraphStore(makeBridge({ getDiff }));
    store.repoId.set(REPO.id);

    await store.compareCommits('a'.repeat(40), 'b'.repeat(40));

    expect(store.compareError()).toEqual({ code: 'DIFF_FAILED', message: 'boom', details: {} });
    expect(store.compareDiff()).toBeNull();
    expect(store.compareLoading()).toBe(false);
  });

  it('degrades compare to offline on IPC_UNAVAILABLE', async () => {
    const getDiff = vi.fn(() => {
      throw { code: 'IPC_UNAVAILABLE', message: 'offline' };
    });
    store = new GraphStore(makeBridge({ getDiff }));
    store.repoId.set(REPO.id);

    await store.compareCommits('a'.repeat(40), 'b'.repeat(40));

    expect(store.offline()).toBe(true);
    expect(store.compareDiff()).toBeNull();
    expect(store.compareError()).toBeNull();
  });

  it('clearCompare drops the pair, the diff and any error', async () => {
    const getDiff = vi.fn(() => Promise.resolve(EMPTY_DIFF));
    store = new GraphStore(makeBridge({ getDiff }));
    store.repoId.set(REPO.id);
    await store.compareCommits('a'.repeat(40), 'b'.repeat(40));

    store.clearCompare();

    expect(store.compare()).toBeNull();
    expect(store.compareDiff()).toBeNull();
    expect(store.compareError()).toBeNull();
  });

  // -- focusCommit (ADR-026 search hand-off) -------------------------------

  it('focusCommit ignores a blank oid', async () => {
    const getCommits = vi.fn(() => Promise.resolve(makePage(300, 0, 1000)));
    store = new GraphStore(makeBridge({ getCommits }));
    store.repoId.set(REPO.id);
    await store.loadWindow(0);
    getCommits.mockClear();

    await store.focusCommit('');

    expect(getCommits).not.toHaveBeenCalled();
    expect(store.selectedOid()).toBeNull();
  });

  it('focusCommit selects an already-loaded commit without paging', async () => {
    const getCommits = vi.fn(() => Promise.resolve(makePage(300, 0, 1000)));
    store = new GraphStore(makeBridge({ getCommits }));
    store.repoId.set(REPO.id);
    await store.loadWindow(0);
    getCommits.mockClear();

    await store.focusCommit(makeCommit(5).oid?.hex as string);

    expect(store.selectedOid()).toBe(makeCommit(5).oid?.hex);
    expect(getCommits).not.toHaveBeenCalled();
  });

  it('focusCommit pages forward until the commit appears', async () => {
    const target = makeCommit(350).oid?.hex as string;
    const getCommits = vi.fn((req: unknown) =>
      Promise.resolve(makePage(300, (req as { offset: number }).offset, 1000)),
    );
    store = new GraphStore(makeBridge({ getCommits }));
    store.repoId.set(REPO.id);
    await store.loadWindow(0);
    getCommits.mockClear();

    await store.focusCommit(target);

    expect(store.selectedOid()).toBe(target);
    expect(store.commits().some((commit) => commit.oid?.hex === target)).toBe(true);
    expect(getCommits).toHaveBeenCalledTimes(1);
  });

  it('focusCommit stops at the bounded load count when the commit is never found', async () => {
    const getCommits = vi.fn((req: unknown) =>
      Promise.resolve(makePage(300, (req as { offset: number }).offset, 100_000)),
    );
    store = new GraphStore(makeBridge({ getCommits }));
    store.repoId.set(REPO.id);
    await store.loadWindow(0);
    getCommits.mockClear();

    const target = 'f'.repeat(40);
    await store.focusCommit(target);

    expect(store.selectedOid()).toBe(target);
    expect(getCommits).toHaveBeenCalledTimes(COMMIT_FOCUS_MAX_LOADS);
  });

  it('focusCommit stops early when a page makes no progress', async () => {
    const getCommits = vi.fn(() => Promise.resolve({ commits: [], total: 1000, lanes: [] }));
    store = new GraphStore(makeBridge({ getCommits }));
    store.repoId.set(REPO.id);
    await store.loadWindow(0);
    getCommits.mockClear();

    await store.focusCommit('f'.repeat(40));

    expect(getCommits).toHaveBeenCalledTimes(1);
  });
});
