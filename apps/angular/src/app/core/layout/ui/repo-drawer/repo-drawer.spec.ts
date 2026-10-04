import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { RepoCardView } from '@singularitree/ui-kit';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppError } from '@core/services/ipc-bridge.service';
import { RepoDrawer } from './repo-drawer';

const REPO_A: RepoCardView = { id: 'repo-a', name: 'alpha', subtitle: '/tmp/a' };
const REPO_B: RepoCardView = { id: 'repo-b', name: 'beta', subtitle: '/tmp/b' };

interface SetupOptions {
  repos?: RepoCardView[];
  selectedId?: string | null;
  removingId?: string | null;
  loading?: boolean;
  offline?: boolean;
  error?: AppError | null;
}

async function setup(opts: SetupOptions = {}): Promise<ComponentFixture<RepoDrawer>> {
  await TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();

  const fixture = TestBed.createComponent(RepoDrawer);
  const ref = fixture.componentRef;
  ref.setInput('repos', opts.repos ?? []);
  ref.setInput('selectedId', opts.selectedId ?? null);
  ref.setInput('removingId', opts.removingId ?? null);
  ref.setInput('loading', opts.loading ?? false);
  ref.setInput('offline', opts.offline ?? false);
  ref.setInput('error', opts.error ?? null);
  fixture.detectChanges();
  return fixture;
}

function cards(fixture: ComponentFixture<RepoDrawer>): HTMLElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[data-testid="repo-card"]'),
  );
}

function removeButtons(fixture: ComponentFixture<RepoDrawer>): HTMLButtonElement[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      '[data-testid="repo-drawer-remove"]',
    ),
  );
}

function query<T extends Element>(fixture: ComponentFixture<RepoDrawer>, testId: string): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${testId}"]`);
}

function typeSearch(fixture: ComponentFixture<RepoDrawer>, value: string): void {
  const input = query<HTMLInputElement>(fixture, 'repo-drawer-search')!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

describe('RepoDrawer', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('emits repoSelected with the clicked card id', async () => {
    const fixture = await setup({ repos: [REPO_A, REPO_B] });
    const emitted: string[] = [];
    fixture.componentInstance.repoSelected.subscribe((id) => emitted.push(id));

    cards(fixture)[1].click();

    expect(emitted).toEqual([REPO_B.id]);
  });

  it('emits repoSelected on Enter via the repo-card keyboard path', async () => {
    const fixture = await setup({ repos: [REPO_A] });
    const emitted: string[] = [];
    fixture.componentInstance.repoSelected.subscribe((id) => emitted.push(id));

    cards(fixture)[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(emitted).toEqual([REPO_A.id]);
  });

  it('reflects the selectedId input as the card highlight', async () => {
    const fixture = await setup({ repos: [REPO_A, REPO_B], selectedId: REPO_B.id });

    const [first, second] = cards(fixture);
    expect(first.classList.contains('st-repo-card--selected')).toBe(false);
    expect(second.classList.contains('st-repo-card--selected')).toBe(true);
  });

  it('renders the local empty state when there are no repos', async () => {
    const fixture = await setup({ repos: [] });

    expect(query(fixture, 'repo-drawer-no-repos')).not.toBeNull();
    expect(query(fixture, 'repo-drawer-no-repos')?.textContent).toContain('No repositories');
  });

  it('renders the no-matches state when the search yields nothing', async () => {
    const fixture = await setup({ repos: [REPO_A, REPO_B] });

    typeSearch(fixture, 'zzz');

    expect(query(fixture, 'repo-drawer-no-matches')).not.toBeNull();
    expect(cards(fixture)).toHaveLength(0);
  });

  it('renders the offline state when offline is true', async () => {
    const fixture = await setup({ offline: true });

    expect(query(fixture, 'repo-drawer-offline')).not.toBeNull();
  });

  it('emits addRequested when the add button is clicked', async () => {
    const fixture = await setup({ repos: [] });
    let requested = 0;
    fixture.componentInstance.addRequested.subscribe(() => requested++);

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.st-right__add')!.click();

    expect(requested).toBe(1);
  });

  it('emits removeRequested with the id and not repoSelected', async () => {
    const fixture = await setup({ repos: [REPO_A, REPO_B] });
    const removed: string[] = [];
    const selected: string[] = [];
    fixture.componentInstance.removeRequested.subscribe((id) => removed.push(id));
    fixture.componentInstance.repoSelected.subscribe((id) => selected.push(id));

    removeButtons(fixture)[1].click();

    expect(removed).toEqual([REPO_B.id]);
    expect(selected).toEqual([]);
  });

  it('disables the remove button while its repository is being removed', async () => {
    const fixture = await setup({ repos: [REPO_A, REPO_B], removingId: REPO_A.id });

    const [first, second] = removeButtons(fixture);
    expect(first.disabled).toBe(true);
    expect(second.disabled).toBe(false);
  });
});
