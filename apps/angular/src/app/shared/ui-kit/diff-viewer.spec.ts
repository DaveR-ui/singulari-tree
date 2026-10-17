import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Diff } from '@contracts/domain';
import {
  DiffViewer,
  MONACO_ENVIRONMENT_AVAILABLE,
  MONACO_LOADER,
  diffLineHeight,
  hunksToTexts,
  monacoEnvironmentAvailable,
  shouldInitializeMonaco,
  type MonacoLoader,
  type MonacoModule,
} from '@singularitree/ui-kit';

// Exercises the ui-kit `<st-diff-viewer>` through the renderer test runner. Real
// Monaco is never booted here: jsdom has no `Worker`, so the component stays on
// its 4-column grid fallback unless the environment probe and loader are faked.

function makeDiff(overrides: Partial<Diff> = {}): Diff {
  return {
    from: undefined,
    to: undefined,
    hunks: [
      {
        fromStart: 1,
        fromLines: 2,
        toStart: 1,
        toLines: 2,
        lines: [
          { kind: 'context', text: 'a', noNewline: false },
          { kind: 'removed', text: 'b', noNewline: false },
          { kind: 'added', text: 'B', noNewline: false },
        ],
      },
    ],
    additions: 1,
    deletions: 1,
    isBinary: false,
    hasConflictMarkers: false,
    files: [],
    truncated: false,
    ...overrides,
  };
}

function render(
  diff: Diff | null,
  loading = false,
  errorMsg: string | null = null,
  typography: { fontSize?: number; wordWrap?: boolean } = {},
) {
  const fixture = TestBed.createComponent(DiffViewer);
  fixture.componentRef.setInput('diff', diff);
  fixture.componentRef.setInput('loading', loading);
  fixture.componentRef.setInput('errorMsg', errorMsg);
  if (typography.fontSize !== undefined) {
    fixture.componentRef.setInput('fontSize', typography.fontSize);
  }
  if (typography.wordWrap !== undefined) {
    fixture.componentRef.setInput('wordWrap', typography.wordWrap);
  }
  fixture.detectChanges();
  return fixture;
}

function query(fixture: ComponentFixture<DiffViewer>, testId: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  );
}

interface FakeModel {
  value: string;
  disposed: boolean;
  getValue(): string;
  setValue(next: string): void;
  dispose(): void;
}

/** Options bag captured by the fake `createDiffEditor`. */
interface FakeDiffEditorOptions {
  renderSideBySide?: boolean;
  fontSize?: number;
  lineHeight?: number;
  wordWrap?: 'on' | 'off';
}

/** Minimal Monaco stand-in: records models and the diff editor without DOM. */
function makeFakeMonaco() {
  const models: FakeModel[] = [];
  const diffEditor = { setModel: vi.fn(), dispose: vi.fn(), updateOptions: vi.fn() };
  const setTheme = vi.fn();
  const defineTheme = vi.fn();
  const createDiffEditor = vi.fn(
    (_container: HTMLElement, _options: FakeDiffEditorOptions) => diffEditor,
  );
  const monaco = {
    editor: {
      createModel: vi.fn((value: string): FakeModel => {
        const model: FakeModel = {
          value,
          disposed: false,
          getValue: () => model.value,
          setValue: (next) => {
            model.value = next;
          },
          dispose: vi.fn(() => {
            model.disposed = true;
          }),
        };
        models.push(model);
        return model;
      }),
      createDiffEditor,
      setTheme,
      defineTheme,
    },
  };
  return {
    monaco: monaco as unknown as MonacoModule,
    models,
    diffEditor,
    createDiffEditor,
    setTheme,
    defineTheme,
  };
}

