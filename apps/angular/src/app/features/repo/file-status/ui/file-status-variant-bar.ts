import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { FileStatusVariant } from '../file-status.models';

/**
 * Variant bar of the "File Status" screen (ADR-0029): the three variant
 * buttons plus the PR-only base/target ref controls.
 *
 * Dumb and presentational — it renders its inputs and emits user intent; the
 * owning page binds those events to `FileStatusStore`. The base branch is an
 * **editable** input (datalist-backed from the loaded branch names) so an
 * arbitrary ref can be typed, while the target is a plain `<select>` of the
 * known branch names.
 */
@Component({
  selector: 'st-file-status-variant-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="st-file-status-variant"
      role="group"
      aria-label="File status variant"
      i18n-aria-label
    >
      <button
        type="button"
        class="st-file-status-variant__button"
        data-testid="variant-local"
        [class.st-file-status-variant__button--active]="variant() === 'local'"
        [attr.aria-pressed]="variant() === 'local'"
        (click)="variantChange.emit('local')"
        i18n
      >
        Local
      </button>
      <button
        type="button"
        class="st-file-status-variant__button"
        data-testid="variant-commit"
        [class.st-file-status-variant__button--active]="variant() === 'commit'"
        [attr.aria-pressed]="variant() === 'commit'"
        (click)="variantChange.emit('commit')"
        i18n
      >
        Commit
      </button>
      <button
        type="button"
        class="st-file-status-variant__button"
        data-testid="variant-pr"
        [class.st-file-status-variant__button--active]="variant() === 'pr'"
        [attr.aria-pressed]="variant() === 'pr'"
        (click)="variantChange.emit('pr')"
        i18n
      >
        Pull request
      </button>

      @if (variant() === 'pr') {
        <div class="st-file-status-variant__refs">
          <label class="st-file-status-variant__ref">
            <span class="st-file-status-variant__ref-label" i18n>Base branch</span>
            <input
              type="text"
              class="st-file-status-variant__input"
              data-testid="pr-base-input"
              list="st-file-status-variant__base-options"
              [value]="baseRef()"
              (input)="onBase($event)"
            />
          </label>
          <datalist id="st-file-status-variant__base-options">
            @for (name of branches(); track name) {
              <option [value]="name"></option>
            }
          </datalist>

          <label class="st-file-status-variant__ref">
            <span class="st-file-status-variant__ref-label" i18n>Target branch</span>
            <select
              class="st-file-status-variant__select"
              data-testid="pr-target-select"
              (change)="onTarget($event)"
            >
              @for (name of branches(); track name) {
                <option [value]="name" [selected]="name === targetRef()">{{ name }}</option>
              }
            </select>
          </label>
        </div>
      }
    </div>
  `,
  styles: `
    .st-file-status-variant {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--st-color-border, #2f2f44);
      font-size: 12px;
      color: var(--st-color-text, #d6d6de);
    }

    .st-file-status-variant__button {
      padding: 3px 10px;
      border: 1px solid var(--st-color-border, #2f2f44);
      border-radius: 999px;
      background: var(--st-color-surface, #252536);
      color: inherit;
      font: inherit;
      cursor: pointer;
    }

    .st-file-status-variant__button:hover {
      border-color: var(--st-color-accent, #0a84ff);
    }

    .st-file-status-variant__button--active {
      border-color: var(--st-color-accent, #0a84ff);
      background: color-mix(in srgb, var(--st-color-accent, #0a84ff) 22%, transparent);
      font-weight: 600;
    }

    .st-file-status-variant__refs {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-left: auto;
    }

    .st-file-status-variant__ref {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .st-file-status-variant__ref-label {
      opacity: 0.6;
      white-space: nowrap;
    }

    .st-file-status-variant__input,
    .st-file-status-variant__select {
      max-width: 180px;
      padding: 2px 6px;
      border: 1px solid var(--st-color-border, #2f2f44);
      border-radius: 4px;
      background: var(--st-color-surface, #252536);
      color: inherit;
      font: inherit;
    }
  `,
})
export class FileStatusVariantBar {
  /** Variant currently shown; drives the active marker and the PR controls. */
  readonly variant = input<FileStatusVariant>('local');
  /** Ref names offered as the PR base/target (the `getBranches` names). */
  readonly branches = input<string[]>([]);
  /** Current PR base ref name (editable: any ref, resolved by the page). */
  readonly baseRef = input('');
  /** Current PR target ref name. */
  readonly targetRef = input('');

  readonly variantChange = output<FileStatusVariant>();
  readonly baseRefChange = output<string>();
  readonly targetRefChange = output<string>();

  onBase(event: Event): void {
    this.baseRefChange.emit((event.target as HTMLInputElement).value);
  }

  onTarget(event: Event): void {
    this.targetRefChange.emit((event.target as HTMLSelectElement).value);
  }
}
