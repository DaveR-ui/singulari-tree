import { ChangeDetectionStrategy, Component, HostListener, input, output } from '@angular/core';

/**
 * Reusable modal shell for feature dialogs.
 *
 * Renders nothing while `open()` is false. The backdrop closes on click (when
 * `closeOnBackdrop()`) and the component closes on Escape; both paths emit
 * `closed`. Content is projected into the body while elements tagged with the
 * `st-modal-footer` attribute project into the footer.
 */
@Component({
  selector: 'st-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div
        class="st-modal__backdrop"
        data-testid="modal-backdrop"
        (click)="onBackdropClick($event)"
      >
        <div class="st-modal" role="dialog" aria-modal="true" data-testid="modal">
          <div class="st-modal__head">
            <h2 class="st-modal__title" data-testid="modal-title">{{ title() }}</h2>
            <button
              class="st-modal__close"
              type="button"
              data-testid="modal-close"
              aria-label="Close"
              (click)="closed.emit()"
            >
              ✕
            </button>
          </div>
          <div class="st-modal__body">
            <ng-content />
          </div>
          <div class="st-modal__footer">
            <ng-content select="[st-modal-footer]" />
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .st-modal__backdrop {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(0, 0, 0, 0.55);
    }

    .st-modal {
      display: flex;
      flex-direction: column;
      width: min(560px, 100%);
      max-height: calc(100vh - 48px);
      overflow: auto;
      background: var(--st-color-surface, #252536);
      border: 1px solid var(--st-color-border, #2f2f44);
      border-radius: 10px;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
      color: var(--st-color-text, #d6d6de);
    }

    .st-modal__head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--st-color-border, #2f2f44);
    }

    .st-modal__title {
      flex: 1;
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }

    .st-modal__close {
      background: transparent;
      border: 1px solid transparent;
      color: var(--st-color-text, #d6d6de);
      border-radius: 6px;
      cursor: pointer;
      padding: 4px 8px;
      line-height: 1;
    }

    .st-modal__close:hover {
      background: rgba(255, 255, 255, 0.07);
      border-color: var(--st-color-border, #2f2f44);
    }

    .st-modal__body {
      padding: 16px;
    }

    .st-modal__footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid var(--st-color-border, #2f2f44);
    }
  `,
})
export class ModalComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly closeOnBackdrop = input(true);

  readonly closed = output<void>();

  /** Close on Escape, but only while the modal is actually open. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.closed.emit();
  }

  /** Close when the backdrop itself (not the panel or its content) is clicked. */
  onBackdropClick(event: MouseEvent): void {
    if (!this.closeOnBackdrop()) return;
    if (event.target !== event.currentTarget) return;
    this.closed.emit();
  }
}
