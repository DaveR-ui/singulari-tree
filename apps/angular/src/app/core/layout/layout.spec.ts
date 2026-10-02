import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repository } from '@contracts/domain';
import type { AppError } from '@core/services/ipc-bridge.service';
import { RepoState } from '@core/services/repo-state.service';
import { RemoteOpsStore } from '@features/remote/remote-ops.store';
import type {
  PushRowView,
  RemoteBranchOption,
  RemoteDialogKind,
  RemoteOpProgress,
  RemoteOption,
} from '@features/remote/remote-models';
import { LayoutComponent } from './layout';

@Component({
  selector: 'st-spec-stub-page',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class StubPageComponent {}

/**
 * The vitest jsdom environment exposes `window.localStorage` but does not copy
 * it onto `globalThis`, which the shell reads as a bare global. Install a small
 * in-memory implementation so persistence can be asserted deterministically.
 */
class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

function makeRepository(index: number): Repository {
  const name = `local-${index}`;
  return {
    id: `repo-${index}`,
    fsPath: `/tmp/${name}`,
    commonDir: `/tmp/${name}/.git`,
    name,
    createdAt: '2026-01-02T10:00:00Z',
    lastOpenedAt: '2026-01-02T10:00:00Z',
  };
}

interface StubRepoStateOptions {
  repos?: Repository[];
  activeId?: string | null;
  branches?: string[];
  tags?: string[];
  remotes?: string[];
  refsLoading?: boolean;
  refsError?: AppError | null;
  refsOffline?: boolean;
  reposLoading?: boolean;
  reposError?: AppError | null;
  reposOffline?: boolean;
}

function makeRepoState(opts: StubRepoStateOptions = {}) {
  const repos = signal<Repository[]>(opts.repos ?? []);
  const activeId = signal<string | null>(opts.activeId ?? null);
  return {
    repos,
    activeId,
    activeRepo: computed<Repository | null>(() => {
      const id = activeId();
      return id ? (repos().find((r) => r.id === id) ?? null) : null;
    }),
    reposLoading: signal(opts.reposLoading ?? false),
    reposError: signal<AppError | null>(opts.reposError ?? null),
    reposOffline: signal(opts.reposOffline ?? false),
    branches: signal<string[]>(opts.branches ?? []),
    tags: signal<string[]>(opts.tags ?? []),
    remotes: signal<string[]>(opts.remotes ?? []),
    refsLoading: signal(opts.refsLoading ?? false),
    refsError: signal<AppError | null>(opts.refsError ?? null),
    refsOffline: signal(opts.refsOffline ?? false),
    loadRepositories: vi.fn(async () => {}),
    setActive: vi.fn(),
    loadRefs: vi.fn(async () => {}),
  };
}

interface StubRemoteOpsOptions {
  activeDialog?: RemoteDialogKind | null;
  remoteOptions?: RemoteOption[];
  localBranchNames?: string[];
  currentBranch?: string;
  pushRows?: PushRowView[];
}

/**
 * Minimal `RemoteOpsStore` stand-in exposing only the members the shell
 * template reads. Every method is a spy so the toolbar wiring can be asserted
 * without crossing the IPC bridge.
 */
function makeRemoteOps(opts: StubRemoteOpsOptions = {}) {
  return {
    activeDialog: signal<RemoteDialogKind | null>(opts.activeDialog ?? null),
    remoteOptions: signal<RemoteOption[]>(opts.remoteOptions ?? []),
    remoteBranchesByRemote: signal<Record<string, RemoteBranchOption[]>>({}),
    localBranchNames: signal<string[]>(opts.localBranchNames ?? []),
    currentBranch: signal(opts.currentBranch ?? ''),
    pushRows: signal<PushRowView[]>(opts.pushRows ?? []),
    refsLoading: signal(false),
    offline: signal(false),
    running: signal(false),
    progress: signal<RemoteOpProgress | null>(null),
    opError: signal<AppError | null>(null),
    refsError: signal<AppError | null>(null),
    openDialog: vi.fn(),
    closeDialog: vi.fn(),
    loadRefs: vi.fn(async () => {}),
    runPull: vi.fn(async () => {}),
    runPush: vi.fn(async () => {}),
    runFetch: vi.fn(async () => {}),
  };
}

async function setup(
  repoStateOpts: StubRepoStateOptions = {},
  remoteOpsOpts: StubRemoteOpsOptions = {},
) {
  const repoState = makeRepoState(repoStateOpts);
  const remoteOps = makeRemoteOps(remoteOpsOpts);
  await TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: '**', component: StubPageComponent }]),
      { provide: RepoState, useValue: repoState },
      { provide: RemoteOpsStore, useValue: remoteOps },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(LayoutComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, repoState, remoteOps };
}

function text(fixture: { nativeElement: unknown }): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function query<T extends Element>(fixture: { nativeElement: unknown }, testId: string): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${testId}"]`);
}

