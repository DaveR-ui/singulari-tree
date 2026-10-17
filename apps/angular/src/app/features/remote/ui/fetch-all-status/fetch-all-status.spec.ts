import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppError } from '@core/services/ipc-bridge.service';
import type { FetchAllProgress, RepoFetchState } from '../../remote-models';
import { FetchAllStatus } from './fetch-all-status';

interface Options {
  open?: boolean;
  progress?: FetchAllProgress | null;
  status?: Readonly<Record<string, RepoFetchState>>;
  error?: AppError | null;
}

async function setup(opts: Options = {}): Promise<ComponentFixture<FetchAllStatus>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();
  const fixture = TestBed.createComponent(FetchAllStatus);
  fixture.componentRef.setInput('open', opts.open ?? true);
  fixture.componentRef.setInput('progress', opts.progress ?? null);
  fixture.componentRef.setInput('status', opts.status ?? {});
  fixture.componentRef.setInput('error', opts.error ?? null);
  fixture.detectChanges();
  return fixture;
}

function query<T extends Element>(fixture: { nativeElement: unknown }, testId: string): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${testId}"]`);
}

describe('FetchAllStatus', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders nothing when closed', async () => {
    const fixture = await setup({ open: false });

    expect(query(fixture, 'fetch-all-status')).toBeNull();
  });

  it('renders the compact counter on one line', async () => {
    const fixture = await setup({
      progress: { done: 1, total: 2 },
      status: { a: 'success', b: 'pending' },
    });

    const line = query<HTMLElement>(fixture, 'fetch-all-status')!;
    expect(line.textContent).toContain('Fetching repositories');
    expect(query(fixture, 'fetch-all-count')?.textContent?.trim()).toBe('1/2');
    // No per-repo rows survive the compaction.
    expect(line.querySelector('[data-testid="fetch-all-row"]')).toBeNull();
  });

  it('shows the failed count only when a repository failed', async () => {
    const clean = await setup({ status: { a: 'success' } });
    expect(query(clean, 'fetch-all-failed')).toBeNull();
    expect(clean.componentInstance.failedCount()).toBe(0);

    const fixture = await setup({ status: { a: 'success', b: 'failed' } });
    expect(query(fixture, 'fetch-all-failed')?.textContent).toContain('✕');
    expect(query(fixture, 'fetch-all-failed')?.textContent).toContain('1');
    expect(fixture.componentInstance.failedCount()).toBe(1);
  });

  it('surfaces the last failure', async () => {
    const fixture = await setup({
      status: { a: 'failed' },
      error: { code: 'FETCH_FAILED', message: 'network down' },
    });

    expect(query(fixture, 'fetch-all-error')?.textContent).toContain('network down');
  });

  it('emits dismissed when the dismiss control is used', async () => {
    const fixture = await setup();
    let dismissed = 0;
    fixture.componentInstance.dismissed.subscribe(() => dismissed++);

    query<HTMLButtonElement>(fixture, 'fetch-all-dismiss')!.click();

    expect(dismissed).toBe(1);
  });

  it('counts every failed repository', async () => {
    const fixture = await setup({ status: { a: 'failed', b: 'failed', c: 'success' } });

    expect(fixture.componentInstance.failedCount()).toBe(2);
  });
});
