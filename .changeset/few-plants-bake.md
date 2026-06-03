---
'@eth-optimism/actions-sdk': minor
---

Fix Morpho borrow position collateral accounting for pledged vault shares
and frontend-wallet borrow position reads.

- `BorrowMarketPosition` exposes the raw on-chain collateral balance as
  `collateralShares` (vault shares for vault-wrapped collateral). The SDK no
  longer derives or formats an underlying-asset collateral amount: the
  `collateralAmount`, `collateralAmountFormatted`, and `collateralSharesFormatted`
  fields are removed. Consumers that need an underlying display amount convert
  vault shares themselves via the vault's `convertToAssets`.
- `WalletBorrowNamespace` gains a public `getPosition(params)` method
  that binds the recipient to the wallet address.
