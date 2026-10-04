import { contextBridge, ipcRenderer } from 'electron';

// Single contextBridge.exposeInMainWorld per ipc-strategy.md §1.2 / ADR-005.
//
// NOTE on the `rootDir` boundary: this file is compiled by apps/electron's
// tsconfig which pins `rootDir: src`, so it cannot import the generated
// contracts at libs/contracts/gen/ts/*.ts (outside rootDir). The interfaces
// below mirror those generated types 1:1 and are the concrete, `unknown`-free
// surface the Angular IpcBridge codes against. The wire contract itself is
// enforced at runtime by @grpc/proto-loader in src/main/go-core-client.ts
// (SSOT: libs/contracts/proto/*.proto).

// --- Wire types (mirror libs/contracts/gen/ts/{domain,gitcore}.ts) ---------

export interface Oid {
  hex: string;
  kind: string;
}

export interface Signature {
  name: string;
  email: string;
  when: string;
}

export interface RefLabel {
  name: string;
  kind: string;
}

export interface Commit {
  oid: Oid | undefined;
  parents: Oid[];
  author: Signature | undefined;
  committer: Signature | undefined;
  message: string;
  treeOid: Oid | undefined;
  committedAt: string;
  refs: RefLabel[];
}

export interface Lane {
  index: number;
  color: number;
  continues: boolean;
}

export interface Branch {
  name: string;
  refName: string;
  tip: Oid | undefined;
  upstream: string;
  isCurrent: boolean;
  isRemote: boolean;
}

export interface Remote {
  name: string;
  urls: string[];
  fetchSpecs: string[];
}

export interface Tag {
  name: string;
  refName: string;
  target: Oid | undefined;
  tagger: Signature | undefined;
  message: string;
  annotated: boolean;
}

export interface Stash {
  index: number;
  oid: Oid | undefined;
  message: string;
  branchName: string;
}

export interface Repository {
  id: string;
  fsPath: string;
  commonDir: string;
  name: string;
  createdAt: string;
  lastOpenedAt: string;
}

export interface DiffLine {
  kind: string;
  text: string;
  noNewline: boolean;
}

export interface Hunk {
  fromStart: number;
  fromLines: number;
  toStart: number;
  toLines: number;
  lines: DiffLine[];
}

export interface Diff {
  from: Oid | undefined;
  to: Oid | undefined;
  hunks: Hunk[];
  additions: number;
  deletions: number;
  isBinary: boolean;
  hasConflictMarkers: boolean;
}

export interface FileStatus {
  path: string;
  staged: string;
  unstaged: string;
  isStaged: boolean;
  isConflicted: boolean;
}

export interface OpenRepositoryRequest {
  fsPath: string;
}

export interface ListRepositoriesRequest {
  // empty
}

export interface ListRepositoriesResponse {
  repositories: Repository[];
}

export interface GetCommitsRequest {
  repoId: string;
  offset: number;
  limit: number;
}

export interface GetCommitsResponse {
  commits: Commit[];
  total: number;
  lanes: Lane[];
}

export interface GetBranchesRequest {
  repoId: string;
}

export interface GetBranchesResponse {
  branches: Branch[];
}

export interface GetRemotesRequest {
  repoId: string;
}

export interface GetRemotesResponse {
  remotes: Remote[];
}

export interface GetTagsRequest {
  repoId: string;
}

export interface GetTagsResponse {
  tags: Tag[];
}

export interface GetStashesRequest {
  repoId: string;
}

export interface GetStashesResponse {
  stashes: Stash[];
}

export interface GetStatusRequest {
  repoId: string;
}

export interface GetStatusResponse {
  files: FileStatus[];
}

export interface GetDiffRequest {
  repoId: string;
  from: string;
  to: string;
}

export interface StageRequest {
  repoId: string;
  paths: string[];
}

export interface UnstageRequest {
  repoId: string;
  paths: string[];
}

export interface CommitRequest {
  repoId: string;
  message: string;
  author?: Signature | undefined;
}

export interface CheckoutRequest {
  repoId: string;
  refName: string;
}

export interface FetchRequest {
  repoId: string;
  remote: string;
  /** Previously-deferred `fetch.prune` — `git fetch --prune`. */
  prune: boolean;
  /** Previously-deferred `fetch.tags` — `git fetch --tags`. */
  tags: boolean;
  /** Previously-deferred `fetch.overwriteTags` — `git fetch --force`. */
  force: boolean;
}

