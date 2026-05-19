---
'@eth-optimism/actions-sdk': minor
---

Fix Morpho borrow position collateral accounting for pledged vault shares
and frontend-wallet borrow position reads.

- `BorrowMarketPosition` gains two required fields: `collateralShares`
  (raw vault-share balance, for re-pledging) and `collateralSharesFormatted`
  (display form). Existing `collateralAmount` is now in underlying-asset
  units (converted via vault `totalAssets`/`totalSupply`).
- `WalletBorrowNamespace` gains a public `getPosition(params)` method
  that binds the recipient to the wallet address.
