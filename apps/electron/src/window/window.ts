import { BrowserWindow } from 'electron';
import * as path from 'node:path';
import { getCsp } from './csp';

export function createMainWindow(): BrowserWindow {
  const isDev = Boolean(process.env['VITE_DEV_SERVER_URL'] ?? process.env['ELECTRON_START_URL']);
  const csp = getCsp(isDev);

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: '#0f1115',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/preload.js'),
    },
  });

  // CSP enforcement — header injection; relaxed for localhost in dev.
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  win.once('ready-to-show', () => win.show());

  return win;
}
