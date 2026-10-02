import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Menu bar chrome (File/Edit/View/…) plus the two sidebar toggle icon buttons.
 * Labels are inert chrome; the toggles bubble up to the shell container.
 */
@Component({
  selector: 'st-shell-menubar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="st-menubar">
      <span>File</span><span>Edit</span><span>View</span><span>Repository</span><span>Branch</span
      ><span>Help</span>
      <span class="st-menubar__spacer"></span>
      <button
        class="st-icon-btn"
        type="button"
        (click)="toggleLeft.emit()"
        [attr.aria-label]="leftCollapsed() ? 'Expand left' : 'Collapse left'"
        title="Toggle left"
      >
        ☰
      </button>
      <button
        class="st-icon-btn"
        type="button"
        (click)="toggleRight.emit()"
        [attr.aria-label]="rightCollapsed() ? 'Open repositories' : 'Close repositories'"
        title="Toggle right"
      >
        ◧
      </button>
    </nav>
  `,
  styles: `
    :host {
      display: block;
    }

    .st-menubar {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 6px 12px;
      background: #1a1a2e;
      border-bottom: 1px solid var(--border, #2f2f44);
      color: var(--muted, #8a8a9a);
      font-size: 12px;
    }

    .st-menubar span {
      cursor: default;
    }

    .st-menubar span:hover {
      color: var(--text, #d6d6de);
    }

    .st-menubar__spacer {
      flex: 1;
    }

    .st-icon-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--muted, #8a8a9a);
      border-radius: 6px;
      cursor: pointer;
      padding: 4px 7px;
      line-height: 1;
    }

    .st-icon-btn:hover {
      color: var(--text, #d6d6de);
      background: rgba(255, 255, 255, 0.07);
      border-color: var(--border, #2f2f44);
    }
  `,
})
export class ShellMenubar {
  readonly leftCollapsed = input(false);
  readonly rightCollapsed = input(false);
  readonly toggleLeft = output<void>();
  readonly toggleRight = output<void>();
}
