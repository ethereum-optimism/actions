// Probe run inside an isolated single-vendor consumer fixture.
//
// Purpose (F149/F165/F166/F170): prove that the *published* SDK, installed the
// way a real downstream consumer installs it, honours the manifest invariants:
//
//   1. A static `import` of the SDK root must NOT eagerly load the unused vendor
//      SDKs. We install only the Turnkey vendor set (peer auto-install off), so
//      `@privy-io/node` and `@dynamic-labs/ethereum` are absent on disk. If the
//      SDK eager-loaded them, this import would throw ERR_MODULE_NOT_FOUND.
//   2. The signing-path runtime deps (viem, permissionless, @morpho-org/*)
//      resolve inside the CI-tested band — a fresh consumer install cannot drift
//      to an untested build.
//
// Exits non-zero (and prints the reason) on any violation so CI fails closed.

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { existsSync, readFileSync, realpathSync } from 'node:fs'

const fixtureDir = process.cwd()

// pnpm does not hoist the SDK's own dependencies to the fixture root, so deps
// like `permissionless` / `@morpho-org/*` are only resolvable *from* the
// installed SDK package. Anchor a require there (via the real, dereferenced
// path so Node walks pnpm's nested store).
const sdkPkgDir = realpathSync(
  join(fixtureDir, 'node_modules', '@eth-optimism', 'actions-sdk'),
)
const sdkRequire = createRequire(join(sdkPkgDir, 'package.json'))

const failures = []

/** Resolve an installed package's version via its nearest package.json. */
function resolvedVersion(pkg) {
  let dir = dirname(sdkRequire.resolve(pkg))
  while (dir !== dirname(dir)) {
    const candidate = join(dir, 'package.json')
    if (existsSync(candidate)) {
      const json = JSON.parse(readFileSync(candidate, 'utf8'))
      if (json.name === pkg) return json.version
    }
    dir = dirname(dir)
  }
  throw new Error(`package.json not found for ${pkg}`)
}

// --- 1. Eager-import probe -------------------------------------------------
// The unused vendors are intentionally NOT installed in this fixture. A clean
// import is the proof that the SDK root does not statically pull them in.
for (const vendor of ['@privy-io/node', '@dynamic-labs/ethereum']) {
  try {
    sdkRequire.resolve(vendor)
    failures.push(
      `Unused vendor "${vendor}" is resolvable from the SDK — the install ` +
        `should have left it absent (optional peer, auto-install off).`,
    )
  } catch {
    // expected: not installed
  }
}

try {
  await import('@eth-optimism/actions-sdk')
} catch (err) {
  failures.push(
    `Importing the SDK root eagerly loaded an uninstalled vendor: ${err.message}`,
  )
}

// --- 2. Pinned-range probe -------------------------------------------------
// major.minor must match the CI-tested band; patch releases inside the band are
// allowed (the manifest ranges are >=tested <next-minor).
const TESTED_BANDS = {
  viem: '2.33',
  permissionless: '0.2',
  '@morpho-org/blue-sdk': '4.13',
  '@morpho-org/blue-sdk-viem': '3.2',
  '@morpho-org/morpho-ts': '2.4',
}

for (const [pkg, band] of Object.entries(TESTED_BANDS)) {
  let resolved
  try {
    resolved = resolvedVersion(pkg)
  } catch (err) {
    failures.push(`Could not resolve ${pkg} in the fixture: ${err.message}`)
    continue
  }
  const majorMinor = resolved.split('.').slice(0, 2).join('.')
  if (majorMinor !== band) {
    failures.push(
      `${pkg} resolved to ${resolved}, outside the CI-tested band ${band}.x`,
    )
  } else {
    console.log(`  ok  ${pkg}@${resolved} (band ${band}.x)`)
  }
}

if (failures.length > 0) {
  console.error('\nConsumer-install verification FAILED:')
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}

console.log('\nConsumer-install verification passed.')
