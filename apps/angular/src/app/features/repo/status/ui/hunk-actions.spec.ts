import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffLine, FileDiff, Hunk } from '@contracts/domain';
import { HunkActions, isHunkActionable, type HunkActionEvent } from './hunk-actions';

function line(kind: string, text: string): DiffLine {
  return { kind, text, noNewline: false };
}

function hunk(overrides: Partial<Hunk> = {}): Hunk {
  return {
    fromStart: 1,
    fromLines: 2,
    toStart: 1,
    toLines: 2,
    lines: [line('context', 'a'), line('removed', 'b'), line('added', 'B')],
    ...overrides,
  };
}

function file(overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    path: 'a.ts',
    oldPath: '',
    status: 'M',
    hunks: [hunk()],
    additions: 1,
    deletions: 1,
    isBinary: false,
    hasConflictMarkers: false,
    ...overrides,
  };
}

interface Inputs {
  unstagedFile?: FileDiff | null;
  stagedFile?: FileDiff | null;
  busy?: boolean;
  truncated?: boolean;
}

function render(inputs: Inputs = {}): ComponentFixture<HunkActions> {
  const fixture = TestBed.createComponent(HunkActions);
  const ref = fixture.componentRef;
  if (inputs.unstagedFile !== undefined) ref.setInput('unstagedFile', inputs.unstagedFile);
  if (inputs.stagedFile !== undefined) ref.setInput('stagedFile', inputs.stagedFile);
  if (inputs.busy !== undefined) ref.setInput('busy', inputs.busy);
  if (inputs.truncated !== undefined) ref.setInput('truncated', inputs.truncated);
  fixture.detectChanges();
  return fixture;
}

function query(fixture: ComponentFixture<HunkActions>, testId: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  );
}

function all(fixture: ComponentFixture<HunkActions>, testId: string): HTMLElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
      `[data-testid="${testId}"]`,
    ),
  );
}

function button(fixture: ComponentFixture<HunkActions>, testId: string): HTMLButtonElement {
  return query(fixture, testId) as HTMLButtonElement;
}

describe('isHunkActionable', () => {
  it('is true for a tracked textual file with hunks', () => {
    expect(isHunkActionable(file())).toBe(true);
  });

  it('is false for binary, conflicted, deleted and hunk-less files', () => {
    expect(isHunkActionable(file({ isBinary: true }))).toBe(false);
    expect(isHunkActionable(file({ hasConflictMarkers: true }))).toBe(false);
    expect(isHunkActionable(file({ status: 'D' }))).toBe(false);
    expect(isHunkActionable(file({ hunks: [] }))).toBe(false);
  });
});

