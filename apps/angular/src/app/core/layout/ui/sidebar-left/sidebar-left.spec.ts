import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Stash } from '@contracts/domain';
import type { AppError } from '@core/services/ipc-bridge.service';
import { SidebarLeft } from './sidebar-left';

interface SetupOptions {
  branches?: string[];
  currentBranch?: string;
  currentBranchBehind?: number;
  remoteBranches?: string[];
  tags?: string[];
  remotes?: string[];
  stashes?: Stash[];
  stashesLoading?: boolean;
  stashesError?: AppError | null;
  stashOpRunning?: boolean;
  loading?: boolean;
  offline?: boolean;
  error?: AppError | null;
}

function stash(index: number, message = `WIP ${index}`, branchName = 'main'): Stash {
  return { index, oid: undefined, message, branchName };
}

async function setup(opts: SetupOptions = {}): Promise<ComponentFixture<SidebarLeft>> {
  await TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();

  const fixture = TestBed.createComponent(SidebarLeft);
  const ref = fixture.componentRef;
  ref.setInput('branches', opts.branches ?? []);
  ref.setInput('currentBranch', opts.currentBranch ?? '');
  ref.setInput('currentBranchBehind', opts.currentBranchBehind ?? 0);
  ref.setInput('remoteBranches', opts.remoteBranches ?? []);
  ref.setInput('tags', opts.tags ?? []);
  ref.setInput('remotes', opts.remotes ?? []);
  ref.setInput('stashes', opts.stashes ?? []);
  ref.setInput('stashesLoading', opts.stashesLoading ?? false);
  ref.setInput('stashesError', opts.stashesError ?? null);
  ref.setInput('stashOpRunning', opts.stashOpRunning ?? false);
  ref.setInput('loading', opts.loading ?? false);
  ref.setInput('offline', opts.offline ?? false);
  ref.setInput('error', opts.error ?? null);
  fixture.detectChanges();
  return fixture;
}

function all(fixture: ComponentFixture<SidebarLeft>, testId: string): Element[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll(`[data-testid="${testId}"]`),
  );
}

function expandTags(fixture: ComponentFixture<SidebarLeft>): void {
  const el = fixture.nativeElement as HTMLElement;
  const head = Array.from(el.querySelectorAll<HTMLButtonElement>('.st-left__head')).find((b) =>
    b.textContent?.includes('TAGS'),
  );
  head!.click();
  fixture.detectChanges();
}

function expandStashes(fixture: ComponentFixture<SidebarLeft>): void {
  const el = fixture.nativeElement as HTMLElement;
  const head = Array.from(el.querySelectorAll<HTMLButtonElement>('.st-left__head')).find((b) =>
    b.textContent?.includes('STASHES'),
  );
  head!.click();
  fixture.detectChanges();
}

