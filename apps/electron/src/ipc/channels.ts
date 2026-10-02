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
  openRepository: 'git:openRepository',
  listRepositories: 'git:listRepositories',
  getAuthStatus: 'auth:getAuthStatus',
  connectGitHubFromCLI: 'auth:connectGitHubFromCLI',
  listGitHubRepos: 'auth:listGitHubRepos',
  logout: 'auth:logout',
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];

/**
 * IPC channel → owning service RPC method (`git:*` → `singularitree.v1.GitCore`,
 * `auth:*` → `singularitree.v1.Auth`; see `AUTH_CHANNELS`).
 *
 * Frozen surface consumed by the Angular IpcBridge — map keys are the channel
 * values so `satisfies Record<ChannelName, ...>` enforces exhaustiveness at
 * compile time (mapping drift is also asserted in test/channels.test.ts).
 */
export const CHANNEL_TO_RPC = {
  [CHANNELS.getCommits]: 'GetCommits',
  [CHANNELS.getBranches]: 'GetBranches',
  [CHANNELS.getRemotes]: 'GetRemotes',
  [CHANNELS.getTags]: 'GetTags',
  [CHANNELS.getStashes]: 'GetStashes',
  [CHANNELS.getStatus]: 'GetStatus',
  [CHANNELS.getDiff]: 'GetDiff',
  [CHANNELS.stage]: 'Stage',
  [CHANNELS.unstage]: 'Unstage',
  [CHANNELS.commit]: 'Commit',
  [CHANNELS.checkout]: 'Checkout',
  [CHANNELS.fetch]: 'Fetch',
  [CHANNELS.pull]: 'Pull',
  [CHANNELS.push]: 'Push',
  [CHANNELS.openRepository]: 'OpenRepository',
  [CHANNELS.listRepositories]: 'ListRepositories',
  [CHANNELS.getAuthStatus]: 'GetAuthStatus',
  [CHANNELS.connectGitHubFromCLI]: 'ConnectGitHubFromCLI',
  [CHANNELS.listGitHubRepos]: 'ListGitHubRepos',
  [CHANNELS.logout]: 'Logout',
} as const satisfies Record<ChannelName, string>;

export type ChannelRpcName = (typeof CHANNEL_TO_RPC)[ChannelName];

/**
 * Channels routed to the `singularitree.v1.Auth` service (all unary).
 *
 * `Supervisor.forwardToGo` uses this to pick the Auth gRPC client instead of the
 * GitCore one. Auth RPCs are deliberately absent from `STREAMING_RPCS` below —
 * every Auth method is unary.
 */
export const AUTH_CHANNELS: ReadonlySet<string> = new Set<string>([
  CHANNELS.getAuthStatus,
  CHANNELS.connectGitHubFromCLI,
  CHANNELS.listGitHubRepos,
  CHANNELS.logout,
]);

/**
 * Server-streaming RPCs — declared `returns (stream ...)` in gitcore.proto.
 *
 * The Phase 0 unary invoke path cannot drive these: the callback passed to a
 * streaming method never settles, so a naive `unary()` dispatch would hang.
 * `supervisor.forwardToGo` and `GoCoreClient.invoke` therefore reject these
 * immediately with `NOT_IMPLEMENTED` (Phase 6 owns real streaming wiring).
 */
export const STREAMING_RPCS = new Set<string>([
  'StreamCommits',
  'Fetch',
  'Push',
  'Pull',
  'Watch',
]);

/** True when `rpc` is a server-streaming GitCore method. */
export function isStreamingRpc(rpc: string): boolean {
  return STREAMING_RPCS.has(rpc);
}

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
