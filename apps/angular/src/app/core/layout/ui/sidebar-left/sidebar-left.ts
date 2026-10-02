import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

interface WorkspaceItem {
  readonly kind: string;
  readonly label: string;
  readonly icon: string;
}

/**
 * Dumb left sidebar: workspace switcher plus branches/tags/remotes sections.
 *
 * The ref lists are supplied by the parent (empty for now) so the component
 * renders explicit empty states instead of inventing data.
 */
@Component({
  selector: 'st-sidebar-left',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.st-left--collapsed]': 'collapsed()',
  },
  template: `
    @if (!collapsed()) {
      <div class="st-left__section">
        <button
          class="st-left__head"
          type="button"
          (click)="workspaceExpanded.set(!workspaceExpanded())"
        >
          <span class="st-left__arrow">{{ workspaceExpanded() ? '▾' : '▸' }}</span> WORKSPACE
        </button>
        @if (workspaceExpanded()) {
          <ul class="st-left__list">
            @for (item of WORKSPACE; track item.kind) {
              <li
                class="st-left__item"
                [class.st-left__item--active]="activeWorkspace() === item.kind"
                (click)="selectWorkspace(item.kind)"
              >
                <span class="st-left__ico">{{ item.icon }}</span> {{ item.label }}
              </li>
            }
          </ul>
        }
      </div>

      <div class="st-left__section">
        <button
          class="st-left__head"
          type="button"
          (click)="branchesExpanded.set(!branchesExpanded())"
        >
          <span class="st-left__arrow">{{ branchesExpanded() ? '▾' : '▸' }}</span> BRANCHES
        </button>
        @if (branchesExpanded()) {
          @if (branches().length === 0) {
            <p class="st-left__empty">No branches</p>
          } @else {
            <ul class="st-left__list">
              @for (branch of branches(); track branch) {
                <li class="st-left__item st-left__sub">{{ branch }}</li>
              }
            </ul>
          }
        }
      </div>

      <div class="st-left__section">
        <button class="st-left__head" type="button" (click)="tagsExpanded.set(!tagsExpanded())">
          <span class="st-left__arrow">{{ tagsExpanded() ? '▾' : '▸' }}</span> TAGS
        </button>
        @if (tagsExpanded()) {
          @if (tags().length === 0) {
            <p class="st-left__empty">No tags</p>
          } @else {
            <ul class="st-left__list">
              @for (tag of tags(); track tag) {
                <li class="st-left__item st-left__sub">{{ tag }}</li>
              }
            </ul>
          }
        }
      </div>

      <div class="st-left__section">
        <button
          class="st-left__head"
          type="button"
          (click)="remotesExpanded.set(!remotesExpanded())"
        >
          <span class="st-left__arrow">{{ remotesExpanded() ? '▾' : '▸' }}</span> REMOTES
        </button>
        @if (remotesExpanded()) {
          @if (remotes().length === 0) {
            <p class="st-left__empty">No remotes</p>
          } @else {
            <ul class="st-left__list">
              @for (remote of remotes(); track remote) {
                <li class="st-left__item st-left__sub">{{ remote }}</li>
              }
            </ul>
          }
        }
      </div>

      <div class="st-left__footer">
        <button
          class="st-left__collapse"
          type="button"
          (click)="collapseToggle.emit()"
          title="Collapse"
        >
          «
        </button>
      </div>
    } @else {
      <button
        class="st-left__collapse"
        type="button"
        (click)="collapseToggle.emit()"
        title="Expand"
      >
        »
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      width: var(--left-w, 260px);
      min-width: var(--left-w, 260px);
      background: var(--st-color-surface, #252536);
      border-right: 1px solid var(--st-color-border, #2f2f44);
      color: var(--st-color-text, #d6d6de);
      overflow: auto;
      font-size: 12.5px;
    }

    :host(.st-left--collapsed) {
      width: 32px;
      min-width: 32px;
      align-items: center;
      padding-top: 8px;
      overflow: hidden;
    }

    .st-left__section {
      border-bottom: 1px solid var(--st-color-border, #2f2f44);
      padding: 6px 0;
    }

    .st-left__head {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 6px;
      background: transparent;
      border: none;
      color: var(--muted, #8a8a9a);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      padding: 6px 10px;
      cursor: pointer;
      text-align: left;
    }

    .st-left__head:hover {
      color: var(--st-color-text, #d6d6de);
    }

    .st-left__arrow {
      font-size: 10px;
      width: 12px;
      display: inline-block;
    }

    .st-left__list {
      list-style: none;
      margin: 0;
      padding: 0 0 4px 0;
    }

    .st-left__item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 10px 5px 28px;
      cursor: pointer;
      color: var(--st-color-text, #d6d6de);
      font-size: 12.5px;
    }

    .st-left__item:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .st-left__item--active {
      background: var(--accent-soft, rgba(10, 132, 255, 0.15));
      color: var(--st-color-accent, #0a84ff);
      border-left: 2px solid var(--st-color-accent, #0a84ff);
      padding-left: 26px;
    }

    .st-left__ico {
      opacity: 0.7;
      width: 14px;
      text-align: center;
    }

    .st-left__sub {
      padding-left: 44px;
      color: var(--muted, #8a8a9a);
    }

    .st-left__empty {
      margin: 0;
      padding: 4px 10px 4px 28px;
      color: var(--muted, #8a8a9a);
      font-size: 12px;
      font-style: italic;
    }

    .st-left__footer {
      margin-top: auto;
      padding: 8px;
      display: flex;
      justify-content: flex-end;
    }

    .st-left__collapse {
      background: transparent;
      border: 1px solid var(--st-color-border, #2f2f44);
      color: var(--muted, #8a8a9a);
      border-radius: 4px;
      cursor: pointer;
      padding: 2px 8px;
    }

    .st-left__collapse:hover {
      color: var(--st-color-text, #d6d6de);
      border-color: var(--muted, #8a8a9a);
    }

    @media (max-width: 640px) {
      :host(:not(.st-left--collapsed)) {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        z-index: 15;
        box-shadow: 8px 0 24px rgba(0, 0, 0, 0.4);
      }
    }
  `,
})
export class SidebarLeft {
  readonly collapsed = input(false);
  readonly branches = input<readonly string[]>([]);
  readonly tags = input<readonly string[]>([]);
  readonly remotes = input<readonly string[]>([]);
  /** Controlled by the parent; this component never mutates it locally. */
  readonly activeWorkspace = input('history');

  readonly collapseToggle = output<void>();
  readonly workspaceSelected = output<string>();

  readonly WORKSPACE: readonly WorkspaceItem[] = [
    { kind: 'status', label: 'File status', icon: '▦' },
    { kind: 'history', label: 'History', icon: '≡' },
    { kind: 'search', label: 'Search', icon: '⌕' },
  ];

  readonly workspaceExpanded = signal(true);
  readonly branchesExpanded = signal(true);
  readonly tagsExpanded = signal(false);
  readonly remotesExpanded = signal(true);

  selectWorkspace(kind: string): void {
    this.workspaceSelected.emit(kind);
  }
}
