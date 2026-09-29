import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RepoService } from '../repo.service';

@Component({
  selector: 'st-repo-list',
  standalone: true,
  template: `
    <div class="st-repo-list">
      @if (repo.isLoading()) {
        <p class="opacity-60">Loading commits…</p>
      } @else if (repo.offline()) {
        <p class="opacity-60">Git core offline — open a repository inside the desktop app to load history.</p>
      } @else if (repo.commits().length === 0) {
        <p class="opacity-60">No commits to display. Open a repository to load its history.</p>
      } @else {
        @for (row of repo.commits(); track row.commit.oid?.hex ?? $index) {
          <div class="py-1 border-b border-[var(--st-color-border)]">
            <span class="font-mono opacity-60">{{ row.commit.oid?.hex?.slice(0, 7) ?? '???????' }}</span>
            <span class="ml-2">{{ row.commit.message }}</span>
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
