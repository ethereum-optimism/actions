# Review Pass 06 — Senior-Backend Money & Numeric Correctness

**Pass:** 6
**Skill / lens:** senior-backend — numeric & state-handling correctness (amount parse/format, slippage/BPS math, share/asset conversion, health-factor/LTV, owner-rotation state, receipt/status reconciliation)
**Surfaces:** swap, lend, borrow, wallet-core, wallet-hosted, wallet-smart, core-services

## Summary

This pass traced every caller-supplied amount from input through `parseAssetAmount`/`parseUnits`, `computeSlippageBounds`, per-provider encoders, and back, plus the state-correctness of receipt/status handling and owner-rotation, with Node micro-repros for the slippage and round-trip math.

**Incoming findings:** 30 across 7 surfaces.
**Outcome:** 4 NEW, 15 REFINES, 11 DUP (deduped against existing ledger rows / consolidated across surfaces).

**Counts by severity (NEW + REFINES recorded):**
- high: 4 (negative `amountOutMinRaw`; EOA mid-batch revert leaks infinite allowance; node PrivyWallet caller-address divergence; parseDecimalAmount silent precision loss)
- medium: 6
- low: 9

**Notable highlights:**
- The single most important new numeric mechanism: `computeSlippageBounds` and `validateSlippage` have no `slippage in [0,1)` guard, so `slippage >= 1.0` (reachable via `getQuote`, which skips `validateSlippage`, or via an integrator `maxSlippage > 1`) produces a NEGATIVE `amountOutMinRaw` that flows into Velodrome's signed router calldata as a wrapped/garbage uint256 (zero sandwich protection) or throws opaquely during signed-tx construction. Two loci both need the clamp (math chokepoint + validator).
- `EOAWallet.sendBatch` does not check `receipt.status`; combined with the lend max-mode approval, a deposit that mines-but-reverts after a successful approval leaves a residual infinite allowance with zero deposit, reported as success.
- Node `PrivyWallet` is the only hosted wallet that sets `this.address` from caller input (`params.address`) instead of `this.signer.address`; its own spec proves the reported address and signing key fully diverge while the test passes.
- `parseDecimalAmount`/`parseAssetAmount` silently lose precision for high-magnitude `number` amounts (worst on the lend path, the only one of lend/swap/borrow lacking a `*Raw` bigint escape hatch), baking a wrong-by-many-wei value into signed calldata.

---

## Surface: swap

### F114 (NEW) — Best-quote routing always maximizes amountOutRaw, the wrong objective for exact-output swaps
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/namespaces/BaseSwapNamespace.ts:104-110, 220-242
- **Severity:** medium
- **Class:** correctness
- **Title:** Best-quote routing always maximizes amountOutRaw, which is the wrong objective for exact-output swaps (should minimize amountInRaw cost)
- **Detail:** `getQuotes` sorts by `amountOutRaw` descending and `getBestQuote` selects the highest `amountOutRaw`. Correct for exact-INPUT (more output = better). For exact-OUTPUT the caller fixes `amountOut`, so every provider returns the SAME `amountOutRaw` (the target) and they differ only in `amountInRaw` (the cost). Maximizing `amountOutRaw` becomes a tie/no-op and "best" selection is arbitrary order-dependent rather than cheapest — the user can be routed to the provider that charges MORE input for identical output. The comparator never branches on swap direction. Latent today (only Uniswap supports exact-output; Velodrome rejects it) but direction-blind by construction; the SDK is explicitly multi-provider and price-routing is first-class.
- **Exploit/repro:** Two providers quoting exactOut=1000 USDC, A `amountInRaw=0.30 WETH`, B `amountInRaw=0.31 WETH`: `getBestQuote` compares `amountOutRaw` (equal) and returns whichever iterates first, not A.
- **Recommendation:** Branch the comparator on swap direction: for exact-output select MINIMUM `amountInRaw`; for exact-input keep MAXIMUM `amountOutRaw`. Add a two-exact-output-provider test asserting cheaper-input wins.
- **suggestRefactor:** true
- **Candidate issue:** none
- **Dedup status:** new

### F115 (NEW) — buildSwapPrice computes price/priceInverse as float divisions yielding Infinity/NaN for tiny/zero amounts
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/providers/velodrome/encoding/helpers.ts:74-75
- **Severity:** low
- **Class:** info
- **Title:** buildSwapPrice computes price/priceInverse as float divisions that yield Infinity/NaN for zero-or-tiny amounts and bakes them into the returned quote (display fields only, unvalidated)
- **Detail:** `buildSwapPrice` does `(amountOut / amountIn).toFixed(6)` and `(amountIn / amountOut).toFixed(6)` over `parseFloat(formatUnits(...))` human floats. For a tiny output (1 wei of an 18-dec token → 1e-18) `priceInverse` overflows toward Infinity; if either rounds to 0 the division yields `'Infinity'`/`'NaN'` strings written verbatim into `SwapPrice.price`/`priceInverse`. The Uniswap provider similarly computes `price: quote.amountOut / quote.amountIn` (UniswapSwapProvider.ts:165-166) as a raw Number division. These are display/metadata fields and do NOT feed the enforced min-out (raw bigint path), so info-level — but a non-finite price string can mislead a UI or downstream price comparator.
- **Exploit/repro:** `parseFloat(formatUnits(1n,18)) === 1e-18`; `(100/1e-18) === 1e20`; for `amountOut` underflowing to 0, `(x/0).toFixed(6) === 'Infinity'`.
- **Recommendation:** Guard the divisions: when `amountIn`/`amountOut` is 0/non-finite emit `'0'` or a sentinel rather than `'Infinity'`/`'NaN'`. No signing impact; cleanup only.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Dedup status:** new

