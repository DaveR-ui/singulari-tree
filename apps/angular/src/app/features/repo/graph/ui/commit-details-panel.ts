import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import type { Commit, RefLabel, Signature } from '@contracts/domain';
import {
  BadgeComponent,
  ButtonComponent,
  IconComponent,
  InputComponent,
  isMainlineBranch,
  normalizeRefKind,
  shortOidHex,
  ToggleGroupComponent,
  type ToggleOption,
} from '@singularitree/ui-kit';
import { splitCommitMessage } from './commit-message';

/**
 * Read-only details panel for the selected commit (plan §4.3, decision #8).
 * Dumb: it only renders the `commit` input (or the WIP placeholder) and emits
 * intents. It holds no services and does not route — the owning page decides
 * what each output means.
 *
 * Two hosts share one surface: the History aside (`repo-page`) and the Commit
 * analyzer embed in File status. The host opts into the pieces it wants through
 * inputs, so the same panel reads as a full overview in History and as a slim
 * header in the analyzer.
 *
 * In its full form (both `showSubject` and `showFiles`) the panel exposes ONE
 * exclusive 2-segment switch — description / changed files — in the subject
 * row, where the old description chevron sat. Exactly one sector is in the DOM
 * at a time (the hidden one is never rendered), defaulting to `description`; a
 * commit with no body can never land in `description` (its segment is disabled
 * and the mode is forced to `files`). The subject `h1` stays visible in both
 * modes as the commit's identity, clamped to a single line only in `files`
 * mode. The mode is panel view state, never shared with a host.
 *
 * The primary "Review changes" CTA sits in the header's center slot so it reads
 * as the panel's single focal action between the identity (left) and the
 * contextual actions (right). The metadata block is demoted to the bottom: a
 * hairline-separated, muted footer that never competes with the message.
 *
 * `showSubject` gates the ENTIRE description sector (subject + body) and
 * `showFiles` the files sector; the analyzer leaves both off because it owns
 * those two sectors in its own title header / left column, so the panel there
 * renders identity + metadata only. `navMode` chooses which contextual action
 * renders in the header — `release` (History "Back") or `history` (the
 * analyzer's "History" shortcut, which also renders in the empty branch).
 * `locked`/`showInGraph` drive the padlock and the analyzer-only reveal action.
 */