describe('hunksToTexts', () => {
  it('splits context/removed/added into original, modified and unified', () => {
    const texts = hunksToTexts(makeDiff());

    expect(texts.original).toBe('a\nb');
    expect(texts.modified).toBe('a\nB');
    expect(texts.unified).toBe('@@ -1,2 +1,2 @@\n a\n-b\n+B');
  });

  it('marks a no-newline line in the unified view only', () => {
    const diff = makeDiff({
      hunks: [
        {
          fromStart: 1,
          fromLines: 1,
          toStart: 1,
          toLines: 1,
          lines: [{ kind: 'added', text: 'B', noNewline: true }],
        },
      ],
    });

    const texts = hunksToTexts(diff);

    expect(texts.modified).toBe('B');
    expect(texts.original).toBe('');
    expect(texts.unified).toBe('@@ -1,1 +1,1 @@\n+B\n\\ No newline at end of file');
  });

  it('returns empty texts for a binary diff and for a null diff', () => {
    const binary = makeDiff({ hunks: [], isBinary: true });
    expect(hunksToTexts(binary)).toEqual({ original: '', modified: '', unified: '' });
    expect(hunksToTexts(null)).toEqual({ original: '', modified: '', unified: '' });
  });

  it('keeps a diff with conflict markers renderable', () => {
    const diff = makeDiff({
      hasConflictMarkers: true,
      hunks: [
        {
          fromStart: 1,
          fromLines: 1,
          toStart: 1,
          toLines: 3,
          lines: [
            { kind: 'added', text: '<<<<<<< HEAD', noNewline: false },
            { kind: 'added', text: 'mine', noNewline: false },
            { kind: 'added', text: '>>>>>>> other', noNewline: false },
          ],
        },
      ],
    });

    expect(hunksToTexts(diff).unified).toContain('<<<<<<< HEAD');
  });
});

describe('DiffViewer (ui-kit)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('exposes the `diff-viewer` host test id', () => {
    const fixture = render(makeDiff());
    expect((fixture.nativeElement as HTMLElement).getAttribute('data-testid')).toBe('diff-viewer');
  });

  it('uses the plain fallback (no Monaco) and renders the unified text', () => {
    const fixture = render(makeDiff());

    // jsdom has no Worker: Monaco must not initialize, so the fallback stays.
    expect(typeof Worker).toBe('undefined');
    const fallback = query(fixture, 'diff-fallback');
    expect(fallback).not.toBeNull();
    expect(fallback?.textContent).toContain('@@ -1,2 +1,2 @@');
    expect(fallback?.textContent).toContain('-b');
    expect(fallback?.textContent).toContain('+B');
  });

  it('shows the empty state without a diff or without hunks', () => {
    expect(query(render(null), 'diff-empty')).not.toBeNull();
    expect(query(render(makeDiff({ hunks: [] })), 'diff-empty')).not.toBeNull();
  });

  it('distinguishes binary, conflict, loading and error states', () => {
    expect(query(render(makeDiff({ hunks: [], isBinary: true })), 'diff-binary')).not.toBeNull();
    expect(
      query(render(makeDiff({ hasConflictMarkers: true })), 'diff-conflict'),
    ).not.toBeNull();
    expect(query(render(null, true), 'diff-loading')).not.toBeNull();
    expect(query(render(null, false, 'DIFF_FAILED'), 'diff-error')?.textContent?.trim()).toBe(
      'DIFF_FAILED',
    );
  });

  it('shows a truncated notice while still rendering the diff', () => {
    const fixture = TestBed.createComponent(DiffViewer);
    fixture.componentRef.setInput('diff', makeDiff());
    fixture.componentRef.setInput('truncated', true);
    fixture.detectChanges();

    expect(query(fixture, 'diff-truncated')?.textContent).toContain('truncated');
    // The notice is additive: the diff still renders underneath.
    expect(query(fixture, 'diff-fallback')).not.toBeNull();
  });

  it('omits the truncated notice by default', () => {
    expect(query(render(makeDiff()), 'diff-truncated')).toBeNull();
  });

  it('renders the fallback grid on the default 12px / 24px grid with wrap off', () => {
    const fixture = render(makeDiff());

    const fallback = query(fixture, 'diff-fallback');
    expect(fallback).not.toBeNull();
    expect(fallback!.getAttribute('data-wrap')).toBe('off');
    expect(fallback!.style.fontSize).toBe('12px');
    expect(fallback!.style.lineHeight).toBe('24px');
  });

  it('applies the fontSize and wordWrap inputs to the fallback grid', () => {
    const fixture = render(makeDiff(), false, null, { fontSize: 13, wordWrap: true });

    const fallback = query(fixture, 'diff-fallback');
    expect(fallback!.getAttribute('data-wrap')).toBe('on');
    expect(fallback!.style.fontSize).toBe('13px');
    expect(fallback!.style.lineHeight).toBe('26px');
  });
});

