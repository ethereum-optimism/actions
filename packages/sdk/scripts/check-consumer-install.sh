#!/usr/bin/env bash
#
# Reproduce a single-vendor downstream consumer install of the *published* SDK
# and assert the manifest invariants from issue #43 (F149/F165/F166/F170).
#
# In this repo's dev/CI the workspace lockfile + pnpm `autoInstallPeers` mask the
# missing `peerDependenciesMeta.optional` by installing all 10 vendor SDKs, so a
# broken single-vendor consumer install never reproduces. This script packs the
# SDK and installs it into a clean fixture *outside* the workspace with
# `auto-install-peers=false`, selecting only the Turnkey vendor. A regression in
# optionality, eager-barrel laziness, or dep-range pinning fails here instead of
# shipping silently.
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

# auto-install-peers=false is the whole point: optional vendor peers must be
# left uninstalled without erroring.
cat > "$FIXTURE_DIR/.npmrc" <<'NPMRC'
auto-install-peers=false
NPMRC

# `viem` is the SDK's one required (non-optional) peer, so the consumer must
# supply it. The Turnkey set is any in-range build — the fixture only needs *a*
# single vendor present to prove the other 9 stay absent; the probe does not
# assert these exact versions. `permissionless` / `@morpho-org/*` are NOT listed
# here: they arrive transitively from the packed SDK's own `dependencies`, and
# the probe asserts their resolved versions against the SDK's declared bands.
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
