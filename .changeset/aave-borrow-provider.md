---
'@eth-optimism/actions-sdk': minor
---

Add `AaveBorrowProvider` for Aave V3 borrow markets.

- Registers `aave` in `BORROW_PROVIDER_NAMES` and `config.borrow.aave`, and
  exports `AaveBorrowProvider` from the SDK entry point.
- Adds an `aave-v3` variant to `BorrowMarketId` / `BorrowMarketConfig`, with a
  synthetic market id derived from `(chainId, collateralReserve, debtReserve)`
  since Aave has no params-hash market id.
- Models a borrow market as the synthetic (collateral, debt) reserve pair on a
  shared Aave Pool: reads come from `getReserveData` / `getUserAccountData` and
  the specific reserve token balances via multicall; writes build `Pool.borrow`
  / `repay` / `supply` / `withdraw` calldata, with native ETH routed through the
  WETH gateway and full repays using `type(uint256).max`.
- Hoists the shared Aave addresses and Pool ABI to `actions/shared/aave/` so
  both the lend and borrow providers consume one cross-domain home.
