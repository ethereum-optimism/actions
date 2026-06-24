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
cat > "$FIXTURE_DIR/.npmrc" <<'NPMRC'
auto-install-peers=false
NPMRC

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
(
cd "$FIXTURE_DIR"
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const fixtureRequire = createRequire(join(process.cwd(), 'package.json'))
const sdkManifest = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      'node_modules',
      '@eth-optimism',
      'actions-sdk',
      'package.json',
    ),
    'utf8',
  ),
)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const expectedRanges = [
  ['dependencies', '@morpho-org/blue-sdk', '>=4.13.1 <4.14.0'],
  ['dependencies', '@morpho-org/blue-sdk-viem', '>=3.2.0 <3.3.0'],
  ['dependencies', '@morpho-org/morpho-ts', '>=2.4.6 <2.5.0'],
  ['dependencies', 'permissionless', '>=0.2.57 <0.3.0'],
  ['peerDependencies', '@dynamic-labs/ethereum', '>=4.31.4 <5.0.0'],
  ['peerDependencies', '@dynamic-labs/waas-evm', '>=4.31.4 <5.0.0'],
  ['peerDependencies', '@dynamic-labs/wallet-connector-core', '>=4.31.4 <5.0.0'],
  ['peerDependencies', '@privy-io/react-auth', '>=2.24.0 <3.0.0'],
  ['peerDependencies', '@privy-io/node', '>=0.3.0 <0.4.0'],
  ['peerDependencies', '@turnkey/core', '>=1.1.1 <2.0.0'],
  ['peerDependencies', '@turnkey/http', '>=3.12.1 <4.0.0'],
  ['peerDependencies', '@turnkey/sdk-server', '>=4.9.1 <5.0.0'],
  ['peerDependencies', '@turnkey/react-wallet-kit', '>=1.1.1 <2.0.0'],
  ['peerDependencies', '@turnkey/viem', '>=0.14.1 <0.15.0'],
  ['peerDependencies', 'viem', '>=2.33.0 <2.34.0'],
]
const optionalPeers = [
  '@dynamic-labs/ethereum',
  '@dynamic-labs/waas-evm',
  '@dynamic-labs/wallet-connector-core',
  '@privy-io/react-auth',
  '@privy-io/node',
  '@turnkey/core',
  '@turnkey/http',
  '@turnkey/sdk-server',
  '@turnkey/react-wallet-kit',
  '@turnkey/viem',
]

for (const [field, packageName, expectedRange] of expectedRanges) {
  assert(
    sdkManifest[field]?.[packageName] === expectedRange,
    `${field}.${packageName} must be "${expectedRange}"`,
  )
}

for (const packageName of optionalPeers) {
  assert(
    sdkManifest.peerDependenciesMeta?.[packageName]?.optional === true,
    `${packageName} must be marked as an optional peer`,
  )
}

for (const packageName of ['@privy-io/node', '@dynamic-labs/ethereum']) {
  try {
    fixtureRequire.resolve(packageName)
    throw new Error(`${packageName} should not be installed in this fixture`)
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error
  }
}

await import('@eth-optimism/actions-sdk')
await import('@eth-optimism/actions-sdk/react')
console.log('  ok  consumer package contract verified')
NODE
)

echo "==> Consumer-install check OK"
