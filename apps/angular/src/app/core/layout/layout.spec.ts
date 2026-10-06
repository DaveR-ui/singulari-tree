import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repository } from '@contracts/domain';
import { IpcBridge, type AppError, type MenuNavigatePayload } from '@core/services/ipc-bridge.service';
import { RepoState } from '@core/services/repo-state.service';
import { GithubAccountStore } from '@features/github-account/github-account.store';
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
  currentBranch?: string;
  currentBranchBehind?: number;
  remoteBranches?: string[];
  tags?: string[];
  remotes?: string[];
  refsLoading?: boolean;
  refsError?: AppError | null;
  refsOffline?: boolean;
  reposLoading?: boolean;
  reposError?: AppError | null;
  reposOffline?: boolean;
  removingId?: string | null;
  checkoutRunning?: boolean;
  stashRunning?: boolean;
  checkoutError?: AppError | null;
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
    removingId: signal<string | null>(opts.removingId ?? null),
    branches: signal<string[]>(opts.branches ?? []),
    currentBranch: signal(opts.currentBranch ?? ''),
    currentBranchBehind: signal(opts.currentBranchBehind ?? 0),
    remoteBranches: signal<string[]>(opts.remoteBranches ?? []),
    tags: signal<string[]>(opts.tags ?? []),
    remotes: signal<string[]>(opts.remotes ?? []),
    refsLoading: signal(opts.refsLoading ?? false),
    refsError: signal<AppError | null>(opts.refsError ?? null),
    refsOffline: signal(opts.refsOffline ?? false),
    checkoutRunning: signal(opts.checkoutRunning ?? false),
    stashRunning: signal(opts.stashRunning ?? false),
    checkoutError: signal<AppError | null>(opts.checkoutError ?? null),
    loadRepositories: vi.fn(async () => {}),
    setActive: vi.fn(),
    loadRefs: vi.fn(async () => {}),
    removeRepository: vi.fn(async () => true),
    checkoutBranch: vi.fn(async () => {}),
    stashPush: vi.fn(async () => true),
    dismissCheckoutError: vi.fn(),
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

interface StubIpcBridge {
  onMenuNavigate: ReturnType<typeof vi.fn>;
  emitMenuNavigate: (payload: MenuNavigatePayload) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
}

/**
 * `IpcBridge` stand-in that captures the single native-menu listener so tests
 * can push `menu:navigate` payloads and assert the unsubscribe on destroy.
 */
function makeIpcBridge(): StubIpcBridge {
  let listener: ((payload: MenuNavigatePayload) => void) | null = null;
  const unsubscribe = vi.fn();
  const onMenuNavigate = vi.fn((cb: (payload: MenuNavigatePayload) => void) => {
    listener = cb;
    return unsubscribe;
  });
  return {
    onMenuNavigate,
    emitMenuNavigate: (payload) => listener?.(payload),
    unsubscribe,
  };
}

/** `GithubAccountStore` stand-in exposing only the startup auto-connect hook. */
function makeGithubAccount() {
  return { autoConnectOnce: vi.fn(async () => {}) };
}

async function setup(
  repoStateOpts: StubRepoStateOptions = {},
  remoteOpsOpts: StubRemoteOpsOptions = {},
) {
  const repoState = makeRepoState(repoStateOpts);
  const remoteOps = makeRemoteOps(remoteOpsOpts);
  const ipcBridge = makeIpcBridge();
  const githubAccount = makeGithubAccount();
  await TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: '**', component: StubPageComponent }]),
      { provide: RepoState, useValue: repoState },
      { provide: RemoteOpsStore, useValue: remoteOps },
      { provide: IpcBridge, useValue: ipcBridge },
      { provide: GithubAccountStore, useValue: githubAccount },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(LayoutComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, repoState, remoteOps, ipcBridge, githubAccount };
}

