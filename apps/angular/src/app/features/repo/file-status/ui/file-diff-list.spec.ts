import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DiffLine, FileDiff } from '@contracts/domain';
import { FileDiffList } from './file-diff-list';

function line(kind: string, text: string): DiffLine {
  return { kind, text, noNewline: false };
}

function fileDiff(path: string, overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    path,
    oldPath: '',
    status: 'M',
    hunks: [
      {
        fromStart: 1,
        fromLines: 1,
        toStart: 1,
        toLines: 1,
        lines: [line('added', 'x')],
      },
    ],
    additions: 3,
    deletions: 1,
    isBinary: false,
    hasConflictMarkers: false,
    ...overrides,
  };
}

interface ListInputs {
  files?: FileDiff[];
  selectedPath?: string | null;
}

function render(inputs: ListInputs = {}): ComponentFixture<FileDiffList> {
  const fixture = TestBed.createComponent(FileDiffList);
  const ref = fixture.componentRef;
  ref.setInput('files', inputs.files ?? []);
  ref.setInput('selectedPath', inputs.selectedPath ?? null);
  fixture.detectChanges();
  return fixture;
}

function all(fixture: ComponentFixture<FileDiffList>, testId: string): HTMLElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
      `[data-testid="${testId}"]`,
    ),
  );
}

function query<T extends HTMLElement = HTMLElement>(
  fixture: ComponentFixture<FileDiffList>,
  testId: string,
): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(
    `[data-testid="${testId}"]`,
  );
}

describe('FileDiffList', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('renders a row per file with its status badge and +/- counts', () => {
    const fixture = render({ files: [fileDiff('a.ts'), fileDiff('b.ts', { status: 'A', additions: 7, deletions: 0 })] });

    const rows = all(fixture, 'file-diff-row');
    expect(rows).toHaveLength(2);

    const first = rows[0];
    expect(first.querySelector('[data-testid="file-diff-status"]')?.textContent?.trim()).toBe('M');
    expect(first.querySelector('[data-testid="file-diff-additions"]')?.textContent?.trim()).toBe(
      '+3',
    );
    expect(first.querySelector('[data-testid="file-diff-deletions"]')?.textContent?.trim()).toBe(
      '\u22121',
    );
    expect(first.querySelector('.st-file-diff-list__path')?.textContent?.trim()).toBe('a.ts');

    const second = rows[1];
    expect(second.querySelector('[data-testid="file-diff-status"]')?.textContent?.trim()).toBe('A');
    expect(second.querySelector('[data-testid="file-diff-additions"]')?.textContent?.trim()).toBe(
      '+7',
    );
  });

  it('marks the selected row and leaves the others unmarked', () => {
    const fixture = render({ files: [fileDiff('a.ts'), fileDiff('b.ts')], selectedPath: 'b.ts' });

    const rows = all(fixture, 'file-diff-row');
    expect(rows[0].classList.contains('st-file-diff-list__row--selected')).toBe(false);
    expect(rows[1].classList.contains('st-file-diff-list__row--selected')).toBe(true);
    expect(rows[0].getAttribute('data-selected')).toBe('false');
    expect(rows[1].getAttribute('data-selected')).toBe('true');
    // The selectable-row directive supplies the shared 3px inset selection bar.
    expect(rows[0].classList.contains('st-selection-bar')).toBe(false);
    expect(rows[1].classList.contains('st-selection-bar')).toBe(true);
  });

  it('emits the path of the clicked row', () => {
    const fixture = render({ files: [fileDiff('a.ts'), fileDiff('b.ts')] });
    const selected: string[] = [];
    fixture.componentInstance.fileSelect.subscribe((path) => selected.push(path));

    all(fixture, 'file-diff-row')[1].click();

    expect(selected).toEqual(['b.ts']);
  });

  it('addresses a renamed file by its new path', () => {
    const fixture = render({
      files: [fileDiff('src/new-name.ts', { status: 'R', oldPath: 'src/old-name.ts' })],
    });

    const row = all(fixture, 'file-diff-row')[0];
    expect(row.getAttribute('data-path')).toBe('src/new-name.ts');
    expect(row.textContent).toContain('src/new-name.ts');
    expect(row.textContent).not.toContain('src/old-name.ts');

    const emitted: string[] = [];
    fixture.componentInstance.fileSelect.subscribe((path) => emitted.push(path));
    row.click();
    expect(emitted).toEqual(['src/new-name.ts']);
  });

  it('shows a binary marker instead of the diff counts', () => {
    const fixture = render({ files: [fileDiff('img/logo.png', { isBinary: true, hunks: [] })] });

    expect(query(fixture, 'file-diff-binary')?.textContent?.trim()).toBe('binary');
    expect(all(fixture, 'file-diff-additions')).toHaveLength(0);
    expect(all(fixture, 'file-diff-deletions')).toHaveLength(0);
  });

  it('renders the empty state when there is nothing changed', () => {
    const fixture = render({ files: [] });

    expect(query(fixture, 'file-list-empty')?.textContent?.trim()).toBe('No changed files.');
    expect(all(fixture, 'file-diff-row')).toHaveLength(0);
  });
});
