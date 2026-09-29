import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { Commit } from '@contracts/domain';
import type { GetCommitsResponse } from '@contracts/gitcore';
import { IpcBridge } from '@core/services/ipc-bridge.service';
import { GraphStore, WIP_OID } from '../graph.store';
import { GraphPage } from './graph-page';

// The virtual viewport itself is CDK's concern (and needs real layout, absent in
// jsdom). This spec drives the page's wiring — filter, WIP selection, prefetch
// threshold, lane width — through the component instance; DOM rendering of rows
// and panels is covered by their own component specs.

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
  return {
    commits: Array.from({ length: count }, (_, i) => makeCommit(i)),
    total,
    lanes: Array.from({ length: count }, (_, i) => ({
      index: i % 2,
      color: i % 8,
      continues: i % 2 === 0,
    })),
  };
}

async function setup(commits = 3, total = commits) {
  const store = new GraphStore({
    invoke: vi.fn(() => Promise.resolve(makePage(commits, total))),
  } as unknown as IpcBridge);
  store.repoId.set('repo-1');
  await store.loadWindow(0);

  await TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: GraphStore, useValue: store }],
  }).compileComponents();

  const page = TestBed.runInInjectionContext(() => new GraphPage());
  return { store, page };
}

describe('GraphPage', () => {
  it('uses the 28px item size for the virtual viewport', async () => {
    const { page } = await setup();
    expect(page.rowHeight).toBe(28);
  });

  it('exposes the highest lane index for the SVG graph column width', async () => {
    const { page } = await setup();
    expect(page.maxLane()).toBe(1);
  });

  it('pipes the toolbar input into the store filter', async () => {
    const { store, page } = await setup();
    const input = { value: 'commit 2' } as HTMLInputElement;

    page.onFilter({ target: input } as unknown as Event);
    expect(store.filter()).toBe('commit 2');
    expect(store.filteredRows().map((row) => row.commit.message)).toEqual(['commit 2']);

    input.value = '';
    page.onFilter({ target: input } as unknown as Event);
    expect(store.filteredRows()).toHaveLength(3);
  });

  it('selects the WIP node without touching the commit window', async () => {
    const { store, page } = await setup();

    page.selectWip();

    expect(store.selectedOid()).toBe(WIP_OID);
    expect(store.isWipSelected()).toBe(true);
    expect(store.selectedRow()).toBeNull();
    // WIP is purely UI: the loaded commit rows are untouched.
    expect(store.rows()).toHaveLength(3);
  });

  it('prefetches only when the rendered range approaches the loaded end', async () => {
    const { store, page } = await setup(300, 1000);
    const loadMore = vi.spyOn(store, 'loadMore');

    page.onScrolledIndexChange(0);
    expect(loadMore).not.toHaveBeenCalled();

    page.onScrolledIndexChange(291);
    expect(loadMore).toHaveBeenCalledTimes(1);
  });
});
