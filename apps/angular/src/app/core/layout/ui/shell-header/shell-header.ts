import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Dumb blue top bar (drag region + workspace tabs + window chrome).
 *
 * Tabs are supplied entirely by the parent; the component never hardcodes a
 * workspace name. The active tab gets the `st-tab--active` modifier.
 */
@Component({
  selector: 'st-shell-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="st-header">
      <div class="st-header__drag">{{ brand() }}</div>
      <div class="st-header__tabs">
        @for (tab of tabs(); track tab) {
          <span class="st-tab" [class.st-tab--active]="tab === activeTab()">{{ tab }}</span>
        }
        <button class="st-tab__add" type="button" aria-label="Add tab">+</button>
      </div>
      <div class="st-header__actions">
        <span class="st-header__win" aria-hidden="true">─ □ ×</span>
      </div>
    </header>
  `,
  styles: `
    :host {
      display: block;
    }

    .st-header {
      height: var(--header-h, 48px);
      min-height: var(--header-h, 48px);
      background: linear-gradient(180deg, #0a84ff 0%, #076bd6 100%);
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 10px 0 14px;
      -webkit-app-region: drag;
      color: #fff;
      user-select: none;
    }

    .st-header__drag {
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.2px;
    }

    .st-header__tabs {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: 16px;
      -webkit-app-region: no-drag;
    }

    .st-tab {
      background: rgba(255, 255, 255, 0.18);
      border: 1px solid rgba(255, 255, 255, 0.22);
      color: #fff;
      padding: 6px 12px;
      border-radius: 6px 6px 0 0;
      font-size: 12px;
    }

    .st-tab--active {
      background: var(--bg, #1e1e2e);
      color: var(--text, #d6d6de);
      border-color: var(--border, #2f2f44);
      border-bottom-color: var(--bg, #1e1e2e);
    }

    .st-tab__add {
      background: rgba(255, 255, 255, 0.25);
      border: none;
      color: #fff;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      cursor: pointer;
    }

    .st-header__actions {
      margin-left: auto;
      -webkit-app-region: no-drag;
      font-size: 13px;
      opacity: 0.9;
    }
  `,
})
export class ShellHeader {
  readonly brand = input('SingulariTree');
  readonly tabs = input<readonly string[]>([]);
  readonly activeTab = input<string | null>(null);
}
