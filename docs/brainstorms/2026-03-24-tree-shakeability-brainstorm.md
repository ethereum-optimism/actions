# Tree-Shakeability: Vite Chunking Fix

**Date:** 2026-03-24
**Status:** Ready for planning

## What We're Building

A low-lift fix to the CI build OOM by improving the demo frontend's Vite `manualChunks` configuration. No SDK code or API changes.

## Why This Approach

- CI builds fail with OOM during NX parallel builds. The patch (`NODE_OPTIONS='--max-old-space-size=4096'` + `--parallel=1`) works but is a band-aid.
- The root cause is Rollup/esbuild holding massive ASTs during minification — chunks like `actionsApi` (2MB), `privy-provider` (1.3MB), `DynamicProvider` (1.2MB), and `index` (1.5MB) exceed the default Node heap.
- Splitting these into smaller chunks via `manualChunks` reduces peak memory without any SDK changes.
- The demo already lazy-loads wallet providers via `React.lazy()` in `EarnPage.tsx`, but Vite still bundles all wallet SDK deps into a few mega-chunks because `manualChunks` only splits `viem` and `react-vendor`.

## Key Decisions

1. **Scope: demo build config only** — No SDK code changes, no API changes, no consumer impact.
2. **`createActions` stays synchronous** — We explicitly chose not to make it async for now.
3. **Action providers (Lend, Swap) stay as hard dependencies** — No changes to the SDK's dependency structure.
4. **`sideEffects: false`** — Add to SDK `package.json` to help Rollup drop unused re-exports from barrels.

## Implementation

### Changes to `packages/demo/frontend/vite.config.ts`

Add `manualChunks` entries for the heavy wallet and protocol dependencies:

- `@privy-io` → own chunk
- `@dynamic-labs` → own chunk
- `@turnkey` → own chunk
- `@aave` + `ethers` → own chunk
- `@morpho-org` → own chunk

This ensures each wallet SDK and protocol SDK gets its own chunk rather than being merged into a 1-2MB blob.

### Changes to `packages/sdk/package.json`

Add `"sideEffects": false` at the top level. This tells Rollup/Vite that the SDK's modules have no side effects, enabling better tree-shaking of unused barrel re-exports.

## Future Optimization (Deferred)

**Per-wallet subpath exports** — Create `@eth-optimism/actions-sdk/react/privy`, `/react/dynamic`, `/react/turnkey` entry points that each include only one wallet provider's registry. Same config-driven sync API, just a more specific import path. This would eliminate unused wallet provider code from the bundle entirely, not just split it into separate chunks.
