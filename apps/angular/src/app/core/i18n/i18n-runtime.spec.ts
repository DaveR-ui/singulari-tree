import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { clearTranslations, loadTranslations, ɵcomputeMsgId } from '@angular/localize';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

@Component({
  selector: 'st-i18n-probe',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <span i18n>Localized probe</span> `,
})
class I18nProbe {}

@Component({
  selector: 'st-i18n-fallback-probe',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <span i18n>Untranslated probe</span> `,
})
class I18nFallbackProbe {}

/**
 * Proves the binding decision behind this slice: with a single English build in
 * runtime `$localize` mode, calling `loadTranslations` before component creation
 * replaces template `i18n` messages without rebuilding per locale.
 */
describe('runtime i18n', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    // `$localize` state is process-wide under the vitest unit-test builder; never
    // leak the probe translation into other spec files.
    clearTranslations();
  });

  it('translates template i18n messages loaded at runtime', async () => {
    const id = ɵcomputeMsgId('Localized probe');
    loadTranslations({ [id]: 'Sonda localizada' });

    await TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fixture = TestBed.createComponent(I18nProbe);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sonda localizada');
  });

  it('falls back to the source message when no translation is loaded', async () => {
    await TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fixture = TestBed.createComponent(I18nFallbackProbe);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Untranslated probe');
  });
});
