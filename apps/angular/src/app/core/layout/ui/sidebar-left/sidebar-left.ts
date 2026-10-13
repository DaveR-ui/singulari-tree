import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { BadgeComponent } from '@singularitree/ui-kit';
import type { Stash } from '@contracts/domain';
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

/** Open per-row context menu state for a branch or tag row. */
interface RowMenu {
  readonly x: number;
  readonly y: number;
  readonly kind: 'branch' | 'tag';
  readonly name: string;
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
                [attr.data-testid]="'st-sidebar-workspace-' + item.kind"
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
        <div class="st-left__headrow">
          <button
            class="st-left__head"
            type="button"
            (click)="branchesExpanded.set(!branchesExpanded())"
          >
            <span class="st-left__arrow">{{ branchesExpanded() ? '▾' : '▸' }}</span
            ><span i18n>BRANCHES</span>
          </button>
          <button
            class="st-left__add"
            type="button"
            data-testid="st-sidebar-add-branch"
            title="New branch"
            i18n-title
            (click)="newBranchRequested.emit()"
          >
            +
          </button>
        </div>
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
                <li
                  class="st-left__item st-left__sub st-left__sub--clickable"
                  data-testid="st-sidebar-branch"
                  role="button"
                  tabindex="0"
                  (dblclick)="selectBranch(branch)"
                  (keydown)="onBranchKeydown($event, branch)"
                  (contextmenu)="onBranchContextMenu($event, branch)"
                >
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
        <div class="st-left__headrow">
          <button class="st-left__head" type="button" (click)="tagsExpanded.set(!tagsExpanded())">
            <span class="st-left__arrow">{{ tagsExpanded() ? '▾' : '▸' }}</span
            ><span i18n>TAGS</span>
          </button>
          <button
            class="st-left__add"
            type="button"
            data-testid="st-sidebar-add-tag"
            title="New tag"
            i18n-title
            (click)="newTagRequested.emit()"
          >
            +
          </button>
        </div>
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
                <li
                  class="st-left__item st-left__sub"
                  data-testid="st-sidebar-tag"
                  (contextmenu)="onTagContextMenu($event, tag)"
                >
                  {{ tag }}
                </li>
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
                      class="st-left__item st-left__sub st-left__sub--branch st-left__sub--clickable"
                      data-testid="st-sidebar-remote-branches"
                      role="button"
                      tabindex="0"
                      (dblclick)="selectRemoteBranch(group.remote, branch)"
                      (keydown)="onRemoteBranchKeydown($event, group.remote, branch)"
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

      <div class="st-left__section">
        <div class="st-left__headrow">
          <button
            class="st-left__head"
            type="button"
            (click)="stashesExpanded.set(!stashesExpanded())"
          >
            <span class="st-left__arrow">{{ stashesExpanded() ? '▾' : '▸' }}</span
            ><span i18n>STASHES</span>
          </button>
          <button
            class="st-left__add"
            type="button"
            data-testid="st-sidebar-stash-push"
            title="Stash current changes"
            i18n-title
            (click)="stashPushRequested.emit()"
          >
            +
          </button>
        </div>
        @if (stashesExpanded()) {
          @if (stashesLoading()) {
            <p class="st-left__empty" data-testid="st-sidebar-stashes-loading" i18n>Loading…</p>
          } @else if (offline()) {
            <p class="st-left__empty" data-testid="st-sidebar-stashes-offline" i18n>Git core offline</p>
          } @else if (stashesError(); as err) {
            <p class="st-left__empty" data-testid="st-sidebar-stashes-error">{{ err.message }}</p>
          } @else if (stashes().length === 0) {
            <p class="st-left__empty" data-testid="st-sidebar-stashes-empty" i18n>No stashes</p>
          } @else {
            <ul class="st-left__list" data-testid="st-sidebar-stashes">
              @for (stash of stashes(); track stash.index) {
                <li class="st-left__item st-left__sub st-left__stash" data-testid="st-sidebar-stash">
                  <span class="st-left__stash-label">
                    <span class="st-left__stash-msg">{{ stashLabel(stash) }}</span>
                    @if (stash.branchName) {
                      <span class="st-left__stash-branch">{{ stash.branchName }}</span>
                    }
                  </span>
                  <span class="st-left__stash-actions">
                    <button
                      type="button"
                      data-testid="st-sidebar-stash-apply"
                      [disabled]="stashOpRunning()"
                      (click)="stashApplyRequested.emit(stash)"
                    >
                      <span i18n>Apply</span>
                    </button>
                    <button
                      type="button"
                      data-testid="st-sidebar-stash-pop"
                      [disabled]="stashOpRunning()"
                      (click)="stashPopRequested.emit(stash)"
                    >
                      <span i18n>Pop</span>
                    </button>
                    <button
                      type="button"
                      class="st-left__menu-danger"
                      data-testid="st-sidebar-stash-drop"
                      [disabled]="stashOpRunning()"
                      (click)="stashDropRequested.emit(stash)"
                    >
                      <span i18n>Drop</span>
                    </button>
                  </span>
                </li>
              }
            </ul>
          }
        }
      </div>

