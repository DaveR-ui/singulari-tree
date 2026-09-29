import { describe, expect, it } from 'vitest';
import type { GetCommitsResponse } from '@contracts/gitcore';
import { mapCommitRows } from './repo-mappers';

const OID_A = 'a'.repeat(40);
const OID_B = 'b'.repeat(40);
const OID_C = 'c'.repeat(40);
const OID_D = 'd'.repeat(64);

const RESPONSE: GetCommitsResponse = {
  total: 2,
  commits: [
    {
      oid: { hex: OID_A, kind: 'SHA1' },
      parents: [{ hex: OID_B, kind: 'SHA1' }],
      author: { name: 'Ada Lovelace', email: 'ada@example.com', when: '2026-01-02T10:00:00Z' },
      committer: { name: 'Grace Hopper', email: 'grace@example.com', when: '2026-01-02T10:05:00Z' },
      message: 'feat(graph): load commit window',
      treeOid: { hex: OID_C, kind: 'SHA1' },
      committedAt: '2026-01-02T10:05:00Z',
    },
    {
      oid: { hex: OID_D, kind: 'SHA256' },
      parents: [],
      author: undefined,
      committer: undefined,
      message: 'chore: initial import',
      treeOid: undefined,
      committedAt: '2026-01-01T00:00:00Z',
    },
  ],
};

describe('mapCommitRows', () => {
  it('maps a realistic GetCommitsResponse into CommitRow[]', () => {
    const rows = mapCommitRows(RESPONSE);

    expect(rows).toHaveLength(2);

    const [first, second] = rows;

    // First commit carries a full DAG/author payload.
    expect(first.commit.oid?.hex).toBe(OID_A);
    expect(first.commit.oid?.kind).toBe('SHA1');
    expect(first.commit.message).toBe('feat(graph): load commit window');
    expect(first.commit.parents).toHaveLength(1);
    expect(first.commit.parents[0]?.hex).toBe(OID_B);
    expect(first.commit.author?.name).toBe('Ada Lovelace');
    expect(first.commit.author?.email).toBe('ada@example.com');
    expect(first.commit.committer?.name).toBe('Grace Hopper');
    expect(first.commit.committer?.when).toBe('2026-01-02T10:05:00Z');
    expect(first.commit.committedAt).toBe('2026-01-02T10:05:00Z');
    expect(first.commit.treeOid?.hex).toBe(OID_C);

    // Second commit is a root commit with optional fields absent.
    expect(second.commit.oid?.hex).toBe(OID_D);
    expect(second.commit.oid?.kind).toBe('SHA256');
    expect(second.commit.parents).toEqual([]);
    expect(second.commit.author).toBeUndefined();
    expect(second.commit.committer).toBeUndefined();
    expect(second.commit.message).toBe('chore: initial import');

    // Phase 0 view-model defaults: no branches/HEAD/lane data yet.
    for (const row of rows) {
      expect(row.branches).toEqual([]);
      expect(row.isHead).toBe(false);
      expect(row.lane.continues).toBe(false);
      expect(row.lane.index).toBe(0);
    }
    // Fresh lane object per row (no shared mutable state).
    expect(first.lane).not.toBe(second.lane);
  });

  it('returns an empty array for an empty response', () => {
    const rows = mapCommitRows({ commits: [], total: 0 });
    expect(rows).toEqual([]);
  });
});
