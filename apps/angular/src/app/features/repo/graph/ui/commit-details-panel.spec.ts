import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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

/** A subject-only commit: no blank line, so there is no description body. */
const SUBJECT_ONLY: Commit = { ...COMMIT, message: 'subject only, no body' };

type PanelInputs = {
  commit?: Commit | null;
  isWip?: boolean;
  showCta?: boolean;
  showSubject?: boolean;
  showFiles?: boolean;
  navMode?: 'none' | 'release' | 'history';
  locked?: boolean;
  showInGraph?: boolean;
  changedFiles?: readonly string[];
};

function render(inputs: PanelInputs = {}): ComponentFixture<CommitDetailsPanel> {
  const fixture = TestBed.createComponent(CommitDetailsPanel);
  fixture.componentRef.setInput('commit', inputs.commit ?? null);
  fixture.componentRef.setInput('isWip', inputs.isWip ?? false);
  fixture.componentRef.setInput('showCta', inputs.showCta ?? false);
  fixture.componentRef.setInput('showSubject', inputs.showSubject ?? true);
  fixture.componentRef.setInput('showFiles', inputs.showFiles ?? false);
  fixture.componentRef.setInput('navMode', inputs.navMode ?? 'none');
  fixture.componentRef.setInput('locked', inputs.locked ?? false);
  fixture.componentRef.setInput('showInGraph', inputs.showInGraph ?? false);
  fixture.componentRef.setInput('changedFiles', inputs.changedFiles ?? []);
  fixture.detectChanges();
  return fixture;
}

function text(el: HTMLElement, testId: string): string | undefined {
  return el.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim();
}

function button(el: HTMLElement, testId: string): HTMLButtonElement | null {
  return el.querySelector<HTMLButtonElement>(`[data-testid="${testId}"] button`);
}

