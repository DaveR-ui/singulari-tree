import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RepoService } from '../repo.service';

@Component({
  selector: 'st-repo-list',
  standalone: true,
  template: `
    <div class="st-repo-list">
      @if (repo.isLoading()) {
        <p class="opacity-60">Loading commits…</p>
      } @else if (repo.commits().length === 0) {
        <p class="opacity-60">No commits yet (scaffold placeholder).</p>
      } @else {
        @for (row of repo.commits(); track row.commit.oid.hex) {
          <div class="py-1 border-b border-[var(--st-color-border)]">
            {{ row.commit.message }}
          </div>
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepoList {
  readonly repo = inject(RepoService);
}
