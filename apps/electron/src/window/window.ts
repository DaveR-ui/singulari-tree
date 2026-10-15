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
    // Matches the renderer's dark canvas (`--st-color-bg`, design-system.md), so
    // the pre-paint/load backdrop is the same navy and there is no colour flash.
    // The shell cannot read CSS custom properties, so the value is a literal and
    // must be updated with the token.
    backgroundColor: '#1e1e2e',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/preload.js'),
    },
  });

  // CSP enforcement — header injection; relaxed for localhost in dev.
  // If the response already carries a CSP (e.g. `app://` responses set it in
  // main/protocol.ts), keep it rather than appending a second, invalid policy.
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const existing = Object.keys(details.responseHeaders ?? {}).some(
      (k) => k.toLowerCase() === 'content-security-policy',
    );
    const responseHeaders = existing
      ? details.responseHeaders
      : { ...details.responseHeaders, 'Content-Security-Policy': [csp] };
    callback({ responseHeaders });
  });

  win.once('ready-to-show', () => win.show());

  return win;
}