/** jsdom document-order check: is `first` rendered before `second`? */
function isBefore(first: Element, second: Element): boolean {
  return !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/** Sets the native filter field's value and dispatches the input event. */
function typeFilter(fixture: ComponentFixture<CommitDetailsPanel>, value: string): void {
  const el = fixture.nativeElement as HTMLElement;
  const field = el.querySelector<HTMLInputElement>('[data-testid="commit-details-files-filter"]');
  if (!field) throw new Error('filter field not found');
  field.value = value;
  field.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

/** Clicks one segment of the exclusive view switch by its value. */
function clickSegment(el: HTMLElement, value: string): void {
  const segment = el.querySelector<HTMLButtonElement>(`[data-testid="toggle-segment-${value}"]`);
  if (!segment) throw new Error(`segment ${value} not found`);
  segment.click();
}

describe('CommitDetailsPanel', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('shows an empty state without a selection', () => {
    const el = render().nativeElement as HTMLElement;
    expect(text(el, 'commit-details-empty')).toContain('Select a commit');
    expect(el.querySelector('[data-testid="commit-details"]')).toBeNull();
  });

  it('renders oid, split message, author, committer, date, parents and refs', () => {
    const fixture = render({ commit: COMMIT });
    const el = fixture.nativeElement as HTMLElement;

    expect(text(el, 'commit-details-oid')).toBe('a'.repeat(40));
    // The message splits on the first blank line (subject + body); each element
    // now holds exactly one part.
    expect(text(el, 'commit-details-subject')).toBe('feat(graph): details panel');
    expect(text(el, 'commit-details-description')).toBe('full body text');
    expect(text(el, 'commit-details-author')).toContain('Ada Lovelace <ada@example.com>');
    expect(text(el, 'commit-details-committer')).toContain('Grace Hopper <grace@example.com>');
    expect(text(el, 'commit-details-date')).toBe('2026-01-02T10:05:00Z');

    const parents = el.querySelectorAll(
      '[data-testid="commit-details-parents"] .st-commit-details__oid',
    );
    expect(Array.from(parents).map((p) => p.textContent?.trim())).toEqual([
      'b'.repeat(40),
      'c'.repeat(40),
    ]);

    const refs = el.querySelectorAll('[data-testid="commit-details-refs"] .st-commit-details__ref');
    expect(Array.from(refs).map((r) => r.textContent?.trim())).toEqual(['main', 'v1.0.0']);
    expect(text(el, 'commit-details-ref-summary')).toBe('main (head), v1.0.0 (tag)');
  });

  it('renders the short oid with the first seven hex characters', () => {
    const el = render({ commit: COMMIT }).nativeElement as HTMLElement;
    expect(text(el, 'commit-details-short-oid')).toBe('aaaaaaa');
  });

  it('lays the commit out per mode: header → subject → body → metadata in description mode', () => {
    const el = render({
      commit: COMMIT,
      showCta: true,
      showFiles: true,
      changedFiles: ['src/a.ts'],
    }).nativeElement as HTMLElement;

    // Description is the default mode: the body sits between the subject and
    // the metadata, and the files block is NOT in the DOM.
    const order = [
      'commit-details-short-oid', // header
      'commit-details-subject', // description sector (identity)
      'commit-details-description',
      'commit-details-author', // metadata footer
      'commit-details-committer',
    ].map((id) => el.querySelector(`[data-testid="${id}"]`));

    order.forEach((node) => expect(node).not.toBeNull());
    for (let i = 0; i < order.length - 1; i += 1) {
      expect(isBefore(order[i]!, order[i + 1]!)).toBe(true);
    }
    expect(el.querySelector('[data-testid="commit-details-files-heading"]')).toBeNull();
  });

  it('lays the commit out per mode: header → subject → files → metadata in files mode', () => {
    const fixture = render({
      commit: COMMIT,
      showCta: true,
      showFiles: true,
      changedFiles: ['src/a.ts'],
    });
    const el = fixture.nativeElement as HTMLElement;
    clickSegment(el, 'files');
    fixture.detectChanges();

    const order = [
      'commit-details-short-oid', // header
      'commit-details-subject', // identity stays visible
      'commit-details-files-heading', // changed-files sector
      'commit-details-files-filter',
      'commit-details-file-path',
      'commit-details-author', // metadata footer
      'commit-details-committer',
    ].map((id) => el.querySelector(`[data-testid="${id}"]`));

    order.forEach((node) => expect(node).not.toBeNull());
    for (let i = 0; i < order.length - 1; i += 1) {
      expect(isBefore(order[i]!, order[i + 1]!)).toBe(true);
    }
    // The description body is NOT in the DOM in files mode.
    expect(el.querySelector('[data-testid="commit-details-description"]')).toBeNull();
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
    const el = render({ commit }).nativeElement as HTMLElement;

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
    const el = render({ commit: COMMIT }).nativeElement as HTMLElement;
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
    const el = render({ commit }).nativeElement as HTMLElement;

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
    const el = render({ commit: COMMIT }).nativeElement as HTMLElement;
    // First letters of the first two whitespace-separated words, uppercased.
    expect(text(el, 'commit-details-avatar')).toBe('AL');
  });

  it('falls back to a placeholder avatar when the author is missing', () => {
    const root: Commit = { ...COMMIT, author: undefined };
    const el = render({ commit: root }).nativeElement as HTMLElement;
    expect(text(el, 'commit-details-avatar')).toBe('?');
  });

  it('emits reviewChanges exactly once when the primary CTA is clicked', () => {
    const fixture = render({ commit: COMMIT, showCta: true });
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
    expect(
      (render({ commit: COMMIT }).nativeElement as HTMLElement).querySelector(
        '[data-testid="commit-details-review"]',
      ),
    ).toBeNull();
    expect(
      (render({ isWip: true }).nativeElement as HTMLElement).querySelector(
        '[data-testid="commit-details-review"]',
      ),
    ).toBeNull();
    expect(
      (render().nativeElement as HTMLElement).querySelector('[data-testid="commit-details-review"]'),
    ).toBeNull();
  });

  it('marks a root commit when there are no parents and no refs', () => {
    const root: Commit = {
      ...COMMIT,
      parents: [],
      refs: [],
      author: undefined,
      committer: undefined,
    };
    const el = render({ commit: root }).nativeElement as HTMLElement;

    expect(text(el, 'commit-details-parents')).toBe('(root commit)');
    expect(text(el, 'commit-details-author')).toBe('—');
    expect(text(el, 'commit-details-ref-summary')).toBe('—');
    expect(el.querySelector('[data-testid="commit-details-refs"]')).toBeNull();
  });

  it('renders the unchanged WIP working-tree state', () => {
    const el = render({ isWip: true, showCta: true }).nativeElement as HTMLElement;
    expect(text(el, 'commit-details-wip')).toContain('Uncommitted changes (WIP)');
    expect(text(el, 'commit-details-wip')).toContain('Working tree');
    expect(el.querySelector('[data-testid="commit-details"]')).toBeNull();
    expect(el.querySelector('[data-testid="commit-details-empty"]')).toBeNull();
    // The WIP branch has no header, so no padlock leaks into it.
    expect(el.querySelector('[data-testid="commit-details-lock"]')).toBeNull();
    // With `showCta` opted in, the CTA is present in the WIP branch too (it
    // routes to file status).
    expect(el.querySelector('[data-testid="commit-details-review"]')).not.toBeNull();
  });

  it('hides the subject headline when showSubject is false (File-status embed)', () => {
    // History keeps the subject inside the panel.
    const shown = render({ commit: COMMIT }).nativeElement as HTMLElement;
    expect(text(shown, 'commit-details-subject')).toBe('feat(graph): details panel');

    // The File-status commit embed moves the subject to the right-pane title, so
    // the panel must not duplicate it. The identity head (hash) is unaffected.
    const hidden = render({ commit: COMMIT, showSubject: false }).nativeElement as HTMLElement;
    expect(hidden.querySelector('[data-testid="commit-details-subject"]')).toBeNull();
    expect(text(hidden, 'commit-details-short-oid')).toBe('aaaaaaa');
  });
});

// -- Exclusive view switch: description XOR changed files ---------------------

describe('CommitDetailsPanel — exclusive view switch', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('defaults to description: subject + body render and the files block is absent', () => {
    const el = render({
      commit: COMMIT,
      showFiles: true,
      changedFiles: ['src/a.ts'],
    }).nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="commit-details-view-switch"]')).not.toBeNull();
    expect(text(el, 'commit-details-subject')).toBe('feat(graph): details panel');
    expect(text(el, 'commit-details-description')).toBe('full body text');
    // The hidden sector is NOT in the DOM at all (not merely hidden by CSS).
    expect(el.querySelector('[data-testid="commit-details-files-heading"]')).toBeNull();
    expect(el.querySelector('[data-testid="commit-details-files-filter"]')).toBeNull();
    expect(el.querySelector('[data-testid="commit-details-file-path"]')).toBeNull();
  });

  it('switches exclusively: files shows the block and drops the body, back restores it', () => {
    const fixture = render({
      commit: COMMIT,
      showFiles: true,
      changedFiles: ['src/a.ts', 'src/b.ts'],
    });
    const el = fixture.nativeElement as HTMLElement;

    // description → files
    clickSegment(el, 'files');
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="commit-details-description"]')).toBeNull();
    expect(text(el, 'commit-details-files-heading')).toBe('2 changed files');
    expect(el.querySelector('[data-testid="commit-details-files-filter"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-testid="commit-details-file-path"]').length).toBe(2);
    // Identity stays visible; only the body is swapped out, and the subject is
    // clamped to one line in files mode.
    expect(text(el, 'commit-details-subject')).toBe('feat(graph): details panel');
    expect(
      el
        .querySelector('[data-testid="commit-details-subject"]')
        ?.classList.contains('st-commit-details__subject--collapsed'),
    ).toBe(true);

    // files → description
    clickSegment(el, 'description');
    fixture.detectChanges();

    expect(text(el, 'commit-details-description')).toBe('full body text');
    expect(el.querySelector('[data-testid="commit-details-files-heading"]')).toBeNull();
    expect(el.querySelector('[data-testid="commit-details-file-path"]')).toBeNull();
    expect(
      el
        .querySelector('[data-testid="commit-details-subject"]')
        ?.classList.contains('st-commit-details__subject--collapsed'),
    ).toBe(false);
  });

  it('forces files mode for a subject-only commit and disables its description segment', () => {
    const el = render({
      commit: SUBJECT_ONLY,
      showFiles: true,
      changedFiles: ['src/a.ts'],
    }).nativeElement as HTMLElement;

    const description = el.querySelector<HTMLButtonElement>(
      '[data-testid="toggle-segment-description"]',
    );
    const files = el.querySelector<HTMLButtonElement>('[data-testid="toggle-segment-files"]');
    // A commit with no body can never land in description: the segment is
    // disabled and the mode is forced to files.
    expect(description?.disabled).toBe(true);
    expect(files?.disabled).toBe(false);
    expect(files?.getAttribute('aria-pressed')).toBe('true');

    expect(text(el, 'commit-details-files-heading')).toBe('1 changed file');
    expect(el.querySelector('[data-testid="commit-details-file-path"]')).not.toBeNull();
    // The body never exists.
    expect(el.querySelector('[data-testid="commit-details-description"]')).toBeNull();
    expect(text(el, 'commit-details-subject')).toBe('subject only, no body');
  });

  it('renders no switch for the WIP row, the empty branch, or a files-less embed', () => {
    // WIP row.
    expect(
      (render({ isWip: true, showFiles: true }).nativeElement as HTMLElement).querySelector(
        '[data-testid="commit-details-view-switch"]',
      ),
    ).toBeNull();
    // Empty branch (no selection).
    expect(
      (render({ showFiles: true }).nativeElement as HTMLElement).querySelector(
        '[data-testid="commit-details-view-switch"]',
      ),
    ).toBeNull();
    // Analyzer-style embed: a real commit WITH a body, but showFiles is off, so
    // the panel never grows a switch (the page owns the sector there).
    const embed = render({ commit: COMMIT }).nativeElement as HTMLElement;
    expect(embed.querySelector('[data-testid="commit-details-view-switch"]')).toBeNull();
    expect(embed.querySelector('[data-testid="commit-details-file-path"]')).toBeNull();
  });

  it('keeps the subject visible in both modes (identity, never swapped out)', () => {
    const fixture = render({ commit: COMMIT, showFiles: true, changedFiles: ['src/a.ts'] });
    const el = fixture.nativeElement as HTMLElement;

    expect(text(el, 'commit-details-subject')).toBe('feat(graph): details panel');
    clickSegment(el, 'files');
    fixture.detectChanges();
    expect(text(el, 'commit-details-subject')).toBe('feat(graph): details panel');
  });
});

