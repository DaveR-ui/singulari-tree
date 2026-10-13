import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Branch, Commit, Diff, FileDiff, FileStatus, Hunk, Repository } from '@contracts/domain';
import { DiffViewer } from '@singularitree/ui-kit';
import { IpcBridge } from '@core/services/ipc-bridge.service';
import { RepoState } from '@core/services/repo-state.service';
import { GraphStore, WIP_OID } from '../../graph/graph.store';
import { StatusStore } from '../../status/status.store';
import { FileStatusStore } from '../file-status.store';
import { FileStatusPage } from './file-status-page';

const HEAD_HEX = 'a'.repeat(40);
const OTHER_HEX = 'b'.repeat(40);

function commit(hex: string, parents: string[] = []): Commit {
  return {
    oid: { hex, kind: 'SHA1' },
    parents: parents.map((parent) => ({ hex: parent, kind: 'SHA1' })),
    author: { name: 'Ada', email: 'ada@example.com', when: '2026-01-02T10:00:00Z' },
    committer: undefined,
    message: `commit ${hex.slice(0, 4)}`,
    treeOid: undefined,
    committedAt: '2026-01-02T10:05:00Z',
    refs: [],
  };
}

function hunk(text: string): Hunk {
  return {
    fromStart: 1,
    fromLines: 1,
    toStart: 1,
    toLines: 1,
    lines: [{ kind: 'added', text, noNewline: false }],
  };
}

function fileDiff(path: string, additions: number, deletions: number, firstLine: string): FileDiff {
  return {
    path,
    oldPath: '',
    status: 'M',
    hunks: [hunk(firstLine)],
    additions,
    deletions,
    isBinary: false,
    hasConflictMarkers: false,
  };
}

/** Whole-repository diff of two files: the payload the store owns end-to-end. */
function wholeDiff(): Diff {
  return {
    from: undefined,
    to: undefined,
    hunks: [hunk('a-line'), hunk('b-line')],
    additions: 10,
    deletions: 4,
    isBinary: false,
    hasConflictMarkers: false,
    truncated: false,
    files: [fileDiff('a.ts', 6, 2, 'a-line'), fileDiff('b.ts', 4, 2, 'b-line')],
  };
}

function file(path: string, isStaged: boolean): FileStatus {
  return {
    path,
    staged: isStaged ? 'M' : ' ',
    unstaged: isStaged ? ' ' : 'M',
    isStaged,
    isConflicted: false,
  };
}

function branch(name: string, tip: string, overrides: Partial<Branch> = {}): Branch {
  return {
    name,
    refName: overrides.isRemote ? `refs/remotes/${name}` : `refs/heads/${name}`,
    tip: { hex: tip, kind: 'SHA1' },
    upstream: '',
    isCurrent: false,
    isRemote: false,
    behind: 0,
    ...overrides,
  };
}

type Handler = (req: unknown) => unknown;
type Handlers = Partial<
  Record<
    | 'getStatus'
    | 'getDiff'
    | 'getBranches'
    | 'getCommits'
    | 'stage'
    | 'unstage'
    | 'stageHunk'
    | 'unstageHunk'
    | 'discardHunk'
    | 'commit',
    Handler
  >
>;

const BRANCHES: Branch[] = [
  branch('origin/main', 'origin-main-oid', { isRemote: true }),
  branch('main', 'main-oid'),
  branch('develop', 'develop-oid', { isCurrent: true }),
];

interface RepoStateStub {
  activeRepo: WritableSignal<Repository | null>;
  statusRefreshRequested: WritableSignal<number>;
}

interface Harness {
  fixture: ComponentFixture<FileStatusPage>;
  fs: FileStatusStore;
  status: StatusStore;
  graph: GraphStore;
  repoState: RepoStateStub;
  getDiff: ReturnType<typeof vi.fn>;
  stageHunk: ReturnType<typeof vi.fn>;
  unstageHunk: ReturnType<typeof vi.fn>;
  discardHunk: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.spyOn>;
  emitFsChanged: () => void;
}

