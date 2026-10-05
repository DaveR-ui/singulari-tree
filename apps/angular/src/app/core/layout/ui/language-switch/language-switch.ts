import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { Language } from '@core/i18n/language';

/**
 * Dumb EN/ES language switch. The active language is supplied by the parent and
 * clicks bubble the requested language up; the component never mutates state.
 */
@Component({
  selector: 'st-language-switch',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="st-lang"
      role="group"
      aria-label="Language"
      i18n-aria-label
      data-testid="language-switch"
    >
      <button
        class="st-lang__btn"
        type="button"
        data-testid="language-en"
        [class.st-lang__btn--active]="language() === 'en'"
        [attr.aria-pressed]="language() === 'en'"
        (click)="pick('en')"
      >
        EN
      </button>
      <button
        class="st-lang__btn"
        type="button"
        data-testid="language-es"
        [class.st-lang__btn--active]="language() === 'es'"
        [attr.aria-pressed]="language() === 'es'"
        (click)="pick('es')"
      >
        ES
      </button>
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .st-lang {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--border, #2f2f44);
      border-radius: 6px;
      overflow: hidden;
    }

    .st-lang__btn {
      background: transparent;
      border: none;
      color: var(--muted, #8a8a9a);
      cursor: pointer;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      padding: 4px 8px;
      line-height: 1;
    }

    .st-lang__btn:hover {
      color: var(--text, #d6d6de);
      background: rgba(255, 255, 255, 0.07);
    }

    .st-lang__btn--active {
      color: var(--st-color-accent, #0a84ff);
      background: var(--accent-soft, rgba(10, 132, 255, 0.15));
    }
  `,
})
export class LanguageSwitch {
  /** Currently active language. */
  readonly language = input<Language>('en');
  /** Requested language, emitted on click. */
  readonly languageChange = output<Language>();

  pick(language: Language): void {
    this.languageChange.emit(language);
  }
}
