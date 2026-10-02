import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppError } from '@core/services/ipc-bridge.service';
import type { PullIntent, RemoteBranchOption, RemoteOption } from '../../remote-models';
import { PullDialog } from './pull-dialog';

const REMOTES: RemoteOption[] = [
  { name: 'origin', url: 'https://example.com/origin.git' },
  { name: 'upstream', url: 'https://example.com/upstream.git' },
];

const BRANCHES_BY_REMOTE: Record<string, RemoteBranchOption[]> = {
  origin: [
    { name: 'main', refName: 'refs/remotes/origin/main', derivedFromUpstream: true },
    { name: 'feature', refName: 'refs/remotes/origin/feature', derivedFromUpstream: true },
  ],
  upstream: [
    { name: 'develop', refName: 'refs/remotes/upstream/develop', derivedFromUpstream: true },
  ],
};

const LOCAL_BRANCHES = ['main', 'feature'];
const CURRENT_BRANCH = 'feature';

interface SetupOptions {
  open?: boolean;
  remotes?: RemoteOption[];
  remoteBranchesByRemote?: Record<string, RemoteBranchOption[]>;
  localBranchNames?: string[];
  currentBranch?: string;
  loading?: boolean;
  running?: boolean;
  error?: AppError | null;
  offline?: boolean;
}

async function setup(opts: SetupOptions = {}): Promise<ComponentFixture<PullDialog>> {
  await TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();

  const fixture = TestBed.createComponent(PullDialog);
  const ref = fixture.componentRef;
  ref.setInput('open', opts.open ?? false);
  ref.setInput('remotes', opts.remotes ?? []);
  ref.setInput('remoteBranchesByRemote', opts.remoteBranchesByRemote ?? {});
  ref.setInput('localBranchNames', opts.localBranchNames ?? []);
  ref.setInput('currentBranch', opts.currentBranch ?? '');
  ref.setInput('loading', opts.loading ?? false);
  ref.setInput('running', opts.running ?? false);
  ref.setInput('error', opts.error ?? null);
  ref.setInput('offline', opts.offline ?? false);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

function query<T extends Element>(fixture: ComponentFixture<PullDialog>, testId: string): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${testId}"]`);
}

function openFixture(): SetupOptions {
  return {
    open: true,
    remotes: REMOTES,
    remoteBranchesByRemote: BRANCHES_BY_REMOTE,
    localBranchNames: LOCAL_BRANCHES,
    currentBranch: CURRENT_BRANCH,
  };
}

describe('PullDialog', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('stays hidden while open is false', async () => {
    const fixture = await setup({ open: false });
    expect(query(fixture, 'modal')).toBeNull();
  });

  it('shows the Pull title when open', async () => {
    const fixture = await setup(openFixture());
    expect(query(fixture, 'modal')).not.toBeNull();
    expect(query(fixture, 'modal-title')?.textContent?.trim()).toBe('Pull');
  });

  it('renders the deferred local-branch control disabled with a deferred badge', async () => {
    const fixture = await setup(openFixture());

    const intoLocal = query<HTMLInputElement>(fixture, 'pull-into-local');
    expect(intoLocal).not.toBeNull();
    expect(intoLocal!.disabled).toBe(true);
    expect(intoLocal!.getAttribute('aria-disabled')).toBe('true');
    expect(query(fixture, 'pull-into-local-deferred')?.textContent).toContain('Deferred');
  });

  it('renders all four deferred options disabled with badges', async () => {
    const fixture = await setup(openFixture());

    const ids = [
      'pull-option-commit-merged',
      'pull-option-log',
      'pull-option-no-ff',
      'pull-option-rebase',
    ];
    for (const id of ids) {
      const checkbox = query<HTMLInputElement>(fixture, id);
      expect(checkbox).not.toBeNull();
      expect(checkbox!.disabled).toBe(true);
      expect(checkbox!.getAttribute('aria-disabled')).toBe('true');
      expect(checkbox!.title.length).toBeGreaterThan(0);
      expect(query(fixture, `${id}-deferred`)?.textContent).toContain('Deferred');
    }
  });

  it('emits the PullIntent with the default remote/branch selection', async () => {
    const fixture = await setup(openFixture());
    const intents: PullIntent[] = [];
    fixture.componentInstance.submitted.subscribe((intent) => intents.push(intent));

    query<HTMLButtonElement>(fixture, 'pull-submit')!.click();

    expect(intents).toEqual([
      { remote: 'origin', branch: 'feature', intoLocalBranch: CURRENT_BRANCH },
    ]);
  });

  it('re-derives the branch options when the remote changes', async () => {
    const fixture = await setup({ ...openFixture(), currentBranch: '' });
    const intents: PullIntent[] = [];
    fixture.componentInstance.submitted.subscribe((intent) => intents.push(intent));

    const remoteSelect = query<HTMLSelectElement>(fixture, 'pull-remote-select')!;
    remoteSelect.value = 'upstream';
    remoteSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(query<HTMLInputElement>(fixture, 'pull-remote-url')!.value).toBe(
      'https://example.com/upstream.git',
    );
    const branchSelect = query<HTMLSelectElement>(fixture, 'pull-branch-select')!;
    expect(Array.from(branchSelect.options).map((option) => option.value)).toEqual(['develop']);

    query<HTMLButtonElement>(fixture, 'pull-submit')!.click();

    expect(intents).toEqual([{ remote: 'upstream', branch: 'develop', intoLocalBranch: '' }]);
  });

  it('emits closed when Cancel is clicked', async () => {
    const fixture = await setup(openFixture());
    let closedCount = 0;
    fixture.componentInstance.closed.subscribe(() => closedCount++);

    query<HTMLButtonElement>(fixture, 'pull-cancel')!.click();

    expect(closedCount).toBe(1);
  });

  it('emits closed when the backdrop is clicked', async () => {
    const fixture = await setup(openFixture());
    let closedCount = 0;
    fixture.componentInstance.closed.subscribe(() => closedCount++);

    query<HTMLElement>(fixture, 'modal-backdrop')!.click();

    expect(closedCount).toBe(1);
  });

  it('emits closed on Escape', async () => {
    const fixture = await setup(openFixture());
    let closedCount = 0;
    fixture.componentInstance.closed.subscribe(() => closedCount++);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(closedCount).toBe(1);
  });

  it('emits refreshRequested when Refresh is clicked', async () => {
    const fixture = await setup(openFixture());
    let refreshCount = 0;
    fixture.componentInstance.refreshRequested.subscribe(() => refreshCount++);

    query<HTMLButtonElement>(fixture, 'pull-refresh')!.click();

    expect(refreshCount).toBe(1);
  });

  it('renders the error and offline banners', async () => {
    const error: AppError = { code: 'E_FAILURE', message: 'boom' };
    const fixture = await setup({ ...openFixture(), error, offline: true });

    expect(query(fixture, 'pull-error')?.textContent).toContain('boom');
    expect(query(fixture, 'pull-offline')?.textContent).toContain(
      'Git core offline — run inside the desktop app.',
    );
  });
});
