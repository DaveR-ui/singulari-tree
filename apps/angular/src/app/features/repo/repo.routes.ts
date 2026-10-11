import { Routes } from '@angular/router';
import { FileStatusStore } from './file-status/file-status.store';
import { GraphStore } from './graph/graph.store';
import { StatusStore } from './status/status.store';

/**
 * Repository routes.
 *
 * The `''` route is a provider-only parent: both screens share the same
 * route-scoped `GraphStore`/`StatusStore`, so the file-status screen sees the
 * repository and the commit the history screen selected. `FileStatusStore` is
 * provided on the `file-status` child so it can inject the route-scoped
 * `StatusStore` from the parent injector and dies with the screen.
 */
export const REPO_ROUTES: Routes = [
  {
    path: '',
    providers: [GraphStore, StatusStore],
    children: [
      {
        path: '',
        loadComponent: () => import('./page/repo-page').then((m) => m.RepoPage),
      },
      {
        path: 'file-status',
        providers: [FileStatusStore],
        loadComponent: () =>
          import('./file-status/page/file-status-page').then((m) => m.FileStatusPage),
      },
    ],
  },
];
