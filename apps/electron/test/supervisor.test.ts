import { describe, expect, it, vi } from 'vitest';

// supervisor.ts imports `electron` only for `app.getAppPath()`; stub it so the
// class can be exercised under plain Node without an Electron runtime.
vi.mock('electron', () => ({
  app: { getAppPath: () => '/tmp/singularitree-test' },
}));

import { Supervisor, type SupervisorOptions } from '../src/main/supervisor';
import type { ProgressPayload } from '../src/ipc/events';

/**
 * Guards the streaming dispatch contract: Fetch/Pull/Push are server-streaming
 * RPCs driven through `GoCoreClient.invokeStream`, with progress forwarded to
 * the injected sink. Unary/auth channels keep the queue-while-not-ready
 * behaviour (ipc-strategy.md §2.2, §2.6).
 */

const BASE_OPTIONS: SupervisorOptions = {
  goCoreBinary: '/nonexistent/go-core',
  grpcAddr: '127.0.0.1:0',
  httpAddr: '127.0.0.1:0',
};

function makeSupervisor(onProgress?: (payload: ProgressPayload) => void): Supervisor {
  return new Supervisor({ ...BASE_OPTIONS, onProgress });
}

/** Resolve to a sentinel if the promise neither settles nor rejects promptly. */
async function settleWithin<T>(promise: Promise<T>, ms: number): Promise<string> {
  return Promise.race([
    promise.then(
      () => 'resolved',
      (e: { code?: string }) => `rejected:${e?.code ?? 'NO_CODE'}`,
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve('pending'), ms)),
  ]);
}

type ProgressFn = (p: { percent: number; message: string }) => void;
interface FakeClient {
  invokeStream: (
    rpc: string,
    payload: unknown,
    onProgress: ProgressFn,
  ) => Promise<void>;
}

/** Flip the supervisor to "ready" with a fake GitCore client. */
function armReady(supervisor: Supervisor, client: FakeClient): void {
  const internals = supervisor as unknown as { ready: boolean; client: FakeClient };
  internals.ready = true;
  internals.client = client;
}

describe('Supervisor.forwardToGo streaming dispatch', () => {
  it.each(['git:fetch', 'git:pull', 'git:push'])(
    'queues streaming channel %s while go-core is not ready (no NOT_IMPLEMENTED)',
    async (channel) => {
      const supervisor = makeSupervisor();
      const outcome = await settleWithin(supervisor.forwardToGo(channel, {}), 50);
      expect(outcome).toBe('pending');
    },
  );

  it.each([
    ['git:fetch', 'Fetch', 'fetch'],
    ['git:pull', 'Pull', 'pull'],
    ['git:push', 'Push', 'push'],
  ])(
    'drives %s over invokeStream and forwards progress as op=%s',
    async (channel, rpc, op) => {
      const progress: ProgressPayload[] = [];
      const supervisor = makeSupervisor((p) => progress.push(p));
      const invokeStream = vi.fn(
        async (_rpc: string, _payload: unknown, onProgress: ProgressFn) => {
          onProgress({ percent: 25, message: 'quarter' });
          onProgress({ percent: 100, message: 'done' });
        },
      );
      armReady(supervisor, { invokeStream });

      const payload = { repoId: 'repo-1', remote: 'origin' };
      await expect(supervisor.forwardToGo(channel, payload)).resolves.toBeUndefined();

      expect(invokeStream).toHaveBeenCalledWith(rpc, payload, expect.any(Function));
      expect(progress).toEqual([
        { op, percent: 25, message: 'quarter' },
        { op, percent: 100, message: 'done' },
      ]);
    },
  );

  it('propagates a stream error as the forwardToGo rejection', async () => {
    const supervisor = makeSupervisor();
    const invokeStream = vi.fn(async () => {
      throw { code: 'NETWORK_ERROR', message: 'boom', details: {} };
    });
    armReady(supervisor, { invokeStream });

    await expect(supervisor.forwardToGo('git:fetch', {})).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });

  it('still maps unary channels (no streaming dispatch, queues while not ready)', async () => {
    const supervisor = makeSupervisor();
    const outcome = await settleWithin(
      supervisor.forwardToGo('git:getStatus', { repoId: 'x' }),
      50,
    );
    expect(outcome).toBe('pending'); // queued while not ready
  });

  it('routes an auth channel without hitting the GitCore streaming path', async () => {
    const supervisor = makeSupervisor();
    const outcome = await settleWithin(supervisor.forwardToGo('auth:logout', {}), 50);
    expect(outcome).toBe('pending');
  });

  it('rejects an unknown channel with UNKNOWN_CHANNEL', async () => {
    const supervisor = makeSupervisor();
    await expect(supervisor.forwardToGo('git:nope', {})).rejects.toMatchObject({
      code: 'UNKNOWN_CHANNEL',
    });
  });
});