### (refines:F001) — computeSlippageBounds produces a negative amountOutMinRaw for slippage >= 1.0, baking a wrapped/garbage min-out into signed swap calldata
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/core/SwapProvider.ts:286-298
- **Severity:** high
- **Class:** fund-loss
- **Title:** computeSlippageBounds produces a negative amountOutMinRaw for slippage >= 1.0 (and >1.0 on the getQuote path that skips validateSlippage), baking a wrapped/garbage min-out into signed swap calldata
- **Detail:** `slippageBps = BigInt(Math.round(slippage * 10000))`, then `amountOutMinRaw = amountOutRaw * (BPS_DENOMINATOR - slippageBps) / BPS_DENOMINATOR`. No internal `[0,1)` guard. For `slippage > 1.0` the factor `(10000 - slippageBps)` goes negative → `amountOutMinRaw` is a NEGATIVE bigint (slippage=2.0 on amountOut=1e9 → -1e9). Negative slippage yields a min-out ABOVE quoted output (slippage=-0.1 → 1.1e9), a guaranteed-revert signed swap. This raw bigint flows straight into encoded calldata: Velodrome `_getQuote` passes `amountOutMinRaw` into `encodePoolSwap` → `encodeSwap`/`encodeCLSwap` as the uint256 `amountOutMin` the router enforces; Uniswap's encoder recomputes its own min-out from `(1-slippage)` (encoding.ts:251-252) which is ALSO negative for slippage>1. A negative bigint encoded into a uint256 ABI param throws an opaque IntegerOutOfRange during signed-tx construction or, if masked, wraps to ~2^256 (an effectively-disabled min-out, zero MEV/sandwich protection). Critical reachability: `getQuote()` (SwapProvider.ts:164-167) does NOT call `validateSlippage`, and the poisoned quote can be passed directly into `execute()`; even on the execute() raw path, `validateSlippage` only rejects `slippage > maxSlippage` (default 0.5 but provider-configurable arbitrarily high) and never rejects the `>=1.0`/negative cases at the math layer.
- **Exploit/repro:** `const q = await provider.getQuote({...slippage: 1.5})` skips validateSlippage; `q.amountOutMinRaw` is negative; `wallet.swap.execute(q)` signs calldata whose router amountOutMin is negative-wrapped or construction throws opaquely. Node: `(1_000_000_000n * (10000n - BigInt(Math.round(1.5*10000)))) / 10000n === -500000000n`.
- **Recommendation:** Defend at the single math chokepoint: in `computeSlippageBounds` clamp/validate `0 <= slippage < 1` before the bigint subtraction and throw `SlippageOutOfRangeError` (or floor at 0n) so a negative min-out can never be encoded. Mirror in the Uniswap encoder's `(1-slippage)` and exact-output `slippage` computations. Fuzz: slippage in {-0.5,0,0.4999,0.5,0.9999,1.0,1.5,2.0,NaN,Infinity} × amountOutRaw in {1n,1e6,1e18,maxUint128} asserting `amountOutMinRaw in [0, amountOutRaw]` and encode does not throw/wrap.
- **suggestRefactor:** true
- **Candidate issue:** #318
- **Dedup status:** refines:F001 (sharpens the prior "(>=1.0, negative) minAmountOut" note with the concrete negative-bigint-into-calldata mechanism and the math-chokepoint fix locus). Paired locus recorded as refines:F110 (validateSlippage ceiling) under core-services.

### (refines:F041) — Raw-bigint _execute path round-trips amountInRaw/amountOutRaw through parseFloat(formatUnits(...)), losing wei on large amounts and crashing on tiny amounts
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/providers/uniswap/UniswapSwapProvider.ts:61-70
- **Severity:** medium
- **Class:** correctness
- **Title:** Raw-bigint _execute path round-trips amountInRaw/amountOutRaw through parseFloat(formatUnits(...)) then re-parses, silently losing wei on large precise amounts and throwing InvalidDecimalNumberError on tiny amounts
- **Detail:** Both providers' `_execute` take resolved raw bigints (`amountInRaw`/`amountOutRaw`) and convert to JS floats via `parseFloat(formatUnits(raw, decimals))` before re-feeding `_getQuote`, which re-parses them with `parseAssetAmount` → `parseUnits`. (1) Precision loss: an 18-dec `amountInRaw` of 1234567890123456789 round-trips to 1234567890123456700 (drops 89 wei; any 18-dec amount whose significant figures exceed float53 is truncated); the swap then executes against a different amountIn, and on Uniswap exact-output the wrong `amountInMaximum` is enforced. (2) Hard crash: a small raw amount (100 wei of an 18-dec token) formats to `'0.0000000000000001'`, `parseFloat` yields 1e-16, `.toString()` yields `'1e-16'`, and `parseAssetAmount` → `parseUnits('1e-16', 18)` throws `InvalidDecimalNumberError`. Swap-execute sibling of the assets.ts boundary but a separate code location, only on the raw-bigint execute path.
- **Exploit/repro:** `parseUnits(parseFloat(formatUnits(1234567890123456789n,18)).toString(),18) === 1234567890123456700n` (89 wei lost). Crash: `parseFloat(formatUnits(100n,18)).toString() === '1e-16'`; `parseUnits('1e-16',18)` throws.
- **Recommendation:** Plumb the raw bigints straight through to the encoder/quoter without the float detour (internal raw-amount entry to `_getQuote`, or encode from `amountInRaw`/`amountOutRaw` directly). Property test: for raw in {1n,100n,10^18+7n,1234567890123456789n,maxUint128} and decimals in {6,8,18}, assert the encoded amount equals the input raw exactly.
- **suggestRefactor:** true
- **Candidate issue:** #379
- **Dedup status:** refines:F041 (distinct code location: the raw-bigint `_execute` round-trip, not the `parseDecimalAmount` entry point).

### DUP — Sub-basis-point slippage coarsens to zero protection
- **Surface:** swap — File: packages/sdk/src/actions/swap/core/SwapProvider.ts:275, 286-298 — Severity: low
- **Dedup status:** dup:F005. The existing `(refines:F005)` row (Pass 2, SwapProvider.ts:286-298) already records "computeSlippageBounds rounds slippage to whole bps; sub-bp slippage coarsens to 0 protection and diverges display vs enforced". Same file, same root cause; no new mechanism beyond the zero-protection boundary already captured.

### DUP — Native-in exact-output msg.value from resolveQuoteDefaults `?? 1` placeholder
- **Surface:** swap — File: packages/sdk/src/actions/swap/providers/uniswap/UniswapSwapProvider.ts:172 — Severity: low
- **Dedup status:** dup:F004. The existing `(refines:F004)` row (Pass 3, UniswapSwapProvider.ts:172) already records "Native-in exact-output attaches 1-unit placeholder value, not the encoded amountInMaximum". Same file:line, same root; this only names the `?? 1` default as the placeholder source.

---

## Surface: lend