async function setup(
  options: { selection?: string | null; files?: FileStatus[]; diff?: () => Diff } = {},
): Promise<Harness> {
  const getDiff = vi.fn(() => Promise.resolve(options.diff ? options.diff() : wholeDiff()));
  const stageHunk = vi.fn(() => Promise.resolve({}));
  const unstageHunk = vi.fn(() => Promise.resolve({}));
  const discardHunk = vi.fn(() => Promise.resolve({}));
  const handlers: Handlers = {
    getStatus: () => Promise.resolve({ files: options.files ?? [file('a.ts', false)] }),
    getDiff,
    getBranches: () => Promise.resolve({ branches: BRANCHES }),
    getCommits: () => Promise.resolve({ commits: [], total: 0, lanes: [] }),
    stageHunk,
    unstageHunk,
    discardHunk,
  };
  let fsChangedListener: (() => void) | null = null;
  const invoke = vi.fn((method: string, req: unknown) => {
    const handler = handlers[method as keyof Handlers];
    if (!handler) throw new Error(`unexpected method ${method}`);
    return handler(req);
  });
  const bridge = {
    invoke,
    onFsChanged: (cb: () => void) => {
      fsChangedListener = cb;
      return () => {
        fsChangedListener = null;
      };
    },
  };

  const status = new StatusStore(bridge as unknown as IpcBridge);
  const fs = new FileStatusStore(bridge as unknown as IpcBridge, status);
  const graph = new GraphStore(bridge as unknown as IpcBridge);
  graph.repoId.set('repo-1');
  graph.commits.set([commit(HEAD_HEX, [OTHER_HEX]), commit(OTHER_HEX)]);
  if (options.selection !== null) graph.select(options.selection ?? HEAD_HEX);

  const repoState: RepoStateStub = {
    activeRepo: signal<Repository | null>(null),
    statusRefreshRequested: signal(0),
  };

  await TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: IpcBridge, useValue: bridge },
      { provide: RepoState, useValue: repoState },
      { provide: StatusStore, useValue: status },
      { provide: FileStatusStore, useValue: fs },
      { provide: GraphStore, useValue: graph },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(FileStatusPage);
  fixture.detectChanges();
  const reload = vi.spyOn(graph, 'reload');
  return {
    fixture,
    fs,
    status,
    graph,
    repoState,
    getDiff,
    stageHunk,
    unstageHunk,
    discardHunk,
    reload,
    emitFsChanged: () => fsChangedListener?.(),
  };
}

/** Diff viewer instance rendered in the right pane. */
function viewer(fixture: ComponentFixture<FileStatusPage>): DiffViewer {
  const element = fixture.debugElement.query(By.css('st-diff-viewer'));
  return element?.componentInstance as DiffViewer;
}

function query<T extends HTMLElement = HTMLElement>(
  fixture: ComponentFixture<FileStatusPage>,
  testId: string,
): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(
    `[data-testid="${testId}"]`,
  );
}

function all(fixture: ComponentFixture<FileStatusPage>, testId: string): HTMLElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
      `[data-testid="${testId}"]`,
    ),
  );
}

