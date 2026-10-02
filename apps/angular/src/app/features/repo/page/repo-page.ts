import { ChangeDetectionStrategy, Component } from '@angular/core';
import { GraphPage } from '../graph/page/graph-page';
import { RepoPicker } from '../ui/repo-picker';

/**
 * Routed repository page: picker + real commit graph, filling the shell center.
 */
@Component({
  selector: 'st-repo-page',
  standalone: true,
  imports: [RepoPicker, GraphPage],
  template: `
    <section class="st-repo-page">
      <header class="st-repo-page__head">
        <h1 class="st-repo-page__title">Repository</h1>
      </header>
      <st-repo-picker />
      <st-graph-page />
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      color: var(--st-color-text, #d6d6de);
    }

    .st-repo-page {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    .st-repo-page__head {
      flex: 0 0 auto;
      padding: 8px 12px;
      border-bottom: 1px solid var(--st-color-border, #2f2f44);
    }

    .st-repo-page__title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }

    st-graph-page {
      flex: 1 1 auto;
      min-height: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepoPage {}
