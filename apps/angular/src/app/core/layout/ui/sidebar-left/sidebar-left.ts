import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { BadgeComponent } from '@singularitree/ui-kit';
import type { AppError } from '@core/services/ipc-bridge.service';

interface WorkspaceItem {
  readonly kind: string;
  readonly label: string;
  readonly icon: string;
}

/** One REMOTES group: a remote config name plus its known remote branches. */
interface RemoteGroup {
  readonly remote: string;
  readonly branches: string[];
}

/**
 * Dumb left sidebar: workspace switcher plus branches/tags/remotes sections.
 *
 * The ref lists are supplied by the parent (root `RepoState`); the component
 * renders explicit loading/offline/empty states instead of inventing data.
 */
@Component({
  selector: 'st-sidebar-left',
  standalone: true,
  imports: [BadgeComponent],
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
          <span class="st-left__arrow">{{ workspaceExpanded() ? '▾' : '▸' }}</span
          ><span i18n>WORKSPACE</span>
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
          <span class="st-left__arrow">{{ branchesExpanded() ? '▾' : '▸' }}</span
          ><span i18n>BRANCHES</span>
        </button>
        @if (branchesExpanded()) {
          @if (loading()) {
            <p class="st-left__empty" data-testid="st-sidebar-refs-loading" i18n>Loading…</p>
          } @else if (offline()) {
            <p class="st-left__empty" data-testid="st-sidebar-refs-offline" i18n>Git core offline</p>
          } @else if (error(); as err) {
            <p class="st-left__empty" data-testid="st-sidebar-refs-error">{{ err.message }}</p>
          } @else if (branches().length === 0) {
            <p class="st-left__empty" data-testid="st-sidebar-branches-empty" i18n>No branches</p>
          } @else {
            <ul class="st-left__list" data-testid="st-sidebar-branches">
              @for (branch of branches(); track branch) {
                <li class="st-left__item st-left__sub">
                  {{ branch }}
                  @if (branch === currentBranch() && currentBranchBehind() > 0) {
                    <st-badge
                      variant="warning"
                      data-testid="st-sidebar-branch-badge"
                    >{{ currentBranchBehind() }}</st-badge>
                  }
                </li>
              }
            </ul>
          }
        }
      </div>

      <div class="st-left__section">
        <button class="st-left__head" type="button" (click)="tagsExpanded.set(!tagsExpanded())">
          <span class="st-left__arrow">{{ tagsExpanded() ? '▾' : '▸' }}</span
          ><span i18n>TAGS</span>
        </button>
        @if (tagsExpanded()) {
          @if (loading()) {
            <p class="st-left__empty" data-testid="st-sidebar-refs-loading" i18n>Loading…</p>
          } @else if (offline()) {
            <p class="st-left__empty" data-testid="st-sidebar-refs-offline" i18n>Git core offline</p>
          } @else if (error(); as err) {
            <p class="st-left__empty" data-testid="st-sidebar-refs-error">{{ err.message }}</p>
          } @else if (tags().length === 0) {
            <p class="st-left__empty" data-testid="st-sidebar-tags-empty" i18n>No tags</p>
          } @else {
            <ul class="st-left__list" data-testid="st-sidebar-tags">
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
          <span class="st-left__arrow">{{ remotesExpanded() ? '▾' : '▸' }}</span
          ><span i18n>REMOTES</span>
        </button>
        @if (remotesExpanded()) {
          @if (loading()) {
            <p class="st-left__empty" data-testid="st-sidebar-refs-loading" i18n>Loading…</p>
          } @else if (offline()) {
            <p class="st-left__empty" data-testid="st-sidebar-refs-offline" i18n>Git core offline</p>
          } @else if (error(); as err) {
            <p class="st-left__empty" data-testid="st-sidebar-refs-error">{{ err.message }}</p>
          } @else if (remoteGroups().length === 0) {
            <p class="st-left__empty" data-testid="st-sidebar-remotes-empty" i18n>No remotes</p>
          } @else {
            <div data-testid="st-sidebar-remotes">
              @for (group of remoteGroups(); track group.remote) {
                <ul class="st-left__list">
                  <li class="st-left__item st-left__sub">{{ group.remote }}</li>
                  @for (branch of group.branches; track branch) {
                    <li
                      class="st-left__item st-left__sub st-left__sub--branch"
                      data-testid="st-sidebar-remote-branches"
                    >
                      {{ branch }}
                    </li>
                  }
                </ul>
              }
            </div>
          }
        }
      </div>

      <div class="st-left__footer">
        <button
          class="st-left__collapse"
          type="button"
          (click)="collapseToggle.emit()"
          title="Collapse"
          i18n-title
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
        i18n-title
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

    .st-left__sub--branch {
      padding-left: 58px;
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
  /** Local branch display names. */
  readonly branches = input<readonly string[]>([]);
  /** Name of the current local branch; only it can carry a pull-pending badge. */
  readonly currentBranch = input('');
  /** Pull-pending count of the current branch; badges its row when > 0. */
  readonly currentBranchBehind = input(0);
  /** Remote-tracking branch names, e.g. `origin/david/topic`. */
  readonly remoteBranches = input<readonly string[]>([]);
  readonly tags = input<readonly string[]>([]);
  /** Remote config names (not remote branches). */
  readonly remotes = input<readonly string[]>([]);
  readonly loading = input(false);
  readonly offline = input(false);
  readonly error = input<AppError | null>(null);
  /** Controlled by the parent; this component never mutates it locally. */
  readonly activeWorkspace = input('history');

  readonly collapseToggle = output<void>();
  readonly workspaceSelected = output<string>();

  /**
   * REMOTES groups: every configured remote (in order) plus any remote derived
   * from a remote-tracking branch name. Each group lists its branch short names
   * (remote prefix stripped). Remote visibility never requires a local
   * tracking branch.
   */
  readonly remoteGroups = computed<RemoteGroup[]>(() => {
    const groups: RemoteGroup[] = [];
    const indexByRemote = new Map<string, number>();
    const ensure = (remote: string): RemoteGroup => {
      const existing = indexByRemote.get(remote);
      if (existing !== undefined) return groups[existing];
      const group: RemoteGroup = { remote, branches: [] };
      indexByRemote.set(remote, groups.length);
      groups.push(group);
      return group;
    };

    for (const remote of this.remotes()) ensure(remote);

    for (const branch of this.remoteBranches()) {
      const separator = branch.indexOf('/');
      if (separator <= 0) continue;
      const remote = branch.slice(0, separator);
      const shortName = branch.slice(separator + 1);
      if (!remote || !shortName) continue;
      const group = ensure(remote);
      if (!group.branches.includes(shortName)) group.branches.push(shortName);
    }

    return groups;
  });

  readonly WORKSPACE: readonly WorkspaceItem[] = [
    { kind: 'status', label: $localize`File status`, icon: '▦' },
    { kind: 'history', label: $localize`History`, icon: '≡' },
    { kind: 'search', label: $localize`Search`, icon: '⌕' },
  ];

  readonly workspaceExpanded = signal(true);
  readonly branchesExpanded = signal(true);
  readonly tagsExpanded = signal(false);
  readonly remotesExpanded = signal(true);

  selectWorkspace(kind: string): void {
    this.workspaceSelected.emit(kind);
  }
}