@Component({
  selector: 'st-commit-details-panel',
  standalone: true,
  imports: [
    BadgeComponent,
    ButtonComponent,
    IconComponent,
    InputComponent,
    ToggleGroupComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isWip()) {
      <section class="st-commit-details" data-testid="commit-details-wip">
        <h2 class="st-commit-details__title">Working tree</h2>
        <p class="st-commit-details__empty">Uncommitted changes (WIP) — stage and commit to add a node.</p>
        @if (showCta()) {
          <st-button
            variant="primary"
            data-testid="commit-details-review"
            (click)="reviewChanges.emit()"
            i18n
            >Review changes</st-button
          >
        }
      </section>
    } @else {
      <!--
        Both non-WIP states share one header/toolbar so the padlock and the
        contextual nav always land in the same place. The commit branch adds the
        identity, the centered CTA, the description, the changed files and the
        metadata footer; the empty branch swaps all of that for the placeholder
        message (the disabled padlock still proves the toolbar is inert without a
        selection).
      -->
      <section
        class="st-commit-details"
        [attr.data-testid]="commit() ? 'commit-details' : null"
      >
        <header class="st-commit-details__header">
          <div class="st-commit-details__identity">
            @if (commit()) {
              <span
                class="st-commit-details__short-oid"
                data-testid="commit-details-short-oid"
                >{{ shortOid() }}</span
              >
              @if (branchChip(); as branch) {
                <st-badge variant="branch" data-testid="commit-details-branch">{{ branch }}</st-badge>
              }
            }
          </div>

          <!--
            Center slot: flexes to fill the gap between identity and actions so
            the primary CTA centers in the panel regardless of how wide either
            side grows.
          -->
          <div class="st-commit-details__header-center">
            @if (commit() && showCta()) {
              <st-button
                variant="primary"
                data-testid="commit-details-review"
                (click)="reviewChanges.emit()"
                i18n
                >Review changes</st-button
              >
            }
          </div>

          <div class="st-commit-details__actions">
            <!--
              Padlock: press-to-pin the selected commit so the aside survives a
              graph reload. Disabled whenever there is no real commit to pin
              (empty state) or the synthetic WIP row is selected.
            -->
            <st-button
              variant="icon"
              size="sm"
              data-testid="commit-details-lock"
              [pressed]="locked()"
              [disabled]="!canLock()"
              [ariaLabel]="lockLabel()"
              (click)="lockToggle.emit()"
            >
              <st-icon [name]="locked() ? 'lock' : 'lock-open'" />
            </st-button>

            @if (commit() && navMode() === 'release') {
              <st-button
                variant="ghost"
                size="sm"
                data-testid="commit-details-release"
                (click)="release.emit()"
              >
                <st-icon name="chevron-left" />
                <span i18n>Back</span>
              </st-button>
            } @else if (navMode() === 'history') {
              <st-button
                variant="ghost"
                size="sm"
                data-testid="commit-details-history"
                (click)="openHistory.emit()"
              >
                <st-icon name="history" />
                <span i18n>History</span>
              </st-button>
            }

            @if (commit() && showInGraph()) {
              <st-button
                variant="icon"
                size="sm"
                data-testid="commit-details-show-in-graph"
                [ariaLabel]="showInGraphLabel"
                (click)="revealInGraph.emit()"
              >
                <st-icon name="brand" />
              </st-button>
            }
          </div>
        </header>

        @if (commit(); as selected) {
          <!--
            Description sector: the commit's identity (the subject h1) plus the
            exclusive view switch. showSubject gates the ENTIRE sector (the
            File-status analyzer embed turns it off and owns the identity
            itself). The switch renders only in a host that owns BOTH sectors
            (History) and selects exactly one of description / changed files:
            the hidden sector is never in the DOM. The subject stays visible in
            both modes (it is the commit's identity), clamped to a single line
            only in files mode; the body renders only in description mode.
          -->
          @if (showSubject()) {
            <div class="st-commit-details__description-block">
              <div class="st-commit-details__subject-row">
                <h1
                  class="st-commit-details__subject"
                  [class.st-commit-details__subject--collapsed]="effectiveMode() === 'files'"
                  data-testid="commit-details-subject"
                >
                  {{ subject() }}
                </h1>
                @if (showFiles()) {
                  <st-toggle-group
                    class="st-commit-details__view-switch"
                    data-testid="commit-details-view-switch"
                    [ariaLabel]="viewSwitchLabel"
                    [options]="modeOptions()"
                    [value]="effectiveMode()"
                    (valueChange)="setMode($event)"
                  />
                }
              </div>

              @if (effectiveMode() === 'description') {
                <p class="st-commit-details__description" data-testid="commit-details-description">
                  {{ description() }}
                </p>
              }
            </div>
          }

          @if (showFiles() && effectiveMode() === 'files') {
            <!--
              Changed files: a bordered block that owns the whole sector in
              files mode. Paths only — no hunks, no diff, no stats. The body
              keeps its own filter, both empty states and the list; the header
              keeps only the heading (the exclusive switch lives in the subject
              row above).
            -->
            <section class="st-commit-details__files">
              <header class="st-commit-details__files-header">
                <p
                  class="st-commit-details__files-heading"
                  data-testid="commit-details-files-heading"
                  [attr.id]="filesHeadingId"
                >
                  {{ filesHeading() }}
                </p>
              </header>

              <div
                class="st-commit-details__files-body"
                role="region"
                [attr.aria-labelledby]="filesHeadingId"
              >
                <st-input
                  type="search"
                  testId="commit-details-files-filter"
                  [value]="fileFilter()"
                  [placeholder]="filterPlaceholder"
                  [ariaLabel]="filterLabel"
                  (valueChange)="fileFilter.set($event)"
                />

                @if (!changedFiles().length) {
                  <p
                    class="st-commit-details__files-empty"
                    data-testid="commit-details-files-empty"
                    i18n
                  >
                    No changed files.
                  </p>
                } @else if (!filteredFiles().length) {
                  <!--
                    Distinct from the no-files line: files exist, the filter
                    simply matches none of them.
                  -->
                  <p
                    class="st-commit-details__files-empty"
                    data-testid="commit-details-files-filter-empty"
                    i18n
                  >
                    No files match the filter.
                  </p>
                } @else {
                  <ul class="st-commit-details__files-list">
                    @for (path of filteredFiles(); track path) {
                      <li
                        class="st-commit-details__file-path st-mono"
                        data-testid="commit-details-file-path"
                      >
                        {{ path }}
                      </li>
                    }
                  </ul>
                }
              </div>
            </section>
          }

          <!--
            Metadata footer: Author/Date/Commit/Parents/Refs + committer. Pushed
            to the bottom and de-emphasized (hairline top rule, muted, 0.75) so
            the message and the files own the visual weight.
          -->
          <div class="st-commit-details__meta-block">
            @if (refs().length) {
              <div class="st-commit-details__refs" data-testid="commit-details-refs">
                @for (ref of refs(); track ref.kind + ':' + ref.name) {
                  <span class="st-commit-details__ref" [class]="refClass(ref)">{{ ref.name }}</span>
                }
              </div>
            }

            <dl class="st-commit-details__meta">
              <dt>Author</dt>
              <dd class="st-commit-details__author">
                <span
                  class="st-commit-details__avatar"
                  data-testid="commit-details-avatar"
                  aria-hidden="true"
                  >{{ authorInitials() }}</span
                >
                <span data-testid="commit-details-author">{{ authorLabel() }}</span>
              </dd>
              <dt>Date</dt>
              <dd data-testid="commit-details-date">{{ selected.committedAt }}</dd>
              <dt i18n>Commit</dt>
              <dd class="st-commit-details__oid" data-testid="commit-details-oid">
                {{ selected.oid?.hex ?? 'unknown' }}
              </dd>
              <dt>Parents</dt>
              <dd data-testid="commit-details-parents">
                @if (parents().length) {
                  @for (parent of parents(); track parent.hex) {
                    <span class="st-commit-details__oid">{{ parent.hex }}</span>
                  }
                } @else {
                  <span>(root commit)</span>
                }
              </dd>
              <dt>Refs</dt>
              <dd data-testid="commit-details-ref-summary">{{ refSummary() }}</dd>
            </dl>

            <p class="st-commit-details__committer" data-testid="commit-details-committer">
              {{ signature(selected.committer) }}
            </p>
          </div>
        } @else {
          <p class="st-commit-details__empty" data-testid="commit-details-empty">
            Select a commit to see its details.
          </p>
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      min-height: 0;
      max-height: 100%;
      overflow: auto;
      padding: var(--st-space-3);
      color: var(--st-color-text);
      font-size: var(--st-font-12);
    }

    .st-commit-details {
      display: flex;
      flex-direction: column;
      gap: var(--st-space-3);
    }

    /* Header: identity | centered CTA | contextual actions. */
    .st-commit-details__header {
      display: flex;
      align-items: center;
      gap: var(--st-space-2);
    }

    .st-commit-details__identity {
      display: flex;
      align-items: center;
      gap: var(--st-space-2);
      min-width: 0;
    }

    .st-commit-details__header-center {
      flex: 1 1 auto;
      display: flex;
      justify-content: center;
    }

    .st-commit-details__actions {
      flex: none;
      display: flex;
      align-items: center;
      gap: var(--st-space-2);
    }

    .st-commit-details__short-oid {
      font-family: var(--st-font-mono);
      font-size: var(--st-font-12);
      color: var(--st-color-muted);
    }

    .st-commit-details__title {
      margin: 0;
      font-size: var(--st-font-13);
      font-weight: 600;
    }

    .st-commit-details__description-block {
      display: flex;
      flex-direction: column;
      gap: var(--st-space-2);
    }

    .st-commit-details__subject-row {
      display: flex;
      align-items: flex-start;
      gap: var(--st-space-2);
    }

    .st-commit-details__subject {
      flex: 1 1 auto;
      min-width: 0;
      margin: 0;
      font-size: var(--st-font-22);
      font-weight: 600;
      line-height: var(--st-leading-tight);
      word-break: break-word;
    }

    /* Collapsed: the subject clamps to a single line so the header row stays
       compact and the disclosure's state reads at a glance. */
    .st-commit-details__subject--collapsed {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Exclusive view switch (description / changed files): pinned to the far
       right of the subject row, like the disclosure it replaces. */
    .st-commit-details__view-switch {
      flex: none;
    }

    .st-commit-details__description {
      margin: 0;
      font-size: var(--st-font-13);
      line-height: var(--st-leading-ui);
      color: var(--st-color-muted);
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* Changed files: an outer bordered block carrying the header row + a
       bordered, independently-scrolling body. */
    .st-commit-details__files {
      display: flex;
      flex-direction: column;
      gap: var(--st-space-2);
      padding: var(--st-space-2);
      border: var(--st-hairline) solid var(--st-color-border);
      border-radius: var(--st-radius-3);
      background: var(--st-color-surface);
    }

    .st-commit-details__files-header {
      display: flex;
      align-items: center;
      gap: var(--st-space-2);
    }

    .st-commit-details__files-heading {
      margin: 0;
      font-size: var(--st-font-11);
      font-weight: 600;
      color: var(--st-color-muted);
    }

    /* Inset body: its own surface + border so it reads as a distinct region,
       and its own scroll so a very long list never pushes the panel past the
       viewport (the host already scrolls). */
    .st-commit-details__files-body {
      display: flex;
      flex-direction: column;
      gap: var(--st-space-2);
      padding: var(--st-space-2) var(--st-space-3);
      border: var(--st-hairline) solid var(--st-color-border);
      border-radius: var(--st-radius-2);
      background: var(--st-color-surface-2);
      max-height: 320px;
      overflow: auto;
    }

    .st-commit-details__files-list {
      display: flex;
      flex-direction: column;
      gap: var(--st-space-1);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    /* Paths only: mono, no hunks and no diff. */
    .st-commit-details__file-path {
      font-size: var(--st-font-12);
      color: var(--st-color-text);
      word-break: break-all;
    }

    .st-commit-details__files-empty {
      margin: 0;
      font-size: var(--st-font-11);
      color: var(--st-color-muted);
    }

    /* Metadata footer: hairline-separated and dimmed so it never competes with
       the message above. */
    .st-commit-details__meta-block {
      display: flex;
      flex-direction: column;
      gap: var(--st-space-2);
      margin-top: var(--st-space-1);
      padding-top: var(--st-space-3);
      border-top: var(--st-hairline) solid var(--st-color-border);
      opacity: 0.75;
      color: var(--st-color-muted);
    }

    .st-commit-details__refs {
      display: flex;
      flex-wrap: wrap;
      gap: var(--st-space-1);
    }

    .st-commit-details__ref {
      padding: 1px 6px;
      border-radius: var(--st-radius-pill);
      border: var(--st-hairline) solid currentColor;
      font-size: var(--st-font-10);
    }

    .st-commit-details__ref--head {
      color: var(--st-color-ref-head);
    }

    .st-commit-details__ref--main {
      color: var(--st-color-ref-main);
    }

    .st-commit-details__ref--branch {
      color: var(--st-color-ref-branch);
    }

    .st-commit-details__ref--remote {
      color: var(--st-color-ref-remote);
    }

    .st-commit-details__ref--tag {
      color: var(--st-color-ref-tag);
    }

    .st-commit-details__ref--other {
      color: var(--st-color-muted);
    }

    .st-commit-details__meta {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--st-space-1) var(--st-space-3);
      margin: 0;
    }

    .st-commit-details__meta dt {
      color: var(--st-color-muted);
    }

    .st-commit-details__meta dd {
      margin: 0;
      word-break: break-all;
    }

    .st-commit-details__author {
      display: flex;
      align-items: center;
      gap: var(--st-space-2);
    }

    .st-commit-details__avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: none;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--st-color-avatar-bg);
      color: var(--st-color-avatar-fg);
      font-size: var(--st-font-10);
      font-weight: 600;
    }

    .st-commit-details__oid {
      display: block;
      font-family: var(--st-font-mono);
      color: var(--st-color-muted);
    }

    .st-commit-details__committer {
      margin: 0;
      font-size: var(--st-font-11);
      color: var(--st-color-muted);
      word-break: break-all;
    }

    .st-commit-details__empty {
      margin: 0;
      color: var(--st-color-muted);
    }
  `,
})
export class CommitDetailsPanel {
  readonly commit = input<Commit | null>(null);
  readonly isWip = input(false);
  /**
   * Opt-in primary CTA. Only the Repository/History host (`repo-page`) wires the
   * intent; screens that merely reuse this read-only panel (e.g. File status)
   * leave it at the default so no inert button leaks in.
   */
  readonly showCta = input(false);
  /**
   * Whether the ENTIRE description sector renders inside the panel: the subject
   * `h1` AND the exclusive view switch (plus the body in `description` mode).
   * The File-status commit embed sets this to false because it owns the subject
   * in its right-pane title; the History aside keeps the default `true` and
   * shows the sector inside the panel.
   */
  readonly showSubject = input(true);
  /**
   * Gates the inline changed-files sector. The History aside opts in (and with
   * it the exclusive switch appears); the File-status analyzer embed leaves it
   * off because it lists the commit's files itself in its left column, so a
   * second list — and a second switch — would be noise. Only meaningful
   * together with `showSubject`: the switch renders (so `files` is reachable)
   * only when both sectors are opted in.
   */
  readonly showFiles = input(false);
  /**
   * Which contextual action the header's action group renders: `release` (the
   * History "Back" control), `history` (the analyzer shortcut back to the graph,
   * also shown in the empty branch) or `none`.
   */
  readonly navMode = input<'none' | 'release' | 'history'>('none');
  /** Pressed state of the padlock (the graph lock pins the selected commit). */
  readonly locked = input(false);
  /** Analyzer-only action: reveal the commit in the graph. */
  readonly showInGraph = input(false);
  /**
   * Changed-file paths of the selected commit. Rendered read-only in the
   * changed-files block — paths only, never a diff. Default empty so a host
   * that does not wire it simply shows the empty-state line.
   */
  readonly changedFiles = input<readonly string[]>([]);

  /** Single primary intent: the owning page routes it to `/repo/file-status`. */
  readonly reviewChanges = output<void>();
  /** Toggle the graph lock (pin/release the selected commit). */
  readonly lockToggle = output<void>();
  /** Release the pinned selection (History host). */
  readonly release = output<void>();
  /** Return to the graph from the analyzer embed. */
  readonly openHistory = output<void>();
  /** Reveal the commit in the graph (analyzer). */
  readonly revealInGraph = output<void>();

  /**
   * Exclusive view mode: exactly one of `description` (the subject + body) or
   * `files` (the changed-file list) is visible. View state owned here, like
   * `fileFilter`; a host never sees or shares it.
   */
  readonly mode = signal<'description' | 'files'>('description');

  /**
   * The mode actually rendered. A commit with no body can never land in
   * `description` (the segment is disabled and the mode is forced to `files`),
   * so an empty description view is impossible.
   */
  readonly effectiveMode = computed<'description' | 'files'>(() =>
    this.hasDescription() ? this.mode() : 'files',
  );

  /**
   * Segments of the exclusive view switch. The `description` segment is
   * disabled when the commit has no body (there would be nothing to show); the
   * `files` segment carries the changed-file count.
   */
  readonly modeOptions = computed<readonly ToggleOption[]>(() => [
    {
      value: 'description',
      label: this.descriptionSegmentLabel,
      disabled: !this.hasDescription(),
    },
    { value: 'files', label: this.filesSegmentLabel, count: this.changedFiles().length },
  ]);

  private readonly descriptionSegmentLabel = $localize`Description`;
  private readonly filesSegmentLabel = $localize`Files`;

  /** Shared accessible name of the exclusive view switch. */
  readonly viewSwitchLabel = $localize`Description or changed files`;

  /** Live filter text for the changed-file list (owned here; the panel is dumb). */
  readonly fileFilter = signal('');

  /** Stable id linking the changed-files heading to the region it labels. */
  readonly filesHeadingId = 'st-commit-details-files-heading';

  /** Filter field placeholder + accessible name. */
  readonly filterPlaceholder = $localize`Filter changed files`;
  readonly filterLabel = $localize`Filter changed files`;

  /** Accessible name of the analyzer-only "show in graph" action. */
  readonly showInGraphLabel = $localize`Show in graph`;

  /**
   * The padlock can only pin a real commit: the empty state has nothing to pin
   * and the synthetic WIP row is not a commit.
   */
  readonly canLock = computed(() => this.commit() !== null && !this.isWip());

  /** Pressed-state label of the padlock. */
  readonly lockLabel = computed(() =>
    this.locked() ? $localize`Unlock commit` : $localize`Lock commit`,
  );

  readonly refs = computed(() => this.commit()?.refs ?? []);
  readonly parents = computed(() => this.commit()?.parents ?? []);

  /** First 7 hex characters of the commit oid (git's default abbreviation). */
  readonly shortOid = computed(() => shortOidHex(this.commit()?.oid?.hex));

  /** Subject/body split on the first blank line (plan §4.3). */
  private readonly messageParts = computed(() => splitCommitMessage(this.commit()?.message ?? ''));
  readonly subject = computed(() => this.messageParts().subject);
  readonly description = computed(() => this.messageParts().description);

  /** Whether the commit carries a body (the disclosure only matters then). */
  readonly hasDescription = computed(() => this.description().length > 0);

  /**
   * Normalized filter query: trimmed and lowercased once so both the "active"
   * check and the match test agree.
   */
  private readonly normalizedFilter = computed(() => this.fileFilter().trim().toLowerCase());

  readonly filterActive = computed(() => this.normalizedFilter().length > 0);

  /**
   * The visible file paths. Case-insensitive **substring** match via
   * `String#includes` — never a RegExp, so filter metacharacters (`*`, `[`, `]`,
   * `.`) stay literal and a path is never matched by an unintended pattern.
   */
  readonly filteredFiles = computed(() => {
    const query = this.normalizedFilter();
    if (!query) return this.changedFiles();
    return this.changedFiles().filter((path) => path.toLowerCase().includes(query));
  });

  /**
   * `N changed files` heading (singular/plural aware). While a filter is active
   * it reads `N of M changed files` so the user sees both the match count and
   * the total.
   */
  readonly filesHeading = computed(() => {
    const total = this.changedFiles().length;
    if (this.filterActive()) {
      return $localize`${this.filteredFiles().length} of ${total} changed files`;
    }
    return total === 1 ? $localize`1 changed file` : $localize`${total} changed files`;
  });

  /** Pick the visible sector. Unknown values are ignored. */
  setMode(value: string): void {
    if (value !== 'description' && value !== 'files') return;
    this.mode.set(value);
  }

  /** Head ref when present, otherwise the first ref (plan §4.3 branch chip). */
  readonly branchChip = computed<string | null>(() => {
    const refs = this.refs();
    if (!refs.length) return null;
    const head = refs.find((ref) => ref.kind === 'head');
    return (head ?? refs[0]).name;
  });

  /** `Name <email>` for the author line, or an em dash when absent. */
  readonly authorLabel = computed(() => {
    const author = this.commit()?.author;
    return author ? `${author.name} <${author.email}>` : '—';
  });

  /**
   * Up-to-two-letter initials for the avatar: the first letters of the first
   * two whitespace-separated words, uppercased. `?` when there is no author.
   */
  readonly authorInitials = computed(() => {
    const name = this.commit()?.author?.name?.trim();
    if (!name) return '?';
    const initials = name
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('');
    return initials || '?';
  });

  signature(sig: Signature | undefined): string {
    return sig ? `${sig.name} <${sig.email}> · ${sig.when}` : '—';
  }

  refSummary(): string {
    const refs = this.refs();
    if (!refs.length) return '—';
    return refs.map((ref) => `${ref.name} (${ref.kind})`).join(', ');
  }

  /**
   * Classes for one ref pill. A mainline local branch (`main`/`master`) reads
   * mint (`--main`); every other ref keeps its per-kind colour
   * (`--head`/`--branch`/`--remote`/`--tag`/`--other`), matching `st-graph-row`.
   */
  refClass(ref: RefLabel): string {
    const kind = normalizeRefKind(ref.kind);
    if (kind === 'branch' && isMainlineBranch(ref.name)) {
      return 'st-commit-details__ref st-commit-details__ref--main';
    }
    return `st-commit-details__ref st-commit-details__ref--${kind}`;
  }
}
