import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  InjectionToken,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { Diff } from '@contracts/domain';
import { diffToGridRows, hunksToTexts } from './hunks-to-texts';
import { singularitreeThemeName } from './monaco-theme';

type MonacoDiffEditor = import('monaco-editor').editor.IStandaloneDiffEditor;
type MonacoTextModel = import('monaco-editor').editor.ITextModel;

/** The Monaco namespace, kept structural so tests can inject a fake module. */
export type MonacoModule = typeof import('monaco-editor');

/** Lazily loads the Monaco module; replaceable in tests to avoid booting it. */
export type MonacoLoader = () => Promise<MonacoModule>;

/** Pure inputs that decide whether Monaco may mount. */
export interface MonacoDecisionState {
  readonly loading: boolean;
  readonly error: boolean;
  readonly isBinary: boolean;
  readonly hasConflict: boolean;
  readonly isEmpty: boolean;
}

/**
 * Pure decision helper (no DOM/Monaco): Monaco is mounted only for a real,
 * textual, conflict-free, non-empty, non-loading, error-free diff. Kept pure so
 * the mount policy is unit-testable in isolation.
 */
export function shouldInitializeMonaco(state: MonacoDecisionState): boolean {
  return !state.loading && !state.error && !state.isBinary && !state.hasConflict && !state.isEmpty;
}

/**
 * True when a real browser worker environment exists. jsdom (unit tests) has no
 * `Worker`, so Monaco is never initialized there and the plain fallback is used.
 */
