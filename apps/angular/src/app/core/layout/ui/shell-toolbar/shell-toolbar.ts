import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Git action toolbar. Commit/Pull/Push/… are inert visual chrome for this
 * iteration (no handlers); Repo/GitHub navigate to the routed feature pages.
 */
@Component({
  selector: 'st-shell-toolbar',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="st-toolbar">
      <button class="st-tool" type="button"><i>⬆</i><span>Commit</span></button>
      <div class="st-toolbar__sep"></div>
      <button class="st-tool" type="button"><i>⭳</i><span>Pull</span></button>
      <button class="st-tool" type="button"><i>⭱</i><span>Push</span></button>
      <button class="st-tool" type="button"><i>⟳</i><span>Fetch</span></button>
      <div class="st-toolbar__sep"></div>
      <button class="st-tool" type="button"><i>⑂</i><span>Branch</span></button>
      <button class="st-tool" type="button"><i>⑃</i><span>Merge</span></button>
      <button class="st-tool" type="button"><i>⎘</i><span>Stash</span></button>
      <button class="st-tool" type="button"><i>✕</i><span>Discard</span></button>
      <button class="st-tool" type="button"><i>🏷</i><span>Tag</span></button>
      <span class="st-toolbar__spacer"></span>
      <button class="st-tool" routerLink="/repo" title="Repository" aria-label="Repository">
        <i>⌂</i><span>Repo</span>
      </button>
      <button
        class="st-tool"
        routerLink="/github-account"
        title="GitHub account"
        aria-label="GitHub account"
      >
        <i>🐙</i><span>GitHub</span>
      </button>
      <button class="st-tool st-tool--icon" type="button" aria-label="Settings">⚙</button>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .st-toolbar {
      height: var(--toolbar-h, 44px);
      min-height: var(--toolbar-h, 44px);
      background: var(--panel-2, #2a2a3a);
      border-bottom: 1px solid var(--border, #2f2f44);
      display: flex;
      align-items: stretch;
      gap: 0;
      padding: 0 8px;
    }

    .st-tool {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      min-width: 56px;
      background: transparent;
      border: none;
      color: var(--text, #d6d6de);
      cursor: pointer;
      border-radius: 6px;
      padding: 4px 6px;
      text-decoration: none;
    }

    .st-tool i {
      font-style: normal;
      font-size: 16px;
      line-height: 1;
    }

    .st-tool span {
      font-size: 10px;
      color: var(--muted, #8a8a9a);
    }

    .st-tool:hover {
      background: rgba(255, 255, 255, 0.06);
    }

    .st-tool:hover span {
      color: var(--text, #d6d6de);
    }

    .st-tool--icon {
      min-width: 36px;
      font-size: 16px;
    }

    .st-toolbar__sep {
      width: 1px;
      background: var(--border, #2f2f44);
      margin: 8px 6px;
      align-self: stretch;
    }

    .st-toolbar__spacer {
      flex: 1;
    }
  `,
})
export class ShellToolbar {}
