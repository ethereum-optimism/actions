#!/bin/bash
# Fetches the pinned OP monorepo (shallow) into lib/optimism so forge can compile
# its AdminFaucetAuthModule.
set -euo pipefail

OPTIMISM_COMMIT=8ca4df44b85cd270b3072692fae683a40d26b4fb
OPTIMISM_DIR="$(cd "$(dirname "$0")/.." && pwd)/lib/optimism"

if [ "$(git -C "$OPTIMISM_DIR" rev-parse HEAD 2>/dev/null)" = "$OPTIMISM_COMMIT" ]; then
  exit 0
fi

rm -rf "$OPTIMISM_DIR"
git init --quiet "$OPTIMISM_DIR"
git -C "$OPTIMISM_DIR" fetch --quiet --depth 1 https://github.com/ethereum-optimism/optimism "$OPTIMISM_COMMIT"
git -C "$OPTIMISM_DIR" checkout --quiet FETCH_HEAD

# Only the libs the faucet contracts import.
git -C "$OPTIMISM_DIR" submodule update --quiet --init --depth 1 -- \
  packages/contracts-bedrock/lib/openzeppelin-contracts \
  packages/contracts-bedrock/lib/solady
