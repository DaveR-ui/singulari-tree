import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** One header tab: a stable id (repository id) plus its display label. */
export interface ShellHeaderTab {
  readonly id: string;
  readonly label: string;
}

/**
 * Dumb blue top bar (drag region + workspace tabs + window chrome).
 *
 * Tabs are supplied entirely by the parent; the component never hardcodes a
 * workspace name. The active tab (matched by id) gets the `st-tab--active`
 * modifier. Tab selection, tab close and "add tab" are emitted to the parent,
 * which owns the workspace state and routing.
 */
@Component({
  selector: 'st-shell-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="st-header">
      <div class="st-header__drag">{{ brand() }}</div>
      <div class="st-header__tabs">
        @for (tab of tabs(); track tab.id) {
          <span
            class="st-tab"
            [class.st-tab--active]="tab.id === activeTab()"
            role="tab"
            tabindex="0"
            [attr.aria-selected]="tab.id === activeTab()"
            (click)="tabSelected.emit(tab.id)"
            (keydown.enter)="selectFromKeyboard($event, tab.id)"
            (keydown.space)="selectFromKeyboard($event, tab.id)"
          >
            <span class="st-tab__label">{{ tab.label }}</span>
            <button
              class="st-tab__close"
              type="button"
              aria-label="Close tab"
              i18n-aria-label
              (click)="close($event, tab.id)"
            >
              ×
            </button>
          </span>
        }
        <button
          class="st-tab__add"
          type="button"
          aria-label="Add tab"
          i18n-aria-label
          (click)="addRequested.emit()"
        >
          +
        </button>
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
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.18);
      border: 1px solid rgba(255, 255, 255, 0.22);
      color: #fff;
      padding: 6px 8px 6px 12px;
      border-radius: 6px 6px 0 0;
      font-size: 12px;
      cursor: pointer;
    }

    .st-tab--active {
      background: var(--bg, #1e1e2e);
      color: var(--text, #d6d6de);
      border-color: var(--border, #2f2f44);
      border-bottom-color: var(--bg, #1e1e2e);
    }

    .st-tab__label {
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .st-tab__close {
      background: transparent;
      border: none;
      color: inherit;
      opacity: 0.6;
      font-size: 13px;
      line-height: 1;
      padding: 0 2px;
      cursor: pointer;
    }

    .st-tab__close:hover {
      opacity: 1;
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
  readonly tabs = input<readonly ShellHeaderTab[]>([]);
  /** Id of the active tab, or null when none is active. */
  readonly activeTab = input<string | null>(null);

  /** User picked a tab (by id). */
  readonly tabSelected = output<string>();
  /** User closed a tab (by id). */
  readonly tabClosed = output<string>();
  /** User clicked the "+" add-tab control. */
  readonly addRequested = output<void>();

  /** Enter/Space activation for a tab (role="tab"). */
  selectFromKeyboard(event: Event, id: string): void {
    event.preventDefault();
    this.tabSelected.emit(id);
  }

  /** Close a tab without also selecting it. */
  close(event: Event, id: string): void {
    event.stopPropagation();
    this.tabClosed.emit(id);
  }
}
