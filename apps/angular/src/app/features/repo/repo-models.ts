// Re-export generated domain types (via @contracts alias) + view models.
// Before `buf generate` runs, these fall back to local stubs so imports remain valid.

// Prefer generated types — path alias @contracts/* -> libs/contracts/gen/ts/*
// import type { Commit, Branch, Diff } from '@contracts/domain';

export interface Oid {
  hex: string;
  kind: 'SHA1' | 'SHA256';
}

export interface Commit {
  oid: Oid;
  parents: Oid[];
  author: { name: string; email: string; when: string };
  committer: { name: string; email: string; when: string };
  message: string;
  treeOid: Oid;
  committedAt: string;
}

export interface Lane {
  index: number;
  color: string;
  continues: boolean;
}

// View model — joins Commit + computed lane + branches pointing at it (presentation only).
export interface CommitRow {
  commit: Commit;
  lane: Lane;
  branches: string[];
  isHead: boolean;
}
