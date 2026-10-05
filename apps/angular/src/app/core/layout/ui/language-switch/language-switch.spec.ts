import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Language } from '@core/i18n/language';
import { LanguageSwitch } from './language-switch';

async function setup(language: Language = 'en'): Promise<ComponentFixture<LanguageSwitch>> {
  await TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();

  const fixture = TestBed.createComponent(LanguageSwitch);
  fixture.componentRef.setInput('language', language);
  fixture.detectChanges();
  return fixture;
}

function button(
  fixture: ComponentFixture<LanguageSwitch>,
  testId: string,
): HTMLButtonElement {
  const el = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    `[data-testid="${testId}"]`,
  );
  if (!el) throw new Error(`missing button ${testId}`);
  return el;
}

describe('LanguageSwitch', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the EN and ES options with the active language pressed', async () => {
    const fixture = await setup('es');

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="language-switch"]'),
    ).not.toBeNull();
    expect(button(fixture, 'language-en').textContent).toContain('EN');
    expect(button(fixture, 'language-es').textContent).toContain('ES');
    expect(button(fixture, 'language-en').getAttribute('aria-pressed')).toBe('false');
    expect(button(fixture, 'language-es').getAttribute('aria-pressed')).toBe('true');
  });

  it('emits the requested language on click', async () => {
    const fixture = await setup('en');
    const emitted: Language[] = [];
    fixture.componentInstance.languageChange.subscribe((language) => emitted.push(language));

    button(fixture, 'language-es').click();
    button(fixture, 'language-en').click();

    expect(emitted).toEqual(['es', 'en']);
  });
});
