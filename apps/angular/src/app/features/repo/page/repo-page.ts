import { ChangeDetectionStrategy, Component } from '@angular/core';
import { GraphPage } from '../graph/page/graph-page';
import { RepoPicker } from '../ui/repo-picker';

@Component({
  selector: 'st-repo-page',
  standalone: true,
  imports: [RepoPicker, GraphPage],
  template: `
    <section class="st-repo-page p-4">
      <h1 class="text-xl font-semibold mb-4">Repository</h1>
      <st-repo-picker />
      <st-graph-page />
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepoPage {}
