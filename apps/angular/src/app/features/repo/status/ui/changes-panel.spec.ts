import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffLine, FileDiff, FileStatus, Hunk } from '@contracts/domain';
import { ChangesPanel } from './changes-panel';

interface PanelInputs {
  stagedFiles?: FileStatus[];
  unstagedFiles?: FileStatus[];
  message?: string;
  busy?: boolean;
  selectedPath?: string | null;
  statusError?: string | null;
  commitError?: string | null;
  unstagedFile?: FileDiff | null;
  stagedFile?: FileDiff | null;
  diffTruncated?: boolean;
}

function file(path: string, isStaged: boolean): FileStatus {
  return { path, staged: isStaged ? 'M' : ' ', unstaged: 'M', isStaged, isConflicted: false };
}

function line(kind: string, text: string): DiffLine {
  return { kind, text, noNewline: false };
}

function hunk(): Hunk {
  return {
    fromStart: 1,
    fromLines: 2,
    toStart: 1,
    toLines: 2,
    lines: [line('context', 'a'), line('removed', 'b'), line('added', 'B')],
  };
}

function fileDiff(path: string, overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    path,
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

function render(inputs: PanelInputs = {}): ComponentFixture<ChangesPanel> {
  const fixture = TestBed.createComponent(ChangesPanel);
  const ref = fixture.componentRef;
  if (inputs.stagedFiles !== undefined) ref.setInput('stagedFiles', inputs.stagedFiles);
  if (inputs.unstagedFiles !== undefined) ref.setInput('unstagedFiles', inputs.unstagedFiles);
  if (inputs.message !== undefined) ref.setInput('message', inputs.message);
  if (inputs.busy !== undefined) ref.setInput('busy', inputs.busy);
  if (inputs.selectedPath !== undefined) ref.setInput('selectedPath', inputs.selectedPath);
  if (inputs.statusError !== undefined) ref.setInput('statusError', inputs.statusError);
  if (inputs.commitError !== undefined) ref.setInput('commitError', inputs.commitError);
  if (inputs.unstagedFile !== undefined) ref.setInput('unstagedFile', inputs.unstagedFile);
  if (inputs.stagedFile !== undefined) ref.setInput('stagedFile', inputs.stagedFile);
  if (inputs.diffTruncated !== undefined) ref.setInput('diffTruncated', inputs.diffTruncated);
  fixture.detectChanges();
  return fixture;
}

function query(fixture: ComponentFixture<ChangesPanel>, testId: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  );
}