### F116 (NEW) — Aave getReserve fills supply.totalAssets/totalShares with semantically wrong reserve fields
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/providers/aave/sdk.ts:173-176
- **Severity:** medium
- **Class:** correctness
- **Title:** Aave getReserve fills supply.totalAssets/totalShares with semantically wrong reserve fields (idle liquidity + borrow-side scaled debt)
- **Detail:** `getReserve` returns `supply = { totalAssets: BigInt(reserve.availableLiquidity), totalShares: BigInt(reserve.totalScaledVariableDebt || '0') }`. The `LendMarketSupply` contract (types/lend/base.ts:60-65) documents `totalAssets` as "Total underlying assets in the vault" and `totalShares` as "Total vault shares issued". Neither is what is written: `availableLiquidity` is only the idle/unborrowed portion (not total supplied), and `totalScaledVariableDebt` is the borrow-side scaled debt, not a supply-share count. The Morpho sibling (morpho/sdk.ts:282,366-368) correctly fills these with `vault.totalAssets`/`vault.totalSupply`. Any consumer computing a share price or utilization as `supply.totalAssets/supply.totalShares` across the two providers gets a meaningful number for Morpho and garbage for Aave: a reserve with 1M supplied / 600k borrowed reports totalAssets=400k (idle), totalShares=scaledVariableDebt — a cross-unit ratio with no financial meaning.
- **Exploit/repro:** Call `actions.lend.getMarket` on an Aave reserve with nonzero borrows; read `market.supply.totalAssets`/`totalShares`; totalAssets equals only idle liquidity and totalShares equals borrow-side scaled debt.
- **Recommendation:** Populate `totalAssets` from total aToken supply (availableLiquidity + totalVariableDebt + totalStableDebt, or `reserve.totalLiquidity`) and `totalShares` from the aToken scaled total supply, matching the Morpho semantics. If Aave aTokens are 1:1 with underlying (as `_getPosition` assumes at line 201), set `totalShares == totalAssets` explicitly and document the invariant.
- **suggestRefactor:** false
- **Candidate issue:** #209
- **Dedup status:** new

### (refines:F008) — closePosition scales withdraw amount by caller-supplied asset.metadata.decimals with no reconciliation against on-chain underlying decimals
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/core/LendProvider.ts:205-218
- **Severity:** medium
- **Class:** correctness
- **Detail:** `closePosition` parses the withdraw amount via `parseAssetAmount(params.asset ?? market.asset, params.amount)`, using `params.asset.metadata.decimals`. The only check on `params.asset` is `validateMarketAsset` (utils/markets.ts:50-76), which compares ONLY `address[chainId]` equality, never `metadata.decimals`. A caller-constructed Asset whose address matches the underlying but whose `metadata.decimals` is wrong (e.g. decimals:18 for 6-decimal USDC) passes the address check, and the human amount is scaled by `10^(wrongDecimals)`. The resulting `amountWei` is baked verbatim into the Aave `POOL.withdraw`/`WETHGateway.withdrawETH`/`MetaMorpho.withdraw` calldata. A 100-unit close with decimals off by 12 becomes a 10^12× over/under-withdraw on a signed tx. Close-path twin of the open-path decimals hazard (refines:F008 at LendProvider.ts:90); the close path was not separately flagged and has its own parse at line 215-218. `resolveUnderlyingDecimals` exists for getPosition but is never used to validate parse-time decimals.
- **Exploit/repro:** Construct an Asset whose `address[chainId]` equals the market underlying but with wrong `metadata.decimals`; call `closePosition({ amount: 100 })`; `validateMarketAsset` passes (address match), `parseAssetAmount` scales by the wrong decimals, emitting mis-scaled withdraw calldata.
- **Recommendation:** Resolve authoritative underlying decimals (from resolved `market.asset` or via `resolveUnderlyingDecimals`) for `parseAssetAmount` on both open and close, OR extend `validateMarketAsset` to also assert `asset.metadata.decimals === market.asset.metadata.decimals`.
- **suggestRefactor:** true
- **Candidate issue:** #334
- **Dedup status:** refines:F008 (new close-path call site; prior F008 cluster covers the open path).

### (refines:F101) — Morpho APY breakdown reverses the performance fee via 1/(1-performanceFee) with no guard against fee>=1e18
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/providers/morpho/sdk.ts:472-491
- **Severity:** low
- **Class:** correctness
- **Detail:** `calculateApyBreakdown` computes `baseApyBeforeFees = baseApyAfterFees / (1 - performanceFee)` where `performanceFee = Number(vault.fee)/1e18` (line 473-474). `calculateBaseApy` similarly does `baseApy * (1 - vaultFeeRate)` (line 113). When `performanceFee == 1` (fee == 1e18) the division is x/0 → Infinity (or 0/0 → NaN); when `performanceFee > 1` (fee > 1e18) `baseApyBeforeFees` flips sign and `netApy` becomes nonsensical, and that `netApy` is returned as `apy.total` and copied into `LendTransaction.apy`. Real MetaMorpho vaults cap fee at 50% (SDK path `fetchAccrualVault` is bounded), but the on-chain fallback `fetchVaultDataOnChain` reads `metaMorpho.fee()` with no upper-bound assertion (sdk.ts:137,276) and the math helpers accept the value as `any` (line 80,469) with no finiteness/range guard. Sharpens F101 by isolating a distinct INTERNAL-math hazard (the fee-reversal division) vs F101's external-reward-sum coalescing.
- **Exploit/repro:** Point the on-chain fallback at a vault whose `fee()` returns 1e18; `calculateApyBreakdown` divides by `(1-1)=0` and returns `apy.total = Infinity/NaN`, propagating to `getMarket` and `LendTransaction.apy`.
- **Recommendation:** Clamp/validate `performanceFee` into `[0, <1)` before dividing (reject or floor at protocol max, guard `1-performanceFee > 0`), and assert `Number.isFinite` on the resulting APY. Treat a fee read of `>=1e18` from the on-chain fallback as a data error.
- **suggestRefactor:** false
- **Candidate issue:** #337
- **Dedup status:** refines:F101 (distinct internal-math hazard vs the external-reward-value path F101 records).

