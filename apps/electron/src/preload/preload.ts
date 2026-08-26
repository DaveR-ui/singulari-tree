import { contextBridge, ipcRenderer } from 'electron';

// Single contextBridge.exposeInMainWorld per ipc-strategy.md §1.2

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
  onRepoChanged: (cb) => {
    const handler = (_e: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on('repo:changed', handler as never);
    return () => ipcRenderer.removeAllListeners('repo:changed');
  },
  onFsChanged: (cb) => {
    const handler = (_e: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on('fs:changed', handler as never);
    return () => ipcRenderer.removeAllListeners('fs:changed');
  },
  onProgress: (cb) => {
    const handler = (_e: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on('git:progress', handler as never);
    return () => ipcRenderer.removeAllListeners('git:progress');
  },
};

contextBridge.exposeInMainWorld('gitClientApi', api);

declare global {
  interface Window {
    gitClientApi: GitClientApi;
  }
}
