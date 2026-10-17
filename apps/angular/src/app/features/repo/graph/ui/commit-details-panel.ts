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
  isMainlineBranch,
  normalizeRefKind,
  shortOidHex,
} from '@singularitree/ui-kit';
import { splitCommitMessage } from './commit-message';

/**
 * Read-only details panel for the selected commit (plan §4.3, decision #8).
 * Dumb: it only renders the `commit` input (or the WIP placeholder) and emits
 * the single primary intent. It holds no services and does not route — the
 * owning page decides what `reviewChanges` means.
 *
 * One read-only surface: a changed-file **path list** disclosed from a small
 * affordance next to the primary CTA and rendered inline in the panel body
 * while expanded. It renders the `changedFiles` input as plain rows (no hunks,
 * no diff, no `st-diff-viewer`); the host owns the read.
 *
 * `collapsible` is the File-status embed: there the panel is the *header* above
 * a changed-file list, so it must never eat the list's vertical slack. In that
 * mode it collapses to a compact head (hash + branch chip + 13px subject + one
 * byline) and hides the detail block behind a disclosure, and its host stops
 * being greedy (no `height: 100%`). The default (false) is the History aside's
 * full detail panel.
 */
@Component({
  selector: 'st-commit-details-panel',
  standalone: true,
  imports: [BadgeComponent, ButtonComponent, IconComponent],
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
    } @else if (commit(); as selected) {
      <section class="st-commit-details" data-testid="commit-details">
        <header class="st-commit-details__header">
          <span class="st-commit-details__short-oid" data-testid="commit-details-short-oid">{{
            shortOid()
          }}</span>
          @if (branchChip(); as branch) {
            <st-badge variant="branch" data-testid="commit-details-branch">{{ branch }}</st-badge>
          }
        </header>

        @if (showSubject()) {
          <h2
            class="st-commit-details__subject"
            [class.st-commit-details__subject--compact]="collapsible()"
            data-testid="commit-details-subject"
          >
            {{ subject() }}
          </h2>
        }

        @if (collapsible()) {
          <!-- Compact head: the changed-file list below owns the slack, so the
               panel ships only the identity (hash, branch, subject) plus one
               byline, and folds everything else behind the disclosure. -->
          <div class="st-commit-details__compact">
            <p class="st-commit-details__byline" data-testid="commit-details-byline">
              {{ authorLabel() }} · {{ selected.committedAt }}
            </p>
            <st-button
              class="st-commit-details__toggle"
              variant="ghost"
              size="sm"
              data-testid="commit-details-toggle"
              [expanded]="expanded()"
              [ariaLabel]="expanded() ? hideDetailsLabel : showDetailsLabel"
              (click)="toggleExpanded()"
            >
              <st-icon
                class="st-commit-details__chevron"
                name="chevron-down"
                [class.st-commit-details__chevron--open]="expanded()"
              />
            </st-button>
          </div>
        }

        @if (!collapsible() || expanded()) {
          @if (description(); as body) {
            <p class="st-commit-details__description" data-testid="commit-details-description">
              {{ body }}
            </p>
          }

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
        }

        @if (showCta() || showNavigation()) {
          <div class="st-commit-details__actions">
            @if (showCta()) {
              <st-button
                class="st-commit-details__cta"
                variant="primary"
                data-testid="commit-details-review"
                (click)="reviewChanges.emit()"
                i18n
                >Review changes</st-button
              >
              <!--
                The selected commit's changed-file list is disclosed from this
                affordance next to the CTA and rendered inline in the panel body
                below while expanded. It is gated on the same showCta condition
                that renders the CTA, so the File-status embed (which leaves
                showCta at its default) never grows a History-only control. The
                WIP and empty branches render no affordance at all.
              -->
              <st-button
                variant="ghost"
                size="sm"
                data-testid="commit-details-files"
                [expanded]="filesOpen()"
                [attr.aria-controls]="filesBodyId"
                [ariaLabel]="filesLabel"
                (click)="toggleFiles()"
              >
                <st-icon name="changes" />
              </st-button>
            }
            @if (showNavigation()) {
              <st-button
                variant="ghost"
                size="sm"
                data-testid="commit-details-back"
                (click)="back.emit()"
              >
                <st-icon name="chevron-left" />
                <span i18n>Back</span>
              </st-button>
            }
          </div>
        }

        @if (showCta() && filesOpen()) {
          <!--
            Read-only changed-file list, inline in the panel body. The expanded
            block owns its own inset/bordered surface (distinct from the panel
            background) and its own scroll so a very long list never pushes the
            panel past the viewport. Paths only — no hunks, no diff.
          -->
          <div
            class="st-commit-details__files-body"
            [attr.id]="filesBodyId"
            role="region"
            [attr.aria-labelledby]="filesHeadingId"
          >
            <p
              class="st-commit-details__files-heading"
              data-testid="commit-details-files-heading"
              [attr.id]="filesHeadingId"
            >
              {{ filesHeading() }}
            </p>
            @if (changedFiles().length) {
              <ul class="st-commit-details__files-list">
                @for (path of changedFiles(); track path) {
                  <li
                    class="st-commit-details__file-path st-mono"
                    data-testid="commit-details-file-path"
                  >
                    {{ path }}
                  </li>
                }
              </ul>
            } @else {
              <p
                class="st-commit-details__files-empty"
                data-testid="commit-details-files-empty"
                i18n
              >
                No changed files.
              </p>
            }
          </div>
        }
      </section>
    } @else {
      <p class="st-commit-details__empty" data-testid="commit-details-empty">
        Select a commit to see its details.
      </p>
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
      gap: var(--st-space-2);
    }

    .st-commit-details__header {
      display: flex;
      align-items: center;
      gap: var(--st-space-2);
    }

    .st-commit-details__short-oid {
      font-family: var(--st-font-mono);
      font-size: var(--st-font-13);
      color: var(--st-color-accent);
    }

    .st-commit-details__title {
      margin: 0;
      font-size: var(--st-font-13);
      font-weight: 600;
    }

    .st-commit-details__subject {
      margin: 0;
      font-size: var(--st-font-22);
      font-weight: 600;
      line-height: var(--st-leading-tight);
      word-break: break-word;
    }

    /* Compact head: the subject drops to a row-sized label so the file list
       below keeps the height. */
    .st-commit-details__subject--compact {
      font-size: var(--st-font-13);
    }

    .st-commit-details__compact {
      display: flex;
      align-items: center;
      gap: var(--st-space-2);
    }

    .st-commit-details__byline {
      flex: 1 1 auto;
      min-width: 0;
      margin: 0;
      font-size: var(--st-font-11);
      color: var(--st-color-muted);
      word-break: break-word;
    }

    .st-commit-details__toggle {
      flex: none;
    }

    .st-commit-details__chevron {
      transition: transform var(--st-motion-fast) var(--st-ease);
    }

    /* Rotation is applied to the icon host (the parent template owns the
       projected st-icon, so this rule reaches it without ::ng-deep). */
    .st-commit-details__chevron--open {
      transform: rotate(180deg);
    }

    .st-commit-details__actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--st-space-2);
    }

    /* The primary CTA keeps the full-width prominence it had as a direct flex
       child of the column before the actions row existed. */
    .st-commit-details__cta {
      flex: 1 1 auto;
    }

    /* Inline changed-file list: its own inset, bordered surface so it reads as
       distinct from the panel body, and its own scroll so a very long list never
       pushes the panel past the viewport (the host already scrolls). */
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

    .st-commit-details__files-heading {
      margin: 0;
      font-size: var(--st-font-11);
      font-weight: 600;
      color: var(--st-color-muted);
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

    .st-commit-details__description {
      margin: 0;
      font-size: var(--st-font-13);
      line-height: var(--st-leading-ui);
      color: var(--st-color-muted);
      white-space: pre-wrap;
      word-break: break-word;
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
   * Embed mode of the File-status screen: the panel collapses to a compact head
   * and folds its detail block behind a disclosure, so the changed-file list
   * below it keeps the dominant share of the column. Default false keeps the
   * History aside's full detail panel.
   */
  readonly collapsible = input(false);
  /**
   * Whether the subject headline renders inside the panel. The File-status
   * commit embed sets this to false because it moves the subject to the
   * right-pane title above the diff; the History aside keeps the default `true`
   * and shows the subject inside the panel.
   */
  readonly showSubject = input(true);
  /**
   * Opt-in navigation row (the `Back` control). Only the History host wires it;
   * the File-status embed leaves it off so no inert control leaks in.
   */
  readonly showNavigation = input(false);
  /**
   * Changed-file paths of the selected commit. Rendered read-only inline behind
   * the disclosure next to the CTA — paths only, never a diff. Default empty so
   * a host that does not wire it simply shows the empty-state line.
   */
  readonly changedFiles = input<readonly string[]>([]);

  /** Single primary intent: the owning page routes it to `/repo/file-status`. */
  readonly reviewChanges = output<void>();
  /** Go back to the previous History selection (History host). */
  readonly back = output<void>();

  /**
   * Disclosure state of the compact embed. Collapsed by default because the
   * file ITEMS are the point of that pane; the description is opt-in detail.
   */
  readonly expanded = signal(false);

  /** Disclosure state of the inline changed-file list next to the CTA. */
  readonly filesOpen = signal(false);

  /** Stable ids linking the changed-file trigger to the region it reveals. */
  readonly filesBodyId = 'st-commit-details-files-body';
  readonly filesHeadingId = 'st-commit-details-files-heading';

  readonly showDetailsLabel = $localize`Commit details`;
  readonly hideDetailsLabel = $localize`Hide details`;

  /** Accessible name of the changed-file trigger. */
  readonly filesLabel = $localize`Changed files`;

  /** `N changed files` heading inside the expanded panel (singular/plural aware). */
  readonly filesHeading = computed(() => {
    const count = this.changedFiles().length;
    return count === 1 ? $localize`1 changed file` : $localize`${count} changed files`;
  });

  toggleExpanded(): void {
    this.expanded.set(!this.expanded());
  }

  toggleFiles(): void {
    this.filesOpen.set(!this.filesOpen());
  }

  readonly refs = computed(() => this.commit()?.refs ?? []);
  readonly parents = computed(() => this.commit()?.parents ?? []);

  /** First 7 hex characters of the commit oid (git's default abbreviation). */
  readonly shortOid = computed(() => shortOidHex(this.commit()?.oid?.hex));

  /** Subject/body split on the first blank line (plan §4.3). */
  private readonly messageParts = computed(() => splitCommitMessage(this.commit()?.message ?? ''));
  readonly subject = computed(() => this.messageParts().subject);
  readonly description = computed(() => this.messageParts().description);

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
