import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RepoService } from '../repo.service';
import { RepoList } from '../ui/repo-list';

@Component({
  selector: 'st-repo-page',
  standalone: true,
  imports: [RepoList],
  template: `
    <section class="st-repo-page p-4">
      <h1 class="text-xl font-semibold mb-4">Repository</h1>
      <st-repo-list />
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepoPage {
  readonly repo = inject(RepoService);
}