describe('SidebarLeft', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders populated branch/tag/remote lists', async () => {
    const fixture = await setup({
      branches: ['main', 'feature/x'],
      tags: ['v1.0.0'],
      remotes: ['origin'],
    });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="st-sidebar-branches"]')?.textContent).toContain('main');
    expect(el.querySelector('[data-testid="st-sidebar-branches"]')?.textContent).toContain(
      'feature/x',
    );
    expect(el.querySelector('[data-testid="st-sidebar-remotes"]')?.textContent).toContain('origin');

    expandTags(fixture);
    expect(el.querySelector('[data-testid="st-sidebar-tags"]')?.textContent).toContain('v1.0.0');
  });

  it('renders remote branches under their remote, stripping the prefix', async () => {
    const fixture = await setup({
      remotes: ['origin', 'upstream'],
      remoteBranches: ['origin/main', 'origin/david/topic', 'upstream/develop'],
    });
    const el = fixture.nativeElement as HTMLElement;

    const remotesText = el.querySelector('[data-testid="st-sidebar-remotes"]')?.textContent ?? '';
    expect(remotesText).toContain('origin');
    expect(remotesText).toContain('upstream');

    const items = Array.from(
      el.querySelectorAll('[data-testid="st-sidebar-remote-branches"]'),
    ).map((li) => li.textContent?.trim());
    expect(items).toEqual(['main', 'david/topic', 'develop']);
  });

  it('surfaces a remote branch even when no remote config is known', async () => {
    const fixture = await setup({ remoteBranches: ['origin/feature'] });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="st-sidebar-remotes-empty"]')).toBeNull();
    const items = Array.from(
      el.querySelectorAll('[data-testid="st-sidebar-remote-branches"]'),
    ).map((li) => li.textContent?.trim());
    expect(items).toEqual(['feature']);
  });

  it('badges the current branch row with the pull-pending count when behind', async () => {
    const fixture = await setup({
      branches: ['main', 'feature/x'],
      currentBranch: 'main',
      currentBranchBehind: 3,
    });
    const el = fixture.nativeElement as HTMLElement;

    const badges = el.querySelectorAll('[data-testid="st-sidebar-branch-badge"]');
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent?.trim()).toBe('3');

    const rows = Array.from(el.querySelectorAll('[data-testid="st-sidebar-branches"] li'));
    expect(rows[0].textContent).toContain('main');
    expect(rows[0].querySelector('[data-testid="st-sidebar-branch-badge"]')).not.toBeNull();
    expect(rows[1].querySelector('[data-testid="st-sidebar-branch-badge"]')).toBeNull();
  });

  it('renders no badge when the current branch is not behind', async () => {
    const fixture = await setup({
      branches: ['main', 'feature/x'],
      currentBranch: 'main',
      currentBranchBehind: 0,
    });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('[data-testid="st-sidebar-branch-badge"]')).toHaveLength(0);
  });

  it('renders no badge for non-current branches even when behind', async () => {
    const fixture = await setup({
      branches: ['main', 'feature/x'],
      currentBranch: 'main',
      currentBranchBehind: 2,
    });
    const el = fixture.nativeElement as HTMLElement;

    const rows = Array.from(el.querySelectorAll('[data-testid="st-sidebar-branches"] li'));
    // Only the current branch row (`main`) can carry the badge.
    expect(rows[1].querySelector('[data-testid="st-sidebar-branch-badge"]')).toBeNull();
  });

  it('renders the empty state when there are no refs', async () => {
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="st-sidebar-branches-empty"]')?.textContent).toContain(
      'No branches',
    );
    expect(el.querySelector('[data-testid="st-sidebar-remotes-empty"]')?.textContent).toContain(
      'No remotes',
    );

    expandTags(fixture);
    expect(el.querySelector('[data-testid="st-sidebar-tags-empty"]')?.textContent).toContain(
      'No tags',
    );
  });

  it('renders a loading state for every expanded section', async () => {
    const fixture = await setup({ loading: true });

    // BRANCHES and REMOTES are expanded by default.
    expect(all(fixture, 'st-sidebar-refs-loading')).toHaveLength(2);

    expandTags(fixture);
    expect(all(fixture, 'st-sidebar-refs-loading')).toHaveLength(3);
  });

  it('renders an offline state for every expanded section', async () => {
    const fixture = await setup({ offline: true });

    expect(all(fixture, 'st-sidebar-refs-offline')).toHaveLength(2);

    expandTags(fixture);
    expect(all(fixture, 'st-sidebar-refs-offline')).toHaveLength(3);
    expect(all(fixture, 'st-sidebar-refs-loading')).toHaveLength(0);
  });

  it('surfaces an error message for every expanded section', async () => {
    const fixture = await setup({ error: { code: 'EPERM', message: 'boom' } });

    expect(all(fixture, 'st-sidebar-refs-error')).toHaveLength(2);
    expect(all(fixture, 'st-sidebar-refs-error')[0].textContent).toContain('boom');

    expandTags(fixture);
    expect(all(fixture, 'st-sidebar-refs-error')).toHaveLength(3);
  });

  it('emits branchSelected when a local branch row is double-clicked', async () => {
    const fixture = await setup({ branches: ['main', 'feature/x'] });
    const emitted: string[] = [];
    fixture.componentInstance.branchSelected.subscribe((name) => emitted.push(name));

    const rows = all(fixture, 'st-sidebar-branch') as HTMLElement[];
    expect(rows).toHaveLength(2);
    rows[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(emitted).toEqual(['feature/x']);
  });

  it('marks local branch rows as keyboard-activatable buttons', async () => {
    const fixture = await setup({ branches: ['main'] });
    const emitted: string[] = [];
    fixture.componentInstance.branchSelected.subscribe((name) => emitted.push(name));

    const row = all(fixture, 'st-sidebar-branch')[0] as HTMLElement;
    expect(row.getAttribute('role')).toBe('button');
    expect(row.getAttribute('tabindex')).toBe('0');

    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    row.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(emitted).toEqual(['main', 'main']);
  });

  it('emits remoteBranchSelected with the reconstructed remote/branch name', async () => {
    const fixture = await setup({
      remotes: ['origin', 'upstream'],
      remoteBranches: ['origin/main', 'origin/david/topic', 'upstream/develop'],
    });
    const emitted: string[] = [];
    fixture.componentInstance.remoteBranchSelected.subscribe((name) => emitted.push(name));

    const rows = all(fixture, 'st-sidebar-remote-branches') as HTMLElement[];
    expect(rows).toHaveLength(3);
    rows[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    rows[2].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(emitted).toEqual(['origin/main', 'upstream/develop']);
  });

  it('activates a remote branch row with the keyboard', async () => {
    const fixture = await setup({ remotes: ['origin'], remoteBranches: ['origin/feature'] });
    const emitted: string[] = [];
    fixture.componentInstance.remoteBranchSelected.subscribe((name) => emitted.push(name));

    const row = all(fixture, 'st-sidebar-remote-branches')[0] as HTMLElement;
    expect(row.getAttribute('role')).toBe('button');
    row.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(emitted).toEqual(['origin/feature']);
  });

  it('emits nothing on a single click for local or remote branch rows', async () => {
    const fixture = await setup({
      branches: ['main', 'feature/x'],
      remotes: ['origin'],
      remoteBranches: ['origin/feature'],
    });
    const localEmitted: string[] = [];
    const remoteEmitted: string[] = [];
    fixture.componentInstance.branchSelected.subscribe((name) => localEmitted.push(name));
    fixture.componentInstance.remoteBranchSelected.subscribe((name) => remoteEmitted.push(name));

    const localRows = all(fixture, 'st-sidebar-branch') as HTMLElement[];
    const remoteRows = all(fixture, 'st-sidebar-remote-branches') as HTMLElement[];
    localRows[1].click();
    remoteRows[0].click();

    expect(localEmitted).toEqual([]);
    expect(remoteEmitted).toEqual([]);
  });

  it('emits newBranchRequested and newTagRequested from the header "+" buttons', async () => {
    const fixture = await setup({ branches: ['main'], tags: ['v1'] });
    let newBranch = 0;
    let newTag = 0;
    fixture.componentInstance.newBranchRequested.subscribe(() => (newBranch += 1));
    fixture.componentInstance.newTagRequested.subscribe(() => (newTag += 1));

    (all(fixture, 'st-sidebar-add-branch')[0] as HTMLElement).click();
    (all(fixture, 'st-sidebar-add-tag')[0] as HTMLElement).click();

    expect(newBranch).toBe(1);
    expect(newTag).toBe(1);
  });

  it('opens a branch row menu and emits the chosen action', async () => {
    const fixture = await setup({ branches: ['main', 'feature/x'] });
    const el = fixture.nativeElement as HTMLElement;
    const checkout: string[] = [];
    const rename: string[] = [];
    const merge: string[] = [];
    const del: string[] = [];
    fixture.componentInstance.branchSelected.subscribe((v) => checkout.push(v));
    fixture.componentInstance.branchRenameRequested.subscribe((v) => rename.push(v));
    fixture.componentInstance.branchMergeRequested.subscribe((v) => merge.push(v));
    fixture.componentInstance.branchDeleteRequested.subscribe((v) => del.push(v));

    expect(el.querySelector('[data-testid="st-sidebar-row-menu"]')).toBeNull();

    const rows = all(fixture, 'st-sidebar-branch') as HTMLElement[];
    rows[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="st-sidebar-row-menu"]')).not.toBeNull();

    (el.querySelector('[data-testid="st-sidebar-menu-checkout"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(checkout).toEqual(['feature/x']);
    expect(el.querySelector('[data-testid="st-sidebar-row-menu"]')).toBeNull();

    rows[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    (el.querySelector('[data-testid="st-sidebar-menu-rename"]') as HTMLElement).click();
    expect(rename).toEqual(['feature/x']);

    rows[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    (el.querySelector('[data-testid="st-sidebar-menu-merge"]') as HTMLElement).click();
    expect(merge).toEqual(['feature/x']);

    rows[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    (el.querySelector('[data-testid="st-sidebar-menu-delete"]') as HTMLElement).click();
    expect(del).toEqual(['feature/x']);
  });

  it('opens a tag row menu that only offers deletion', async () => {
    const fixture = await setup({ tags: ['v1.0.0'] });
    const el = fixture.nativeElement as HTMLElement;
    const del: string[] = [];
    fixture.componentInstance.tagDeleteRequested.subscribe((v) => del.push(v));
    expandTags(fixture);

    const tag = all(fixture, 'st-sidebar-tag')[0] as HTMLElement;
    tag.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="st-sidebar-menu-checkout"]')).toBeNull();
    expect(el.querySelector('[data-testid="st-sidebar-menu-rename"]')).toBeNull();
    expect(el.querySelector('[data-testid="st-sidebar-menu-delete"]')).not.toBeNull();

    (el.querySelector('[data-testid="st-sidebar-menu-delete"]') as HTMLElement).click();

    expect(del).toEqual(['v1.0.0']);
  });

  it('closes the row menu on a backdrop click', async () => {
    const fixture = await setup({ branches: ['main'] });
    const el = fixture.nativeElement as HTMLElement;
    const row = all(fixture, 'st-sidebar-branch')[0] as HTMLElement;

    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="st-sidebar-row-menu"]')).not.toBeNull();

    (el.querySelector('[data-testid="st-sidebar-menu-backdrop"]') as HTMLElement).click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="st-sidebar-row-menu"]')).toBeNull();
  });

  it('closes the row menu on a backdrop context-menu gesture', async () => {
    const fixture = await setup({ branches: ['main'] });
    const el = fixture.nativeElement as HTMLElement;
    const row = all(fixture, 'st-sidebar-branch')[0] as HTMLElement;

    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    const backdrop = el.querySelector('[data-testid="st-sidebar-menu-backdrop"]') as HTMLElement;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    backdrop.dispatchEvent(event);
    fixture.detectChanges();

    expect(event.defaultPrevented).toBe(true);
    expect(el.querySelector('[data-testid="st-sidebar-row-menu"]')).toBeNull();
  });

  // -- stashes (ADR-028) ---------------------------------------------------

  it('renders populated stash rows with label, branch and actions', async () => {
    const fixture = await setup({
      stashes: [stash(0, 'WIP on main', 'main'), stash(1, '', 'feature/x')],
    });
    expandStashes(fixture);
    const el = fixture.nativeElement as HTMLElement;

    const rows = all(fixture, 'st-sidebar-stash');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('WIP on main');
    expect(rows[0].textContent).toContain('main');
    // Empty message falls back to the Git-style stash label.
    expect(rows[1].textContent).toContain('stash@{1}');
    expect(rows[1].textContent).toContain('feature/x');

    expect(el.querySelectorAll('[data-testid="st-sidebar-stash-apply"]')).toHaveLength(2);
    expect(el.querySelectorAll('[data-testid="st-sidebar-stash-pop"]')).toHaveLength(2);
    expect(el.querySelectorAll('[data-testid="st-sidebar-stash-drop"]')).toHaveLength(2);
  });

  it('renders the stash empty state', async () => {
    const fixture = await setup();
    expandStashes(fixture);
    expect(
      fixture.nativeElement.querySelector('[data-testid="st-sidebar-stashes-empty"]')?.textContent,
    ).toContain('No stashes');
  });

  it('renders the stash loading state', async () => {
    const fixture = await setup({ stashesLoading: true });
    expandStashes(fixture);
    expect(
      fixture.nativeElement.querySelector('[data-testid="st-sidebar-stashes-loading"]'),
    ).not.toBeNull();
  });

  it('renders the stash offline state', async () => {
    const fixture = await setup({ offline: true });
    expandStashes(fixture);
    expect(
      fixture.nativeElement.querySelector('[data-testid="st-sidebar-stashes-offline"]'),
    ).not.toBeNull();
  });

  it('renders the stash error state', async () => {
    const fixture = await setup({ stashesError: { code: 'GIT_FAILED', message: 'boom' } });
    expandStashes(fixture);
    expect(
      fixture.nativeElement.querySelector('[data-testid="st-sidebar-stashes-error"]')?.textContent,
    ).toContain('boom');
  });

  it('emits stashPushRequested from the STASHES header "+"', async () => {
    const fixture = await setup();
    let push = 0;
    fixture.componentInstance.stashPushRequested.subscribe(() => (push += 1));

    (all(fixture, 'st-sidebar-stash-push')[0] as HTMLElement).click();

    expect(push).toBe(1);
  });

  it('emits the stash entry for apply, pop and drop', async () => {
    const fixture = await setup({ stashes: [stash(0, 'one'), stash(1, 'two')] });
    const applied: Stash[] = [];
    const popped: Stash[] = [];
    const dropped: Stash[] = [];
    fixture.componentInstance.stashApplyRequested.subscribe((v) => applied.push(v));
    fixture.componentInstance.stashPopRequested.subscribe((v) => popped.push(v));
    fixture.componentInstance.stashDropRequested.subscribe((v) => dropped.push(v));
    expandStashes(fixture);

    (all(fixture, 'st-sidebar-stash-apply')[1] as HTMLElement).click();
    (all(fixture, 'st-sidebar-stash-pop')[0] as HTMLElement).click();
    (all(fixture, 'st-sidebar-stash-drop')[1] as HTMLElement).click();

    expect(applied.map((s) => s.index)).toEqual([1]);
    expect(popped.map((s) => s.index)).toEqual([0]);
    expect(dropped.map((s) => s.index)).toEqual([1]);
  });

  it('disables the stash actions while a stash op is running', async () => {
    const fixture = await setup({ stashes: [stash(0)], stashOpRunning: true });
    expandStashes(fixture);

    for (const testId of ['st-sidebar-stash-apply', 'st-sidebar-stash-pop', 'st-sidebar-stash-drop']) {
      expect((all(fixture, testId)[0] as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('emits gitFlowRequested from the GIT FLOW header', async () => {
    const fixture = await setup();
    let requested = 0;
    fixture.componentInstance.gitFlowRequested.subscribe(() => (requested += 1));

    (all(fixture, 'st-sidebar-git-flow')[0] as HTMLElement).click();

    expect(requested).toBe(1);
  });
});
