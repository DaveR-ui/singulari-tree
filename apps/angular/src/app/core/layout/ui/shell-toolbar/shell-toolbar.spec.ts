import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShellToolbar } from './shell-toolbar';

async function setup(hasActiveRepo = true): Promise<ComponentFixture<ShellToolbar>> {
  await TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter([])],
  }).compileComponents();

  const fixture = TestBed.createComponent(ShellToolbar);
  fixture.componentRef.setInput('hasActiveRepo', hasActiveRepo);
  fixture.detectChanges();
  return fixture;
}

function button(fixture: ComponentFixture<ShellToolbar>, testId: string): HTMLButtonElement {
  const el = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    `[data-testid="${testId}"]`,
  );
  if (!el) throw new Error(`missing button ${testId}`);
  return el;
}

describe('ShellToolbar', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('emits pullRequested, pushRequested and fetchRequested on click', async () => {
    const fixture = await setup(true);
    const emitted: string[] = [];
    fixture.componentInstance.pullRequested.subscribe(() => emitted.push('pull'));
    fixture.componentInstance.pushRequested.subscribe(() => emitted.push('push'));
    fixture.componentInstance.fetchRequested.subscribe(() => emitted.push('fetch'));

    button(fixture, 'toolbar-pull').click();
    button(fixture, 'toolbar-push').click();
    button(fixture, 'toolbar-fetch').click();

    expect(emitted).toEqual(['pull', 'push', 'fetch']);
  });

  it('disables the remote buttons when hasActiveRepo is false', async () => {
    const fixture = await setup(false);

    expect(button(fixture, 'toolbar-pull').disabled).toBe(true);
    expect(button(fixture, 'toolbar-push').disabled).toBe(true);
    expect(button(fixture, 'toolbar-fetch').disabled).toBe(true);
  });

  it('badges Pull with the pull-pending count when greater than zero', async () => {
    const fixture = await setup(true);
    fixture.componentRef.setInput('pullPending', 4);
    fixture.detectChanges();

    const badge = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="toolbar-pull-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent?.trim()).toBe('4');
  });

  it('renders no Pull badge when pullPending is zero', async () => {
    const fixture = await setup(true);
    fixture.componentRef.setInput('pullPending', 0);
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="toolbar-pull-badge"]'),
    ).toBeNull();
  });

  it('enables the remote buttons and keeps outputs bound when hasActiveRepo is true', async () => {
    const fixture = await setup(true);
    let pull = 0;
    fixture.componentInstance.pullRequested.subscribe(() => pull++);

    expect(button(fixture, 'toolbar-pull').disabled).toBe(false);
    button(fixture, 'toolbar-pull').click();

    expect(pull).toBe(1);
  });

  it('emits fetchAllRequested when enabled', async () => {
    const fixture = await setup(true);
    fixture.componentRef.setInput('canFetchAll', true);
    fixture.detectChanges();
    let count = 0;
    fixture.componentInstance.fetchAllRequested.subscribe(() => count++);

    button(fixture, 'toolbar-fetch-all').click();

    expect(count).toBe(1);
  });

  it('disables "Fetch all" when no repository tab is open', async () => {
    const fixture = await setup(true);

    expect(button(fixture, 'toolbar-fetch-all').disabled).toBe(true);
  });

  it('routes the settings entry to /settings', async () => {
    const fixture = await setup(true);
    const router = TestBed.inject(Router);

    const settings = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="toolbar-settings"]',
    );
    expect(settings).not.toBeNull();
    expect(settings!.getAttribute('aria-label')).toBe('Settings');
    expect(settings!.getAttribute('title')).toBe('Settings');

    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    settings!.click();

    expect(navigate).toHaveBeenCalled();
    expect(navigate.mock.calls[0]?.[0]?.toString()).toBe('/settings');
  });

  it('emits cloneFromClipboardRequested and copyRepoUrlRequested on click', async () => {
    const fixture = await setup(true);
    const emitted: string[] = [];
    fixture.componentInstance.cloneFromClipboardRequested.subscribe(() => emitted.push('clone'));
    fixture.componentInstance.copyRepoUrlRequested.subscribe(() => emitted.push('copy'));

    button(fixture, 'toolbar-clone-clipboard').click();
    button(fixture, 'toolbar-copy-repo-url').click();

    expect(emitted).toEqual(['clone', 'copy']);
  });

  it('disables Copy repo URL but keeps Clone from clipboard enabled without an active repo', async () => {
    const fixture = await setup(false);

    expect(button(fixture, 'toolbar-copy-repo-url').disabled).toBe(true);
    expect(button(fixture, 'toolbar-clone-clipboard').disabled).toBe(false);
  });
});
