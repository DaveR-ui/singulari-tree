import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Commit, Diff, FileStatus } from '@contracts/domain';
import type { FsChangedEvent, GetStatusResponse } from '@contracts/gitcore';
import { IpcBridge } from '@core/services/ipc-bridge.service';
import { RepoState } from '@core/services/repo-state.service';
import { GraphStore, WIP_OID } from '../graph/graph.store';
import { StatusStore } from './status.store';
import { StatusWorkspace } from './status-workspace';

const FILES: FileStatus[] = [
  { path: 'a.ts', staged: ' ', unstaged: 'M', isStaged: false, isConflicted: false },
];

const DIFF: Diff = {
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

function commit(hex: string, parents: string[] = []): Commit {
  return {
    oid: { hex, kind: 'SHA1' },
    parents: parents.map((p) => ({ hex: p, kind: 'SHA1' })),
    author: undefined,
    committer: undefined,
    message: 'msg',
    treeOid: undefined,
    committedAt: '2026-01-01T00:00:00Z',
    refs: [],
  };
}

function makeGraph() {
  return {
    repoId: signal<string | null>(null),
    commits: signal<Commit[]>([]),
    selectedOid: signal<string | null>(null),
    reload: vi.fn(),
  };
}

interface Setup {
  graph: ReturnType<typeof makeGraph>;
  status: StatusStore;
  repoState: { statusRefreshRequested: ReturnType<typeof signal<number>> };
  invoke: ReturnType<typeof vi.fn>;
  fsChanged: Array<(payload: FsChangedEvent) => void>;
}

async function setup(graph: ReturnType<typeof makeGraph>): Promise<Setup> {
  const invoke = vi.fn((method: string) => {
    if (method === 'getStatus') return Promise.resolve<GetStatusResponse>({ files: FILES });
    if (method === 'getDiff') return Promise.resolve(DIFF);
    return Promise.resolve({});
  });
  const fsChanged: Array<(payload: FsChangedEvent) => void> = [];
  const bridge = {
    invoke,
    onFsChanged: vi.fn((cb: (payload: FsChangedEvent) => void) => {
      fsChanged.push(cb);
      return () => {};
    }),
  } as unknown as IpcBridge;
  const repoState = { statusRefreshRequested: signal(0) };

  await TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: GraphStore, useValue: graph },
      { provide: StatusStore, useValue: new StatusStore(bridge) },
      { provide: IpcBridge, useValue: bridge },
      { provide: RepoState, useValue: repoState },
    ],
  }).compileComponents();

  const status = TestBed.inject(StatusStore);
  TestBed.runInInjectionContext(() => new StatusWorkspace());
  return { graph, status, repoState, invoke, fsChanged };
}

describe('StatusWorkspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads status when the graph opens a repository', async () => {
    const graph = makeGraph();
    graph.repoId.set('repo-1');
    const { status, invoke } = await setup(graph);

    TestBed.tick();
    await vi.waitFor(() => expect(status.files()).toHaveLength(1));

    expect(invoke).toHaveBeenCalledWith('getStatus', { repoId: 'repo-1' });
    expect(status.repoId()).toBe('repo-1');
  });

  it('starts the background fs watch when the graph opens a repository', async () => {
    const graph = makeGraph();
    graph.repoId.set('repo-1');
    const { invoke } = await setup(graph);

    TestBed.tick();
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('watch', { repoId: 'repo-1' }),
    );
  });

  it('loads the working-tree diff when the WIP row is selected', async () => {
    const graph = makeGraph();
    graph.repoId.set('repo-1');
    graph.commits.set([commit('head')]);
    const { invoke } = await setup(graph);
    TestBed.tick();

    graph.selectedOid.set(WIP_OID);
    TestBed.tick();

    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('getDiff', {
        repoId: 'repo-1',
        from: 'head',
        to: '',
        path: '',
        staged: false,
      }),
    );
  });

  it('loads a commit diff against its first parent when a commit is selected', async () => {
    const graph = makeGraph();
    graph.repoId.set('repo-1');
    graph.commits.set([commit('child', ['parent'])]);
    const { invoke } = await setup(graph);
    TestBed.tick();

    graph.selectedOid.set('child');
    TestBed.tick();

    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('getDiff', {
        repoId: 'repo-1',
        from: 'parent',
        to: 'child',
        path: '',
        staged: false,
      }),
    );
  });

  it('reloads the graph when a commit requests it', async () => {
    const graph = makeGraph();
    graph.repoId.set('repo-1');
    const { status } = await setup(graph);
    TestBed.tick();

    status.graphReloadRequested.update((value) => value + 1);
    TestBed.tick();

    expect(graph.reload).toHaveBeenCalled();
  });

  it('reloads both stores on fs:changed', async () => {
    const graph = makeGraph();
    graph.repoId.set('repo-1');
    const { status, fsChanged } = await setup(graph);
    TestBed.tick();
    await vi.waitFor(() => expect(status.files()).toHaveLength(1));

    fsChanged[0]?.({ repoId: 'repo-1', paths: ['a.ts'] });

    expect(graph.reload).toHaveBeenCalled();
  });

  it('re-fetches the working-tree diff on fs:changed when the WIP row is selected', async () => {
    const graph = makeGraph();
    graph.repoId.set('repo-1');
    graph.commits.set([commit('head')]);
    const { fsChanged, invoke } = await setup(graph);
    TestBed.tick();

    graph.selectedOid.set(WIP_OID);
    TestBed.tick();
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('getDiff', {
        repoId: 'repo-1',
        from: 'head',
        to: '',
        path: '',
        staged: false,
      }),
    );
    invoke.mockClear();

    fsChanged[0]?.({ repoId: 'repo-1', paths: ['a.ts'] });

    expect(graph.reload).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('getDiff', {
        repoId: 'repo-1',
        from: 'head',
        to: '',
        path: '',
        staged: false,
      }),
    );
  });

  it('does not re-fetch a diff on fs:changed without a WIP selection', async () => {
    const graph = makeGraph();
    graph.repoId.set('repo-1');
    const { fsChanged, invoke } = await setup(graph);
    TestBed.tick();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('getStatus', { repoId: 'repo-1' }));
    invoke.mockClear();

    fsChanged[0]?.({ repoId: 'repo-1', paths: ['a.ts'] });
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('getStatus', { repoId: 'repo-1' }));

    expect(invoke).not.toHaveBeenCalledWith('getDiff', expect.anything());
  });

  it('refreshes the graph and status when a ref mutation bumps the token', async () => {
    const graph = makeGraph();
    graph.repoId.set('repo-1');
    graph.commits.set([commit('head')]);
    const { status, repoState, invoke } = await setup(graph);
    TestBed.tick();
    await vi.waitFor(() => expect(status.files()).toHaveLength(1));
    graph.reload.mockClear();
    invoke.mockClear();

    repoState.statusRefreshRequested.update((value) => value + 1);
    TestBed.tick();

    expect(graph.reload).toHaveBeenCalled();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('getStatus', { repoId: 'repo-1' }));
  });

  it('ignores an unchanged refresh token', async () => {
    const graph = makeGraph();
    graph.repoId.set('repo-1');
    const { repoState, invoke } = await setup(graph);
    TestBed.tick();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('getStatus', { repoId: 'repo-1' }));
    invoke.mockClear();

    repoState.statusRefreshRequested.set(0);
    TestBed.tick();

    expect(invoke).not.toHaveBeenCalledWith('getStatus', expect.anything());
  });
});