export function monacoEnvironmentAvailable(): boolean {
  return typeof Worker !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Code grid line height: exactly 2× the font size. The Settings presets are
 * 11→22, 12→24 (the shipped pair) and 13→26, so the mono code stays on a 2×
 * grid in both the Monaco editor and the CSS fallback.
 */
export function diffLineHeight(fontSize: number): number {
  return fontSize * 2;
}

/**
 * Environment probe used before the dynamic import. The default checks the
 * browser worker environment; tests override it to exercise the init path in
 * jsdom without booting Monaco.
 */
export const MONACO_ENVIRONMENT_AVAILABLE = new InjectionToken<() => boolean>(
  'MONACO_ENVIRONMENT_AVAILABLE',
  { providedIn: 'root', factory: () => monacoEnvironmentAvailable },
);

/**
 * Lazy Monaco loader. The default dynamic-imports the worker-configured module
 * (kept out of the initial bundle); tests override it with a fake module.
 */
export const MONACO_LOADER = new InjectionToken<MonacoLoader>('MONACO_LOADER', {
  providedIn: 'root',
  factory: () => () => import('./monaco-loader').then((module) => module.default),
});

/**
 * Read-only diff viewer. Renders a lazily-loaded Monaco `DiffEditor` when
 * possible and a 4-column grid fallback otherwise (before the chunk
 * loads, in tests, or if initialization fails). Binary/conflicted/empty diffs
 * short-circuit to distinct messages.
 *
 * Monaco initialization is reactive: in the real flow (`StatusStore`) the diff
 * arrives asynchronously, so a single post-render attempt is not enough. An
 * effect keyed on the diff + guards + container query mounts the editor as soon
 * as a real diff is available (idempotent, no-op when already mounted).
 *
 * The `fontSize` (11 | 12 | 13) and `wordWrap` inputs are pure pass-throughs of
 * the persisted diff preferences; the host app reads them from `PreferencesService`
 * and binds them here (this dumb component never reads preferences itself). Both
 * drive the Monaco editor and the fallback grid live, and the code line height is
 * always exactly 2× the font size (see `diffLineHeight`).
 */
@Component({
  selector: 'st-diff-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-testid': 'diff-viewer' },
  template: `
    @if (truncated()) {
      <p
        class="st-diff-viewer__notice st-diff-viewer__notice--truncated"
        data-testid="diff-truncated"
        i18n
      >
        Diff truncated — some changes are not shown.
      </p>
    }
    @if (errorMsg(); as message) {
      <p class="st-diff-viewer__notice st-diff-viewer__notice--error" data-testid="diff-error">
        {{ message }}
      </p>
    } @else if (loading()) {
      <p class="st-diff-viewer__notice" data-testid="diff-loading" i18n>Loading diff…</p>
    } @else if (isBinary()) {
      <p class="st-diff-viewer__notice" data-testid="diff-binary" i18n>Binary file — no textual diff.</p>
    } @else if (hasConflict()) {
      <p class="st-diff-viewer__notice" data-testid="diff-conflict" i18n>
        Merge conflict markers detected.
      </p>
    } @else if (isEmpty()) {
      <p class="st-diff-viewer__notice" data-testid="diff-empty" i18n>No changes to display.</p>
    } @else {
      <div class="st-diff-viewer__editor" #container></div>
      @if (!monacoReady()) {
        <div
          class="st-diff-viewer__fallback"
          data-testid="diff-fallback"
          [attr.data-wrap]="wordWrap() ? 'on' : 'off'"
          [style.font-size.px]="fontSize()"
          [style.line-height.px]="diffLineHeight(fontSize())"
        >
          @for (row of fallbackRows(); track $index) {
            @if (row.kind === 'hunk' || row.kind === 'meta') {
              <div
                class="st-diff-viewer__fallback-hunk st-tabular-nums"
                data-testid="diff-fallback-hunk"
              >
                {{ row.text }}
              </div>
            } @else {
              <div class="st-diff-viewer__fallback-row" [attr.data-kind]="row.kind">
                <span class="st-diff-viewer__gnum st-tabular-nums">{{ row.oldNum ?? '' }}</span>
                <span class="st-diff-viewer__gnum st-tabular-nums">{{ row.newNum ?? '' }}</span>
                <span class="st-diff-viewer__gsign">{{ row.sign }}</span>
                <span class="st-diff-viewer__gtext">{{ row.text }}</span>
              </div>
            }
          }
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      min-height: 0;
      overflow: auto;
      color: var(--st-color-text);
    }

    .st-diff-viewer__notice {
      margin: 0;
      padding: var(--st-space-3);
      font-size: var(--st-font-12);
      opacity: 0.65;
    }

    .st-diff-viewer__notice--error {
      color: var(--st-color-danger);
      opacity: 1;
    }

    .st-diff-viewer__notice--truncated {
      color: var(--st-color-warn);
      opacity: 1;
      border-bottom: var(--st-hairline) solid
        color-mix(in srgb, var(--st-color-warn) 40%, transparent);
    }

    .st-diff-viewer__editor {
      height: 100%;
      min-height: 160px;
    }

    .st-diff-viewer__fallback {
      font-family: var(--st-font-mono);
      font-size: var(--st-font-12);
      line-height: var(--st-leading-code);
      overflow: auto;
    }

    .st-diff-viewer__fallback-row {
      display: grid;
      grid-template-columns: 36px 36px 20px 1fr;
    }

    .st-diff-viewer__fallback-hunk {
      background: var(--st-color-diff-hunk-bg);
      color: var(--st-color-diff-hunk-fg);
      padding: 0 var(--st-space-2);
      font-size: var(--st-font-11);
    }

    .st-diff-viewer__gnum {
      color: var(--st-color-diff-gutter-fg);
      text-align: right;
      padding: 0 var(--st-space-1) 0 var(--st-space-2);
    }

    .st-diff-viewer__gsign {
      text-align: center;
    }

    /* Wrap contract: the container carries a data-wrap attribute; 'on'
       soft-wraps long lines inside the code column, 'off' keeps
       white-space: pre and lets the row's last grid track grow to max-content
       so long lines overflow and scroll horizontally (the host already has
       overflow: auto). */
    .st-diff-viewer__fallback[data-wrap='on'] .st-diff-viewer__gtext {
      white-space: pre-wrap;
      word-break: break-all;
    }

    .st-diff-viewer__fallback[data-wrap='off'] .st-diff-viewer__gtext {
      white-space: pre;
      word-break: normal;
    }

    .st-diff-viewer__fallback[data-wrap='off'] .st-diff-viewer__fallback-row {
      /* The last track grows to max-content so long lines overflow and scroll
         horizontally; the row box must grow with it (min-width keeps it full
         width for short lines) or the add/remove tints would paint only the
         border box and vanish as soon as the reader scrolls right. */
      grid-template-columns: 36px 36px 20px max-content;
      width: max-content;
      min-width: 100%;
    }

    .st-diff-viewer__fallback-row[data-kind='added'] {
      background: var(--st-color-diff-insert-bg);
      color: var(--st-color-diff-insert-fg);
    }

    .st-diff-viewer__fallback-row[data-kind='removed'] {
      background: var(--st-color-diff-delete-bg);
      color: var(--st-color-diff-delete-fg);
    }
  `,
})
export class DiffViewer {
  readonly diff = input<Diff | null>(null);
  readonly loading = input(false);
  readonly errorMsg = input<string | null>(null);
  /** True when the core capped the diff (ADR-0020 (c)); renders a notice. */
  readonly truncated = input(false);
  /**
   * Side-by-side vs unified layout. Unified is the shipped default (plan §4.6);
   * the Settings toggle flips it live.
   */
  readonly renderSideBySide = input(false);
  /** Diff code font size in CSS pixels (Settings: 11 | 12 | 13). Default 12. */
  readonly fontSize = input(12);
  /** Diff soft wrap (Settings on/off). Default false. */
  readonly wordWrap = input(false);

