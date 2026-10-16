import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject } from '@angular/core';
import type { Commit, Diff } from '@contracts/domain';
import { DiffViewer, ToggleGroupComponent, WorkspaceSplitComponent } from '@singularitree/ui-kit';
import { DiffModeService } from '@core/services/diff-mode.service';
import type { DiffMode } from '@core/services/diff-mode.service';
import { IpcBridge } from '@core/services/ipc-bridge.service';
import { PreferencesService } from '@core/services/preferences.service';
import { RepoState } from '@core/services/repo-state.service';
import { GraphStore, WIP_OID } from '../../graph/graph.store';
import { CommitDetailsPanel } from '../../graph/ui/commit-details-panel';
import { ChangesPanel } from '../../status/ui/changes-panel';
import type { HunkActionEvent } from '../../status/ui/hunk-actions';
import { FileStatusStore } from '../file-status.store';
import type { FileStatusVariant } from '../file-status.models';
import { commitChangeSummary, toSingleFileDiff } from '../file-status-mappers';
import { FileDiffList } from '../ui/file-diff-list';
import { FileStatusVariantBar } from '../ui/file-status-variant-bar';

/**
 * "File Status" screen (ADR-0029): the file list on the LEFT, the selected
 * file's diff on the RIGHT — the diff is always on the right, never on the left.
 *
 * Three variants share that scaffold: **local** reuses the existing working-tree
 * `st-changes-panel`, **commit** reuses `st-commit-details-panel` as its header
 * plus the changed-file list, and **pull request** diffs a local ref against a
 * base branch. The screen never talks to Git: every value comes from
 * `FileStatusStore`, which composes the route-scoped `StatusStore` and calls the
 * existing `getStatus`/`getDiff`/`getBranches` RPCs through `IpcBridge`.
 *
 * The right pane is a **pure projection**: `toSingleFileDiff` lifts the selected
 * file into a single-file `Diff` for the unchanged `DiffViewer` (which reads
 * only the deprecated flat `hunks` field), so the whole diff is never handed to
 * the viewer.
 *
 * The persisted diff typography and pane-width preferences now flow through the
 * viewer's and split's inputs.
 */
