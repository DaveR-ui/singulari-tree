#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/apps/go-core"

LDFLAGS="-s -w"
echo "Building go-core..."
go build -ldflags "$LDFLAGS" -o "$ROOT/dist/go-core" ./cmd/go-core
echo "Built $ROOT/dist/go-core"
