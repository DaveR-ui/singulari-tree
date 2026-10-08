import type { Diff, Hunk } from '@contracts/domain';

/** Original / modified sides plus a plain unified rendering of a `Diff`. */
export interface DiffTexts {
  /** Context + removed lines, joined with `\n` (the "before" side). */
  original: string;
  /** Context + added lines, joined with `\n` (the "after" side). */
  modified: string;
  /** Plain unified diff (hunk headers + ` `/`-`/`+` prefixes) for the fallback. */
  unified: string;
}

const NO_NEWLINE_MARKER = '\\ No newline at end of file';

function hunkHeader(hunk: Hunk): string {
  return `@@ -${hunk.fromStart},${hunk.fromLines} +${hunk.toStart},${hunk.toLines} @@`;
}

/**
 * Pure projection of a contract `Diff` into the three text views the viewer
 * needs. No DOM/Monaco dependency, so it is unit-testable in isolation.
 *
 * - `original` keeps context + removed lines,
 * - `modified` keeps context + added lines,
 * - `unified` is a plain unified rendering used by the `<pre>` fallback.
 *
 * `noNewline` lines append a `\ No newline at end of file` marker to the
 * unified view (the two sides are joined without a trailing newline).
 */
export function hunksToTexts(diff: Diff | null | undefined): DiffTexts {
  const original: string[] = [];
  const modified: string[] = [];
  const unified: string[] = [];

  for (const hunk of diff?.hunks ?? []) {
    unified.push(hunkHeader(hunk));
    for (const line of hunk.lines ?? []) {
      switch (line.kind) {
        case 'added':
          modified.push(line.text);
          unified.push(`+${line.text}`);
          break;
        case 'removed':
          original.push(line.text);
          unified.push(`-${line.text}`);
          break;
        default:
          original.push(line.text);
          modified.push(line.text);
          unified.push(` ${line.text}`);
          break;
      }
      if (line.noNewline) unified.push(NO_NEWLINE_MARKER);
    }
  }

  return {
    original: original.join('\n'),
    modified: modified.join('\n'),
    unified: unified.join('\n'),
  };
}
