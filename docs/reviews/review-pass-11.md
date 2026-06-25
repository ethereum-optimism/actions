# Review Pass 11 — ce-code-review Final Whole-Flow Sweep

**Pass:** 11
**Skill:** compound-engineering:ce-code-review
**Surfaces:** swap, lend, borrow, wallet-core, wallet-hosted, wallet-smart, core-services
**Lens:** whole-flow / cross-function / lifecycle integration (issues a single-function pass misses)

## Summary

This pass traced each surface end-to-end (namespace dispatch -> provider config resolution -> param normalization -> quote builders -> calldata encoders -> assembler -> wallet dispatch) rather than re-examining single functions. The surfaces are already exhaustively covered by F001-F261; the goal was net-new cross-function and integration findings plus sharpenings/refutations of prior rows.

**Counts by status:** 10 new · 17 refines · 1 dup
**Counts by severity (this pass's findings):** 0 critical · 0 high · 7 medium · 19 low · (1 info-tagged within low) · 1 dup (medium, not counted as a row)

**Notable highlights:**
- **F262 (medium):** `BaseSwapNamespace.getMarket` fallback loop swallows `MarketNotAllowedError` and re-admits, via a sibling provider, a pair one provider blocklisted — a cross-provider blocklist bypass, sharper than the opaque-logging framing of F098.
- **F267 (medium):** Counterfactual smart wallet derives its reported address two independent ways (SDK factory read vs viem internal CREATE2) that are never asserted equal; funds sent to `wallet.address` could be operated by a different sender if the two encodings ever diverge.
- **refines:F059 (wallet-smart):** F059's premise is factually inverted — Coinbase Smart Account pins EntryPoint to v0.6, so `uo.initCode` IS populated on the undeployed path and the attribution suffix DOES mutate live deployment calldata; F063 is live, not moot.
- **refines:F055 (borrow):** projected post-action health/LTV is computed at three independent points across both providers and the assembler, and discarded at all of them — there is zero solvency gate spanning the borrow surface.
- **F270 (core-services):** `EnsNamespace` caches grow unbounded (TTL checked on read, never evicted) — a per-process memory-exhaustion vector on attacker-influenceable ENS/address inputs.

No new critical/high un-filed fund-loss path was found beyond the known clusters (F046/F047/F004 swap encoding, F070 verbatim-quote swap, F054 verbatim-quote borrow, F008 lend decimals, F237 smart-wallet address derivation). RPC-trust treated as out of scope per standing rules.

---

## Swap

### F262 — getMarket cross-provider fallback re-admits a blocklisted pair via a sibling provider
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/namespaces/BaseSwapNamespace.ts:131-142
- **Severity:** medium · **Class:** correctness
- **Status:** new (relates F098) · **Candidate issue:** #334 · **suggestRefactor:** yes
- **Detail:** `SwapProvider.getMarket` (core/SwapProvider.ts:176-185) runs `validateMarketAllowed(market.assets[0], market.assets[1], chainId)` before returning, throwing `MarketNotAllowedError` when the pair is blocklisted (or absent from a configured allowlist) on that provider. But `BaseSwapNamespace.getMarket` (131-137) iterates ALL providers in a `try/catch{continue}` loop and returns the FIRST success. If the operator blocklists USDC/WETH on the Uniswap provider while the Velodrome provider has no blocklist for that pair, `actions.swap.getMarket({poolId,chainId})` silently returns the Velodrome market for the very pair the operator intended to block. The per-provider blocklist is therefore not config-wide: a second provider with a looser policy re-admits the pair. The same catch-all also masks RPC/encoding failures (F098), but the concrete fund-safety consequence here is the cross-provider blocklist bypass. The returned `SwapMarket` can then be quoted/executed.
- **Exploit/repro:** Config: `uniswap.marketBlocklist=[USDC/WETH on chain X]`, velodrome with no blocklist for USDC/WETH. Call `actions.swap.getMarket({poolId: <USDC/WETH velodrome poolId>, chainId: X})` with no explicit provider. Uniswap.getMarket throws `MarketNotAllowedError`, the loop catches and continues, Velodrome.getMarket returns the market.
- **Recommendation:** In `getMarket`, distinguish `MarketNotAllowedError` (a deliberate policy rejection that should NOT fall through to another provider for the same pair) from genuine not-found/RPC errors, OR evaluate the config-wide blocklist once at the namespace level before consulting providers. At minimum, document that per-provider blocklists are not config-global.

### F263 — Price-routing best-quote comparator maximizes gross amountOutRaw and ignores gasEstimate
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/namespaces/BaseSwapNamespace.ts:220-242
- **Severity:** medium · **Class:** correctness
- **Status:** new (relates F114) · **Candidate issue:** #435 · **suggestRefactor:** yes
- **Detail:** `getBestQuote` (225-230) and the `getQuotes` sort (104-110) compare candidates purely by `quote.amountOutRaw` (gross expected output). Both `UniswapSwapProvider._getQuote` (UniswapSwapProvider.ts:184) and `VelodromeSwapProvider._getQuote` (VelodromeSwapProvider.ts:202) attach `gasEstimate` to every quote, and `SwapQuote.gasEstimate` is documented as "estimated gas cost as raw bigint". The routing layer never consults it. For small swaps or routes differing in hop count/pool type (CL/Slipstream vs v2), the route with marginally higher gross output but materially higher gas can be net-worse for the user, yet `routing:'price'` picks it and calls it best. The picked quote's calldata is pre-built and handed straight to `execute()`, so the user signs the net-worse route. Distinct from F114 (exact-output mis-objective): this is gas-not-factored on every direction.
- **Exploit/repro:** Provider A `amountOutRaw=1.000 WETH`, `gasEstimate` high (CL multi-step); provider B `amountOutRaw=0.999 WETH`, `gasEstimate` low. With `settings.routing='price'`, `getBestQuote` returns A even though B nets more after gas.
- **Recommendation:** Either factor `gasEstimate` into the comparator (compare `amountOutRaw` minus gas valued in the output asset), or document explicitly that `'price'` routing maximizes gross output and ignores gas. If a net comparison is out of scope, drop/mark-advisory `gasEstimate` so consumers do not assume routing already accounts for it.

### refines:F004 — resolveQuoteDefaults `amountIn ?? 1` placeholder is the whole-flow root of the native exact-out value bug
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/core/SwapProvider.ts:270-277; 453-471
- **Severity:** low · **Class:** correctness
- **Status:** refines:F004 · **Candidate issue:** none · **suggestRefactor:** yes
- **Detail:** `resolveQuoteDefaults` (275) computes `amountInRaw = parseAssetAmount(params.assetIn, params.amountIn ?? 1)`. For an exact-OUTPUT swap the caller passes `amountOut` and leaves `amountIn` undefined, so `amountInRaw` becomes exactly 1 token-unit (a placeholder, not a real input bound). `UniswapSwapProvider._getQuote` then sets `execution.value = isNativeAsset(assetIn) ? (amountInRaw ?? 0n) : 0n` (UniswapSwapProvider.ts:172) — the 1-unit placeholder for native-in exact-output — while the encoded SETTLE_ALL/amountInMaximum is the real maxAmountIn (encoding.ts:271-288). The currently-exploitable native-in instance is already captured by refines:F004 (ledger line 257). The point worth surfacing at the SwapProvider layer is that the `?? 1` default is the shared source: a silent fabricated amount flowing unchecked into `value` and into `amountInRaw` display fields for EVERY exact-output quote, not just native.
- **Exploit/repro:** Call `provider.execute` with native ETH `assetIn`, `amountOut` set, `amountIn` undefined. `resolveParams` -> `amountInRaw=1 wei`; `_getQuote` sets `execution.value=1 wei` while `amountInMaximum` encodes the real (large) max input. SETTLE_ALL underfunds, swap reverts.
- **Recommendation:** Do not default `amountIn` to 1 in `resolveQuoteDefaults` when the quote is exact-output; leave `amountInRaw` undefined and require each provider to derive `value`/approvals from the quoted `maxAmountIn`. Removes the placeholder at its source rather than patching each consumer.

### F264 — Pre-built quote execute re-resolves provider from quote.provider with no provider<->routerAddress consistency check
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/namespaces/WalletSwapNamespace.ts:75-82
- **Severity:** low · **Class:** malicious-sign
- **Status:** new (relates F070) · **Candidate issue:** #373 · **suggestRefactor:** yes
- **Detail:** On the pre-built quote path, `WalletSwapNamespace.execute` resolves the executing provider via `resolveProvider(params.provider, ...)` where `params.provider` is the quote's own `provider` field. The chosen provider runs `_buildApprovals(quote)`, which re-derives ITS router/Permit2 from `quote.chainId` (UniswapSwapProvider._buildApprovals:83-104; VelodromeSwapProvider._buildApprovals:212-215) and approves THAT spender, while `buildSwapTransactions` copies `quote.execution.routerAddress + swapCalldata` verbatim (SwapProvider.ts:411-415). Nothing asserts `quote.provider` is consistent with `quote.execution.routerAddress`. A quote with `provider='uniswap'` but `execution.routerAddress` = a Velodrome router routes the user's Permit2/token approval to the Uniswap universal router while the swap call targets the Velodrome router. `requireQuoteForThisWallet` only checks `recipient==wallet` (94), not the provider/router mismatch. Dominant outcome is a revert (allowance to the wrong spender), but the user still signs an approval to a router they never intended to authorize — a defense-in-depth hole on the same verbatim-trust path as F070, distinct in that the gap is provider<->routerAddress consistency, not router-allowlist absence.
- **Exploit/repro:** Construct a `SwapQuote` with `provider='uniswap'`, `chainId=X`, `execution.routerAddress = velodrome router`, `recipient=wallet.address`, valid `expiresAt`. `wallet.swap.execute(quote)`: Uniswap `_buildApprovals` approves Uniswap permit2/universalRouter; swap tx targets the velodrome router; user signs an approval to the wrong spender.
- **Recommendation:** In `executeFromQuote`/`requireQuoteForThisWallet`, assert `quote.execution.routerAddress` equals the address the resolved provider would derive for `quote.chainId` (`getUniswapAddresses(chainId).universalRouter` / `getChainConfig(chainId).contracts.router`), throwing if they disagree. This re-derive-and-compare also subsumes part of F070's router-allowlist concern for in-SDK providers.

---

## Lend

### refines:F008 — closePosition throws AssetMetadataRequiredError when asset omitted, making the documented marketId-driven fallback dead code
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/core/LendProvider.ts:209-218
- **Severity:** low · **Class:** correctness
- **Status:** refines:F008 · **Candidate issue:** #334 · **suggestRefactor:** yes
- **Detail:** `ClosePositionParams.asset` is typed optional and documented as "optional - will be validated against marketId" (types/lend/base.ts:294,313). `closePosition` reflects this on line 216 with `parseAssetAmount(params.asset ?? market.asset, ...)`. But lines 209-212 unconditionally throw `AssetMetadataRequiredError('decimal conversion')` whenever `params.asset?.metadata` is undefined — exactly the omitted-asset case. A caller relying on documented marketId-driven resolution gets a hard throw, and the `market.asset` branch of line 216 is unreachable. The throw is fail-closed (not fund-loss), but it makes a supported, safer call shape (no caller-supplied asset to mis-match) impossible, pushing every integrator to pass an asset object whose decimals are then trusted over the market's own (the very hazard F008/refines:F008 flag).
- **Exploit/repro:** `wallet.lend.closePosition({ amount, marketId })` with no `asset` for an allowlisted market: today throws `AssetMetadataRequiredError` instead of withdrawing using the market's underlying decimals.
- **Recommendation:** Drop the 209-212 guard and let the existing `params.asset ?? market.asset` fallback resolve decimals from the allowlisted market. If a guard is still wanted, assert on `(params.asset ?? market.asset).metadata` AFTER the fallback. Add a test for `closePosition` with asset omitted.

### refines:F011 — openPosition aborts signable calldata when the read-only APY fetch (getMarket / Aave public-RPC reserve read) fails
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts:70-83
- **Severity:** low · **Class:** correctness
- **Status:** refines:F011 · **Candidate issue:** #334 · **suggestRefactor:** yes
- **Detail:** Both providers call `this.getMarket(...)` inside `_openPosition` solely to populate the informational `apy` snapshot (AaveLendProvider.ts:70-73 used at 248/283; MorphoLendProvider.ts:59-62 used at 77). For Aave that resolves to `getReserve()`, which spins up a fresh ethers `JsonRpcProvider` against the chain's default/public RPC (sdk.ts:108-118, F014/F156) and calls `UiPoolDataProvider.getReservesHumanized` — a heavy, rate-limit-prone read entirely independent of the supply calldata. Any failure (public RPC down/throttled, UiPoolDataProvider revert, reserve-not-found) is caught by the broad try/catch (AaveLendProvider.ts:79-83 / MorphoLendProvider.ts:79-83) and rethrown as a generic "Failed to open position…", so the user cannot build or sign an otherwise-valid deposit. A purely cosmetic, float-able APY number is on the critical path of transaction construction; the deposit calldata needs none of it.
- **Exploit/repro:** Throttle/blackhole the chain's default public RPC (the one ethers picks in sdk.ts:110-112) while the integrator's configured ChainManager RPC stays healthy: `getReserve` throws, `openPosition` rethrows generic failure, and no deposit tx can be built.
- **Recommendation:** Make the APY snapshot best-effort: wrap the `getMarket` call in try/catch defaulting apy to 0/undefined (mirroring the rewards `.catch` fallback at morpho/sdk.ts:353-356), or move the APY fetch out of `_openPosition` entirely. Separately, narrow the `_openPosition` try/catch so `MarketNotAllowedError`/`ChainNotSupportedError` propagate (aligns with refines:F011).

---

## Borrow

### refines:F055 — Projected post-action health/LTV is computed by every provider but never gates signing on either Aave or Morpho
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/core/quote.ts:54
- **Severity:** medium · **Class:** correctness
- **Status:** refines:F055 · **Candidate issue:** none · **suggestRefactor:** yes
- **Detail:** Both providers compute the post-action position. Aave's `projectAavePositionState` (providers/aave/presentation.ts:126-150) computes `healthFactorWad`; Morpho's `computeOpen`/`computeClose` project an `AccrualPosition` whose health/ltv is fully known. `assembleBorrowQuote` (core/quote.ts:54) surfaces `safeCeilingLtv = maxLtv*(1-healthBufferPct)`. But NOTHING in `BorrowProvider.openPosition -> _openPosition -> finalizePlan/computeOpen -> assembleQuote -> WalletBorrowNamespace.dispatch` compares the projected LTV/health against `safeCeilingLtv` (or against 1.0) and refuses to return/dispatch a signable quote. A borrow that lands just inside LLTV yet below the SDK's own advertised `safeCeilingLtv` is signed and broadcast with no guard. This is the whole-flow generalization of F055/F018: the projected health is available at three independent points across two providers and the assembler and discarded at all of them — zero solvency gate spans the surface.
- **Exploit/repro:** Config a market with `healthBufferPct=0.2`. Quote open with collateral/borrow sized so projected LTV = LLTV*0.95 (above `safeCeilingLtv=LLTV*0.8` but below LLTV). Quote is returned and `wallet.borrow.openPosition` dispatches it; the wallet ends one small price move from liquidation despite the published safe ceiling.
- **Recommendation:** At the assembler or provider boundary, for open/borrow/withdrawCollateral, compare projected LTV (Aave: from `healthFactorWad`/threshold; Morpho: `AccrualPosition.ltv`) against `safeCeilingLtv` and throw a named error (`HealthBufferExceededError`). Keep it an opt-out (config flag) to avoid blocking advanced callers, mirroring approvalMode precedence.

### refines:F117 — Morpho maxLtv is also the liquidation LTV, so the "Aave disagrees with Morpho's maxLtv" framing overstates the divergence
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/providers/morpho/presentation.ts:40
- **Severity:** low · **Class:** correctness
- **Status:** refines:F117 · **Candidate issue:** none · **suggestRefactor:** no
- **Detail:** F117 frames Aave's `maxLtv` (from the liquidation-threshold bits at providers/aave/presentation.ts:176,224) as wrong because it disagrees with Morpho's `maxLtv`. But Morpho's `maxLtv` is `morphoWadToNumber(config.marketParams.lltv)` (presentation.ts:40,84) — and Morpho's `lltv` IS the single liquidation LTV (Morpho Blue has no separate borrow-LTV vs liquidation-LTV). Both providers actually surface the *liquidation* threshold as `maxLtv`; they are consistent in semantics, not divergent. The real defect F117 should center on: on Aave there genuinely exist two distinct values (borrow LTV in bits 0-15, liquidation threshold in bits 16-31, decoded in state.ts:39-44 then `ltvBps` discarded), and naming the liquidation threshold `maxLtv` overstates safe borrow capacity by ~2-3pp. The cross-provider "disagreement" claim is the weaker part of F117 and should be dropped; both ride the liquidation LTV.
- **Recommendation:** Keep F117's core (Aave `maxLtv` should use the borrow-LTV bits when it is meant to convey max *borrowable* LTV) but drop the "disagrees with Morpho" framing. Decide one consistent meaning for `maxLtv` across both providers and document it.

### refines:F054 — Pre-built borrow quote expiry is fully self-described; validateQuoteNotExpired trusts an attacker-settable expiresAt with no window sanity
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:218
- **Severity:** low · **Class:** correctness
- **Status:** refines:F054 · **Candidate issue:** none · **suggestRefactor:** no
- **Detail:** In `validateQuoteForThisWallet`, `validateQuoteNotExpired(quote.expiresAt)` (utils/validation.ts:87-92) only checks `now>=expiresAt`. `expiresAt` is a plain field on the caller-supplied `BorrowQuote`, not bound to or signed against the calldata, and there is no check that `quotedAt<=now`, that `expiresAt>quotedAt`, or that the window is within `quoteExpirationSeconds`. A relayed/cached quote can carry an arbitrarily far-future `expiresAt` and re-dispatch indefinitely. The `recipient==wallet.address` guard (211) keeps a quote built for a different wallet from routing funds away, so on its own this is not a fund-loss vector; impact compounds only with the F054 calldata-binding gap (a malicious calldata leg in an unexpired quote). This is the expiry slice of that whole-flow: the SDK's "quotes expire" guarantee is not enforceable on an externally-supplied quote.
- **Recommendation:** When validating a pre-built quote, additionally reject `quotedAt` in the future and reject `expiresAt-quotedAt` greater than the provider's max `quoteExpirationSeconds`, so a relayed quote cannot self-extend its validity window beyond SDK policy.

### refines:F015 — Morpho "max" close resolves to a fixed post-repay snapshot, not a live max; a stale close reverts where Aave's maxUint256 path would clear
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/providers/morpho/close.ts:36
- **Severity:** low · **Class:** correctness
- **Status:** refines:F015 · **Candidate issue:** none · **suggestRefactor:** no
- **Detail:** `computeClose` (close.ts:36-42) resolves a `{max:true}` collateral leg to `after.collateral` (a fixed bigint snapshot taken at quote time) and `encodeMorphoWithdrawCollateral` (blue.ts:116-131) sends that exact `assets` amount verbatim. There is no Morpho equivalent of Aave's `maxUint256` on-chain max sentinel (write.ts:115 `onChainAmount = isMax ? maxUint256 : amount`). If collateral changes between quote and execution (a concurrent partial liquidation or any collateral movement), a Morpho "max close" reverts on the over-withdraw, while the Aave "max close" path would still clear to the live balance. A cross-provider whole-flow asymmetry in "max" semantics that single-function passes (seeing each provider in isolation) would not surface; adjacent to refines:F015 close findings but specifically about the max-vs-snapshot divergence, not the missing `>0` guard.
- **Recommendation:** Either document that Morpho "max" collateral is a quote-time snapshot (and Aave "max" is a live-balance sentinel), or, if parity is intended, have the Morpho withdraw leg re-resolve max against live collateral the way Aave does.

### refines:F015 — Aave/Morpho "open" always appends a borrow leg even when borrowAmountWei is 0, producing a guaranteed-revert borrow(0) on a collateral-only open
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/providers/aave/quote.ts:109
- **Severity:** low · **Class:** correctness
- **Status:** refines:F015 · **Candidate issue:** #303 · **suggestRefactor:** no
- **Detail:** `buildAaveOpenQuoteArgs` (quote.ts:109-111) unconditionally pushes `encodeAaveBorrow(market, params.borrowAmountWei, user)` after the optional collateral deposit. Nothing upstream guarantees `borrowAmountWei>0` (F015 establishes amounts are never validated positive at internalParams.ts). A caller using "open" to deposit collateral with no borrow (`borrowAmount {amountRaw:0n}`) gets a bundle whose final leg is `Pool.borrow(asset,0,2,0,user)`, which Aave reverts. The Morpho open path has the same shape (open.ts:58-66 always appends `encodeMorphoBorrow`). The open-path manifestation of the missing positivity guard: a structurally-degenerate zero-borrow leg is always emitted, so a legitimate collateral-only open intent is impossible and produces a reverting bundle. `depositCollateral` is the intended path, but nothing routes a zero-borrow open to it or rejects it.
- **Recommendation:** In the open builders (Aave and Morpho), when `borrowAmountWei===0n`, omit the borrow leg (degenerate to a deposit-only bundle) or throw `InvalidParamsError` directing the caller to `depositCollateral`.

### F265 — getProviderForMarket kind-fallback can route a market to a provider whose allowlist does NOT contain it
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/namespaces/BaseBorrowNamespace.ts:111
- **Severity:** low · **Class:** info
- **Status:** new (relates F016) · **Candidate issue:** #334 · **suggestRefactor:** no
- **Detail:** `getProviderForMarket` (111-134) first tries allowlist membership, then falls back to ANY provider whose `marketKind` matches `marketId.kind`, even when that provider's allowlist does not contain the market. On read paths (getMarket/getPosition) the selected provider then calls `requireAllowlistedMarketConfig`, which DOES throw `MarketNotAllowedError`, so the fallback is harmless for reads. The fallback exists so a provider configured WITHOUT an allowlist still routes — but a no-allowlist Borrow provider config means `requireAllowlistedBorrowMarketConfig`'s empty-allowlist fail-closed branch (validations.ts:54-60) rejects everything, so such a provider can never service a write either. Net: a routing path that looks permissive but is always backstopped by the per-provider allowlist check. The concern is the two-tier routing (kind fallback in the namespace vs strict allowlist in the provider) is easy to misread as "kind alone authorizes a market". Info: no bypass today because every entry point re-checks the allowlist, but a latent footgun if a future provider hook forgets the re-check.
- **Recommendation:** Document at `getProviderForMarket` that the kind fallback is a routing convenience only and every provider entry point must independently re-assert allowlist membership; consider asserting in the fallback branch that the provider has a non-empty allowlist.

---

## Wallet-core

### F266 — WalletNamespace.resolveProvider caches a rejected init promise forever, permanently poisoning every subsequent wallet-provider call after one transient factory failure
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/namespace/WalletNamespace.ts:228-239
- **Severity:** low · **Class:** infra
- **Status:** new · **Candidate issue:** none · **suggestRefactor:** yes
- **Detail:** `resolveProvider` sets `this._initPromise = this._providerFactory().then(...)` once and never clears it. If the factory rejects (a transient failure during lazy provider construction, e.g. a network/config hiccup loading a hosted-wallet vendor SDK), the rejected promise stays cached, so EVERY later call to `createSmartWallet`/`getSmartWallet`/`createSigner`/`hostedWalletProvider`/`smartWalletProvider` re-returns the same rejected promise and can never re-initialize for the lifetime of the namespace. A whole-flow lifecycle inconsistency: the sibling init primitive `Wallet.initialize` (wallets/abstract/Wallet.ts:162-174) deliberately clears `this.initPromise = undefined` in the catch precisely so callers may retry. Two init paths in the same module disagree on retryability. Only `_provider` (set inside `.then`) is the success cache; the rejection branch leaves `_initPromise` populated and `_provider` null, so the `if (this._provider)` guard never short-circuits. Not reachable when a concrete provider instance is passed to the constructor (synchronous resolve).
- **Exploit/repro:** Construct `WalletNamespace` with a factory that throws on first call and succeeds after; call `await ns.smartWalletProvider()` (rejects), then call it again after the transient condition clears — it still rejects with the original error instead of re-running the factory.
- **Recommendation:** Mirror `Wallet.initialize`: attach a rejection handler that clears `this._initPromise` before rethrowing, e.g. `this._initPromise = this._providerFactory().then(p => { this._provider = p; return p }).catch(err => { this._initPromise = null; throw err })`. Add a test that rejects the factory once then succeeds on retry.

### F267 — Counterfactual smart wallet derives its reported address two independent ways (SDK factory read vs viem internal CREATE2) that are never asserted equal
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:196-207, 562-587
- **Severity:** medium · **Class:** correctness
- **Status:** new (relates F237) · **Candidate issue:** none · **suggestRefactor:** yes
- **Detail:** For a counterfactual (not-yet-deployed) wallet from `createWallet`, `deploymentAddress` is undefined. `performInitialization` sets `this._address` via `getAddress()` (573-587), which reads the FACTORY's `getAddress(this._signerBytes, nonce)` using the SDK's own `formatPublicKey`/`getSignerPublicKey` owner-bytes encoding. Every SDK consumer that reads `wallet.address` (sendTokens `to`, getBalance, addSigner/removeSigner targets, what an integrator funds) uses this factory-derived value. But `getCoinbaseSmartAccount` passes `address: this.deploymentAddress` (still undefined for counterfactual wallets), NOT `this._address`, so viem's `toCoinbaseSmartAccount` re-derives the UserOp sender INTERNALLY from owners using viem's own encoding. The actual UserOp therefore operates whatever address viem computes, while the SDK reports/funds whatever the factory returned. These two derivations must agree for every owner shape (Address vs LocalAccount vs WebAuthn, and ordering). If they ever diverge, an integrator funds `wallet.address` but the smart account operating on-chain is a different contract, stranding funds. Asserted nowhere (F237 names it as untested). Passing `this._address` into `getCoinbaseSmartAccount` would collapse the two derivations to one source of truth.
- **Exploit/repro:** No direct exploit; correctness hazard. A divergence between SDK `formatPublicKey` owner-bytes and viem's owner encoding (a future viem change, or a non-address owner type) makes the funded address and the operated address differ with no assertion to catch it.
- **Recommendation:** In `getCoinbaseSmartAccount` pass `address: this.deploymentAddress ?? this._address` so viem reuses the SDK-derived address. Independently add a fork/golden-vector test asserting factory `getAddress(...) === viem toCoinbaseSmartAccount(...).address` for a fixed owners+nonce (extends F237).

### refines:F059 — send/sendBatch call prepareUserOperation then discard every prepared field except callData/initCode, forcing a full silent re-preparation
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:223-250, 265-294
- **Severity:** low · **Class:** info
- **Status:** refines:F059 · **Candidate issue:** none · **suggestRefactor:** yes
- **Detail:** `prepareUserOperation` returns a fully prepared UserOp (gas limits, nonce, fees, paymaster data, signature). `sendUserOperation` is then invoked with only `{ account, callData: <suffixed>, initCode: <suffixed>, paymaster: true }` — it drops the prepared nonce, all gas fields, and fee fields. viem re-runs preparation internally inside `sendUserOperation`, so the explicit `prepareUserOperation` call is wasted work AND its computed gas/fees are not the ones actually used (the re-prepared values over the suffixed callData are). It self-corrects on gas, but means: (a) two preparation round-trips per send, (b) any sponsorship/paymaster context resolved in the first prepare is recomputed, (c) the suffix-append is the ONLY reason callData is passed explicitly. This is also the structural reason the v0.7 initCode suffix is silently dropped (F059): `uo.initCode` is undefined on EntryPoint v0.7 so the suffix branch is a no-op there.
- **Exploit/repro:** Inspect the args `sendUserOperation` receives in DefaultSmartWallet.spec.ts:178-185,251-257 — only account/callData/initCode/paymaster are passed; prepared gas/nonce/fee fields from the prepare mock are absent.
- **Recommendation:** Either pass the full prepared `uo` fields through to `sendUserOperation` (spread `...uo` then override callData/initCode), or drop the standalone `prepareUserOperation` and append the suffix via the account `encodeCalls` path. Add a test asserting `sendUserOperation` receives the prepared gas/nonce fields.

### refines:F021 — approval+position lend batch through executeTransactionBatch has wallet-type-dependent atomicity (atomic for smart, non-atomic residual-allowance for EOA) with no namespace guardrail
- **Surface:** wallet-core
- **File:** packages/sdk/src/actions/lend/namespaces/WalletLendNamespace.ts:89-98
- **Severity:** medium · **Class:** fund-loss
- **Status:** refines:F021 · **Candidate issue:** #335 · **suggestRefactor:** no
- **Detail:** `WalletLendNamespace.dispatch` builds `txs=[approval, position]` when an approval is present and hands them to `executeTransactionBatch`. For a smart wallet `sendBatch` is one atomic UserOp (approval and position revert together). For an EOA wallet `sendBatch` (EOAWallet.ts:90-100) sends them sequentially, each awaited, and keeps going after a mid-batch revert with no `receipt.status` check (F021): the approval can land while the position reverts, leaving a standing ERC-20 allowance to the lend contract the user never intended to persist. The same code path gives two materially different safety guarantees purely based on which wallet type the integrator wired, and nothing at the dispatch/executeTransactionBatch boundary surfaces or normalizes this. Swap and borrow share the identical primitive and inherit the same divergence. The root EOA bug is owned by F021; this records the integration-level reach: the residual-allowance hazard is live in production lend/swap/borrow flows whenever the wallet is an EOA/LocalWallet.
- **Exploit/repro:** Wire a `LocalWallet`, trigger a lend open whose provider returns approval+position; make the position revert on-chain (slippage/cap). The approval tx confirms first; `sendBatch` does not abort, returns receipts, and the allowance remains.
- **Recommendation:** Fix at the source (F021): `EOAWallet.sendBatch` must check each `receipt.status` and throw on the first reverted tx so downstream txs are never signed (matching smart-wallet atomic semantics). Until then, document at namespace dispatch that EOA batches are non-atomic and may leave residual approvals.

### refines:F212 — Smart-wallet send/sendBatch report a reverted-but-confirmed UserOp as success, and that receipt is propagated by borrow's dispatch into a "successful" BorrowReceipt
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:261-294, 232-247
- **Severity:** medium · **Class:** correctness
- **Status:** refines:F212 · **Candidate issue:** none · **suggestRefactor:** no
- **Detail:** `DefaultSmartWallet.send/sendBatch` return the `WaitForUserOperationReceiptReturnType` without ever checking `receipt.success` (only deploy/addSigner/removeSigner check it). `WalletBorrowNamespace.dispatch` (actions/borrow/namespaces/WalletBorrowNamespace.ts:232-247) awaits `executeTransactionBatch` and unconditionally builds a `BorrowReceipt` with `extractReceiptHashes(receipt)`, surfacing the userOpHash of a REVERTED UserOp as a completed borrow (with positionAfter/borrowAmount taken from the quote, not from chain). Lend and swap likewise return the raw union with no success gate. A confirmed-but-reverted ERC-4337 op (out-of-gas inner call, slippage revert) is reported to the integrator as a successful action across all three wallet-signing namespaces. F212 owns the single-function gap; this records that the silent-revert leaks all the way into the action-level success envelopes.
- **Exploit/repro:** Mock `waitForUserOperationReceipt` to return `{ success:false, userOpHash }` and drive a borrow dispatch; the returned `BorrowReceipt` contains the userOpHash and positionAfter as if the borrow succeeded.
- **Recommendation:** Add a `receipt.success` check in `DefaultSmartWallet.send/sendBatch` (throw `TransactionConfirmedButRevertedError` on false, matching addSigner/removeSigner) so every namespace inherits the guard. Alternatively gate in `executeTransactionBatch`, but the wallet is the correct layer since EOA send has the analogous F020 gap.

---

## Wallet-hosted

### refines:F074 — hosted createSigner exports an address-untrusted LocalAccount straight into the smart-wallet owner-index resolution
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/node/wallets/hosted/turnkey/utils/createSigner.ts:25-31
- **Severity:** medium · **Class:** malicious-sign
- **Status:** refines:F074 · **Candidate issue:** #163 · **suggestRefactor:** yes
- **Detail:** The hosted createSigner public path (`WalletNamespace.createSigner -> HostedWalletProvider.createSigner`) exists, per its own docstrings, to pass the signer into an Actions smart wallet as an owner. For Turnkey the returned `LocalAccount.address` is whatever `createAccount` resolves from a caller-supplied `ethereumAddress`/`signWith` (forwarded raw, no `getAddress`, F031); for node Privy createSigner the address is the caller-supplied value with no checksum/reconciliation (F028). That LocalAccount is then consumed by `DefaultSmartWallet`'s owner logic, which matches owners by EXACT `.address` via `findSignerInArray` (getAddress comparison) and computes the on-chain slot via `findSignerIndexOnChain`. No prior finding draws this cross-module link: a non-canonical or mismatched hosted `.address` does not fail at signer construction; it surfaces later as a wrong-slot `ownerIndex` (UserOp validation revert) or, worse, a smart wallet provisioned with an owner address the hosted backend cannot actually sign for. The address-trust gap (F028/F031/F074) and the index logic (F090/F107) were each reviewed in isolation; the integration is the live failure mode.
- **Exploit/repro:** Configure Turnkey hosted provider; call `actions.wallet.createSigner({ organizationId, signWith: <privateKeyId>, ethereumAddress: <lowercased-or-typo address> })`; pass the result as a smart-wallet owner. `findSignerInArray`/`findSignerIndexOnChain` resolve against the bad `.address` -> wrong ownerIndex or an unsignable owner slot; no error at construction.
- **Recommendation:** At the hosted-signer construction seam (Turnkey/Privy createSigner and wrapping wallets), normalize the resolved address with `getAddress` and, where a caller-supplied address is provided, reconcile it against the address the signer actually derives before returning the LocalAccount. Same F074 reconciliation seam, but applied specifically at `createSigner` (the smart-wallet-owner entrypoint), not only at `toActionsWallet`.

### F268 — Same provider, two address-handling contracts: node Privy toActionsWallet checksums params.address via getAddress, createSigner forwards it raw
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.ts:60-95
- **Severity:** low · **Class:** correctness
- **Status:** new (relates F028) · **Candidate issue:** none · **suggestRefactor:** yes
- **Detail:** Within one `PrivyHostedWalletProvider`, `toActionsWallet` (67) passes `getAddress(params.address)` but `createSigner` (90-94) spreads `{...params}` so `params.address` reaches `createViemAccount` unnormalized. A caller using the `createSigner` entrypoint can supply a malformed/lowercase address that `toActionsWallet` would have rejected or canonicalized. Beyond F028's "skips validation" framing, the real issue is a divergent contract for the same provider key on the two public methods, so behavior depends on which method the integrator happened to call. No shared normalization helper enforces parity.
- **Recommendation:** Route both methods through one helper that `getAddress`-normalizes (and ideally reconciles) the address, so `toActionsWallet` and `createSigner` cannot diverge.

### refines:F244 — Dynamic signer's two signing backends are each exercised by a different product flow (EOA send vs 4337 owner-signing), so a backend divergence is invisible until the smart-wallet path
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/react/wallets/hosted/dynamic/utils/createSigner.ts:24-37
- **Severity:** low · **Class:** correctness
- **Status:** refines:F244 · **Candidate issue:** #163 · **suggestRefactor:** yes
- **Detail:** `createSigner` wires `sign -> connector.signRawMessage` but `signMessage/signTransaction/signTypedData -> walletClient.*`. `EOAWallet.send/sendBatch` sign transactions via `walletClient.signTransaction`, so the `sign()` closure is dead on the EOA path. The `sign()` closure is only reached when this LocalAccount is used as a smart-wallet OWNER (4337 userOp hash signing routes through `account.sign({hash})`). Any divergence between the connector key and the walletClient account (different backend, different key, or `signRawMessage` applying an EIP-191 prefix to the 0x-stripped hash) cannot manifest in EOA flows and only breaks the smart-wallet flow, producing an invalid owner signature with no construction-time error. The cross-flow elaboration of F062/F030/F244: the two backends serve two product surfaces.
- **Recommendation:** Assert `walletClient.account.address` equals the connector's signing-account address at construction, and add a smart-wallet-owner integration test exercising `account.sign({hash})` end-to-end (recover signer == `.address`). Confirm `signRawMessage` signs the raw 32-byte digest without an EIP-191 prefix.

### refines:F033 — React Turnkey signing client never passes any validation choke point; validateOptions is unconditional true and the client arrives only per-call in toActionsWallet
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/react/providers/registry/ReactHostedWalletProviderRegistry.ts:22-71
- **Severity:** low · **Class:** info
- **Status:** refines:F033 · **Candidate issue:** none · **suggestRefactor:** no
- **Detail:** All three React `validateOptions` return true (F033/refines), and `ReactOptionsMap` entries are undefined, so registry construction validates nothing. For Turnkey the signing-critical handle (`client`) plus `organizationId`/`signWith`/`ethereumAddress` are supplied per call via `ReactToActionsOptionsMap['turnkey']` and reach `createAccount` with zero runtime checks anywhere (registry, provider, or wallet). Unlike node, where the registry at least checks `o?.client` truthiness, the React Turnkey path has no truthiness guard on `client` at all before it becomes the signing backend. There is no single point on the React signing path that asserts the client is present/usable before a signature is requested.
- **Recommendation:** Add a minimal runtime guard on the React Turnkey `toActionsWallet`/`createSigner` path (assert `client`, `organizationId`, `signWith` non-empty) so a missing client fails loudly at wallet construction rather than at first sign. Mirror the node registry's truthiness check.

### refines:F137 — React Turnkey carries the signing client inside per-call toActionsWallet options while node carries it at provider construction; different trust/lifecycle for the same provider
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/react/providers/hosted/types/index.ts:60-65
- **Severity:** low · **Class:** correctness
- **Status:** refines:F137 · **Candidate issue:** #330 · **suggestRefactor:** yes
- **Detail:** node `NodeOptionsMap['turnkey'] = { client }` (client fixed at provider construction, validated once by the registry), but React `TurnkeyHostedWalletToActionsWalletOptions = { client, organizationId, signWith, ethereumAddress }` (client supplied fresh on every `toActionsWallet`/`createSigner` call). Sharpening F137: this is not only a type-shape divergence, it is a lifecycle/trust divergence — in React the signing client can differ per call and is never pinned or validated by the provider, so two wallets created from the same provider can sign with two different Turnkey clients. There is no shared contract test asserting the provider's client identity is stable across calls.
- **Recommendation:** Decide one contract (client at construction, like node, OR per-call, like React) and align both environments, or document and test the per-call-client semantics explicitly. Add a shared contract test over the two `TurnkeyHostedWalletToActionsWalletOptions` shapes.

---

## Wallet-smart

### refines:F059 — F059 is factually inverted: Coinbase Smart Account uses EntryPoint v0.6, so uo.initCode IS present and the attribution suffix DOES mutate live deployment calldata
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:230-234, 276-279
- **Severity:** low · **Class:** info
- **Status:** refines:F059 (refutes premise; confirms F063 is live) · **Candidate issue:** none · **suggestRefactor:** no
- **Detail:** F059 states the attribution suffix targeting `uo.initCode` is a silent no-op because initCode is "absent on EntryPoint v0.7 (v1.1); deployment-op attribution silently dropped". Whole-flow tracing into viem 2.33's `toCoinbaseSmartAccount` (accounts/implementations/toCoinbaseSmartAccount.js:42-45) shows the account hardcodes `entryPoint = { address: entryPoint06Address, version: '0.6' }` REGARDLESS of the smart-account `version: '1.1'`. viem's `prepareUserOperation` (actions/bundler/prepareUserOperation.js:130-134) then, for `entryPoint.version === '0.6'`, returns `initCode: concat([factory, factoryData])` whenever the wallet is undeployed. F059 conflated the *account* version (1.1) with the *EntryPoint* version (0.6). Consequence: on the first (undeployed) UserOp, `appendAttributionSuffix(uo.initCode)` concatenates 16 bytes onto the real `factory||createAccount(owners,nonce)` initCode that the EntryPoint executes and the signature covers. The deployment-op attribution is NOT silently dropped; the suffix mutates the live factory call — exactly the risk F063 flags. This matters because a reader could dismiss F063 as theoretical based on F059's "silently dropped" framing, when the mutation is live on every first-send/deploy.
- **Exploit/repro:** Construct a `DefaultSmartWallet` with an `attributionSuffix` and an undeployed CREATE2 address, then call `send()`. `prepareUserOperation` returns a populated initCode (EntryPoint 0.6); `appendAttributionSuffix` appends 16 bytes; `sendUserOperation` re-prepares and signs the suffixed initCode. Decode the resulting initCode tail vs the factory createAccount selector to observe the trailing 16 bytes on the live deploy call.
- **Recommendation:** Correct F059's premise in the ledger (EntryPoint is v0.6, initCode present on undeployed path) and downgrade/close it as refuted; keep F063 as the live concern. Independently, add an EntryPoint-version-aware assertion that the suffixed initCode still ABI-decodes to the same `createAccount(owners,nonce)` args (trailing-bytes tolerance) before submission, so a future viem bump to v0.7 is caught rather than silently dropping deploy attribution.

### F269 — Discarded explicit prepareUserOperation causes a duplicate paymaster sponsorship request (two pm_sponsorUserOperation calls) per sponsored send
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:224-236, 268-281
- **Severity:** low · **Class:** info
- **Status:** new (sharpens F037) · **Candidate issue:** #456 · **suggestRefactor:** yes
- **Detail:** `send/sendBatch` call `bundlerClient.prepareUserOperation({ account, calls, paymaster: true })` and then forward ONLY `uo.callData` and `uo.initCode` into `sendUserOperation({ account, callData, initCode, paymaster: true })`. Per viem's `sendUserOperation` (actions/bundler/sendUserOperation.js:39-40), when `account` is present it internally re-invokes `prepareUserOperation` with the (now suffixed) parameters — running the entire preparation pipeline a SECOND time, including fee estimation, nonce fetch, gas estimation, AND paymaster sponsorship (`paymaster: true` re-triggers `pm_sponsorUserOperation` / Pimlico sponsorship). The first explicit prepare's sponsorship result is entirely discarded. A whole-flow cost spanning `DefaultSmartWallet` and `ChainManager.getPimlicoBundlerClient`: every user action makes two sponsorship calls where one would do. Beyond F037's latency/RPC waste: (a) sponsorship-policy counters / rate limits can be consumed at 2x, so a policy allowing N ops/period effectively halves; (b) if the paymaster is non-idempotent or charges per quote, the first (unused) sponsorship is pure burn. Not a fund-safety or signing defect — the signed op is internally self-consistent over the suffixed bytes — but a concrete operational hazard F037's generic framing misses.
- **Exploit/repro:** Spy on `bundlerClient.prepareUserOperation` in DefaultSmartWallet.spec; the production send path invokes it once explicitly and once again inside `sendUserOperation` (when not fully mocked away), and against a Pimlico bundler the `pm_sponsorUserOperation` RPC fires twice per send.
- **Recommendation:** Drop the explicit `prepareUserOperation` entirely and let `sendUserOperation` prepare once, passing calls + paymaster:true + the account directly; if the suffix must be injected, do it via viem's `prepareUserOperation` `callData`/middleware override path so a single prepare (and single sponsorship request) produces the suffixed, signed op. This also eliminates the F037 double-prepare. Add a test asserting exactly one sponsorship/prepare round-trip per send.

---

## Core-services

### F270 — EnsNamespace addressCache/nameCache/infoCache grow unbounded — TTL is checked on read but expired entries are never evicted
- **Surface:** core-services
- **File:** packages/sdk/src/services/nameservices/ens/EnsNamespace.ts:52-60,78-113,126-183
- **Severity:** low · **Class:** infra
- **Status:** new · **Candidate issue:** #453 · **suggestRefactor:** yes
- **Detail:** `EnsNamespace` holds three Map caches: `addressCache` (keyed by raw input string), `nameCache` (keyed by Address), `infoCache` (keyed by ENS name). On every `getAddress`/`getName`/`getInfo` call a new entry is inserted (82-85, 108-111, 181) with an `expiresAt`. Reads only SKIP an entry when `Date.now() >= expiresAt` (80, 97, 131); the stale entry is never deleted, and there is no size cap / LRU / clear(). grep confirms no `.delete`/`.clear`/evict in the file. The Actions instance (and thus the EnsNamespace) is long-lived for an integrator server process. getAddress/getName/getInfo inputs are commonly attacker-influenceable (an app resolving user-submitted recipient ENS names or arbitrary addresses), so a stream of distinct inputs accumulates one permanent map entry each, unbounded, for the process lifetime. A slow memory-exhaustion / DoS vector, distinct from the resolution-correctness ENS findings (F068, F096, F113, refines:F043, refines:F068).
- **Exploit/repro:** In a long-running Node server holding one Actions instance, loop calling `actions.ens.getAddress` on 10M distinct ENS names. `addressCache` retains all 10M entries indefinitely; RSS climbs without bound until OOM.
- **Recommendation:** Bound the caches: evict on read when expired (delete the stale key before re-fetching), add a max-size LRU eviction policy, or periodically prune. Simplest: delete the key inside each getter when the cached entry is found-but-expired, and cap each Map at a configurable max-entries count.

### F271 — ChainManager.getBundlerUrl JSDoc claims "returns undefined if not configured" but the body throws, making the downstream `if (!bundlerUrl)` guard in getBundlerClient dead code
- **Surface:** core-services
- **File:** packages/sdk/src/services/ChainManager.ts:140-155,109-115
- **Severity:** low · **Class:** correctness
- **Status:** new · **Candidate issue:** none · **suggestRefactor:** yes
- **Detail:** `getBundlerUrl` (146-155) throws `ChainNotSupportedError` when `chainConfig.bundler` is undefined and otherwise returns `chainConfig.bundler.url` (typed `url: string`, always defined). It can never return undefined/falsy, contradicting its own JSDoc on 142-144 ("returns Bundler URL as a string or undefined if not configured"). The non-pimlico path in `getBundlerClient` (109-115) calls `getBundlerUrl` then guards `if (!bundlerUrl) throw ChainNotSupportedError` — but that branch is unreachable because `getBundlerUrl` already threw (or returned a non-empty string). A cross-method consistency/maintainability defect: a future refactor that trusts the JSDoc (treating undefined as a soft "no bundler" signal) would mis-handle the actually-throwing contract. No fund impact, but a latent correctness trap on the userOp-bundler wiring path.
- **Recommendation:** Make the contract consistent. Either (a) change `getBundlerUrl` to return `string | undefined` (`return chainConfig.bundler?.url`) and let callers decide, keeping the JSDoc; or (b) keep the throw-on-missing behavior and fix the JSDoc to say it throws, then delete the dead `if (!bundlerUrl)` guard in `getBundlerClient`.

### dup:F259 — validateConfigAddresses skips the entire config.borrow surface
- **Surface:** core-services
- **File:** packages/sdk/src/utils/validateAddresses.ts:121-153
- **Severity:** medium · **Class:** correctness
- **Status:** dup:F259 (whole-flow confirmation, not re-filed) · **Candidate issue:** none
- **Detail:** Tracing SDK construction end-to-end: `Actions` constructor (actions.ts:86) calls `validateConfigAddresses(config)` as the only construction-time syntactic address validator. `validateConfigAddresses` (validateAddresses.ts:121-153) iterates `config.lend`, `config.swap`, and `config.assets`, but its param type and body never touch `config.borrow`. `AaveBorrowProvider`'s constructor (47-53) just calls `super()` with no address validation; only `MorphoBorrowProvider` performs a `verifyMorphoMarketId` check (not a tripwire when the developer derived the marketId from the same typo'd params), and Aave has no equivalent. Net: borrow market collateral/borrow asset address maps and Aave `aave.debtReserve`/`collateralReserve` (all signed-calldata targets / approval-token addresses) bypass the format validation lend/swap markets get. Independently reached and confirmed to match ledger F259 (pass 10); recorded as a sharpened confirmation, not re-filed.
- **Recommendation:** Extend `validateConfigAddresses` (or add a borrow-specific validator at the same actions.ts:86 site) to walk config.borrow providers and run getAddress/isAddress over Morpho marketParams (loanToken/collateralToken/oracle/irm) and Aave debtReserve/collateralReserve plus each market's collateralAsset/borrowAsset address maps.

