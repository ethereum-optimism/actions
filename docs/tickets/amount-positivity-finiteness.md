# Reject zero/negative/non-finite amounts on lend, borrow, and smart-wallet transfer paths

>  AUGMENT existing issue #303 - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Complexity** | 3 / 5 |
| **Domain** | core |
| **Surface** | `LendProvider` open/close, borrow `internalParams` + Morpho/Aave encoders, `DefaultSmartWallet.sendTokens`, backend `AmountByRaw` / `AmountByHuman` |
| **Resolves findings** | F009, F015, F036, F297, F319 |
| **Candidate existing issue** | #303 |
| **Blocked by** | (none) |

## Problem

The swap surface gates every write through `validateSwapExecute`, which runs `validateAmountProvided` + `validateAmountPositiveIfExists` before any amount reaches `parseUnits` or calldata (`SwapProvider.ts:446-448`). The sibling lend, borrow, and smart-wallet-transfer paths skip that gate entirely. The SDK already knows the amount is degenerate the moment it is handed in, but it signs anyway and lets the chain (or a silent drop) absorb the mistake.

Concretely, a `0` / negative / `NaN` / `Infinity` amount on these paths produces a **signable** artifact that is guaranteed to misbehave:

- A negative amount is stringified and passed to `parseUnits`, which accepts a leading `-` and yields a NEGATIVE `bigint` that flows straight into `approve(spender, amount)` and the supply/borrow/transfer `uint256` argument.
- A `0` amount yields a real approval+supply/withdraw/transfer for zero value, or (on the borrow open path) a guaranteed-revert `Pool.borrow(asset, 0, ...)` leg, or (Morpho) a borrow leg silently dropped while collateral is still deposited.
- `NaN` / `Infinity` slip past the one numeric guard that does exist (`amount <= 0` is `false` for both) and reach `parseDecimalAmount` -> `parseUnits` as malformed calldata, or throw an opaque viem error instead of a named SDK error.

This is a fund-safety gap, not a cosmetic one: the user signs a transfer/position/approval that the SDK could have rejected up front, and the borrow projection math even clamps a negative `borrowAmount` to PRESENT a healthy position (`presentation.ts:132-135` `max0`) while the encoded calldata carries the garbage value. The fix is to apply the shared positivity+finiteness guard symmetric with swap, and to extend that guard so it is finiteness-aware (today it is not).

## Findings

- **F009** (`packages/sdk/src/actions/lend/core/LendProvider.ts:84-118`, close at `195-227`) — `openPosition` / `closePosition` convert `params.amount` straight through `parseAssetAmount` with no positivity/finiteness check; a `0` amount builds a real approval+supply/withdraw for zero, negative feeds a negative bigint into `approve` + supply/withdraw, NaN/fractional throws an opaque `parseUnits` error instead of a named SDK error.
- **F015** (`packages/sdk/src/actions/borrow/core/internalParams.ts:129-140`) — `toAmountWei` passes the `{ amountRaw: bigint }` branch through unchecked (any `0n`/negative bigint) and the `{ amount }` branch through `parseDecimalAmount` (accepts a leading `-`); no borrow write path validates the amount is positive the way swap does. Open-path face: `aave/quote.ts:109-111` and `morpho/open.ts:58-66` unconditionally append a borrow leg even when `borrowAmountWei === 0n`, emitting a guaranteed-revert `Pool.borrow(asset,0,...)` / dropped Morpho borrow; collateral legs in `morpho/MorphoBorrowProvider.ts:190-229,231-272` and `morpho/close.ts:36-43` encode a zero/over-withdraw leg with no `>0` guard.
- **F036** (`packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:522-525,536-561`) — `sendTokens` guards `if (amount <= 0)` only; `NaN <= 0` and `Infinity <= 0` are both `false`, so non-finite amounts reach `parseAssetAmount` -> `parseDecimalAmount` and are encoded into a real ERC-20 `transfer` / native-value transfer.
- **F297** (`packages/demo/backend/src/helpers/schemas.ts:47-49,57-61,67-75`) — `AmountByRaw` is `z.string().regex(/^\d+$/).max(78)` with NO positivity refine, while its twin `AmountByHuman` enforces `z.number().positive()`. `/^\d+$/` matches `"0"`, so `amountRaw:"0"` (BigInt `0n`) passes `AmountExactSchema` / `AmountWithMaxSchema` into every fund-moving borrow route; the SDK does not close the raw path, so the boundary accepts a zero-borrow open that the human branch would 400.
- **F319** (`packages/demo/frontend/src/api/actionsApi.ts:143-156`) — `dripEthToWallet` POSTs a caller-supplied `walletAddress` with no auth headers, unlike `mintDemoUsdcToWallet` (72-85) and the lend/borrow/swap mutations; carried here only as a sibling-asymmetry note for the same review thread. Info-only, no fund-safety change (see Notes).