function text(fixture: { nativeElement: unknown }): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function query<T extends Element>(fixture: { nativeElement: unknown }, testId: string): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${testId}"]`);
}

function queryAll<T extends Element>(fixture: { nativeElement: unknown }, testId: string): T[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<T>(`[data-testid="${testId}"]`),
  );
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

  it('removes a repository from the drawer, clearing the active selection', async () => {
    const repo = makeRepository(1);
    const { fixture, repoState } = await setup({ repos: [repo], activeId: repo.id });

    query<HTMLButtonElement>(fixture, 'repo-drawer-remove')!.click();
    fixture.detectChanges();

    expect(repoState.removeRepository).toHaveBeenCalledTimes(1);
    expect(repoState.removeRepository).toHaveBeenCalledWith(repo.id);
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

  it('flows RepoState current branch/behind into the toolbar and sidebar badges', async () => {
    const { fixture } = await setup({
      branches: ['main', 'feature/x'],
      currentBranch: 'main',
      currentBranchBehind: 5,
    });
    const el = fixture.nativeElement as HTMLElement;

    const toolbarBadge = el.querySelector('[data-testid="toolbar-pull-badge"]');
    expect(toolbarBadge?.textContent?.trim()).toBe('5');

    const sidebarBadges = el.querySelectorAll('[data-testid="st-sidebar-branch-badge"]');
    expect(sidebarBadges).toHaveLength(1);
    expect(sidebarBadges[0].textContent?.trim()).toBe('5');
  });

  it('passes real remote branches into the sidebar REMOTES section', async () => {
    const { fixture } = await setup({
      remotes: ['origin'],
      remoteBranches: ['origin/david/topic'],
    });
    const el = fixture.nativeElement as HTMLElement;

    const items = Array.from(
      el.querySelectorAll('[data-testid="st-sidebar-remote-branches"]'),
    ).map((li) => li.textContent?.trim());
    expect(items).toEqual(['david/topic']);
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
      noCommit: false,
      log: false,
      noFf: false,
      rebase: false,
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
      tags: false,
      force: false,
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
      tags: false,
      force: false,
    });
  });

  it('does not render the retired in-app chrome controls', async () => {
    const { fixture } = await setup();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('st-shell-menubar')).toBeNull();
    expect(el.querySelector('[data-testid="theme-toggle"]')).toBeNull();
  });

  it('triggers the account auto-connect once at startup', async () => {
    const { githubAccount } = await setup();

    expect(githubAccount.autoConnectOnce).toHaveBeenCalledTimes(1);
  });

  it('navigates on a known native-menu route', async () => {
    const { fixture, ipcBridge } = await setup();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    ipcBridge.emitMenuNavigate({ route: '/github-account' });
    fixture.detectChanges();

    expect(ipcBridge.onMenuNavigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/github-account');
  });

  it('ignores empty and unknown native-menu routes', async () => {
    const { fixture, ipcBridge } = await setup();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    ipcBridge.emitMenuNavigate({ route: '' });
    ipcBridge.emitMenuNavigate({ route: '/nope' });
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('unsubscribes from the native-menu listener on destroy', async () => {
    const { fixture, ipcBridge } = await setup();

    fixture.destroy();

    expect(ipcBridge.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('opens the switch confirmation before any checkout on a local branch click', async () => {
    const { fixture, repoState } = await setup({ branches: ['main', 'feature/x'] });

    const row = queryAll<HTMLElement>(fixture, 'st-sidebar-branch').find(
      (el) => el.textContent?.trim() === 'feature/x',
    );
    expect(row).not.toBeNull();
    row!.click();
    fixture.detectChanges();

    expect(query(fixture, 'switch-branch-message')?.textContent?.trim()).toBe(
      "Are you sure you want to switch your working copy to a branch 'feature/x'?",
    );
    // The confirmation must precede the checkout: no IPC yet.
    expect(repoState.checkoutBranch).not.toHaveBeenCalled();
  });

  it('checks out a local branch only after confirming the switch dialog', async () => {
    const { fixture, repoState } = await setup({ branches: ['main', 'feature/x'] });

    clickBranch(fixture, 'feature/x');
    fixture.detectChanges();
    expect(repoState.checkoutBranch).not.toHaveBeenCalled();

    query<HTMLButtonElement>(fixture, 'switch-branch-confirm')!.click();

    expect(repoState.checkoutBranch).toHaveBeenCalledTimes(1);
    expect(repoState.checkoutBranch).toHaveBeenCalledWith('feature/x', false, false, false);
  });

  it('checks out the local branch with force=true when the switch checkbox is armed', async () => {
    const { fixture, repoState } = await setup({ branches: ['main', 'feature/x'] });

    clickBranch(fixture, 'feature/x');
    fixture.detectChanges();
    const checkbox = query<HTMLInputElement>(fixture, 'switch-branch-force-checkbox')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    query<HTMLButtonElement>(fixture, 'switch-branch-confirm')!.click();

    expect(repoState.checkoutBranch).toHaveBeenCalledWith('feature/x', false, true, false);
  });

  it('opens the switch confirmation before any checkout on a remote-tracking branch click', async () => {
    const { fixture, repoState } = await setup({
      remotes: ['origin'],
      remoteBranches: ['origin/david/topic'],
    });

    const row = query<HTMLElement>(fixture, 'st-sidebar-remote-branches');
    expect(row).not.toBeNull();
    row!.click();
    fixture.detectChanges();

    expect(query(fixture, 'switch-branch-message')?.textContent?.trim()).toBe(
      "Are you sure you want to switch your working copy to a branch 'origin/david/topic'?",
    );
    expect(repoState.checkoutBranch).not.toHaveBeenCalled();

    query<HTMLButtonElement>(fixture, 'switch-branch-confirm')!.click();

    expect(repoState.checkoutBranch).toHaveBeenCalledWith('origin/david/topic', true, false, false);
  });

  it('does not open the confirmation or checkout when the current local branch is clicked', async () => {
    const { fixture, repoState } = await setup({
      branches: ['main', 'feature/x'],
      currentBranch: 'main',
    });

    clickBranch(fixture, 'main');
    fixture.detectChanges();

    expect(query(fixture, 'switch-branch-message')).toBeNull();
    expect(repoState.checkoutBranch).not.toHaveBeenCalled();
  });

  it('cancels the pre-checkout confirmation without any IPC call', async () => {
    const { fixture, repoState } = await setup({ branches: ['main', 'feature/x'] });

    clickBranch(fixture, 'feature/x');
    fixture.detectChanges();

    query<HTMLButtonElement>(fixture, 'switch-branch-cancel')!.click();
    fixture.detectChanges();

    expect(repoState.checkoutBranch).not.toHaveBeenCalled();
    expect(query(fixture, 'switch-branch-message')).toBeNull();
  });

  it('cancelling a plain confirm prompt leaves a pre-existing checkout error untouched', async () => {
    const { fixture, repoState } = await setup({
      branches: ['main', 'feature/x'],
      checkoutError: {
        code: 'CHECKOUT_FAILED',
        message: 'Your local changes would be overwritten by checkout.',
        details: { reason: 'dirty_working_tree' },
      },
    });

    clickBranch(fixture, 'feature/x');
    fixture.detectChanges();
    expect(query(fixture, 'switch-branch-message')).not.toBeNull();

    query<HTMLButtonElement>(fixture, 'switch-branch-cancel')!.click();
    fixture.detectChanges();

    // No checkout was attempted, so `confirm` cancel is a true no-op: it must
    // not touch the unrelated checkout error and must issue no IPC.
    expect(repoState.checkoutBranch).not.toHaveBeenCalled();
    expect(repoState.stashPush).not.toHaveBeenCalled();
    expect(repoState.dismissCheckoutError).not.toHaveBeenCalled();
    expect(query(fixture, 'switch-branch-message')).toBeNull();
  });

  it('renders the checkout-error banner from RepoState and dismisses through the store', async () => {
    const { fixture, repoState } = await setup({
      checkoutError: {
        code: 'CHECKOUT_FAILED',
        message: 'Your local changes would be overwritten by checkout.',
        details: { reason: 'dirty_working_tree', paths: 'src/a.ts\nsrc/b.ts' },
      },
    });

    expect(query(fixture, 'checkout-error-message')?.textContent).toContain(
      'Your local changes would be overwritten by checkout.',
    );
    const paths = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid="checkout-error-path"]',
      ),
    ).map((el) => el.textContent?.trim());
    expect(paths).toEqual(['src/a.ts', 'src/b.ts']);

    query<HTMLButtonElement>(fixture, 'checkout-error-dismiss')!.click();

    expect(repoState.dismissCheckoutError).toHaveBeenCalledTimes(1);
  });

  it('does not render the checkout-error banner when RepoState has no error', async () => {
    const { fixture } = await setup();

    expect(query(fixture, 'checkout-error-banner')).toBeNull();
  });

  // -- attempt-then-prompt branch switch -----------------------------------

  /** Click the sidebar branch row whose visible label matches `name`. */
  function clickBranch(fixture: { nativeElement: unknown }, name: string): void {
    const row = queryAll<HTMLElement>(fixture, 'st-sidebar-branch').find(
      (el) => el.textContent?.trim() === name,
    );
    if (!row) throw new Error(`branch row '${name}' not found`);
    row.click();
  }

  async function openDirtyPrompt(
    fixture: {
      nativeElement: unknown;
      detectChanges: () => void;
      whenStable: () => Promise<void>;
    },
    repoState: ReturnType<typeof makeRepoState>,
    branchName = 'feature/x',
  ): Promise<void> {
    // Every switch now starts with the pre-checkout confirmation.
    clickBranch(fixture, branchName);
    fixture.detectChanges();
    query<HTMLButtonElement>(fixture, 'switch-branch-confirm')!.click();
    fixture.detectChanges();
    // The unforced checkout was blocked by the dirty tree.
    repoState.checkoutError.set({
      code: 'CHECKOUT_FAILED',
      message: 'Your local changes would be overwritten by checkout.',
      details: { reason: 'dirty_working_tree' },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('keeps the dirty dialog open while the checkout operation is running', async () => {
    const { fixture, repoState } = await setup({ branches: ['main', 'feature/x'] });
    await openDirtyPrompt(fixture, repoState);
    expect(query(fixture, 'switch-branch-hint')).not.toBeNull();

    // A retry starts by nulling `checkoutError` while the checkout is still in
    // flight; the dialog must not flicker away before it settles.
    repoState.checkoutRunning.set(true);
    repoState.checkoutError.set(null);
    fixture.detectChanges();

    expect(query(fixture, 'switch-branch-message')).not.toBeNull();
    expect(query(fixture, 'switch-branch-hint')).not.toBeNull();

    // Once the operation settles the effect closes it.
    repoState.checkoutRunning.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(query(fixture, 'switch-branch-message')).toBeNull();
  });

  it('falls through to the dirty dialog when the unforced switch is blocked', async () => {
    const { fixture, repoState } = await setup({ branches: ['main', 'feature/x'] });

    await openDirtyPrompt(fixture, repoState);

    // The confirm dialog was replaced by the dirty escalation, not left open.
    expect(query(fixture, 'switch-branch-message')?.textContent?.trim()).toBe(
      "Are you sure you want to switch your working copy to a branch 'feature/x'?",
    );
    expect(query(fixture, 'switch-branch-hint')).not.toBeNull();
    expect(query<HTMLInputElement>(fixture, 'switch-branch-force-checkbox')?.checked).toBe(false);
    // The banner must not duplicate the error while the dialog owns it.
    expect(query(fixture, 'checkout-error-banner')).toBeNull();
  });

  it('routes the Force checkout action with force=true and no untracked clean', async () => {
    const { fixture, repoState } = await setup({ branches: ['main', 'feature/x'] });
    await openDirtyPrompt(fixture, repoState);

    const checkbox = query<HTMLInputElement>(fixture, 'switch-branch-force-checkbox')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    query<HTMLButtonElement>(fixture, 'switch-branch-force')!.click();

    expect(repoState.checkoutBranch).toHaveBeenCalledWith('feature/x', false, true, false);
  });

  it('routes Save changes through stashPush then the plain checkout', async () => {
    const { fixture, repoState } = await setup({ branches: ['main', 'feature/x'] });
    await openDirtyPrompt(fixture, repoState);

    query<HTMLButtonElement>(fixture, 'switch-branch-save')!.click();
    await vi.waitFor(() =>
      expect(repoState.checkoutBranch).toHaveBeenCalledWith('feature/x', false, false, false),
    );

    expect(repoState.stashPush).toHaveBeenCalledWith(
      "Auto-stash before switching to 'feature/x'",
    );
  });

  it('does not retry the checkout when stashing fails', async () => {
    const { fixture, repoState } = await setup({ branches: ['main', 'feature/x'] });
    repoState.stashPush.mockResolvedValue(false);
    await openDirtyPrompt(fixture, repoState);
    // The initial blocked attempt already called checkoutBranch; only assert on retries.
    repoState.checkoutBranch.mockClear();

    query<HTMLButtonElement>(fixture, 'switch-branch-save')!.click();
    await vi.waitFor(() => expect(repoState.stashPush).toHaveBeenCalledTimes(1));

    expect(repoState.checkoutBranch).not.toHaveBeenCalled();
  });

  it('dismisses the dialog through the store on Cancel', async () => {
    const { fixture, repoState } = await setup({ branches: ['main', 'feature/x'] });
    await openDirtyPrompt(fixture, repoState);

    query<HTMLButtonElement>(fixture, 'switch-branch-cancel')!.click();
    fixture.detectChanges();

    expect(repoState.dismissCheckoutError).toHaveBeenCalledTimes(1);
    expect(query(fixture, 'switch-branch-message')).toBeNull();
  });

  it('escalates to the untracked warning and cleans untracked files on confirm', async () => {
    const { fixture, repoState } = await setup({ branches: ['main', 'feature/x'] });
    await openDirtyPrompt(fixture, repoState);

    repoState.checkoutError.set({
      code: 'CHECKOUT_FAILED',
      message: 'The following untracked working tree files would be overwritten by checkout.',
      details: { reason: 'untracked_working_tree' },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(query(fixture, 'switch-branch-warning')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'All untracked files and folders will be permanently deleted. Ignored files are kept.',
    );
    expect(query(fixture, 'switch-branch-force-checkbox')).toBeNull();

    query<HTMLButtonElement>(fixture, 'switch-branch-force')!.click();

    expect(repoState.checkoutBranch).toHaveBeenCalledWith('feature/x', false, true, true);
  });

  it('keeps the fallback banner for a non-dirty checkout failure', async () => {
    const { fixture, repoState } = await setup({ branches: ['main', 'feature/x'] });

    clickBranch(fixture, 'feature/x');
    fixture.detectChanges();
    // Confirm the pre-checkout dialog, then the checkout fails for a non-dirty reason.
    query<HTMLButtonElement>(fixture, 'switch-branch-confirm')!.click();
    fixture.detectChanges();
    repoState.checkoutError.set({
      code: 'CHECKOUT_FAILED',
      message: 'reference is not a tree',
      details: { reason: 'git_error' },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(query(fixture, 'switch-branch-message')).toBeNull();
    expect(query(fixture, 'checkout-error-banner')).not.toBeNull();
  });
});