describe('HunkActions', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders only the unstaged group with Stage/Discard (no Unstage)', () => {
    const fixture = render({ unstagedFile: file() });

    expect(query(fixture, 'hunk-group-unstaged')).not.toBeNull();
    expect(query(fixture, 'hunk-group-staged')).toBeNull();
    expect(all(fixture, 'hunk-stage')).toHaveLength(1);
    expect(all(fixture, 'hunk-discard')).toHaveLength(1);
    expect(all(fixture, 'hunk-unstage')).toHaveLength(0);
  });

  it('renders only the staged group with Unstage (no Stage/Discard)', () => {
    const fixture = render({ stagedFile: file() });

    expect(query(fixture, 'hunk-group-staged')).not.toBeNull();
    expect(query(fixture, 'hunk-group-unstaged')).toBeNull();
    expect(all(fixture, 'hunk-unstage')).toHaveLength(1);
    expect(all(fixture, 'hunk-stage')).toHaveLength(0);
    expect(all(fixture, 'hunk-discard')).toHaveLength(0);
  });

  it('renders both groups for a partially staged file', () => {
    const fixture = render({ unstagedFile: file(), stagedFile: file() });

    expect(query(fixture, 'hunk-group-unstaged')).not.toBeNull();
    expect(query(fixture, 'hunk-group-staged')).not.toBeNull();
  });

  it('shows per-file and per-hunk addition/deletion counts', () => {
    const fixture = render({
      unstagedFile: file({ additions: 3, deletions: 2 }),
    });

    expect(query(fixture, 'hunk-file-counts')?.textContent).toContain('+3');
    expect(query(fixture, 'hunk-file-counts')?.textContent).toContain('-2');
    expect(query(fixture, 'hunk-counts')?.textContent).toContain('+1');
    expect(query(fixture, 'hunk-counts')?.textContent).toContain('-1');
  });

  it('disables hunk buttons while busy', () => {
    const fixture = render({ unstagedFile: file(), busy: true });

    const stage = (query(fixture, 'hunk-stage')?.querySelector('button')) as HTMLButtonElement;
    const discard = (query(fixture, 'hunk-discard')?.querySelector('button')) as HTMLButtonElement;
    expect(stage.disabled).toBe(true);
    expect(discard.disabled).toBe(true);
  });

  it('exposes an accessible name on every hunk action button', () => {
    const unstaged = render({ unstagedFile: file() });
    expect(
      query(unstaged, 'hunk-stage')?.querySelector('button')?.getAttribute('aria-label'),
    ).toBeTruthy();
    expect(
      query(unstaged, 'hunk-discard')?.querySelector('button')?.getAttribute('aria-label'),
    ).toBeTruthy();
    expect(
      query(unstaged, 'hunk-file-discard')?.querySelector('button')?.getAttribute('aria-label'),
    ).toBeTruthy();

    const staged = render({ stagedFile: file() });
    expect(
      query(staged, 'hunk-unstage')?.querySelector('button')?.getAttribute('aria-label'),
    ).toBeTruthy();
  });

  it('emits stageHunk with empty lineIndices for a whole hunk', () => {
    const fixture = render({ unstagedFile: file() });
    const emitted: HunkActionEvent[] = [];
    fixture.componentInstance.stageHunk.subscribe((event) => emitted.push(event));

    button(fixture, 'hunk-stage').click();

    expect(emitted).toEqual([{ path: 'a.ts', hunkIndex: 0, lineIndices: [] }]);
  });

  it('emits stageHunk with selected line indices after per-line selection', () => {
    const fixture = render({ unstagedFile: file() });
    const emitted: HunkActionEvent[] = [];
    fixture.componentInstance.stageHunk.subscribe((event) => emitted.push(event));

    const checks = all(fixture, 'hunk-line') as HTMLInputElement[];
    // Lines 1 (removed) and 2 (added) are the changed lines; select both.
    checks[0].click();
    checks[1].click();
    fixture.detectChanges();

    expect(query(fixture, 'hunk-selection')?.textContent).toContain('2 selected');
    button(fixture, 'hunk-stage').click();

    expect(emitted).toEqual([{ path: 'a.ts', hunkIndex: 0, lineIndices: [1, 2] }]);
  });

  it('toggles a selected line back off', () => {
    const fixture = render({ unstagedFile: file() });
    const component = fixture.componentInstance;
    const checks = all(fixture, 'hunk-line') as HTMLInputElement[];

    checks[0].click();
    fixture.detectChanges();
    expect(component.lineIndices(false, 0)).toEqual([1]);

    checks[0].click();
    fixture.detectChanges();
    expect(component.lineIndices(false, 0)).toEqual([]);
  });

  it('emits unstageHunk from the staged group', () => {
    const fixture = render({ stagedFile: file() });
    const emitted: HunkActionEvent[] = [];
    fixture.componentInstance.unstageHunk.subscribe((event) => emitted.push(event));

    button(fixture, 'hunk-unstage').click();

    expect(emitted).toEqual([{ path: 'a.ts', hunkIndex: 0, lineIndices: [] }]);
  });

  it('emits discardHunk from the unstaged group', () => {
    const fixture = render({ unstagedFile: file() });
    const emitted: HunkActionEvent[] = [];
    fixture.componentInstance.discardHunk.subscribe((event) => emitted.push(event));

    button(fixture, 'hunk-discard').click();

    expect(emitted).toEqual([{ path: 'a.ts', hunkIndex: 0, lineIndices: [] }]);
  });

  it('does not emit when busy', () => {
    const fixture = render({ unstagedFile: file(), busy: true });
    const stage = vi.fn();
    const discard = vi.fn();
    fixture.componentInstance.stageHunk.subscribe(stage);
    fixture.componentInstance.discardHunk.subscribe(discard);

    button(fixture, 'hunk-stage').click();
    button(fixture, 'hunk-discard').click();

    expect(stage).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
  });

  it('confirms before a file-level discard and emits the path', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fixture = render({ unstagedFile: file() });
    const emitted: string[] = [];
    fixture.componentInstance.discardFile.subscribe((path) => emitted.push(path));

    button(fixture, 'hunk-file-discard').click();

    expect(confirmSpy).toHaveBeenCalled();
    expect(emitted).toEqual(['a.ts']);
  });

  it('cancels a file-level discard when the confirmation is declined', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fixture = render({ unstagedFile: file() });
    const emitted: string[] = [];
    fixture.componentInstance.discardFile.subscribe((path) => emitted.push(path));

    button(fixture, 'hunk-file-discard').click();

    expect(emitted).toEqual([]);
  });

  it('exposes file-level actions only for binary/deleted/hunk-less files', () => {
    const fixture = render({ unstagedFile: file({ isBinary: true, hunks: [] }) });

    expect(query(fixture, 'hunk-file-only')).not.toBeNull();
    expect(all(fixture, 'hunk-stage')).toHaveLength(0);
    expect(query(fixture, 'hunk-file-discard')).not.toBeNull();
  });

  it('renders a truncated notice without crashing', () => {
    const fixture = render({ unstagedFile: file(), truncated: true });

    expect(query(fixture, 'hunk-actions-truncated')?.textContent).toContain('truncated');
  });

  it('renders nothing when neither side is present', () => {
    const fixture = render({});
    expect(query(fixture, 'hunk-group-unstaged')).toBeNull();
    expect(query(fixture, 'hunk-group-staged')).toBeNull();
  });
});
