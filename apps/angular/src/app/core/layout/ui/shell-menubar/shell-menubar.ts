import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { Language } from '@core/i18n/language';
import type { Theme } from '@core/services/theme.service';
import { LanguageSwitch } from '../language-switch/language-switch';

/**
 * Menu bar chrome (File/Edit/View/…) plus the language, sidebar and theme
 * toggle controls. Labels are inert chrome; the toggles bubble up to the shell
 * container.
 */
@Component({
  selector: 'st-shell-menubar',
  standalone: true,
  imports: [LanguageSwitch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="st-menubar">
      <span i18n>File</span><span i18n>Edit</span><span i18n>View</span><span i18n>Repository</span
      ><span i18n>Branch</span><span i18n>Help</span>
      <span class="st-menubar__spacer"></span>
      <st-language-switch
        [language]="language()"
        (languageChange)="languageChange.emit($event)"
      />
      <button
        class="st-icon-btn"
        type="button"
        data-testid="theme-toggle"
        (click)="themeToggle.emit()"
        [attr.aria-label]="themeToggleLabel()"
        [title]="themeTitle()"
      >
        {{ theme() === 'dark' ? '☀' : '🌙' }}
      </button>
      <button
        class="st-icon-btn"
        type="button"
        (click)="toggleLeft.emit()"
        [attr.aria-label]="leftToggleLabel()"
        title="Toggle left"
        i18n-title
      >
        ☰
      </button>
      <button
        class="st-icon-btn"
        type="button"
        (click)="toggleRight.emit()"
        [attr.aria-label]="rightToggleLabel()"
        title="Toggle right"
        i18n-title
      >
        ◧
      </button>
    </nav>
  `,
  styles: `
    :host {
      display: block;
    }

    .st-menubar {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 6px 12px;
      background: var(--st-color-menubar, #1a1a2e);
      border-bottom: 1px solid var(--border, #2f2f44);
      color: var(--muted, #8a8a9a);
      font-size: 12px;
    }

    .st-menubar span {
      cursor: default;
    }

    .st-menubar span:hover {
      color: var(--text, #d6d6de);
    }

    .st-menubar__spacer {
      flex: 1;
    }

    .st-icon-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--muted, #8a8a9a);
      border-radius: 6px;
      cursor: pointer;
      padding: 4px 7px;
      line-height: 1;
    }

    .st-icon-btn:hover {
      color: var(--text, #d6d6de);
      background: rgba(255, 255, 255, 0.07);
      border-color: var(--border, #2f2f44);
    }
  `,
})
export class ShellMenubar {
  readonly leftCollapsed = input(false);
  readonly rightCollapsed = input(false);
  /** Current theme; drives the sun/moon icon and the toggle's aria-label. */
  readonly theme = input<Theme>('dark');
  /** Active renderer language; drives the language switch. */
  readonly language = input<Language>('en');
  readonly toggleLeft = output<void>();
  readonly toggleRight = output<void>();
  readonly themeToggle = output<void>();
  readonly languageChange = output<Language>();

  readonly themeToggleLabel = computed(() =>
    this.theme() === 'dark'
      ? $localize`Switch to light theme`
      : $localize`Switch to dark theme`,
  );

  readonly themeTitle = computed(() =>
    this.theme() === 'dark' ? $localize`Light theme` : $localize`Dark theme`,
  );

  readonly leftToggleLabel = computed(() =>
    this.leftCollapsed() ? $localize`Expand left` : $localize`Collapse left`,
  );

  readonly rightToggleLabel = computed(() =>
    this.rightCollapsed() ? $localize`Open repositories` : $localize`Close repositories`,
  );
}