## Root cause

`validateAmountPositiveIfExists` / `validateAmountProvided` (`packages/sdk/src/utils/validation.ts:27-49`) exist and are correct in intent, but are wired in on the swap path only. The lend, borrow, and smart-wallet transfer builders each re-implement amount handling from scratch (or omit it), so the shared choke point is bypassed. Two compounding weaknesses:

1. **No symmetric call site.** Lend (`LendProvider`), borrow (`internalParams` / the Aave + Morpho encoders), and the smart-wallet `sendTokens` builder never invoke the shared guard, so `0`/negative/`NaN`/`Infinity` reaches `parseUnits` / calldata unchecked. The raw-bigint borrow branch (`amountRaw`) has no human-number equivalent of even the weak `<= 0` check.
2. **The guard itself is not finiteness-aware.** `validateAmountPositiveIfExists` checks `amount <= 0`, which is `false` for `NaN` and `+Infinity`, so even the swap path and `sendTokens` admit non-finite numbers today. The same `amount <= 0`-only weakness is F111 in the slippage ticket.

The backend (F297) is the request-boundary face of the same asymmetry: one of the two amount encodings enforces positivity and the other does not.

## Recommended approach

SDK (the substantive fix):

1. Extend the shared guard so it is finiteness-aware. In `validateAmountPositiveIfExists` (`utils/validation.ts:36-40`) reject `!Number.isFinite(amount)` in addition to `amount <= 0`, throwing `InvalidAmountError`. This single change also closes the swap-path NaN/Infinity hole and the `sendTokens` NaN/Infinity hole; coordinate with the slippage ticket (F111) so the two changes do not conflict.
2. Apply the guard symmetrically:
   - **Lend** — call `validateAmountProvided` + `validateAmountPositiveIfExists(params.amount)` at the top of `openPosition` and `closePosition` (`LendProvider.ts:84`, `195`), before `parseAssetAmount`, mirroring `validateSwapExecute`.
   - **Borrow** — reject non-`max` amounts that are `<= 0` (and, for the human branch, non-finite) in `BorrowProvider`'s public write methods or the `buildXInternalParams` builders, covering BOTH the `{ amount }` and the raw `{ amountRaw: bigint }` branch of `toAmountWei` (`internalParams.ts:129-140`). The raw-bigint path needs an explicit `amountRaw > 0n` check since `Number.isFinite` does not apply to a `bigint`. Apply uniformly to open / repay / depositCollateral / withdrawCollateral / close so a zero leg never reaches `encodeAaveBorrow` / `encodeMorphoBorrow` / the collateral encoders.
   - **Smart-wallet transfer** — strengthen the `sendTokens` guard to `if (!Number.isFinite(amount) || amount <= 0) throw` (`DefaultSmartWallet.ts:522-525`). Prefer routing through the shared validator + a named `InvalidAmountError` rather than the inline `throw new Error('Amount must be greater than 0')`, for parity with the rest of the SDK.

Backend (F297, low-risk fix, no refactor):

3. Add a positivity refine to `AmountByRaw` so the raw branch matches the human branch: `z.string().regex(/^\d+$/).max(78).refine((s) => BigInt(s) > 0n, 'amountRaw must be positive')` (`schemas.ts:47-49`). One line, gives positivity parity across both encodings without depending on the SDK fix landing first. Keep `AmountByMax` untouched.

Frontend (F319, review-only, no refactor):