// -- Changed files: a bordered, filterable block inside `files` mode ----------

describe('CommitDetailsPanel — changed files', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  /**
   * Render a commit with the switch, click into `files` mode and return the
   * root element: the default mode is now `description`, so every files-block
   * assertion needs the sector visible first.
   */
  function renderFiles(fixture: ComponentFixture<CommitDetailsPanel>): HTMLElement {
    const el = fixture.nativeElement as HTMLElement;
    clickSegment(el, 'files');
    fixture.detectChanges();
    return el;
  }

  it('never renders the files sector without showFiles (analyzer embed)', () => {
    const el = render({ commit: COMMIT, changedFiles: ['src/a.ts'] }).nativeElement as HTMLElement;

    // No switch and no files block: the File-status analyzer owns the file list.
    expect(el.querySelector('[data-testid="commit-details-view-switch"]')).toBeNull();
    expect(el.querySelector('[data-testid="commit-details-files-heading"]')).toBeNull();
    expect(el.querySelector('[data-testid="commit-details-file-path"]')).toBeNull();
  });

  it('lists the changed file paths as mono rows with an accurate heading', () => {
    const fixture = render({
      commit: COMMIT,
      showFiles: true,
      changedFiles: ['src/a.ts', 'src/b.ts'],
    });
    const el = renderFiles(fixture);

    expect(text(el, 'commit-details-files-heading')).toBe('2 changed files');
    const rows = el.querySelectorAll('[data-testid="commit-details-file-path"]');
    expect(Array.from(rows).map((row) => row.textContent?.trim())).toEqual([
      'src/a.ts',
      'src/b.ts',
    ]);
    expect(Array.from(rows).every((row) => row.classList.contains('st-mono'))).toBe(true);
  });

  it('uses the singular heading for a single changed file', () => {
    const fixture = render({ commit: COMMIT, showFiles: true, changedFiles: ['src/a.ts'] });
    expect(text(renderFiles(fixture), 'commit-details-files-heading')).toBe('1 changed file');
  });

  it('renders the empty-state line when the commit has no changed files', () => {
    const fixture = render({ commit: COMMIT, showFiles: true, changedFiles: [] });
    const el = renderFiles(fixture);

    expect(text(el, 'commit-details-files-empty')).toContain('No changed files');
    expect(el.querySelector('[data-testid="commit-details-file-path"]')).toBeNull();
    expect(el.querySelector('[data-testid="commit-details-files-filter-empty"]')).toBeNull();
  });

  it('filters case-insensitively and shows the "N of M" heading', () => {
    const fixture = render({
      commit: COMMIT,
      showFiles: true,
      changedFiles: ['src/alpha.ts', 'src/beta.ts'],
    });
    const el = renderFiles(fixture);

    typeFilter(fixture, 'BETA');

    expect(text(el, 'commit-details-files-heading')).toBe('1 of 2 changed files');
    const rows = el.querySelectorAll('[data-testid="commit-details-file-path"]');
    expect(Array.from(rows).map((row) => row.textContent?.trim())).toEqual(['src/beta.ts']);
  });

  it('treats filter metacharacters literally (never a RegExp)', () => {
    // `[a]` as a regex char class would also match `src/ab.ts`; includes()
    // matches only the literal `[a]` path.
    const bracket = render({
      commit: COMMIT,
      showFiles: true,
      changedFiles: ['src/[a].ts', 'src/ab.ts'],
    });
    const bracketEl = renderFiles(bracket);
    typeFilter(bracket, '[a]');
    expect(
      Array.from(bracketEl.querySelectorAll('[data-testid="commit-details-file-path"]')).map((r) =>
        r.textContent?.trim(),
      ),
    ).toEqual(['src/[a].ts']);

    // `*.ts` is not a glob: only the path that literally contains it matches.
    const star = render({
      commit: COMMIT,
      showFiles: true,
      changedFiles: ['src/*.ts', 'src/a.ts'],
    });
    const starEl = renderFiles(star);
    typeFilter(star, '*.ts');
    expect(
      Array.from(starEl.querySelectorAll('[data-testid="commit-details-file-path"]')).map((r) =>
        r.textContent?.trim(),
      ),
    ).toEqual(['src/*.ts']);
  });

  it('shows a distinct zero-match state when the filter matches nothing', () => {
    const fixture = render({
      commit: COMMIT,
      showFiles: true,
      changedFiles: ['src/alpha.ts', 'src/beta.ts'],
    });
    const el = renderFiles(fixture);

    typeFilter(fixture, 'zzz');

    expect(text(el, 'commit-details-files-filter-empty')).toContain('No files match the filter');
    expect(el.querySelector('[data-testid="commit-details-files-empty"]')).toBeNull();
    expect(el.querySelector('[data-testid="commit-details-file-path"]')).toBeNull();
    expect(text(el, 'commit-details-files-heading')).toBe('0 of 2 changed files');

    // Clearing the filter restores the full list.
    typeFilter(fixture, '');
    expect(el.querySelectorAll('[data-testid="commit-details-file-path"]').length).toBe(2);
    expect(text(el, 'commit-details-files-heading')).toBe('2 changed files');
  });

  it('stays read-only: the changed-files block never mounts a diff surface', () => {
    const fixture = render({ commit: COMMIT, showFiles: true, changedFiles: ['src/a.ts'] });
    const el = renderFiles(fixture);

    // No `st-diff-viewer`, no Monaco, no hunk/code grid: paths only.
    expect(el.querySelector('st-diff-viewer')).toBeNull();
    expect(el.querySelector('[data-testid="diff-viewer"]')).toBeNull();
    expect(el.querySelector('.st-diff-viewer')).toBeNull();
  });
});