export interface PullRequest {
  repoId: string;
  remote: string;
  branch: string;
  /** Local branch to integrate into; empty = currently checked-out branch. */
  localBranch: string;
  /** Previously-deferred `pull.commitMerged` — `git pull --no-commit`. */
  noCommit: boolean;
  /** Previously-deferred `pull.includeMergedMessages` — `git pull --log`. */
  log: boolean;
  /** Previously-deferred `pull.noFF` — `git pull --no-ff`. */
  noFf: boolean;
  /** Previously-deferred `pull.rebase` — `git pull --rebase`. */
  rebase: boolean;
}

export interface PushRequest {
  repoId: string;
  remote: string;
  branch: string;
  /** Target remote branch when it differs from `branch`; empty = same name. */
  remoteBranch: string;
  /** Previously-deferred `push.track` — `git push --set-upstream`. */
  setUpstream: boolean;
  /** Previously-deferred `push.tags` — `git push --tags`. */
  tags: boolean;
  /** Previously-deferred `push.force` — `git push --force`. */
  force: boolean;
}

/** Command acknowledgements (empty proto messages). */
export interface CommandAck {
  // empty
}

export interface RepoChangedPayload {
  repoId: string;
  reason: 'commit' | 'checkout' | 'fetch' | 'watcher';
}

export interface FsChangedPayload {
  repoId: string;
  paths: string[];
}

export interface ProgressPayload {
  op: string;
  percent: number;
  message: string;
}

// --- Auth wire types (mirror libs/contracts/gen/ts/auth.ts) ----------------

/** AuthSource enumerates how the token was obtained (proto enum as strings). */
export type AuthSource =
  | 'AUTH_SOURCE_UNSPECIFIED'
  | 'AUTH_SOURCE_NONE'
  | 'AUTH_SOURCE_GITHUB_CLI'
  | 'AUTH_SOURCE_OAUTH'
  | 'UNRECOGNIZED';

export interface RateLimit {
  /** "core" | "search" | ... */
  resource: string;
  limit: number;
  remaining: number;
  /** epoch seconds (X-RateLimit-Reset) */
  reset: number;
  /** RFC3339 */
  resetAt: string;
}

export interface AuthStatus {
  authenticated: boolean;
  source: AuthSource;
  accountLogin: string;
  name: string;
  avatarUrl: string;
  /** MAY BE EMPTY: gh token scopes may omit read:user */
  email: string;
  scopes: string[];
  rateLimit: RateLimit | undefined;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string;
  avatarUrl: string;
  email: string;
  htmlUrl: string;
}

/** Pagination metadata derived from the GitHub `Link` header (rel="next"). */
export interface PageInfo {
  page: number;
  perPage: number;
  /** 0 == no Link rel="next" */
  nextPage: number;
  hasMore: boolean;
  /** best-effort; 0 when GitHub omits it (/user/repos) */
  total: number;
}

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  description: string;
  language: string;
  stargazersCount: number;
  updatedAt: string;
  nodeId: string;
  defaultBranch: string;
  ownerLogin: string;
  ownerAvatarUrl: string;
  /** "public" | "private" | "internal" */
  visibility: string;
  fork: boolean;
  archived: boolean;
  disabled: boolean;
  cloneUrl: string;
  sshUrl: string;
  gitUrl: string;
  pushedAt: string;
  createdAt: string;
  forksCount: number;
  openIssuesCount: number;
  topics: string[];
  licenseSpdxId: string;
  isTemplate: boolean;
  homepage: string;
}

export interface GetAuthStatusRequest {
  // empty
}

export interface GetAuthStatusResponse {
  authenticated: boolean;
  /** empty if not authenticated */
  login: string;
  status: AuthStatus | undefined;
}

export interface ConnectGitHubFromCLIRequest {
  /** empty -> resolve "gh" on PATH */
  ghBinary: string;
  /** true -> call GET /user to validate the token */
  verify: boolean;
}

export interface ConnectGitHubFromCLIResponse {
  status: AuthStatus | undefined;
  /** populated when verify=true */
  user: GitHubUser | undefined;
}

export interface ListGitHubReposRequest {
  /** default 30 */
  perPage: number;
  page: number;
  /** "updated" | "pushed" | "created" | "full_name" */
  sort: string;
  /** "asc" | "desc" */
  direction: string;
  /** "owner,collaborator,organization_member" */
  affiliation: string;
  /** "all" | "public" | "private" */
  visibility: string;
  /** "all" | "owner" | "public" | "private" | "member" */
  type: string;
}

export interface ListGitHubReposResponse {
  repos: GitHubRepo[];
  pageInfo: PageInfo | undefined;
  rateLimit: RateLimit | undefined;
}

export interface LogoutRequest {
  // empty
}

export interface LogoutResponse {
  // empty
}

// --- Bridge surface --------------------------------------------------------