describe('LayoutComponent', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('renders no hardcoded mock data', async () => {
    const { fixture } = await setup();

    const rendered = text(fixture);
    for (const mock of [
      'DFCustomerPortal_SPA_AIR.X',
      'feature/layout-shell',
      'v0.1.0',
      'david',
      'origin/main',
    ]) {
      expect(rendered).not.toContain(mock);
    }
  });

  it('shows the local empty state when there are no repositories', async () => {
    const { fixture } = await setup({ repos: [] });

    expect(query(fixture, 'repo-drawer-no-repos')).not.toBeNull();
    expect(query(fixture, 'repo-drawer-no-repos')?.textContent).toContain('No repositories');
  });

  it('renders a repo card per local repository', async () => {
    const { fixture } = await setup({ repos: [makeRepository(1), makeRepository(2)] });

    expect(query(fixture, 'repo-drawer-list')).not.toBeNull();
    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="repo-card"]',
    );
    expect(cards.length).toBe(2);
  });

  it('loads the local repositories on init', async () => {
    const { repoState } = await setup();

    expect(repoState.loadRepositories).toHaveBeenCalledTimes(1);
  });

  it('activates the matching repository when a repo card is clicked', async () => {
    const repo = makeRepository(1);
    const { fixture, repoState } = await setup({ repos: [repo] });
    const card = query<HTMLElement>(fixture, 'repo-card');

    card!.click();

    expect(repoState.setActive).toHaveBeenCalledTimes(1);
    expect(repoState.setActive).toHaveBeenCalledWith(repo);
  });

  it('persists the right-collapsed state to localStorage', async () => {
    const { fixture } = await setup();

    expect(localStorage.getItem('st:rightCollapsed')).toBe('false');

    fixture.componentInstance.toggleRight();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(localStorage.getItem('st:rightCollapsed')).toBe('true');
  });

  it('restores an in-range persisted right width', async () => {
    localStorage.setItem('st:rightWidth', '400');

    const { fixture } = await setup();

    expect(fixture.componentInstance.rightWidth()).toBe(400);
  });

  it('rejects an out-of-range persisted right width', async () => {
    localStorage.setItem('st:rightWidth', '9999');

    const { fixture } = await setup();

    expect(fixture.componentInstance.rightWidth()).toBe(320);
  });

  it('controls the sidebar workspace selection through the parent signal', async () => {
    const { fixture } = await setup();
    const el = fixture.nativeElement as HTMLElement;

    const items = el.querySelectorAll<HTMLElement>('.st-left__item');
    expect(items.length).toBeGreaterThanOrEqual(3);
    items[2].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.activeWorkspace()).toBe('search');
    expect(items[2].classList.contains('st-left__item--active')).toBe(true);
  });

  it('no longer renders the removed drawer pin/menu controls', async () => {
    const { fixture } = await setup({ repos: [makeRepository(1)] });
    const el = fixture.nativeElement as HTMLElement;
    const drawer = el.querySelector<HTMLElement>('[data-testid="repo-drawer"]');
    expect(drawer).not.toBeNull();

    const buttons = Array.from(drawer!.querySelectorAll<HTMLButtonElement>('.st-right__head button'));
    expect(buttons.some((b) => b.textContent?.includes('☰'))).toBe(false);
    expect(buttons.some((b) => (b.getAttribute('title') ?? '').includes('Pin'))).toBe(false);
    expect(buttons.some((b) => b.hasAttribute('aria-pressed'))).toBe(false);
    // The close control is preserved.
    expect(buttons.some((b) => b.getAttribute('title') === 'Close')).toBe(true);
  });

  it('renders the real branch/remote names supplied by RepoState', async () => {
    const { fixture } = await setup({ branches: ['main', 'feature/x'], remotes: ['origin'] });
    const el = fixture.nativeElement as HTMLElement;

    const branches = el.querySelector('[data-testid="st-sidebar-branches"]');
    expect(branches?.textContent).toContain('main');
    expect(branches?.textContent).toContain('feature/x');
    expect(el.querySelector('[data-testid="st-sidebar-remotes"]')?.textContent).toContain('origin');
    expect(el.querySelector('[data-testid="st-sidebar-branches-empty"]')).toBeNull();
  });

  it('renders a real tag name once the TAGS section is expanded', async () => {
    const { fixture } = await setup({ tags: ['v0.1.0'] });
    const el = fixture.nativeElement as HTMLElement;

    const tagsHead = Array.from(el.querySelectorAll<HTMLButtonElement>('.st-left__head')).find((b) =>
      b.textContent?.includes('TAGS'),
    );
    expect(tagsHead).toBeDefined();
    tagsHead!.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="st-sidebar-tags"]')?.textContent).toContain('v0.1.0');
  });

  it('shows the "No branches" empty state when RepoState has no refs', async () => {
    const { fixture } = await setup();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="st-sidebar-branches-empty"]')?.textContent).toContain(
      'No branches',
    );
  });

  it('disables the remote-op toolbar buttons when no repository is active', async () => {
    const { fixture } = await setup({ activeId: null });

    for (const testId of ['toolbar-pull', 'toolbar-push', 'toolbar-fetch']) {
      expect(query<HTMLButtonElement>(fixture, testId)?.disabled).toBe(true);
    }
  });

  it('enables the remote-op toolbar buttons when a repository is active', async () => {
    const { fixture } = await setup({ activeId: 'repo-1' });

    for (const testId of ['toolbar-pull', 'toolbar-push', 'toolbar-fetch']) {
      expect(query<HTMLButtonElement>(fixture, testId)?.disabled).toBe(false);
    }
  });

  it('opens the pull dialog from the toolbar', async () => {
    const { fixture, remoteOps } = await setup({ activeId: 'repo-1' });

    query<HTMLButtonElement>(fixture, 'toolbar-pull')!.click();

    expect(remoteOps.openDialog).toHaveBeenCalledTimes(1);
    expect(remoteOps.openDialog).toHaveBeenCalledWith('pull');
  });

  it('opens the push dialog from the toolbar', async () => {
    const { fixture, remoteOps } = await setup({ activeId: 'repo-1' });

    query<HTMLButtonElement>(fixture, 'toolbar-push')!.click();

    expect(remoteOps.openDialog).toHaveBeenCalledTimes(1);
    expect(remoteOps.openDialog).toHaveBeenCalledWith('push');
  });

  it('opens the fetch dialog from the toolbar', async () => {
    const { fixture, remoteOps } = await setup({ activeId: 'repo-1' });

    query<HTMLButtonElement>(fixture, 'toolbar-fetch')!.click();

    expect(remoteOps.openDialog).toHaveBeenCalledTimes(1);
    expect(remoteOps.openDialog).toHaveBeenCalledWith('fetch');
  });

  it('renders the fetch dialog only while the store has fetch active', async () => {
    const { fixture, remoteOps } = await setup({ activeId: 'repo-1' });

    expect(query(fixture, 'fetch-dialog')).toBeNull();

    remoteOps.activeDialog.set('fetch');
    fixture.detectChanges();

    expect(query(fixture, 'fetch-dialog')).not.toBeNull();
    expect(query(fixture, 'pull-dialog')).toBeNull();
    expect(query(fixture, 'push-dialog')).toBeNull();
  });

  it('renders the pull dialog only while the store has pull active', async () => {
    const { fixture, remoteOps } = await setup({ activeId: 'repo-1' });

    expect(query(fixture, 'pull-dialog')).toBeNull();

    remoteOps.activeDialog.set('pull');
    fixture.detectChanges();

    expect(query(fixture, 'pull-dialog')).not.toBeNull();
    expect(query(fixture, 'fetch-dialog')).toBeNull();
    expect(query(fixture, 'push-dialog')).toBeNull();
  });

  it('routes the pull dialog submit to the store', async () => {
    const { fixture, remoteOps } = await setup(
      { activeId: 'repo-1' },
      {
        activeDialog: 'pull',
        remoteOptions: [{ name: 'origin', url: 'git@example.com:org/repo.git' }],
        localBranchNames: ['main', 'feature'],
        currentBranch: 'main',
      },
    );

    query<HTMLButtonElement>(fixture, 'pull-submit')!.click();
    fixture.detectChanges();

    expect(remoteOps.runPull).toHaveBeenCalledTimes(1);
    expect(remoteOps.runPull).toHaveBeenCalledWith({
      remote: 'origin',
      branch: 'main',
      intoLocalBranch: 'main',
    });
  });

  it('routes the push dialog submit to the store', async () => {
    const { fixture, remoteOps } = await setup(
      { activeId: 'repo-1' },
      {
        activeDialog: 'push',
        remoteOptions: [{ name: 'origin', url: 'git@example.com:org/repo.git' }],
        pushRows: [
          {
            localBranch: 'main',
            isCurrent: true,
            upstream: 'refs/remotes/origin/main',
            defaultRemoteBranch: 'main',
          },
        ],
      },
    );

    const checkbox = query<HTMLInputElement>(fixture, 'push-row-checkbox')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    query<HTMLButtonElement>(fixture, 'push-submit')!.click();
    fixture.detectChanges();

    expect(remoteOps.runPush).toHaveBeenCalledTimes(1);
    expect(remoteOps.runPush).toHaveBeenCalledWith({
      remote: 'origin',
      branches: [{ localBranch: 'main', remoteBranch: 'main', track: false }],
    });
  });

  it('routes the fetch dialog submit to the store', async () => {
    const { fixture, remoteOps } = await setup(
      { activeId: 'repo-1' },
      {
        activeDialog: 'fetch',
        remoteOptions: [{ name: 'origin', url: 'git@example.com:org/repo.git' }],
      },
    );

    query<HTMLButtonElement>(fixture, 'fetch-submit')!.click();
    fixture.detectChanges();

    expect(remoteOps.runFetch).toHaveBeenCalledTimes(1);
    expect(remoteOps.runFetch).toHaveBeenCalledWith({
      allRemotes: true,
      remote: 'origin',
      prune: false,
    });
  });
});
