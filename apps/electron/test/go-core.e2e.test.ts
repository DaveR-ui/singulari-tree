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
 *     Ping → OpenRepository → GetCommits (asserts fixture messages & oids)
 *     GetBranches → GetRemotes → GetTags (refs read path) + domain error codes.
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
  branch: string;
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
  // Current branch name (works whether git defaults to main or master).
  const branch = git(['symbolic-ref', '--short', 'HEAD']).trim();
  // Offline/local refs so GetRemotes/GetTags exercise the non-empty mapping
  // path: a local-path remote (no network) plus both tag kinds.
  git(['remote', 'add', 'origin', dir]);
  git(['tag', '-a', 'v1.0.0', '-m', 'annotated release', first]);
  git(['tag', 'lightweight', head]);
  return { dir, branch, first, head };
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
    let authClient: GoCoreClient | null = null;

    beforeAll(async () => {
      fixture = createFixtureRepo();
      proc = spawnGoCore(path.join(tmpRoot, 'cache.db'));
      const ready = await awaitReady(proc, 180_000);
      client = new GoCoreClient({ protoDir });
      client.connect(ready.addr, ready.token);
      // Second channel-bound client for the distinct singularitree.v1.Auth
      // service registered on the same go-core process/addr/token.
      authClient = new GoCoreClient({ protoDir, serviceName: 'Auth' });
      authClient.connect(ready.addr, ready.token);
    });

    afterAll(async () => {
      client?.close();
      authClient?.close();
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

    it('round-trips GetBranches → GetRemotes → GetTags and preserves REPO_NOT_FOUND', async () => {
      if (!client) throw new Error('client not initialised');

      const repo = await client.openRepository({ fsPath: fixture.dir });

      const { branches } = await client.getBranches({ repoId: repo.id });
      const current = branches.find((b) => b.isCurrent);
      expect(current, 'fixture must expose its current branch').toBeDefined();
      expect(current?.name).toBe(fixture.branch);
      expect(current?.tip?.hex).toBe(fixture.head);
      expect(branches.every((b) => b.isRemote === false)).toBe(true);

      const { remotes } = await client.getRemotes({ repoId: repo.id });
      expect(remotes.map((r) => r.name)).toContain('origin');
      const origin = remotes.find((r) => r.name === 'origin');
      expect(origin?.urls).toContain(fixture.dir);

      const { tags } = await client.getTags({ repoId: repo.id });
      const annotated = tags.find((t) => t.name === 'v1.0.0');
      const lightweight = tags.find((t) => t.name === 'lightweight');
      expect(annotated?.annotated).toBe(true);
      expect(annotated?.target?.hex).toBe(fixture.first);
      expect(lightweight?.annotated).toBe(false);
      expect(lightweight?.target?.hex).toBe(fixture.head);

      // Unknown repo id → domain REPO_NOT_FOUND crosses the wire via the
      // x-app-error-code trailer (proves the handler routes through the service).
      await expect(
        client.getBranches({ repoId: '00000000-0000-0000-0000-000000000000' }),
      ).rejects.toMatchObject({ code: 'REPO_NOT_FOUND' });
    });

    it('streams Fetch progress against a local-path remote and resolves at EOF', async () => {
      if (!client) throw new Error('client not initialised');

      const repo = await client.openRepository({ fsPath: fixture.dir });
      const progress: Array<{ percent: number; message: string }> = [];
      await expect(
        client.invokeStream(
          'Fetch',
          { repoId: repo.id, remote: 'origin' },
          (p) => progress.push(p),
        ),
      ).resolves.toBeUndefined();

      // The adapter always emits a synthetic "git fetch started" chunk, so a
      // successful stream must deliver at least one Progress message.
      expect(progress.length).toBeGreaterThan(0);
      for (const p of progress) {
        expect(typeof p.percent).toBe('number');
        expect(typeof p.message).toBe('string');
      }
      expect(progress.some((p) => p.message.includes('git fetch started'))).toBe(true);

      // The generic unary dispatch must also drive the stream to completion.
      await expect(
        client.invoke('Fetch', { repoId: repo.id, remote: 'origin' }),
      ).resolves.toBeUndefined();
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

    it('talks to the real Auth service: status, logout, unauthenticated, gh-missing', async () => {
      if (!authClient) throw new Error('auth client not initialised');

      // Fresh core holds no token.
      const status = (await authClient.invoke('GetAuthStatus', {})) as {
        authenticated: boolean;
      };
      expect(status.authenticated).toBe(false);

      // Logout is idempotent and always resolves on a fresh core.
      await expect(authClient.invoke('Logout', {})).resolves.toBeDefined();

      // No token → domain code preserved through the x-app-error-code trailer.
      await expect(authClient.invoke('ListGitHubRepos', {})).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });

      // A guaranteed-missing gh binary must fail deterministically without
      // touching the developer's gh or the network.
      let caught: unknown;
      try {
        await authClient.invoke('ConnectGitHubFromCLI', {
          ghBinary: 'singularitree-nonexistent-gh-binary',
          verify: true,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toMatchObject({ code: 'GH_CLI_NOT_FOUND' });

      // NEW x-app-error-details trailer round-trips as structured JSON.
      const err = caught as { message: string; details: Record<string, unknown> };
      expect(err.details.binary).toBe('singularitree-nonexistent-gh-binary');
      expect(typeof err.details.searched_path).toBe('string');
      expect((err.details.searched_path as string).length).toBeGreaterThan(0);

      // Structured fields only — never raw stderr in message or details.
      expect(err.message).not.toContain('fatal:');
      expect(err.message).not.toContain('not logged');
      for (const value of Object.values(err.details)) {
        expect(String(value)).not.toContain('fatal:');
        expect(String(value)).not.toContain('not logged');
      }
    });
  },
);
