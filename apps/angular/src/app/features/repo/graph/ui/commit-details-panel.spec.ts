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

function render(
  commit: Commit | null,
  isWip = false,
  showCta = false,
  collapsible = false,
  showNavigation = false,
  changedFiles: readonly string[] = [],
) {
  const fixture = TestBed.createComponent(CommitDetailsPanel);
  fixture.componentRef.setInput('commit', commit);
  fixture.componentRef.setInput('isWip', isWip);
  fixture.componentRef.setInput('showCta', showCta);
  fixture.componentRef.setInput('collapsible', collapsible);
  fixture.componentRef.setInput('showNavigation', showNavigation);
  fixture.componentRef.setInput('changedFiles', changedFiles);
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

  it('renders oid, split message, author, committer, date, parents and refs', () => {
    const el = render(COMMIT).nativeElement as HTMLElement;

    expect(text(el, 'commit-details-oid')).toBe('a'.repeat(40));
    // The redesign splits the message on the first blank line (subject + body);
    // each element now holds exactly one part.
    expect(text(el, 'commit-details-subject')).toBe('feat(graph): details panel');
    expect(text(el, 'commit-details-description')).toBe('full body text');
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

  it('renders the cyan short oid with the first seven hex characters', () => {
    const el = render(COMMIT).nativeElement as HTMLElement;
    expect(text(el, 'commit-details-short-oid')).toBe('aaaaaaa');
  });

  it('renders mainline branch refs with the --main pill and other branches with --branch', () => {
    const commit: Commit = {
      ...COMMIT,
      refs: [
        { name: 'main', kind: 'branch' },
        { name: 'master', kind: 'branch' },
        { name: 'feature/x', kind: 'branch' },
      ],
    };
    const el = render(commit).nativeElement as HTMLElement;

    const refs = el.querySelectorAll<HTMLElement>(
      '[data-testid="commit-details-refs"] .st-commit-details__ref',
    );
    const classes = Array.from(refs).map((ref) => ref.className);

    expect(classes[0]).toContain('st-commit-details__ref--main');
    expect(classes[1]).toContain('st-commit-details__ref--main');
    expect(classes[2]).toContain('st-commit-details__ref--branch');
    expect(classes[2]).not.toContain('st-commit-details__ref--main');
  });

  it('keeps a head-kind ref on the head colour even when it names the mainline', () => {
    // The current branch is reported as kind `head` (see the fixture); only a
    // `branch`-kind ref takes the mint mainline role, matching `st-graph-row`.
    const el = render(COMMIT).nativeElement as HTMLElement;
    const main = el.querySelector<HTMLElement>(
      '[data-testid="commit-details-refs"] .st-commit-details__ref',
    );
    expect(main?.className).toContain('st-commit-details__ref--head');
    expect(main?.className).not.toContain('st-commit-details__ref--main');
  });

  it('never re-colours a remote or tag ref as mainline', () => {
    const commit: Commit = {
      ...COMMIT,
      refs: [
        { name: 'origin/main', kind: 'remote' },
        { name: 'master', kind: 'tag' },
      ],
    };
    const el = render(commit).nativeElement as HTMLElement;

    const refs = el.querySelectorAll<HTMLElement>(
      '[data-testid="commit-details-refs"] .st-commit-details__ref',
    );
    const classes = Array.from(refs).map((ref) => ref.className);

    expect(classes[0]).toContain('st-commit-details__ref--remote');
    expect(classes[0]).not.toContain('st-commit-details__ref--main');
    expect(classes[1]).toContain('st-commit-details__ref--tag');
    expect(classes[1]).not.toContain('st-commit-details__ref--main');
  });

  it('renders the 24px initials avatar from the author name', () => {
    const el = render(COMMIT).nativeElement as HTMLElement;
    // First letters of the first two whitespace-separated words, uppercased.
    expect(text(el, 'commit-details-avatar')).toBe('AL');
  });

  it('falls back to a placeholder avatar when the author is missing', () => {
    const root: Commit = { ...COMMIT, author: undefined };
    const el = render(root).nativeElement as HTMLElement;
    expect(text(el, 'commit-details-avatar')).toBe('?');
  });

  it('emits reviewChanges exactly once when the primary CTA is clicked', () => {
    const fixture = render(COMMIT, false, true);
    const el = fixture.nativeElement as HTMLElement;
    let emitted = 0;
    fixture.componentInstance.reviewChanges.subscribe(() => (emitted += 1));

    const cta = el.querySelector<HTMLElement>('[data-testid="commit-details-review"]');
    expect(cta).not.toBeNull();
    cta?.click();

    expect(emitted).toBe(1);
  });

  it('omits the primary CTA unless showCta opts in', () => {
    // Default `showCta` is false: a screen that merely reuses this read-only
    // panel (e.g. File status) must not get an inert "Review changes" button.
    const commitEl = render(COMMIT).nativeElement as HTMLElement;
    expect(commitEl.querySelector('[data-testid="commit-details-review"]')).toBeNull();

    const wipEl = render(null, true).nativeElement as HTMLElement;
    expect(wipEl.querySelector('[data-testid="commit-details-review"]')).toBeNull();

    const emptyEl = render(null).nativeElement as HTMLElement;
    expect(emptyEl.querySelector('[data-testid="commit-details-review"]')).toBeNull();
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
    const el = render(null, true, true).nativeElement as HTMLElement;
    expect(text(el, 'commit-details-wip')).toContain('Uncommitted changes (WIP)');
    expect(el.querySelector('[data-testid="commit-details"]')).toBeNull();
    expect(el.querySelector('[data-testid="commit-details-empty"]')).toBeNull();
    // With `showCta` opted in, the CTA is present in the WIP branch too (it
    // routes to file status).
    expect(el.querySelector('[data-testid="commit-details-review"]')).not.toBeNull();
  });

  it('collapses to a compact head by default and toggles the detail block', () => {
    const fixture = render(COMMIT, false, false, true);
    const el = fixture.nativeElement as HTMLElement;

    // The compact head is always visible: identity + one byline.
    expect(text(el, 'commit-details-short-oid')).toBe('aaaaaaa');
    expect(text(el, 'commit-details-subject')).toBe('feat(graph): details panel');
    expect(text(el, 'commit-details-branch')).toBe('main');
    expect(text(el, 'commit-details-byline')).toContain('Ada Lovelace <ada@example.com>');
    expect(text(el, 'commit-details-byline')).toContain('2026-01-02T10:05:00Z');

    // The detail block is folded away while collapsed.
    expect(el.querySelector('[data-testid="commit-details-description"]')).toBeNull();
    expect(el.querySelector('[data-testid="commit-details-refs"]')).toBeNull();
    expect(el.querySelector('[data-testid="commit-details-committer"]')).toBeNull();
    expect(el.querySelector('[data-testid="commit-details-parents"]')).toBeNull();

    const toggle = el.querySelector<HTMLElement>('[data-testid="commit-details-toggle"]');
    expect(toggle).not.toBeNull();
    // The state must land on the focusable control (`st-button` forwards its
    // `[expanded]` input to the inner native button), not the host.
    const toggleButton = toggle?.querySelector('button') ?? null;
    expect(toggleButton?.getAttribute('aria-expanded')).toBe('false');

    toggle?.click();
    fixture.detectChanges();

    expect(toggleButton?.getAttribute('aria-expanded')).toBe('true');
    expect(text(el, 'commit-details-description')).toBe('full body text');
    expect(el.querySelector('[data-testid="commit-details-refs"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="commit-details-committer"]')).not.toBeNull();

    // Toggling back folds it again.
    toggle?.click();
    fixture.detectChanges();

    expect(toggleButton?.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('[data-testid="commit-details-description"]')).toBeNull();
  });

  it('emits back when the navigation row is opted in', () => {
    const fixture = render(COMMIT, false, false, false, true);
    const el = fixture.nativeElement as HTMLElement;
    let backed = 0;
    fixture.componentInstance.back.subscribe(() => (backed += 1));

    const back = el.querySelector<HTMLElement>('[data-testid="commit-details-back"]');
    expect(back).not.toBeNull();

    back?.click();

    expect(backed).toBe(1);
  });

  it('hides the navigation controls unless showNavigation opts in', () => {
    const el = render(COMMIT).nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="commit-details-back"]')).toBeNull();
  });
});