4. Info-only. If the backend faucet route is meant to drip only to the authenticated wallet, route `dripEthToWallet` through `getAuthHeaders()` like the sibling mutations and derive the address server-side. No fund-safety change required for the demo; record and move on.

## Affected files

- `packages/sdk/src/utils/validation.ts:27-49` — extend `validateAmountPositiveIfExists` to reject non-finite; shared guard.
- `packages/sdk/src/actions/lend/core/LendProvider.ts:84-118` (open), `195-227` (close) — add positivity/finiteness guard before `parseAssetAmount`.
- `packages/sdk/src/actions/borrow/core/internalParams.ts:129-140` — guard both `toAmountWei` branches (human + raw bigint).
- `packages/sdk/src/actions/borrow/providers/aave/quote.ts:109-111` — zero-borrow open leg appended unconditionally.
- `packages/sdk/src/actions/borrow/providers/morpho/open.ts:58-66` — same zero-borrow open leg.
- `packages/sdk/src/actions/borrow/providers/morpho/close.ts:36-43` — collateral withdraw leg, no `>0` guard.
- `packages/sdk/src/actions/borrow/providers/morpho/MorphoBorrowProvider.ts:190-229,231-272` — exact-amount deposit/withdraw collateral legs, no zero guard.
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:522-525,536-561` — `sendTokens` `amount <= 0`-only guard.
- `packages/demo/backend/src/helpers/schemas.ts:47-49,57-61,67-75` — `AmountByRaw` missing positivity refine (review-only, one-line backend fix).
- `packages/demo/frontend/src/api/actionsApi.ts:143-156` — `dripEthToWallet` auth-header asymmetry (review-only, info).

## Acceptance criteria / tests

- `LendProvider.openPosition` and `closePosition` reject `amount: 0`, `amount: -5`, `amount: NaN`, `amount: Infinity` with `InvalidAmountError` (named, not an opaque `parseUnits` throw) before building any approval/supply/withdraw tx.
- Borrow open/repay/depositCollateral/withdrawCollateral/close reject `{ amount: <= 0 }`, `{ amount: NaN/Infinity }`, and `{ amountRaw: 0n }` / negative-bigint with `InvalidAmountError`; assert no `encodeAaveBorrow` / `encodeMorphoBorrow` / collateral encoder is reached for a zero leg.
- A borrow `getQuote({ action:'open', borrowAmount:{ amount:-100 } })` no longer encodes a negative bigint into calldata while presenting a clamped-healthy projection — it is rejected at the entry point.
- `DefaultSmartWallet.sendTokens` rejects `NaN` and `Infinity` (e.g. `sendTokens(Number('abc'), ...)`), not just `amount <= 0`. This pairs with F240 (sendTokens currently has zero unit-test coverage in the smart-wallet suite); add the positivity/finiteness cases there.
- Backend: `POST /borrow/position/open` with `borrowAmount:{ amountRaw:'0' }` returns 400 from request validation (parity with `borrowAmount:{ amount:0 }`), via an `AmountByRaw` positivity-refine test.
- The extended `validateAmountPositiveIfExists` has direct unit tests for `0`, negative, `NaN`, `+Infinity` (this also backs the swap path and the slippage ticket's F111).

## Notes

- Scope: this is the missing-OBVIOUS-validation + fail-closed-where-the-SDK-already-knows + sibling-consistency lens. The SDK already holds the amount and the swap-sibling proof that a guard belongs here; nothing speculative.
- The finiteness extension of `validateAmountPositiveIfExists` overlaps the slippage ticket (F111). Land them coherently so neither reverts the other.
- F319 (frontend faucet auth asymmetry) and the F297 backend schema fix are demo-surface and REVIEW-ONLY: the schema refine is a one-line low-risk fund-safety parity fix; the frontend item is info-only with no architectural refactor.
- F240 (sendTokens has no unit test in the smart-wallet suite, candidate #379) is the natural home for the new `sendTokens` finiteness cases; this ticket's `sendTokens` test work and F240 coverage should be done together.
- The Morpho "max" close snapshot-vs-live-balance divergence (refines:F015 at `morpho/close.ts:36-42`) is a distinct max-semantics asymmetry, NOT the missing `>0` guard, and is out of scope for this ticket.
