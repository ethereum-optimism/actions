# Review Pass 02 — ethskills:security DeFi fund-safety seams

**Pass:** 2
**Skill:** ethskills:security (DeFi fund-safety lens)
**Surfaces:** swap, lend, borrow, wallet-core, wallet-hosted, wallet-smart, core-services
**Baseline:** deduped against ledger F001–F045 (+ refines:F008 umbrella)

## Summary

This pass re-walked every value-movement / signing seam in the SDK through the
ethskills:security fund-safety lens (decimals, slippage/min-out, infinite
approvals, Permit2/EIP-712 payloads, recipient handling, owner/onBehalfOf
binding, calldata integrity). It produced **24 net-new findings (F046–F069)**
and **16 refinements** that sharpen existing ledger rows, plus 4 duplicates of
already-recorded items.

**Counts by severity (net-new + refines, 40 rows):**

| Severity | New | Refines | Total |
|----------|-----|---------|-------|
| high     | 4   | 4       | 8     |
| medium   | 8   | 5       | 13    |
| low      | 12  | 7       | 19    |

**Counts by class (net-new):** fund-loss 4 · malicious-sign 2 · correctness 14 · info 4

**Notable highlights:**

- **Uniswap V4 swap calldata ignores `recipient` entirely** (F046, high fund-loss): `TAKE_ALL` always credits msg.sender; there is no `TAKE` (0x0e) action. Output never reaches a caller-specified recipient despite quote/validation/cross-wallet-guard all claiming it does. This is the Uniswap analogue of the Velodrome-only F003.
- **Velodrome universal-router has no native-ETH branch** (F047, high fund-loss): always WETH `transferFrom` with `payerIsUser=true`, yet the quote sets `msg.value=amountIn` for native input, so ETH-in universal swaps misencode and can strand value.
- **Pre-built BorrowQuote dispatch validates only metadata, never the raw `execution.transactions` calldata bytes** (F054, high malicious-sign): a tampered quote with benign-looking recipient/marketId/action/expiry but malicious `to`/`data`/`value` passes every guard and is signed. The borrow analogue of the swap calldata-integrity gap (#373).
- **Retrieved smart wallets sign with `ownerIndex` derived from the caller-supplied signers order, not the on-chain owner order** (refines:F023, high correctness): non-owner-0 signers produce wrong-slot signatures and reverting/stuck UserOperations.
- **Node Privy caller-supplied address used as deposit owner / smart-wallet owner, never reconciled with the signing walletId** (refines:F029, high fund-loss): the claimed address becomes the lend onBehalfOf / position owner and the smart-wallet owner, a concrete fund-misdirection / brick vector.
- **send/sendBatch re-submit suffixed callData but drop every prepared gas/fee field** (refines:F037, high correctness): the attribution suffix changes callData length, so gas is re-estimated against different bytes than the explicit prepare reasoned about.

---

## Swap surface

### F046 — Uniswap V4 swap calldata ignores recipient entirely; output always goes to msg.sender
- **Surface:** swap · **Severity:** high · **Class:** fund-loss · **Dedup:** new (relates F003)
- **File:** `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:224-294`
- **Detail:** `encodeUniversalRouterSwap` destructures `recipient` (line 224 via EncodeSwapParams) but never uses it. The V4 action sequence is `[SWAP, SETTLE_ALL, TAKE_ALL]`. `TAKE_ALL` (0x0f) is encoded with `CURRENCY_AMOUNT_PARAMS = [tokenOut, minAmountOut]` (lines 268, 289-292) — its first param is a currency, NOT a recipient; per the V4 router spec `TAKE_ALL` always credits the router's caller (msg.sender). There is no `TAKE` (0x0e) action (which carries an explicit recipient) anywhere in the encoding. Result: a Uniswap swap ALWAYS sends output to the executing wallet regardless of the `recipient` passed. SwapQuote (base.ts:251-256) documents `recipient` as "baked into execution.swapCalldata at quote time" and `_getQuote` plumbs it into the quote, `validateRecipient`, and `WalletSwapNamespace.requireQuoteForThisWallet` — all a false promise for Uniswap. This is the Uniswap-provider analogue of F003 (Velodrome universal/CL only), currently unreported for Uniswap.
- **Exploit/repro:** Call `actions.swap.execute` on a Uniswap market with `recipient` set to an address other than the executing wallet; the encoded Universal Router calldata never contains the recipient, and on-chain output is credited to msg.sender.
- **Recommendation:** Either (a) honor the recipient by replacing `TAKE_ALL` with the `TAKE` action (0x0e) encoding `(currency, recipient, minAmount)`, or (b) if only msg.sender delivery is supported, reject any `recipient` that is not the executing wallet at quote/execute time (mirror Velodrome's documented limitation). Update the `SwapQuote.recipient` doc to match actual behavior.
- **suggestRefactor:** true · **Candidate issue:** #444

### F047 — Velodrome universal-router path has no native-ETH handling but quote sets msg.value=amountIn
- **Surface:** swap · **Severity:** high · **Class:** fund-loss · **Dedup:** new (relates F003)
- **File:** `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/v2.ts:214-237`
- **Detail:** `encodeUniversalV2Swap` (universal-router path, used on Base Sepolia per addresses.ts) unconditionally encodes `payerIsUser=true` and a WETH-based route (resolveTokens converts native ETH to WETH), so the router pulls WETH via `transferFrom`. It has no WRAP_ETH command and no native-vs-ERC20 branch, unlike the v2/leaf `encodeRouterSwap` which selects `swapExactETHForTokens`. Meanwhile `VelodromeSwapProvider._getQuote` sets `execution.value = isNativeAsset(assetIn) ? amountInRaw : 0n` (VelodromeSwapProvider.ts:194) for ALL router types including universal. For native-ETH input on the universal router, the wallet sends `amountIn` ETH as msg.value while the calldata attempts `transferFrom(WETH)` against an allowance the user does not have — the swap reverts at best, and the attached ETH is at risk of being stranded in the router. `_buildApprovals` also early-returns no approval for native input (line 208), so there is no WETH allowance path either.
- **Exploit/repro:** Configure a native-ETH market on a universal-router Velodrome chain (Base Sepolia) and execute an ETH->token swap; encoded command is V2_SWAP_EXACT_IN with payerIsUser=true (WETH transferFrom) while msg.value carries ETH — mismatch.
- **Recommendation:** On the universal-router path, either reject native-ETH input explicitly (throw, as Velodrome exact-output does) or add a WRAP_ETH command + correct payer handling and only then set msg.value. At minimum gate `execution.value = native ? amountIn : 0n` on router types that actually consume native value.
- **suggestRefactor:** false · **Candidate issue:** none

### F048 — Exact-output swaps surface a meaningless amountOutMin but never expose the enforced amountInMaximum
- **Surface:** swap · **Severity:** medium · **Class:** correctness · **Dedup:** new (relates F005)
- **File:** `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:270-294`
- **Detail:** For exact-output swaps the protective bound is the MAX INPUT (`amountInMaximum` = `quote.amountInRaw + slippage`, encoding.ts:271-273). That `maxAmountIn` is baked into calldata but never returned on SwapQuote: the type (base.ts:198-219) has only `amountOutMin`/`amountOutMinRaw`, no `amountInMax`. `UniswapSwapProvider._getQuote` (lines 149-164) still calls `computeSlippageBounds(quote.amountOutRaw,...)` and reports `amountOutMin` even for exact-output — a bound on a FIXED output, meaningless. A frontend/agent shows a "minimum received" that does not govern the trade, while the real worst-case (how much input can be pulled up to maxAmountIn) is invisible. A user can be debited materially more input than the displayed `amountIn` (which reports the un-slipped `quote.amountInRaw`, line 160) without any surfaced max.
- **Exploit/repro:** Request a Uniswap exact-output quote; `SwapQuote.amountOutMinRaw` equals `amountOutRaw - slippage` on a fixed output (nonsensical), and no field reflects the amountInMaximum the router may pull.
- **Recommendation:** Add `amountInMax`/`amountInMaxRaw` to SwapQuote and populate from the same `maxAmountIn` used in encoding; skip/omit `amountOutMin` for exact-output (or set it to the fixed output).
- **suggestRefactor:** true · **Candidate issue:** #318

### F049 — All Velodrome/Aerodrome quotes report priceImpact = 0, disabling price-impact warnings
- **Surface:** swap · **Severity:** medium · **Class:** correctness · **Dedup:** new
- **File:** `packages/sdk/src/actions/swap/providers/velodrome/encoding/helpers.ts:60-83`
- **Detail:** `buildSwapPrice` hardcodes `priceImpact: 0` (helpers.ts:80) and every Velodrome path (v2 getQuote routers/v2.ts:65, CL getCLQuote routers/cl.ts:95) returns through it, so `SwapQuote.priceImpact` is always 0 for Velodrome. Uniswap computes a real priceImpact from the pool mid-price; Velodrome does not. A frontend/agent gating execution on `priceImpact` (a standard sandwich/illiquid-pool safety check) gets a false "no impact" signal for every Velodrome swap, so a user can be routed into a thin pool and settle far worse than mid-price with zero warning. Sibling gap: the same field is meaningfully populated for one provider and silently zeroed for the other.
- **Exploit/repro:** Quote any Velodrome pair; `SwapQuote.priceImpact` is 0 regardless of trade size relative to pool depth.
- **Recommendation:** Compute a real price impact for Velodrome (v2: reserves-based mid-price vs executed; CL: sqrtPrice like the Uniswap path) or mark priceImpact unknown/undefined so consumers don't treat 0 as "safe". Document the divergence until fixed.
- **suggestRefactor:** true · **Candidate issue:** none

### F050 — Permit2 sub-approval expiration is independent of the swap deadline and not re-checked
- **Surface:** swap · **Severity:** medium · **Class:** correctness · **Dedup:** new (relates F002)
- **File:** `packages/sdk/src/actions/swap/core/SwapProvider.ts:333-392`
- **Detail:** `buildPermit2Approvals` only rebuilds the inner Permit2 approval when `permit2Allowance.amount < requiredAmount || permit2Expired` (lines 375-389). When an existing (token,spender) allowance is non-expired AND covers requiredAmount (common after a prior `max` approval granting maxUint160 for 30 days), NO new approval is built and the existing on-chain allowance/expiration is reused. The Permit2 expiration (`permit2ExpirationSeconds`, default 30 days) is set independently of the swap `deadline` and never reconciled — a standing spend authorization on the Universal Router for up to 30 days. Combined with the owner read as `quote.recipient` rather than the executing wallet (F002), the allowance check can target the wrong owner entirely. The approve payload (token, spender, amount, expiration) is built from `Math.floor(Date.now()/1000) + permit2ExpirationSeconds` (approve.ts:115-117) with no upper bound and no tie to the trade's own deadline.
- **Exploit/repro:** With approvalMode 'max', execute one swap (grants maxUint160 to Universal Router for 30 days), then inspect Permit2.allowance — the router retains spend authority long after the swap deadline; subsequent swaps skip re-approval entirely.
- **Recommendation:** Bound the Permit2 inner-approval expiration to at most the swap deadline (or a small multiple), and ensure the allowance owner is the executing wallet (see F002). Surface the granted expiration in the returned approval.
- **suggestRefactor:** false · **Candidate issue:** #436

### F051 — V4 amountIn/amountOut/min/max encoded into uint128 params with no bound check
- **Surface:** swap · **Severity:** low · **Class:** correctness · **Dedup:** new
- **File:** `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:257-293`
- **Detail:** EXACT_INPUT_SINGLE_PARAMS/EXACT_OUTPUT_SINGLE_PARAMS type `amountIn`, `amountOutMinimum`, `amountOut`, `amountInMaximum` as uint128 (abis.ts:90-91, 108-109), and QUOTER exactAmount is uint128 (abis.ts:28,49). The encoder passes `amountInRaw`, `minAmountOut`, `quote.amountOutRaw`, `maxAmountIn` (all bigint) into encodeAbiParameters with no `<= maxUint128` guard. For an 18-decimal token a raw amount above ~3.4e20 tokens exceeds 2^128; viem will throw on overflow in recent versions, but if encoding ever succeeds with a wrapped value the min-out/max-in bound would be corrupted. Even the throw path is an unvalidated opaque failure rather than a clear "amount exceeds uint128" error. Sibling Velodrome paths use uint256.
- **Exploit/repro:** Construct a swap whose raw amount exceeds 2^128; the uint128-typed param has no pre-check before abi encoding.
- **Recommendation:** Validate amountIn/amountOut and derived min/max are `<= maxUint128` before encoding the V4 params, throwing a clear domain error.
- **suggestRefactor:** false · **Candidate issue:** none

### F052 — requireQuoteForThisWallet recipient guard is a no-op for Uniswap quotes
- **Surface:** swap · **Severity:** low · **Class:** correctness · **Dedup:** new (relates F003)
- **File:** `packages/sdk/src/actions/swap/namespaces/WalletSwapNamespace.ts:93-101`
- **Detail:** `requireQuoteForThisWallet` enforces `quote.recipient === wallet.address` before executing a pre-built quote, with a comment that swapping recipients "would route output tokens to the wrong address on routers that encode the recipient directly into calldata (e.g. Velodrome v2/leaf)". For Uniswap V4 the recipient is NOT in calldata (F046) — output always goes to msg.sender — so this guard neither protects nor reflects actual Uniswap behavior: a Uniswap quote could carry any recipient and the on-chain effect is identical. The guard gives a false sense that the recipient field is authoritative across providers when its enforceability is provider-specific.
- **Exploit/repro:** Build a Uniswap quote with recipient == wallet, pass to execute on the same wallet — passes guard, but the recipient field had no effect on delivery either way.
- **Recommendation:** Once Uniswap recipient handling is fixed (F046), this guard becomes meaningful uniformly. Until then, document that Uniswap delivers to msg.sender irrespective of quote.recipient.
- **suggestRefactor:** false · **Candidate issue:** #437

### (refines:F005) — computeSlippageBounds rounds slippage to whole basis points
- **Surface:** swap · **Severity:** low · **Class:** correctness · **Dedup:** refines:F005
- **File:** `packages/sdk/src/actions/swap/core/SwapProvider.ts:286-298`
- **Detail:** `computeSlippageBounds` converts slippage to integer bps via `BigInt(Math.round(slippage * 10000))`. Any slippage below 0.00005 (0.5 bp) rounds to 0 bps, producing `amountOutMinRaw == amountOutRaw` — a zero-slippage min-out the pool will rarely satisfy (revert), or inversely 0.000049 silently becomes no protection. This whole-bp rounding is computed independently from the encoder's own `Math.round((1 - slippage) * 10000)` (encoding.ts:252) and `quote.amountInRaw * Math.round(slippage*10000)` (encoding.ts:273), so the displayed `amountOutMin` and the calldata-enforced min can diverge by a rounding step. Sharpens F005: the displayed worst-case is not guaranteed to equal the enforced worst-case, here via sub-bp rounding-to-zero.
- **Exploit/repro:** Pass slippage = 0.00004 to a Uniswap swap; slippageBps rounds to 0 and amountOutMinRaw equals amountOutRaw, removing slippage protection while the UI may show a small tolerance.
- **Recommendation:** Compute the slippage bound once at higher precision (scale by 1e6) and reuse the exact same raw min/max in both display and calldata. Reject or document slippage finer than the chosen bps granularity.
- **suggestRefactor:** true · **Candidate issue:** #318

---

## Lend surface

### F053 — approvalMode='max' grants the Aave Pool / Morpho vault an unbounded maxUint256 ERC-20 allowance directly (not via Permit2)
- **Surface:** lend · **Severity:** low · **Class:** fund-loss · **Dedup:** new (relates F042)
- **File:** `packages/sdk/src/utils/approve.ts:85-90`
- **Detail:** For lend deposits the base `buildLendApproval` calls `resolveErc20ApprovalAmount(approvalMode, amountWei)`, which returns maxUint256 when mode='max' (approve.ts:89), and the spender is the protocol pool/vault itself (AaveLendProvider.ts:276 spender=poolAddress; MorphoLendProvider.ts:70 spender=vault). Unlike the swap path where 'max' approves Permit2 (immutable, ownerless, audited), here 'max' hands an unbounded standing allowance straight to the lending Pool / MetaMorpho vault. If that pool/vault is ever compromised (proxy/governance/curator risk — Morpho vaults are curator-upgradable), every user who chose 'max' has their full token balance drainable. The security skill explicitly flags infinite approvals to non-Permit2 spenders. Opt-in, hence low, but a distinct lend-path exposure from the swap/Permit2 model.
- **Exploit/repro:** With lend approvalMode 'max', the deposit grants approve(pool/vault, maxUint256); a later pool/vault compromise drains the full token balance.
- **Recommendation:** Document that lend 'max' approves the protocol contract directly (different trust model than swap's Permit2 max); consider defaulting lend to 'exact' regardless of global approvalMode, or routing lend approvals through a revocable/bounded path. At minimum note the spender on `resolveErc20ApprovalAmount`.
- **suggestRefactor:** false · **Candidate issue:** #133

### (refines:F008) — openPosition never validates caller asset against the market's resolved underlying
- **Surface:** lend · **Severity:** high · **Class:** fund-loss · **Dedup:** refines:F008
- **File:** `packages/sdk/src/actions/lend/core/LendProvider.ts:84-118`
- **Detail:** `closePosition()` calls `validateMarketAsset(market, params.asset)` (LendProvider.ts:206); `openPosition()` (84-118) performs no equivalent check. Both providers fetch the true market asset yet neither compares it against `params.asset`. Concrete misdirection: (1) Morpho — `_openPosition` returns `assetAddress=getAssetAddress(params.asset)` and `spender=vault`, so base `buildLendApproval()` approves the WRONG token (e.g. USDC) to the vault while `MetaMorphoAction.deposit` pulls the vault's real underlying; deposit reverts or misleads. (2) Aave — the native-vs-ERC-20 branch (AaveLendProvider.ts:75) is chosen purely from `isNativeAsset(params.asset)`, ignoring `marketInfo.asset`, so native ETH against a USDC marketId builds `depositETH()` to the WETHGateway crediting aWETH while metadata claims USDC. This sharpens F008 with the explicit close-validates / open-does-not asymmetry and the Aave native-branch routing.
- **Exploit/repro:** `wallet.lend.openPosition({ asset: USDC, amount: 100, marketId: <WETH-aave-market> })` supplies USDC into a market metadata reports as WETH; with `asset: nativeETH` against a USDC marketId it builds depositETH to the WETHGateway.
- **Recommendation:** In `LendProvider.openPosition`, after resolving the market (or inside each provider's `_openPosition` once marketInfo/vaultInfo is fetched), call `validateMarketAsset(market, params.asset)` before building approval/deposit calldata — as closePosition already does.
- **suggestRefactor:** true · **Candidate issue:** #334

### (refines:F008) — openPosition deposit amount is scaled by the caller's asset decimals, not the market underlying decimals
- **Surface:** lend · **Severity:** medium · **Class:** correctness · **Dedup:** refines:F008
- **File:** `packages/sdk/src/actions/lend/core/LendProvider.ts:90`
- **Detail:** `amountWei = parseAssetAmount(params.asset, params.amount)` derives wei from `params.asset.metadata.decimals`. Because open never reconciles `params.asset` with the market underlying, a caller passing an asset whose decimals differ from the market underlying gets a mis-scaled amount (e.g. 6-decimal metadata against 18-decimal WETH yields `amount*1e6`), then both the deposit calldata and the ERC-20 approval (resolveErc20ApprovalAmount, line 289) use the mis-scaled value. This is the decimal-magnitude angle the F008 "wrong-token" framing understates: even the magnitude is wrong by 10^(decimalsA-decimalsB). closePosition parses with `params.asset ?? market.asset` and validates first; open does not.
- **Exploit/repro:** openPosition with an asset metadata whose decimals != market underlying produces amountWei off by a power of ten; the approve()/supply() amounts are wrong.
- **Recommendation:** Parse amount using the market underlying's decimals (resolve the market before parseAssetAmount, or validate asset==market underlying first). Mirror closePosition's order: validate then parse.
- **suggestRefactor:** true · **Candidate issue:** #334

### (refines:F011) — _openPosition / _closePosition catch{} swallow precise errors and re-throw a generic message
- **Surface:** lend · **Severity:** medium · **Class:** correctness · **Dedup:** refines:F011
- **File:** `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts:56-84`
- **Detail:** `AaveLendProvider._openPosition` wraps the body in `try { ... } catch { throw new Error('Failed to open position...') }` (59-83), `_closePosition` the same (95-119), Morpho mirrors at MorphoLendProvider.ts:79-83 and 129-131. This flattens named `ChainNotSupportedError`, `getAssetAddress` `NativeAssetAddressError`/`AssetNotSupportedOnChainError`, and any future asset/market-mismatch validation into an opaque string. In a fund-safety context the integrator/UI can no longer distinguish "market not allowed" / "asset mismatch" from a transient RPC failure, so it cannot block signing on a genuine validation failure vs retry a blip. If validateMarketAsset is added inside `_openPosition` (above) its precise reason is discarded. Extends F011 to the Morpho provider and bumps to medium given the validation-masking interaction.
- **Recommendation:** Remove the catch-all or re-throw preserving the original error; never swallow validation/allowlist errors with a generic message an integrator might treat as retryable.
- **suggestRefactor:** true · **Candidate issue:** #474

### (refines:F013) — Morpho closePosition cannot fully exit: assets-denominated withdraw with no full-balance/maxUint256 path
- **Surface:** lend · **Severity:** medium · **Class:** fund-loss · **Dedup:** refines:F013
- **File:** `packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts:107-114`
- **Detail:** `_closePosition` builds `MetaMorphoAction.withdraw(assets, receiver, owner)` where `assets = params.amount` (wei). To close completely the user must pass the exact current underlying balance, which drifts every block as interest accrues. If they pass a last-read balance, the withdraw either reverts (requested assets exceed redeemable shares after rounding) or strands dust. ERC-4626 exposes `redeem(shares)` / `withdraw(maxWithdraw)` for a clean full exit; the SDK exposes neither. Aave has the same shape but `Pool.withdraw` accepts `type(uint256).max` as a "withdraw all" sentinel — the SDK passes `params.amount` there too (AaveLendProvider.ts:319,364) and also cannot express "withdraw max". Sharpens F013 with the Aave parallel and severity bump.
- **Recommendation:** Add a full-exit path: accept an explicit 'max'/'all' amount (as the borrow sibling does via AmountOrMax) and translate it to `redeem(balanceOf shares)` for Morpho and `type(uint256).max` for Aave Pool.withdraw / WETHGateway.withdrawETH.
- **suggestRefactor:** true · **Candidate issue:** #209

### (refines:F013) — Aave native close approves only params.amount of aWETH to the WETHGateway; accrued interest left behind
- **Surface:** lend · **Severity:** low · **Class:** correctness · **Dedup:** refines:F013
- **File:** `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts:291-342`
- **Detail:** `_closeETHPosition` approves aWETH to the gateway for exactly `params.amount` (330-334) and calls `withdrawETH(pool, params.amount, to)`. aWETH rebases upward as interest accrues, so the true redeemable balance >= the amount computed at call time. Approving/withdrawing exactly `params.amount` leaves accrued interest behind, and there is no max/all path. Combined with the assets-denominated model, a clean "close everything" is impossible on the native path too. Low (funds remain in the user's position) but a settle-worse-than-displayed correctness gap; extends F013 to the Aave native path.
- **Recommendation:** Support a max/all close that approves and withdraws `type(uint256).max` via the gateway/Pool so accrued interest is included, mirroring the borrow sibling's AmountOrMax handling.
- **suggestRefactor:** true · **Candidate issue:** #209

### (dup:F010) — marketBlocklist accepted as config but never enforced on any lend path
- **Surface:** lend · **Severity:** medium · **Class:** correctness · **Dedup:** dup:F010
- **File:** `packages/sdk/src/actions/lend/core/LendProvider.ts:234-257`
- **Note:** Duplicate of F010 (config field declared/validated but referenced nowhere in actions/lend; `validateMarketAllowed` only consults marketAllowlist). Re-confirmed via repo-wide search this pass. No new row.

### (dup:F009) — No positive/non-zero/finite amount validation on lend open or close
- **Surface:** lend · **Severity:** medium · **Class:** correctness · **Dedup:** dup:F009
- **File:** `packages/sdk/src/actions/lend/core/LendProvider.ts:84-118`
- **Note:** Duplicate of F009 (open line 90 / close 215-218 feed params.amount straight into parseAssetAmount with no `<=0`/finiteness guard; swap sibling uses validateAmountPositiveIfExists). No new row.

---

## Borrow surface

### F054 — Pre-built BorrowQuote dispatch validates only metadata, never the raw execution.transactions calldata bytes
- **Surface:** borrow · **Severity:** high · **Class:** malicious-sign · **Dedup:** new
- **File:** `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:207-247`
- **Detail:** `validateQuoteForThisWallet` checks `quote.recipient==wallet`, action, expiry, chain, and that `quote.marketId` is in some provider allowlist. It then `dispatch()`es `quote.execution.transactions` verbatim through `executeTransactionBatch` (233-237). The actual signed bytes — each leg's `to`, `data`, `value` — are never decoded or cross-checked against the validated metadata. `quote.recipient` is standalone metadata, not derived from calldata, so a quote whose recipient/marketId/action/expiry all look correct but whose `execution.transactions` encode something else (to = attacker contract, data = an ERC-20 approve/transfer to an attacker, an onBehalfOf/receiver other than the wallet, or an oversized amount) passes every guard and is signed. This is the borrow analog of the swap-side calldata-integrity gap tracked in #373; borrow has the identical hole with no tracking issue.
- **Exploit/repro:** Construct a BorrowQuote with recipient=victimWallet, a real allowlisted marketId, action='repay', a future expiresAt, but `execution.transactions=[{to: attackerToken, data: encodeFunctionData(erc20Abi,'approve',[attacker, maxUint256]), value: 0n}]`. Hand it to victim's `wallet.borrow.repay(quote)` — all five checks pass and the wallet signs the malicious approve.
- **Recommendation:** On the pre-built-quote path do not trust execution.transactions. Either (a) re-derive the calldata from validated (marketId, action, amounts, wallet) by re-running the provider builder and compare/replace, or (b) decode each leg with decodeFunctionData against the known Aave Pool / WETHGateway / Morpho Blue ABIs and assert `to`==expected contract for that marketId+chain, the onBehalfOf/receiver/to argument==quote.recipient, and the amount matches borrowAmountRaw/collateralAmountRaw. Mirror whatever lands for swap (#373).
- **suggestRefactor:** true · **Candidate issue:** none

### F055 — safeCeilingLtv is computed and surfaced as a safety value but never enforced on borrow/open/withdraw quotes
- **Surface:** borrow · **Severity:** medium · **Class:** correctness · **Dedup:** new (relates F018)
- **File:** `packages/sdk/src/actions/borrow/core/quote.ts:54`
- **Detail:** `assembleBorrowQuote` sets `safeCeilingLtv = positionAfter.maxLtv * (1 - healthBufferPct)` and returns it on every quote, presenting a conservative ceiling below liquidation LTV. But no borrow path (open, increase borrow, withdrawCollateral) compares the projected `positionAfter` LTV/health against `safeCeilingLtv` or even `maxLtv` before assembling the quote. The `healthBufferPct` buffer the SDK advertises is purely cosmetic: a user can be quoted (and sign) an action landing the position exactly at the on-chain liquidation edge with no SDK-side warning, while the quote reports a "safe" ceiling well below. The hard maxLtv is enforced on-chain (tx reverts past it), so not an unbounded drain, but the gap between displayed safety margin and the signed position is a settle-worse-than-displayed issue. Distinct from F018 (which is the negative-value misconfig of the same field).
- **Exploit/repro:** Open a position borrowing right up to maxLtv: returned `quote.safeCeilingLtv` reports e.g. 0.80 while positionAfter is at ~0.86 LTV; the wallet signs and the position is immediately liquidatable.
- **Recommendation:** Either enforce the buffer (reject/warn when projected LTV exceeds safeCeilingLtv on borrow-increasing/collateral-decreasing actions) or document explicitly that safeCeilingLtv is advisory display-only. If enforced, make it consistent across Aave and Morpho via the shared core.
- **suggestRefactor:** true · **Candidate issue:** none

### F056 — Aave native-ETH max collateral withdraw can under-approve as aTokens accrue (undocumented sibling of the documented repay tradeoff)
- **Surface:** borrow · **Severity:** low · **Class:** correctness · **Dedup:** new (relates F019)
- **File:** `packages/sdk/src/actions/borrow/providers/aave/write.ts:111-135`
- **Detail:** For a max collateral withdraw via the WETH gateway, `onChainAmount=maxUint256` (line 115) so `withdrawETH(pool, maxUint256, to)` pulls the full aToken balance at execution, but the aToken approval to the gateway is sized to `amount=current.collateralAmount` — the live aToken-balance snapshot at quote time (quote.ts:200-203). aTokens are rebasing/accruing, so by execution the on-chain balance exceeds the snapshot and the gateway's transferFrom of the full balance exceeds the granted allowance, reverting. `buildAaveRepay` documents this exact accrual-vs-snapshot tradeoff for the debt side (write.ts:137-143) but the withdraw path's comment (121-123) only justifies not using the maxUint256 sentinel for the approval and omits that this systematically reverts as aToken interest accrues. A revert, not a fund loss, but inconsistent sibling behavior surfacing as spurious max-withdraw failures on long-held native-ETH collateral.
- **Exploit/repro:** Supply native ETH as Aave collateral, wait for accrual, call `wallet.borrow.withdrawCollateral({amount:{max:true}})` in exact approval mode: the aToken approval equals the stale snapshot while withdrawETH pulls the larger live balance, reverting.
- **Recommendation:** Either size the gateway aToken approval to maxUint256 in max mode (matching buildRepayApproval's unlimited allowance for shares-based/max repay) or add small accrual headroom, and update the comment. Keep the two max-paths symmetric.
- **suggestRefactor:** false · **Candidate issue:** none

### F057 — Morpho exact-assets repay does not clamp an over-large amount to live debt; over-grants approval and reverts on-chain
- **Surface:** borrow · **Severity:** low · **Class:** correctness · **Dedup:** new
- **File:** `packages/sdk/src/actions/borrow/providers/morpho/repay.ts:33-47`
- **Detail:** `computeRepay` non-max (exact assets) branch sets `repayAssetsWei = amount.amountWei` with no clamp against `current.borrowAssets`. `buildRepayApproval` then sizes the loan-token approval to that full value (repay.ts:81-86), and `encodeMorphoRepay` submits `repay(assets=repayAssetsWei, shares=0)`. If the user passes an exact amount larger than their live debt (intending full repay but specifying a stale figure rather than `{max:true}`), Morpho Blue's repay reverts when assets exceed outstanding borrow — but only after the SDK built and the user signed an ERC-20 approval to Morpho Blue for the inflated amount. The user is left with a standing over-approval and a failed tx. The max path correctly routes through shares; the exact path silently trusts the caller amount. Aave's repay uses maxUint256 on-chain for full repay and otherwise the protocol caps the pull, so the two providers diverge.
- **Exploit/repro:** With ~100 USDC debt, call `wallet.borrow.repay({amount:{amount:101}})`: SDK builds approve(MorphoBlue, 101e6) then repay(101e6,0); the repay reverts but the 101e6 approval stands.
- **Recommendation:** Clamp the exact-assets repay to `min(amount.amountWei, current.borrowAssets)` before sizing the approval and encoding the repay (or surface an explicit error when amount exceeds live debt). Align with the Aave repay sibling.
- **suggestRefactor:** false · **Candidate issue:** #334

---

## Wallet-core surface

### F058 — getWallet drops the caller-supplied nonce, so lazy deploy / address fallback uses nonce 0
- **Surface:** wallet-core · **Severity:** medium · **Class:** correctness · **Dedup:** new
- **File:** `packages/sdk/src/wallet/core/providers/smart/default/DefaultSmartWalletProvider.ts:168-184`
- **Detail:** `DefaultSmartWalletProvider.getWallet` receives no nonce and never forwards one to `DefaultSmartWallet.create` (168-184), even though `GetSmartWalletOptions` carries `nonce` and `WalletProvider.getSmartWallet` destructures it (WalletProvider.ts:104) and forwards it to `getWalletAddress` (line 124). The retrieved wallet therefore has `this.nonce === undefined`. While address resolution short-circuits on deploymentAddress, any self-derivation falls back to `this.nonce || 0n`: `deploy()` encodes createAccount with nonce 0 (DefaultSmartWallet.ts:480) and `getAddress()` computes CREATE2 with nonce 0 (line 584). For a wallet originally created with a non-zero nonce that is later retrieved and lazily deployed, this targets the WRONG counterfactual address — deploying a different account than the one the caller transacts against, or reverting.
- **Exploit/repro:** `createSmartWallet` with nonce=5n and empty deploymentChainIds (lazy). Later `getSmartWallet({ signer, walletAddress, nonce: 5n })` and send a tx triggering deploy on a fresh chain; deploy() encodes createAccount(signerBytes, 0n) -> deploys/targets the nonce-0 address, not the nonce-5 wallet.
- **Recommendation:** Add `nonce?: bigint` to SmartWalletProvider.getWallet / DefaultSmartWalletProvider.getWallet params and forward it into DefaultSmartWallet.create; have WalletProvider.getSmartWallet pass `nonce` on the getWallet call (not just getWalletAddress).
- **suggestRefactor:** false · **Candidate issue:** #98

### F059 — appendAttributionSuffix targets uo.initCode, absent on EntryPoint v0.7 UserOperations (toCoinbaseSmartAccount v1.1)
- **Surface:** wallet-core · **Severity:** low · **Class:** info · **Dedup:** new
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:230-234, 276-279, 594-598`
- **Detail:** send/sendBatch read `uo.initCode` and conditionally append the attribution suffix (232-234, 277-279). `toCoinbaseSmartAccount` is constructed with version '1.1' (line 205), which uses EntryPoint v0.7 where prepareUserOperation returns `factory`/`factoryData`, not legacy v0.6 `initCode`. `uo.initCode` is therefore undefined, the ternary preserves undefined, and the 16-byte suffix is never appended to deployment user-operations — only to callData on already-deployed wallets. Attribution is silently dropped for the first (deploying) UserOperation. Not a fund-safety issue but the feature is partially inoperative and the code references a field shape that doesn't match the configured account version.
- **Exploit/repro:** Configure attributionSuffix and deploy a fresh smart wallet; the deploying UserOperation's factoryData carries no suffix because the code only mutates the (undefined) initCode field.
- **Recommendation:** If attribution on deployment ops is intended, append the suffix to factoryData (v0.7) rather than initCode, or document that attribution applies only to post-deployment callData. Otherwise remove the dead initCode handling.
- **suggestRefactor:** false · **Candidate issue:** none

### F060 — retryOnStaleRead swallows thrown read errors as stale; loop/final-read shape easy to misuse for index resolution
- **Surface:** wallet-core · **Severity:** low · **Class:** correctness · **Dedup:** new
- **File:** `packages/sdk/src/wallet/core/utils/retryOnStaleRead.ts:20-39`
- **Detail:** `retryOnStaleRead` treats any thrown error from `read()` as a stale result and silently retries (catch, 30-32), then after the loop performs one final unconditional read whose result is returned regardless of staleness (line 38). `addSigner` relies on this with retries:1 to resolve the newly-added signer's on-chain index (DefaultSmartWallet.ts:359-368) and throws only if the final value is -1. Because RPC errors are indistinguishable from a -1/stale read, a transient node error during index lookup is indistinguishable from "signer truly absent", and the caller surfaces a generic "failed to find signer index". For index resolution feeding `removeSigner(index,...)`, a wrong/-1 index later passed explicitly could target the wrong owner slot.
- **Exploit/repro:** Make the ownerAtIndex read throw transiently during addSigner; retryOnStaleRead swallows it, the final read also throws and is rethrown only as a generic failure, masking the real cause and risking a wrong explicit signerIndex on a later removeSigner.
- **Recommendation:** Distinguish thrown errors from stale-but-successful reads: rethrow on the final attempt if the last read threw, and surface the underlying error so index-resolution callers do not conflate RPC failure with signer-not-found.
- **suggestRefactor:** true · **Candidate issue:** none

### F061 — EOAWallet.send/sendBatch perform no recipient/value sanity on TransactionData before broadcasting
- **Surface:** wallet-core · **Severity:** low · **Class:** info · **Dedup:** new (relates F020)
- **File:** `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:62-100`
- **Detail:** `send` (62-73) forwards transactionData straight to `walletClient.sendTransaction` with no check that `to` is a real address or that value/data are coherent; `sendBatch` (90-100) loops the same. This is the EOA counterpart to the smart-wallet sendTokens recipient gap: the wallet layer is the last hook before signing, yet trusts whatever calldata the action/namespace produced. Given baseline findings document several providers omit recipient/min-out validation (F001-F004), a defense-in-depth `isAddress(transactionData.to)` assertion at the wallet boundary would catch a malformed `to` before a signature is produced. Info because the action layer is the primary place to validate and TransactionData.to is typed Address.
- **Exploit/repro:** A namespace that built TransactionData with a wrong `to` (per F001/F002 recipient gaps) reaches EOAWallet.send and is signed and broadcast with no wallet-layer rejection.
- **Recommendation:** Consider a shared pre-broadcast assertion (isAddress(to), value >= 0n) in executeTransactionBatch or the wallet send entrypoints so every namespace inherits a last-line guard.
- **suggestRefactor:** true · **Candidate issue:** #477

### (refines:F023) — Retrieved smart wallet signs with ownerIndex derived from caller-supplied signers order, not on-chain owner order
- **Surface:** wallet-core · **Severity:** high · **Class:** correctness · **Dedup:** refines:F023
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:76-80, 196-207, 122`
- **Detail:** When a deployed wallet is retrieved via WalletProvider.getSmartWallet -> DefaultSmartWalletProvider.getWallet, `DefaultSmartWallet.create` defaults `signers` to `[params.signer.address]` when none is passed (line 122), and `ensureLocalAccountSigner` computes `this.signerIndex = findSignerInArray(signers, signer)` purely from that caller-supplied array (76-80). `getCoinbaseSmartAccount` then passes `ownerIndex: this.signerIndex` and `owners: this.signers` to toCoinbaseSmartAccount (200-203). For a multi-owner wallet where the signer is NOT owner #0 on-chain, the SDK signs every UserOperation against the wrong owner slot: viem builds the signature wrapper for ownerIndex 0, EntryPoint validation against the real owner slot fails, and the UserOperation reverts — the action silently fails and any sponsored/prefunded value is stuck pending. Sharpens F023 (which flagged the provider pinning ownerIndex to 0) at the signing seam with a worse symptom (wrong-slot signature).
- **Exploit/repro:** Deploy a 2-of-N smart wallet where signerA is owner index 1. Call `actions.wallet.getSmartWallet({ signer: signerA, walletAddress })` with no signers array. Send any tx; the UserOperation is signed with ownerIndex 0 and reverts at EntryPoint validation against the wrong owner slot.
- **Recommendation:** On the retrieved-wallet path (deploymentAddress set), resolve the signer's actual on-chain index via findSignerIndexOnChain before signing, or require the caller to pass the full ordered signers array and validate it against the on-chain owner set. Fail loudly if the resolved index is -1 instead of silently defaulting to 0.
- **suggestRefactor:** false · **Candidate issue:** #163

### (refines:F035) — sendTokens recipient passes only a truthy check; malformed recipient encoded into native value send / transfer calldata
- **Surface:** wallet-core · **Severity:** medium · **Class:** fund-loss · **Dedup:** refines:F035
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:512-561`
- **Detail:** sendTokens guards `if (!recipientAddress)` (518) but never validates the value is a real 20-byte address. The recipient (typed Address, but at runtime SDK callers pass strings) flows straight into either a native send (`to: recipientAddress, value: parsedAmount`, 539-543) or the ERC-20 transfer args (`args: [recipientAddress, parsedAmount]`, 553). A malformed recipient that still parses through viem encoding results in tokens moved to an unintended/unrecoverable destination. F035 noted recipient is only checked falsy; the distinct dimension here is the native branch puts the recipient in the tx `to` field while the ERC-20 branch buries it in calldata, so a sibling-consistent isAddress guard is the obvious missing validation on a value-movement path the swap action validates.
- **Exploit/repro:** `smartWallet.sendTokens(1, usdcAsset, chainId, '0xabc' as Address)`. The truthy guard passes; viem encodeFunctionData with a non-20-byte recipient either reverts late or, for a wrong-but-valid-length recipient, sends funds to an unintended address with no SDK-side rejection.
- **Recommendation:** Add `if (!isAddress(recipientAddress)) throw new InvalidParamsError('recipientAddress')` (and getAddress checksum normalization) before building either branch, matching the swap recipient path.
- **suggestRefactor:** false · **Candidate issue:** none

---

## Wallet-hosted surface

### F062 — Dynamic: wallet.connector cast to DynamicWaasEVMConnector without an instanceof/capability guard before signRawMessage
- **Surface:** wallet-hosted · **Severity:** low · **Class:** info · **Dedup:** new
- **File:** `packages/sdk/src/wallet/react/wallets/hosted/dynamic/utils/createSigner.ts:24-25`
- **Detail:** After the isEthereumWallet check (line 21), the code unconditionally casts `wallet.connector as DynamicWaasEVMConnector` (25) and later calls `connector.signRawMessage`. isEthereumWallet only confirms EVM capability, not that the connector is specifically a WaaS connector exposing signRawMessage. A non-WaaS Ethereum Dynamic wallet (injected/embedded) would pass the EVM guard but lack signRawMessage, so the raw `sign` path would throw at call time rather than at construction. Not a fund-loss path (typed-data/tx paths use walletClient and a throw is fail-safe), but a latent capability mismatch worth a guard for a clean error.
- **Exploit/repro:** Pass a non-WaaS Ethereum Dynamic wallet; construction succeeds, raw sign() throws later with an opaque error.
- **Recommendation:** Add a narrow capability check (`typeof connector?.signRawMessage === 'function'`) and throw a descriptive error at construction if absent, instead of an unchecked cast.
- **suggestRefactor:** false · **Candidate issue:** none

### (refines:F029) — Node Privy: caller-supplied address used as deposit owner / smart-wallet owner, never reconciled with the signing walletId's real key
- **Surface:** wallet-hosted · **Severity:** high · **Class:** fund-loss · **Dedup:** refines:F029
- **File:** `packages/sdk/src/wallet/node/wallets/hosted/privy/PrivyWallet.ts:36, 49-50, 60-67`
- **Detail:** PrivyWallet (node) takes walletId and address as two independent caller-supplied fields. `this.address` is set verbatim to the caller's `address` (line 36) and the signer is built by `createViemAccount(privyClient, { walletId, address })` (createSigner.ts:28). Privy routes signing through `walletId` but does NOT verify that the supplied `address` is controlled by that key; the LocalAccount simply reports whatever `address` was passed (PrivyWallet.spec.ts:92-97). Nothing reconciles. The DeFi consequence goes beyond F029's "reported address never reconciled": `this.address` is encoded as the position owner / onBehalfOf in lend (LendProvider.openPosition uses params.walletAddress = wallet.address, LendProvider.ts:85-95), as the recipient/owner in approvals, and as the smart-wallet owner when this signer is passed into DefaultSmartWallet (DefaultSmartWallet.ts:122 derives owners from `signer.address`). A mismatched (or attacker-influenced) address deploys a smart wallet owned by a key that cannot sign for it (bricking) or directs a lend deposit's onBehalfOf to an address other than the one whose key signs and whose funds move — fund misdirection.
- **Exploit/repro:** Construct a PrivyWallet with walletId=<key A's id> and address=<key B's address>. wallet.address returns B. `wallet.lend.openPosition` deposits onBehalfOf B while the ERC-20 approval+transfer is signed by key A (account A's funds). Position credited to B, funds leave A.
- **Recommendation:** After constructing the signer, assert `signer.address === getAddress(params.address)` (or fetch the wallet from Privy by walletId and compare) and throw on mismatch before the wallet is usable. Matches the implicit invariant the Turnkey sibling gets for free (`this.address = this.signer.address`, TurnkeyWallet.ts:70). At minimum reconcile once during performInitialization.
- **suggestRefactor:** true · **Candidate issue:** none

### (refines:F028) — Node Privy: toActionsWallet checksums via getAddress but standalone createSigner skips it; neither verifies address belongs to walletId
- **Surface:** wallet-hosted · **Severity:** medium · **Class:** malicious-sign · **Dedup:** refines:F028
- **File:** `packages/sdk/src/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.ts:67, 87-95`
- **Detail:** `toActionsWallet` wraps the address with `getAddress(params.address)` (67) so a malformed/non-checksummed address is rejected, but the sibling `createSigner` (87-95) forwards `params.address` straight to the node createSigner util with no getAddress and no reconciliation. This is F028, sharpened by the DeFi lens: createSigner output is the exact value used as a smart-wallet owner (DefaultSmartWallet.ts:122 `signers = [params.signer.address]`). getAddress only validates hex shape (not key ownership), so even the validated path trusts an arbitrary address; the createSigner path additionally accepts malformed input. A wallet/signer whose reported address is wrong leads to owner-set / onBehalfOf misconfiguration per refines:F029.
- **Exploit/repro:** `provider.createSigner({ walletId, address: 'not-an-address' })` — no validation error here, unlike toActionsWallet which would throw in getAddress.
- **Recommendation:** Apply getAddress in createSigner too (parity with toActionsWallet) and add the walletId<->address reconciliation in one shared place. Add the address-validation / address-vs-walletId test F032 flags is missing.
- **suggestRefactor:** true · **Candidate issue:** none

### (refines:F030) — Dynamic signer wires signTransaction/signMessage/signTypedData to WalletClient methods whose signatures differ from viem CustomSource
- **Surface:** wallet-hosted · **Severity:** low · **Class:** correctness · **Dedup:** refines:F030
- **File:** `packages/sdk/src/wallet/react/wallets/hosted/dynamic/utils/createSigner.ts:26-37`
- **Detail:** The Dynamic createSigner builds a LocalAccount via toAccount with signTransaction/signMessage/signTypedData bound to `walletClient.signTransaction` etc. (34-36), while the raw `sign({hash})` path is hand-rolled through `connector.signRawMessage` with 0x-stripping (28-33, the F030 divergence). Two issues compound for the tx-signing path: (1) `walletClient.signTransaction` has the viem WalletClient signature `({ account, ...transaction })`, not the CustomSource LocalAccount signature `(transaction, { serializer })` viem invokes during sendTransaction — at best fails-safe (throws), at worst serializes a transaction missing fields; (2) these are unbound method references, so any `this` dependence inside the Dynamic walletClient breaks. The Privy (react) and Turnkey siblings return genuine viem accounts and don't hand-assemble the signing surface, so Dynamic is the only provider whose tx/message/typed-data signing is reassembled by hand. This is the active EOA send path (EOAWallet.send -> walletClient.sendTransaction -> account.signTransaction). Sharpens F030 from the raw-sign 0x-strip to the full tx-signing shape mismatch.
- **Exploit/repro:** A real-network send through DynamicWallet exercises account.signTransaction with viem's LocalAccount call shape; the bound walletClient method expects a different argument object. Current tests assert only the raw sign path.
- **Recommendation:** Prefer the provider's native viem-account adapter (mirroring toViemAccount for Privy); otherwise bind the methods (`walletClient.signTransaction.bind(walletClient)`) and verify each conforms to CustomSource, with a test that drives a transaction signature end-to-end.
- **suggestRefactor:** true · **Candidate issue:** none

### (refines:F031) — Turnkey: caller-supplied ethereumAddress passed through unvalidated and becomes the wallet's reported address with no cross-check against signWith
- **Surface:** wallet-hosted · **Severity:** low · **Class:** correctness · **Dedup:** refines:F031
- **File:** `packages/sdk/src/wallet/node/wallets/hosted/turnkey/utils/createSigner.ts:25-31`
- **Detail:** createSigner forwards `ethereumAddress` straight into @turnkey/viem createAccount (26-31). Per the SDK's own docs (TurnkeyWallet.ts:36-40), when `ethereumAddress` is supplied it is used directly and the Turnkey API is NOT queried to derive the address; `this.address = this.signer.address` becomes whatever was passed. So an `ethereumAddress` not corresponding to the key behind `signWith` (a private-key ID) makes the wallet report and operate under a wrong owner/onBehalfOf address while signing with the real key — the same misdirection class as the node Privy finding, gated on the optional override. F031 noted missing format validation; the fund-safety angle is the missing address<->signWith reconciliation. Unlike the address-less path (which fetches the true address from Turnkey), the override path is trusted blindly.
- **Exploit/repro:** `createSigner({ client, organizationId, signWith: '<privkey-id>', ethereumAddress: '<unrelated checksummed address>' })` yields a signer whose .address is the unrelated address; downstream lend onBehalfOf / smart-wallet owner uses it.
- **Recommendation:** When ethereumAddress is provided alongside a private-key-ID signWith, either reconcile it against the address Turnkey reports for that key, or document that the integrator is fully responsible and add a getAddress format guard (parity with node Privy's toActionsWallet getAddress).
- **suggestRefactor:** false · **Candidate issue:** none

---

## Wallet-smart surface

### F063 — Attribution suffix is appended to initCode (deployment calldata), mutating the bytes the factory createAccount executes
- **Surface:** wallet-smart · **Severity:** medium · **Class:** correctness · **Dedup:** new (relates F026)
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:232-234, 277-279, 472-485`
- **Detail:** appendAttributionSuffix is applied not only to callData but also to `uo.initCode` in send/sendBatch, and sendBatch is the transport for deploy(). In ERC-4337 v0.6 (version '1.1'), `initCode = factory(20 bytes) ++ factoryCalldata` and EntryPoint calls `factory.call(initCode[20:])`. Concatenating 16 trailing bytes appends them to the factory's createAccount(owners,nonce) calldata. Solidity ABI decoding tolerates trailing bytes so the deploy still succeeds and the CREATE2 address is unchanged (derived from decoded owners/nonce), so not an address-mismatch fund loss. But appending an attribution suffix to a deploy/initCode path is not what the mechanism is for (attribution belongs on execute callData), it is unvalidated against the negotiated 4337 version, and the spec hard-codes the suffix-on-initCode behavior as intended (DefaultSmartWallet.spec.ts:255). If viem ever returns the v0.7 split (factory/factoryData) so uo.initCode is undefined, the suffix is silently dropped on deploys with zero error, and a future entrypoint packing initCode differently would land the trailing bytes unexpectedly.
- **Exploit/repro:** DefaultSmartWallet.spec.ts:228-255: prepareUserOperation returns initCode:'0x01'; the wallet sends initCode: concatHex(['0x01', attributionSuffix]). Append happens unconditionally whenever attributionSuffix is set and initCode !== '0x'.
- **Recommendation:** Do not append the attribution suffix to initCode; restrict appendAttributionSuffix to execute callData only. Assert the negotiated EntryPoint version and that uo.initCode has the expected factory-prefixed shape before mutating it, and fail loud (rather than silently no-op) when the suffix cannot be safely placed.
- **suggestRefactor:** true · **Candidate issue:** none

### F064 — findSignerInArray silently ignores WebAuthn-only owner arrays, so a passkey-signing config picks index -1 and constructor throws
- **Surface:** wallet-smart · **Severity:** low · **Class:** correctness · **Dedup:** new
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/utils/findSignerInArray.ts:17-29`
- **Detail:** findSignerInArray only matches string addresses and `signer.type==='local'`; any webAuthn entry returns false. ensureLocalAccountSigner then throws "Signer does not match any signer in the signers array" for a wallet whose owners are passkeys plus a LocalAccount when the LocalAccount is not literally present by address. More subtly, getSignerPublicKey for a webAuthn signer returns the P256 publicKey while a LocalAccount returns an address; the matching logic is address-only, so a config that legitimately mixes signer kinds cannot be reconciled and the wallet cannot be constructed to sign, blocking access to funds it owns. A correctness/availability gap on the owner-reconciliation path that underpins which key signs value-moving UserOperations.
- **Exploit/repro:** `create({ signer: localAccount, signers: [webAuthnAccount, localAccount.address] })` works, but `create({ signer: localAccount, signers: [webAuthnAccount] })` (intending to add the EOA) throws -1 even though the intended on-chain owner set is valid; there is no path to surface "add your EOA as owner first".
- **Recommendation:** Either explicitly document/validate that the LocalAccount signer must appear by address in signers and throw a precise error naming the missing owner, or extend matching to compare getSignerPublicKey across kinds so mixed-owner configs reconcile deterministically.
- **suggestRefactor:** false · **Candidate issue:** #163

### F065 — appendAttributionSuffix has no upper-bound/length assertion; the 16-byte suffix is validated in only one of two construction paths
- **Surface:** wallet-smart · **Severity:** low · **Class:** info · **Dedup:** new (relates F026)
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:594-598`
- **Detail:** appendAttributionSuffix concatenates this.attributionSuffix to arbitrary bytes whenever set. The 16-byte/hex validation (isValidAttributionSuffix) runs only when the suffix is supplied directly to the constructor; the provider path (DefaultSmartWalletProvider.computeAttributionSuffix = slice(keccak256(toHex(seed)),0,16)) bypasses isValidAttributionSuffix entirely and is trusted to always produce 16 bytes. The two construction routes have asymmetric validation of a value concatenated onto every signed UserOperation's callData and initCode. Today computeAttributionSuffix is correct, but nothing enforces the 16-byte invariant at the single point of use, so a future provider setting attributionSuffix from another source could append an arbitrary-length blob to signed calldata without any guard.
- **Exploit/repro:** Constructor path runs isValidAttributionSuffix; provider path sets `this.attributionSuffix = computeAttributionSuffix(seed)` with no size assertion before it reaches appendAttributionSuffix.
- **Recommendation:** Assert `size(this.attributionSuffix)===16` (and isHex) at the single choke point in appendAttributionSuffix (or the setter) so every construction route is covered, and have computeAttributionSuffix flow through the same validator.
- **suggestRefactor:** false · **Candidate issue:** none

### (refines:F037) — send/sendBatch re-submit suffixed callData but drop every prepared gas/fee field of the UserOperation
- **Surface:** wallet-smart · **Severity:** high · **Class:** correctness · **Dedup:** refines:F037
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:229-236, 274-281`
- **Detail:** Both send() and sendBatch() call `prepareUserOperation({account, calls, paymaster:true})` and capture `uo`, then call `sendUserOperation({account, callData: appendAttributionSuffix(uo.callData), initCode: ..., paymaster:true})` passing ONLY callData/initCode/paymaster/account. Every other field the explicit prepare produced (callGasLimit, verificationGasLimit, preVerificationGas, maxFeePerGas, maxPriorityFeePerGas, paymasterAndData, nonce) is discarded. Because those required fields are absent, viem's sendUserOperation re-runs the full prepare path. Crucially the suffix has CHANGED callData length (16 bytes longer for callData, and for initCode in the deploy/batch path), so the re-estimated callGasLimit/preVerificationGas are computed against the suffixed bytes while the original prepare estimated against unsuffixed bytes. The two prepares can disagree, and any paymaster sponsorship validation tied to the first prepare's gas numbers is thrown away. A UserOperation that settles with under-estimated gas (suffix omitted from the estimate the user/paymaster reasoned about) can revert mid-execution or be sponsored on stale numbers. Strictly more than the F037 "prepared twice / perf" note: the discarded fields include the gas bounds that determine whether the op executes the action vs runs out of gas — hence the severity bump to high.
- **Exploit/repro:** Configure a wallet with attributionSuffix. Call send() with a call whose gas is near a bundler limit. prepareUserOperation estimates gas G on the original callData; sendUserOperation re-estimates on callData+16 bytes (different G'). Only callData/initCode/paymaster are forwarded, so the explicit prepare's G is never used. DefaultSmartWallet.spec.ts:178-184 confirms sendUserOperation receives only {account, callData(+suffix), initCode, paymaster}.
- **Recommendation:** Spread the prepared UserOperation into sendUserOperation so the gas/fee/nonce fields are carried and the suffix is the only mutation: `sendUserOperation({ ...uo, callData: appendAttributionSuffix(uo.callData), initCode: uo.initCode ? appendAttributionSuffix(uo.initCode) : uo.initCode, paymaster: true })`. Re-estimate gas AFTER appending the suffix (or account for the 16-byte delta). Add a test asserting the gas fields are forwarded.
- **suggestRefactor:** true · **Candidate issue:** #456

### (refines:F039) — removeSigner can remove the only LocalAccount this client can sign with, locking the wallet from this SDK instance
- **Surface:** wallet-smart · **Severity:** medium · **Class:** fund-loss · **Dedup:** refines:F039
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:390-422`
- **Detail:** removeSigner resolves an index (caller-supplied or looked up) and submits `removeOwnerAtIndex(index, signerBytes)` with no check that the signer being removed differs from this.signer, nor that at least one remaining on-chain signer corresponds to a LocalAccount this instance can sign future UserOperations with. The on-chain CoinbaseSmartWallet only guards against removing the LAST owner (LastOwner error) and index/owner mismatch, but happily lets you remove the signing EOA while leaving plain-address owners (Signer = Address) or WebAuthn owners this SDK instance holds no private key for. After such a removal, getCoinbaseSmartAccount still references this.signerIndex / this.signer, but the on-chain owner set no longer contains a signer this client can produce a valid signature for, so every subsequent send/sendBatch (and thus every withdrawal/transfer of funds held by the smart wallet) fails validation — funds locked from the only key the integrator controls. The value-movement analogue of F039 (which notes the index is not cross-checked against the signer); the gap is the missing "are we removing our own ability to sign" guard.
- **Exploit/repro:** Create a wallet whose signers are [signerEOA, plainAddressB]. Call removeSigner(signerEOA, chainId). On-chain ownerCount is still >1 so LastOwner does not fire; the removal succeeds. The SDK instance can no longer sign because plainAddressB has no LocalAccount. Any later sendTokens / action send reverts at validateUserOp.
- **Recommendation:** Before submitting removeOwnerAtIndex, reject removal of the wallet's active signer unless the caller supplied/registered a replacement LocalAccount that remains an on-chain owner. At minimum warn/throw when getSignerPublicKey(signer) === getSignerPublicKey(this.signer at signerIndex), and document that removing the signing owner bricks this client.
- **suggestRefactor:** false · **Candidate issue:** #163

### (refines:F041) — sendTokens takes amount as a JS number, so parseAssetAmount silently loses precision / emits scientific notation
- **Surface:** wallet-smart · **Severity:** medium · **Class:** fund-loss · **Dedup:** refines:F041
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:536-547`
- **Detail:** sendTokens(amount: number, ...) feeds amount straight into parseAssetAmount(asset, amount) -> parseDecimalAmount -> parseUnits(amount.toString(), decimals). A JS number cannot represent integers above 2^53 or more than ~15-17 significant digits exactly, and number.toString() emits exponential notation (1e21, 1.0000000000000001e-7) for large/small magnitudes. Same root cause as F041 for parseDecimalAmount, but here on the smart-wallet token-transfer entry point that builds the actual ERC20 transfer / native value calldata: sending 1e23-wei-worth of USDC, or an 18-decimal amount with >15 fractional digits, throws inside parseUnits on the 'e' character or, where it does not throw, encodes a transfer for an amount that does not match the caller. A direct fund-amount mismatch on a signing path. Extends F041 to the sendTokens value-out path.
- **Exploit/repro:** `sendTokens(1e21, someAsset, chainId, recipient)` -> parseUnits('1e+21', decimals) which viem does not accept as a plain decimal string. For high precision: `sendTokens(0.1234567890123456789, asset18, ...)` rounds before toString(), encoding a transfer amount differing from intent.
- **Recommendation:** Accept an optional raw bigint amount on sendTokens (see #379) and prefer it; when only a number is given, validate it is finite and within safe-integer/precision bounds for the asset decimals before parseUnits, and reject otherwise.
- **suggestRefactor:** true · **Candidate issue:** #379

### (dup:F023) — getWallet builds the smart account from default signers=[signer.address]/ownerIndex 0 while trusting a caller deploymentAddress
- **Surface:** wallet-smart · **Severity:** medium · **Class:** correctness · **Dedup:** dup:F023
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:196-207, 573-587`
- **Note:** Same root cause as F023 and the wallet-core refines:F023 finding in this pass (getWallet defaults signers/ownerIndex to [signer.address]/0 while trusting a caller deploymentAddress, so a multi-owner deployed wallet's signing ownerIndex can diverge and every send reverts at validateUserOp). Overlaps #163. No new row — covered by the wallet-core refines:F023 entry.

### (dup:F035) — sendTokens validates recipient only for falsiness, allowing a malformed/zero recipient to be encoded into the transfer
- **Surface:** wallet-smart · **Severity:** low · **Class:** malicious-sign · **Dedup:** dup:F035
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:518-525`
- **Note:** Same gap as F035 and the wallet-core refines:F035 finding in this pass (sendTokens throws only on !recipientAddress, never isAddress; zero address 0x000...0 passes the falsy guard and burns tokens). Covered by the wallet-core refines:F035 row. No new row.

---

## Core-services surface

### F066 — validateRecipient silently no-ops on ENS names and any non-hex string — a recipient guard that does not guard most malformed recipients
- **Surface:** core-services · **Severity:** medium · **Class:** correctness · **Dedup:** new (relates F003)
- **File:** `packages/sdk/src/utils/validation.ts:176-180`
- **Detail:** validateRecipient(recipient) only runs the zero-address check when `recipient && isAddress(recipient)`. For any value that is not already a syntactically valid hex address (an ENS name, a truncated address, a typo'd '0x...' that fails the checksum, an empty-after-trim string), the function returns silently with no error. It is the shared recipient validator, called directly by SwapProvider.validateSwapExecute (SwapProvider.ts:450) on the raw `params.recipient` (type Address | EnsName). The swap path is only saved because the namespace layer resolves ENS before the provider runs (WalletSwapNamespace.ts:114, BaseSwapNamespace.ts:54/89). But the guard itself gives false assurance: a sibling author who calls validateRecipient expecting it to reject unresolved/malformed recipients gets no rejection, and a malformed recipient can flow into recipient-in-calldata. The "validation present in one place but a gap" pattern: it checks zero-address but skips the much more common malformed-string case.
- **Exploit/repro:** `validateRecipient('vitalik.eth')` returns void; `validateRecipient('0x123')` returns void; only `validateRecipient('0x0000...0000')` throws. Direct provider call paths that pass an unresolved recipient land it in the swap recipient field unchecked.
- **Recommendation:** Make the guard total over its input: if recipient is defined and `!isAddress(recipient, { strict: false })` AND not a valid EnsName, throw InvalidParamsError (or require callers pass an already-resolved Address and rename to validateResolvedRecipient). At minimum document it intentionally skips ENS, and assert recipients reaching provider calldata are isAddress.
- **suggestRefactor:** true · **Candidate issue:** #437

### F067 — buildPermit2ApprovalTx computes Permit2 expiration with no positive/integer/uint48 bound
- **Surface:** core-services · **Severity:** low · **Class:** malicious-sign · **Dedup:** new
- **File:** `packages/sdk/src/utils/approve.ts:115-117`
- **Detail:** `expiration = Math.floor(Date.now()/1000) + (expirySeconds ?? DEFAULT)`. The Permit2 `approve(token, spender, amount, expiration)` expiration is part of the on-chain approval payload (signing-path surface). expirySeconds is integrator-configurable via SwapSettings.permit2ExpirationSeconds / provider config (SwapProvider.ts:118-123, types/actions.ts:117) and never validated as a positive integer. A negative value produces a past-dated expiration: the approve succeeds but is immediately expired, so the subsequent swap reverts with no explanation (silent footgun). A non-integer (float) produces a non-integer expiration that viem's uint48 encoder rejects at encode time. The default (2_592_000) is safe, so this only bites misconfiguration, but there is no lower/upper bound check that a value as load-bearing as an approval expiry deserves. (Related to F050's deadline-decoupling angle, but distinct: this is the missing numeric bound at the config seam.)
- **Exploit/repro:** Set permit2ExpirationSeconds: -1; buildPermit2ApprovalTx emits a past expiration, the swap's permit2 allowance is dead-on-arrival and the swap reverts. Set permit2ExpirationSeconds: 1.5 and encodeFunctionData throws on the uint48 field.
- **Recommendation:** Validate expirySeconds is a positive integer and bound the resulting expiration to `<= maxUint48` before encoding (clamp or throw). Mirror the existing slippage validation guarding an analogous integrator-supplied numeric.
- **suggestRefactor:** false · **Candidate issue:** none

### F068 — ENS reverse resolution getName() is returned without forward-confirmation, so a returned primary name is attacker-settable and unsafe as a recipient label
- **Surface:** core-services · **Severity:** low · **Class:** info · **Dedup:** new
- **File:** `packages/sdk/src/services/nameservices/ens/EnsNamespace.ts:95-113`
- **Detail:** getName(address) returns the raw ENS reverse record (getEnsName) with no forward-resolution check that the named ENS record resolves back to that address. ENS reverse records are self-set and unauthenticated: any address can set its reverse record to 'vitalik.eth'. If a frontend/CLI displays getName(recipient) as a trusted human-readable confirmation of a transfer/swap recipient, an attacker-controlled recipient can present a trusted-looking name — the canonical ENS reverse-resolution spoof. Info-only here because getName is not consumed in any value-movement decision inside the SDK (forward resolveAddress, the authoritative direction, feeds recipients), but the SDK exposes getName publicly and integrators commonly use it for recipient-confirmation UIs.
- **Exploit/repro:** Attacker sets reverse record of their address to 'trusted.eth'; getName(attackerAddr) returns 'trusted.eth'; a UI labeling the swap/transfer recipient with this string misleads the signer.
- **Recommendation:** Document that getName is unverified reverse data and must not be shown as a trusted recipient label without forward-confirming (resolve the returned name and isAddressEqual to the input). Optionally add an opt-in forward-confirmed variant.
- **suggestRefactor:** false · **Candidate issue:** #453

### F069 — Asset allow/block filter matches addresses chain-agnostically, so blocking an asset on one chain can over-block a different asset sharing that address on another chain
- **Surface:** core-services · **Severity:** low · **Class:** correctness · **Dedup:** new (relates F012)
- **File:** `packages/sdk/src/actions.ts:204-208`
- **Detail:** getSupportedAssets builds `blockedAddresses = new Set(block.flatMap(getAllAssetAddresses))` and filters allow by `addresses.some(addr => blockedAddresses.has(addr))`. getAllAssetAddresses (utils/assets.ts:105-112) flattens an asset's addresses across ALL chains, lowercased, dropping the chainId. Two distinct tokens reusing the same address on different chains (common on the OP stack: WETH is 0x4200...0006 on every L2, plus predeploy/factory-derived collisions) become indistinguishable. Blocking asset X (whose chain-A address equals allowed asset Y's chain-B address) silently removes Y from the supported set on every chain. Same class as F012's chain-agnostic matching, but on the user-facing assets allow/block surface (different file). Over-blocking (usability/availability), not under-blocking, so no fund-loss hole, but it can hide an intended-supported asset.
- **Exploit/repro:** block = [WETH] (matches 0x4200..0006 on all L2s); allow = [some other 0x4200..0006-addressed predeploy token on a different chain] => that token is filtered out of getSupportedAssets despite never being intended for block.
- **Recommendation:** Key the block set by (chainId, address) pairs and compare per-chain, or compare by asset identity rather than flattened cross-chain address. Reuse a marketId-style composite key.
- **suggestRefactor:** true · **Candidate issue:** #493

### (refines:F042) — Deficit-approving helpers getApprovalDeficit/buildApprovalTxIfNeeded have zero SDK callers and are not exported — F042's wrong-allowance bug is latent dead code
- **Surface:** core-services · **Severity:** low · **Class:** correctness · **Dedup:** refines:F042
- **File:** `packages/sdk/src/utils/approve.ts:184-216`
- **Detail:** Sharpens F042. getApprovalDeficit returns `amount - current` and buildApprovalTxIfNeeded feeds that deficit into buildErc20ApprovalTx, which calls ERC-20 approve(spender, deficit). ERC-20 approve SETS the allowance, it does not increment, so approving the deficit under-approves whenever current allowance > 0 (resulting allowance equals deficit, not amount). Confirmed via grep: these two functions have no callers anywhere in packages/sdk/src outside their own file, and are NOT in any index*.ts public export. Every live approval path instead approves the full requiredAmount or maxUint256 (swap SwapProvider.ts:367-371, Aave write.ts:71-76, Morpho blue.ts, lend LendProvider.ts:289), which is correct. So F042 is real but currently unreachable — a trap waiting for the first caller.
- **Exploit/repro:** current allowance = 50, required = 100 => getApprovalDeficit returns 50 => approve(spender, 50) => allowance becomes 50, still below 100. No live caller today, but any future use under-approves.
- **Recommendation:** Either delete getApprovalDeficit + buildApprovalTxIfNeeded as dead code, or fix the semantics to approve `amount` (not the deficit) before any consumer adopts them. Add a unit test asserting the built approval encodes the full required amount.
- **suggestRefactor:** true · **Candidate issue:** #133

### (refines:F043) — passthroughResolver returns recipient addresses un-checksummed (accepts strict:false)
- **Surface:** core-services · **Severity:** low · **Class:** correctness · **Dedup:** refines:F043
- **File:** `packages/sdk/src/services/nameservices/ens/utils.ts:20-25`
- **Detail:** passthroughResolver accepts any value passing `isAddress(r, { strict: false })` (lowercase / mixed-case addresses pass) and returns it cast `as Address` without normalizing via getAddress. The doc for resolveAddress promises a 'checksummed hex Address', and EnsNamespace.getAddress/resolveAddress return getEnsAddress output (checksummed), but the passthrough path (used when no ENS resolver is configured, the default for swap recipients) returns the caller's original casing. Downstream code relying on checksum casing or doing string (not isAddressEqual) comparison against this recipient can mismatch. Same checksum-laxity class as F043 (resolveAddress) but on the default no-ENS swap recipient path (different function). Low: viem encodeFunctionData accepts lowercase, so the on-chain recipient is still correct; the risk is brittle equality/display.
- **Exploit/repro:** `passthroughResolver('0x000000000022d473030f116ddee9f6b43ac78ba3')` returns the lowercase string as Address; a later `quote.recipient === walletAddress` string compare against a checksummed walletAddress fails even though they are the same address.
- **Recommendation:** Normalize the returned address with getAddress(r) in passthroughResolver (and in resolveAddress's early-return at utils.ts:47) so every recipient leaving the resolver is EIP-55 checksummed, matching the documented contract.
- **suggestRefactor:** false · **Candidate issue:** #371

---

## Dedup summary

- **New (24):** F046–F069
- **Refines (16):** F005, F008 (×2), F011, F013 (×2), F023, F028, F029, F030, F031, F035, F037, F039, F041, F042, F043
- **Dup (4):** F009, F010, F023 (wallet-smart getWallet overlaps the wallet-core refines), F035 (wallet-smart sendTokens overlaps the wallet-core refines)
