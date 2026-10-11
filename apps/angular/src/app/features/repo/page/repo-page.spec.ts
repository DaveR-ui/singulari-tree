import { provideZonelessChangeDetection, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repository } from '@contracts/domain';
import { CommitFocusService } from '@core/services/commit-focus.service';
import { IpcBridge } from '@core/services/ipc-bridge.service';
import { RepoState } from '@core/services/repo-state.service';
import { GraphStore } from '../graph/graph.store';
import { RepoPage } from './repo-page';

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

const ALL_REPOS = [REPO_A, REPO_B];

/**
 * Minimal `RepoState` stand-in: a real `activeRepo` computed over signal-backed
 * repos so the component's hydration effect reacts to selection changes.
 */
function makeRepoState(initial: Repository | null) {
  const repos = signal<Repository[]>(initial ? [initial] : []);
  const activeId = signal<string | null>(initial?.id ?? null);
  const statusRefreshRequested = signal(0);
  return {
    activeRepo: computed<Repository | null>(() => {
      const id = activeId();
      return id ? (repos().find((repo) => repo.id === id) ?? null) : null;
    }),
    // Token the route-scoped consumers observe after a ref mutation (ADR-028).
    statusRefreshRequested,
    setActive(repo: Repository): void {
      repos.update((prev) => [...prev.filter((r) => r.id !== repo.id), repo]);
      activeId.set(repo.id);
    },
    // Signal handles so the test can force the computed to re-evaluate.
    activeId,
    repos,
  };
}

/**
 * Minimal `GraphStore` stand-in mirroring the real contract: `repoId` is set
 * only once `openRepository` resolves, and repeated opens are observable.
 */
function makeGraphStore() {
  const repoId = signal<string | null>(null);
  const openRepository = vi.fn(async (fsPath: string) => {
    const repo = ALL_REPOS.find((r) => r.fsPath === fsPath) ?? REPO_A;
    repoId.set(repo.id);
    return repo;
  });
  const focusCommit = vi.fn(async (_oid: string) => {});
  const reload = vi.fn();
  return { repoId, openRepository, focusCommit, reload };
}

/**
 * Minimal `IpcBridge` stand-in: `onFsChanged` records the callback so the test
 * can emit an external change and observes the returned unsubscribe handle.
 */
function makeBridge() {
  let fsChanged: (() => void) | null = null;
  return {
    onFsChanged: vi.fn((cb: () => void) => {
      fsChanged = cb;
      return vi.fn();
    }),
    emitFsChanged: (): void => fsChanged?.(),
  };
}

async function setup(initial: Repository | null = REPO_A) {
  const repoState = makeRepoState(initial);
  const graphStore = makeGraphStore();
  const bridge = makeBridge();

  await TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: RepoState, useValue: repoState },
      { provide: GraphStore, useValue: graphStore },
      { provide: IpcBridge, useValue: bridge },
    ],
  }).compileComponents();

  // Construct directly (no template render): the hydration effect is the unit
  // under test, not the child graph/picker wiring.
  TestBed.runInInjectionContext(() => new RepoPage());
  TestBed.tick();
  await Promise.resolve();
  return { repoState, graphStore, bridge };
}

describe('RepoPage hydration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('does not open a repository when none is active', async () => {
    const { graphStore } = await setup(null);

    expect(graphStore.openRepository).not.toHaveBeenCalled();
  });

  it('opens the active repository in the graph on hydration', async () => {
    const { graphStore } = await setup(REPO_A);

    expect(graphStore.openRepository).toHaveBeenCalledTimes(1);
    expect(graphStore.openRepository).toHaveBeenCalledWith(REPO_A.fsPath);
    expect(graphStore.repoId()).toBe(REPO_A.id);
  });

  it('does not reopen the graph when it already points at the active repo', async () => {
    const { repoState, graphStore } = await setup(REPO_A);
    expect(graphStore.openRepository).toHaveBeenCalledTimes(1);

    // Force the activeRepo computed to re-evaluate with the same repository.
    repoState.activeId.set(null);
    TestBed.tick();
    repoState.activeId.set(REPO_A.id);
    TestBed.tick();
    await Promise.resolve();

    expect(graphStore.openRepository).toHaveBeenCalledTimes(1);
  });

  it('opens the newly activated repository when the selection changes', async () => {
    const { repoState, graphStore } = await setup(REPO_A);
    expect(graphStore.openRepository).toHaveBeenCalledTimes(1);

    repoState.setActive(REPO_B);
    TestBed.tick();
    await Promise.resolve();

    expect(graphStore.openRepository).toHaveBeenCalledTimes(2);
    expect(graphStore.openRepository).toHaveBeenLastCalledWith(REPO_B.fsPath);
    expect(graphStore.repoId()).toBe(REPO_B.id);
  });

  // -- cross-repo search focus hand-off (ADR-026) --------------------------

  it('focuses a queued commit when its repository is already open', async () => {
    const { graphStore } = await setup(REPO_A);
    const focus = TestBed.inject(CommitFocusService);
    graphStore.focusCommit.mockClear();

    focus.request(REPO_A.id, 'abc123');
    TestBed.tick();
    await Promise.resolve();

    expect(graphStore.focusCommit).toHaveBeenCalledWith('abc123');
    expect(focus.pending()).toBeNull();
  });

  it('consumes a queued commit when its repository is opened by selection', async () => {
    const { repoState, graphStore } = await setup(REPO_A);
    const focus = TestBed.inject(CommitFocusService);
    graphStore.focusCommit.mockClear();

    focus.request(REPO_B.id, 'def456');
    repoState.setActive(REPO_B);
    TestBed.tick();

    await vi.waitFor(() => expect(graphStore.focusCommit).toHaveBeenCalledWith('def456'));
    expect(focus.pending()).toBeNull();
  });

  // -- re-homed graph refresh triggers (ADR-0030) --------------------------

  it('reloads the graph window when the working tree changes externally', async () => {
    const { bridge, graphStore } = await setup(REPO_A);
    graphStore.reload.mockClear();

    bridge.emitFsChanged();

    expect(graphStore.reload).toHaveBeenCalledTimes(1);
  });

  it('reloads the graph window when a status refresh is requested', async () => {
    const { repoState, graphStore } = await setup(REPO_A);
    graphStore.reload.mockClear();

    repoState.statusRefreshRequested.set(1);
    TestBed.tick();

    expect(graphStore.reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload again when the status token is re-set to the same value', async () => {
    const { repoState, graphStore } = await setup(REPO_A);
    repoState.statusRefreshRequested.set(1);
    TestBed.tick();
    expect(graphStore.reload).toHaveBeenCalledTimes(1);

    graphStore.reload.mockClear();
    repoState.statusRefreshRequested.set(1);
    TestBed.tick();

    expect(graphStore.reload).not.toHaveBeenCalled();
  });
});
