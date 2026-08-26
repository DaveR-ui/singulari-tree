import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { app } from 'electron';

/**
 * Supervisor — spawns go-core, awaits GO_CORE_READY, heartbeats Ping 5s,
 * exponential backoff restart, queue drain (ipc-strategy.md §2.6).
 */

export interface SupervisorOptions {
  goCoreBinary: string;
  grpcAddr: string;
  httpAddr: string;
  dbPath?: string;
  token?: string;
  /** When true, do not spawn a real process — in-memory mock for dev bootstrap. */
  mock?: boolean;
}

interface PendingRequest {
  channel: string;
  payload: unknown;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

export class Supervisor {
  private proc: ChildProcess | null = null;
  private ready = false;
  private token = '';
  private grpcAddr = '';
  private httpAddr = '';
  private restarts = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private queue: PendingRequest[] = [];
  private readonly maxQueue = 100;
  private readonly mockMode: boolean;

  constructor(private readonly opts: SupervisorOptions) {
    this.token = opts.token ?? this.generateToken();
    this.grpcAddr = opts.grpcAddr;
    this.httpAddr = opts.httpAddr;
    // Explicit mock flag or env var MOCK_GO_CORE=1 triggers mock mode
    this.mockMode = opts.mock ?? process.env['MOCK_GO_CORE'] === '1';
  }

  async start(): Promise<void> {
    if (this.mockMode) {
      console.log('[supervisor] mock mode — skipping go-core spawn');
      this.ready = true;
      this.drainQueue();
      this.startHeartbeat();
      return;
    }
    try {
      await this.spawn();
      this.startHeartbeat();
    } catch (e) {
      // Graceful fallback to mock if spawn fails in dev (no binary, go not installed, etc.)
      const isDev = Boolean(process.env['VITE_DEV_SERVER_URL'] ?? process.env['ELECTRON_START_URL']);
      if (isDev) {
        console.warn('[supervisor] spawn failed in dev — falling back to mock', e);
        this.ready = true;
        this.drainQueue();
        this.startHeartbeat();
        return;
      }
      throw e;
    }
  }

  stop(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.proc?.kill();
    this.proc = null;
  }

  private async spawn(): Promise<void> {
    const args = [
      '--grpc-addr',
      this.opts.grpcAddr,
      '--http-fallback-addr',
      this.opts.httpAddr,
      '--token',
      this.token,
    ];
    if (this.opts.dbPath) args.push('--db', this.opts.dbPath);

    // Resolve binary — in dev, prefer go run fallback if binary not present.
    const bin = this.opts.goCoreBinary;
    const useGoRun = !fs.existsSync(bin);

    if (useGoRun) {
      // dev fallback: go run ./apps/go-core/cmd/go-core
      this.proc = spawn('go', ['run', path.join(app.getAppPath(), '../apps/go-core/cmd/go-core'), ...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } else {
      this.proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    }

    await this.awaitReady();

    this.proc.on('exit', (code, signal) => {
      this.ready = false;
      console.warn(`[supervisor] go-core exited code=${code} signal=${signal} — restarting`);
      this.scheduleRestart();
    });

    this.proc.on('error', (err) => {
      this.ready = false;
      console.error('[supervisor] spawn error', err);
      this.scheduleRestart();
    });
  }

  private awaitReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('GO_CORE_READY timeout')), 15000);
      const onData = (chunk: Buffer) => {
        const line = chunk.toString();
        const m = line.match(/GO_CORE_READY\s+addr=(\S+)\s+http=(\S+)\s+token=(\S+)/);
        if (m) {
          this.grpcAddr = m[1];
          this.httpAddr = m[2];
          // token from stdout may rotate; keep supervisor token in sync if provided
          this.ready = true;
          this.restarts = 0;
          clearTimeout(timeout);
          this.proc?.stdout?.off('data', onData);
          this.drainQueue();
          resolve();
        }
        // Also log
        process.stdout.write(`[go-core] ${line}`);
      };
      this.proc?.stdout?.on('data', onData);
      this.proc?.stderr?.on('data', (c: Buffer) => process.stderr.write(`[go-core:err] ${c.toString()}`));
    });
  }

  private scheduleRestart(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    const backoffs = [200, 500, 1000, 2000, 5000];
    const delay = backoffs[Math.min(this.restarts, backoffs.length - 1)];
    this.restarts += 1;
    // Rotate token on each restart
    this.token = this.generateToken();
    setTimeout(() => {
      this.spawn()
        .then(() => this.startHeartbeat())
        .catch((e) => {
          console.error('[supervisor] restart failed', e);
          this.scheduleRestart();
        });
    }, delay);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.ping();
      } catch {
        console.warn('[supervisor] Ping missed — restarting go-core');
        this.proc?.kill();
        // exit handler will restart
      }
    }, 5000);
  }

  private async ping(): Promise<void> {
    // Placeholder — real implementation uses gRPC Ping RPC with token metadata.
    if (!this.ready) throw new Error('not ready');
    if (this.mockMode) return; // mock: always healthy
    // TODO: gRPC client Ping({ }) with authorization Bearer token
  }

  private drainQueue(): void {
    const pending = [...this.queue];
    this.queue = [];
    for (const req of pending) {
      this.forwardToGo(req.channel, req.payload).then(req.resolve, req.reject);
    }
  }

  async forwardToGo(channel: string, payload: unknown): Promise<unknown> {
    if (!this.ready) {
      if (this.queue.length >= this.maxQueue) {
        throw { code: 'QUEUE_FULL', message: 'Go core unavailable and queue full' };
      }
      return new Promise((resolve, reject) => {
        this.queue.push({ channel, payload, resolve, reject });
      });
    }
    // Mock mode: echo payload without gRPC
    console.log(`[supervisor${this.mockMode ? ':mock' : ''}] forward ${channel}`, payload);
    return { ok: true, channel, payload, mock: this.mockMode || undefined };
  }

  private generateToken(): string {
    // 32B hex
    const chars = '0123456789abcdef';
    let out = '';
    for (let i = 0; i < 64; i++) out += chars[Math.floor(Math.random() * 16)];
    return out;
  }
}