### (refines:F041) — formatAssetAmount round-trips a bigint through parseFloat, losing precision for large/high-decimal balances and breaking on negative input
- **Surface:** lend / core-services (consolidated)
- **File:** packages/sdk/src/utils/assets.ts:44-55
- **Severity:** low
- **Class:** correctness
- **Detail:** `formatAssetAmount` builds the decimal string from the bigint then returns `parseFloat(result)`, collapsing the exact wei value into an IEEE-754 double. For balances above ~2^53 base units (any 18-dec balance above ~9M tokens; far worse for 27-dec ray-scaled values) the returned number loses low-order digits, so it is NOT a precision-faithful inverse of `parseDecimalAmount`. Separately, for a negative `amount` (signature permits any bigint), `wholePart`/`fractionalPart` are negative and `fractionalPart.toString()` carries a leading `'-'`, so `padStart(decimals,'0')` produces a malformed string → wrong/NaN parse. Confirmed no in-tree consumer in a signing path (only its own definition in src; `tokenBalance` uses `formatUnits` directly), so impact today is display-only/latent — but as an exported util it is a foot-gun: any future caller treating it as the inverse of `parseDecimalAmount` corrupts large amounts.
- **Exploit/repro:** `formatAssetAmount(10n**24n, 18)` returns a rounded double rather than exactly 1000000; reparsing does not recover the wei. `formatAssetAmount(-5n, 6)` → `padStart` on `'-5'`.
- **Recommendation:** Return the exact decimal string (as `formatUnits` does, which `_getPosition` already uses) rather than a lossy number, or document the precision boundary and keep number output only for small display values; guard `amount < 0n`. Align with the #379 push to accept/return raw bigint amounts.
- **suggestRefactor:** true
- **Candidate issue:** #379
- **Dedup status:** refines:F041 (format-side twin of the parse-side cluster; consolidates the lend and core-services reports of the same util — the core-services report adds the negative-input padStart break).

### (refines:F009) — closePosition has no positivity/finiteness check on params.amount before parsing and encoding a withdraw
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/core/LendProvider.ts:195-227
- **Severity:** low
- **Class:** correctness
- **Detail:** `closePosition` validates walletAddress, allowlist, and (optionally) asset, then calls `parseAssetAmount(params.asset ?? market.asset, params.amount)` with no `validateAmountPositiveIfExists`/finiteness check. A zero amount produces an encoded `withdraw(0)`/`withdrawETH(0)` the wallet still signs and dispatches (gas wasted/no-op); a NaN/negative reaches `parseUnits(amount.toString(), decimals)` and throws an opaque viem error rather than a named SDK error. The open path shares this gap (refines:F009 at LendProvider.ts:84-90); this records the close-path call site explicitly because it has its own parse at 215-218 and is the leg most likely to receive a stale/zero amount from a "withdraw remaining" UX. `validateAmountPositiveIfExists` itself admits NaN/+Infinity (F111), so wiring it in does not fully close the hazard until F111 is fixed.
- **Exploit/repro:** `closePosition({ amount: 0 })` parses to 0n and returns `withdraw` calldata with amount 0n that dispatch will sign. `closePosition({ amount: NaN })` → `parseUnits('NaN', decimals)` throws opaquely.
- **Recommendation:** Call `validateAmountPositiveIfExists(params.amount)` (hardened per F111) at the top of `closePosition`, before `parseAssetAmount`, matching the swap sibling's pre-parse guard.
- **suggestRefactor:** false
- **Candidate issue:** #303
- **Dedup status:** refines:F009 (close-path call site; prior F009 row covers open/close generically at 84-90).

---

## Surface: borrow

### F117 (NEW) — Aave maxLtv (and derived safeCeilingLtv) populated from the liquidation THRESHOLD, not the borrow LTV
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/providers/aave/presentation.ts:176, 224
- **Severity:** medium
- **Class:** correctness
- **Title:** Aave maxLtv (and the derived safeCeilingLtv) is populated from the liquidation THRESHOLD, not the borrow LTV; the decoded ltvBps is read then discarded, overstating safe borrow capacity
- **Detail:** `decodeReserveConfig` (aave/state.ts:33-45) correctly decodes two distinct fields: `ltvBps = data & 0xffff` (bits 0-15, max borrowing LTV) and `liquidationThresholdBps = (data >> 16) & 0xffff` (bits 16-31, the higher liquidation threshold). But `fetchAaveMarketState`/`fetchAavePositionState` only forward `liquidationThresholdBps`; `ltvBps` is decoded and thrown away. Then `toAaveBorrowMarket` (presentation.ts:176) and `toAaveBorrowPosition` (presentation.ts:224) both set `maxLtv: bpsToFraction(state.liquidationThresholdBps)`. For a typical reserve (WETH LTV 80% / LT 82.5%) this reports `maxLtv = 0.825` instead of `0.80`. The shared envelope then computes `safeCeilingLtv = positionAfter.maxLtv * (1 - healthBufferPct)` (core/quote.ts:54), yielding `0.825*0.95 = 0.784` rather than `0.80*0.95 = 0.76` — a caller sizing a borrow against `safeCeilingLtv` is told it is safe to borrow ~2.4 percentage points past Aave's actual max LTV, into territory `Pool.borrow` may reject and that erodes the intended health buffer. The Morpho sibling uses `morphoWadToNumber(config.marketParams.lltv)` for `maxLtv` (Morpho's only LTV, correct), so the two providers disagree on what `maxLtv` means.
- **Exploit/repro:** A reserve config with `ltvBps=8000`, `liquidationThresholdBps=8250` must yield `market.maxLtv === 0.80`; current code yields 0.825. Assert `safeCeilingLtv <= maxLtv(borrow)` and that it never exceeds the on-chain LTV.
- **Recommendation:** Forward `ltvBps` through `AaveMarketState`/`AavePositionState` and populate `maxLtv` from `bpsToFraction(state.ltvBps)`, keeping `liquidationThresholdBps` solely for HF/liquidation-price math. If the field is intentionally the liquidation threshold, rename it and document the cross-provider semantic.
- **suggestRefactor:** true
- **Candidate issue:** none
- **Dedup status:** new

### (refines:F015) — Morpho close with an explicit (non-max) collateralAmount exceeding live collateral is projected and signed without a bound; zero collateral encodes a no-op leg
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/providers/morpho/close.ts:36-43
- **Severity:** low
- **Class:** correctness
- **Detail:** In `computeClose` an explicit collateral amount is taken verbatim: `withdrawCollateralWei = params.collateralAmount.amountWei` and fed into `after.withdrawCollateral(withdrawCollateralWei)` and `encodeMorphoWithdrawCollateral(...)`. There is no check that it is `<= after.collateral`. The blue-sdk `withdrawCollateral` projection may throw on underflow, but an explicit over-withdraw is not normalized/clamped to the live balance the way the `max` branch is, and `_withdrawCollateral` (MorphoBorrowProvider.ts:241-250) similarly trusts `params.amount.amountWei` for non-max. By contrast the Aave withdraw/close paths route through `resolveAaveAmount` and guard `EmptyPositionError` on max. A `0` explicit collateral on close produces a no-op `withdrawCollateral(0)` leg only suppressed by the `> 0n` check in buildCloseTransactions:72, so the projection still calls `after.withdrawCollateral(0n)`.
- **Exploit/repro:** `closePosition({ collateralAmount: { amount: collateral*2 } })` should reject; currently it projects and signs a withdraw leg that reverts. `collateralAmount: { amount: 0 }` → `withdrawCollateral(0n)` projection no-op.
- **Recommendation:** Before projecting/encoding an explicit (non-max) Morpho collateral withdrawal on close and on `_withdrawCollateral`, validate `amountWei > 0n` and optionally `<= current.collateral`, throwing a domain error rather than emitting a guaranteed-revert leg. Mirror the Aave `resolveAaveAmount`/empty-position handling.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Dedup status:** refines:F015 (extends the Morpho exact-amount zero-collateral note with the over-sized-vs-live-balance bound).

