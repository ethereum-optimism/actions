#!/usr/bin/env bash
# Reproduce a single-vendor install and assert issue #43 manifest invariants.
set -euo pipefail

SDK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT

echo "==> Building SDK"
(cd "$SDK_DIR" && pnpm build >/dev/null)

echo "==> Packing SDK tarball"
TARBALL="$(cd "$SDK_DIR" && pnpm pack --pack-destination "$FIXTURE_DIR" | tail -1)"
# pnpm prints the absolute path; fall back to a glob if it printed a bare name.
if [ ! -f "$TARBALL" ]; then
  TARBALL="$(ls "$FIXTURE_DIR"/*.tgz | head -1)"
fi
echo "    tarball: $TARBALL"

echo "==> Creating clean single-vendor (Turnkey) fixture at $FIXTURE_DIR"
cp "$SDK_DIR/scripts/verify-consumer-install.mjs" "$FIXTURE_DIR/verify-consumer-install.mjs"

# Optional vendor peers must stay uninstalled with auto-install-peers=false.
cat > "$FIXTURE_DIR/.npmrc" <<'NPMRC'
auto-install-peers=false
NPMRC

# viem is required; Turnkey proves one vendor works while the rest stay absent.
cat > "$FIXTURE_DIR/package.json" <<PKGJSON
{
  "name": "actions-sdk-consumer-fixture",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@eth-optimism/actions-sdk": "file:$TARBALL",
    "viem": "2.33.0",
    "@turnkey/core": "1.8.3",
    "@turnkey/http": "3.15.0",
    "@turnkey/sdk-server": "4.12.1"
  }
}
PKGJSON

echo "==> Installing fixture (peer auto-install OFF, Turnkey-only)"
(cd "$FIXTURE_DIR" && pnpm install --no-frozen-lockfile --config.confirmModulesPurge=false 2>&1 | sed 's/^/    /')

echo "==> Running consumer-install probe"
(cd "$FIXTURE_DIR" && node verify-consumer-install.mjs)

echo "==> Consumer-install check OK"