      <div class="st-left__section">
        <div class="st-left__headrow">
          <button
            class="st-left__head"
            type="button"
            data-testid="st-sidebar-git-flow"
            (click)="gitFlowRequested.emit()"
          >
            <span class="st-left__arrow">⚙</span><span i18n>GIT FLOW</span>
          </button>
        </div>
      </div>

      @if (rowMenu(); as menu) {
        <div
          class="st-left__menu-backdrop"
          data-testid="st-sidebar-menu-backdrop"
          (click)="closeRowMenu()"
          (contextmenu)="onMenuBackdropContextMenu($event)"
        ></div>
        <div
          class="st-left__menu"
          role="menu"
          data-testid="st-sidebar-row-menu"
          [style.left.px]="menu.x"
          [style.top.px]="menu.y"
        >
          @if (menu.kind === 'branch') {
            <button
              type="button"
              role="menuitem"
              data-testid="st-sidebar-menu-checkout"
              (click)="menuCheckout(menu)"
            >
              <span i18n>Checkout</span>
            </button>
            <button
              type="button"
              role="menuitem"
              data-testid="st-sidebar-menu-rename"
              (click)="menuRename(menu)"
            >
              <span i18n>Rename…</span>
            </button>
            <button
              type="button"
              role="menuitem"
              data-testid="st-sidebar-menu-merge"
              (click)="menuMerge(menu)"
            >
              <span i18n>Merge into current…</span>
            </button>
          }
          <button
            type="button"
            role="menuitem"
            class="st-left__menu-danger"
            data-testid="st-sidebar-menu-delete"
            [disabled]="deleteBlockedFor(menu)"
            [attr.title]="deleteBlockedFor(menu) ? deleteCurrentBranchTitle : null"
            (click)="menuDelete(menu)"
          >
            <span i18n>Delete…</span>
          </button>
        </div>
      }

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

    .st-left__headrow {
      display: flex;
      align-items: center;
    }