### DUP — Borrow surface performs NO amount positivity/finiteness validation
- **Surface:** borrow — File: packages/sdk/src/actions/borrow/core/internalParams.ts:32-50,129-132 — Severity: medium
- **Dedup status:** dup:F015. The existing F015 + `(refines:F015)` at internalParams.ts:129-140 already record "Borrow amounts have no positivity/finiteness validation; raw-bigint path forwards 0/negative straight into calldata (swap sibling validates)". Same root, same builder. The NaN/Infinity → opaque viem throw detail is covered by the F111 cross-reference already in the ledger.

### DUP — Borrow inherits the parseDecimalAmount scientific-notation/precision boundary
- **Surface:** borrow — File: packages/sdk/src/utils/assets.ts:17-19 — Severity: medium
- **Dedup status:** dup:F041. Same shared `parseDecimalAmount` root as F041 / `(refines:F041)`. The borrow call sites flow through the same util; no distinct code-location mechanism beyond what the refines:F041 cluster and the new high-severity parseDecimalAmount refinement (core-services) capture.

---

## Surface: wallet-core

### (refines:F021) — EOAWallet.sendBatch revert + lend max-mode approval leaves an outstanding infinite allowance with no deposit, reported as success
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:90-100
- **Severity:** high
- **Class:** fund-loss
- **Detail:** Sharpens F021/F020 with the concrete fund-safety end-state. `EOAWallet.sendBatch` loops `await this.send(tx)` and `send()` (62-73) returns the receipt without checking `receipt.status`. `WalletLendNamespace.dispatch` (actions/lend/namespaces/WalletLendNamespace.ts:93-97) emits `[approval, position]`; per refines:F008 the lend approval is max-mode (`approve(spender, maxUint256)`). Failure sequence: (1) approval tx mines → pool holds UNLIMITED allowance; (2) deposit tx mines but reverts (`status='reverted'`) due to a paused market, asset/market mismatch, or insufficient balance after a price move; (3) `send()` returns the reverted receipt with no throw; (4) `sendBatch` returns `[approvalReceipt, revertedDepositReceipt]`; (5) the namespace returns it and `extractReceiptHashes` surfaces both hashes as success. Net state: a residual infinite allowance to the pool, zero deposit, success reported. The smart-wallet path throws `TransactionConfirmedButRevertedError` on `!receipt.success` (DefaultSmartWallet.ts:352,414), so this is a sibling-validation gap.
- **Exploit/repro:** Fork test: deploy a lend market, force the deposit to revert (pause the pool or pass an asset whose balance is below `amount`) while letting `approve` succeed. Call `wallet.lend.openPosition` with a `LocalWallet` EOA. Assert receipts.length===2, receipts[1].status==='reverted', openPosition did not throw, and on-chain `allowance(user, pool) === maxUint256` while the user's aToken/share balance is unchanged.
- **Recommendation:** In `EOAWallet.send`, throw `TransactionConfirmedButRevertedError` when `receipt.status === 'reverted'`, mirroring `DefaultSmartWallet`'s `!receipt.success` guard. This aborts `sendBatch` before sending the dependent position tx after an approval revert and prevents namespaces from returning a reverted receipt as success. Add an `EOAWallet.spec` case with a `status:'reverted'` mock receipt (none exists today).
- **suggestRefactor:** false
- **Candidate issue:** none
- **Dedup status:** refines:F021 (adds the concrete allowance-leak end-state combining F021 with the max-mode lend approval).

### (refines:F054) — Borrow dispatch denormalizes positionAfter/borrowAmount onto the receipt even when the underlying EOA tx reverted
- **Surface:** wallet-core
- **File:** packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:232-247
- **Severity:** medium
- **Class:** correctness
- **Detail:** Ties refines:F054 (envelope reports quote metadata not post-exec reads) to the EOA revert gap (F020/F021). `dispatch()` awaits `executeTransactionBatch` then unconditionally builds a `BorrowReceipt` with `borrowAmount: quote.borrowAmountRaw`, `collateralAmount: quote.collateralAmountRaw`, and `positionAfter: quote.positionAfter` (projected HF/debt from quote time, core/quote.ts:43-54). For an EOA wallet, `EOAWallet.send/sendBatch` never inspects `receipt.status`, so a borrow that mines-but-reverts still resolves `dispatch()` and returns a `BorrowReceipt` whose `positionAfter` advertises a projected post-borrow LTV/health-factor that never materialized. A caller using `positionAfter.healthFactor` to decide further leverage is reading a fiction. EOA-vs-smart asymmetry.
- **Exploit/repro:** Fork test: build a borrow quote with `positionAfter.healthFactor = 1.4`, force the borrow tx to revert (exceed market LTV at execution), dispatch via `LocalWallet`, assert the resolved receipt still carries `positionAfter.healthFactor === 1.4` and `borrowAmount === quote.borrowAmountRaw` despite `receipt.status === 'reverted'`.
- **Recommendation:** Fixing the root `EOAWallet.status` guard makes `dispatch()` throw before constructing the envelope (cleanest). Independently, assert the underlying receipt status (EOA: `status === 'success'`; smart: `receipt.success`) before populating `positionAfter`, otherwise surface the reverted receipt without the projected post-state.
- **suggestRefactor:** true
- **Candidate issue:** none
- **Dedup status:** refines:F054 (ties the quote-metadata envelope to the EOA revert gap with a concrete misrepresentation).

