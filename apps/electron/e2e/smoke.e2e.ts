import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';

/**
 * Electron e2e smoke — the read/selection slice of the week-7 bar item
 * "open repo → graph → stage → commit → diff" (docs/context/git-client/roadmap-mvp.md).
 *
 * WHAT THIS SPEC ACTUALLY COVERS (honest scope)
 *   1. open repo   — type the fixture path into the repo picker and open it.
 *   2. graph       — the routed graph page renders real commits from go-core
 *                    (gRPC round-trip through the Electron IPC bridge).
 *   3. select      — clicking a row shows its details (message/oid).
 *   4. WIP row     — the synthetic working-tree row + WIP details panel render.
 *
 * WHAT IS ABSENT THIS ITERATION (asserted only as a documented skip, never faked)
 *   stage → commit → diff. The graph page exposes no stage/commit/diff controls;
 *   the shell toolbar's "Commit" button is inert chrome (see shell-toolbar.ts).
 *   `GraphStore.diffIntent` exists but is explicitly "not-yet-implemented".
 *
 * PREREQUISITES (build from the repo root; this spec will `test.skip` if missing)
 *   ./tools/scripts/build-go-core.sh                 -> dist/go-core
 *   (cd apps/angular && npm run build)               -> apps/angular/dist/browser/index.html
 *   (cd apps/electron && npm run build)              -> apps/electron/dist/main/main.js
 *
 * LAUNCH NOTE — why a static server + ELECTRON_START_URL instead of loadFile:
 *   main.ts' production branch computes
 *     path.join(__dirname, '../../apps/angular/dist/browser/index.html')
 *   which resolves to `apps/electron/dist/apps/angular/...` (does not exist), and
 *   the fallback `apps/electron/dist/angular/browser/index.html` is missing too, so
 *   loading the built `index.html` directly is currently broken. This spec instead
 *   serves the *same built bundle* (apps/angular/dist/browser) over a local HTTP
 *   server and points `ELECTRON_START_URL` at it — still the real renderer bundle,
 *   real preload bridge, real go-core.
 *
 * PLAywRIGHT/ELECTRON QUIRK — resource shim:
 *   Playwright's Electron loader makes `app.isPackaged === true`, so the shell
 *   resolves go-core/proto under `process.resourcesPath`. `ensureResourceShim()`
 *   creates idempotent symlinks from the Electron resources dir to the repo
 *   artifacts (node_modules is gitignored).
 *
 * Run from this package directory (never the repo root):
 *   cd apps/electron && npx playwright test
 */

const testDir = __dirname;
const packageDir = path.resolve(testDir, '..');
const repoRoot = path.resolve(packageDir, '../..');

const goCoreBin = path.join(repoRoot, 'dist/go-core');
const angularIndex = path.join(repoRoot, 'apps/angular/dist/browser/index.html');
const electronMain = path.join(packageDir, 'dist/main/main.js');
const protoDir = path.join(repoRoot, 'libs/contracts/proto');

/** Collect build/runtime prerequisites; any entry makes the smoke skip loudly. */
const missing: string[] = [];
if (!fs.existsSync(goCoreBin)) missing.push('dist/go-core (run ./tools/scripts/build-go-core.sh)');
if (!fs.existsSync(angularIndex)) missing.push('apps/angular/dist/browser/index.html (run `npm run build` in apps/angular)');
if (!fs.existsSync(electronMain)) missing.push('apps/electron/dist/main/main.js (run `npm run build` in apps/electron)');
if (spawnSync('git', ['--version'], { encoding: 'utf8' }).status !== 0) missing.push('git on PATH (needed for the fixture repo)');

interface Fixture {
  dir: string;
  head: string;
  first: string;
}

