/**
 * Channel names + validation stub (ipc-strategy.md §1.2 — channels.ts).
 */

export const CHANNELS = {
  getCommits: 'git:getCommits',
  getBranches: 'git:getBranches',
  getRemotes: 'git:getRemotes',
  getTags: 'git:getTags',
  getStashes: 'git:getStashes',
  getStatus: 'git:getStatus',
  getDiff: 'git:getDiff',
  stage: 'git:stage',
  unstage: 'git:unstage',
  commit: 'git:commit',
  checkout: 'git:checkout',
  fetch: 'git:fetch',
  pull: 'git:pull',
  push: 'git:push',
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];

export function isValidChannel(channel: string): channel is ChannelName {
  return (Object.values(CHANNELS) as string[]).includes(channel);
}

// Minimal validation stub — real implementation uses zod/io-ts per spec.
// Throws if payload is not an object; extend per-channel schemas as needed.
export function validate(channel: ChannelName, payload: unknown): void {
  if (payload !== undefined && payload !== null && typeof payload !== 'object') {
    throw new Error(`Invalid payload for ${channel}: expected object`);
  }
  // TODO: add zod schema per channel using runtime validation.
}
