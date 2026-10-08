import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { DiffViewer, GRAPH_ROW_HEIGHT, GraphRow } from '@singularitree/ui-kit';
import { ModalComponent } from '@shared/ui/modal/modal';
import { BranchCreateDialog } from '@shared/ui/ref-dialogs/branch-create-dialog';
import type { BranchCreateValue, TagCreateValue } from '@shared/ui/ref-dialogs/ref-dialog.models';
import { TagCreateDialog } from '@shared/ui/ref-dialogs/tag-create-dialog';
import { KeyboardShortcutService } from '@core/services/keyboard-shortcut.service';
import { RepoState } from '@core/services/repo-state.service';
import type { CommitRow } from '../../repo-models';
import { GRAPH_PREFETCH_THRESHOLD, GraphStore, WIP_OID } from '../graph.store';
import type {
  CheckoutTarget,
  GraphContextMenuTarget,
  ResetModeName,
} from '../graph-menu.models';
import { CommitDetailsPanel } from '../ui/commit-details-panel';
import { GraphContextMenu } from '../ui/graph-context-menu';
import { ResetConfirmDialog } from '../ui/reset-confirm-dialog';
import { WipRow } from '../ui/wip-row';

/**
 * Commit graph feature page: virtualized graph rows (CDK) + pinned WIP node +
 * details panel + local filter. Data comes exclusively from `GraphStore`
 * (`getCommits` via `IpcBridge`); the page never talks to Git.
 */
