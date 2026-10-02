import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
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

  it('enables the remote buttons and keeps outputs bound when hasActiveRepo is true', async () => {
    const fixture = await setup(true);
    let pull = 0;
    fixture.componentInstance.pullRequested.subscribe(() => pull++);

    expect(button(fixture, 'toolbar-pull').disabled).toBe(false);
    button(fixture, 'toolbar-pull').click();

    expect(pull).toBe(1);
  });
});
