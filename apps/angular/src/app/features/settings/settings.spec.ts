import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LANGUAGE_STORAGE_KEY } from '@core/i18n/language';
import { LanguageService, PAGE_RELOAD } from '@core/services/language.service';
import { ThemeService } from '@core/services/theme.service';
import { Settings } from './settings';

/** jsdom does not copy `window.localStorage` onto `globalThis`; install a spyable one. */
class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

function query<T extends Element>(
  fixture: ComponentFixture<Settings>,
  testId: string,
): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${testId}"]`);
}

function button(fixture: ComponentFixture<Settings>, testId: string): HTMLButtonElement {
  const el = query<HTMLButtonElement>(fixture, testId);
  if (!el) throw new Error(`missing button ${testId}`);
  return el;
}

function setup() {
  const reload = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: PAGE_RELOAD, useValue: reload },
    ],
  });

  const themeService = TestBed.inject(ThemeService);
  const languageService = TestBed.inject(LanguageService);
  const setTheme = vi.spyOn(themeService, 'setTheme');
  const setLanguage = vi.spyOn(languageService, 'setLanguage');

  const fixture = TestBed.createComponent(Settings);
  fixture.detectChanges();
  return { fixture, themeService, languageService, setTheme, setLanguage, reload };
}

describe('Settings', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.documentElement.removeAttribute('data-theme');
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it('renders the theme and language selectors', () => {
    const { fixture } = setup();

    expect(query(fixture, 'settings')).not.toBeNull();
    expect(query(fixture, 'settings-theme')).not.toBeNull();
    expect(query(fixture, 'settings-language')).not.toBeNull();
    expect(button(fixture, 'settings-theme-dark').textContent).toContain('Dark');
    expect(button(fixture, 'settings-theme-light').textContent).toContain('Light');
    expect(button(fixture, 'settings-language-en').textContent).toContain('EN');
    expect(button(fixture, 'settings-language-es').textContent).toContain('ES');
  });

  it('reflects the persisted theme and language as active', () => {
    localStorage.setItem('st:theme', 'light');
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'es');

    const { fixture } = setup();

    expect(button(fixture, 'settings-theme-light').getAttribute('aria-pressed')).toBe('true');
    expect(button(fixture, 'settings-theme-dark').getAttribute('aria-pressed')).toBe('false');
    expect(button(fixture, 'settings-language-es').getAttribute('aria-pressed')).toBe('true');
    expect(button(fixture, 'settings-language-en').getAttribute('aria-pressed')).toBe('false');
  });

  it('applies the selected theme through ThemeService', () => {
    const { fixture, themeService, setTheme } = setup();

    button(fixture, 'settings-theme-light').click();
    TestBed.tick();

    expect(setTheme).toHaveBeenCalledWith('light');
    expect(themeService.theme()).toBe('light');
    expect(button(fixture, 'settings-theme-light').getAttribute('aria-pressed')).toBe('true');
  });

  it('selects the requested language through LanguageService', () => {
    const { fixture, languageService, setLanguage, reload } = setup();

    button(fixture, 'settings-language-es').click();

    expect(setLanguage).toHaveBeenCalledWith('es');
    expect(languageService.language()).toBe('es');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when the active language is selected again', () => {
    const { fixture, setLanguage, reload } = setup();

    button(fixture, 'settings-language-en').click();

    expect(setLanguage).toHaveBeenCalledWith('en');
    expect(reload).not.toHaveBeenCalled();
  });
});
