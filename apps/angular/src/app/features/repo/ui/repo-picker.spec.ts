import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Commit, Lane, Repository } from '@contracts/domain';
import type { GetCommitsResponse } from '@contracts/gitcore';
import { IpcBridge } from '@core/services/ipc-bridge.service';
import { GraphStore } from '../graph/graph.store';
import { RepoPicker } from './repo-picker';

const REPO: Repository = {
  id: 'repo-1',
  fsPath: '/tmp/repo',
  commonDir: '/tmp/repo/.git',
  name: 'repo',
  createdAt: '2026-01-01T00:00:00Z',
  lastOpenedAt: '2026-01-01T00:00:00Z',
};

const REPO_2: Repository = {
  ...REPO,
  id: 'repo-2',
  fsPath: '/tmp/other',
  name: 'other',
};

function makeCommit(index: number): Commit {
  return {
    oid: { hex: index.toString(16).padStart(40, '0'), kind: 'SHA1' },
    parents: [],
    author: { name: `Author ${index}`, email: `author${index}@example.com`, when: '2026-01-02T10:00:00Z' },
    committer: undefined,
    message: `commit ${index}`,
    treeOid: undefined,
    committedAt: '2026-01-02T10:05:00Z',
    refs: [],
  };
}

function makePage(count: number, total = count): GetCommitsResponse {
  const commits = Array.from({ length: count }, (_, i) => makeCommit(i));
  const lanes: Lane[] = commits.map((_, i) => ({ index: i % 2, color: i % 8, continues: i % 2 === 0 }));
  return { commits, total, lanes };
}

function makeBridge(opts: { recent?: Repository[]; offline?: boolean } = {}): IpcBridge & { invoke: Mock } {
  const invoke = vi.fn(async (method: string, req: unknown) => {
    if (opts.offline) {
      throw { code: 'IPC_UNAVAILABLE', message: 'Not running inside Electron' };
    }
    switch (method) {
      case 'openRepository': {
        const fsPath = (req as { fsPath: string }).fsPath;
        return opts.recent?.find((repo) => repo.fsPath === fsPath) ?? { ...REPO, fsPath };
      }
      case 'getCommits':
        return makePage(2, 2);
      case 'listRepositories':
        return { repositories: opts.recent ?? [] };
      default:
        throw new Error(`unexpected method ${method}`);
    }
  });
  return { invoke } as unknown as IpcBridge & { invoke: Mock };
}

async function setup(opts: { recent?: Repository[]; offline?: boolean } = {}) {
  const bridge = makeBridge(opts);
  const store = new GraphStore(bridge);
  await TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: GraphStore, useValue: store }],
  }).compileComponents();

  const fixture = TestBed.createComponent(RepoPicker);
  fixture.detectChanges();
  // Let the constructor's `loadRecentRepos()` microtask settle.
  await Promise.resolve();
  await Promise.resolve();
  fixture.detectChanges();
  return { store, fixture, bridge };
}

function query<T extends Element>(fixture: { nativeElement: unknown }, testId: string): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${testId}"]`);
}

describe('RepoPicker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the recent repositories from the store on init', async () => {
    const { fixture } = await setup({ recent: [REPO, REPO_2] });

    const list = query(fixture, 'repo-recent');
    expect(list).not.toBeNull();

    const items = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      '[data-testid="repo-recent-item"]',
    );
    expect(Array.from(items).map((item) => item.textContent?.trim())).toEqual(['repo', 'other']);
    expect(items[0].getAttribute('title')).toBe('/tmp/repo');
    expect(query(fixture, 'repo-recent-empty')).toBeNull();
  });

  it('shows an empty state when there are no recents', async () => {
    const { fixture } = await setup({ recent: [] });

    expect(query(fixture, 'repo-recent')).toBeNull();
    expect(query(fixture, 'repo-recent-empty')?.textContent).toContain('No recent repositories');
  });

  it('opens the typed path and loads the graph window', async () => {
    const { store, fixture, bridge } = await setup({ recent: [] });

    const input = query<HTMLInputElement>(fixture, 'repo-path-input');
    expect(input).not.toBeNull();
    input!.value = '/tmp/repo';
    input!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    query<HTMLButtonElement>(fixture, 'repo-open')!.click();

    await vi.waitFor(() => expect(store.commits()).toHaveLength(2));

    const methods = bridge.invoke.mock.calls.map((call) => call[0]);
    expect(methods).toContain('openRepository');
    expect(methods).toContain('getCommits');
    expect(methods.indexOf('openRepository')).toBeLessThan(methods.indexOf('getCommits'));
    expect(bridge.invoke).toHaveBeenCalledWith('openRepository', { fsPath: '/tmp/repo' });
    expect(store.repoId()).toBe('repo-1');
  });

  it('ignores empty/whitespace input', async () => {
    const { fixture, bridge } = await setup({ recent: [] });

    const input = query<HTMLInputElement>(fixture, 'repo-path-input');
    input!.value = '   ';
    input!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    query<HTMLButtonElement>(fixture, 'repo-open')!.click();
    await Promise.resolve();

    expect(bridge.invoke).not.toHaveBeenCalledWith('openRepository', expect.anything());
  });

  it('opens a repository when a recent entry is clicked', async () => {
    const { store, fixture, bridge } = await setup({ recent: [REPO_2] });

    const item = query<HTMLButtonElement>(fixture, 'repo-recent-item');
    expect(item?.getAttribute('title')).toBe('/tmp/other');
    item!.click();

    await vi.waitFor(() => expect(store.repoId()).toBe('repo-2'));
    expect(bridge.invoke).toHaveBeenCalledWith('openRepository', { fsPath: '/tmp/other' });
    expect(store.commits()).toHaveLength(2);
  });

  it('does not crash and shows a clear message when the bridge is unavailable', async () => {
    const { fixture } = await setup({ offline: true });

    expect(query(fixture, 'repo-picker-offline')?.textContent).toContain('Git core offline');
    expect(query(fixture, 'repo-recent')).toBeNull();
  });
});
