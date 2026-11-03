#!/usr/bin/env bash
# Copy the source tree (no dependencies or build output) to a destination folder as a tarball.
set -euo pipefail
DEST="${1:?usage: scripts/snapshot.sh <destination-dir>}"
mkdir -p "$DEST"
tar -czf "$DEST/nexora-src.tar.gz" \
  --exclude=node_modules --exclude=.next --exclude=.output --exclude=.output-e2e --exclude=.e2e-home --exclude=.wxt --exclude=dist \
  --exclude=coverage --exclude=.data --exclude='*.sqlite*' --exclude=test-results --exclude=playwright-report \
  .
echo "Snapshot written to $DEST/nexora-src.tar.gz"
