import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GoCoreClient } from '../src/main/go-core-client';

/**
 * Real end-to-end acceptance for the Phase 0 spine:
 *   git fixture repo → real go-core (gRPC) → GoCoreClient
 *     Ping → OpenRepository → GetCommits (asserts fixture messages & oids).
 *
 * Spawns `go run ./apps/go-core/cmd/go-core --headless ...` from the repo root
 * (or `dist/go-core` when already built). Skipped only if no Go toolchain.
 */

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(testDir, '..');
const repoRoot = path.resolve(packageDir, '../..');
const protoDir = path.join(repoRoot, 'libs/contracts/proto');
const builtBinary = path.join(repoRoot, 'dist/go-core');

const sdkBin = path.join(os.homedir(), 'sdk/go1.27.0/bin');
const goEnv: NodeJS.ProcessEnv = {
  ...process.env,
  PATH: `${sdkBin}${path.delimiter}${process.env['PATH'] ?? ''}`,
};
const sdkGo = path.join(sdkBin, 'go');
const goCmd = fs.existsSync(sdkGo) ? sdkGo : 'go';
const goVersionProbe = spawnSync(goCmd, ['version'], { env: goEnv, encoding: 'utf8' });
const goAvailable = goVersionProbe.status === 0;
const goVersion = (goVersionProbe.stdout ?? '').trim() || 'unavailable';

interface Fixture {
  dir: string;
  first: string;
  head: string;
}

function run(cmd: string, args: string[], cwd: string): string {
  const res = spawnSync(cmd, args, { cwd, env: goEnv, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(' ')} failed (${res.status}): ${res.stderr || res.stdout}`,
    );
  }
  return res.stdout;
}

function createFixtureRepo(): Fixture {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'singularitree-e2e-')));
  const git = (args: string[]) => run('git', args, dir);
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
  return { dir, first, head };
}

function spawnGoCore(dbPath: string): ChildProcessWithoutNullStreams {
  const args = [
    '--headless',
    '--grpc-addr',
    '127.0.0.1:0',
    '--http-fallback-addr',
    '127.0.0.1:0',
    '--db',
    dbPath,
  ];
  if (fs.existsSync(builtBinary)) {
    return spawn(builtBinary, args, {
      cwd: repoRoot,
      env: goEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    }) as ChildProcessWithoutNullStreams;
  }
  return spawn(goCmd, ['run', './apps/go-core/cmd/go-core', ...args], {
    cwd: repoRoot,
    env: goEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  }) as ChildProcessWithoutNullStreams;
}

function awaitReady(
  proc: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<{ addr: string; http: string; token: string }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const cleanup = () => {
      clearTimeout(timer);
      proc.stdout.off('data', onOut);
      proc.stderr.off('data', onErr);
      proc.off('exit', onExit);
    };
    const onOut = (chunk: Buffer) => {
      stdout += chunk.toString();
      const m = stdout.match(
        /GO_CORE_READY\s+addr=(\S+)\s+http=(\S+)\s+token=(\S+)/,
      );
      if (m) {
        cleanup();
        resolve({ addr: m[1], http: m[2], token: m[3] });
      }
    };
    const onErr = (chunk: Buffer) => {
      stderr += chunk.toString();
    };
    const onExit = (code: number | null) => {
      cleanup();
      reject(
        new Error(
          `go-core exited before GO_CORE_READY (code=${code})\n--- stderr ---\n${stderr}`,
        ),
      );
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `GO_CORE_READY timeout after ${timeoutMs}ms\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`,
        ),
      );
    }, timeoutMs);

    proc.stdout.on('data', onOut);
    proc.stderr.on('data', onErr);
    proc.on('exit', onExit);
  });
}

function killProc(proc: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      resolve();
      return;
    }
    const done = () => resolve();
    proc.once('exit', done);
    const signalTree = (signal: NodeJS.Signals) => {
      try {
        if (proc.pid && process.platform !== 'win32') {
          process.kill(-proc.pid, signal);
        } else {
          proc.kill(signal);
        }
      } catch {
        try {
          proc.kill(signal);
        } catch {
          /* already gone */
        }
      }
    };
    signalTree('SIGTERM');
    setTimeout(() => {
      if (proc.exitCode === null && proc.signalCode === null) signalTree('SIGKILL');
      resolve();
    }, 3000);
  });
}

describe.skipIf(!goAvailable)(
  `go-core GetCommits e2e [Go: ${goVersion}]`,
  () => {
    const tmpRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'singularitree-e2e-run-'),
    );
    let fixture: Fixture;
    let proc: ChildProcessWithoutNullStreams | null = null;
    let client: GoCoreClient | null = null;

    beforeAll(async () => {
      fixture = createFixtureRepo();
      proc = spawnGoCore(path.join(tmpRoot, 'cache.db'));
      const ready = await awaitReady(proc, 180_000);
      client = new GoCoreClient({ protoDir });
      client.connect(ready.addr, ready.token);
    });

    afterAll(async () => {
      client?.close();
      if (proc) await killProc(proc);
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      if (fixture) fs.rmSync(fixture.dir, { recursive: true, force: true });
    });

    it('round-trips Ping → OpenRepository → GetCommits', async () => {
      if (!client) throw new Error('client not initialised');

      const pong = await client.ping();
      expect(pong.ok).toBe(true);

      const repo = await client.openRepository({ fsPath: fixture.dir });
      expect(repo.id).toBeTruthy();
      expect(fs.realpathSync(repo.fsPath)).toBe(fixture.dir);

      const result = await client.getCommits({
        repoId: repo.id,
        offset: 0,
        limit: 50,
      });
      const messages = result.commits.map((c) => c.message.trim());
      expect(messages).toContain('initial commit');
      expect(messages).toContain('second commit');

      const oids = result.commits.map((c) => c.oid?.hex);
      expect(oids).toContain(fixture.head);
      expect(oids).toContain(fixture.first);
      expect(result.total).toBeGreaterThanOrEqual(2);
    });

    it('preserves the domain error code NOT_A_GIT_REPO across the wire', async () => {
      if (!client) throw new Error('client not initialised');

      const notARepo = fs.mkdtempSync(
        path.join(os.tmpdir(), 'singularitree-nonrepo-'),
      );
      try {
        await expect(
          client.openRepository({ fsPath: notARepo }),
        ).rejects.toMatchObject({ code: 'NOT_A_GIT_REPO' });
      } finally {
        fs.rmSync(notARepo, { recursive: true, force: true });
      }
    });
  },
);