// -- Changed-file list: an inline, expandable panel next to the CTA ----------

describe('CommitDetailsPanel — changed-file panel', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('shows no file-list affordance for the WIP row or the empty branch', () => {
    const wip = render(null, true, true).nativeElement as HTMLElement;
    expect(wip.querySelector('[data-testid="commit-details-files"]')).toBeNull();

    const empty = render(null).nativeElement as HTMLElement;
    expect(empty.querySelector('[data-testid="commit-details-files"]')).toBeNull();
  });

  it('shows the affordance only next to an opted-in CTA for a real commit', () => {
    const withCta = render(COMMIT, false, true).nativeElement as HTMLElement;
    expect(withCta.querySelector('[data-testid="commit-details-files"]')).not.toBeNull();

    // The File-status embed (showCta false) is gated by the same condition as
    // the CTA, so the read-only embed never grows a History-only control.
    const embed = render(COMMIT, false, false).nativeElement as HTMLElement;
    expect(embed.querySelector('[data-testid="commit-details-files"]')).toBeNull();
    expect(embed.querySelector('[data-testid="commit-details-file-path"]')).toBeNull();
  });

  it('toggles the inline changed-file list and never mounts a popover', () => {
    const fixture = render(COMMIT, false, true, false, false, ['src/a.ts', 'src/b.ts']);
    const el = fixture.nativeElement as HTMLElement;

    // Collapsed: the trigger exists, the rows do not, and no popover layer is
    // ever in the DOM (the ADR-032 `st-popover` was removed).
    const trigger = el.querySelector('[data-testid="commit-details-files"]');
    const triggerButton = trigger?.querySelector('button') ?? null;
    expect(triggerButton).not.toBeNull();
    // The disclosure state lands on the focusable control (`st-button` forwards
    // `[expanded]` to the native button), not the host.
    expect(triggerButton?.getAttribute('aria-expanded')).toBe('false');
    expect(triggerButton?.getAttribute('aria-haspopup')).toBeNull();
    expect(el.querySelector('[data-testid="commit-details-file-path"]')).toBeNull();
    expect(el.querySelector('[data-testid="popover"]')).toBeNull();

    triggerButton?.click();
    fixture.detectChanges();

    // Expanded: the rows render inline and still no popover.
    expect(triggerButton?.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('[data-testid="commit-details-file-path"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="popover"]')).toBeNull();

    // Toggling back hides the list again.
    triggerButton?.click();
    fixture.detectChanges();

    expect(triggerButton?.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('[data-testid="commit-details-file-path"]')).toBeNull();
    expect(el.querySelector('[data-testid="popover"]')).toBeNull();
  });

  it('lists the changed file paths passed via the input as mono rows', () => {
    const fixture = render(COMMIT, false, true, false, false, ['src/a.ts', 'src/b.ts']);
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector('[data-testid="commit-details-files"]')?.querySelector('button')?.click();
    fixture.detectChanges();

    expect(text(el, 'commit-details-files-heading')).toBe('2 changed files');
    const rows = el.querySelectorAll('[data-testid="commit-details-file-path"]');
    expect(Array.from(rows).map((row) => row.textContent?.trim())).toEqual([
      'src/a.ts',
      'src/b.ts',
    ]);
    expect(Array.from(rows).every((row) => row.classList.contains('st-mono'))).toBe(true);
  });

  it('renders the empty-state line when the commit has no changed files', () => {
    const fixture = render(COMMIT, false, true, false, false, []);
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector('[data-testid="commit-details-files"]')?.querySelector('button')?.click();
    fixture.detectChanges();

    expect(text(el, 'commit-details-files-empty')).toContain('No changed files');
    expect(el.querySelector('[data-testid="commit-details-file-path"]')).toBeNull();
  });

  it('stays read-only: the inline panel never mounts a diff surface', () => {
    const fixture = render(COMMIT, false, true, false, false, ['src/a.ts']);
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector('[data-testid="commit-details-files"]')?.querySelector('button')?.click();
    fixture.detectChanges();

    // No `st-diff-viewer`, no Monaco, no hunk/code grid: paths only.
    expect(el.querySelector('st-diff-viewer')).toBeNull();
    expect(el.querySelector('[data-testid="diff-viewer"]')).toBeNull();
    expect(el.querySelector('.st-diff-viewer')).toBeNull();
  });
});
