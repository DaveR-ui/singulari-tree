import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MergeResponse } from '@contracts/gitcore';
import { MergeConflictBanner } from './merge-conflict-banner';

function render(conflict: MergeResponse | null) {
  const fixture = TestBed.createComponent(MergeConflictBanner);
  fixture.componentRef.setInput('conflict', conflict);
  fixture.detectChanges();
  return fixture;
}

function query(fixture: ReturnType<typeof render>, testId: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  );
}

describe('MergeConflictBanner', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('renders nothing without a conflict', () => {
    expect(query(render(null), 'merge-conflict-banner')).toBeNull();
    expect(query(render({ hasConflict: false, oid: '' }), 'merge-conflict-banner')).toBeNull();
  });

  it('explains how to resolve a conflicted merge', () => {
    const fixture = render({ hasConflict: true, oid: 'abc' });
    expect(query(fixture, 'merge-conflict-message')?.textContent).toContain('Resolve them');
  });

  it('emits dismiss when closed', () => {
    const fixture = render({ hasConflict: true, oid: 'abc' });
    let dismissed = 0;
    fixture.componentInstance.dismiss.subscribe(() => (dismissed += 1));

    query(fixture, 'merge-conflict-dismiss')?.click();

    expect(dismissed).toBe(1);
  });
});