  /** Exposed to the template for the fallback grid's inline line height (2×). */
  protected readonly diffLineHeight = diffLineHeight;

  private readonly loader = inject(MONACO_LOADER);
  private readonly environmentAvailable = inject(MONACO_ENVIRONMENT_AVAILABLE);
  private readonly destroyRef = inject(DestroyRef);

  private readonly container = viewChild<ElementRef<HTMLElement>>('container');
  private editor: MonacoDiffEditor | null = null;
  private originalModel: MonacoTextModel | null = null;
  private modifiedModel: MonacoTextModel | null = null;
  /** DOM node the current editor is attached to (detects container replacement). */
  private mountedContainer: HTMLElement | null = null;
  /** Guards against overlapping lazy-load attempts. */
  private initializing = false;

  /** True once the Monaco editor is mounted (fallback hidden). */
  protected readonly monacoReady = signal(false);

  protected readonly texts = computed(() => hunksToTexts(this.diff()));
  /** Rows for the non-Monaco 4-column grid fallback. */
  protected readonly fallbackRows = computed(() => diffToGridRows(this.diff()));
  protected readonly isBinary = computed(() => this.diff()?.isBinary === true);
  protected readonly hasConflict = computed(() => this.diff()?.hasConflictMarkers === true);
  protected readonly isEmpty = computed(() => {
    const diff = this.diff();
    if (!diff) return true;
    if (diff.isBinary || diff.hasConflictMarkers) return false;
    return (diff.hunks?.length ?? 0) === 0;
  });

  constructor() {
    // Keep the Monaco models in sync when the diff input changes post-init.
    effect(() => {
      const { original, modified } = this.texts();
      if (this.originalModel && this.originalModel.getValue() !== original) {
        this.originalModel.setValue(original);
      }
      if (this.modifiedModel && this.modifiedModel.getValue() !== modified) {
        this.modifiedModel.setValue(modified);
      }
    });

    // Reactive init: the diff may arrive asynchronously, so track the diff, the
    // loading/error guards and the container query; any change re-evaluates
    // `maybeInitializeMonaco` (idempotent, no-op when already mounted).
    effect(() => {
      void this.maybeInitializeMonaco();
    });

    // Live layout toggle: keep a mounted editor in sync when `renderSideBySide`
    // changes (no-op on init, when the editor is still null). The input is read
    // unconditionally so the effect tracks it even before the editor mounts.
    effect(() => {
      const renderSideBySide = this.renderSideBySide();
      this.editor?.updateOptions({ renderSideBySide });
    });

    // Live typography/wrap: keep a mounted editor in sync when `fontSize` or
    // `wordWrap` change (no-op on init, when the editor is still null). Both
    // inputs are read unconditionally so the effect tracks them even before the
    // editor mounts. Options go through `updateOptions` only — never a remount,
    // so the change applies without a flash.
    effect(() => {
      const fontSize = this.fontSize();
      const wordWrap = this.wordWrap();
      this.editor?.updateOptions({
        fontSize,
        lineHeight: diffLineHeight(fontSize),
        wordWrap: wordWrap ? 'on' : 'off',
      });
    });

    // Safety net for the first render (`#container` present on the first pass).
    afterNextRender(() => {
      void this.maybeInitializeMonaco();
    });

    this.destroyRef.onDestroy(() => this.disposeMonaco());
  }