function all(fixture: ComponentFixture<ChangesPanel>, testId: string): HTMLElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`),
  );
}

function button(fixture: ComponentFixture<ChangesPanel>, testId: string): HTMLButtonElement {
  return query(fixture, testId) as HTMLButtonElement;
}

describe('ChangesPanel', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('renders staged and unstaged rows with their paths', () => {
    const fixture = render({
      stagedFiles: [file('staged.ts', true)],
      unstagedFiles: [file('dirty.ts', false)],
    });

    const rows = all(fixture, 'status-file').map((row) => row.textContent?.trim());
    expect(rows).toHaveLength(2);
    expect(rows.some((text) => text?.includes('staged.ts'))).toBe(true);
    expect(rows.some((text) => text?.includes('dirty.ts'))).toBe(true);
    expect(all(fixture, 'status-unstage')).toHaveLength(1);
    expect(all(fixture, 'status-stage')).toHaveLength(1);
  });

  it('emits the path from a Stage click (and not from Unstage rows)', () => {
    const fixture = render({ unstagedFiles: [file('a.ts', false)] });
    const emitted: string[][] = [];
    fixture.componentInstance.stage.subscribe((paths) => emitted.push(paths));

    button(fixture, 'status-stage').click();

    expect(emitted).toEqual([['a.ts']]);
  });

  it('emits the path from an Unstage click', () => {
    const fixture = render({ stagedFiles: [file('b.ts', true)] });
    const emitted: string[][] = [];
    fixture.componentInstance.unstage.subscribe((paths) => emitted.push(paths));

    button(fixture, 'status-unstage').click();

    expect(emitted).toEqual([['b.ts']]);
  });

  it('emits a row selection without staging when the row itself is clicked', () => {
    const fixture = render({ unstagedFiles: [file('a.ts', false)] });
    const selected: string[] = [];
    const staged: string[][] = [];
    fixture.componentInstance.fileSelect.subscribe((path) => selected.push(path));
    fixture.componentInstance.stage.subscribe((paths) => staged.push(paths));

    all(fixture, 'status-file')[0].click();

    expect(selected).toEqual(['a.ts']);
    expect(staged).toEqual([]);
  });

  it('emits message changes from the commit box', () => {
    const fixture = render({ message: '' });
    const changes: string[] = [];
    fixture.componentInstance.messageChange.subscribe((value) => changes.push(value));

    const textarea = (query(fixture, 'commit-message-input')?.querySelector(
      'textarea',
    )) as HTMLTextAreaElement;
    textarea.value = 'feat: graph';
    textarea.dispatchEvent(new Event('input'));

    expect(changes).toEqual(['feat: graph']);
  });

  it('keeps Commit disabled until there is a staged file and a non-blank message', () => {
    const noStaged = render({ stagedFiles: [], message: 'feat' });
    expect(
      ((query(noStaged, 'commit-button')?.querySelector('button')) as HTMLButtonElement).disabled,
    ).toBe(true);

    const blankMessage = render({ stagedFiles: [file('a.ts', true)], message: '   ' });
    expect(
      ((query(blankMessage, 'commit-button')?.querySelector('button')) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    const ready = render({ stagedFiles: [file('a.ts', true)], message: 'feat' });
    expect(
      ((query(ready, 'commit-button')?.querySelector('button')) as HTMLButtonElement).disabled,
    ).toBe(false);

    const busy = render({ stagedFiles: [file('a.ts', true)], message: 'feat', busy: true });
    expect(
      ((query(busy, 'commit-button')?.querySelector('button')) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('emits commit when the button is enabled', () => {
    const fixture = render({ stagedFiles: [file('a.ts', true)], message: 'feat' });
    const commit = vi.fn();
    fixture.componentInstance.commit.subscribe(commit);

    button(fixture, 'commit-button').click();

    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('shows the status and commit errors in their own slots', () => {
    const fixture = render({ statusError: 'status failed', commitError: 'commit failed' });

    expect(query(fixture, 'status-error')?.textContent?.trim()).toBe('status failed');
    expect(query(fixture, 'commit-error')?.textContent?.trim()).toBe('commit failed');
  });

  it('shows the empty state when there are no changes', () => {
    const fixture = render({ stagedFiles: [], unstagedFiles: [] });
    expect(query(fixture, 'status-empty')).not.toBeNull();

    const withFiles = render({ unstagedFiles: [file('a.ts', false)] });
    expect(query(withFiles, 'status-empty')).toBeNull();
  });

  it('renders a file-level Discard only on unstaged rows', () => {
    const fixture = render({
      stagedFiles: [file('staged.ts', true)],
      unstagedFiles: [file('dirty.ts', false)],
    });

    expect(all(fixture, 'status-discard')).toHaveLength(1);
    expect(all(fixture, 'status-stage')).toHaveLength(1);
    expect(all(fixture, 'status-unstage')).toHaveLength(1);
  });

  it('confirms and emits a file-level discard', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fixture = render({ unstagedFiles: [file('dirty.ts', false)] });
    const discarded: string[] = [];
    fixture.componentInstance.discardFile.subscribe((path) => discarded.push(path));

    button(fixture, 'status-discard').click();

    expect(discarded).toEqual(['dirty.ts']);
  });

  it('does not discard when the confirmation is declined', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fixture = render({ unstagedFiles: [file('dirty.ts', false)] });
    const discarded: string[] = [];
    fixture.componentInstance.discardFile.subscribe((path) => discarded.push(path));

    button(fixture, 'status-discard').click();

    expect(discarded).toEqual([]);
  });

  it('does not discard while busy', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fixture = render({ unstagedFiles: [file('dirty.ts', false)], busy: true });
    const discarded: string[] = [];
    fixture.componentInstance.discardFile.subscribe((path) => discarded.push(path));

    button(fixture, 'status-discard').click();

    expect(discarded).toEqual([]);
  });

  it('exposes the hunk actions for the selected file and forwards their events', () => {
    const fixture = render({
      unstagedFiles: [file('a.ts', false)],
      selectedPath: 'a.ts',
      unstagedFile: fileDiff('a.ts'),
    });
    const staged: unknown[] = [];
    const discarded: unknown[] = [];
    fixture.componentInstance.stageHunk.subscribe((event) => staged.push(event));
    fixture.componentInstance.discardHunk.subscribe((event) => discarded.push(event));

    expect(query(fixture, 'changes-hunks')).not.toBeNull();
    button(fixture, 'hunk-stage').click();
    button(fixture, 'hunk-discard').click();

    expect(staged).toEqual([{ path: 'a.ts', hunkIndex: 0, lineIndices: [] }]);
    expect(discarded).toEqual([{ path: 'a.ts', hunkIndex: 0, lineIndices: [] }]);
  });

  it('hides the hunk actions without a selected file diff', () => {
    const fixture = render({ unstagedFiles: [file('a.ts', false)], selectedPath: 'a.ts' });
    expect(query(fixture, 'changes-hunks')).toBeNull();
  });

  it('renders the truncated notice in the hunk actions', () => {
    const fixture = render({
      unstagedFiles: [file('a.ts', false)],
      selectedPath: 'a.ts',
      unstagedFile: fileDiff('a.ts'),
      diffTruncated: true,
    });

    expect(query(fixture, 'hunk-actions-truncated')?.textContent).toContain('truncated');
  });
});