    .st-left__head {
      flex: 1;
      min-width: 0;
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

    .st-left__add {
      flex: none;
      background: transparent;
      border: 1px solid transparent;
      color: var(--muted, #8a8a9a);
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      padding: 1px 7px;
      margin-right: 6px;
    }

    .st-left__add:hover {
      color: var(--st-color-text, #d6d6de);
      border-color: var(--st-color-border, #2f2f44);
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

    /* Branch rows are actionable: brighter hover plus a keyboard focus ring. */
    .st-left__sub--clickable {
      -webkit-user-select: none;
      user-select: none;
    }

    .st-left__sub--clickable:hover {
      color: var(--st-color-text, #d6d6de);
      background: rgba(255, 255, 255, 0.08);
    }

    .st-left__sub--clickable:focus-visible {
      outline: 1px solid var(--st-color-accent, #0a84ff);
      outline-offset: -1px;
    }

    .st-left__empty {
      margin: 0;
      padding: 4px 10px 4px 28px;
      color: var(--muted, #8a8a9a);
      font-size: 12px;
      font-style: italic;
    }

    .st-left__stash {
      align-items: flex-start;
      justify-content: space-between;
      gap: 6px;
      padding-right: 8px;
    }

    .st-left__stash-label {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .st-left__stash-msg {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .st-left__stash-branch {
      color: var(--muted, #8a8a9a);
      font-size: 11px;
    }

    .st-left__stash-actions {
      display: flex;
      flex: none;
      gap: 2px;
    }

    .st-left__stash-actions button {
      background: transparent;
      border: 1px solid var(--st-color-border, #2f2f44);
      border-radius: 4px;
      color: var(--muted, #8a8a9a);
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      padding: 1px 6px;
    }

    .st-left__stash-actions button:hover:not(:disabled) {
      color: var(--st-color-text, #d6d6de);
    }

    .st-left__stash-actions button:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .st-left__menu-backdrop {
      position: fixed;
      inset: 0;
      z-index: 119;
    }

    .st-left__menu {
      position: fixed;
      z-index: 120;
      min-width: 168px;
      padding: 4px;
      background: var(--st-color-surface, #252536);
      border: 1px solid var(--st-color-border, #2f2f44);
      border-radius: 8px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
      color: var(--st-color-text, #d6d6de);
      font-size: 12px;
    }

    .st-left__menu button {
      display: block;
      width: 100%;
      padding: 6px 10px;
      background: transparent;
      border: 0;
      border-radius: 5px;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .st-left__menu button:hover,
    .st-left__menu button:focus-visible {
      background: color-mix(in srgb, var(--st-color-accent, #0a84ff) 22%, transparent);
      outline: none;
    }

    .st-left__menu button:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .st-left__menu button:disabled:hover {
      background: transparent;
    }

    .st-left__menu-danger {
      color: #ff6b6b;
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
  /** Stash entries for the active repository (newest first). */
  readonly stashes = input<readonly Stash[]>([]);
  readonly stashesLoading = input(false);
  readonly stashesError = input<AppError | null>(null);
  /** True while a stash apply/pop/drop mutation is in flight. */
  readonly stashOpRunning = input(false);
  readonly loading = input(false);
  readonly offline = input(false);
  readonly error = input<AppError | null>(null);
  /** Controlled by the parent; this component never mutates it locally. */
  readonly activeWorkspace = input('history');

  readonly collapseToggle = output<void>();
  readonly workspaceSelected = output<string>();
  /** Local branch display name requested for checkout. */
  readonly branchSelected = output<string>();
  /** Remote-tracking branch short name requested for checkout (`<remote>/<branch>`). */
  readonly remoteBranchSelected = output<string>();
  /** User asked to create a new branch ("+" in the BRANCHES header). */
  readonly newBranchRequested = output<void>();
  /** User asked to create a new tag ("+" in the TAGS header). */
  readonly newTagRequested = output<void>();
  /** Local branch name requested for rename (row context menu). */
  readonly branchRenameRequested = output<string>();
  /** Local branch name requested for deletion (row context menu). */
  readonly branchDeleteRequested = output<string>();
  /** Local branch name requested to be merged into the current branch. */
  readonly branchMergeRequested = output<string>();
  /** Tag name requested for deletion (row context menu). */
  readonly tagDeleteRequested = output<string>();
  /** User asked to stash the current changes ("+" in the STASHES header). */
  readonly stashPushRequested = output<void>();
  /** Stash entry requested to be applied to the working tree. */
  readonly stashApplyRequested = output<Stash>();
  /** Stash entry requested to be popped (applied and dropped). */
  readonly stashPopRequested = output<Stash>();
  /** Stash entry requested to be dropped (the parent confirms first). */
  readonly stashDropRequested = output<Stash>();
  /** User asked to open the git-flow panel (GIT FLOW header). */
  readonly gitFlowRequested = output<void>();

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

  /** Explanatory tooltip shown when "Delete…" targets the current branch. */
  readonly deleteCurrentBranchTitle = $localize`Cannot delete the current branch`;

  readonly workspaceExpanded = signal(true);
  readonly branchesExpanded = signal(true);
  readonly tagsExpanded = signal(false);
  readonly remotesExpanded = signal(true);
  readonly stashesExpanded = signal(false);
  /** Open per-row menu (branch or tag), or null when closed. */
  readonly rowMenu = signal<RowMenu | null>(null);

  selectWorkspace(kind: string): void {
    this.workspaceSelected.emit(kind);
  }

  /**
   * Display label for a stash row: its message, falling back to the Git-style
   * `stash@{index}` when the core returned an empty message.
   */
  stashLabel(stash: Stash): string {
    return stash.message || `stash@{${stash.index}}`;
  }

  /** Emit a local branch name for checkout. */
  selectBranch(name: string): void {
    this.branchSelected.emit(name);
  }

  /**
   * Emit the `remote/branch` short name for checkout. REMOTES groups store
   * prefix-stripped branch names, so the remote prefix is reconstructed here.
   */
  selectRemoteBranch(remote: string, shortName: string): void {
    this.remoteBranchSelected.emit(`${remote}/${shortName}`);
  }

  /** Enter/Space activation for local branch rows (role="button"). */
  onBranchKeydown(event: KeyboardEvent, name: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectBranch(name);
    }
  }

  /** Enter/Space activation for remote branch rows (role="button"). */
  onRemoteBranchKeydown(event: KeyboardEvent, remote: string, shortName: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectRemoteBranch(remote, shortName);
    }
  }

  // -- per-row context menu ------------------------------------------------

  /** Open the row menu for a local branch at the pointer. */
  onBranchContextMenu(event: MouseEvent, name: string): void {
    event.preventDefault();
    this.rowMenu.set({ x: event.clientX, y: event.clientY, kind: 'branch', name });
  }

  /** Open the row menu for a tag at the pointer. */
  onTagContextMenu(event: MouseEvent, name: string): void {
    event.preventDefault();
    this.rowMenu.set({ x: event.clientX, y: event.clientY, kind: 'tag', name });
  }

  closeRowMenu(): void {
    this.rowMenu.set(null);
  }

  /** A right-click on the menu backdrop dismisses the menu. */
  onMenuBackdropContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.closeRowMenu();
  }

  menuCheckout(menu: RowMenu): void {
    this.closeRowMenu();
    this.branchSelected.emit(menu.name);
  }

  menuRename(menu: RowMenu): void {
    this.closeRowMenu();
    this.branchRenameRequested.emit(menu.name);
  }

  menuMerge(menu: RowMenu): void {
    this.closeRowMenu();
    this.branchMergeRequested.emit(menu.name);
  }

  menuDelete(menu: RowMenu): void {
    this.closeRowMenu();
    // Tags can always be deleted; a branch that is the current one cannot.
    if (menu.kind === 'branch' && this.deleteBlockedFor(menu)) return;
    if (menu.kind === 'branch') {
      this.branchDeleteRequested.emit(menu.name);
    } else {
      this.tagDeleteRequested.emit(menu.name);
    }
  }

  /**
   * True when the open menu's row is the current local branch, whose deletion is
   * blocked (it must be switched away from first). Tags are never blocked.
   */
  deleteBlockedFor(menu: RowMenu): boolean {
    return menu.kind === 'branch' && menu.name === this.currentBranch();
  }
}
