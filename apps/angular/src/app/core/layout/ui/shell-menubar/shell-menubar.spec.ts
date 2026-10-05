import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Language } from '@core/i18n/language';
import { ShellMenubar } from './shell-menubar';

type Theme = 'dark' | 'light';

async function setup(
  theme: Theme = 'dark',
  language: Language = 'en',
): Promise<ComponentFixture<ShellMenubar>> {
  await TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();

  const fixture = TestBed.createComponent(ShellMenubar);
  fixture.componentRef.setInput('theme', theme);
  fixture.componentRef.setInput('language', language);
  fixture.detectChanges();
  return fixture;
}

function button(
  fixture: ComponentFixture<ShellMenubar>,
  testId: string,
): HTMLButtonElement {
  const el = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    `[data-testid="${testId}"]`,
  );
  if (!el) throw new Error(`missing button ${testId}`);
  return el;
}

describe('ShellMenubar', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('emits themeToggle when the theme button is clicked', async () => {
    const fixture = await setup('dark');
    let toggles = 0;
    fixture.componentInstance.themeToggle.subscribe(() => toggles++);

    button(fixture, 'theme-toggle').click();

    expect(toggles).toBe(1);
  });

  it('reflects the theme in the button aria-label and icon', async () => {
    const dark = await setup('dark');
    const darkBtn = button(dark, 'theme-toggle');
    expect(darkBtn.getAttribute('aria-label')).toBe('Switch to light theme');
    expect(darkBtn.textContent).toContain('☀');

    TestBed.resetTestingModule();
    const light = await setup('light');
    const lightBtn = button(light, 'theme-toggle');
    expect(lightBtn.getAttribute('aria-label')).toBe('Switch to dark theme');
    expect(lightBtn.textContent).toContain('🌙');
  });

  it('still emits the sidebar toggles', async () => {
    const fixture = await setup('dark');
    const emitted: string[] = [];
    fixture.componentInstance.toggleLeft.subscribe(() => emitted.push('left'));
    fixture.componentInstance.toggleRight.subscribe(() => emitted.push('right'));

    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.st-icon-btn'),
    );
    buttons.find((b) => b.textContent?.includes('☰'))!.click();
    buttons.find((b) => b.textContent?.includes('◧'))!.click();

    expect(emitted).toEqual(['left', 'right']);
  });

  it('hosts the language switch and reflects the active language', async () => {
    const fixture = await setup('dark', 'es');
    const es = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="language-es"]',
    );

    expect(es).not.toBeNull();
    expect(es!.getAttribute('aria-pressed')).toBe('true');
  });

  it('forwards languageChange from the language switch', async () => {
    const fixture = await setup('dark', 'en');
    const emitted: Language[] = [];
    fixture.componentInstance.languageChange.subscribe((language) => emitted.push(language));

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="language-es"]')!
      .click();

    expect(emitted).toEqual(['es']);
  });
});
