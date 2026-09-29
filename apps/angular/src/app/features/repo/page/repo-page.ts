import { ChangeDetectionStrategy, Component } from '@angular/core';
import { GraphPage } from '../graph/page/graph-page';

@Component({
  selector: 'st-repo-page',
  standalone: true,
  imports: [GraphPage],
  template: `
    <section class="st-repo-page p-4">
      <h1 class="text-xl font-semibold mb-4">Repository</h1>
      <st-graph-page />
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepoPage {}
