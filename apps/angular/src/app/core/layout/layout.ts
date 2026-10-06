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
  untracked,
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
import { SwitchBranchConfirmDialog } from './ui/switch-branch-confirm-dialog/switch-branch-confirm-dialog';

/** Branch-switch attempt awaiting confirmation, either pre-checkout or blocked. */
interface CheckoutPrompt {
  /** Clicked branch display name, used verbatim in the confirmation copy. */
  readonly name: string;
  readonly isRemote: boolean;
  readonly mode: 'confirm' | 'dirty' | 'untracked';
}

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
    SwitchBranchConfirmDialog,
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

  /**
   * Branch-switch confirmation currently awaiting the user, or null. Opened on
   * every branch click (mode `confirm`) and, after a blocked checkout, driven by
   * the store's `checkoutError` (modes `dirty`/`untracked`); non-dirty failures
   * never open it (they fall back to `st-checkout-error-banner`).
   */
  readonly checkoutPrompt = signal<CheckoutPrompt | null>(null);

  /** Last confirmed branch target, remembered so a blocked retry can re-prompt. */
  private lastAttempt: { name: string; isRemote: boolean } | null = null;

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

    // Take over from the fallback banner whenever a blocked checkout needs a
    // decision: a dirty tree gets the force/stash choice, and a force that
    // still fails on untracked files escalates to a distinct deletion warning.
    // Any other error (or no error) leaves the prompt closed so the banner owns it.
    effect(() => {
      const error = this.repoState.checkoutError();
      const attempt = this.lastAttempt;
      // A pending pre-checkout confirmation owns the flow until the user acts;
      // never clobber it with a stale/previous checkout error. Read untracked so
      // writing `checkoutPrompt` below cannot re-trigger this effect.
      if (untracked(this.checkoutPrompt)?.mode === 'confirm') return;
      // An in-flight operation clears `checkoutError` at its start (and again in
      // `loadRefs`), which would tear the dirty/untracked dialog down mid-call.
      // Keep it open until the operation settles, then let the effect re-run and
      // close it on success. These reads are tracked so the settle re-triggers.
      if (!error && (this.repoState.checkoutRunning() || this.repoState.stashRunning())) return;
      if (!error || error.code !== 'CHECKOUT_FAILED' || !attempt) {
        this.checkoutPrompt.set(null);
        return;
      }
      const reason = error.details?.['reason'];
      if (reason === 'dirty_working_tree') {
        this.checkoutPrompt.set({
          name: attempt.name,
          isRemote: attempt.isRemote,
          mode: 'dirty',
        });
      } else if (reason === 'untracked_working_tree') {
        this.checkoutPrompt.set({
          name: attempt.name,
          isRemote: attempt.isRemote,
          mode: 'untracked',
        });
      } else {
        this.checkoutPrompt.set(null);
      }
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

  /** Open the pre-checkout confirmation for a local branch click. */
  onBranchSelected(name: string): void {
    // Clicking the already-current local branch is a no-op.
    if (name === this.repoState.currentBranch()) return;
    this.checkoutPrompt.set({ name, isRemote: false, mode: 'confirm' });
  }

  /** Open the pre-checkout confirmation for a remote-tracking branch click. */
  onRemoteBranchSelected(name: string): void {
    this.checkoutPrompt.set({ name, isRemote: true, mode: 'confirm' });
  }

  /**
   * User confirmed the pre-checkout dialog: retry the target with the force flag
   * they chose. A plain (unforced) checkout that is blocked by a dirty tree falls
   * through to the existing dirty save/force/cancel dialog via `checkoutError`.
   */
  onConfirmed(force: boolean): void {
    const prompt = this.checkoutPrompt();
    if (!prompt) return;
    this.lastAttempt = { name: prompt.name, isRemote: prompt.isRemote };
    this.checkoutPrompt.set(null);
    void this.repoState.checkoutBranch(prompt.name, prompt.isRemote, force, false);
  }

  /**
   * Force the pending checkout: discard tracked changes, and in untracked mode
   * also clean untracked files (never silently — the modal gated it).
   */
  onForceCheckout(): void {
    const prompt = this.checkoutPrompt();
    if (!prompt) return;
    const discardUntracked = prompt.mode === 'untracked';
    void this.repoState.checkoutBranch(prompt.name, prompt.isRemote, true, discardUntracked);
  }

  /** Stash the blocking changes, then retry the checkout without force. */
  onSaveChanges(): void {
    const prompt = this.checkoutPrompt();
    if (!prompt) return;
    void this.stashAndRetryCheckout(prompt);
  }

  private async stashAndRetryCheckout(prompt: CheckoutPrompt): Promise<void> {
    const stashed = await this.repoState.stashPush(
      `Auto-stash before switching to '${prompt.name}'`,
    );
    if (!stashed) return;
    await this.repoState.checkoutBranch(prompt.name, prompt.isRemote, false, false);
  }

  /**
   * Dismiss the prompt without changing any state. Cancelling the pre-checkout
   * `confirm` dialog aborts before any checkout was attempted, so it must not
   * dismiss a pre-existing checkout error; only cancelling a dirty/untracked
   * conflict clears the error that opened it.
   */
  onCancelCheckoutPrompt(): void {
    const prompt = this.checkoutPrompt();
    this.checkoutPrompt.set(null);
    if (prompt?.mode === 'dirty' || prompt?.mode === 'untracked') {
      this.repoState.dismissCheckoutError();
    }
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