/** Minimal git fixture: 2 commits, a local remote, both tag kinds, a dirty file. */
function createFixtureRepo(): Fixture {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'singularitree-pw-e2e-')));
  const git = (args: string[]): string =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git(['init', '-q']);
  git(['config', 'user.email', 'e2e@singularitree.test']);
  git(['config', 'user.name', 'SingulariTree E2E']);
  git(['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(dir, 'README.md'), '# fixture\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'initial commit']);
  const first = git(['rev-parse', 'HEAD']).trim();
  fs.writeFileSync(path.join(dir, 'second.txt'), 'second\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'second commit']);
  const head = git(['rev-parse', 'HEAD']).trim();
  git(['remote', 'add', 'origin', dir]);
  git(['tag', '-a', 'v1.0.0', '-m', 'annotated release', first]);
  git(['tag', 'lightweight', head]);
  // Leave the working tree dirty so the WIP row has a reason to exist.
  fs.writeFileSync(path.join(dir, 'wip.txt'), 'uncommitted\n');
  return { dir, head, first };
}

/** Locate the Electron resources dir where Playwright reports `isPackaged=true`. */
function electronResourcesDir(): string | null {
  const candidates = [
    path.join(repoRoot, 'node_modules/electron/dist/resources'),
    path.join(packageDir, 'node_modules/electron/dist/resources'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/** Idempotent symlinks so the packaged-resolution paths find the real artifacts. */
function ensureResourceShim(): void {
  const res = electronResourcesDir();
  if (!res) return;
  const goCoreDir = path.join(res, 'go-core');
  fs.mkdirSync(goCoreDir, { recursive: true });
  const goCoreLink = path.join(goCoreDir, 'go-core');
  if (!fs.existsSync(goCoreLink)) fs.symlinkSync(goCoreBin, goCoreLink);
  const protoLink = path.join(res, 'proto');
  if (!fs.existsSync(protoLink)) fs.symlinkSync(protoDir, protoLink);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

/** Tiny static server for the built Angular bundle with SPA fallback. */
function createStaticServer(root: string): http.Server {
  return http.createServer((req, res) => {
    const rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = path.join(root, rel);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(root, 'index.html');
    }
    res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
}

let app: ElectronApplication | null = null;
let window: Page | null = null;
let server: http.Server | null = null;
let fixture: Fixture | null = null;

test.describe('SingulariTree Electron smoke: open repo → graph → select → WIP', () => {
  test.beforeAll(async () => {
    if (missing.length > 0) return;

    ensureResourceShim();
    fixture = createFixtureRepo();

    server = createStaticServer(path.join(repoRoot, 'apps/angular/dist/browser'));
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const { port } = server!.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/`;

    app = await electron.launch({
      // Passing the package directory => `electron apps/electron` so
      // app.getAppPath() === apps/electron (go-core/proto resolve correctly).
      args: [packageDir, '--no-sandbox', '--disable-dev-shm-usage'],
      cwd: packageDir,
      env: { ...process.env, ELECTRON_START_URL: url, MOCK_GO_CORE: '0' },
      timeout: 120_000,
    });
    window = await app.firstWindow({ timeout: 60_000 });
    await window.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    if (app) {
      try {
        await app.close();
      } catch {
        /* already closed */
      }
    }
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (fixture) fs.rmSync(fixture.dir, { recursive: true, force: true });
  });

  test('opens the fixture repo and renders the real commit graph', async () => {
    test.skip(missing.length > 0, `missing prerequisites: ${missing.join('; ')}`);
    if (!window || !fixture) throw new Error('e2e setup did not initialise');

    // (a) open repo via the in-page picker.
    const pathInput = window.getByTestId('repo-path-input');
    await pathInput.waitFor({ state: 'visible', timeout: 30_000 });
    await pathInput.fill(fixture.dir);
    await window.getByTestId('repo-open').click();

    // (b) graph: rows come from a real go-core getCommits gRPC round-trip.
    const messages = window.getByTestId('graph-row-message');
    await expect(messages.first()).toBeVisible({ timeout: 60_000 });
    const texts = await messages.allInnerTexts();
    expect(texts.length).toBeGreaterThanOrEqual(2);
    expect(texts).toContain('second commit');
    expect(texts).toContain('initial commit');

    // Errors/offline states must not be present on a healthy run.
    await expect(window.getByTestId('graph-error')).toHaveCount(0);
    await expect(window.getByTestId('repo-picker-error')).toHaveCount(0);
  });

  test('selects a commit and shows its details, then the WIP row', async () => {
    test.skip(missing.length > 0, `missing prerequisites: ${missing.join('; ')}`);
    if (!window || !fixture) throw new Error('e2e setup did not initialise');

    // (c) selection → details panel (read-only; no stage/commit UI exists).
    await window.getByTestId('graph-row-message').first().click();
    const detailMessage = window.getByTestId('commit-details-message');
    await expect(detailMessage).toBeVisible();
    await expect(detailMessage).toContainText('second commit');
    await expect(window.getByTestId('commit-details-oid')).toBeVisible();

    // (d) pinned synthetic WIP row → WIP placeholder details.
    await window.getByTestId('graph-wip').click();
    await expect(window.getByTestId('commit-details-wip')).toBeVisible();
    await expect(window.getByTestId('wip-row-label')).toContainText('Uncommitted changes');
  });

  test('stage → commit → diff (absent this iteration)', () => {
    test.skip(
      true,
      'No functional stage/commit/diff UI exists in this iteration: the graph page is read-only history + a synthetic WIP row, and the shell toolbar "Commit" button is inert chrome. GraphStore.diffIntent is explicitly not-yet-implemented. Covered steps in this spec: open repo → graph → select → WIP.',
    );
  });
});