describe('diffLineHeight', () => {
  it('is exactly twice the font size on the shipped Settings presets', () => {
    expect(diffLineHeight(11)).toBe(22);
    expect(diffLineHeight(12)).toBe(24);
    expect(diffLineHeight(13)).toBe(26);
  });
});

describe('shouldInitializeMonaco', () => {
  const base = {
    loading: false,
    error: false,
    isBinary: false,
    hasConflict: false,
    isEmpty: false,
  };

  it('is true only for a real, renderable diff', () => {
    expect(shouldInitializeMonaco(base)).toBe(true);
    expect(shouldInitializeMonaco({ ...base, loading: true })).toBe(false);
    expect(shouldInitializeMonaco({ ...base, error: true })).toBe(false);
    expect(shouldInitializeMonaco({ ...base, isBinary: true })).toBe(false);
    expect(shouldInitializeMonaco({ ...base, hasConflict: true })).toBe(false);
    expect(shouldInitializeMonaco({ ...base, isEmpty: true })).toBe(false);
  });
});

describe('DiffViewer Monaco initialization', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  async function configure(loader: MonacoLoader, environmentAvailable: boolean): Promise<void> {
    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: MONACO_ENVIRONMENT_AVAILABLE, useValue: () => environmentAvailable },
        { provide: MONACO_LOADER, useValue: loader },
      ],
    }).compileComponents();
  }

  it('initializes Monaco exactly once when a real diff arrives asynchronously', async () => {
    const fake = makeFakeMonaco();
    const loader = vi.fn(() => Promise.resolve(fake.monaco));
    await configure(loader, true);

    const fixture = TestBed.createComponent(DiffViewer);
    // First render mirrors the store: no diff yet, still loading.
    fixture.componentRef.setInput('diff', null);
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    TestBed.tick();
    expect(loader).not.toHaveBeenCalled();

    // The asynchronous diff arrives.
    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('diff', makeDiff());
    fixture.detectChanges();
    TestBed.tick();

    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => {
      fixture.detectChanges();
      TestBed.tick();
      expect(query(fixture, 'diff-fallback')).toBeNull();
    });
    expect(fake.diffEditor.setModel).toHaveBeenCalledTimes(1);

    // A later diff update reuses the mounted editor: the loader runs only once.
    fixture.componentRef.setInput('diff', makeDiff({ additions: 5 }));
    fixture.detectChanges();
    TestBed.tick();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('stays on the fallback and never loads Monaco in jsdom', async () => {
    const fake = makeFakeMonaco();
    const loader = vi.fn(() => Promise.resolve(fake.monaco));
    await configure(loader, false);

    const fixture = TestBed.createComponent(DiffViewer);
    fixture.componentRef.setInput('diff', makeDiff());
    fixture.detectChanges();
    TestBed.tick();

    expect(typeof Worker).toBe('undefined');
    expect(monacoEnvironmentAvailable()).toBe(false);
    expect(loader).not.toHaveBeenCalled();
    expect(query(fixture, 'diff-fallback')).not.toBeNull();
  });

  it('defaults renderSideBySide to false (unified default)', async () => {
    const fake = makeFakeMonaco();
    const loader = vi.fn(() => Promise.resolve(fake.monaco));
    await configure(loader, true);

    const fixture = TestBed.createComponent(DiffViewer);
    fixture.componentRef.setInput('diff', makeDiff());
    fixture.detectChanges();
    TestBed.tick();

    await vi.waitFor(() => expect(fake.createDiffEditor).toHaveBeenCalledTimes(1));
    expect(fake.createDiffEditor.mock.calls[0][1].renderSideBySide).toBe(false);
  });

  it('registers the singularitree theme before editor creation', async () => {
    const fake = makeFakeMonaco();
    const loader = vi.fn(() => Promise.resolve(fake.monaco));
    await configure(loader, true);

    const fixture = TestBed.createComponent(DiffViewer);
    fixture.componentRef.setInput('diff', makeDiff());
    fixture.detectChanges();
    TestBed.tick();

    await vi.waitFor(() => expect(fake.setTheme).toHaveBeenCalledWith('singularitree-dark'));
  });

  it('passes the default diff typography to Monaco at init (12 / 24 / off)', async () => {
    const fake = makeFakeMonaco();
    const loader = vi.fn(() => Promise.resolve(fake.monaco));
    await configure(loader, true);

    const fixture = TestBed.createComponent(DiffViewer);
    fixture.componentRef.setInput('diff', makeDiff());
    fixture.detectChanges();
    TestBed.tick();

    await vi.waitFor(() => expect(fake.createDiffEditor).toHaveBeenCalledTimes(1));
    const options = fake.createDiffEditor.mock.calls[0][1];
    expect(options.fontSize).toBe(12);
    expect(options.lineHeight).toBe(24);
    expect(options.wordWrap).toBe('off');
    // The existing unified default is unchanged by the typography pass-through.
    expect(options.renderSideBySide).toBe(false);
  });

  it('updates the mounted editor typography live, without a remount', async () => {
    const fake = makeFakeMonaco();
    const loader = vi.fn(() => Promise.resolve(fake.monaco));
    await configure(loader, true);

    const fixture = TestBed.createComponent(DiffViewer);
    fixture.componentRef.setInput('diff', makeDiff());
    fixture.detectChanges();
    TestBed.tick();

    await vi.waitFor(() => expect(fake.createDiffEditor).toHaveBeenCalledTimes(1));

    fixture.componentRef.setInput('fontSize', 13);
    fixture.componentRef.setInput('wordWrap', true);
    fixture.detectChanges();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(fake.diffEditor.updateOptions).toHaveBeenCalledWith({
        fontSize: 13,
        lineHeight: 26,
        wordWrap: 'on',
      });
    });

    // Options only: a typography change never remounts the editor.
    expect(fake.createDiffEditor).toHaveBeenCalledTimes(1);
  });

  it('flips renderSideBySide via the input', async () => {
    const fake = makeFakeMonaco();
    const loader = vi.fn(() => Promise.resolve(fake.monaco));
    await configure(loader, true);

    const fixture = TestBed.createComponent(DiffViewer);
    fixture.componentRef.setInput('diff', makeDiff());
    fixture.detectChanges();
    TestBed.tick();

    await vi.waitFor(() => expect(fake.createDiffEditor).toHaveBeenCalledTimes(1));

    fixture.componentRef.setInput('renderSideBySide', true);
    fixture.detectChanges();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(fake.diffEditor.updateOptions).toHaveBeenCalledWith({ renderSideBySide: true });
    });
  });

  it('projects a 4-column grid fallback with the hunk header and +/- signs', async () => {
    const fake = makeFakeMonaco();
    const loader = vi.fn(() => Promise.resolve(fake.monaco));
    await configure(loader, false);

    const diff = makeDiff({
      hunks: [
        {
          fromStart: 1,
          fromLines: 1,
          toStart: 1,
          toLines: 1,
          lines: [
            { kind: 'removed', text: 'old', noNewline: false },
            { kind: 'added', text: 'new', noNewline: false },
          ],
        },
      ],
    });

    const fixture = TestBed.createComponent(DiffViewer);
    fixture.componentRef.setInput('diff', diff);
    fixture.detectChanges();
    TestBed.tick();

    const fallback = query(fixture, 'diff-fallback');
    expect(fallback).not.toBeNull();
    const hunk = fallback?.querySelector<HTMLElement>('[data-testid="diff-fallback-hunk"]');
    expect(hunk?.textContent).toMatch(/@@ -1,1 \+1,1 @@/);
    expect(
      fallback?.querySelector<HTMLElement>('[data-kind="added"]')?.textContent,
    ).toContain('new');
    expect(
      fallback?.querySelector<HTMLElement>('[data-kind="removed"]')?.textContent,
    ).toContain('old');
  });
});
