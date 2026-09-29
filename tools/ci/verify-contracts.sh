#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/libs/contracts"

if ! command -v buf >/dev/null 2>&1; then
  echo "buf not found — skipping breaking check (install buf to enforce)" >&2
  exit 0
fi

echo "Running buf lint..."
buf lint

if git -C "$ROOT" rev-parse --verify main >/dev/null 2>&1; then
  echo "Running buf breaking against main..."
  BREAK_LOG="$(mktemp)"
  BREAK_STATUS=0
  if ! buf breaking --against "$ROOT/.git#branch=main" >"$BREAK_LOG" 2>&1; then
    # TODO(phase-1): drop the baseline-compile tolerance once main carries
    # compiling protos. The pre-Phase-0 baseline on main has unresolved proto
    # imports and cannot be compiled by buf, so breaking detection is impossible
    # against it. Report the real breaking violations, but tolerate a baseline
    # that simply won't build.
    if grep -qiE 'imported file does not exist|cannot find|expected message type' "$BREAK_LOG"; then
      echo "WARN: baseline (main) protos do not compile — breaking check skipped" >&2
      cat "$BREAK_LOG" >&2 || true
    else
      echo "Breaking changes detected!" >&2
      cat "$BREAK_LOG" >&2 || true
      BREAK_STATUS=1
    fi
  fi
  # Remove the log on every path (including the breaking failure) before exiting.
  rm -f "$BREAK_LOG"
  if [ "$BREAK_STATUS" -ne 0 ]; then
    exit 1
  fi
else
  echo "No main branch — skipping breaking check"
fi

echo "Checking generated drift..."
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
buf generate --template buf.gen.yaml -o "$TMPDIR"
if ! diff -rq --exclude=go.mod --exclude=go.sum gen "$TMPDIR/gen" >/dev/null 2>&1; then
  echo "Generated contracts drift — run ./tools/scripts/gen-contracts.sh and commit" >&2
  diff -rq --exclude=go.mod --exclude=go.sum gen "$TMPDIR/gen" || true
  exit 1
fi

echo "Contracts OK"
