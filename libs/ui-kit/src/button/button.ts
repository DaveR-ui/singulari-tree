import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger' | 'icon';
export type ButtonSize = 'sm' | 'md';
export type ButtonType = 'button' | 'submit' | 'reset';

/**
 * Dumb button: a native `<button>` with projected label. Consumers attach
 * `(click)` on the `<st-button>` host — the inner button's click bubbles up.
 *
 * Toggle buttons set `[pressed]` to `true`/`false`: it is forwarded as
 * `aria-pressed` on the inner native `<button>` so assistive tech reads the
 * pressed state (which would otherwise be exposed only visually by a host
 * class). The default `null` drops the attribute entirely — a plain button is
 * not a toggle.
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
      [attr.aria-pressed]="pressed()"
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
      border: 1px solid var(--st-color-border);
      border-radius: 6px;
      background: var(--st-color-surface);
      color: var(--st-color-text);
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
      background: var(--st-color-accent);
      border-color: var(--st-color-accent);
      color: var(--st-color-accent-contrast);
    }

    .st-button--ghost {
      background: transparent;
      border-color: transparent;
    }

    .st-button--danger {
      background: transparent;
      border-color: transparent;
      color: var(--st-color-danger);
    }

    .st-button--icon {
      padding: 0;
    }

    .st-button--icon.st-button--sm {
      width: var(--st-size-control-sm);
      height: var(--st-size-control-sm);
      min-width: var(--st-size-control-sm);
    }

    .st-button--icon.st-button--md {
      width: var(--st-size-control-md);
      height: var(--st-size-control-md);
      min-width: var(--st-size-control-md);
    }

    .st-button:not(:disabled):hover {
      border-color: var(--st-color-accent);
    }

    .st-button--primary:not(:disabled):hover {
      background: color-mix(in srgb, var(--st-color-accent) 85%, var(--st-color-accent-contrast));
    }

    /* Declared after the generic hover so the transparent border wins. */
    .st-button--danger:not(:disabled):hover {
      background: var(--st-color-danger-soft);
      border-color: transparent;
    }

    .st-button:disabled {
      cursor: default;
    }

    .st-button:focus-visible {
      outline: 2px solid var(--st-color-focus);
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
  /** `aria-pressed` for toggle buttons; `null` (default) renders no attribute. */
  readonly pressed = input<boolean | null>(null);
}
