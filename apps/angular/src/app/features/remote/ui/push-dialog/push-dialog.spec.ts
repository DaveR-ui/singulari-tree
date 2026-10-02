import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type PushIntent,
  type PushRowView,
  type RemoteBranchOption,
  type RemoteOption,
} from '../../remote-models';
import { PushDialog } from './push-dialog';

const REMOTES: RemoteOption[] = [
  { name: 'origin', url: 'git@example.com:org/repo.git' },
  { name: 'upstream', url: 'https://example.com/up/repo.git' },
];

const ROWS: PushRowView[] = [
  { localBranch: 'main', isCurrent: true, upstream: 'refs/remotes/origin/main', defaultRemoteBranch: 'main' },
  { localBranch: 'feature', isCurrent: false, upstream: '', defaultRemoteBranch: 'feature' },
];

const REMOTE_BRANCHES: Record<string, RemoteBranchOption[]> = {
  origin: [{ name: 'develop', refName: 'refs/remotes/origin/develop', derivedFromUpstream: true }],
};

interface SetupOptions {
  open?: boolean;
  repoName?: string;
  remotes?: RemoteOption[];
  rows?: PushRowView[];
  remoteBranchesByRemote?: Record<string, RemoteBranchOption[]>;
  loading?: boolean;
  running?: boolean;
  offline?: boolean;
}

async function setup(opts: SetupOptions = {}): Promise<ComponentFixture<PushDialog>> {
  await TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();

  const fixture = TestBed.createComponent(PushDialog);
  const ref = fixture.componentRef;
  ref.setInput('open', opts.open ?? true);
  ref.setInput('repoName', opts.repoName ?? '');
  ref.setInput('remotes', opts.remotes ?? REMOTES);
  ref.setInput('rows', opts.rows ?? ROWS);
  ref.setInput('remoteBranchesByRemote', opts.remoteBranchesByRemote ?? REMOTE_BRANCHES);
  ref.setInput('loading', opts.loading ?? false);
  ref.setInput('running', opts.running ?? false);
  ref.setInput('progress', null);
  ref.setInput('error', null);
  ref.setInput('offline', opts.offline ?? false);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function query<T extends Element>(fixture: ComponentFixture<PushDialog>, testId: string): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${testId}"]`);
}

function queryAll<T extends Element>(
  fixture: ComponentFixture<PushDialog>,
  testId: string,
): T[] {
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<T>(`[data-testid="${testId}"]`),
  );
}

function setChecked(el: HTMLInputElement, checked: boolean, fixture: ComponentFixture<PushDialog>): void {
  el.checked = checked;
  el.dispatchEvent(new Event('change'));
  fixture.detectChanges();
}

describe('PushDialog', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders nothing while closed and shows the repo name in the title when open', async () => {
    const fixture = await setup({ open: false, repoName: 'my-repo' });
    expect(query(fixture, 'push-dialog')).toBeNull();

    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(query(fixture, 'push-dialog')).not.toBeNull();
    const title = query(fixture, 'modal-title')?.textContent ?? '';
    expect(title).toContain('Push');
    expect(title).toContain('my-repo');
  });

  it('renders one row per input row and shows the local branch', async () => {
    const fixture = await setup();

    expect(queryAll(fixture, 'push-row')).toHaveLength(2);
    expect(queryAll(fixture, 'push-row-local').map((el) => el.textContent?.trim())).toEqual([
      'main',
      'feature',
    ]);
  });

  it('checks and clears every row from the select-all control', async () => {
    const fixture = await setup();
    const selectAll = query<HTMLInputElement>(fixture, 'push-select-all')!;

    setChecked(selectAll, true, fixture);
    expect(queryAll<HTMLInputElement>(fixture, 'push-row-checkbox').every((el) => el.checked)).toBe(
      true,
    );

    setChecked(selectAll, false, fixture);
    expect(
      queryAll<HTMLInputElement>(fixture, 'push-row-checkbox').every((el) => !el.checked),
    ).toBe(true);
  });

  it('submits only the checked rows, forcing the local branch as the remote target', async () => {
    const fixture = await setup();
    const emitted: PushIntent[] = [];
    fixture.componentInstance.submitted.subscribe((intent) => emitted.push(intent));

    const checkboxes = queryAll<HTMLInputElement>(fixture, 'push-row-checkbox');
    setChecked(checkboxes[0], true, fixture);

    query<HTMLButtonElement>(fixture, 'push-submit')!.click();

    expect(emitted).toEqual([
      {
        remote: 'origin',
        branches: [{ localBranch: 'main', remoteBranch: 'main', track: false }],
      },
    ]);
  });

  it('disables the deferred controls and shows their badges', async () => {
    const fixture = await setup();

    const remote = query<HTMLSelectElement>(fixture, 'push-row-remote-select')!;
    expect(remote.disabled).toBe(true);
    expect(remote.getAttribute('aria-disabled')).toBe('true');
    expect(remote.getAttribute('title')).toContain('refspec');
    expect(remote.value).toBe('main');
    expect(query(fixture, 'push-row-remote-deferred')?.textContent).toContain('Deferred');
    expect(query(fixture, 'push-row-remote-deferred')?.getAttribute('title')).toContain('refspec');

    const track = query<HTMLInputElement>(fixture, 'push-row-track')!;
    expect(track.disabled).toBe(true);
    expect(track.getAttribute('aria-disabled')).toBe('true');
    expect(query(fixture, 'push-row-track-deferred')?.textContent).toContain('Deferred');
    expect(query(fixture, 'push-row-track-deferred')?.getAttribute('title')).toContain('upstream');

    const tags = query<HTMLInputElement>(fixture, 'push-option-tags')!;
    expect(tags.disabled).toBe(true);
    expect(query(fixture, 'push-option-tags-deferred')?.textContent).toContain('Deferred');
    expect(query(fixture, 'push-option-tags-deferred')?.getAttribute('title')).toContain('tags');

    const force = query<HTMLInputElement>(fixture, 'push-option-force')!;
    expect(force.disabled).toBe(true);
    expect(query(fixture, 'push-option-force-deferred')?.textContent).toContain('Deferred');
    expect(query(fixture, 'push-option-force-deferred')?.getAttribute('title')).toContain('force');
  });

  it('emits closed when cancel is clicked', async () => {
    const fixture = await setup();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);

    query<HTMLButtonElement>(fixture, 'push-cancel')!.click();

    expect(closed).toBe(1);
  });
});
