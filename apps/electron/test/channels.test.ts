import { describe, expect, it } from 'vitest';
import {
  AUTH_CHANNELS,
  CHANNELS,
  CHANNEL_TO_RPC,
  type ChannelName,
} from '../src/ipc/channels';
import { AUTH_RPC_METHODS, GIT_CORE_RPC_METHODS } from '../src/main/go-core-client';

/**
 * Guards the frozen IPC surface (22 channels) and catches channel→gRPC mapping
 * drift: every channel value must resolve to a real RPC on its owning service
 * (`singularitree.v1.GitCore` for `git:*`, `singularitree.v1.Auth` for `auth:*`).
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
  'git:stashPush': 'StashPush',
  'git:fetch': 'Fetch',
  'git:pull': 'Pull',
  'git:push': 'Push',
  'git:openRepository': 'OpenRepository',
  'git:listRepositories': 'ListRepositories',
  'git:removeRepository': 'RemoveRepository',
  'auth:getAuthStatus': 'GetAuthStatus',
  'auth:connectGitHubFromCLI': 'ConnectGitHubFromCLI',
  'auth:listGitHubRepos': 'ListGitHubRepos',
  'auth:logout': 'Logout',
};

describe('CHANNELS ↔ service RPC mapping', () => {
  it('exposes exactly the 22 frozen channels', () => {
    const values = Object.values(CHANNELS);
    expect(values).toHaveLength(22);
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

  it('routes each channel to a known RPC on its owning service', () => {
    for (const channel of Object.values(CHANNELS) as ChannelName[]) {
      const rpc = CHANNEL_TO_RPC[channel];
      if (AUTH_CHANNELS.has(channel)) {
        expect(
          AUTH_RPC_METHODS as readonly string[],
          `auth channel ${channel} → unknown Auth RPC ${rpc}`,
        ).toContain(rpc);
      } else {
        expect(
          GIT_CORE_RPC_METHODS as readonly string[],
          `git channel ${channel} → unknown GitCore RPC ${rpc}`,
        ).toContain(rpc);
      }
    }
  });

  it('marks exactly the four auth channels as Auth-service channels', () => {
    expect([...AUTH_CHANNELS].sort()).toEqual([
      'auth:connectGitHubFromCLI',
      'auth:getAuthStatus',
      'auth:listGitHubRepos',
      'auth:logout',
    ]);
  });

  it('matches the frozen channel → RPC mapping', () => {
    expect(CHANNEL_TO_RPC).toEqual(EXPECTED_MAPPING);
  });
});
