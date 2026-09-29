import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Commit, Signature } from '@contracts/domain';
import { normalizeRefKind } from '@singularitree/ui-kit';

/**
 * Read-only details panel for the selected commit (GitKraken-style). Dumb: it
 * only renders the `commit` input (or the WIP placeholder) and holds no services.
 */
@Component({
  selector: 'st-commit-details-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isWip()) {
      <section class="st-commit-details" data-testid="commit-details-wip">
        <h2 class="st-commit-details__title">Working tree</h2>
        <p class="st-commit-details__empty">Uncommitted changes (WIP) — stage and commit to add a node.</p>
      </section>
    } @else if (commit(); as selected) {
      <section class="st-commit-details" data-testid="commit-details">
        <h2 class="st-commit-details__title" data-testid="commit-details-oid">
          {{ selected.oid?.hex ?? 'unknown' }}
        </h2>

        @if (refs().length) {
          <div class="st-commit-details__refs" data-testid="commit-details-refs">
            @for (ref of refs(); track ref.kind + ':' + ref.name) {
              <span class="st-commit-details__ref" [class]="refClass(ref.kind)">{{ ref.name }}</span>
            }
          </div>
        }

        <pre class="st-commit-details__message" data-testid="commit-details-message">{{ selected.message }}</pre>

        <dl class="st-commit-details__meta">
          <dt>Author</dt>
          <dd data-testid="commit-details-author">{{ signature(selected.author) }}</dd>
          <dt>Committer</dt>
          <dd data-testid="commit-details-committer">{{ signature(selected.committer) }}</dd>
          <dt>Date</dt>
          <dd data-testid="commit-details-date">{{ selected.committedAt }}</dd>
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
      height: 100%;
      overflow: auto;
      padding: 12px;
      font-size: 12px;
      color: var(--st-color-text, #d6d6de);
    }

    .st-commit-details__title {
      margin: 0 0 8px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      word-break: break-all;
      opacity: 0.85;
    }

    .st-commit-details__refs {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 8px;
    }

    .st-commit-details__ref {
      padding: 1px 6px;
      border-radius: 999px;
      border: 1px solid currentColor;
      font-size: 10px;
    }

    .st-commit-details__ref--head {
      color: #0a84ff;
    }

    .st-commit-details__ref--branch {
      color: #30d158;
    }

    .st-commit-details__ref--remote {
      color: #ff9f0a;
    }

    .st-commit-details__ref--tag {
      color: #bf5af2;
    }

    .st-commit-details__ref--other {
      opacity: 0.7;
    }

    .st-commit-details__message {
      margin: 0 0 12px;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: inherit;
    }

    .st-commit-details__meta {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 10px;
      margin: 0;
    }

    .st-commit-details__meta dt {
      opacity: 0.55;
    }

    .st-commit-details__meta dd {
      margin: 0;
      word-break: break-all;
    }

    .st-commit-details__oid {
      display: block;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      opacity: 0.75;
    }

    .st-commit-details__empty {
      margin: 0;
      opacity: 0.6;
    }
  `,
})
export class CommitDetailsPanel {
  readonly commit = input<Commit | null>(null);
  readonly isWip = input(false);

  readonly refs = computed(() => this.commit()?.refs ?? []);
  readonly parents = computed(() => this.commit()?.parents ?? []);

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
