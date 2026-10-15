import {
  Component,
  computed,
  input,
  output,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Commit, Repository } from '@contracts/domain';
import { WorkspaceSplitComponent } from '@singularitree/ui-kit';
import { CommitFocusService } from '@core/services/commit-focus.service';
import { IpcBridge } from '@core/services/ipc-bridge.service';
import { RepoState } from '@core/services/repo-state.service';
import { GraphStore, WIP_OID } from '../graph/graph.store';
import type { CommitRow } from '../repo-models';
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

// -- workspace split wiring (P3) --------------------------------------------
// Rendered through the real template with the three heavy children stubbed:
// the real `st-workspace-split` is kept so content projection is exercised, and
// the child stubs reproduce the frozen contracts (testids, inputs, outputs).

const COMMIT_OID = 'a'.repeat(40);
const COMMIT_A: Commit = {
  oid: { hex: COMMIT_OID, kind: 'SHA1' },
  parents: [],
  author: { name: 'Ada', email: 'ada@example.com', when: '2026-01-01T00:00:00Z' },
  committer: { name: 'Ada', email: 'ada@example.com', when: '2026-01-01T00:00:00Z' },
  message: 'Initial commit',
  treeOid: { hex: 'b'.repeat(40), kind: 'SHA1' },
  committedAt: '2026-01-01T00:00:00Z',
  refs: [],
};

@Component({
  selector: 'st-graph-page',
  standalone: true,
  template: `<div data-testid="graph-stub"></div>`,
})
class GraphPageStub {}

@Component({
  selector: 'st-repo-picker',
  standalone: true,
  template: `<div data-testid="repo-picker-stub"></div>`,
})
class RepoPickerStub {}

@Component({
  selector: 'st-commit-details-panel',
  standalone: true,
  template: `
    @if (isWip()) {
      <div data-testid="commit-details-wip"></div>
    } @else if (commit()) {
      <div data-testid="commit-details"></div>
    } @else {
      <div data-testid="commit-details-empty"></div>
    }
    <button type="button" data-testid="review-changes" (click)="reviewChanges.emit()">
      Review changes
    </button>
  `,
})
class CommitDetailsPanelStub {
  readonly commit = input<Commit | null>(null);
  readonly isWip = input(false);
  readonly showCta = input(false);
  readonly reviewChanges = output<void>();
}

/**
 * Selection-aware `GraphStore` stand-in for the render tests: exposes the
 * signals `RepoPage` derives its split inputs from and keeps `selectedRow`
 * consistent with `selectedOid` (null for the WIP pseudo-oid).
 */
function makeRenderGraphStore() {
  const repoId = signal<string | null>(null);
  const commits = signal<Commit[]>([COMMIT_A]);
  const selectedOid = signal<string | null>(null);
  const openRepository = vi.fn(async (fsPath: string) => {
    const repo = ALL_REPOS.find((r) => r.fsPath === fsPath) ?? REPO_A;
    repoId.set(repo.id);
    return repo;
  });
  const focusCommit = vi.fn(async (_oid: string) => {});
  const reload = vi.fn();
  const requestScrollRestore = vi.fn();
  const selectedRow = computed<CommitRow | null>(() => {
    const oid = selectedOid();
    if (!oid || oid === WIP_OID) return null;
    const commit = commits().find((c) => c.oid?.hex === oid);
    return commit
      ? {
          commit,
          lane: { index: 0, color: 0, continues: false },
          refs: [],
          isHead: false,
        }
      : null;
  });
  const isWipSelected = computed(() => selectedOid() === WIP_OID);
  return { repoId, commits, selectedOid, selectedRow, isWipSelected, openRepository, focusCommit, reload, requestScrollRestore };
}