/** Run change detection and let the scheduled effects and bridge calls settle. */
async function settle(fixture: ComponentFixture<FileStatusPage>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

/** Wait until the screen has loaded the diff of the current variant. */
async function waitForDiff(fixture: ComponentFixture<FileStatusPage>, fs: FileStatusStore): Promise<void> {
  await vi.waitFor(() => expect(fs.wholeDiff()).not.toBeNull());
  fixture.detectChanges();
}

/** Request object of the most recent call of a mocked bridge handler. */
function lastPayload(mock: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const call = mock.mock.calls.at(-1);
  return (call?.[0] ?? {}) as Record<string, unknown>;
}

/**
 * The diff pane must render to the RIGHT of the variant-body left column, never
 * swapped: assert both the DOM order (the pane FOLLOWS the left column) and
 * that it is the last flex child of the screen container. Fails if the two
 * panes are reordered.
 */
function assertDiffOnRight(fixture: ComponentFixture<FileStatusPage>): void {
  const host = fixture.nativeElement as HTMLElement;
  const left = host.querySelector<HTMLElement>('.st-file-status__left');
  const right = query(fixture, 'file-status-diff');
  expect(left).not.toBeNull();
  expect(right).not.toBeNull();
  expect(left!.compareDocumentPosition(right!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const screen = host.querySelector<HTMLElement>('.st-file-status');
  expect(screen).not.toBeNull();
  const flexChildren = Array.from(screen!.children);
  expect(flexChildren[flexChildren.length - 1]).toBe(right);
}

describe('FileStatusPage', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('lands on the commit variant when a real commit is selected', async () => {
    const { fixture, fs } = await setup({ selection: HEAD_HEX });

    await vi.waitFor(() => expect(fs.variant()).toBe('commit'));
    expect(fs.activeCommit()?.oid?.hex).toBe(HEAD_HEX);
    expect(query(fixture, 'commit-details')).not.toBeNull();
    // The commit header is on the LEFT; the diff is on the RIGHT, never swapped.
    expect(query(fixture, 'file-status-diff')).not.toBeNull();
    assertDiffOnRight(fixture);
  });

  it('lands on the local variant for the WIP pseudo-oid', async () => {
    const { fixture, fs } = await setup({ selection: WIP_OID });

    await vi.waitFor(() => expect(fs.variant()).toBe('local'));
    expect(fs.activeCommit()).toBeNull();
    expect(query(fixture, 'commit-details')).toBeNull();
  });

  it('lands on the local variant when nothing is selected', async () => {
    const { fixture, fs } = await setup({ selection: null });

    await vi.waitFor(() => expect(fs.variant()).toBe('local'));
    expect(fs.activeCommit()).toBeNull();
    expect(query(fixture, 'commit-details')).toBeNull();
  });

  it('follows a selection change while the page is open', async () => {
    const { fixture, fs, graph } = await setup({ selection: HEAD_HEX });
    await vi.waitFor(() => expect(fs.activeCommit()?.oid?.hex).toBe(HEAD_HEX));

    graph.select(OTHER_HEX);
    fixture.detectChanges();
    await fixture.whenStable();

    await vi.waitFor(() => expect(fs.activeCommit()?.oid?.hex).toBe(OTHER_HEX));
    expect(fs.variant()).toBe('commit');
  });

  it('switches variant from the variant bar', async () => {
    const { fixture, fs } = await setup({ selection: HEAD_HEX });
    await waitForDiff(fixture, fs);

    all(fixture, 'variant-pr')[0].click();
    await vi.waitFor(() => expect(fs.variant()).toBe('pr'));
    await vi.waitFor(() => expect(fs.baseRef()).toBe('main'));
    fixture.detectChanges();
    expect(fs.targetRef()).toBe('develop');

    all(fixture, 'variant-local')[0].click();
    await vi.waitFor(() => expect(fs.variant()).toBe('local'));
  });

  it('feeds the viewer the PROJECTED single-file diff, never the whole diff', async () => {
    const { fixture, fs } = await setup({ selection: HEAD_HEX });
    await waitForDiff(fixture, fs);
    fs.selectFile('a.ts');
    fixture.detectChanges();

    const diff = viewer(fixture).diff();
    expect(diff?.files).toHaveLength(1);
    expect(diff?.files?.[0].path).toBe('a.ts');
    expect(diff?.additions).toBe(6);
    expect(diff?.deletions).toBe(2);
    // Only the selected file's hunks reach the deprecated flat field.
    expect(diff?.hunks).toHaveLength(1);
    expect(diff?.hunks?.[0].lines[0].text).toBe('a-line');
  });

  it('re-projects when a file row is clicked', async () => {
    const { fixture, fs } = await setup({ selection: HEAD_HEX });
    await waitForDiff(fixture, fs);

    const rows = all(fixture, 'file-diff-row');
    expect(rows).toHaveLength(2);
    rows[1].click();
    fixture.detectChanges();

    expect(fs.selectedPath()).toBe('b.ts');
    const diff = viewer(fixture).diff();
    expect(diff?.files?.[0].path).toBe('b.ts');
    expect(diff?.hunks?.[0].lines[0].text).toBe('b-line');
    expect(rows[1].getAttribute('data-selected')).toBe('true');
  });

  it('populates the PR base/target controls from the loaded branches', async () => {
    const { fixture, fs } = await setup({ selection: HEAD_HEX });
    await waitForDiff(fixture, fs);

    all(fixture, 'variant-pr')[0].click();
    await vi.waitFor(() => expect(fs.variant()).toBe('pr'));
    await vi.waitFor(() => expect(fs.branches().length).toBe(3));
    fixture.detectChanges();

    expect(fs.branches().map((branch) => branch.name)).toEqual(['origin/main', 'main', 'develop']);
    const target = query<HTMLSelectElement>(fixture, 'pr-target-select');
    expect(target).not.toBeNull();
    const options = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLOptionElement>(
      'select[data-testid="pr-target-select"] option',
    );
    expect(Array.from(options).map((option) => option.value)).toEqual([
      'origin/main',
      'main',
      'develop',
    ]);
    // The base is editable: it carries the resolved default and accepts a ref.
    const base = query<HTMLInputElement>(fixture, 'pr-base-input');
    expect(base?.value).toBe('main');
    base!.value = 'develop';
    base!.dispatchEvent(new Event('input'));
    await vi.waitFor(() => expect(fs.baseRef()).toBe('develop'));
  });

  it('reloads the graph when a commit requests it', async () => {
    const { fixture, fs, status, reload } = await setup({ selection: HEAD_HEX });
    await waitForDiff(fixture, fs);

    status.graphReloadRequested.set(1);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(reload).toHaveBeenCalled();
  });

  it('renders the one-line change summary of the commit diff', async () => {
    const { fixture, fs } = await setup({ selection: HEAD_HEX });
    await waitForDiff(fixture, fs);

    expect(query(fixture, 'file-status-summary')?.textContent?.trim()).toBe(
      '+10 \u22124 across 2 files',
    );
  });

  it('refreshes the working tree on fs:changed but never the commit diff', async () => {
    const { fixture, fs, getDiff, emitFsChanged } = await setup({ selection: HEAD_HEX });
    await waitForDiff(fixture, fs);
    const before = getDiff.mock.calls.length;

    // The commit variant keeps its historical diff untouched.
    emitFsChanged();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(getDiff.mock.calls.length).toBe(before);

    // The local variant is the one the working-tree refresh invalidates.
    all(fixture, 'variant-local')[0].click();
    await vi.waitFor(() => expect(fs.variant()).toBe('local'));
    const localCalls = getDiff.mock.calls.length;

    emitFsChanged();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(getDiff.mock.calls.length).toBeGreaterThan(localCalls);
    expect(fs.variant()).toBe('local');
  });

  it('renders the working-tree panel unchanged in the local variant', async () => {
    const { fixture, fs } = await setup({ selection: WIP_OID });
    await waitForDiff(fixture, fs);

    // The changes panel is reused verbatim: its own testids, its own markup.
    expect(query(fixture, 'status-file')).not.toBeNull();
    expect(query(fixture, 'commit-message-input')).not.toBeNull();
    expect(fs.unstagedFiles().map((file) => file.path)).toEqual(['a.ts']);
  });

  it('keeps the file selection across a working-tree refresh', async () => {
    const { fixture, fs, emitFsChanged } = await setup({ selection: WIP_OID });
    await waitForDiff(fixture, fs);
    all(fixture, 'status-file')[0].click();
    expect(fs.selectedPath()).toBe('a.ts');

    emitFsChanged();
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fs.selectedPath()).toBe('a.ts'));
    fixture.detectChanges();

    expect(query(fixture, 'status-file')?.classList.contains('st-changes__row--selected')).toBe(
      true,
    );
  });

  it('clears the variant on destroy', async () => {
    const { fixture, fs } = await setup({ selection: HEAD_HEX });
    await waitForDiff(fixture, fs);

    fixture.destroy();

    expect(fs.variant()).toBe('local');
    expect(fs.activeCommit()).toBeNull();
  });

  it('keeps the diff pane on the RIGHT in every variant (never swapped left)', async () => {
    const { fixture, fs } = await setup({ selection: HEAD_HEX });
    await waitForDiff(fixture, fs);

    // Commit variant: the commit header is the left column, the diff follows.
    await vi.waitFor(() => expect(fs.variant()).toBe('commit'));
    assertDiffOnRight(fixture);

    // PR variant.
    all(fixture, 'variant-pr')[0].click();
    await vi.waitFor(() => expect(fs.variant()).toBe('pr'));
    await vi.waitFor(() => expect(fs.baseRef()).toBe('main'));
    fixture.detectChanges();
    assertDiffOnRight(fixture);

    // Local variant.
    all(fixture, 'variant-local')[0].click();
    await vi.waitFor(() => expect(fs.variant()).toBe('local'));
    await vi.waitFor(() => expect(fs.wholeDiff()).not.toBeNull());
    fixture.detectChanges();
    assertDiffOnRight(fixture);

    // Switching back to the commit variant keeps the diff on the right too.
    all(fixture, 'variant-commit')[0].click();
    await vi.waitFor(() => expect(fs.variant()).toBe('commit'));
    fixture.detectChanges();
    assertDiffOnRight(fixture);
  });

  it('falls back to the working tree when the commit variant has no active commit', async () => {
    const { fixture, fs } = await setup({ selection: null });
    await vi.waitFor(() => expect(fs.variant()).toBe('local'));

    // No active commit and no graph selection: onVariantChange('commit') resolves
    // to nothing and must fall back to the working tree, not open an empty screen.
    all(fixture, 'variant-commit')[0].click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fs.variant()).toBe('local');
    expect(fs.activeCommit()).toBeNull();
    assertDiffOnRight(fixture);
  });

  it('projects the selected worktree file, never the whole diff, in the local variant', async () => {
    const { fixture, fs } = await setup({ selection: WIP_OID });
    await waitForDiff(fixture, fs);

    fs.selectFile('b.ts');
    await vi.waitFor(() => expect(fs.selectedPath()).toBe('b.ts'));
    await settle(fixture);

    const diff = viewer(fixture).diff();
    expect(diff?.files).toHaveLength(1);
    expect(diff?.files?.[0].path).toBe('b.ts');
    // The selected file's own counts, not the whole worktree diff's (10/4).
    expect(diff?.additions).toBe(4);
    expect(diff?.deletions).toBe(2);
  });

  it('renders the PR changed-file list and projects the clicked file into the viewer', async () => {
    const { fixture, fs } = await setup({ selection: HEAD_HEX });
    await waitForDiff(fixture, fs);

    all(fixture, 'variant-pr')[0].click();
    await vi.waitFor(() => expect(fs.variant()).toBe('pr'));
    await vi.waitFor(() => expect(fs.commitDiff()).not.toBeNull());
    fixture.detectChanges();

    // The changed-file rows render, carrying every path from the PR diff files.
    const rows = all(fixture, 'file-diff-row');
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.getAttribute('data-path'))).toEqual(['a.ts', 'b.ts']);
    // The PR change summary comes from commitChangeSummary.
    expect(query(fixture, 'file-status-summary')?.textContent?.trim()).toBe(
      '+10 \u22124 across 2 files',
    );

    // Clicking a file projects THAT file into the viewer — not the whole PR diff.
    rows[0].click();
    fixture.detectChanges();
    const diff = viewer(fixture).diff();
    expect(diff?.files).toHaveLength(1);
    expect(diff?.files?.[0].path).toBe('a.ts');
    expect(diff?.additions).toBe(6);
    expect(diff?.deletions).toBe(2);
  });

  it('forwards page hunk actions by indices only, never a patch (ADR-0020)', async () => {
    const { fixture, fs, stageHunk, unstageHunk, discardHunk } = await setup({ selection: WIP_OID });
    await waitForDiff(fixture, fs);
    const page = fixture.componentInstance;

    page.onStageHunk({ path: 'a.ts', hunkIndex: 3, lineIndices: [2, 5] });
    page.onUnstageHunk({ path: 'b.ts', hunkIndex: 1, lineIndices: [0] });
    page.onDiscardHunk({ path: 'c.ts', hunkIndex: 4, lineIndices: [] });

    await vi.waitFor(() => {
      expect(stageHunk).toHaveBeenCalledTimes(1);
      expect(unstageHunk).toHaveBeenCalledTimes(1);
      expect(discardHunk).toHaveBeenCalledTimes(1);
    });

    // The exact ADR-0020 payload — every field, lineIndices included.
    expect(lastPayload(stageHunk)).toEqual({
      repoId: 'repo-1',
      path: 'a.ts',
      hunkIndex: 3,
      lineIndices: [2, 5],
    });
    expect(lastPayload(unstageHunk)).toEqual({
      repoId: 'repo-1',
      path: 'b.ts',
      hunkIndex: 1,
      lineIndices: [0],
    });
    expect(lastPayload(discardHunk)).toEqual({
      repoId: 'repo-1',
      path: 'c.ts',
      hunkIndex: 4,
      lineIndices: [],
    });

    for (const mock of [stageHunk, unstageHunk, discardHunk]) {
      // Exactly the four allowed keys — no dropped/extra keys.
      expect(Object.keys(lastPayload(mock)).sort()).toEqual([
        'hunkIndex',
        'lineIndices',
        'path',
        'repoId',
      ]);
      // The renderer NEVER builds a patch: no unified-diff markers on the wire.
      const payload = JSON.stringify(lastPayload(mock));
      expect(payload).not.toContain('+++');
      expect(payload).not.toContain('@@');
      expect(payload).not.toContain('diff --git');
    }
  });

  it('wires the changes-panel Stage-hunk button to the page handler and the bridge', async () => {
    const { fixture, fs, stageHunk } = await setup({ selection: WIP_OID });
    await waitForDiff(fixture, fs);

    all(fixture, 'status-file')[0].click();
    await vi.waitFor(() => expect(fs.selectedPath()).toBe('a.ts'));
    await settle(fixture);

    // The selected file exposes the hunk action list bound to the page handlers.
    expect(query(fixture, 'hunk-actions')).not.toBeNull();
    all(fixture, 'hunk-stage')[0].click();
    await vi.waitFor(() => expect(stageHunk).toHaveBeenCalledTimes(1));

    expect(lastPayload(stageHunk)).toEqual({
      repoId: 'repo-1',
      path: 'a.ts',
      hunkIndex: 0,
      lineIndices: [],
    });
  });

  it('reloads the graph window when the working tree changes externally', async () => {
    const { fixture, fs, reload, emitFsChanged } = await setup({ selection: WIP_OID });
    await waitForDiff(fixture, fs);
    reload.mockClear();

    emitFsChanged();
    // The fs:changed handler calls graph.reload() synchronously, so HEAD/the
    // graph window do not go stale on screen.
    expect(reload).toHaveBeenCalledTimes(1);

    fixture.detectChanges();
    await fixture.whenStable();
    expect(fs.variant()).toBe('local');
  });

  it('refreshes the working tree on a status refresh, keeping the selected file', async () => {
    const { fixture, fs, reload, repoState } = await setup({ selection: WIP_OID });
    await waitForDiff(fixture, fs);
    all(fixture, 'status-file')[0].click();
    expect(fs.selectedPath()).toBe('a.ts');
    reload.mockClear();

    repoState.statusRefreshRequested.set(1);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    expect(fs.variant()).toBe('local');
    // The local variant re-opens asynchronously and restores the selection.
    await vi.waitFor(() => expect(fs.selectedPath()).toBe('a.ts'));
  });

  it('reloads the graph on a status refresh but never clobbers an open commit diff', async () => {
    const { fixture, fs, reload, repoState, getDiff } = await setup({ selection: HEAD_HEX });
    await waitForDiff(fixture, fs);
    await vi.waitFor(() => expect(fs.variant()).toBe('commit'));
    const before = getDiff.mock.calls.length;
    reload.mockClear();

    repoState.statusRefreshRequested.set(1);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(reload).toHaveBeenCalledTimes(1);
    // The commit comparison is immutable: it is not reopened into the working tree.
    expect(fs.variant()).toBe('commit');
    expect(fs.activeCommit()?.oid?.hex).toBe(HEAD_HEX);
    expect(getDiff.mock.calls.length).toBe(before);
  });

  it('does nothing when the status token is re-set to the same value', async () => {
    const { fixture, fs, reload, repoState } = await setup({ selection: WIP_OID });
    await waitForDiff(fixture, fs);

    repoState.statusRefreshRequested.set(1);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(reload).toHaveBeenCalledTimes(1);

    reload.mockClear();
    repoState.statusRefreshRequested.set(1);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(reload).not.toHaveBeenCalled();
  });

  it('projects a conflicted file with hasConflictMarkers to the viewer', async () => {
    const conflicted: FileDiff = { ...fileDiff('conflict.ts', 1, 1, 'render'), hasConflictMarkers: true };
    const { fixture, fs } = await setup({
      selection: WIP_OID,
      files: [file('conflict.ts', false)],
      diff: () => ({ ...wholeDiff(), hasConflictMarkers: true, files: [conflicted], additions: 1, deletions: 1 }),
    });
    await waitForDiff(fixture, fs);

    fs.selectFile('conflict.ts');
    await vi.waitFor(() => expect(fs.selectedPath()).toBe('conflict.ts'));
    await settle(fixture);

    // The conflict marker reaches the viewer through the single-file projection.
    expect(viewer(fixture).diff()?.hasConflictMarkers).toBe(true);
    expect(query(fixture, 'diff-conflict')).not.toBeNull();
  });

  it('does not break when a selected untracked file has no diff section', async () => {
    const untracked: FileStatus = {
      path: 'untracked.ts',
      staged: ' ',
      unstaged: '?',
      isStaged: false,
      isConflicted: false,
    };
    const { fixture, fs } = await setup({ selection: WIP_OID, files: [untracked] });
    await waitForDiff(fixture, fs);

    fs.selectFile('untracked.ts');
    await vi.waitFor(() => expect(fs.selectedPath()).toBe('untracked.ts'));
    await settle(fixture);

    // No FileDiff section for the untracked path: the addressing substrate is
    // null and the viewer input stays null — both degrade without throwing.
    expect(fs.selectedUnstagedFile()).toBeNull();
    expect(viewer(fixture).diff()).toBeNull();
    // The right pane explains the empty diff instead of rendering blank.
    expect(fs.wholeDiff()?.files.some((f) => f.path === 'untracked.ts')).toBe(false);
    const notice = query(fixture, 'file-status-untracked');
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain('Untracked file');
  });

  it('hides the untracked notice once the file has a diff section', async () => {
    const untracked: FileStatus = {
      path: 'a.ts',
      staged: ' ',
      unstaged: '?',
      isStaged: false,
      isConflicted: false,
    };
    // `a.ts` is present in the status AND in the worktree diff: no notice.
    const { fixture, fs } = await setup({ selection: WIP_OID, files: [untracked] });
    await waitForDiff(fixture, fs);

    fs.selectFile('a.ts');
    await vi.waitFor(() => expect(fs.selectedPath()).toBe('a.ts'));
    await settle(fixture);

    expect(query(fixture, 'file-status-untracked')).toBeNull();
  });

  it('does not mislabel a tracked file omitted by a truncated diff as untracked', async () => {
    const tracked: FileStatus = {
      path: 'truncated.ts',
      staged: ' ',
      unstaged: 'M',
      isStaged: false,
      isConflicted: false,
    };
    // The core capped the diff (ADR-0020), so this tracked file's section is
    // genuinely missing — it must NOT be reported as untracked.
    const { fixture, fs } = await setup({
      selection: WIP_OID,
      files: [tracked],
      diff: () => ({
        ...wholeDiff(),
        truncated: true,
        files: [fileDiff('a.ts', 6, 2, 'a-line')],
      }),
    });
    await waitForDiff(fixture, fs);

    fs.selectFile('truncated.ts');
    await vi.waitFor(() => expect(fs.selectedPath()).toBe('truncated.ts'));
    await settle(fixture);

    expect(fs.truncated()).toBe(true);
    expect(fs.wholeDiff()?.files.some((f) => f.path === 'truncated.ts')).toBe(false);
    expect(query(fixture, 'file-status-untracked')).toBeNull();
  });

  it('surfaces the truncated notice in the viewer when the diff is capped', async () => {
    const { fixture, fs } = await setup({
      selection: HEAD_HEX,
      diff: () => ({ ...wholeDiff(), truncated: true }),
    });
    await waitForDiff(fixture, fs);
    fixture.detectChanges();

    expect(viewer(fixture).truncated()).toBe(true);
    expect(query(fixture, 'diff-truncated')).not.toBeNull();
  });
});
