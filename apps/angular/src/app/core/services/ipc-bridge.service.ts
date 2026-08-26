import { Injectable } from '@angular/core';

// Minimal GitClientApi shape mirroring preload contract (libs/contracts/gen/ts/api).
// Actual generated types will replace this via @contracts path alias once buf generate runs.
export interface GitClientApi {
  getCommits: (req: unknown) => Promise<unknown>;
  getBranches: (req: unknown) => Promise<unknown>;
  getRemotes: (req: unknown) => Promise<unknown>;
  getTags: (req: unknown) => Promise<unknown>;
  getStashes: (req: unknown) => Promise<unknown>;
  getStatus: (req: unknown) => Promise<unknown>;
  getDiff: (req: unknown) => Promise<unknown>;
  stage: (req: unknown) => Promise<unknown>;
  unstage: (req: unknown) => Promise<unknown>;
  commit: (req: unknown) => Promise<unknown>;
  checkout: (req: unknown) => Promise<unknown>;
  fetch: (req: unknown) => Promise<unknown>;
  pull: (req: unknown) => Promise<unknown>;
  push: (req: unknown) => Promise<unknown>;
  onRepoChanged: (cb: (payload: unknown) => void) => () => void;
  onFsChanged: (cb: (payload: unknown) => void) => () => void;
  onProgress: (cb: (payload: unknown) => void) => () => void;
}

export interface AppError {
  code: string;
  message: string;
  details?: Record<string, string>;
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

  onRepoChanged(cb: (payload: unknown) => void): () => void {
    const api = this.api;
    if (!api?.onRepoChanged) return () => {};
    return api.onRepoChanged(cb);
  }

  onFsChanged(cb: (payload: unknown) => void): () => void {
    const api = this.api;
    if (!api?.onFsChanged) return () => {};
    return api.onFsChanged(cb);
  }

  onProgress(cb: (payload: unknown) => void): () => void {
    const api = this.api;
    if (!api?.onProgress) return () => {};
    return api.onProgress(cb);
  }
}
