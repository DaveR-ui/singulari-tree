import type { BrowserWindow } from 'electron';

/**
 * webContents.send definitions (ipc-strategy.md §1.2 — events.ts).
 * Electron -> renderer push channels.
 */

export const EVENT_CHANNELS = {
  repoChanged: 'repo:changed',
  fsChanged: 'fs:changed',
  gitProgress: 'git:progress',
} as const;

export type RepoChangedPayload = { repoId: string; reason: 'commit' | 'checkout' | 'fetch' | 'watcher' };
export type FsChangedPayload = { repoId: string; paths: string[] };
export type ProgressPayload = { op: string; percent: number; message: string };

export function sendRepoChanged(win: BrowserWindow, payload: RepoChangedPayload): void {
  win.webContents.send(EVENT_CHANNELS.repoChanged, payload);
}

export function sendFsChanged(win: BrowserWindow, payload: FsChangedPayload): void {
  win.webContents.send(EVENT_CHANNELS.fsChanged, payload);
}

export function sendProgress(win: BrowserWindow, payload: ProgressPayload): void {
  win.webContents.send(EVENT_CHANNELS.gitProgress, payload);
}
