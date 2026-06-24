// Probe a single-vendor consumer install for optional vendors and dep ranges.

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { existsSync, readFileSync, realpathSync } from 'node:fs'

const SDK_PACKAGE_NAME = '@eth-optimism/actions-sdk'
const SDK_PACKAGE_PATH = ['node_modules', '@eth-optimism', 'actions-sdk']
const OPTIONAL_VENDOR_PACKAGES = ['@privy-io/node', '@dynamic-labs/ethereum']
const SDK_ENTRYPOINTS = [SDK_PACKAGE_NAME, `${SDK_PACKAGE_NAME}/react`]
const PINNED_DEPENDENCY_RANGES = [
  ['viem', 'peerDependencies'],
  ['permissionless', 'dependencies'],
  ['@morpho-org/blue-sdk', 'dependencies'],
  ['@morpho-org/blue-sdk-viem', 'dependencies'],
  ['@morpho-org/morpho-ts', 'dependencies'],
]

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function getInstalledSdkContext(fixtureDirectory) {
  const packageDirectory = realpathSync(
    join(fixtureDirectory, ...SDK_PACKAGE_PATH),
  )
  const packageJsonPath = join(packageDirectory, 'package.json')
  return {
    sdkManifest: readJsonFile(packageJsonPath),
    sdkRequire: createRequire(packageJsonPath),
  }
}

function resolveInstalledPackageVersion(packageName, sdkRequire) {
  let searchDirectory = dirname(sdkRequire.resolve(packageName))
  while (searchDirectory !== dirname(searchDirectory)) {
    const packageJsonPath = join(searchDirectory, 'package.json')
    if (existsSync(packageJsonPath)) {
      const manifest = readJsonFile(packageJsonPath)
      if (manifest.name === packageName) return manifest.version
    }
    searchDirectory = dirname(searchDirectory)
  }
  throw new Error(`package.json not found for ${packageName}`)
}

function releaseVersionParts(version) {
  return version.split('-')[0].split('.').map(Number)
}

function compareReleaseVersions(leftVersion, rightVersion) {
  const leftParts = releaseVersionParts(leftVersion)
  const rightParts = releaseVersionParts(rightVersion)
  for (let index = 0; index < 3; index++) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (difference !== 0) return difference < 0 ? -1 : 1
  }
  return 0
}

function parseComparatorToken(token) {
  const match = token.match(/^(>=|<=|>|<|=|\^|~)?\s*v?(.+)$/)
  if (!match) return undefined
  const [, operator = '=', targetVersion] = match
  return { operator, targetVersion }
}

function satisfiesComparator(version, token) {
  const comparator = parseComparatorToken(token)
  if (!comparator) return false
  const comparison = compareReleaseVersions(version, comparator.targetVersion)
  switch (comparator.operator) {
    case '>=':
      return comparison >= 0
    case '<=':
      return comparison <= 0
    case '>':
      return comparison > 0
    case '<':
      return comparison < 0
    default:
      return comparison === 0
  }
}

function satisfiesComparatorRange(version, range) {
  return range
    .trim()
    .split(/\s+/)
    .every((token) => satisfiesComparator(version, token))
}

function validateOptionalVendorsAbsent(sdkRequire) {
  const failures = []
  for (const packageName of OPTIONAL_VENDOR_PACKAGES) {
    try {
      sdkRequire.resolve(packageName)
      failures.push(
        `Unused vendor "${packageName}" is resolvable from the SDK; the ` +
          `install should have left it absent (optional peer, auto-install off).`,
      )
    } catch {
      // expected: not installed
    }
  }
  return failures
}

async function validateEntrypointImports() {
  const failures = []
  for (const entrypoint of SDK_ENTRYPOINTS) {
    try {
      await import(entrypoint)
    } catch (err) {
      failures.push(
        `Importing "${entrypoint}" failed, likely an eager static import of ` +
          `an uninstalled optional vendor SDK: ${err.message}`,
      )
    }
  }
  return failures
}

function validatePinnedDependencyRange(packageName, manifestField, context) {
  const expectedRange = context.sdkManifest[manifestField]?.[packageName]
  if (!expectedRange)
    return [`SDK manifest is missing ${manifestField}.${packageName}`]

  try {
    const resolvedVersion = resolveInstalledPackageVersion(
      packageName,
      context.sdkRequire,
    )
    if (satisfiesComparatorRange(resolvedVersion, expectedRange)) {
      console.log(
        `  ok  ${packageName}@${resolvedVersion} satisfies "${expectedRange}"`,
      )
      return []
    }
    return [
      `${packageName} resolved to ${resolvedVersion}, outside the SDK's ` +
        `declared band "${expectedRange}"`,
    ]
  } catch (err) {
    return [`Could not resolve ${packageName} in the fixture: ${err.message}`]
  }
}

function validatePinnedDependencyRanges(context) {
  const failures = []
  for (const [packageName, manifestField] of PINNED_DEPENDENCY_RANGES) {
    failures.push(
      ...validatePinnedDependencyRange(packageName, manifestField, context),
    )
  }
  return failures
}

function reportFailures(failures) {
  if (failures.length === 0) {
    console.log('\nConsumer-install verification passed.')
    return
  }
  console.error('\nConsumer-install verification FAILED:')
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  process.exit(1)
}

async function main() {
  const context = getInstalledSdkContext(process.cwd())
  const failures = [
    ...validateOptionalVendorsAbsent(context.sdkRequire),
    ...(await validateEntrypointImports()),
    ...validatePinnedDependencyRanges(context),
  ]
  reportFailures(failures)
}

await main()
