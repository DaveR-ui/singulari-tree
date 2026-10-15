import { Injectable, computed, signal } from '@angular/core';

/** User-facing motion preference (plan §2.6). `auto` follows the OS. */
export type MotionPreference = 'auto' | 'on' | 'off';

/** Working-tree density preference (plan §4.9). */
export type DensityPreference = 'compact' | 'comfortable';

/** Diff font size in CSS pixels (plan §4.9). */
export type DiffFontSize = '11' | '12' | '13';

/** Diff soft-wrap preference (plan §4.9). */
export type DiffWordWrap = 'on' | 'off';

/** localStorage keys owned by this service (matches the `st:` shell convention). */
const MOTION_STORAGE_KEY = 'st:motion';
const DENSITY_STORAGE_KEY = 'st:density';
const PANE_WIDTH_STORAGE_KEY = 'st:paneWidth';
const DIFF_FONT_SIZE_STORAGE_KEY = 'st:diffFontSize';
const DIFF_WORD_WRAP_STORAGE_KEY = 'st:diffWordWrap';

/**
 * Root renderer-local preferences service (plan §4.9, decision #10, divergence
 * D14). It owns ONLY the preferences that have no dedicated service yet —
 * theme, language and diff layout stay owned by {@link ThemeService},
 * {@link LanguageService} and {@link DiffModeService} respectively, and are
 * never mirrored here.
 *
 * Every key is independent: the initial value is read synchronously during
 * construction (so the first render already honours a persisted choice), each
 * setter persists, and every localStorage access is wrapped in `try/catch` so a
 * disabled or full storage (private mode) degrades to a session-only
 * preference instead of throwing.
 *
 * Invalid or unknown persisted values always fall back to the documented
 * default rather than crashing or propagating a bad value.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly motionState = signal<MotionPreference>(this.readMotion());
  private readonly densityState = signal<DensityPreference>(this.readDensity());
  private readonly paneWidthState = signal<string>(this.readPaneWidth());
  private readonly diffFontSizeState = signal<DiffFontSize>(this.readDiffFontSize());
  private readonly diffWordWrapState = signal<DiffWordWrap>(this.readDiffWordWrap());

  /** Motion preference: `auto` (OS), `on` or `off`. */
  readonly motion = this.motionState.asReadonly();
  /** Working-tree density: `compact` or `comfortable`. */
  readonly density = this.densityState.asReadonly();
  /** Persisted pane width as a pixel string; `''` means "no explicit width". */
  readonly paneWidth = this.paneWidthState.asReadonly();
  /** Diff font size: `11`, `12` or `13`. */
  readonly diffFontSize = this.diffFontSizeState.asReadonly();
  /** Diff soft wrap: `on` or `off`. */
  readonly diffWordWrap = this.diffWordWrapState.asReadonly();

  /** True when an explicit pane width is persisted, so the reset can be enabled. */
  readonly hasPaneWidth = computed(() => this.paneWidthState() !== '');

  /** Apply and persist the motion preference. */
  setMotion(value: MotionPreference): void {
    this.motionState.set(value);
    this.write(MOTION_STORAGE_KEY, value);
  }

  /** Apply and persist the density preference. */
  setDensity(value: DensityPreference): void {
    this.densityState.set(value);
    this.write(DENSITY_STORAGE_KEY, value);
  }

  /** Apply and persist an explicit pane width (a pixel number string). */
  setPaneWidth(value: string): void {
    this.paneWidthState.set(value);
    this.write(PANE_WIDTH_STORAGE_KEY, value);
  }

  /** Apply and persist the diff font size. */
  setDiffFontSize(value: DiffFontSize): void {
    this.diffFontSizeState.set(value);
    this.write(DIFF_FONT_SIZE_STORAGE_KEY, value);
  }

  /** Apply and persist the diff soft-wrap preference. */
  setDiffWordWrap(value: DiffWordWrap): void {
    this.diffWordWrapState.set(value);
    this.write(DIFF_WORD_WRAP_STORAGE_KEY, value);
  }

  /** Clear the persisted pane width and fall back to the layout default. */
  resetPaneWidth(): void {
    this.paneWidthState.set('');
    this.remove(PANE_WIDTH_STORAGE_KEY);
  }

  private readMotion(): MotionPreference {
    const stored = this.read(MOTION_STORAGE_KEY);
    return stored === 'on' || stored === 'off' ? stored : 'auto';
  }

  private readDensity(): DensityPreference {
    return this.read(DENSITY_STORAGE_KEY) === 'comfortable' ? 'comfortable' : 'compact';
  }

  private readDiffFontSize(): DiffFontSize {
    const stored = this.read(DIFF_FONT_SIZE_STORAGE_KEY);
    return stored === '11' || stored === '13' ? stored : '12';
  }

  private readDiffWordWrap(): DiffWordWrap {
    return this.read(DIFF_WORD_WRAP_STORAGE_KEY) === 'on' ? 'on' : 'off';
  }

  /** Read the pane width, dropping anything that is not a positive pixel number. */
  private readPaneWidth(): string {
    const stored = this.read(PANE_WIDTH_STORAGE_KEY);
    if (!stored) return '';
    const pixels = Number(stored);
    return Number.isFinite(pixels) && pixels > 0 ? stored : '';
  }

  private read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Private mode / storage disabled: the preference lives this session only.
    }
  }

  private remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Private mode / storage disabled: nothing to clear on disk.
    }
  }
}
