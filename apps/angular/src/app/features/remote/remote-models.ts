// View models, intents and the centralized DEFERRED table for the Git remote
// dialogs (Pull/Push/Fetch). Presentation-only: the renderer never talks to Git
// directly, these types describe what the dialogs collect before handing an
// intent to `RemoteOpsStore` (which crosses the IPC bridge).

/** Which remote dialog is currently open. */
export type RemoteDialogKind = 'pull' | 'push' | 'fetch';

/** Progress reported by a remote operation (mirrors the contract `Progress`). */
export interface RemoteOpProgress {
  percent: number;
  message: string;
}

/** A selectable remote (name + primary URL) for the dialog pickers. */
export interface RemoteOption {
  name: string;
  url: string;
}

/** A selectable remote branch derived from a local branch's upstream. */
export interface RemoteBranchOption {
  name: string;
  refName: string;
  derivedFromUpstream: boolean;
}

/** One row of the Push dialog: a local branch and its default remote target. */
export interface PushRowView {
  localBranch: string;
  isCurrent: boolean;
  upstream: string;
  defaultRemoteBranch: string;
}

/** Per-row Push selection produced by the dialog. */
export interface PushRowSelection {
  localBranch: string;
  remoteBranch: string;
  track: boolean;
}

/** Pull intent: pull `branch` from `remote` into `intoLocalBranch`. */
export interface PullIntent {
  remote: string;
  branch: string;
  intoLocalBranch: string;
}

/** Push intent: push every selected row to `remote` under the same remote name. */
export interface PushIntent {
  remote: string;
  branches: readonly PushRowSelection[];
}

/** Fetch intent: either every remote, or a single one. */
export interface FetchIntent {
  allRemotes: boolean;
  remote: string;
  prune: boolean;
}

/** A postponed (not-yet-contracted) option surfaced by the dialogs. */
export interface DeferredOption {
  key: string;
  label: string;
  reason: string;
}

const REMOTE_TRACKING_PREFIX = 'refs/remotes/';

/**
 * Split a remote-tracking ref such as `refs/remotes/origin/david/fix-x` into
 * `{ remote: 'origin', branch: 'david/fix-x' }`. Returns `null` for refs that
 * are not remote-tracking (local branches, tags, HEAD, empty, malformed).
 */
export function parseRemoteTracking(ref: string): { remote: string; branch: string } | null {
  if (!ref.startsWith(REMOTE_TRACKING_PREFIX)) return null;
  const rest = ref.slice(REMOTE_TRACKING_PREFIX.length);
  const separator = rest.indexOf('/');
  if (separator <= 0) return null;
  const remote = rest.slice(0, separator);
  const branch = rest.slice(separator + 1);
  if (!remote || !branch) return null;
  return { remote, branch };
}

/**
 * Central table of postponed options. Every entry maps to a git flag/behavior
 * that needs a proto/core contract field the renderer-only scope cannot add;
 * each dialog renders them as disabled controls with the `reason` tooltip.
 */
export const DEFERRED: Readonly<Record<string, DeferredOption>> = {
  'pull.intoLocal': {
    key: 'pull.intoLocal',
    label: 'Pull into local branch',
    reason:
      'Pulling into a different local branch needs a `localBranch` field on PullRequest (maps to `git pull <remote> <branch>:<local>`).',
  },
  'pull.commitMerged': {
    key: 'pull.commitMerged',
    label: 'Create merge commit',
    reason:
      'Committing the merge automatically needs a `noCommit`/auto-commit flag on PullRequest (maps to `--no-commit` when unchecked).',
  },
  'pull.includeMergedMessages': {
    key: 'pull.includeMergedMessages',
    label: 'Include merged messages',
    reason:
      'Inlining the messages of merged commits needs a `log` flag on PullRequest (maps to `--log`).',
  },
  'pull.noFF': {
    key: 'pull.noFF',
    label: 'No fast-forward',
    reason:
      'Preventing fast-forward needs a `noFF` flag on PullRequest (maps to `--no-ff`).',
  },
  'pull.rebase': {
    key: 'pull.rebase',
    label: 'Rebase instead of merge',
    reason:
      'Rebasing local commits needs a `rebase` flag on PullRequest (maps to `--rebase`).',
  },
  'push.remoteBranch': {
    key: 'push.remoteBranch',
    label: 'Remote branch name',
    reason:
      'Pushing to a differently-named remote branch needs a refspec/target field on PushRequest (maps to `git push <remote> <local>:<remote>`).',
  },
  'push.track': {
    key: 'push.track',
    label: 'Track remote branch',
    reason:
      'Setting the upstream tracking branch needs a `setUpstream`/`track` flag on PushRequest (maps to `--set-upstream`).',
  },
  'push.tags': {
    key: 'push.tags',
    label: 'Push tags',
    reason:
      'Pushing tags needs a `tags` flag on PushRequest (maps to `--tags`).',
  },
  'push.force': {
    key: 'push.force',
    label: 'Force push',
    reason:
      'Force-pushing needs a `force` flag on PushRequest (maps to `--force`).',
  },
  'fetch.prune': {
    key: 'fetch.prune',
    label: 'Prune deleted refs',
    reason:
      'Pruning deleted remote refs needs a `prune` flag on FetchRequest (maps to `--prune`).',
  },
  'fetch.tags': {
    key: 'fetch.tags',
    label: 'Fetch tags',
    reason:
      'Fetching tags needs a `tags` flag on FetchRequest (maps to `--tags`).',
  },
  'fetch.overwriteTags': {
    key: 'fetch.overwriteTags',
    label: 'Overwrite changed tags',
    reason:
      'Overwriting moved tags needs a `force` flag on FetchRequest (maps to `--force`).',
  },
};