### (refines:F023) — getWallet ignores caller nonce AND defaults signers to [signer.address], so a retrieved multi-owner wallet signs with ownerIndex 0 and wrong owners
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/providers/smart/default/DefaultSmartWalletProvider.ts:168-184
- **Severity:** medium
- **Class:** correctness
- **Detail:** Compounds F058 (nonce dropped) and F023/F114-cluster (ownerIndex not reconciled). `getWallet` calls `DefaultSmartWallet.create` with `deploymentAddress=walletAddress` but passes neither `nonce` nor (when omitted) `signers`. `create` then defaults `signers = [params.signer.address]` (DefaultSmartWallet.ts:122), `ensureLocalAccountSigner` returns signerIndex 0, and `getCoinbaseSmartAccount` (196-207) signs every UserOp with `ownerIndex: 0`/`owners: [signer]`. For a wallet whose signer is actually owner index 2 on chain, or that has additional owners, the Coinbase account's `isValidSignature` reverts and every send/sendBatch/addSigner/removeSigner UserOp is rejected by the bundler. This is the documented `getSmartWallet(walletAddress, signer)` happy path (no `signers` required by `GetSmartWalletOptions`), so a correct-looking call silently produces an unusable wallet. Recoverable (UserOp rejected, no funds move) hence medium.
- **Exploit/repro:** Deploy a CoinbaseSmartWallet with owners `[ownerA, ownerB]`; signer is `ownerB` (on-chain index 1). Call `provider.getWallet({ walletAddress, signer: ownerB })` with `signers` omitted. `getCoinbaseSmartAccount` uses ownerIndex 0 / owners:[ownerB]; signing any UserOp yields a signature rejected at index 0.
- **Recommendation:** On the address-known retrieval path, resolve the on-chain owner index via `findSignerIndexOnChain` before constructing the signing account (reconcile signerIndex/owners against the deployed wallet), or require callers to pass the full `signers` array and validate the signer is present. Separately thread `nonce` through `getWallet` for the counterfactual/lazy-deploy case (F058).
- **suggestRefactor:** true
- **Candidate issue:** #163
- **Dedup status:** refines:F023 (compounds F058 nonce-drop with the ownerIndex-0 default on the primary retrieval path).

### DUP — sendTokens amount<=0 guard admits NaN/Infinity reaching parseUnits(number.toString())
- **Surface:** wallet-core — File: packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:537,547,512-525 — Severity: low
- **Dedup status:** dup:F036. The existing F036 + `(refines:F035)`/`(refines:F041)` sendTokens rows already record the NaN/non-finite and float-precision/scientific-notation gaps on this exact code. Consolidated with the wallet-smart sendTokens report below.

---

## Surface: wallet-hosted

### (refines:F074) — Node PrivyWallet is the only hosted wallet that sets address from caller input instead of signer.address; reported address and signing key can silently diverge
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/node/wallets/hosted/privy/PrivyWallet.ts:22, 36, 48-50
- **Severity:** high
- **Class:** malicious-sign
- **Detail:** Every other hosted wallet derives its address from the actual signer in `performInitialization`: node TurnkeyWallet (`this.address = this.signer.address`, TurnkeyWallet.ts:70), react TurnkeyWallet (65), react PrivyWallet (43), react DynamicWallet (44). Node PrivyWallet is the lone exception: the constructor sets `this.address = params.address` (line 36, caller-supplied) and `performInitialization` only assigns `this.signer = await this.createSigner()` (line 49) — it NEVER reconciles `this.address` against `this.signer.address`. The signer is produced by `createViemAccount(privyClient, {walletId, address, ...})` and Privy resolves the signing key from `walletId`; there is no check that the caller's `address` equals the key the signer controls. `EOAWallet.walletClient` signs by `signer.address` while `Wallet.getBalance` and every lend/swap/borrow namespace compute balance reads, ERC20 approvals (spender/owner), `from`, and recipient against `wallet.address`. A valid-but-wrong address builds approvals/allowance checks/recipients for account A while the UserOp/tx is signed by account B — approvals from the wrong owner, balance gating on the wrong account, value moved from/approved against an unintended account. `PrivyWallet.spec.ts:41,46-52,70-98` proves the divergence is undetected: `wallet.address` resolves to the caller value (asserted line 78) while `wallet.signer.address` resolves to an UNRELATED `getRandomAddress()` (asserted line 97), and the suite passes.
- **Exploit/repro:** Construct a node PrivyWallet via `PrivyHostedWalletProvider.toActionsWallet({ walletId: <A's id>, address: <B's checksummed address> })`. `getAddress` passes (B is valid), `wallet.address` becomes B, but `wallet.signer` signs as A. `wallet.lend.openPosition`/`wallet.swap`: approvals and balance checks target B while the signed tx executes from A.
- **Recommendation:** In `PrivyWallet.performInitialization`, after `this.signer = await this.createSigner()`, either set `this.address = this.signer.address` (matching all four siblings) or assert `getAddress(this.address) === getAddress(this.signer.address)` and throw on mismatch. Consider promoting this into the shared `HostedWalletProvider`/`EOAWallet` init path (the F074 seam).
- **suggestRefactor:** true
- **Candidate issue:** none
- **Dedup status:** refines:F074 (concrete, test-proven, value-affecting instance; node Privy uniquely cannot fall back to the signer-derived address like its four siblings). Also sharpens the prior `(refines:F029)` at PrivyWallet.ts:36.

### DUP — Node Privy createSigner forwards raw caller address, skipping getAddress normalization
- **Surface:** wallet-hosted — File: packages/sdk/src/wallet/node/wallets/hosted/privy/utils/createSigner.ts:27-32 — Severity: low
- **Dedup status:** dup:F028. The existing F028 + `(refines:F028)` rows already record "Node Privy toActionsWallet getAddress-checks but createSigner skips it". Same sibling-validation gap, same file family.

### DUP — Dynamic signer routes sign() to connector.signRawMessage with 0x-stripped digest, different backend than the other three methods
- **Surface:** wallet-hosted — File: packages/sdk/src/wallet/react/wallets/hosted/dynamic/utils/createSigner.ts:28-36 — Severity: low
- **Dedup status:** dup:F030. The existing F030 + `(refines:F030)`/`(refines:F062)` rows already record "Dynamic signer hand-rolls sign() with 0x hex-stripping on a divergent backend code path" and "mixes two backends with no reconciliation". Same root.

