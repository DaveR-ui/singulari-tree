import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Commit } from '@contracts/domain';
import { CommitDetailsPanel } from './commit-details-panel';

const COMMIT: Commit = {
  oid: { hex: 'a'.repeat(40), kind: 'SHA1' },
  parents: [{ hex: 'b'.repeat(40), kind: 'SHA1' }, { hex: 'c'.repeat(40), kind: 'SHA1' }],
  author: { name: 'Ada Lovelace', email: 'ada@example.com', when: '2026-01-02T10:00:00Z' },
  committer: { name: 'Grace Hopper', email: 'grace@example.com', when: '2026-01-02T10:05:00Z' },
  message: 'feat(graph): details panel\n\nfull body text',
  treeOid: undefined,
  committedAt: '2026-01-02T10:05:00Z',
  refs: [
    { name: 'main', kind: 'head' },
    { name: 'v1.0.0', kind: 'tag' },
  ],
};

function render(commit: Commit | null, isWip = false) {
  const fixture = TestBed.createComponent(CommitDetailsPanel);
  fixture.componentRef.setInput('commit', commit);
  fixture.componentRef.setInput('isWip', isWip);
  fixture.detectChanges();
  return fixture;
}

function text(el: HTMLElement, testId: string): string | undefined {
  return el.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim();
}

describe('CommitDetailsPanel', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('shows an empty state without a selection', () => {
    const el = render(null).nativeElement as HTMLElement;
    expect(text(el, 'commit-details-empty')).toContain('Select a commit');
    expect(el.querySelector('[data-testid="commit-details"]')).toBeNull();
  });

  it('renders oid, full message, author, committer, date, parents and refs', () => {
    const el = render(COMMIT).nativeElement as HTMLElement;

    expect(text(el, 'commit-details-oid')).toBe('a'.repeat(40));
    expect(text(el, 'commit-details-message')).toBe('feat(graph): details panel\n\nfull body text');
    expect(text(el, 'commit-details-author')).toContain('Ada Lovelace <ada@example.com>');
    expect(text(el, 'commit-details-committer')).toContain('Grace Hopper <grace@example.com>');
    expect(text(el, 'commit-details-date')).toBe('2026-01-02T10:05:00Z');

    const parents = el.querySelectorAll('[data-testid="commit-details-parents"] .st-commit-details__oid');
    expect(Array.from(parents).map((p) => p.textContent?.trim())).toEqual([
      'b'.repeat(40),
      'c'.repeat(40),
    ]);

    const refs = el.querySelectorAll('[data-testid="commit-details-refs"] .st-commit-details__ref');
    expect(Array.from(refs).map((r) => r.textContent?.trim())).toEqual(['main', 'v1.0.0']);
    expect(text(el, 'commit-details-ref-summary')).toBe('main (head), v1.0.0 (tag)');
  });

  it('marks a root commit when there are no parents and no refs', () => {
    const root: Commit = { ...COMMIT, parents: [], refs: [], author: undefined, committer: undefined };
    const el = render(root).nativeElement as HTMLElement;

    expect(text(el, 'commit-details-parents')).toBe('(root commit)');
    expect(text(el, 'commit-details-author')).toBe('—');
    expect(text(el, 'commit-details-ref-summary')).toBe('—');
    expect(el.querySelector('[data-testid="commit-details-refs"]')).toBeNull();
  });

  it('renders the WIP working-tree state', () => {
    const el = render(null, true).nativeElement as HTMLElement;
    expect(text(el, 'commit-details-wip')).toContain('Uncommitted changes (WIP)');
    expect(el.querySelector('[data-testid="commit-details"]')).toBeNull();
    expect(el.querySelector('[data-testid="commit-details-empty"]')).toBeNull();
  });
});