export interface GitClientApi {
  getCommits: (req: GetCommitsRequest) => Promise<GetCommitsResponse>;
  getBranches: (req: GetBranchesRequest) => Promise<GetBranchesResponse>;
  getRemotes: (req: GetRemotesRequest) => Promise<GetRemotesResponse>;
  getTags: (req: GetTagsRequest) => Promise<GetTagsResponse>;
  getStashes: (req: GetStashesRequest) => Promise<GetStashesResponse>;
  getStatus: (req: GetStatusRequest) => Promise<GetStatusResponse>;
  getDiff: (req: GetDiffRequest) => Promise<Diff>;
  stage: (req: StageRequest) => Promise<CommandAck>;
  unstage: (req: UnstageRequest) => Promise<CommandAck>;
  commit: (req: CommitRequest) => Promise<Commit>;
  checkout: (req: CheckoutRequest) => Promise<CommandAck>;
  // fetch/pull/push are server-streaming in proto; progress arrives via
  // `onProgress` and the invoke promise just signals completion. This mirrors
  // Angular's `IpcBridge` (`Promise<void>`), keeping the two separately-declared
  // surfaces aligned.
  fetch: (req: FetchRequest) => Promise<void>;
  pull: (req: PullRequest) => Promise<void>;
  push: (req: PushRequest) => Promise<void>;
  openRepository: (req: OpenRepositoryRequest) => Promise<Repository>;
  listRepositories: (req: ListRepositoriesRequest) => Promise<ListRepositoriesResponse>;
  getAuthStatus: (req: GetAuthStatusRequest) => Promise<GetAuthStatusResponse>;
  connectGitHubFromCLI: (
    req: ConnectGitHubFromCLIRequest,
  ) => Promise<ConnectGitHubFromCLIResponse>;
  listGitHubRepos: (req: ListGitHubReposRequest) => Promise<ListGitHubReposResponse>;
  logout: (req: LogoutRequest) => Promise<LogoutResponse>;
  onRepoChanged: (cb: (payload: RepoChangedPayload) => void) => () => void;
  onFsChanged: (cb: (payload: FsChangedPayload) => void) => () => void;
  onProgress: (cb: (payload: ProgressPayload) => void) => () => void;
}

const api: GitClientApi = {
  getCommits: (req) => ipcRenderer.invoke('git:getCommits', req),
  getBranches: (req) => ipcRenderer.invoke('git:getBranches', req),
  getRemotes: (req) => ipcRenderer.invoke('git:getRemotes', req),
  getTags: (req) => ipcRenderer.invoke('git:getTags', req),
  getStashes: (req) => ipcRenderer.invoke('git:getStashes', req),
  getStatus: (req) => ipcRenderer.invoke('git:getStatus', req),
  getDiff: (req) => ipcRenderer.invoke('git:getDiff', req),
  stage: (req) => ipcRenderer.invoke('git:stage', req),
  unstage: (req) => ipcRenderer.invoke('git:unstage', req),
  commit: (req) => ipcRenderer.invoke('git:commit', req),
  checkout: (req) => ipcRenderer.invoke('git:checkout', req),
  fetch: (req) => ipcRenderer.invoke('git:fetch', req),
  pull: (req) => ipcRenderer.invoke('git:pull', req),
  push: (req) => ipcRenderer.invoke('git:push', req),
  openRepository: (req) => ipcRenderer.invoke('git:openRepository', req),
  listRepositories: (req) => ipcRenderer.invoke('git:listRepositories', req),
  getAuthStatus: (req) => ipcRenderer.invoke('auth:getAuthStatus', req),
  connectGitHubFromCLI: (req) => ipcRenderer.invoke('auth:connectGitHubFromCLI', req),
  listGitHubRepos: (req) => ipcRenderer.invoke('auth:listGitHubRepos', req),
  logout: (req) => ipcRenderer.invoke('auth:logout', req),
  // Each subscription returns an unsubscribe that removes ONLY its own handler
  // (`removeAllListeners` would detach every other subscriber on the channel).
  onRepoChanged: (cb) => {
    const handler = (_e: unknown, payload: RepoChangedPayload) => cb(payload);
    ipcRenderer.on('repo:changed', handler);
    return () => ipcRenderer.removeListener('repo:changed', handler);
  },
  onFsChanged: (cb) => {
    const handler = (_e: unknown, payload: FsChangedPayload) => cb(payload);
    ipcRenderer.on('fs:changed', handler);
    return () => ipcRenderer.removeListener('fs:changed', handler);
  },
  onProgress: (cb) => {
    const handler = (_e: unknown, payload: ProgressPayload) => cb(payload);
    ipcRenderer.on('git:progress', handler);
    return () => ipcRenderer.removeListener('git:progress', handler);
  },
};

contextBridge.exposeInMainWorld('gitClientApi', api);

declare global {
  interface Window {
    gitClientApi: GitClientApi;
  }
}