@Component({
  selector: 'st-file-status-page',
  standalone: true,
  imports: [
    ChangesPanel,
    CommitDetailsPanel,
    DiffViewer,
    FileDiffList,
    FileStatusVariantBar,
    ToggleGroupComponent,
    WorkspaceSplitComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <st-workspace-split [showDetail]="true" detailTitle="" [detailWidth]="detailWidth()" [resizable]="true" (detailWidthResized)="setPaneWidth($event)">
      <!-- pinned LEFT: variant bar + the variant body -->
      <div class="st-file-status__left" detail>
        <st-file-status-variant-bar
          [variant]="fs.variant()"
          [branches]="branchNames()"
          [baseRef]="fs.baseRef()"
          [targetRef]="fs.targetRef()"
          (variantChange)="onVariantChange($event)"
          (baseRefChange)="fs.setBaseRef($event)"
          (targetRefChange)="fs.setTargetRef($event)"
        />

        <div class="st-file-status__body">
          @switch (fs.variant()) {
            @case ('local') {
              <st-changes-panel
                [stagedFiles]="fs.stagedFiles()"
                [unstagedFiles]="fs.unstagedFiles()"
                [message]="fs.commitMessage()"
                [busy]="fs.filesLoading()"
                [selectedPath]="fs.selectedPath()"
                [statusError]="fs.statusError()"
                [commitError]="fs.commitError()"
                [unstagedFile]="fs.selectedUnstagedFile()"
                [stagedFile]="fs.selectedStagedFile()"
                [diffTruncated]="fs.truncated()"
                (stage)="fs.stage($event)"
                (unstage)="fs.unstage($event)"
                (discardFile)="fs.discardFiles([$event])"
                (stageHunk)="onStageHunk($event)"
                (unstageHunk)="onUnstageHunk($event)"
                (discardHunk)="onDiscardHunk($event)"
                (messageChange)="fs.setMessage($event)"
                (commit)="fs.commit()"
                (fileSelect)="fs.selectFile($event)"
              />
            }
            @case ('commit') {
              <st-commit-details-panel
                [commit]="fs.activeCommit()"
                [isWip]="false"
                [collapsible]="true"
              />
              <p class="st-file-status__summary" data-testid="file-status-summary">
                {{ summaryText() }}
              </p>
              <st-file-diff-list
                [files]="fs.diffFiles()"
                [selectedPath]="fs.selectedPath()"
                (fileSelect)="fs.selectFile($event)"
              />
            }
            @case ('pr') {
              <p class="st-file-status__summary" data-testid="file-status-summary">
                {{ summaryText() }}
              </p>
              <st-file-diff-list
                [files]="fs.diffFiles()"
                [selectedPath]="fs.selectedPath()"
                (fileSelect)="fs.selectFile($event)"
              />
            }
          }
        </div>
      </div>

      <!-- flexible RIGHT: the selected file's diff, always -->
      <div class="st-file-status__right" data-testid="file-status-diff">
        @if (untrackedSelected()) {
          <p class="st-file-status__notice" data-testid="file-status-untracked" i18n>
            Untracked file — nothing to diff until it is staged.
          </p>
        }
        @if (fs.selectedPath() && rightFileDiff()) {
          <header class="st-file-status__diff-header st-hairline">
            <span class="st-file-status__diff-path st-mono">{{ fs.selectedPath() }}</span>
            @if (!rightFileDiff()!.isBinary && !rightFileDiff()!.hasConflictMarkers) {
              <span
                class="st-file-status__diff-stats st-mono st-tabular-nums"
                data-testid="file-status-diff-stats"
              >
                <span class="st-file-status__diff-add">+{{ rightFileDiff()!.additions }}</span>
                <span class="st-file-status__diff-del">−{{ rightFileDiff()!.deletions }}</span>
              </span>
            }
            <st-toggle-group
              class="st-file-status__diff-mode"
              data-testid="diff-mode-toggle"
              [ariaLabel]="diffModeLabel"
              [options]="diffModeOptions()"
              [value]="diffMode.mode()"
              (valueChange)="onDiffMode($event)"
            />
          </header>
        }
        <st-diff-viewer
          [diff]="rightFileDiff()"
          [loading]="fs.rightLoading()"
          [errorMsg]="fs.rightError()"
          [truncated]="fs.truncated()"
          [renderSideBySide]="diffMode.sideBySide()"
          [fontSize]="diffFontSizePx()"
          [wordWrap]="diffWordWrapOn()"
        />
      </div>
    </st-workspace-split>
  `,
  styles: `
    :host {
      display: flex;
      height: 100%;
      min-height: 0;
      color: var(--st-color-text);
    }

    :host st-workspace-split {
      flex: 1 1 auto;
      min-height: 0;
    }

    .st-file-status__left {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }

    /* Local variant only: the changes panel owns a bounded column and its own
       scroll, so its commit box pins to the pane bottom. Scoped with :has() to
       the panel's mount point, so the commit and pr variants — which rely on the
       body's own overflow — keep their content-sized column. */
    .st-file-status__left:has(st-changes-panel) {
      flex: 1 1 auto;
    }

    .st-file-status__body {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: var(--st-space-2);
      min-height: 0;
      padding: var(--st-space-2) var(--st-space-3);
      overflow: auto;
      font-size: var(--st-font-12);
    }

    .st-file-status__summary {
      flex: none;
      margin: 0;
      font-family: var(--st-font-mono);
      font-size: var(--st-font-11);
      opacity: 0.75;
    }

    /* Commit variant: the changed-file list owns the slack, the collapsible
       commit header shrinks to its compact head. min-height: 0 lets both
       shrink below their content inside the flex column. */
    :host st-commit-details-panel {
      flex: 0 1 auto;
      min-height: 0;
    }

    :host st-file-diff-list {
      flex: 1 1 auto;
      min-height: 0;
    }

    .st-file-status__right {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
    }

    .st-file-status__notice {
      flex: none;
      margin: 0;
      padding: var(--st-space-3);
      font-size: var(--st-font-12);
      opacity: 0.75;
    }

    :host st-diff-viewer {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
    }

    .st-file-status__diff-header {
      display: flex;
      align-items: center;
      gap: var(--st-space-3);
      flex: none;
      padding: 0 var(--st-space-3);
      min-height: var(--st-size-row-tree-dense);
      font-size: var(--st-font-12);
      color: var(--st-color-muted);
    }

    .st-file-status__diff-path {
      flex: 1 1 auto;
      min-width: 0;
      word-break: break-all;
    }

    .st-file-status__diff-stats {
      display: flex;
      gap: var(--st-space-2);
      flex: none;
    }

    .st-file-status__diff-add {
      color: var(--st-color-add);
    }

    .st-file-status__diff-del {
      color: var(--st-color-remove);
    }

    .st-file-status__diff-mode {
      flex: none;
      margin-left: auto;
    }
  `,
})
export class FileStatusPage {
  readonly fs = inject(FileStatusStore);
  /** Renderer-local diff-layout preference (unified by default). */
  readonly diffMode = inject(DiffModeService);

  private readonly graph = inject(GraphStore);
  private readonly repoState = inject(RepoState);
  private readonly bridge = inject(IpcBridge);
  private readonly destroyRef = inject(DestroyRef);
  private readonly prefs = inject(PreferencesService);

  /** Last observed `RepoState.statusRefreshRequested` token (dedupes the effect). */
  private lastStatusRefresh = this.repoState.statusRefreshRequested();

  /**
   * The persisted `st:paneWidth` drives the pinned left pane; `null` keeps the
   * 380px token default.
   */
  readonly detailWidth = computed<string | null>(() => {
    const width = this.prefs.paneWidth();
    return width ? `${width}px` : null;
  });

  /**
   * Persisted diff typography preferences passed into the dumb viewer: the
   * numeric font size and the soft-wrap flag.
   */
  readonly diffFontSizePx = computed(() => Number(this.prefs.diffFontSize()));
  readonly diffWordWrapOn = computed(() => this.prefs.diffWordWrap() === 'on');

  /**
   * Last graph selection this screen followed, resolved to the oid it names
   * (`null` = nothing/WIP selected). A sentinel (not `null`) on the first run, so
   * a cold deep link still opens the working tree. Updated only when the screen
   * actually dispatches, so an unchanged resolved selection is a no-op.
   */
  private lastFollowedOid: string | null | undefined = undefined;

  /**
   * The single-file `Diff` fed to the viewer: a pure projection of the currently
   * selected file, never the whole diff (`DiffViewer` reads only the deprecated
   * flat `hunks`, which this synthetic object carries).
   */
  readonly rightFileDiff = computed<Diff | null>(() =>
    toSingleFileDiff(this.fs.wholeDiff(), this.fs.selectedPath()),
  );

  /**
   * True when the local variant has a selected status row that is genuinely
   * untracked (porcelain `?` code), which `git diff HEAD` excludes until it is
   * staged. The right pane then shows an explicit notice instead of the viewer
   * silently projecting an empty diff (the viewer input stays null). Absence from
   * `wholeDiff().files` is NOT sufficient: a truncated diff legitimately omits
   * tracked files (ADR-0020 cap), so those must never be mislabeled as untracked.
   */
  readonly untrackedSelected = computed<boolean>(() => {
    if (!this.fs.isLocal()) return false;
    // A capped diff omits real files: never infer "untracked" from that.
    if (this.fs.truncated()) return false;
    const path = this.fs.selectedPath();
    if (!path) return false;
    const status = [...this.fs.stagedFiles(), ...this.fs.unstagedFiles()].find(
      (file) => file.path === path,
    );
    // Only the porcelain `?` untracked code qualifies.
    if (status?.unstaged !== '?') return false;
    const diff = this.fs.wholeDiff();
    if (!diff) return false;
    // Untracked files have no `git diff HEAD` section.
    return !diff.files.some((file) => file.path === path);
  });

  /** Branch names offered by the PR base/target controls. */
  readonly branchNames = computed<string[]>(() => this.fs.branches().map((branch) => branch.name));

  /** Segments of the diff-pane layout toggle. */
  readonly diffModeOptions = computed(() => [
    { value: 'unified', label: $localize`Unified` },
    { value: 'side-by-side', label: $localize`Side by side` },
  ]);

  /** Accessible name for the diff-pane layout toggle. */
  readonly diffModeLabel = $localize`Diff layout`;

  /** Count-only summary of the diff shown by the commit/PR variants. */
  readonly changeSummary = computed(() => commitChangeSummary(this.fs.wholeDiff()));

  /** One-line summary: `+12 −3 across 4 files`. */
  readonly summaryText = computed(() => {
    const additions = this.changeSummary().additions;
    const deletions = this.changeSummary().deletions;
    const filesChanged = this.changeSummary().filesChanged;
    const files = filesChanged === 1 ? $localize`1 file` : $localize`${filesChanged} files`;
    return $localize`+${additions} −${deletions} across ${files}`;
  });

  constructor() {
    // Mirror `RepoPage`: a cold deep link (or the sidebar) can land here with no
    // graph loaded yet, so hydrate the shared route-scoped `GraphStore` from the
    // active repository. Guarded by id because `openRepository` is not idempotent
    // (it refreshes `last_opened_at`).
    effect(() => {
      const active = this.repoState.activeRepo();
      if (!active || this.graph.repoId() === active.id) return;
      void this.graph.openRepository(active.fsPath);
    });

    // The screen always follows the graph's repository and HEAD.
    effect(() => {
      this.fs.setRepoId(this.graph.repoId());
      this.fs.setHeadOid(this.graph.commits()[0]?.oid?.hex ?? null);
    });

    // The graph selection picks the variant: a real commit present in the loaded
    // window opens the commit variant, anything else (the WIP row, no selection)
    // opens the working tree. Following the selection keeps the screen in sync
    // when another commit is picked while the page is open.
    effect(() => {
      const repoId = this.graph.repoId();
      const oid = this.graph.selectedOid();
      const commit =
        repoId && oid && oid !== WIP_OID
          ? this.graph.commits().find((candidate) => candidate.oid?.hex === oid)
          : undefined;
      // Dedupe on the RESOLVED selection, not on `oid`. `commits()` stays a
      // tracked dependency on purpose: a selection whose commit is not yet in
      // the loaded window (the ADR-026 cross-repo search hand-off) resolves to
      // `null` here and must re-fire once the window that names it loads. But a
      // background `reload()` (fs:changed after stage/unstage/commit) installs a
      // NEW `commits()` array that still names the selected commit; without this
      // guard the effect would re-dispatch `openCommit()` and flip the variant
      // bar from `local` back to `commit` while the user is staging. Staging must
      // never change the variant, so an unchanged resolved selection is a no-op.
      const resolved = commit ? oid : null;
      if (resolved === this.lastFollowedOid) return;
      this.lastFollowedOid = resolved;
      if (commit) void this.fs.openCommit(commit);
      else void this.fs.openLocal();
    });

    // A successful commit moves HEAD: reload the graph window.
    effect(() => {
      if (this.fs.graphReloadRequested() > 0) this.graph.reload();
    });

    // A ref mutation that may have moved HEAD or dirtied the tree (ADR-028) used
    // to be observed by `StatusWorkspace`, the band ADR-0030 item 1 removed. Its
    // working-tree half lives here: File status is now the single inspection
    // surface.
    effect(() => {
      const token = this.repoState.statusRefreshRequested();
      if (token === this.lastStatusRefresh) return;
      this.lastStatusRefresh = token;
      this.refreshForExternalChange();
    });

    // External file changes may have moved HEAD or dirtied the window: refresh
    // through the same path.
    const unsubscribe = this.bridge.onFsChanged(() => this.refreshForExternalChange());
    this.destroyRef.onDestroy(unsubscribe);
    this.destroyRef.onDestroy(() => this.fs.clearVariant());
  }

  /**
   * Reload the graph window and, while the working tree is on screen, re-open
   * the local variant — keeping the user's file selection across the refresh.
   * A commit/PR diff is an immutable historical comparison and must not be
   * clobbered into the working tree, so only the local variant re-opens.
   */
  private refreshForExternalChange(): void {
    this.graph.reload();
    if (!this.fs.isLocal()) return;
    const selected = this.fs.selectedPath();
    void this.fs.openLocal().then(() => {
      // Keep the user's file selection across the refresh.
      if (selected) this.fs.selectFile(selected);
    });
  }

  /** Switch variant through the store; only the store owns the variant state. */
  onVariantChange(variant: FileStatusVariant): void {
    if (variant === 'local') {
      void this.fs.openLocal();
      return;
    }
    if (variant === 'pr') {
      void this.fs.openPr();
      return;
    }
    const commit = this.fs.activeCommit() ?? this.selectedCommit();
    // Without a commit to show, fall back to the working tree rather than an
    // empty screen: the variant state only changes through `openCommit`.
    if (commit) void this.fs.openCommit(commit);
    else void this.fs.openLocal();
  }

  /** Apply a diff-layout picked by the user (renderer-local preference). */
  onDiffMode(value: string): void {
    this.diffMode.setMode(value as DiffMode);
  }

  /**
   * The split emits pixels and the service owns persistence/validation, so this
   * only rounds the value and forwards it.
   */
  setPaneWidth(width: number): void {
    this.prefs.setPaneWidth(String(Math.round(width)));
  }

  onStageHunk(event: HunkActionEvent): void {
    void this.fs.stageHunk(event.path, event.hunkIndex, event.lineIndices);
  }

  onUnstageHunk(event: HunkActionEvent): void {
    void this.fs.unstageHunk(event.path, event.hunkIndex, event.lineIndices);
  }

  onDiscardHunk(event: HunkActionEvent): void {
    void this.fs.discardHunk(event.path, event.hunkIndex, event.lineIndices);
  }

  /** Commit the graph currently has selected, or null for WIP/no selection. */
  private selectedCommit(): Commit | null {
    return this.graph.selectedRow()?.commit ?? null;
  }
}
