import { Routes } from '@angular/router';
import { GithubAccountStore } from './github-account.store';

export const GITHUB_ACCOUNT_ROUTES: Routes = [
  {
    path: '',
    providers: [GithubAccountStore],
    loadComponent: () => import('./github-account').then((m) => m.GithubAccount),
  },
];
