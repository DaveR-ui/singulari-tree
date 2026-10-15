import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import type { Commit, Signature } from '@contracts/domain';
import {
  BadgeComponent,
  ButtonComponent,
  IconComponent,
  normalizeRefKind,
  shortOidHex,
} from '@singularitree/ui-kit';

/** Blank-line separator between a commit subject and its body (LF LF). */
const BLANK_LINE = String.fromCharCode(10, 10);

/**
 * Read-only details panel for the selected commit (plan §4.3, decision #8).
 * Dumb: it only renders the `commit` input (or the WIP placeholder) and emits
 * the single primary intent. It holds no services and does not route — the
 * owning page decides what `reviewChanges` means.
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

        <h2
          class="st-commit-details__subject"
          [class.st-commit-details__subject--compact]="collapsible()"
          data-testid="commit-details-subject"
        >
          {{ subject() }}
        </h2>

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
              [attr.aria-expanded]="expanded()"
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
                <span class="st-commit-details__ref" [class]="refClass(ref.kind)">{{ ref.name }}</span>
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
            }
            @if (showNavigation()) {
              <st-button
                variant="default"
                size="sm"
                data-testid="commit-details-view-in-tree"
                (click)="viewInTree.emit()"
              >
                <st-icon name="branch" />
                <span i18n>View in tree</span>
              </st-button>
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
   * Opt-in navigation row (`View in tree` + `Back`). Only the History host wires
   * it; the File-status embed leaves it off so no inert control leaks in.
   */
  readonly showNavigation = input(false);

  /** Single primary intent: the owning page routes it to `/repo/file-status`. */
  readonly reviewChanges = output<void>();
  /** Jump to this commit's node in the tree/working-tree view (History host). */
  readonly viewInTree = output<void>();
  /** Go back to the previous History selection (History host). */
  readonly back = output<void>();

  /**
   * Disclosure state of the compact embed. Collapsed by default because the
   * file ITEMS are the point of that pane; the description is opt-in detail.
   */
  readonly expanded = signal(false);

  readonly showDetailsLabel = $localize`Commit details`;
  readonly hideDetailsLabel = $localize`Hide details`;

  toggleExpanded(): void {
    this.expanded.set(!this.expanded());
  }

  readonly refs = computed(() => this.commit()?.refs ?? []);
  readonly parents = computed(() => this.commit()?.parents ?? []);

  /** First 7 hex characters of the commit oid (git's default abbreviation). */
  readonly shortOid = computed(() => shortOidHex(this.commit()?.oid?.hex));

  /** Subject/body split on the first blank line (plan §4.3). */
  private readonly messageParts = computed(() => {
    const message = this.commit()?.message ?? '';
    // The blank-line separator is LF LF; built from char codes to keep the
    // source free of escape sequences.
    const split = message.indexOf(BLANK_LINE);
    if (split === -1) return { subject: message.trim(), description: '' };
    return {
      subject: message.slice(0, split).trim(),
      description: message.slice(split + BLANK_LINE.length).trim(),
    };
  });
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

  refClass(kind: string): string {
    return `st-commit-details__ref st-commit-details__ref--${normalizeRefKind(kind)}`;
  }
}