async function render(initial: Repository | null = REPO_A) {
  const repoState = makeRepoState(initial);
  const graphStore = makeRenderGraphStore();
  const bridge = makeBridge();
  const router = { navigate: vi.fn(async () => true), url: '/repo' };

  await TestBed.configureTestingModule({
    imports: [RepoPage],
    providers: [
      provideZonelessChangeDetection(),
      { provide: RepoState, useValue: repoState },
      { provide: GraphStore, useValue: graphStore },
      { provide: IpcBridge, useValue: bridge },
      { provide: Router, useValue: router },
    ],
  })
    .overrideComponent(RepoPage, {
      set: {
        imports: [WorkspaceSplitComponent, CommitDetailsPanelStub, GraphPageStub, RepoPickerStub],
      },
    })
    .compileComponents();

  const fixture = TestBed.createComponent(RepoPage);
  return { fixture, repoState, graphStore, router };
}

describe('RepoPage workspace split', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function host(fixture: ComponentFixture<RepoPage>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Render and settle the hydration effect so `repoId()` is populated. */
  async function renderWithGraph() {
    const ctx = await render(REPO_A);
    await vi.waitFor(() => {
      ctx.fixture.detectChanges();
      expect(ctx.graphStore.repoId()).not.toBeNull();
    });
    return ctx;
  }

  it('mounts the workspace split and shows the picker first-run state with no repository', async () => {
    const { fixture } = await render(null);
    fixture.detectChanges();

    const el = host(fixture);
    expect(el.querySelector('[data-testid="workspace-primary"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="repo-picker-stub"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="graph-stub"]')).toBeNull();
    // Nothing selected: the split must not pin an empty detail pane.
    expect(el.querySelector('[data-testid="workspace-detail"]')).toBeNull();
  });

  it('mounts the graph in the primary pane once a repository is open', async () => {
    const { fixture } = await renderWithGraph();
    fixture.detectChanges();

    const el = host(fixture);
    expect(el.querySelector('[data-testid="workspace-primary"] [data-testid="graph-stub"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="repo-picker-stub"]')).toBeNull();
  });

  it('pins the commit details panel for a selected commit', async () => {
    const { fixture, graphStore } = await renderWithGraph();
    graphStore.selectedOid.set(COMMIT_OID);
    fixture.detectChanges();

    const detail = host(fixture).querySelector('[data-testid="workspace-detail"]');
    expect(detail).not.toBeNull();
    expect(detail!.querySelector('[data-testid="commit-details"]')).not.toBeNull();
  });

  it('pins the WIP panel when the working-tree pseudo-oid is selected', async () => {
    const { fixture, graphStore } = await renderWithGraph();
    graphStore.selectedOid.set(WIP_OID);
    fixture.detectChanges();

    const detail = host(fixture).querySelector('[data-testid="workspace-detail"]');
    expect(detail).not.toBeNull();
    expect(detail!.querySelector('[data-testid="commit-details-wip"]')).not.toBeNull();
  });

  it('labels the detail pane by selection kind (Commit / Working tree)', async () => {
    const { fixture, graphStore } = await renderWithGraph();

    graphStore.selectedOid.set(COMMIT_OID);
    fixture.detectChanges();
    expect(
      host(fixture).querySelector('[data-testid="workspace-detail-header"]')?.textContent?.trim(),
    ).toBe('Commit');

    graphStore.selectedOid.set(WIP_OID);
    fixture.detectChanges();
    expect(
      host(fixture).querySelector('[data-testid="workspace-detail-header"]')?.textContent?.trim(),
    ).toBe('Working tree');
  });

  it('routes to the file-status screen when the detail CTA emits reviewChanges', async () => {
    const { fixture, graphStore, router } = await renderWithGraph();
    graphStore.selectedOid.set(COMMIT_OID);
    fixture.detectChanges();

    const cta = host(fixture).querySelector<HTMLButtonElement>('[data-testid="review-changes"]');
    expect(cta).not.toBeNull();
    cta!.click();
    fixture.detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(['/repo', 'file-status']);
    // P3 fix: the headline CTA queues the graph's scroll restore before leaving.
    expect(graphStore.requestScrollRestore).toHaveBeenCalled();
  });
});
