import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ButtonVariant = 'default' | 'primary' | 'ghost';
export type ButtonSize = 'sm' | 'md';
export type ButtonType = 'button' | 'submit' | 'reset';

/**
 * Dumb button: a native `<button>` with projected label. Consumers attach
 * `(click)` on the `<st-button>` host — the inner button's click bubbles up.
 */
@Component({
  selector: 'st-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'st-button-host',
    '[class.st-button-host--disabled]': 'disabled()',
  },
  template: `
    <button
      class="st-button st-button--{{ variant() }} st-button--{{ size() }}"
      data-testid="button"
      [type]="type()"
      [disabled]="disabled()"
      [attr.aria-label]="ariaLabel() || null"
    >
      <ng-content />
    </button>
  `,
  styles: `
    :host {
      display: inline-block;
    }

    :host(.st-button-host--disabled) {
      opacity: 0.5;
      cursor: default;
    }

    .st-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid var(--st-color-border, #2f2f44);
      border-radius: 6px;
      background: var(--st-color-surface, #252536);
      color: var(--st-color-text, #d6d6de);
      font: inherit;
      cursor: pointer;
      transition:
        background-color 120ms ease,
        border-color 120ms ease;
    }

    .st-button--sm {
      height: 24px;
      padding: 0 8px;
      font-size: 11px;
    }

    .st-button--md {
      height: 30px;
      padding: 0 12px;
      font-size: 12px;
    }

    .st-button--primary {
      background: var(--st-color-accent, #0a84ff);
      border-color: var(--st-color-accent, #0a84ff);
      color: #ffffff;
    }

    .st-button--ghost {
      background: transparent;
      border-color: transparent;
    }

    .st-button:not(:disabled):hover {
      border-color: var(--st-color-accent, #0a84ff);
    }

    .st-button--primary:not(:disabled):hover {
      background: color-mix(in srgb, var(--st-color-accent, #0a84ff) 85%, #ffffff);
    }

    .st-button:disabled {
      cursor: default;
    }

    .st-button:focus-visible {
      outline: 2px solid var(--st-color-accent, #0a84ff);
      outline-offset: 1px;
    }
  `,
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('default');
  readonly size = input<ButtonSize>('md');
  readonly disabled = input(false);
  readonly type = input<ButtonType>('button');
  readonly ariaLabel = input('');
}
