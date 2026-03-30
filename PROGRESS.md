# Issue #303 Progress

## Completed
- ✅ Updated base types in `packages/sdk/src/types/lend/base.ts`
  - `LendTransaction`: Added `amountRaw: bigint`, changed `amount` to `number`
  - `LendMarketPosition`: Changed `balance`/`shares` from `bigint` to `number`, added `balanceRaw`/`sharesRaw`
  - `LendClosePositionParams`: Renamed `amount` → `amountRaw`
- ✅ Updated `LendProvider.ts` core class
  - `closePosition`: Changed `amount:` → `amountRaw:` in internal call
- ✅ Updated Morpho provider (`MorphoLendProvider.ts`)
  - `_openPosition`: Returns both `amount` (number) and `amountRaw` (bigint)
  - `_closePosition`: Uses `params.amountRaw`, returns both formats
  - `_getPosition`: Returns `balance`/`shares` as numbers with Raw variants
- ✅ Updated Aave provider (`AaveLendProvider.ts`)
  - `_openPositionWithETH`: Returns both `amount` (number) and `amountRaw` (bigint)
  - `_openERC20Position`: Same
  - `_closePositionWithETH`: Uses `params.amountRaw`, returns both formats
  - `_closeERC20Position`: Same
  - `_getPosition`: Returns `balance`/`shares` as numbers with Raw variants

## Remaining Work
- [ ] Fix test files (currently failing due to missing `amountRaw` in mocks)
  - `packages/sdk/src/lend/namespaces/__tests__/WalletLendNamespace.spec.ts`
  - `packages/sdk/src/lend/core/__tests__/LendProvider.test.ts`
  - Morpho/Aave provider tests
- [ ] Update demo backend (`packages/demo/backend/`)
  - `src/types/lend.ts` — response types
  - `src/services/lend.ts` — serialization
  - `src/services/lend.spec.ts` — tests
- [ ] Update demo frontend (`packages/demo/frontend/`)
  - `src/types/api.ts` — `PositionResponse` type
  - `src/hooks/useLendProvider.ts` — `balanceFormatted` → `balance`
  - `src/hooks/useWalletBalance.ts` — same
  - `src/mutations/useLendPosition.ts` — amount references

## Build Status
- ❌ SDK build: TypeScript errors in test files (mock objects missing `amountRaw`)
- Providers compile successfully with warnings

## Next Steps
1. Update all test mocks to include `amountRaw` field
2. Update demo backend/frontend (if those packages exist)
3. Run full test suite
4. Update any remaining references found during testing