@Component({
  selector: 'st-graph-page',
  standalone: true,
  imports: [
    ScrollingModule,
    GraphRow,
    WipRow,
    CommitDetailsPanel,
    GraphContextMenu,
    ResetConfirmDialog,
    ModalComponent,
    DiffViewer,
    BranchCreateDialog,
    TagCreateDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="st-graph-page">
      <header class="st-graph-page__toolbar">
        <h2 class="st-graph-page__title">History</h2>
        <input
          type="search"
          class="st-graph-page__filter"
          placeholder="Filter by message, author or oid"
          aria-label="Filter commits"
          data-testid="graph-filter"
          [value]="store.filter()"
          (input)="onFilter($event)"
        />
        @if (store.isLoading()) {
          <span class="st-graph-page__status" data-testid="graph-loading">Loading…</span>
        }
        @if (store.offline()) {
          <span class="st-graph-page__status" data-testid="graph-offline">
            Git core offline — open a repository inside the desktop app to load history.
          </span>
        }
      </header>

      @if (store.error(); as error) {
        <p class="st-graph-page__error" data-testid="graph-error">{{ error.message }}</p>
      }

      <div class="st-graph-page__body">
        <div class="st-graph-page__graph">
          <!-- Pinned outside the virtual viewport so it never affects lane math. -->
          <st-wip-row [selected]="store.isWipSelected()" (picked)="selectWip()" data-testid="graph-wip" />

          <cdk-virtual-scroll-viewport
            class="st-graph-page__viewport"
            [itemSize]="rowHeight"
            (scrolledIndexChange)="onScrolledIndexChange($event)"
          >
            <st-graph-row
              *cdkVirtualFor="let row of store.filteredRows(); trackBy: trackByRow"
              [commit]="row.commit"
              [lane]="row.lane"
              [maxLane]="maxLane()"
              [selected]="store.selectedOid() === row.commit.oid?.hex"
              [stats]="store.statsFor(row.commit.oid?.hex)"
              (picked)="store.select(row.commit.oid?.hex ?? null)"
              (contextmenu)="onRowContextMenu($event, row)"
            />
          </cdk-virtual-scroll-viewport>

          @if (store.filteredRows().length === 0) {
            <p class="st-graph-page__empty" data-testid="graph-empty">
              {{ store.commits().length === 0 ? 'No commits to display.' : 'No commits match the filter.' }}
            </p>
          }
        </div>

        <aside class="st-graph-page__details" data-testid="graph-details">
          <st-commit-details-panel
            [commit]="store.selectedRow()?.commit ?? null"
            [isWip]="store.isWipSelected()"
          />
        </aside>
      </div>

      <!-- Right-click action shell (ADR-0022): dumb, emits; the page owns the RPC. -->
      <st-graph-context-menu
        [open]="contextMenu() !== null"
        [x]="contextMenu()?.x ?? 0"
        [y]="contextMenu()?.y ?? 0"
        [target]="contextMenuTarget()"
        [canCompare]="canCompare()"
        [busy]="store.resetRunning()"
        (checkout)="onCheckout($event)"
        (compare)="onCompare()"
        (copySha)="onCopySha($event)"
        (createBranchHere)="onCreateBranchHere($event)"
        (tagCommit)="onTagCommit($event)"
        (reset)="onReset($event)"
        (closed)="closeContextMenu()"
      />

      <!-- Destructive gate for a hard reset (ADR-0021). -->
      <st-reset-confirm-dialog
        [open]="resetConfirm() !== null"
        [oid]="resetConfirm()?.oid ?? null"
        [busy]="store.resetRunning()"
        (confirmed)="onResetConfirmed()"
        (cancelled)="onResetCancelled()"
      />

      <!-- Create branch/tag at the menu commit (ADR-028). -->
      <st-branch-create-dialog
        [open]="branchDialog() !== null"
        [defaultStartPoint]="branchDialog()?.startPoint ?? 'HEAD'"
        [running]="refOpRunning()"
        [error]="refOpError()"
        (submitted)="onBranchCreateSubmitted($event)"
        (cancelled)="onBranchCreateCancelled()"
      />
      <st-tag-create-dialog
        [open]="tagDialog() !== null"
        [defaultTarget]="tagDialog()?.target ?? 'HEAD'"
        [running]="refOpRunning()"
        [error]="refOpError()"
        (submitted)="onTagCreateSubmitted($event)"
        (cancelled)="onTagCreateCancelled()"
      />

      <!-- Compare reuses the shared diff display path (GetDiff + DiffViewer). -->
      <st-modal
        [open]="store.compare() !== null"
        title="Compare commits"
        (closed)="store.clearCompare()"
      >
        <p class="st-graph-page__compare-range" data-testid="compare-range">
          {{ store.compare()?.from }} → {{ store.compare()?.to }}
        </p>
        <div class="st-graph-page__compare-diff">
          <st-diff-viewer
            [diff]="store.compareDiff()"
            [loading]="store.compareLoading()"
            [errorMsg]="store.compareError()?.message ?? null"
          />
        </div>
        <button
          st-modal-footer
          type="button"
          data-testid="compare-close"
          (click)="store.clearCompare()"
        >
          Close
        </button>
      </st-modal>
    </section>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      min-height: 0;
      color: var(--st-color-text, #d6d6de);
    }

    .st-graph-page {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    .st-graph-page__toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--st-color-border, #2f2f44);
    }

    .st-graph-page__title {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
    }

    .st-graph-page__filter {
      flex: 0 1 320px;
      min-width: 120px;
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid var(--st-color-border, #2f2f44);
      background: var(--st-color-surface, #252536);
      color: inherit;
      font-size: 12px;
    }

    .st-graph-page__status,
    .st-graph-page__empty {
      opacity: 0.6;
      font-size: 12px;
    }

    .st-graph-page__error {
      margin: 0;
      padding: 6px 12px;
      font-size: 12px;
      color: #ff6b6b;
    }

    .st-graph-page__body {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
    }

    .st-graph-page__graph {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
    }

    .st-graph-page__viewport {
      flex: 1 1 auto;
      min-height: 0;
      width: 100%;
    }

    .st-graph-page__details {
      flex: 0 0 320px;
      min-width: 0;
      border-left: 1px solid var(--st-color-border, #2f2f44);
      overflow: hidden;
    }

    .st-graph-page__compare-range {
      margin: 0 0 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      word-break: break-all;
      opacity: 0.75;
    }

    .st-graph-page__compare-diff {
      height: 360px;
      min-height: 0;
      border: 1px solid var(--st-color-border, #2f2f44);
      border-radius: 6px;
      overflow: hidden;
    }
  `,
})
export class GraphPage {
  readonly store = inject(GraphStore);

  private readonly shortcuts = inject(KeyboardShortcutService);
  private readonly destroyRef = inject(DestroyRef);
  /**
   * Checkout is owned by `RepoState` (the branch-switch confirmation flow and
   * its error banner live in the shell); the graph delegates to it rather than
   * duplicating the flow (ADR-0022 item 1).
   */
  private readonly repoState = inject(RepoState);

  /** Must match `GRAPH_ROW_HEIGHT` so CDK virtualization delegates row height. */
  readonly rowHeight = GRAPH_ROW_HEIGHT;
  readonly maxLane = computed(() => this.store.maxLane());

  // -- context menu / reset confirmation state -----------------------------
  /** Open context menu anchored at viewport coordinates, or null when closed. */
  readonly contextMenu = signal<{ x: number; y: number; row: CommitRow } | null>(null);
  /** Pending hard-reset target awaiting explicit confirmation, or null. */
  readonly resetConfirm = signal<{ oid: string } | null>(null);
  /** Create-branch dialog state (default start point = menu commit oid), or null. */
  readonly branchDialog = signal<{ startPoint: string } | null>(null);
  /** Create-tag dialog state (default target = menu commit oid), or null. */
  readonly tagDialog = signal<{ target: string } | null>(null);

  /** Ref-mutation busy/error mirrored from the root store for the dialogs. */
  readonly refOpRunning = computed(() => this.repoState.refOpRunning());
  readonly refOpError = computed(() => this.repoState.refOpError());

  /** The commit the open menu points at (null when the row has no oid). */
  readonly contextMenuTarget = computed<GraphContextMenuTarget | null>(() => {
    const menu = this.contextMenu();
    const oid = menu?.row.commit.oid?.hex;
    if (!menu || !oid) return null;
    return { oid, refs: menu.row.commit.refs ?? [] };
  });

  /**
   * Compare needs a distinct, real base: the currently selected commit. It is
   * disabled for the WIP node and for the very commit the menu was opened on.
   */
  readonly canCompare = computed(() => {
    const target = this.contextMenuTarget();
    const selected = this.store.selectedOid();
    return !!target && !!selected && selected !== WIP_OID && selected !== target.oid;
  });

  /**
   * Stable CDK identity for row DOM reuse on window shifts: the commit oid hex,
   * falling back to the synthetic WIP pseudo-oid for a row without an oid.
   * A readonly field (not a class expression) keeps the reference stable across
   * change-detection cycles, so the trackBy is not recreated per CD pass.
   */
  readonly trackByRow = (_index: number, row: CommitRow): string =>
    row.commit.oid?.hex ?? WIP_OID;

  /** Bound to the CDK viewport so keyboard navigation can reveal the selection. */
  readonly viewport = viewChild(CdkVirtualScrollViewport);

  constructor() {
    const store = this.store;
    const unregister = [
      this.shortcuts.register('ArrowDown', () => store.selectNext()),
      this.shortcuts.register('ArrowUp', () => store.selectPrevious()),
      this.shortcuts.register(' ', () => store.openDiff()),
    ];
    this.destroyRef.onDestroy(() => unregister.forEach((off) => off()));

    // Keep the selected row in view as keyboard navigation moves it.
    effect(() => {
      const index = this.store.selectedIndex();
      if (index >= 0) {
        this.viewport()?.scrollToIndex(index, 'smooth');
      }
    });
  }

  onFilter(event: Event): void {
    this.store.setFilter((event.target as HTMLInputElement).value);
  }

  selectWip(): void {
    this.store.select(WIP_OID);
  }

  /** Infinite scroll: prefetch when the rendered range approaches the loaded end. */
  onScrolledIndexChange(index: number): void {
    if (index >= this.store.filteredRows().length - GRAPH_PREFETCH_THRESHOLD) {
      this.store.loadMore();
    }
  }

  // -- context menu actions ------------------------------------------------

  /** Open the menu for a commit row at the pointer, clamped into the viewport. */
  onRowContextMenu(event: MouseEvent, row: CommitRow): void {
    if (!row.commit.oid?.hex) return;
    event.preventDefault();
    const x = Math.max(0, Math.min(event.clientX, window.innerWidth - 220));
    const y = Math.max(0, Math.min(event.clientY, window.innerHeight - 260));
    this.contextMenu.set({ x, y, row });
  }

  closeContextMenu(): void {
    this.contextMenu.set(null);
  }

  /** Checkout delegates to the existing branch-switch flow (RepoState). */
  onCheckout(target: CheckoutTarget): void {
    this.closeContextMenu();
    void this.repoState.checkoutBranch(target.refName, target.isRemote);
  }

  /** Compare the selected commit (base) with the menu commit (target). */
  onCompare(): void {
    const target = this.contextMenuTarget();
    const base = this.store.selectedOid();
    this.closeContextMenu();
    if (!target || !base || base === WIP_OID || base === target.oid) return;
    void this.store.compareCommits(base, target.oid);
  }

  /** Copy SHA is renderer-only: no IPC round-trip (ADR-0022 item 2). */
  onCopySha(oid: string): void {
    this.closeContextMenu();
    void this.copyToClipboard(oid);
  }

  /**
   * Reset entries: soft/mixed run immediately; hard opens the confirmation gate
   * first (ADR-0021 item 3) and only runs once the user confirms.
   */
  onReset(mode: ResetModeName): void {
    const target = this.contextMenuTarget();
    this.closeContextMenu();
    if (!target) return;
    if (mode === 'HARD') {
      this.resetConfirm.set({ oid: target.oid });
      return;
    }
    void this.store.reset(target.oid, mode);
  }

  onResetConfirmed(): void {
    const confirm = this.resetConfirm();
    this.resetConfirm.set(null);
    if (confirm) void this.store.reset(confirm.oid, 'HARD');
  }

  onResetCancelled(): void {
    this.resetConfirm.set(null);
  }

  // -- create branch / tag at a commit (ADR-028) ---------------------------

  /** "Create branch here…" opens the dialog prefilled with the commit oid. */
  onCreateBranchHere(oid: string): void {
    this.closeContextMenu();
    this.repoState.clearRefOpError();
    this.branchDialog.set({ startPoint: oid });
  }

  onBranchCreateSubmitted(value: BranchCreateValue): void {
    void this.repoState.createBranch(value.name, value.startPoint, value.checkout).then((ok) => {
      if (ok) this.branchDialog.set(null);
    });
  }

  onBranchCreateCancelled(): void {
    this.branchDialog.set(null);
    this.repoState.clearRefOpError();
  }

  /** "Tag this commit…" opens the dialog prefilled with the commit oid. */
  onTagCommit(oid: string): void {
    this.closeContextMenu();
    this.repoState.clearRefOpError();
    this.tagDialog.set({ target: oid });
  }

  onTagCreateSubmitted(value: TagCreateValue): void {
    void this.repoState
      .createTag(value.name, value.target, value.annotated, value.message, value.force)
      .then((ok) => {
        if (ok) this.tagDialog.set(null);
      });
  }

  onTagCreateCancelled(): void {
    this.tagDialog.set(null);
    this.repoState.clearRefOpError();
  }

  /**
   * Copy `text` to the clipboard, preferring the async Clipboard API and
   * falling back to a hidden textarea + `execCommand` when it is unavailable
   * (jsdom, insecure contexts). Never throws; returns whether it succeeded.
   */
  async copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return this.copyFallback(text);
    }
  }

  private copyFallback(text: string): boolean {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}
