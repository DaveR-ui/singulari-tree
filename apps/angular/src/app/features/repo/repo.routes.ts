import { Routes } from '@angular/router';
import { GraphStore } from './graph/graph.store';
import { StatusStore } from './status/status.store';

export const REPO_ROUTES: Routes = [
  {
    path: '',
    providers: [GraphStore, StatusStore],
    loadComponent: () => import('./page/repo-page').then((m) => m.RepoPage),
  },
];
