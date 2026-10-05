import { inject, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withEnabledBlockingInitialNavigation } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { LanguageService } from './core/services/language.service';
import { ThemeService } from './core/services/theme.service';
import { routes } from './app.routes';

/**
 * Application-start initializer: instantiate the root theme/language services so
 * a persisted `light` theme is applied to `data-theme` and the stored language
 * is resolved immediately, before the user opens Settings.
 *
 * Exported as a named function so the initializer's effect on persistence can be
 * covered directly by a boot-level spec.
 */
export function initializeThemeAndLanguage(): void {
  inject(ThemeService);
  inject(LanguageService);
}

export const appConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding(), withEnabledBlockingInitialNavigation()),
    provideHttpClient(withFetch()),
    provideAppInitializer(initializeThemeAndLanguage),
  ],
};
