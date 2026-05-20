# Borrow PR 3 Handoff

This branch finishes the actionable PR-3 borrow review work and does a
large structural cleanup pass over the borrow implementation. The next
branch in the sequence, `actions-borrow-pr4`, should treat the current
module layout as the new baseline.

## What Changed

### Review fixes completed

- Added zero-address regression coverage for borrow write-side methods.
- Switched `requireMorphoBlueAddress` to throw the named
  `ProtocolContractsNotConfiguredError`.
- Made `BorrowMarketConfigMetadata.lendProvider` optional.
- Removed the unneeded `eslint-disable no-console` in the Morpho network
  test.
- Hardened borrow-quote detection so raw params that happen to contain
  `quotedAt` are re-quoted instead of being misclassified as a pre-built
  quote.
- Restored legacy wallet factory wiring for borrow providers and added
  regressions around the old `lendProviders` / `swapProviders` paths.
- Added public export coverage for the borrow provider classes and Morpho
  market-id helpers.
- Added or expanded borrow namespace tests so they now cover:
  - action mismatch checks on pre-built quotes
  - all raw-params wallet action paths injecting `walletAddress`
  - argument forwarding through `ActionsBorrowNamespace`
  - quote expiry / allowlist / unsupported-chain checks

### Structural cleanup completed

Borrow code is now split across smaller focused modules instead of the
original single-file layout:

- `packages/sdk/src/types/borrow/base.ts` was replaced by:
  - `market.ts`
  - `params.ts`
  - `quote.ts`
  - `internal.ts`
- `packages/sdk/src/actions/borrow/core/helpers.ts`
  now owns shared base-class borrow utilities.
- `packages/sdk/src/actions/borrow/core/internalParams.ts`
  now owns public-param to internal-param normalization.
- `packages/sdk/src/actions/shared/morpho/blue.ts`
  now owns Morpho protocol calldata construction, approvals, market
  construction, and protocol numeric helpers.
- `packages/sdk/src/actions/shared/morpho/state.ts`
  now owns Morpho read multicalls for market, position, and
  position-plus-allowance state.
- `packages/sdk/src/actions/borrow/providers/morpho/helpers.ts`
  now owns only borrow-specific Morpho allowlist validation and lookup.
- `packages/sdk/src/actions/borrow/providers/morpho/presentation.ts`
  now owns market / position / quote adaptation.

## Current File Shape

At handoff time the main files are still somewhat large, but materially
smaller than where PR-3 started:

- `packages/sdk/src/actions/borrow/providers/morpho/MorphoBorrowProvider.ts`
  is down to the write-path orchestration layer.
- `packages/sdk/src/actions/borrow/core/BorrowProvider.ts`
  is down to the abstract API surface, config resolution, and validation.

If PR-4 adds more borrow behavior, prefer extracting at the second use
instead of growing either file again.

## What PR 4 Will Likely Need To Update

If PR-4 touches borrow quoting or execution:

- Update `packages/sdk/src/actions/borrow/providers/morpho/presentation.ts`
  for quote shape or market / position display changes.
- Update `packages/sdk/src/actions/borrow/core/internalParams.ts`
  if public borrow params gain new fields that must flow into internal
  provider hooks.
- Update `packages/sdk/src/actions/shared/morpho/blue.ts`
  for Morpho calldata, approval policy, or market-construction changes.
- Update `packages/sdk/src/actions/shared/morpho/state.ts`
  if Morpho read batching or error handling changes.
- Update `packages/sdk/src/actions/borrow/providers/morpho/helpers.ts`
  only when the borrow-specific Morpho allowlist behavior changes.

If PR-4 adds a second borrow provider:

- Hoist any newly duplicated logic out of
  `MorphoBorrowProvider.ts` into the borrow base or shared borrow utils
  before landing.
- Reuse the existing borrow test shape:
  subclass-to-expose-protected for base tests, provider-specific unit
  tests, wallet namespace quote-validation tests, and index export smoke
  tests.

If PR-4 adds more Morpho work in another action domain:

- Reuse `packages/sdk/src/actions/shared/morpho/blue.ts`
  and `packages/sdk/src/actions/shared/morpho/state.ts` first.
- Do not copy Morpho protocol code back down into a domain folder unless
  the code is truly domain-specific.

If PR-4 changes public SDK exports:

- Update `packages/sdk/src/__tests__/index.exports.spec.ts`.

If PR-4 changes wallet wiring:

- Re-check the legacy factory regressions in:
  - `packages/sdk/src/wallet/core/namespace/__tests__/WalletNamespace.spec.ts`
  - borrow wallet namespace tests

## Validation Pattern Used Here

Every code commit on this branch was gated with:

- targeted `pnpm --filter @eth-optimism/actions-sdk test -- ...`
- `pnpm --filter @eth-optimism/actions-sdk lint:fix`
- `pnpm --filter @eth-optimism/actions-sdk build`

`lint:fix` still reports the repo's pre-existing warning baseline outside
the borrow work. PR-4 should preserve or reduce that baseline, not grow
it.
