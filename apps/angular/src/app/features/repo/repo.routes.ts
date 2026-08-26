import { Routes } from '@angular/router';
import { RepoService } from './repo.service';

export const REPO_ROUTES: Routes = [
  {
    path: '',
    providers: [RepoService],
    loadComponent: () => import('./page/repo-page').then((m) => m.RepoPage),
  },
];
