# Handoff to PR #4 and PR #5 — what's now unblocked, what's on you

> **Source of truth:** PR #3 (`kevin/borrow-pr3`). Update sync after
> reviewing `packages/sdk/src` at HEAD of that branch — types, namespace
> methods, and `BorrowReceipt` envelope all moved between the original
> hand-off docs and what's actually shipped now.

## What PR #3 just shipped to unblock you

### For PR #4 (demo backend `/borrow/*`)

| Original ask | What landed in PR #3 |
|---|---|
| **ASK-A1** — `getPrice` / `getQuote` on `actions.borrow` (the read-only namespace) | `BaseBorrowNamespace.getQuote(BorrowQuoteParams)` and `.getPrice(BorrowQuoteParams)`. Discriminated by `action: 'open' \| 'close' \| 'depositCollateral' \| 'withdrawCollateral' \| 'repay'`; dispatch to the matching provider verb. `getPrice` returns the lighter shape (no execution bundle / no expiration). Both inherited by `ActionsBorrowNamespace` and `WalletBorrowNamespace`. |
| **ASK-A2** — tx hashes on `BorrowReceipt` for explorer URLs | `BorrowReceipt` now denormalizes `transactionHash?: Hex`, `transactionHashes?: Hex[]`, `userOpHash?: Hex` on the envelope. The wallet namespace pulls them off the underlying union in `dispatch`. Backend can spread `{ chainId, ...receipt }` straight into `getBlockExplorerUrls` like it does for lend. |
| **ASK-A3** — drop `as unknown as NodeActionsConfig<'privy'>` cast | `BorrowConfig` was added to `ActionsConfig` in the original Phase 1; `NodeActionsConfig` is a generic re-parameterization of `ActionsConfig` so it already accepts `borrow?: BorrowConfig`. The cast is redundant. Drop it. |

### For PR #5 (demo frontend Borrow tab)

