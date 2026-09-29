import { describe, expect, it } from 'vitest';
import { CHANNELS, CHANNEL_TO_RPC, type ChannelName } from '../src/ipc/channels';
import { GIT_CORE_RPC_METHODS } from '../src/main/go-core-client';

/**
 * Guards the frozen IPC surface (16 channels) and catches channel→gRPC mapping
 * drift: every channel value must resolve to a real `singularitree.v1.GitCore`
 * RPC name.
 */

const EXPECTED_MAPPING: Record<string, string> = {
  'git:getCommits': 'GetCommits',
  'git:getBranches': 'GetBranches',
  'git:getRemotes': 'GetRemotes',
  'git:getTags': 'GetTags',
  'git:getStashes': 'GetStashes',
  'git:getStatus': 'GetStatus',
  'git:getDiff': 'GetDiff',
  'git:stage': 'Stage',
  'git:unstage': 'Unstage',
  'git:commit': 'Commit',
  'git:checkout': 'Checkout',
  'git:fetch': 'Fetch',
  'git:pull': 'Pull',
  'git:push': 'Push',
  'git:openRepository': 'OpenRepository',
  'git:listRepositories': 'ListRepositories',
};

describe('CHANNELS ↔ GitCore RPC mapping', () => {
  it('exposes exactly the 16 frozen channels', () => {
    const values = Object.values(CHANNELS);
    expect(values).toHaveLength(16);
    expect([...values].sort()).toEqual(Object.keys(EXPECTED_MAPPING).sort());
  });

  it('maps every channel value to a mapping entry', () => {
    for (const channel of Object.values(CHANNELS) as ChannelName[]) {
      expect(
        CHANNEL_TO_RPC[channel],
        `missing RPC mapping for channel ${channel}`,
      ).toBeTruthy();
    }
  });

  it('maps every channel to a known GitCore RPC method', () => {
    for (const channel of Object.values(CHANNELS) as ChannelName[]) {
      const rpc = CHANNEL_TO_RPC[channel];
      expect(
        GIT_CORE_RPC_METHODS as readonly string[],
        `channel ${channel} → unknown RPC ${rpc}`,
      ).toContain(rpc);
    }
  });

  it('matches the frozen channel → RPC mapping', () => {
    expect(CHANNEL_TO_RPC).toEqual(EXPECTED_MAPPING);
  });
});
