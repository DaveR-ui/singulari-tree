import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { Language } from '@core/i18n/language';
import { LanguageService } from '@core/services/language.service';
import { ThemeService, type Theme } from '@core/services/theme.service';

/**
 * Settings feature page. Hosts the in-app theme and language controls that used
 * to live in the (removed) shell menubar. Selection writes through the root
 * `ThemeService` / `LanguageService`; the language service reloads the renderer
 * because `$localize` cannot re-translate without a full boot.
 */
@Component({
  selector: 'st-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="st-settings" data-testid="settings">
      <h1 class="st-settings__title" i18n>Settings</h1>

      <div class="st-settings__group">
        <span class="st-settings__label" id="settings-theme-label" i18n>Theme</span>
        <div
          class="st-toggle"
          role="group"
          aria-labelledby="settings-theme-label"
          data-testid="settings-theme"
        >
          <button
            class="st-toggle__btn"
            type="button"
            data-testid="settings-theme-dark"
            [class.st-toggle__btn--active]="themeService.theme() === 'dark'"
            [attr.aria-pressed]="themeService.theme() === 'dark'"
            (click)="pickTheme('dark')"
          >
            <i>◐</i><span i18n>Dark</span>
          </button>
          <button
            class="st-toggle__btn"
            type="button"
            data-testid="settings-theme-light"
            [class.st-toggle__btn--active]="themeService.theme() === 'light'"
            [attr.aria-pressed]="themeService.theme() === 'light'"
            (click)="pickTheme('light')"
          >
            <i>☀</i><span i18n>Light</span>
          </button>
        </div>
      </div>

      <div class="st-settings__group">
        <span class="st-settings__label" id="settings-language-label" i18n>Language</span>
        <div
          class="st-toggle"
          role="group"
          aria-labelledby="settings-language-label"
          data-testid="settings-language"
        >
          <button
            class="st-toggle__btn"
            type="button"
            data-testid="settings-language-en"
            [class.st-toggle__btn--active]="languageService.language() === 'en'"
            [attr.aria-pressed]="languageService.language() === 'en'"
            (click)="pickLanguage('en')"
          >
            EN
          </button>
          <button
            class="st-toggle__btn"
            type="button"
            data-testid="settings-language-es"
            [class.st-toggle__btn--active]="languageService.language() === 'es'"
            [attr.aria-pressed]="languageService.language() === 'es'"
            (click)="pickLanguage('es')"
          >
            ES
          </button>
        </div>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      padding: 16px;
      color: var(--st-color-text);
    }

    .st-settings {
      max-width: 520px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .st-settings__title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .st-settings__group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .st-settings__label {
      font-size: 12px;
      font-weight: 600;
      color: var(--st-color-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .st-toggle {
      display: inline-flex;
      align-items: center;
      align-self: flex-start;
      border: 1px solid var(--st-color-border);
      border-radius: 6px;
      overflow: hidden;
    }

    .st-toggle__btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: transparent;
      border: none;
      color: var(--st-color-muted);
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 12px;
      line-height: 1;
    }

    .st-toggle__btn i {
      font-style: normal;
      font-size: 14px;
      line-height: 1;
    }

    .st-toggle__btn:hover {
      color: var(--st-color-text);
      background: rgba(255, 255, 255, 0.07);
    }

    .st-toggle__btn--active {
      color: var(--st-color-accent);
      background: var(--st-color-accent-soft);
    }
  `,
})
export class Settings {
  readonly themeService = inject(ThemeService);
  readonly languageService = inject(LanguageService);

  /** Apply the requested theme (persisted by `ThemeService`). */
  pickTheme(theme: Theme): void {
    this.themeService.setTheme(theme);
  }

  /** Select the requested language (persists, then reloads via `LanguageService`). */
  pickLanguage(language: Language): void {
    this.languageService.setLanguage(language);
  }
}
