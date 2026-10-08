import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppError } from '@core/services/ipc-bridge.service';
import type { FetchAllProgress, RepoFetchEntry, RepoFetchState } from '../../remote-models';
import { FetchAllStatus } from './fetch-all-status';

interface Options {
  open?: boolean;
  progress?: FetchAllProgress | null;
  status?: Readonly<Record<string, RepoFetchState>>;
  repos?: readonly RepoFetchEntry[];
  error?: AppError | null;
}

async function setup(opts: Options = {}): Promise<ComponentFixture<FetchAllStatus>> {
  await TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();
  const fixture = TestBed.createComponent(FetchAllStatus);
  fixture.componentRef.setInput('open', opts.open ?? true);
  fixture.componentRef.setInput('progress', opts.progress ?? null);
  fixture.componentRef.setInput('status', opts.status ?? {});
  fixture.componentRef.setInput('repos', opts.repos ?? []);
  fixture.componentRef.setInput('error', opts.error ?? null);
  fixture.detectChanges();
  return fixture;
}

function query<T extends Element>(fixture: { nativeElement: unknown }, testId: string): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${testId}"]`);
}

function queryAll<T extends Element>(fixture: { nativeElement: unknown }, testId: string): T[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<T>(`[data-testid="${testId}"]`),
  );
}

const REPOS: RepoFetchEntry[] = [
  { repoId: 'a', name: 'Alpha' },
  { repoId: 'b', name: 'Beta' },
];

describe('FetchAllStatus', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders nothing when closed', async () => {
    const fixture = await setup({ open: false });

    expect(query(fixture, 'fetch-all-status')).toBeNull();
  });

  it('renders one row per repository with an aggregate counter', async () => {
    const fixture = await setup({
      progress: { done: 1, total: 2 },
      repos: REPOS,
      status: { a: 'success', b: 'pending' },
    });

    expect(query(fixture, 'fetch-all-count')?.textContent?.trim()).toBe('1/2');
    const rows = queryAll(fixture, 'fetch-all-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Alpha');
    expect(rows[0].textContent).toContain('✓');
    expect(rows[1].textContent).toContain('Beta');
    expect(rows[1].textContent).toContain('…');
  });

  it('marks a failed repository distinctly', async () => {
    const fixture = await setup({
      progress: { done: 2, total: 2 },
      repos: REPOS,
      status: { a: 'success', b: 'failed' },
    });

    const rows = queryAll(fixture, 'fetch-all-row');
    expect(rows[1].textContent).toContain('✕');
    expect(rows[1].querySelector('.st-fetch-all__icon--failed')).not.toBeNull();
  });

  it('surfaces the last failure', async () => {
    const fixture = await setup({
      repos: REPOS,
      status: { a: 'failed' },
      error: { code: 'FETCH_FAILED', message: 'network down' },
    });

    expect(query(fixture, 'fetch-all-error')?.textContent).toContain('network down');
  });

  it('emits dismissed when the dismiss control is used', async () => {
    const fixture = await setup({ repos: REPOS });
    let dismissed = 0;
    fixture.componentInstance.dismissed.subscribe(() => dismissed++);

    query<HTMLButtonElement>(fixture, 'fetch-all-dismiss')!.click();

    expect(dismissed).toBe(1);
  });

  it('defaults an unknown repository status to pending', async () => {
    const fixture = await setup({ repos: [{ repoId: 'x', name: 'X' }] });
    const instance = fixture.componentInstance;

    expect(instance.stateOf('x')).toBe('pending');
    expect(instance.iconOf('x')).toBe('…');
    expect(instance.labelOf('x')).toBe('Pending');
    expect(instance.labelOf('a')).toBe('Pending');
  });

  it('labels success and failure states', async () => {
    const fixture = await setup({ status: { a: 'success', b: 'failed' } });
    const instance = fixture.componentInstance;

    expect(instance.labelOf('a')).toBe('Done');
    expect(instance.labelOf('b')).toBe('Failed');
    expect(instance.iconOf('a')).toBe('✓');
    expect(instance.iconOf('b')).toBe('✕');
  });
});
