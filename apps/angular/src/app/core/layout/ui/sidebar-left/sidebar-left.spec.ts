import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppError } from '@core/services/ipc-bridge.service';
import { SidebarLeft } from './sidebar-left';

interface SetupOptions {
  branches?: string[];
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
});
