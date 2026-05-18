---
'@eth-optimism/actions-sdk': minor
---

Add SDK borrow namespace with Morpho Blue support.

- `actions.borrow.getMarket`/`getMarkets`/`getPosition` and
  `wallet.borrow.openPosition`/`closePosition`/`depositCollateral`/`withdrawCollateral`/`repay`
  expose a borrow surface mirroring the existing lend and swap namespaces.
- `MorphoBorrowProvider` ships the read side via raw multicall against
  Morpho Blue with results passed through Morpho's `Market` /
  `AccrualPosition` for health-factor and liquidation-price math, and
  the write side via hand-rolled `supplyCollateral` / `borrow` / `repay` /
  `withdrawCollateral` calldata.
- Pre-built `BorrowQuote` flow mirrors swap's `QUOTE_DISCRIMINATOR` pattern,
  with recipient binding, expiration, and chain/market id validation
  before dispatch.
- Standalone `computeMorphoMarketId` / `verifyMorphoMarketId` helpers
  enable config-time sanity checks; provider constructor throws
  `BorrowMarketParamsMismatchError` when configured `marketId` doesn't
  match the configured `MarketParams`.
- New `BorrowSettings` (default `approvalMode: 'exact'`, default
  `quoteExpirationSeconds: 30`, default `healthBufferPct: 0.05`) and
  `BorrowConfig` types.
- New `MockBorrowProvider` for downstream backend/frontend test suites.
