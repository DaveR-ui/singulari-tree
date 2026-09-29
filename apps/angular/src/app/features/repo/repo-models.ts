// Re-export the generated contract domain types (types-only, erased at build time).
// `export type` / `import type` keep the generated `@contracts` modules free of any
// runtime dependency, so Angular code gets the wire-accurate shapes for free.

export type {
  Commit,
  Oid,
  Signature,
  Branch,
  Remote,
  Tag,
  Stash,
  Worktree,
  Repository,
  FileStatus,
  Diff,
} from '@contracts/domain';

// Angular-only view type. The contract has no `Lane` message: ADR-008 computes real
// lanes in Go (Phase 1), so the renderer keeps a local, presentation-only shape.
export interface Lane {
  index: number;
  color: string;
  continues: boolean;
}

// View model — joins Commit + computed lane + branches pointing at it (presentation only).
import type { Commit } from '@contracts/domain';

export interface CommitRow {
  commit: Commit;
  lane: Lane;
  branches: string[];
  isHead: boolean;
}
