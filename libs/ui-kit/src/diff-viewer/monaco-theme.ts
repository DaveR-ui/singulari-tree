import type { editor } from 'monaco-editor';

/**
 * Token-derived Monaco themes for the `<st-diff-viewer>`.
 *
 * Monaco resolves theme colours from concrete hex strings — it cannot read CSS
 * custom properties — so the semantic values shipped in
 * `libs/ui-kit/src/styles/tokens.scss` are mirrored here as constants. Keep them
 * in sync with the `--st-color-*` diff/gutter/surface tokens in both the dark
 * (`:root`) and light (`[data-theme='light']`) blocks.
 */

export const SINGULARITREE_DARK = 'singularitree-dark';
export const SINGULARITREE_LIGHT = 'singularitree-light';

/** Monaco theme matching the app's current `data-theme`. */
export function singularitreeThemeName(appearance: string | null): string {
  return appearance === 'light' ? SINGULARITREE_LIGHT : SINGULARITREE_DARK;
}

/** Dark theme: mirrors the `:root` semantic tokens. */
export function singularitreeDarkTheme(): editor.IStandaloneThemeData {
  return {
    base: 'vs-dark',
    inherit: true,
    rules: [
      // Only the default-code, hunk-header and comment tokens are tinted; the
      // diff viewer renders `plaintext`, so no other token classes apply.
      { token: '', foreground: 'eceeef' }, // --st-color-text (default code)
      { token: 'comment', foreground: 'b0b5b9' }, // --st-color-muted
      { token: 'hunk', foreground: 'aad8d7' }, // --st-color-diff-hunk-fg
    ],
    colors: {
      'editor.background': '#222426', // --st-color-surface
      'editor.foreground': '#eceeef', // --st-color-text
      'editorGutter.background': '#222426', // --st-color-surface
      'editorGutter.foreground': '#6f767a', // --st-color-diff-gutter-fg
      'editorLineNumber.foreground': '#6f767a', // --st-color-diff-gutter-fg
      'editorLineNumber.activeForeground': '#b0b5b9', // --st-color-muted
      'diffEditor.insertedLineBackground': '#223e2e', // --st-color-diff-insert-bg
      'diffEditor.removedLineBackground': '#49292d', // --st-color-diff-delete-bg
      'diffEditor.insertedTextBackground': '#223e2e', // --st-color-diff-insert-bg
      'diffEditor.removedTextBackground': '#49292d', // --st-color-diff-delete-bg
      'diffEditorGutter.insertedLineBackground': '#223e2e', // --st-color-diff-insert-bg
      'diffEditorGutter.removedLineBackground': '#49292d', // --st-color-diff-delete-bg
      'editorWidget.background': '#292b2e', // --st-color-surface-2
      'editor.selectionBackground': '#3b3e41', // --st-color-border
    },
  };
}

/** Light theme: mirrors the `[data-theme='light']` semantic tokens. */
export function singularitreeLightTheme(): editor.IStandaloneThemeData {
  return {
    base: 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: '14181a' }, // --st-color-text (default code)
      { token: 'comment', foreground: '5b6668' }, // --st-color-muted
      { token: 'hunk', foreground: '0f5f5c' }, // --st-color-diff-hunk-fg
    ],
    colors: {
      'editor.background': '#ffffff', // --st-color-surface
      'editor.foreground': '#14181a', // --st-color-text
      'editorGutter.background': '#f4f6f5', // --st-color-surface-2
      'editorGutter.foreground': '#8a9490', // --st-color-diff-gutter-fg
      'editorLineNumber.foreground': '#8a9490', // --st-color-diff-gutter-fg
      'editorLineNumber.activeForeground': '#5b6668', // --st-color-muted
      'diffEditor.insertedLineBackground': '#e6f7ea', // --st-color-diff-insert-bg
      'diffEditor.removedLineBackground': '#fde8e9', // --st-color-diff-delete-bg
      'diffEditor.insertedTextBackground': '#e6f7ea', // --st-color-diff-insert-bg
      'diffEditor.removedTextBackground': '#fde8e9', // --st-color-diff-delete-bg
      'diffEditorGutter.insertedLineBackground': '#e6f7ea', // --st-color-diff-insert-bg
      'diffEditorGutter.removedLineBackground': '#fde8e9', // --st-color-diff-delete-bg
      'editorWidget.background': '#f4f6f5', // --st-color-surface-2
      'editor.selectionBackground': '#d8dcda', // --st-color-border
    },
  };
}