### DUP — Node Turnkey registry validateOptions only checks client truthiness; signing-key selectors arrive later
- **Surface:** wallet-hosted — File: packages/sdk/src/wallet/node/providers/hosted/registry/NodeHostedWalletProviderRegistry.ts:43-45 — Severity: low
- **Dedup status:** dup:F033. The existing F033 + `(refines:F033)` rows already record "validateOptions only checks client truthiness; the signing-key selectors (organizationId/signWith/ethereumAddress) bypass every validation choke point". Same root.

---

## Surface: wallet-smart

### (refines:F039) — removeSigner unconditionally calls removeOwnerAtIndex and never removeLastOwner; the only-owner removal path is unreachable and unguarded
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:390-422
- **Severity:** medium
- **Class:** correctness
- **Detail:** `removeSigner` always encodes `removeOwnerAtIndex(index, owner)` (line 406). The Coinbase Smart Wallet contract (ABI bundled in constants/index.ts) exposes BOTH `removeOwnerAtIndex` AND `removeLastOwner`, plus an `ownerCount()` view. In the MultiOwnable implementation `removeOwnerAtIndex` reverts `LastOwner()` when `ownerCount == 1`; the ONLY way to remove the final owner is `removeLastOwner(index, owner)`. The SDK never reads `ownerCount()` and never dispatches to `removeLastOwner`, so (a) removing the wallet's last owner silently reverts on-chain (`sendBatch` returns success:false → `TransactionConfirmedButRevertedError`) with no SDK-level explanation, and (b) there is no `ownerCount>1` guard before submitting. This is the concrete dispatch-gap underneath F039: prior refinements flagged "no ownerCount>1 guard / can brick (LastOwner)" but did not note that the SDK bundles `removeLastOwner`+`ownerCount` in its own ABI and simply never wires them, making the legitimate last-owner-removal flow permanently unreachable.
- **Exploit/repro:** Construct a `DefaultSmartWallet` whose on-chain `ownerCount` is 1, call `removeSigner(thatOwner, chainId)`. The encoded `removeOwnerAtIndex` reverts `LastOwner()`; `sendBatch().success` is false and the caller gets `TransactionConfirmedButRevertedError('remove signer call failed')` with no indication the cause was the last-owner constraint.
- **Recommendation:** Before encoding the removal, read `ownerCount()` (already in the bundled ABI). If `ownerCount === 1`, reject with an explicit error (removing the last owner bricks the wallet) or dispatch to `removeLastOwner(index, owner)` if that is the intended capability. At minimum add an `ownerCount>1` precondition so the only-owner case fails loudly in the SDK.
- **suggestRefactor:** true
- **Candidate issue:** #163
- **Dedup status:** refines:F039 (concrete missing-function dispatch: bundled removeLastOwner/ownerCount never wired).

### (refines:F107) — findSignerIndexOnChain iteration is driven by nextOwnerIndex (monotonic) not ownerCount; the load-bearing invariant is enforced only by a mislabeled test
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/utils/findSignerIndexOnChain.ts:39-63
- **Severity:** low
- **Class:** correctness
- **Detail:** `findSignerIndexOnChain` reads `nextOwnerIndex` and iterates `i = Number(nextOwnerIndex)-1` down to 0, skipping empty/removed slots (line 56). On the Coinbase Smart Wallet `nextOwnerIndex` is monotonically increasing across the wallet's lifetime (never decreases on removal), whereas `ownerCount` reflects live owners. The returned `i` is the absolute slot index, which is exactly what `removeOwnerAtIndex(index, owner)` needs, so the value is correct — but: (1) the scanned range grows unbounded with add/remove churn (the F107 latency observation), and (2) the unit test (findSignerIndexOnChain.spec.ts:22) labels the first mocked return `ownerCount` while the code reads `nextOwnerIndex` — the two counters are NOT interchangeable once any owner has been removed, and a future reader "fixing" the lookup to use `ownerCount` (which the SDK ABI also exposes, and which the removeSigner gap above will likely add) would produce wrong indices that skip live owners stored in high slots. The invariant (return the absolute slot, scan up to `nextOwnerIndex`, never `ownerCount`) is undocumented and only enforced by a mislabeled test.
- **Exploit/repro:** Add owner A (slot 0), add owner B (slot 1), remove A. `nextOwnerIndex=2`, `ownerCount=1`, B lives at slot 1. `findSignerIndexOnChain(B)` must return 1. If the loop bound were `ownerCount(=1)`, the scan would be `i=0..0` and B at slot 1 would never be found, returning -1 and breaking removeSigner for any owner whose absolute slot >= live owner count.
- **Recommendation:** Rename the test mock comment to `nextOwnerIndex` and add a code comment asserting the invariant: scan range MUST be `nextOwnerIndex`, the returned value is the absolute slot index consumed by `removeOwnerAtIndex`, and `ownerCount` must never be substituted. Add a fixture covering a wallet where `ownerCount < nextOwnerIndex` (an owner removed from a low slot, a live owner in a high slot).
- **suggestRefactor:** false
- **Candidate issue:** none
- **Dedup status:** refines:F107 (distinct correctness invariant: nextOwnerIndex-vs-ownerCount, beyond the unbounded-loop latency note F107 records).

### DUP — WebAuthn owner bytes derived two incompatible ways (addSigner decodeAbiParameters vs removeSigner formatPublicKey)
- **Surface:** wallet-smart — File: packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:310-348,400-407 — Severity: low
- **Dedup status:** dup:F038. The existing F038 + `(refines:F038)` rows already record "WebAuthn owner add (decodeAbiParameters x||y) vs lookup/remove (formatPublicKey pass-through) derive owner bytes two ways with no assertion they match" and the missing-length-check on the 65-byte mis-split. Same root.

### DUP — sendTokens parses a JS-number amount via parseUnits with only a >0 check
- **Surface:** wallet-smart — File: packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:512-561 — Severity: medium
- **Dedup status:** dup:F036. Same code/root as F036 + `(refines:F041)` (sendTokens NaN/Infinity, scientific-notation >=1e21, >2^53 precision loss, over-precision fractional). Consolidated with the wallet-core sendTokens report above; the concrete fuzz cases reinforce but do not add a new code location.

### DUP — addSigner trusts retryOnStaleRead's resolved index without confirming ownerAtIndex equals the encoded owner
- **Surface:** wallet-smart — File: packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:310-375 — Severity: low
- **Dedup status:** dup:F093. The existing F093 row already records "addSigner has no duplicate/idempotency guard and never reconciles the returned on-chain index with the owner it actually encoded". The F060 retryOnStaleRead conflation is also already in the ledger. Same root.

---

## Surface: core-services

