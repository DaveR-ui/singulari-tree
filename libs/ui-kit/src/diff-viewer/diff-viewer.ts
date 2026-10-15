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
import { hunksToTexts } from './hunks-to-texts';

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
 * possible and a plain unified `<pre>` fallback otherwise (before the chunk
 * loads, in tests, or if initialization fails). Binary/conflicted/empty diffs
 * short-circuit to distinct messages.
 *
 * Monaco initialization is reactive: in the real flow (`StatusStore`) the diff
 * arrives asynchronously, so a single post-render attempt is not enough. An
 * effect keyed on the diff + guards + container query mounts the editor as soon
 * as a real diff is available (idempotent, no-op when already mounted).
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
        <pre class="st-diff-viewer__fallback" data-testid="diff-fallback">{{ unified() }}</pre>
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
      margin: 0;
      padding: var(--st-space-2) var(--st-space-3);
      font-family: var(--st-font-mono);
      font-size: var(--st-font-12);
      white-space: pre;
      overflow: auto;
    }
  `,
})
export class DiffViewer {
  readonly diff = input<Diff | null>(null);
  readonly loading = input(false);
  readonly errorMsg = input<string | null>(null);
  /** True when the core capped the diff (ADR-0020 (c)); renders a notice. */
  readonly truncated = input(false);

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
  protected readonly unified = computed(() => this.texts().unified);
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

      const { original, modified } = this.texts();
      this.originalModel = monaco.editor.createModel(original, 'plaintext');
      this.modifiedModel = monaco.editor.createModel(modified, 'plaintext');
      this.editor = monaco.editor.createDiffEditor(container, {
        readOnly: true,
        originalEditable: false,
        renderSideBySide: true,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 12,
      });
      this.editor.setModel({ original: this.originalModel, modified: this.modifiedModel });
      this.mountedContainer = container;
      this.monacoReady.set(true);
    } catch {
      // Initialization failed: keep the plain fallback visible.
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