// -- Header actions: padlock, contextual nav and show-in-graph ----------------

describe('CommitDetailsPanel — header actions', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('renders an enabled padlock for a real commit and reflects the pressed state', () => {
    const fixture = render({ commit: COMMIT });
    const el = fixture.nativeElement as HTMLElement;

    const lock = button(el, 'commit-details-lock');
    expect(lock).not.toBeNull();
    expect(lock?.disabled).toBe(false);
    // `st-button` forwards `[pressed]` as `aria-pressed` on the native button.
    expect(lock?.getAttribute('aria-pressed')).toBe('false');
    expect(lock?.getAttribute('aria-label')).toBe('Lock commit');

    const unlockedIcon = lock?.querySelector('svg')?.innerHTML;
    expect(unlockedIcon).toBeTruthy();
    // Unlocked renders the open-padlock shackle.
    expect(unlockedIcon).toContain('9.9-1');

    fixture.componentRef.setInput('locked', true);
    fixture.detectChanges();

    expect(lock?.getAttribute('aria-pressed')).toBe('true');
    expect(lock?.getAttribute('aria-label')).toBe('Unlock commit');
    const lockedIcon = lock?.querySelector('svg')?.innerHTML;
    // The lock/lock-open swap changes the glyph geometry.
    expect(lockedIcon).not.toBe(unlockedIcon);
    expect(lockedIcon).toContain('10 0v4');
  });

  it('disables the padlock without a commit', () => {
    const el = render().nativeElement as HTMLElement;
    const lock = button(el, 'commit-details-lock');
    expect(lock).not.toBeNull();
    expect(lock?.disabled).toBe(true);
  });

  it('emits lockToggle when the padlock is clicked', () => {
    const fixture = render({ commit: COMMIT });
    const el = fixture.nativeElement as HTMLElement;
    let toggled = 0;
    fixture.componentInstance.lockToggle.subscribe(() => (toggled += 1));

    button(el, 'commit-details-lock')?.click();

    expect(toggled).toBe(1);
  });

  it('renders no contextual nav action when navMode is none', () => {
    const el = render({ commit: COMMIT }).nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="commit-details-release"]')).toBeNull();
    expect(el.querySelector('[data-testid="commit-details-history"]')).toBeNull();
  });

  it('renders the release ("Back") action in release mode and emits release', () => {
    const fixture = render({ commit: COMMIT, navMode: 'release' });
    const el = fixture.nativeElement as HTMLElement;
    let released = 0;
    fixture.componentInstance.release.subscribe(() => (released += 1));

    const release = el.querySelector<HTMLElement>('[data-testid="commit-details-release"]');
    expect(release).not.toBeNull();
    expect(release?.textContent).toContain('Back');
    expect(el.querySelector('[data-testid="commit-details-history"]')).toBeNull();

    release?.querySelector('button')?.click();

    expect(released).toBe(1);
  });

  it('renders the history action in history mode and emits openHistory', () => {
    const fixture = render({ commit: COMMIT, navMode: 'history' });
    const el = fixture.nativeElement as HTMLElement;
    let opened = 0;
    fixture.componentInstance.openHistory.subscribe(() => (opened += 1));

    const history = el.querySelector<HTMLElement>('[data-testid="commit-details-history"]');
    expect(history).not.toBeNull();
    expect(history?.textContent).toContain('History');
    expect(el.querySelector('[data-testid="commit-details-release"]')).toBeNull();

    history?.querySelector('button')?.click();

    expect(opened).toBe(1);
  });

  it('renders the empty-branch history shortcut when navMode is history', () => {
    const fixture = render({ navMode: 'history' });
    const el = fixture.nativeElement as HTMLElement;
    let opened = 0;
    fixture.componentInstance.openHistory.subscribe(() => (opened += 1));

    expect(text(el, 'commit-details-empty')).toContain('Select a commit');
    const history = button(el, 'commit-details-history');
    expect(history).not.toBeNull();

    history?.click();

    expect(opened).toBe(1);
  });

  it('renders the analyzer-only show-in-graph action and emits revealInGraph', () => {
    const fixture = render({ commit: COMMIT, showInGraph: true });
    const el = fixture.nativeElement as HTMLElement;
    let revealed = 0;
    fixture.componentInstance.revealInGraph.subscribe(() => (revealed += 1));

    const show = button(el, 'commit-details-show-in-graph');
    expect(show).not.toBeNull();
    expect(show?.getAttribute('aria-label')).toBe('Show in graph');

    show?.click();

    expect(revealed).toBe(1);
  });

  it('hides the show-in-graph action unless showInGraph opts in', () => {
    const el = render({ commit: COMMIT }).nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="commit-details-show-in-graph"]')).toBeNull();
  });
});
