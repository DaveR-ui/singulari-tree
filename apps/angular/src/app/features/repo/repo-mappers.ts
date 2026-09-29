import type { GetCommitsResponse } from '@contracts/gitcore';
import type { CommitRow, Lane } from './repo-models';

// Pure, Angular-free mapping from the `getCommits` contract response to the renderer
// view model. Keeping it free of Angular (and of any runtime `@contracts` import)
// makes it trivially unit-testable with plain vitest.

const LANE_COLOR = 'var(--st-color-accent, #0a84ff)';

function defaultLane(): Lane {
  // Phase 0 placeholder: real lane assignment is computed in Go (ADR-008) and lands
  // in Phase 1. A fresh object per row avoids accidental shared mutable state.
  return { index: 0, color: LANE_COLOR, continues: false };
}

export function mapCommitRows(resp: GetCommitsResponse): CommitRow[] {
  return resp.commits.map((commit) => ({
    commit,
    lane: defaultLane(),
    branches: [],
    isHead: false,
  }));
}
