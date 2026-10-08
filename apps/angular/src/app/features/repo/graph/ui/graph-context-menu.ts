import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import {
  checkoutTargetFor,
  type CheckoutTarget,
  type GraphContextMenuTarget,
  type ResetModeName,
} from '../graph-menu.models';

/**
 * Dumb, positioned right-click menu for a commit row (ADR-0022, ADR-028).
 *
 * It renders Checkout / Compare / Copy SHA, the create-branch-here and
 * tag-this-commit entries (lit up in M3 once the ref RPCs landed, ADR-028), and
 * the Reset submenu (soft/mixed/hard). Cherry-pick and revert remain out of
 * scope and are never rendered: no dead actions ship.
 *
 * The component performs no RPC and touches no Git: it emits the chosen action
 * and the owning store/page decides what to do. It is dismissable via Escape,
 * an outside click, or a second context-menu gesture, and supports Arrow
 * Up/Down focus movement for keyboard use.
 */
@Component({
  selector: 'st-graph-context-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open() && target(); as ctx) {
      <div
        class="st-graph-context-menu__backdrop"
        data-testid="ctx-backdrop"
        (click)="closed.emit()"
        (contextmenu)="onBackdropContextMenu($event)"
      ></div>
      <div
        class="st-graph-context-menu"
        role="menu"
        aria-label="Commit actions"
        data-testid="graph-context-menu"
        [style.left.px]="x()"
        [style.top.px]="y()"
        (keydown)="onKeydown($event)"
      >
        <button
          type="button"
          role="menuitem"
          class="st-graph-context-menu__item"
          data-testid="ctx-checkout"
          [disabled]="busy()"
          (click)="onCheckout(ctx)"
        >
          <span>Checkout</span>
          <span class="st-graph-context-menu__hint" data-testid="ctx-checkout-target">{{
            checkoutTarget(ctx).label
          }}</span>
        </button>

        <button
          type="button"
          role="menuitem"
          class="st-graph-context-menu__item"
          data-testid="ctx-compare"
          [disabled]="!canCompare() || busy()"
          (click)="onCompare()"
        >
          Compare with selected
        </button>

        <button
          type="button"
          role="menuitem"
          class="st-graph-context-menu__item"
          data-testid="ctx-copy-sha"
          [disabled]="busy()"
          (click)="copySha.emit(ctx.oid)"
        >
          Copy SHA
        </button>

        <div class="st-graph-context-menu__separator" role="separator"></div>

        <button
          type="button"
          role="menuitem"
          class="st-graph-context-menu__item"
          data-testid="ctx-create-branch"
          [disabled]="busy()"
          (click)="onCreateBranchHere(ctx)"
        >
          Create branch here…
        </button>
        <button
          type="button"
          role="menuitem"
          class="st-graph-context-menu__item"
          data-testid="ctx-tag"
          [disabled]="busy()"
          (click)="onTagCommit(ctx)"
        >
          Tag this commit…
        </button>

        <div class="st-graph-context-menu__separator" role="separator"></div>
        <div class="st-graph-context-menu__group" aria-hidden="true">Reset</div>

        <button
          type="button"
          role="menuitem"
          class="st-graph-context-menu__item"
          data-testid="ctx-reset-soft"
          [disabled]="busy()"
          (click)="reset.emit(SOFT)"
        >
          Soft — keep changes staged
        </button>
        <button
          type="button"
          role="menuitem"
          class="st-graph-context-menu__item"
          data-testid="ctx-reset-mixed"
          [disabled]="busy()"
          (click)="reset.emit(MIXED)"
        >
          Mixed — unstage, keep files
        </button>
        <button
          type="button"
          role="menuitem"
          class="st-graph-context-menu__item st-graph-context-menu__item--danger"
          data-testid="ctx-reset-hard"
          [disabled]="busy()"
          (click)="reset.emit(HARD)"
        >
          Hard — discard changes…
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .st-graph-context-menu__backdrop {
      position: fixed;
      inset: 0;
      z-index: 119;
    }

    .st-graph-context-menu {
      position: fixed;
      z-index: 120;
      min-width: 208px;
      padding: 4px;
      background: var(--st-color-surface, #252536);
      border: 1px solid var(--st-color-border, #2f2f44);
      border-radius: 8px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
      color: var(--st-color-text, #d6d6de);
      font-size: 12px;
    }

    .st-graph-context-menu__item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 6px 10px;
      background: transparent;
      border: 0;
      border-radius: 5px;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .st-graph-context-menu__item:hover:not(:disabled),
    .st-graph-context-menu__item:focus-visible {
      background: color-mix(in srgb, var(--st-color-accent, #0a84ff) 22%, transparent);
      outline: none;
    }

    .st-graph-context-menu__item:disabled {
      opacity: 0.4;
      cursor: default;
    }

    .st-graph-context-menu__item--danger {
      color: #ff6b6b;
    }

    .st-graph-context-menu__hint {
      margin-left: auto;
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      opacity: 0.6;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
    }

    .st-graph-context-menu__separator {
      height: 1px;
      margin: 4px 6px;
      background: var(--st-color-border, #2f2f44);
    }

    .st-graph-context-menu__group {
      padding: 4px 10px 2px;
      opacity: 0.5;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
  `,
})
export class GraphContextMenu {
  readonly open = input(false);
  readonly x = input(0);
  readonly y = input(0);
  readonly target = input<GraphContextMenuTarget | null>(null);
  /** True when a different commit is selected and can act as the compare base. */
  readonly canCompare = input(false);
  /** True while an owning store operation is in flight (disables every entry). */
  readonly busy = input(false);

  readonly checkout = output<CheckoutTarget>();
  readonly compare = output<void>();
  readonly copySha = output<string>();
  /** Create a branch at the menu commit; emits the full oid (ADR-028). */
  readonly createBranchHere = output<string>();
  /** Create a tag at the menu commit; emits the full oid (ADR-028). */
  readonly tagCommit = output<string>();
  readonly reset = output<ResetModeName>();
  readonly closed = output<void>();

  /** Named modes exposed to the template so it never hardcodes strings. */
  readonly SOFT: ResetModeName = 'SOFT';
  readonly MIXED: ResetModeName = 'MIXED';
  readonly HARD: ResetModeName = 'HARD';

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Move focus into the menu when it opens so keyboard users land on an item.
    effect(() => {
      if (this.open() && this.target()) {
        queueMicrotask(() => this.enabledItems()[0]?.focus());
      }
    });
  }

  checkoutTarget(target: GraphContextMenuTarget): CheckoutTarget {
    return checkoutTargetFor(target);
  }

  onCheckout(target: GraphContextMenuTarget): void {
    if (this.busy()) return;
    this.checkout.emit(checkoutTargetFor(target));
  }

  onCompare(): void {
    if (!this.canCompare() || this.busy()) return;
    this.compare.emit();
  }

  onCreateBranchHere(target: GraphContextMenuTarget): void {
    if (this.busy()) return;
    this.createBranchHere.emit(target.oid);
  }

  onTagCommit(target: GraphContextMenuTarget): void {
    if (this.busy()) return;
    this.tagCommit.emit(target.oid);
  }

  /** A right-click on the backdrop dismisses the menu instead of the OS menu. */
  onBackdropContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.closed.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // Stop the document-level Escape listener from emitting a second close.
      event.stopPropagation();
      this.closed.emit();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();

    const items = this.enabledItems();
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const next = current === -1 ? 0 : (current + delta + items.length) % items.length;
    items[next]?.focus();
  }

  private enabledItems(): HTMLElement[] {
    return Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>(
        '.st-graph-context-menu__item:not(:disabled)',
      ),
    );
  }
}
