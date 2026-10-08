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
import type { Repository, Stash } from '@contracts/domain';
import type { CommitSearchHit, GitFlowConfig } from '@contracts/gitcore';
import { CommitFocusService } from '@core/services/commit-focus.service';
import {
  IpcBridge,
  type DeepLinkPayload,
  type MenuNavigatePayload,
} from '@core/services/ipc-bridge.service';
import { RepoState } from '@core/services/repo-state.service';
import { WorkspacesStore } from '@core/services/workspaces.store';
import { copyToClipboard, readClipboardText } from '@core/util/clipboard';
import { baseName, buildRepoDeepLink, isPlausibleGitRemoteUrl } from '@core/util/git-url';
import { GithubAccountStore } from '@features/github-account/github-account.store';
import { RemoteOpsStore } from '@features/remote/remote-ops.store';
import type { RepoFetchEntry } from '@features/remote/remote-models';
import { FetchAllStatus } from '@features/remote/ui/fetch-all-status/fetch-all-status';
import { FetchDialog } from '@features/remote/ui/fetch-dialog/fetch-dialog';
import { PullDialog } from '@features/remote/ui/pull-dialog/pull-dialog';
import { PushDialog } from '@features/remote/ui/push-dialog/push-dialog';
import { SearchWorkspace } from '@features/search/ui/search-workspace';
import { BranchCreateDialog } from '@shared/ui/ref-dialogs/branch-create-dialog';
import { MergeDialog } from '@shared/ui/ref-dialogs/merge-dialog';
import type { BranchCreateValue, MergeValue, TagCreateValue } from '@shared/ui/ref-dialogs/ref-dialog.models';
import { RefDeleteConfirmDialog } from '@shared/ui/ref-dialogs/ref-delete-confirm-dialog';
import { RefRenameDialog } from '@shared/ui/ref-dialogs/ref-rename-dialog';
import { StashDropConfirmDialog } from '@shared/ui/ref-dialogs/stash-drop-confirm-dialog';
import { StashPushDialog } from '@shared/ui/ref-dialogs/stash-push-dialog';
import { TagCreateDialog } from '@shared/ui/ref-dialogs/tag-create-dialog';
import { GitFlowDialog } from '@shared/ui/git-flow-dialog/git-flow-dialog';
import { CloneDialog } from '@shared/ui/clone-dialog/clone-dialog';
import type {
  GitFlowFinishValue,
  GitFlowMode,
  GitFlowStartValue,
} from '@shared/ui/git-flow-dialog/git-flow.models';
import { toLocalRepoCardView } from './local-repo-card-view';
import { CheckoutErrorBanner } from './ui/checkout-error-banner/checkout-error-banner';
import { MergeConflictBanner } from './ui/merge-conflict-banner/merge-conflict-banner';
import { RepoDrawer } from './ui/repo-drawer/repo-drawer';
import { ShellHeader, type ShellHeaderTab } from './ui/shell-header/shell-header';
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
    FetchAllStatus,
    SearchWorkspace,
    SwitchBranchConfirmDialog,
    MergeConflictBanner,
    BranchCreateDialog,
    RefRenameDialog,
    RefDeleteConfirmDialog,
    TagCreateDialog,
    MergeDialog,
    StashPushDialog,
    StashDropConfirmDialog,
    GitFlowDialog,
    CloneDialog,
  ],
  templateUrl: './layout.html',
  styleUrls: ['./layout.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayoutComponent implements OnInit {
  readonly repoState = inject(RepoState);
  readonly remoteOps = inject(RemoteOpsStore);
  readonly workspaces = inject(WorkspacesStore);
  private readonly commitFocus = inject(CommitFocusService);
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

  // -- ref mutation dialogs (ADR-028) --------------------------------------
  /** Open create-branch dialog with its default start point, or null. */
  readonly branchDialog = signal<{ startPoint: string } | null>(null);
  /** Open rename dialog for the branch named by this signal, or null. */
  readonly renameDialog = signal<string | null>(null);
  /** Open delete-confirm dialog for a branch or tag, or null. */
  readonly deleteDialog = signal<{ kind: 'branch' | 'tag'; name: string } | null>(null);
  /** Open create-tag dialog with its default target, or null. */
  readonly tagDialog = signal<{ target: string } | null>(null);
  /** Open merge dialog preselected on this ref, or null. */
  readonly mergeDialog = signal<string | null>(null);

  // -- stash + git-flow dialogs (ADR-028 / ADR-027) ------------------------
  /** True while the "stash current changes" dialog is open. */
  readonly stashPushDialog = signal(false);
  /** Stash entry awaiting drop confirmation, or null. */
  readonly stashDropDialog = signal<Stash | null>(null);
  /** Open git-flow dialog with its initial tab, or null. */
  readonly gitFlowDialog = signal<GitFlowMode | null>(null);

  // -- clone (ADR-025) -----------------------------------------------------
  /**
   * Open clone dialog: the prefilled git URL and an optional validation
   * message. Non-null while the dialog is shown; clone itself is V1.4.
   */
  readonly cloneDialog = signal<{ url: string; error: string | null } | null>(null);

  /** Last confirmed branch target, remembered so a blocked retry can re-prompt. */
  private lastAttempt: { name: string; isRemote: boolean } | null = null;

  /** Local tracked repos mapped to the drawer's presentational view model. */
  readonly repoCards = computed<RepoCardView[]>(() => this.repoState.repos().map(toLocalRepoCardView));

  /** Open repository tabs mapped to the header's presentational view model. */
  readonly headerTabs = computed<ShellHeaderTab[]>(() =>
    this.workspaces.tabs().map((tab) => ({ id: tab.repoId, label: tab.name })),
  );

  /** Open tabs mapped to the multi-repo fetch fan-out targets (ADR-024). */
  readonly fetchAllRepos = computed<RepoFetchEntry[]>(() =>
    this.workspaces.tabs().map((tab) => ({ repoId: tab.repoId, name: tab.name })),
  );

  /** Whether the fetch-all status panel should be visible. */
  readonly fetchAllOpen = computed(
    () => this.remoteOps.fetchAllRunning() || this.remoteOps.fetchAllProgress() !== null,
  );

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

    // Validated OS deep links (ADR-025); routed through the same root services.
    const unsubscribeDeepLink = this.bridge.onDeepLink((payload) => void this.onDeepLink(payload));
    this.destroyRef.onDestroy(unsubscribeDeepLink);

    // Ack deep-link readiness now that the `deeplink:open` subscription is in
    // place. The shell drains its FIFO queue on this signal, avoiding the
    // `did-finish-load` race where an initial link would be sent before this
    // subscription existed. A missing bridge/preload is a no-op (bounded
    // fallback in the shell still delivers).
    this.bridge.signalDeepLinkReady();
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

    // Restore the renderer-only workspace tabs before the core list arrives.
    this.workspaces.rehydrate();
    // Best-effort: publish persisted repositories so the drawer and sidebar
    // can resolve local repos and their refs.
    await this.repoState.loadRepositories();
    // Drop stale tab ids, then re-activate the restored tab so the shell and the
    // active-repo source of truth stay in sync across restarts (ADR-024).
    this.workspaces.reconcile(this.repoState.repos());
    const restoredTab = this.workspaces.activeTabId();
    if (restoredTab && this.repoState.activeId() === null) {
      this.workspaces.selectTab(restoredTab);
    }
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

  // -- deep links (ADR-025) ------------------------------------------------

  /**
   * Route a normalized deep link to existing per-repo flows. The shell already
   * validated the URL; this re-checks shapes defensively and never talks to Git
   * directly (all routing goes through `RepoState`/`IpcBridge`).
   */
  async onDeepLink(payload: DeepLinkPayload): Promise<void> {
    if (!payload || typeof payload.kind !== 'string') return;

    switch (payload.kind) {
      case 'open-path': {
        if (typeof payload.path !== 'string') return;
        const repo = await this.repoState.openRepositoryPath(payload.path);
        if (!repo) return;
        this.workspaces.openTab(repo);
        this.activeWorkspace.set('history');
        void this.router.navigate(['/repo']);
        return;
      }
      case 'open-commit': {
        if (typeof payload.repo !== 'string' || typeof payload.oid !== 'string') return;
        const repo = await this.resolveRepoWhenLoaded(payload.repo);
        if (!repo) return;
        this.workspaces.openTab(repo);
        this.workspaces.selectTab(repo.id);
        this.commitFocus.request(repo.id, payload.oid);
        this.activeWorkspace.set('history');
        void this.router.navigate(['/repo']);
        return;
      }
      case 'open-branch': {
        if (typeof payload.repo !== 'string' || typeof payload.branch !== 'string') return;
        const repo = await this.resolveRepoWhenLoaded(payload.repo);
        if (!repo) return;
        this.workspaces.openTab(repo);
        this.workspaces.selectTab(repo.id);
        this.activeWorkspace.set('history');
        void this.router.navigate(['/repo']);
        // Ensure the ref lists for the newly active repo are loaded before
        // resolving whether the branch is local or remote-tracking.
        await this.repoState.loadRefs();
        // Route through the same confirmation path as an interactive branch
        // click: a link must never silently switch a dirty working tree.
        const isRemote = this.repoState.remoteBranches().includes(payload.branch);
        if (isRemote) {
          this.onRemoteBranchSelected(payload.branch);
        } else {
          this.onBranchSelected(payload.branch);
        }
        return;
      }
      case 'clone': {
        if (typeof payload.url !== 'string' || !isPlausibleGitRemoteUrl(payload.url)) return;
        this.cloneDialog.set({ url: payload.url, error: null });
        return;
      }
    }
  }

  /**
   * Resolve a deep-link `<repo>` token against the persisted list: exact id,
   * then display name, then filesystem basename (most links use the name).
   */
  private resolveRepo(token: string): Repository | null {
    const repos = this.repoState.repos();
    return (
      repos.find((repo) => repo.id === token) ??
      repos.find((repo) => repo.name === token) ??
      repos.find((repo) => baseName(repo.fsPath) === token) ??
      null
    );
  }

  /**
   * Resolve a deep-link `<repo>` token, waiting for the first
   * `loadRepositories` to settle when it is still in flight.
   *
   * A link can arrive right after the renderer acknowledges readiness, before
   * `ngOnInit`'s `loadRepositories` has resolved, so an immediate miss is
   * retried once the repos-loaded signal fires.
   */
  private async resolveRepoWhenLoaded(token: string): Promise<Repository | null> {
    const immediate = this.resolveRepo(token);
    if (immediate) return immediate;
    await this.repoState.whenRepositoriesLoaded();
    return this.resolveRepo(token);
  }

  // -- clipboard clone (ADR-025) -------------------------------------------

  /**
   * Read a git URL from the clipboard and prefill the clone dialog. Invalid or
   * unavailable clipboard content opens the dialog with a validation message
   * instead of silently doing nothing.
   */
  async onCloneFromClipboard(): Promise<void> {
    const text = (await readClipboardText()).trim();
    if (!isPlausibleGitRemoteUrl(text)) {
      this.cloneDialog.set({
        url: '',
        error: $localize`The clipboard does not contain a Git URL.`,
      });
      return;
    }
    this.cloneDialog.set({ url: text, error: null });
  }

  /**
   * Copy the active repository's remote URL to the clipboard, falling back to a
   * shareable `singularitree://open?path=…` deep link when it has no remote.
   */
  async onCopyRepoUrl(): Promise<void> {
    const repo = this.repoState.activeRepo();
    if (!repo) return;
    await this.remoteOps.loadRefs();
    const remoteUrl = this.remoteOps.remoteOptions()[0]?.url ?? '';
    await copyToClipboard(remoteUrl || buildRepoDeepLink(repo.fsPath));
  }

  /** Close the clone dialog stub. */
  onCloneCancelled(): void {
    this.cloneDialog.set(null);
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

  // -- ref mutation entry points (ADR-028) ---------------------------------

  /** "+" in the BRANCHES header: open the create-branch dialog at the current ref. */
  onNewBranchRequested(): void {
    this.repoState.clearRefOpError();
    this.branchDialog.set({ startPoint: this.repoState.currentBranch() || 'HEAD' });
  }

  onCreateBranchSubmitted(value: BranchCreateValue): void {
    void this.repoState.createBranch(value.name, value.startPoint, value.checkout).then((ok) => {
      if (ok) this.branchDialog.set(null);
    });
  }

  onBranchDialogCancelled(): void {
    this.branchDialog.set(null);
    this.repoState.clearRefOpError();
  }

  onBranchRenameRequested(name: string): void {
    this.repoState.clearRefOpError();
    this.renameDialog.set(name);
  }

  onRenameSubmitted(newName: string): void {
    const oldName = this.renameDialog();
    if (!oldName) return;
    void this.repoState.renameBranch(oldName, newName).then((ok) => {
      if (ok) this.renameDialog.set(null);
    });
  }

  onRenameCancelled(): void {
    this.renameDialog.set(null);
    this.repoState.clearRefOpError();
  }

  onBranchDeleteRequested(name: string): void {
    this.repoState.clearRefOpError();
    this.deleteDialog.set({ kind: 'branch', name });
  }

  onTagDeleteRequested(name: string): void {
    this.repoState.clearRefOpError();
    this.deleteDialog.set({ kind: 'tag', name });
  }

  onDeleteConfirmed(force: boolean): void {
    const target = this.deleteDialog();
    if (!target) return;
    const op =
      target.kind === 'branch'
        ? this.repoState.deleteBranch(target.name, force)
        : this.repoState.deleteTag(target.name);
    void op.then((ok) => {
      if (ok) this.deleteDialog.set(null);
    });
  }

  onDeleteCancelled(): void {
    this.deleteDialog.set(null);
    this.repoState.clearRefOpError();
  }

  /** "+" in the TAGS header: open the create-tag dialog at HEAD. */
  onNewTagRequested(): void {
    this.repoState.clearRefOpError();
    this.tagDialog.set({ target: 'HEAD' });
  }

  onTagCreateSubmitted(value: TagCreateValue): void {
    void this.repoState
      .createTag(value.name, value.target, value.annotated, value.message, value.force)
      .then((ok) => {
        if (ok) this.tagDialog.set(null);
      });
  }

  onTagDialogCancelled(): void {
    this.tagDialog.set(null);
    this.repoState.clearRefOpError();
  }

  onBranchMergeRequested(name: string): void {
    this.repoState.clearRefOpError();
    this.mergeDialog.set(name);
  }

  onMergeSubmitted(value: MergeValue): void {
    void this.repoState
      .merge(value.ref, value.strategy, value.noCommit, value.message)
      .then((ok) => {
        if (ok) this.mergeDialog.set(null);
      });
  }

  onMergeCancelled(): void {
    this.mergeDialog.set(null);
    this.repoState.clearRefOpError();
  }

  // -- stash entry points (ADR-028) ----------------------------------------

  /** "+" in the STASHES header: open the stash-current-changes dialog. */
  onStashPushRequested(): void {
    this.repoState.clearStashOpError();
    this.stashPushDialog.set(true);
  }

  onStashPushSubmitted(message: string): void {
    void this.repoState.stashPush(message).then((ok) => {
      if (ok) this.stashPushDialog.set(false);
    });
  }

  onStashPushCancelled(): void {
    this.stashPushDialog.set(false);
    this.repoState.clearStashOpError();
  }

  onStashApplyRequested(stash: Stash): void {
    this.repoState.clearStashOpError();
    void this.repoState.stashApply(stash.index, false);
  }

  onStashPopRequested(stash: Stash): void {
    this.repoState.clearStashOpError();
    void this.repoState.stashPop(stash.index);
  }

  onStashDropRequested(stash: Stash): void {
    this.repoState.clearStashOpError();
    this.stashDropDialog.set(stash);
  }

  onStashDropConfirmed(): void {
    const stash = this.stashDropDialog();
    if (!stash) return;
    void this.repoState.stashDrop(stash.index).then((ok) => {
      if (ok) this.stashDropDialog.set(null);
    });
  }

  onStashDropCancelled(): void {
    this.stashDropDialog.set(null);
    this.repoState.clearStashOpError();
  }

  // -- git-flow entry points (ADR-027) -------------------------------------

  /** GIT FLOW header: open the git-flow panel on its Start tab and load config. */
  onGitFlowRequested(): void {
    this.repoState.clearGitFlowError();
    this.repoState.dismissGitFlowResult();
    void this.repoState.loadGitFlowConfig();
    this.gitFlowDialog.set('start');
  }

  onGitFlowStartSubmitted(value: GitFlowStartValue): void {
    void this.repoState.startGitFlow(value.kind, value.name, value.base).then((ok) => {
      if (ok) this.gitFlowDialog.set(null);
    });
  }

  /**
   * Finish a workflow. The dialog stays open on success so the returned `steps`
   * (and any conflict notice) are visible; the user closes it.
   */
  onGitFlowFinishSubmitted(value: GitFlowFinishValue): void {
    void this.repoState.finishGitFlow(value.kind, value.name, value.deleteBranch);
  }

  onGitFlowConfigSubmitted(config: GitFlowConfig): void {
    void this.repoState.saveGitFlowConfig(config).then((ok) => {
      if (ok) this.gitFlowDialog.set(null);
    });
  }

  onGitFlowCancelled(): void {
    this.gitFlowDialog.set(null);
    this.repoState.clearGitFlowError();
    this.repoState.dismissGitFlowResult();
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

  /** Activate (and register) the local repository picked in the drawer. */
  onRepoSelected(id: string): void {
    const repo = this.repoState.repos().find((r) => r.id === id);
    if (repo) {
      this.workspaces.openTab(repo);
      this.repoState.setActive(repo);
    }
  }

  /** Remove a repository from the persisted list via the drawer's trash icon. */
  onRemoveRepository(id: string): void {
    void this.repoState.removeRepository(id).then((ok) => {
      if (ok) this.workspaces.closeTab(id);
    });
  }

  /** Route to the repository manager when the drawer's add button is used. */
  onAddRepository(): void {
    void this.router.navigate(['/repos']);
  }

  // -- repo tabs / workspaces (ADR-024) ------------------------------------

  /** Activate a repo tab and route to its graph. */
  onTabSelected(id: string): void {
    this.workspaces.selectTab(id);
    void this.router.navigate(['/repo']);
  }

  /**
   * Close a repo tab. Closing the active tab selects a neighbour; with no tabs
   * left the shell falls back to the repository manager.
   */
  onTabClosed(id: string): void {
    const wasActive = this.workspaces.activeTabId() === id;
    this.workspaces.closeTab(id);
    if (wasActive) {
      void this.router.navigate(this.workspaces.activeTabId() ? ['/repo'] : ['/repos']);
    }
  }

  /** "+" in the header: route to the repository manager to open another repo. */
  onTabAdd(): void {
    void this.router.navigate(['/repos']);
  }

  // -- multi-repo fetch (ADR-024) ------------------------------------------

  /** Fan out `fetch` across every open repository tab. */
  onFetchAll(): void {
    void this.remoteOps.runFetchAll(this.fetchAllRepos());
  }

  // -- cross-repo commit search (ADR-026) ----------------------------------

  /**
   * Open a search hit: switch to that repository's tab, queue the commit focus,
   * leave the search workspace and route to the graph so the commit is selected.
   */
  onSearchHitSelected(hit: CommitSearchHit): void {
    const repo = this.repoState.repos().find((candidate) => candidate.id === hit.repoId);
    if (!repo) return;
    this.workspaces.openTab(repo);
    this.workspaces.selectTab(hit.repoId);
    this.commitFocus.request(hit.repoId, hit.oid);
    this.activeWorkspace.set('history');
    void this.router.navigate(['/repo']);
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
