import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppError } from '@core/services/ipc-bridge.service';
import { SidebarLeft } from './sidebar-left';

interface SetupOptions {
  branches?: string[];
  currentBranch?: string;
  currentBranchBehind?: number;
  remoteBranches?: string[];
  tags?: string[];
  remotes?: string[];
  loading?: boolean;
  offline?: boolean;
  error?: AppError | null;
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

  it('emits branchSelected when a local branch row is clicked', async () => {
    const fixture = await setup({ branches: ['main', 'feature/x'] });
    const emitted: string[] = [];
    fixture.componentInstance.branchSelected.subscribe((name) => emitted.push(name));

    const rows = all(fixture, 'st-sidebar-branch') as HTMLElement[];
    expect(rows).toHaveLength(2);
    rows[1].click();

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
    rows[0].click();
    rows[2].click();

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
});