| Original ask | What landed in PR #3 |
|---|---|
| **Blocking — resolved `healthBufferPct` reachable from a read-only consumer** | `BorrowMarket.healthBufferPct: number` (precomputed per-market via the provider's resolution rule `market.healthBufferPct ?? settings.healthBufferPct ?? 0.05`). Drop `BORROW_HEALTH_BUFFER_PCT` in `packages/demo/frontend/src/config/borrow.ts` and read `market.healthBufferPct` instead. |
| **Nice to have — `BorrowReceipt.transactionHash?`** | Same as ASK-A2. Frontend can also use it directly if it ever bypasses the backend's `blockExplorerUrls` decoration. |

### Public SDK surface (importable from `@eth-optimism/actions-sdk`)

The package entry (`packages/sdk/src/index.ts`) now re-exports every borrow type PR #4 and PR #5 use, including the new `BorrowQuoteParams`. The internal `packages/sdk/src/index.ts` patch PR #4 was carrying (commit `a362f8d9` on `kevin/borrow-pr4`) can be dropped — same content, plus `BORROW_PROVIDER_NAMES` runtime constant and `BorrowQuoteParams`.

### Deployed state on baseSepolia (chain `84532`)

`packages/demo/contracts/state/deployments.json` carries the live market:

- `morpho.borrow.marketId` = `0x7dc82421423b50debf8c1f9f967f34367e0fb7bcdb1bda0cef27c319d89cd12f`
- `morpho.borrow.oracle` = `0xB31E326bF4BdB5Ab98eF19C16dd420C8d6176e86`
- `morpho.borrow.mockFeed` = `0x4304F8aD8F74805d0Ab3E13d6668F1F7F7048663`
- `morpho.borrow.marketParams.{loanToken, collateralToken, oracle, irm, lltv}` populated

PR #4's `MorphoBorrowDemo` config (`packages/demo/backend/src/config/markets.ts`) still uses placeholder zero values. Swap them for the live values above (or read straight from `deployments.json` like the deploy script does).

## What PR #4 can do now without waiting on us

1. **Swap the 501 stubs.** `controllers/borrow.ts:56-77` (`getPrice` and `getQuote`) — replace `errorResponse(501, ...)` with calls to `actions.borrow.getQuote(params)` and `actions.borrow.getPrice(params)`. The `params` body shape on the wire needs an `action` field plus the matching per-action params. Same auth split that's already coded in the routes (price public, quote auth).
2. **Decorate mutation responses with `blockExplorerUrls`.** Now that `transactionHash` / `transactionHashes` / `userOpHash` live on the `BorrowReceipt` envelope, the borrow services can spread `{ chainId, ...receipt }` into `getBlockExplorerUrls` exactly like lend does.
3. **Drop `as unknown as NodeActionsConfig<'privy'>`** in `config/actions.ts:66`.
4. **Replace placeholder `MorphoBorrowDemo` config values** with the live deployed addresses.
5. **Drop the local patch to `packages/sdk/src/index.ts`** (commit `a362f8d9`) — its contents are now upstream on PR #3, with `BorrowQuoteParams` and `BORROW_PROVIDER_NAMES` added.
6. **Controller-level integration tests** for the new `/borrow/price` and `/borrow/quote` endpoints — not gated on PR #3, just hadn't been scoped.

## What PR #5 can do now without waiting on us

1. **Drop `BORROW_HEALTH_BUFFER_PCT` stub.** Replace each consumer with `market.healthBufferPct`. Frontend already holds a `BorrowMarket` everywhere it needs the buffer (Health card, Max button, lend close warning).
2. **Wire `/borrow/price` per-keystroke preview.** Once PR #4 ships ASK-A1 (now unblocked), swap the client-side projection math in `borrowApi.ts` for backend round-trips.
3. **ASK-B1 — collateral-locked guard on lend close.** Pure frontend logic, no SDK or backend changes. Read `GET /wallet/borrow/:chainId/:marketId/position` for the pledged dUSDC, subtract from lend balance before allowing Max.
4. **ASK-B2 — null `healthFactor` / `ltv` for zero-position state.** Pure frontend; just branch on `=== null`.
5. **ASK-B4 — bigint deserialization at the API boundary.** Pure frontend; affects `collateralAmount`, `borrowAmount`, `liquidationPrice`, `marketParams.lltv`, `totalBorrowed`, `totalCollateral`, `gasEstimate`, and `execution.transactions[].value`.

## What stays open (not in PR #3's scope)

- **`actions.borrow.getMarketConfig(marketId)`** so direct-SDK callers can resolve a `BorrowMarketConfig` from a `BorrowMarketId`. Not blocking for PR #4/#5 since they go through the backend, but PR #6 (Aave direct-SDK) might want it.
- **USD price oracle.** PR #5 documents the stub (`USDC = $1`, `OP = $0.10`). Out of scope for PR #3.
- **Wallet-namespace max-path re-encoding at dispatch time.** Deferred in the PR #3 handoff; quotes still encode the borrowShares snapshot taken at quote time. Re-quoting via raw params re-fetches; the optimization only matters for accepted-quote dispatch.
- **`HostedProviderDeps.borrowProviders`.** Hosted wallets (Privy / Turnkey / Dynamic) don't yet expose `wallet.borrow`. Blocked on a TS declaration-emit inference depth issue (see PR #3 handoff). Workaround: local wallets / default smart wallets already work.

## Sync protocol

When you rebase onto the merged PR #3:

- PR #4: drop your local `packages/sdk/src/index.ts` patch (commit `a362f8d9`). Update `services/borrow.ts` to also expose `actions.borrow.getQuote / getPrice` from the controller. Replace placeholder config values.
- PR #5: replace `BORROW_HEALTH_BUFFER_PCT` reads with `market.healthBufferPct`. Everything else is purely frontend wire-up.
