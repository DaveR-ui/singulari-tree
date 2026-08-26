/** Mock data for layout shell — no real Git wiring. */

export interface MockRepo {
  name: string;
  branch: string;
  path: string;
}

export const MOCK_REPOS: MockRepo[] = [
  { name: 'DFCustomerPortal_SPA_AIR.X', branch: 'main', path: 'C:\\Work\\DFCustomerPortal_SPA_AIR.X' },
  { name: 'singulariTree', branch: 'feature/layout-shell', path: 'D:\\SingulariTree' },
  { name: 'go-core', branch: 'main', path: 'D:\\SingulariTree\\apps\\go-core' },
];

export interface MockCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  branches: string[];
}

export const MOCK_COMMITS: MockCommit[] = [
  { hash: 'a3f9c2e', message: 'feat(layout): shell grid + right drawer persistence', author: 'David', date: '2 hours ago', branches: ['origin/feature/layout-shell'] },
  { hash: 'b91d0f1', message: 'fix(graph): lane assignment for merge commits', author: 'Laura', date: '3 hours ago', branches: [] },
  { hash: 'c44a8b2', message: 'chore: update proto contracts', author: 'David', date: 'yesterday', branches: [] },
];
