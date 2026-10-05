import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import type { RepoCardView } from '@singularitree/ui-kit';
import { IpcBridge, type MenuNavigatePayload } from '@core/services/ipc-bridge.service';
import { RepoState } from '@core/services/repo-state.service';
import { GithubAccountStore } from '@features/github-account/github-account.store';
import { RemoteOpsStore } from '@features/remote/remote-ops.store';
import { FetchDialog } from '@features/remote/ui/fetch-dialog/fetch-dialog';
import { PullDialog } from '@features/remote/ui/pull-dialog/pull-dialog';
import { PushDialog } from '@features/remote/ui/push-dialog/push-dialog';
import { toLocalRepoCardView } from './local-repo-card-view';
import { CheckoutErrorBanner } from './ui/checkout-error-banner/checkout-error-banner';
import { RepoDrawer } from './ui/repo-drawer/repo-drawer';
import { ShellHeader } from './ui/shell-header/shell-header';
import { ShellToolbar } from './ui/shell-toolbar/shell-toolbar';
import { SidebarLeft } from './ui/sidebar-left/sidebar-left';

/**
 * Application shell: header + toolbar chrome, a route-driven center region and
 * the local-repository drawer. Layout state (width/collapse) is persisted to
 * localStorage; drawer data AND the left sidebar's ref lists both come from the
 * root `RepoState`, the active-local-repository source of truth. The top-level
 * menu is the OS-native one, so it is not rendered here.
 */
@Component({
  selector: 'st-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    ShellHeader,
    ShellToolbar,
    SidebarLeft,
    RepoDrawer,
    CheckoutErrorBanner,
    PullDialog,
    PushDialog,
    FetchDialog,
  ],
  templateUrl: './layout.html',
  styleUrls: ['./layout.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayoutComponent implements OnInit {
  readonly repoState = inject(RepoState);
  readonly remoteOps = inject(RemoteOpsStore);
  private readonly githubAccount = inject(GithubAccountStore);
  private readonly bridge = inject(IpcBridge);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Top-level routes the OS-native menu may request. */
  private static readonly MENU_ROUTES: ReadonlySet<string> = new Set([
    '/repo',
    '/repos',
    '/github-account',
  ]);

  // -- responsive --
  private readonly MOBILE_BP = 1024;
  private readonly LS_RIGHT_W = 'st:rightWidth';
  private readonly LS_RIGHT_COL = 'st:rightCollapsed';

  readonly rightWidth = signal(320);
  readonly rightCollapsed = signal(false);
  readonly leftCollapsed = signal(false);
  /** Controlled workspace selection for `<st-sidebar-left>`. */
  readonly activeWorkspace = signal('history');
  readonly viewportW = signal(typeof window !== 'undefined' ? window.innerWidth : 1280);
  readonly isMobile = computed(() => this.viewportW() < this.MOBILE_BP);
  readonly isOverlay = computed(() => this.isMobile());

  /** Local tracked repos mapped to the drawer's presentational view model. */
  readonly repoCards = computed<RepoCardView[]>(() => this.repoState.repos().map(toLocalRepoCardView));

  // drag state
  private dragging = false;
  private dragStartX = 0;
  private dragStartW = 320;

  constructor() {
    // persist side effects
    effect(() => {
      const w = this.rightWidth();
      try {
        localStorage.setItem(this.LS_RIGHT_W, String(w));
      } catch {}
    });
    effect(() => {
      const c = this.rightCollapsed();
      try {
        localStorage.setItem(this.LS_RIGHT_COL, String(c));
      } catch {}
    });

    // Native-menu navigation from the Electron main process; subscribe once and
    // unsubscribe on destroy.
    const unsubscribeMenu = this.bridge.onMenuNavigate((payload) => this.onMenuNavigate(payload));
    this.destroyRef.onDestroy(unsubscribeMenu);
  }

  async ngOnInit(): Promise<void> {
    try {
      const w = localStorage.getItem(this.LS_RIGHT_W);
      if (w) {
        const n = parseInt(w, 10);
        if (!isNaN(n) && n >= 240 && n <= 560) this.rightWidth.set(n);
      }
      const c = localStorage.getItem(this.LS_RIGHT_COL);
      if (c !== null) this.rightCollapsed.set(c === 'true');
    } catch {}
    this.viewportW.set(typeof window !== 'undefined' ? window.innerWidth : 1280);

    // Best-effort: publish persisted repositories so the drawer and sidebar
    // can resolve local repos and their refs.
    await this.repoState.loadRepositories();
    // Best-effort, non-blocking: connect the Git account once at startup.
    void this.githubAccount.autoConnectOnce();
  }

  /**
   * Navigate to a route requested by the OS-native menu. Empty or unknown
   * targets are ignored so a malformed payload cannot bounce the user.
   */
  onMenuNavigate(payload: MenuNavigatePayload): void {
    const route = payload?.route;
    if (typeof route !== 'string' || !LayoutComponent.MENU_ROUTES.has(route)) return;
    void this.router.navigateByUrl(route);
  }

  /** Check out the local branch picked in the left sidebar. */
  onBranchSelected(name: string): void {
    void this.repoState.checkoutBranch(name, false);
  }

  /** Check out the remote-tracking branch picked in the left sidebar. */
  onRemoteBranchSelected(name: string): void {
    void this.repoState.checkoutBranch(name, true);
  }

  /** Activate the local repository picked in the drawer. */
  onRepoSelected(id: string): void {
    const repo = this.repoState.repos().find((r) => r.id === id);
    if (repo) this.repoState.setActive(repo);
  }

  /** Remove a repository from the persisted list via the drawer's trash icon. */
  onRemoveRepository(id: string): void {
    void this.repoState.removeRepository(id);
  }

  /** Route to the repository manager when the drawer's add button is used. */
  onAddRepository(): void {
    void this.router.navigate(['/repos']);
  }

  @HostListener('window:resize')
  onResize(): void {
    this.viewportW.set(window.innerWidth);
  }

  toggleRight(): void {
    this.rightCollapsed.update((v) => !v);
  }

  toggleLeft(): void {
    this.leftCollapsed.update((v) => !v);
  }

  // -- resizable drag handle
  onDragStart(event: MouseEvent): void {
    if (this.isOverlay()) return;
    this.dragging = true;
    this.dragStartX = event.clientX;
    this.dragStartW = this.rightWidth();
    event.preventDefault();
    const onMove = (e: MouseEvent) => {
      if (!this.dragging) return;
      const dx = this.dragStartX - e.clientX;
      let nw = this.dragStartW + dx;
      nw = Math.max(240, Math.min(560, nw));
      this.rightWidth.set(nw);
    };
    const onUp = () => {
      this.dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  closeOverlay(): void {
    if (this.isOverlay()) this.rightCollapsed.set(true);
  }
}
