// Probe run inside an isolated single-vendor consumer fixture.
//
// Purpose (F149/F165/F166/F170): prove that the *published* SDK, installed the
// way a real downstream consumer installs it, honours the manifest invariants:
//
//   1. A static `import` of either SDK entry (node and react) must NOT eagerly
//      load the unused vendor SDKs. We install only the Turnkey vendor set (peer
//      auto-install off), so `@privy-io/node` and `@dynamic-labs/ethereum` are
//      absent on disk. If the SDK eager-loaded them, the import would throw
//      ERR_MODULE_NOT_FOUND.
//   2. The signing-path runtime deps (viem, permissionless, @morpho-org/*)
//      resolve inside the band the SDK itself declares (read from the installed
//      SDK package.json — no second source of truth to drift), so a fresh
//      consumer install cannot drift to an untested build.
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
const sdkManifest = JSON.parse(
  readFileSync(join(sdkPkgDir, 'package.json'), 'utf8'),
)

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

/** Numeric semver compare of two release versions (prerelease tags ignored). */
function cmp(a, b) {
  const pa = a.split('-')[0].split('.').map(Number)
  const pb = b.split('-')[0].split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

/** Whether `version` satisfies a space-separated comparator range (`>=x <y`). */
function satisfies(version, range) {
  return range
    .trim()
    .split(/\s+/)
    .every((token) => {
      const m = token.match(/^(>=|<=|>|<|=|\^|~)?\s*v?(.+)$/)
      if (!m) return false
      const [, op = '=', v] = m
      const c = cmp(version, v)
      switch (op) {
        case '>=':
          return c >= 0
        case '<=':
          return c <= 0
        case '>':
          return c > 0
        case '<':
          return c < 0
        default:
          return c === 0
      }
    })
}

// --- 1. Eager-import probe -------------------------------------------------
// The unused vendors are intentionally NOT installed in this fixture. A clean
// import of BOTH entries is the proof that neither barrel statically pulls them
// in (node -> @privy-io/node, react -> @dynamic-labs/ethereum).
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

for (const entry of [
  '@eth-optimism/actions-sdk',
  '@eth-optimism/actions-sdk/react',
]) {
  try {
    await import(entry)
  } catch (err) {
    failures.push(
      `Importing "${entry}" failed — likely an eager static import of an ` +
        `uninstalled optional vendor SDK: ${err.message}`,
    )
  }
}

// --- 2. Pinned-range probe -------------------------------------------------
// The expected range is read from the SDK's own manifest (peerDependencies for
// viem, dependencies for the rest), so there is exactly one source of truth.
const PINNED = [
  ['viem', 'peerDependencies'],
  ['permissionless', 'dependencies'],
  ['@morpho-org/blue-sdk', 'dependencies'],
  ['@morpho-org/blue-sdk-viem', 'dependencies'],
  ['@morpho-org/morpho-ts', 'dependencies'],
]

for (const [pkg, field] of PINNED) {
  const range = sdkManifest[field]?.[pkg]
  if (!range) {
    failures.push(`SDK manifest is missing ${field}.${pkg} — expected a pin`)
    continue
  }
  let resolved
  try {
    resolved = resolvedVersion(pkg)
  } catch (err) {
    failures.push(`Could not resolve ${pkg} in the fixture: ${err.message}`)
    continue
  }
  if (!satisfies(resolved, range)) {
    failures.push(
      `${pkg} resolved to ${resolved}, outside the SDK's declared band "${range}"`,
    )
  } else {
    console.log(`  ok  ${pkg}@${resolved} satisfies "${range}"`)
  }
}

if (failures.length > 0) {
  console.error('\nConsumer-install verification FAILED:')
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}

console.log('\nConsumer-install verification passed.')