### refines:F043 — resolveAddress returns a literal hex recipient with strict:false (no EIP-55 checksum) AND no zero-address check, whereas ENS-name resolution DOES reject the zero address
- **Surface:** core-services
- **File:** packages/sdk/src/services/nameservices/ens/utils.ts:43-47
- **Severity:** low · **Class:** malicious-sign
- **Status:** refines:F043 · **Candidate issue:** #371 · **suggestRefactor:** no
- **Detail:** `resolveAddress` (utils.ts:47) returns a hex input verbatim when `isAddress(input,{strict:false})` is true: no checksum normalization (already F043/refines:F043) and, distinctly, no zero-address guard. By contrast the ENS-name branch throws `EnsResolutionError` when the name resolves to the zero address (utils.ts:78-83). So `actions.ens.getAddress('0x0000...0000')` returns the zero address while an ENS name resolving to it throws. In the swap flow this literal-zero recipient is later caught by `validateRecipient` at SwapProvider.ts:450 (BaseSwapNamespace resolves then validates), so swap is defended; but `resolveAddress` is also exported as a public low-level utility (index.ts:89) for integrators who manage their own client and may not run `validateRecipient`, leaving a `recipient=0x0` path into their own signed calldata. A sharpening of the existing checksum finding to flag the additional zero-address asymmetry on the same public entrypoint.
- **Recommendation:** In `resolveAddress`, after the `isAddress` short-circuit, reject `isAddressEqual(input, zeroAddress)` the same way the ENS branch does, and consider returning `getAddress(input)` (checksummed) so the literal-hex and ENS-name branches have parity.
