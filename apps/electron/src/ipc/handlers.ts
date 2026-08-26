import { ipcMain } from 'electron';
import { CHANNELS, validate, type ChannelName } from './channels';

/**
 * Registers ipcMain.handle for each channel — validate + forward to Go core.
 * forwardToGo is injected by main.ts / supervisor.ts.
 */

export type ForwardToGo = (channel: ChannelName, payload: unknown) => Promise<unknown>;

export function registerIpcHandlers(forwardToGo: ForwardToGo): void {
  for (const channel of Object.values(CHANNELS) as ChannelName[]) {
    ipcMain.handle(channel, async (_event, payload: unknown) => {
      validate(channel, payload);
      return forwardToGo(channel, payload);
    });
  }
}

export function unregisterIpcHandlers(): void {
  for (const channel of Object.values(CHANNELS) as ChannelName[]) {
    ipcMain.removeHandler(channel);
  }
}
