import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'repo',
    pathMatch: 'full',
  },
  {
    path: 'repo',
    loadChildren: () => import('./features/repo/repo.routes').then((m) => m.REPO_ROUTES),
  },
  {
    path: '**',
    redirectTo: 'repo',
  },
];