### (refines:F041) — parseDecimalAmount/parseAssetAmount silently lose precision for high-magnitude number amounts, baking a wrong-by-many-wei value into signed txs
- **Surface:** core-services
- **File:** packages/sdk/src/utils/assets.ts:17-19, 30-36
- **Severity:** high
- **Class:** fund-loss
- **Detail:** `parseDecimalAmount(amount: number, decimals)` does `parseUnits(amount.toString(), decimals)`. For any caller amount whose required integer (`amount * 10**decimals`) exceeds `Number.MAX_SAFE_INTEGER` (~9e15), the IEEE-754 double has ALREADY lost precision before `toString()` runs, so the resulting bigint silently differs from intent. Reproduced: `parseDecimalAmount(123456789012.34567, 6)` yields `123456789012345670n` but the user's value maps to `...345678n` — low digits silently corrupted (worse for 18-dec: thousands of wei). This is the canonical conversion entry point on every value-moving path: LendProvider.open/closePosition (LendProvider.ts:90,215), SwapProvider.resolveParams (457-458), borrow internalParams.toAmountWei (131), DefaultSmartWallet.sendTokens (537,547). The LEND path is worst: `LendOpenPositionParams.amount` is ONLY a number (types/lend/base.ts:248) with no bigint escape hatch, unlike borrow (`amountRaw` via isRawAmount) and swap (`amountInRaw`/`amountOutRaw`). Depositing a full high-decimals balance read as a number forces the lossy path. Distinct from F041 (scientific-notation), which actually THROWS in parseUnits (`InvalidDecimalNumberError`) — a DoS, not a wrong-amount. This is the silent-wrong-amount variant and the value-correctness core of #379.
- **Exploit/repro:** `parseDecimalAmount(123456789012.34567,6) => 123456789012345670n` (intended `...345678n`); MATCH=false. For 18-dp WETH the corruption is ~1e3 wei. Caller never sees an error.
- **Recommendation:** In `parseDecimalAmount`, reject non-finite amounts and amounts that cannot be represented exactly at the target decimals (throw when `!Number.isFinite(amount)` and when precision exceeds `Number.isSafeInteger` range). Better: plumb the `*Raw` bigint escape hatch through the lend public params (parity with swap/borrow) so large/high-precision balances never round-trip through `number` (#379). Property test: for random (decimals 0..27, integer wei up to 1e27), `parseDecimalAmount(formatUnits(wei) as number)` either equals wei or throws — never returns a silently-different bigint.
- **suggestRefactor:** true
- **Candidate issue:** #379
- **Dedup status:** refines:F041 (the silent-precision-loss variant — materially distinct mechanism from F041's scientific-notation THROW — plus the lend-lacks-a-bigint-escape-hatch angle).

### (refines:F110) — validateSlippage has no slippage<=1 upper bound; an integrator maxSlippage>1 admits slippage>100% producing a NEGATIVE amountOutMinRaw that silently disables protection on a signed swap
- **Surface:** core-services
- **File:** packages/sdk/src/utils/validation.ts:111-115
- **Severity:** medium
- **Class:** correctness
- **Detail:** `validateSlippage` only rejects `slippage<0` or `slippage>maxSlippage`. `maxSlippage` is integrator-configurable (types/actions.ts:113; SwapProvider get maxSlippage 100-105) with no enforced `<=1` ceiling; the built-in `DEFAULTS.maxSlippage=0.5` is safe but an integrator can set 2.0. `computeSlippageBounds` (SwapProvider.ts:291-293) computes `slippageBps = BigInt(Math.round(slippage * 10000))` then `amountOutMinRaw = amountOutRaw * (BPS_DENOMINATOR - slippageBps) / BPS_DENOMINATOR`. For `slippage=1.5`, `slippageBps=15000 > 10000`, so `(10000-15000)` is negative → `amountOutMinRaw` is NEGATIVE. A negative minimum-out floor is satisfied by ANY output including near-zero, so the swap is signed with effectively zero slippage protection while the SDK still reports a (meaningless) bound. The value-affecting downstream consequence F110 (NaN admission) did not name: the validator gap turns into a negative signed floor. The validator is the right fix locus because `computeSlippageBounds` trusts whatever `validateSlippage` admits.
- **Exploit/repro:** `slippage=1.5, amountOut=1000000n` → `slippageBps=15000` → `amountOutMinRaw = 1000000*(10000-15000)/10000 = -500000n`. Negative floor → no protection.
- **Recommendation:** Add an absolute upper bound in `validateSlippage`: reject `slippage>1` (and `Number.isNaN`, per F110) regardless of `maxSlippage`. Equivalently clamp `maxSlippage<=1` where read. Tests: `validateSlippage(1.5, 2.0)` throws; property test on `computeSlippageBounds` asserting `amountOutMinRaw >= 0` and `<= amountOutRaw` for all admitted slippage.
- **suggestRefactor:** false
- **Candidate issue:** #373
- **Dedup status:** refines:F110 (the validator-locus pair of the swap-surface computeSlippageBounds negative-min-out finding; both loci of one hazard, recorded separately as the ledger already splits F001/F110).

### DUP — computeSlippageBounds rounds sub-0.5bps slippage to 0 bps
- **Surface:** swap/core-services — File: packages/sdk/src/actions/swap/core/SwapProvider.ts:291 — Severity: low
- **Dedup status:** dup:F005. Same as the swap-surface DUP above; already captured by `(refines:F005)`.

### DUP — formatAssetAmount round-trips bigint through parseFloat (lossy, negative-input break)
- **Surface:** core-services — File: packages/sdk/src/utils/assets.ts:44-55 — Severity: low
- **Dedup status:** consolidated into the lend-surface `(refines:F041)` formatAssetAmount entry above (which incorporates the core-services negative-input padStart detail). Not appended a second time.

---

## Cross-surface dedup note

The negative-`amountOutMinRaw` hazard surfaced from two loci (swap `computeSlippageBounds` and core-services `validateSlippage`); both are recorded as refinements (refines:F001 + refines:F110) because each is a separate code location needing its own clamp, mirroring the existing F001/F110 split. The `formatAssetAmount` and `sendTokens` numeric findings each surfaced on two surfaces and were consolidated to a single recorded entry. The known prior clusters (isAddress F099/F105/F108, NaN F110/F111, deadline F097, pre-built-quote dispatch F070, EOA status F020/F021, ownerIndex F023/F114-cluster, attribution suffix F037/F059/F063/F065, retryOnStaleRead F060) were re-derived and confirmed but not re-filed.
