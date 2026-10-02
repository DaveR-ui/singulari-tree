import { describe, expect, it, vi } from 'vitest';

// supervisor.ts imports `electron` only for `app.getAppPath()`; stub it so the
// class can be exercised under plain Node without an Electron runtime.
vi.mock('electron', () => ({
  app: { getAppPath: () => '/tmp/singularitree-test' },
}));

import { Supervisor } from '../src/main/supervisor';

/**
 * Guards the Phase 0 streaming contract: channels mapped to server-streaming
 * RPCs (Fetch/Push/Pull) must reject promptly with NOT_IMPLEMENTED instead of
 * hanging on the unary callback path (ipc-strategy.md §2.2).
 */

function makeSupervisor(): Supervisor {
  return new Supervisor({
    goCoreBinary: '/nonexistent/go-core',
    grpcAddr: '127.0.0.1:0',
    httpAddr: '127.0.0.1:0',
  });
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

describe('Supervisor.forwardToGo streaming guard', () => {
  it('rejects git:fetch promptly with NOT_IMPLEMENTED (never pends)', async () => {
    const supervisor = makeSupervisor();
    const outcome = await settleWithin(supervisor.forwardToGo('git:fetch', {}), 1000);
    expect(outcome).toBe('rejected:NOT_IMPLEMENTED');
  });

  it.each(['git:fetch', 'git:pull', 'git:push'])(
    'rejects streaming channel %s immediately',
    async (channel) => {
      const supervisor = makeSupervisor();
      await expect(supervisor.forwardToGo(channel, {})).rejects.toMatchObject({
        code: 'NOT_IMPLEMENTED',
      });
    },
  );

  it('still maps unary channels (no NOT_IMPLEMENTED at the streaming guard)', async () => {
    const supervisor = makeSupervisor();
    // Not connected: a unary channel must not hit the streaming guard, so it
    // queues (or rejects with a non-streaming code) rather than NOT_IMPLEMENTED.
    const outcome = await settleWithin(supervisor.forwardToGo('git:getStatus', { repoId: 'x' }), 50);
    expect(outcome).toBe('pending'); // queued while not ready
  });

  it('routes an auth channel without hitting the GitCore streaming guard', async () => {
    const supervisor = makeSupervisor();
    // Auth RPCs are unary: `auth:logout` must pass the streaming guard and queue
    // while go-core is not ready — never reject NOT_IMPLEMENTED.
    const outcome = await settleWithin(supervisor.forwardToGo('auth:logout', {}), 50);
    expect(outcome).toBe('pending');
  });
});
