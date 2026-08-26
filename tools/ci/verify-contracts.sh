#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if ! command -v buf >/dev/null 2>&1; then
  echo "buf not found — skipping breaking check (install buf to enforce)" >&2
  exit 0
fi

echo "Running buf lint..."
buf lint

if git rev-parse --verify main >/dev/null 2>&1; then
  echo "Running buf breaking against main..."
  buf breaking --against '.git#branch=main' || {
    echo "Breaking changes detected!" >&2
    exit 1
  }
else
  echo "No main branch — skipping breaking check"
fi

echo "Checking generated drift..."
# Generate to temp and diff (if buf available)
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
buf generate --template libs/contracts/buf.gen.yaml -o "$TMPDIR" 2>/dev/null || true
if [ -d "$TMPDIR/gen" ]; then
  if ! diff -rq libs/contracts/gen "$TMPDIR/gen" >/dev/null 2>&1; then
    echo "Generated contracts drift — run ./tools/scripts/gen-contracts.sh and commit" >&2
    diff -rq libs/contracts/gen "$TMPDIR/gen" || true
    exit 1
  fi
fi

echo "Contracts OK"
