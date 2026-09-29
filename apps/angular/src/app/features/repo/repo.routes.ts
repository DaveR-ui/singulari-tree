import { Routes } from '@angular/router';
import { GraphStore } from './graph/graph.store';

export const REPO_ROUTES: Routes = [
  {
    path: '',
    providers: [GraphStore],
    loadComponent: () => import('./page/repo-page').then((m) => m.RepoPage),
  },
];
