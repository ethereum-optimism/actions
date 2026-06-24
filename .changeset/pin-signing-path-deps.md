---
'@eth-optimism/actions-sdk': minor
---

Pin signing-path dependency ranges and make vendor SDKs optional/lazy.

Hardens the published manifest so a consumer's fresh install resolves the same
signing-path graph CI tests against, and so single-vendor consumers stop pulling
vendor SDKs they never use. No runtime behavior change.

- **`viem` is now a required `peerDependency`** (`>=2.33.0 <2.34.0`) instead of a
  bundled `dependency`. **Action required for consumers: install `viem@2.33.x`
  alongside the SDK.** This lets the consumer dedupe to a single `viem` across
  the smart-wallet CREATE2 / UserOp path, where the deterministic
  funds-receiving address is delegated to viem account-abstraction internals.
- Signing-path runtime deps pinned to the CI-tested band: `permissionless`,
  `@morpho-org/blue-sdk`, `@morpho-org/blue-sdk-viem`, `@morpho-org/morpho-ts`.
  The tight `>=tested <next-minor` ranges are deliberate (not the repo's default
  caret style): the Morpho marketId/calldata math and the viem CREATE2 address
  are fund-safety-bearing, and an in-range minor bump can shift them silently.
- All 10 hosted-wallet vendor SDKs are now `peerDependenciesMeta.optional` with
  upper-bounded ranges (`>=x <next-major`), so a Turnkey-only or Local-only
  integrator is no longer told they are missing 9 packages, and a future
  breaking vendor major is no longer silently accepted into the signing path.
- The node/react wallet barrels re-export `PrivyHostedWalletProvider`,
  `PrivyWallet`, and `DynamicWallet` as **type-only** exports. Providers are
  still constructed lazily via the hosted-wallet registry with provider type
  `privy`; only the eager runtime re-export, which pulled
  `@privy-io/node` / `@dynamic-labs/ethereum` into every consumer's import graph
  is removed. Direct `new PrivyHostedWalletProvider(...)` from the SDK root was
  never the supported construction path.
