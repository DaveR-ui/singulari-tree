import { app, BrowserWindow, Menu } from 'electron';
import * as path from 'node:path';
import * as http from 'node:http';
import * as https from 'node:https';
import { createMainWindow } from '../window/window';
import { registerIpcHandlers } from '../ipc/handlers';
import { Supervisor } from './supervisor';
import { buildAppMenu } from './app-menu';

let mainWindow: BrowserWindow | null = null;
let supervisor: Supervisor | null = null;

function getGoCoreBinary(): string {
  // In packaged app, go-core binary is alongside resources.
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'go-core', 'go-core');
  }
  // Dev — look for built binary under SingulariTree/dist
  return path.join(app.getAppPath(), '../../dist/go-core');
}

/**
 * Directory holding the proto SSOT (libs/contracts/proto). The GoCoreClient
 * loads these with @grpc/proto-loader at runtime; proto files are bundled as
 * resources when packaged.
 */
function getProtoDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'proto');
  }
  return path.join(app.getAppPath(), '../../libs/contracts/proto');
}

/**
 * Wait until dev server responds (poll with http). Returns true if reachable within timeout.
 * Used to avoid Electron racing ahead of `ng serve`.
 */
async function waitForDevServer(url: string, timeoutMs = 30000, intervalMs = 500): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const parsed = new URL(url);
  const lib = parsed.protocol === 'https:' ? https : http;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = lib.get(url, (res) => {
        // any 2xx/3xx means server is up (Angular may return 200 or 304)
        const up = (res.statusCode ?? 500) < 500;
        res.resume();
        resolve(up);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function loadWithRetry(win: BrowserWindow, url: string): Promise<void> {
  // First, poll server readiness before first loadURL
  const ready = await waitForDevServer(url, 30000, 700);
  if (!ready) {
    console.warn(`[main] dev server ${url} not reachable after 30s — attempting load anyway`);
  }
  let attempts = 0;
  const maxAttempts = 20;
  while (attempts < maxAttempts) {
    try {
      await win.loadURL(url);
      console.log(`[main] loaded ${url}`);
      return;
    } catch (e) {
      attempts += 1;
      console.warn(`[main] loadURL failed attempt ${attempts}/${maxAttempts}`, e);
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw new Error(`Failed to load ${url} after ${maxAttempts} attempts`);
}

async function bootstrap(): Promise<void> {
  await app.whenReady();

  Menu.setApplicationMenu(buildAppMenu());

  mainWindow = createMainWindow();

  const devUrl = process.env['VITE_DEV_SERVER_URL'] ?? process.env['ELECTRON_START_URL'];

  // Mock is strictly opt-in (MOCK_GO_CORE=1). Real go-core is the default so
  // IPC traffic always exercises the gRPC dispatch path.
  supervisor = new Supervisor({
    goCoreBinary: getGoCoreBinary(),
    grpcAddr: '127.0.0.1:0',
    httpAddr: '127.0.0.1:0',
    token: process.env['GO_CORE_TOKEN'],
    protoDir: getProtoDir(),
    mock: process.env['MOCK_GO_CORE'] === '1',
  });

  // Fire-and-forget supervisor start; renderer will queue until GO_CORE_READY (mock resolves instantly)
  supervisor.start().catch((e) => console.error('[main] supervisor start failed', e));

  // Wire IPC handlers -> supervisor forwardToGo
  registerIpcHandlers((channel, payload) => {
    if (!supervisor) throw new Error('Supervisor not initialized');
    return supervisor.forwardToGo(channel, payload);
  });

  // Load renderer — dev branch exercised via loadURL
  if (devUrl) {
    // did-fail-load retry for race where ng serve restarts
    mainWindow.webContents.on('did-fail-load', (_ev, _code, _desc, validatedURL) => {
      if (validatedURL === devUrl) {
        console.warn(`[main] did-fail-load ${validatedURL} — retrying in 1s`);
        setTimeout(() => {
          mainWindow?.loadURL(devUrl).catch((e) => console.error('[main] retry loadURL failed', e));
        }, 1000);
      }
    });
    await loadWithRetry(mainWindow, devUrl);
    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    // Production — Angular build output
    const indexHtml = path.join(__dirname, '../../apps/angular/dist/browser/index.html');
    const fallback = path.join(__dirname, '../angular/browser/index.html');
    const fs = await import('node:fs');
    const target = fs.existsSync(indexHtml) ? indexHtml : fallback;
    await mainWindow.loadFile(target);
  }

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && mainWindow) {
      mainWindow = createMainWindow();
    }
  });

  app.on('before-quit', () => {
    supervisor?.stop();
  });
}

bootstrap().catch((e) => {
  console.error('[main] bootstrap failed', e);
  app.quit();
});
