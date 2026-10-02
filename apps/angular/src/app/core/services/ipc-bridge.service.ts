import { Injectable } from '@angular/core';
import type {
  ConnectGitHubFromCLIRequest,
  ConnectGitHubFromCLIResponse,
  GetAuthStatusRequest,
  GetAuthStatusResponse,
  ListGitHubReposRequest,
  ListGitHubReposResponse,
  LogoutRequest,
  LogoutResponse,
} from '@contracts/auth';
import type { Commit, Diff, Repository } from '@contracts/domain';
import type {
  CheckoutRequest,
  CheckoutResponse,
  CommitRequest,
  FetchRequest,
  FsChangedEvent,
  GetBranchesRequest,
  GetBranchesResponse,
  GetCommitsRequest,
  GetCommitsResponse,
  GetDiffRequest,
  GetRemotesRequest,
  GetRemotesResponse,
  GetStashesRequest,
  GetStashesResponse,
  GetStatusRequest,
  GetStatusResponse,
  GetTagsRequest,
  GetTagsResponse,
  ListRepositoriesRequest,
  ListRepositoriesResponse,
  OpenRepositoryRequest,
  Progress,
  PullRequest,
  PushRequest,
  StageRequest,
  StageResponse,
  UnstageRequest,
  UnstageResponse,
} from '@contracts/gitcore';

// Typed mirror of the preload bridge (`window.gitClientApi`, ipc-strategy.md §1.2).
// Channel -> proto request/response pulled from the generated contracts. `fetch`,
// `pull` and `push` are server-streaming in proto; progress arrives via `onProgress`
// and the invoke promise resolves when the operation completes.
export interface GitClientApi {
  getCommits: (req: GetCommitsRequest) => Promise<GetCommitsResponse>;
  openRepository: (req: OpenRepositoryRequest) => Promise<Repository>;
  listRepositories: (req: ListRepositoriesRequest) => Promise<ListRepositoriesResponse>;
  getBranches: (req: GetBranchesRequest) => Promise<GetBranchesResponse>;
  getRemotes: (req: GetRemotesRequest) => Promise<GetRemotesResponse>;
  getTags: (req: GetTagsRequest) => Promise<GetTagsResponse>;
  getStashes: (req: GetStashesRequest) => Promise<GetStashesResponse>;
  getStatus: (req: GetStatusRequest) => Promise<GetStatusResponse>;
  getDiff: (req: GetDiffRequest) => Promise<Diff>;
  stage: (req: StageRequest) => Promise<StageResponse>;
  unstage: (req: UnstageRequest) => Promise<UnstageResponse>;
  commit: (req: CommitRequest) => Promise<Commit>;
  checkout: (req: CheckoutRequest) => Promise<CheckoutResponse>;
  fetch: (req: FetchRequest) => Promise<void>;
  pull: (req: PullRequest) => Promise<void>;
  push: (req: PushRequest) => Promise<void>;
  getAuthStatus: (req: GetAuthStatusRequest) => Promise<GetAuthStatusResponse>;
  connectGitHubFromCLI: (req: ConnectGitHubFromCLIRequest) => Promise<ConnectGitHubFromCLIResponse>;
  listGitHubRepos: (req: ListGitHubReposRequest) => Promise<ListGitHubReposResponse>;
  logout: (req: LogoutRequest) => Promise<LogoutResponse>;
  onRepoChanged: (cb: (payload: Repository) => void) => () => void;
  onFsChanged: (cb: (payload: FsChangedEvent) => void) => () => void;
  onProgress: (cb: (payload: Progress) => void) => () => void;
}

export interface AppError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

function getApi(): GitClientApi | undefined {
  return (window as unknown as { gitClientApi?: GitClientApi }).gitClientApi;
}

@Injectable({ providedIn: 'root' })
export class IpcBridge {
  private get api(): GitClientApi | undefined {
    return getApi();
  }

  invoke<K extends keyof GitClientApi>(
    method: K,
    req: Parameters<GitClientApi[K]>[0],
  ): ReturnType<GitClientApi[K]> {
    const api = this.api;
    if (!api) {
      throw { code: 'IPC_UNAVAILABLE', message: 'Not running inside Electron' } as AppError;
    }
    const fn = api[method] as unknown as (req: unknown) => ReturnType<GitClientApi[K]>;
    if (typeof fn !== 'function') {
      throw { code: 'IPC_UNAVAILABLE', message: `Method ${String(method)} not available on gitClientApi` } as AppError;
    }
    return fn(req);
  }

  onRepoChanged(cb: (payload: Repository) => void): () => void {
    const api = this.api;
    if (!api?.onRepoChanged) return () => {};
    return api.onRepoChanged(cb);
  }

  onFsChanged(cb: (payload: FsChangedEvent) => void): () => void {
    const api = this.api;
    if (!api?.onFsChanged) return () => {};
    return api.onFsChanged(cb);
  }

  onProgress(cb: (payload: Progress) => void): () => void {
    const api = this.api;
    if (!api?.onProgress) return () => {};
    return api.onProgress(cb);
  }
}