  private shouldInitialize(): boolean {
    return shouldInitializeMonaco({
      loading: this.loading(),
      error: this.errorMsg() !== null,
      isBinary: this.isBinary(),
      hasConflict: this.hasConflict(),
      isEmpty: this.isEmpty(),
    });
  }

  /**
   * Mount Monaco when a real diff is present and the environment supports it.
   * Idempotent: no-op while a load is in flight or when the editor is already
   * attached to the current container. Rebuilds if the container was replaced
   * (e.g. the diff briefly disappeared and the `@else` block re-rendered).
   */
  private async maybeInitializeMonaco(): Promise<void> {
    // Read all reactive inputs synchronously so the effect tracks them.
    const canMount = this.shouldInitialize();
    const container = this.container()?.nativeElement ?? null;
    if (!canMount || !container) return;
    // Never touch the dynamic import when there is no worker environment.
    if (!this.environmentAvailable()) return;
    // Already mounted here: the model-sync effect keeps the content fresh.
    if (this.editor && this.mountedContainer === container) return;
    if (this.initializing) return;

    if (this.editor) this.disposeEditor();

    this.initializing = true;
    try {
      const monaco = await this.loader();
      // State may have changed while the chunk loaded: re-validate before
      // touching the DOM, and discard a stale load.
      if (!this.shouldInitialize() || this.container()?.nativeElement !== container) return;

      // Apply the token-derived theme for the current appearance before the
      // editor mounts, so it never flashes the default theme.
      monaco.editor.setTheme(
        singularitreeThemeName(document.documentElement.getAttribute('data-theme')),
      );

      const { original, modified } = this.texts();
      this.originalModel = monaco.editor.createModel(original, 'plaintext');
      this.modifiedModel = monaco.editor.createModel(modified, 'plaintext');
      this.editor = monaco.editor.createDiffEditor(container, {
        readOnly: true,
        originalEditable: false,
        renderSideBySide: this.renderSideBySide(),
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        // Mono font family mirrors `--st-font-mono`; the font size comes from the
        // persisted preference (Settings: 11 | 12 | 13) and the code grid line
        // height is exactly 2× that value (11→22, 12→24, 13→26, matching the CSS
        // fallback's `--st-leading-code`), so both surfaces stay aligned.
        fontFamily: "Consolas, 'Liberation Mono', ui-monospace, monospace",
        fontSize: this.fontSize(),
        lineHeight: diffLineHeight(this.fontSize()),
        wordWrap: this.wordWrap() ? 'on' : 'off',
      });
      this.editor.setModel({ original: this.originalModel, modified: this.modifiedModel });
      this.mountedContainer = container;
      this.monacoReady.set(true);
    } catch {
      // Initialization failed: keep the grid fallback visible.
      this.monacoReady.set(false);
    } finally {
      this.initializing = false;
    }
  }

  private disposeEditor(): void {
    this.editor?.dispose();
    this.originalModel?.dispose();
    this.modifiedModel?.dispose();
    this.editor = null;
    this.originalModel = null;
    this.modifiedModel = null;
    this.mountedContainer = null;
    this.monacoReady.set(false);
  }

  private disposeMonaco(): void {
    this.disposeEditor();
  }
}
