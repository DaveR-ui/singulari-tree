import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Commit, Lane, Repository } from '@contracts/domain';
import type { GetCommitsResponse } from '@contracts/gitcore';
import { IpcBridge } from '@core/services/ipc-bridge.service';
import { GRAPH_WINDOW_SIZE, GraphStore, WIP_OID } from './graph.store';

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
type Handlers = Partial<Record<'getCommits' | 'openRepository' | 'listRepositories', Handler>>;

function makeBridge(handlers: Handlers): IpcBridge {
  return {
    invoke: vi.fn((method: string, req: unknown) => {
      const handler = handlers[method as keyof Handlers];
      if (!handler) throw new Error(`unexpected method ${method}`);
      return handler(req);
    }),
  } as unknown as IpcBridge;
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

    expect(store.error()).toEqual({ code: 'GIT_FAILED', message: 'boom' });
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

    expect(store.error()).toEqual({ code: 'GIT_FAILED', message: 'boom' });
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
});
