# Review Pass 03 — Red-Team Adversarial Signing & Calldata Path

**Pass:** 3
**Skill / lens:** red-team adversarial review — "the bytes ARE the intent." Trace every signing/calldata path for places where validated metadata and the signed bytes can diverge, where a recipient/owner/spender is taken on trust, or where an obvious bound/validation is missing on the signing surface.
**Surfaces reviewed:** swap, lend, borrow, wallet-core, wallet-hosted, wallet-smart, core-services
**Standing rules in force:** DeFi codebase; dominant risk = user loses funds or signs a malicious/unintended tx. Findings flag missing-obvious-validation or metadata-vs-bytes divergence, not speculative intent-guessing. RPC-trust is an accepted assumption (recorded info-only when relevant). Permit2 signature payloads count as signing-path surface.

---

## Summary

This pass red-teamed every action's dispatch/calldata path and the wallet signing primitives underneath them. The single dominant theme across all surfaces is a **verbatim-signing seam**: pre-built quotes (swap, borrow) and exported provider methods (lend) carry `execution.transactions` / `routerAddress` / `swapCalldata` / `onBehalfOf` that are signed byte-for-byte, while the only guards in place inspect **metadata fields** (`quote.recipient`, `quote.marketId`, `quote.action`) that are assembled independently of those bytes. A repo-wide grep confirms there is no `decodeFunctionData` / `decodeAbiParameters` anywhere on any of the three dispatch paths. The shared choke point is `executeTransactionBatch` (used by lend, swap, borrow) feeding `wallet.send/sendBatch`, which validate nothing.

**Counts by severity (this pass):** 9 high · 13 medium · 16 low (38 findings total across 6 surfaces).

**New IDs assigned:** F070–F077 (8 new). All remaining findings refine prior IDs (F001/F002/F004/F005/F008/F009/F010/F011/F015/F022/F023/F031/F033/F034/F035/F037/F038/F039/F043/F045/F046/F047/F049/F050/F051/F052/F053/F054/F055/F063/F064/F066/F067/F068).

**Notable highlights:**
- **F070 / F075** — the swap and core-services instances of the verbatim pre-built-quote problem: `routerAddress`+`swapCalldata`+`value` and the shared `QuoteRecipientMismatchError` contract are trusted on metadata alone; an attacker-supplied quote with benign metadata (`recipient = wallet.address`) but malicious calldata is signed verbatim. Swap sibling of borrow F054; maps to open issue #373.
- **F071** — the lend instance: publicly-exported `LendProvider.openPosition/closePosition` encode caller-supplied `walletAddress` verbatim as `onBehalfOf`/`receiver`/`owner`/`to`, never reconciled with the signing wallet on the dispatch path.
- **F072** — `executeTransactionBatch` is the shared verbatim-signing choke point: one calldata-integrity assertion here protects all three actions, and today lend has no recipient guard at all.
- **F073 / F074** — wallet-hosted: react Privy's `signTypedData` cast on the EIP-712/Permit2 signing seam, and the absence of any shared signer-identity reconciliation in the abstract `HostedWalletProvider`.

---

## SWAP

### F070 — Pre-built SwapQuote dispatch signs routerAddress + swapCalldata + value verbatim; only metadata is validated
- **Surface:** swap
- **File:line:** `packages/sdk/src/actions/swap/core/SwapProvider.ts:434-438, 403-428, 440-451`
- **Severity:** high · **Class:** malicious-sign
- **Dedup status:** NEW (assigned F070). Relates to F054 (borrow sibling); not previously captured for swap.
- **Detail:** When a caller hands a pre-built `SwapQuote` to `execute()`, the flow is `execute()` → `validateSwapExecute(quote)` → `executeFromQuote(quote)` → `buildSwapTransactions(quote)`. `validateSwapExecute` (440-451) only inspects metadata: `assetIn/assetOut` (same-asset + allowlist + on-chain), `amountIn/amountOut`, `slippage`, `recipient`. It never decodes or re-derives `quote.execution.swapCalldata`. `executeFromQuote` (434-438) adds exactly one guard on the execution payload: `validateNotZeroAddress(quote.execution.routerAddress)`. Then `buildSwapTransactions` (411-415) builds the swap tx straight from the untrusted fields: `{ to: routerAddress, data: swapCalldata, value }`. There is NO check that `routerAddress` equals the provider's own Universal Router / Velodrome router for `quote.chainId`, and NO check that `swapCalldata` encodes the asset pair/amounts/min-out/deadline the metadata claims. A repo-wide grep for `decodeFunctionData`/`decodeAbiParameters` on the swap execute path returns nothing.
- **Exploit/repro:** Construct a SwapQuote with QUOTE_DISCRIMINATOR, `assetIn=WETH, assetOut=USDC, recipient=myWallet, amountIn=0.1, slippage=0.005` (benign metadata, passes validateSwapExecute + requireQuoteForThisWallet) but `execution.routerAddress = 0xAttacker`, `execution.swapCalldata = transfer-out calldata`, `execution.value = walletEthBalance`. Pass to `wallet.swap.execute(quote)`; SDK signs and broadcasts the attacker tx.
- **Recommendation:** Treat the pre-built-quote path as an untrusted-bytes boundary: (1) assert `routerAddress` equals the provider's known router for `chainId`; (2) re-encode the swap calldata from validated metadata and assert byte-equality, OR always re-encode inside `executeFromQuote`; (3) bound `value` (0 for ERC-20-in, amountInRaw for native-in). Prefer re-encoding.
- **suggestRefactor:** yes · **Candidate issue:** #373

### refines:F046 — Uniswap V4 calldata uses TAKE_ALL with no recipient param; recipient silently dropped
- **Surface:** swap · **File:line:** `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:224-294`
- **Severity:** high · **Class:** fund-loss · **Dedup status:** refines:F046
- **Detail:** `encodeUniversalRouterSwap` builds the V4 action list as `[SWAP_*_SINGLE, SETTLE_ALL, TAKE_ALL]` (254-255, 275-276). TAKE_ALL (0x0f) sends output to `msgSender()` with no recipient argument; there is no TAKE (0x0e), and the `recipient` field of `EncodeSwapParams` (201) is destructured but never used. The plumbed-through `recipient` has zero effect — output always returns to whoever submits. Makes `requireQuoteForThisWallet`'s recipient guard a no-op for Uniswap (F052), and silently mis-routes any `recipient: someOtherAddress`. No WRAP_ETH command — native-in is raw msg.value only.
- **Exploit/repro:** `getQuote({assetIn:WETH, assetOut:USDC, amountIn:1, recipient:0xBob})` from Alice, then Alice executes: USDC lands in Alice's wallet, not Bob's, no error.
- **Recommendation:** Honor recipient via SETTLE/TAKE actions encoding `recipient` into the TAKE param, or reject `recipient !== executing wallet` with a clear error. Do not accept-display-then-ignore a recipient.
- **suggestRefactor:** no · **Candidate issue:** #444

### refines:F047 — Velodrome sets value=amountInRaw for native-in on ALL router types, but universal/CL encoders have no native branch
- **Surface:** swap · **File:line:** `packages/sdk/src/actions/swap/providers/velodrome/VelodromeSwapProvider.ts:194`
- **Severity:** high · **Class:** fund-loss · **Dedup status:** refines:F047
- **Detail:** `_getQuote` computes `value: isNativeAsset(assetIn) ? amountInRaw : 0n` (194) uniformly. Only the direct v2/leaf encoder (`encodeRouterSwap`, routers/v2.ts:253-258) emits `swapExactETHForTokens`. The Universal Router path (`encodeUniversalV2Swap`, 214-237) and the CL path (`encodeCLSwap`, cl.ts:135-164) hard-code `payerIsUser=true` and pull input via `transferFrom` — they never consume msg.value or wrap ETH. On a `routerType:'universal'` chain (or CL pool) a native-ETH-in swap attaches `value=amountInRaw` to a call expecting an ERC-20 transferFrom: the ETH is paid in and the swap reverts (or strands ETH). `_buildApprovals` also short-circuits for native assetIn, so there is no allowance — guaranteeing revert with attached ETH.
- **Exploit/repro:** On a Velodrome universal-router chain, `execute({assetIn: nativeETH, assetOut: USDC, amountIn: 1})`: tx with value=1 ETH + calldata expecting WETH transferFrom (no approval) → revert with 1 ETH attached, or strands ETH.
- **Recommendation:** In universal/CL encoders, reject native-ETH input or emit WRAP_ETH (0x0b) and set route input to WETH. Until supported, gate `value` on router type: only attach native value on the v2/leaf direct-router path.
- **suggestRefactor:** no · **Candidate issue:** none

### refines:F004 — Native-in EXACT-OUTPUT Uniswap swap attaches placeholder value, not amountInMaximum
- **Surface:** swap · **File:line:** `packages/sdk/src/actions/swap/providers/uniswap/UniswapSwapProvider.ts:172, 82-105`
- **Severity:** medium · **Class:** fund-loss · **Dedup status:** refines:F004
- **Detail:** For exact-output native-in, `resolveQuoteDefaults` sets `amountInRaw = parseAssetAmount(assetIn, params.amountIn ?? 1)` (SwapProvider.ts:275) — for exact-output `params.amountIn` is undefined, so `amountInRaw` is a 1-unit placeholder. `_getQuote` then sets `execution.value = isNativeAsset(assetIn) ? (amountInRaw ?? 0n) : 0n` (UniswapSwapProvider.ts:172) = that placeholder. The encoded V4 calldata uses `maxAmountIn = quote.amountInRaw + slippage` in SETTLE_ALL (encoding.ts:271-273, 288). Attaching 1 unit while SETTLE_ALL settles `maxAmountIn` means the router cannot cover the input → revert.
- **Exploit/repro:** `execute({assetIn: nativeETH, assetOut: USDC, amountOut: 1000})`: encoded calldata settles ~0.3 ETH max-in, tx value is 1 wei → revert.
- **Recommendation:** For native-in exact-output, set `execution.value` to the encoded `amountInMaximum`. Centralize native-in value computation so quote `value` and the calldata bound derive from one number.
- **suggestRefactor:** no · **Candidate issue:** none

### refines:F005 — Encoded V4 min-out/max-in recomputed in the encoder with divergent rounding vs computeSlippageBounds
- **Surface:** swap · **File:line:** `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:250-294`
- **Severity:** medium · **Class:** correctness · **Dedup status:** refines:F005 (also sharpens F048)
- **Detail:** `encodeUniversalRouterSwap` recomputes the on-chain slippage bound locally: exact-in `minAmountOut = quote.amountOutRaw * round((1-slippage)*10000)/10000` (251-252); exact-out `maxAmountIn = quote.amountInRaw + quote.amountInRaw * round(slippage*10000)/10000` (271-273). `SwapProvider.computeSlippageBounds` (286-298) independently computes `amountOutMinRaw = amountOutRaw * (10000 - slippageBps)/10000` and surfaces THAT as `amountOutMin`. The two formulas use different rounding (encoder `Math.round` the multiplier; computeSlippageBounds rounds bps then floors via integer division), so the displayed `amountOutMin` is not guaranteed to equal the enforced `minAmountOut` in the signed calldata. Exact-output surfaces no `amountInMaximum` at all (F048).
- **Exploit/repro:** For slippage 0.005 and an odd amountOutRaw, compare `quote.amountOutMin` against the `amountOutMinimum` decoded from the calldata: they differ by the rounding delta; the calldata value binds.
- **Recommendation:** Encode the calldata bound directly from the quote's `amountOutMinRaw`/`amountInMaxRaw` computed once by `computeSlippageBounds`. Surface `amountInMaximum` for exact-output.
- **suggestRefactor:** yes · **Candidate issue:** #318

### refines:F002 — Uniswap _buildApprovals passes quote.recipient as walletAddress (allowance owner)
- **Surface:** swap · **File:line:** `packages/sdk/src/actions/swap/core/SwapProvider.ts:82-105, 365-372`
- **Severity:** medium · **Class:** fund-loss · **Dedup status:** refines:F002
- **Detail:** `UniswapSwapProvider._buildApprovals` constructs ResolvedSwapParams with `walletAddress: quote.recipient` (UniswapSwapProvider.ts:92). That flows into `buildPermit2Approvals`, which uses `params.walletAddress` as the `owner` in on-chain allowance reads (SwapProvider.ts:353, 359) and implicitly assumes the executing signer is that same address. If a quote was generated for `recipient = X` but executed by wallet `Y` (the metadata guard `requireQuoteForThisWallet` only fires on the WalletSwapNamespace path, not the provider/Actions path), the allowance is read against X while Y signs. Harmless on the normal wallet path (recipient==wallet) but couples two distinct roles with no assertion they're equal.
- **Exploit/repro:** Generate a quote with recipient=X via `actions.swap.getQuote`, execute through a provider path with signer Y: allowance sufficiency read against X while Y signs → Y skips a needed approval (revert) or over-approves on the wrong account's state.
- **Recommendation:** Thread the true executing wallet into `_buildApprovals` and use it as allowance owner; use `recipient` only for output routing. Assert `walletAddress === recipient` only where required.
- **suggestRefactor:** yes · **Candidate issue:** #436

### refines:F050 — Permit2 approval expiration independent of swap deadline, 30-day default, max-mode = maxUint160
- **Surface:** swap · **File:line:** `packages/sdk/src/actions/swap/core/SwapProvider.ts:333-392, 374-389`
- **Severity:** medium · **Class:** malicious-sign · **Dedup status:** refines:F050
- **Detail:** `buildPermit2Approvals` builds a Permit2 `approve` (via buildPermit2ApprovalTx, approve.ts:107-130) whose `expiration = now + permit2ExpirationSeconds` (hardcoded 30-day default, SwapProvider.ts:66, 118-125), decoupled from `quote.deadline`. In `approvalMode:'max'` the inner allowance is `maxUint160` (approve.ts:97-102) and the outer ERC-20→Permit2 allowance is `maxUint256`. The net signed authorization: "router may pull up to maxUint160 of token for 30 days" — far broader than the single swap, with no upper bound on `permit2ExpirationSeconds` (F067 notes no uint48 bound).
- **Exploit/repro:** With approvalMode:'max', execute a 0.1 WETH swap: the signed approve authorizes the Universal Router to pull up to maxUint160 WETH for 30 days.
- **Recommendation:** Default the Permit2 sub-approval expiration to the swap deadline (or min(deadline+buffer, cap)), bound `permit2ExpirationSeconds` to uint48 max, surface the granted amount + expiration. For one-shot swaps prefer an exact, deadline-bounded signature.
- **suggestRefactor:** yes · **Candidate issue:** #436

### refines:F052 — requireQuoteForThisWallet only constrains metadata recipient; no-op on dominant paths
- **Surface:** swap · **File:line:** `packages/sdk/src/actions/swap/namespaces/WalletSwapNamespace.ts:40-55, 93-101`
- **Severity:** low · **Class:** correctness · **Dedup status:** refines:F052
- **Detail:** `requireQuoteForThisWallet` enforces `isAddressEqual(quote.recipient, wallet.address)`. But the actual fund destination is baked into `quote.execution.swapCalldata`: Uniswap V4 TAKE_ALL ignores recipient (output → msg.sender), and Velodrome universal/CL encode the `UNIVERSAL_ROUTER_MSG_SENDER` sentinel. The guard only meaningfully binds the v2/leaf direct-router calldata; elsewhere an attacker-supplied quote can carry `recipient = wallet.address` (passing the guard) while the calldata routes elsewhere.
- **Exploit/repro:** Pass a Uniswap quote with recipient=wallet.address but tampered swapCalldata: guard passes, calldata determines the real destination.
- **Recommendation:** Fold into the calldata-integrity fix: re-derive/verify the recipient encoded in `swapCalldata` (or re-encode for the executing wallet).
- **suggestRefactor:** yes · **Candidate issue:** #437

### refines:F001 — Read-only ActionsSwapNamespace.getQuote returns fully-built calldata with sentinel recipient
- **Surface:** swap · **File:line:** `packages/sdk/src/actions/swap/namespaces/BaseSwapNamespace.ts:53-79, 119-142`
- **Severity:** low · **Class:** info · **Dedup status:** refines:F001
- **Detail:** `BaseSwapNamespace.getQuote` (inherited by wallet-less `ActionsSwapNamespace`) resolves `recipient` via `resolveRecipient(params.recipient)` which passes `undefined` down with no recipient; the provider defaults `recipient = UNIVERSAL_ROUTER_MSG_SENDER` (0x..1) and bakes `execution.swapCalldata`. A price-only quote carries executable calldata with a sentinel recipient. If later passed to `provider.execute(quote)` (bypassing WalletSwapNamespace), `validateRecipient(0x..1)` passes (non-zero) and it builds/signs.
- **Exploit/repro:** `actions.swap.getQuote({assetIn, assetOut, amountIn})` (no wallet) returns a quote with recipient=0x..1 and full calldata; `provider.execute(thatQuote)` signs it with no recipient sanity beyond non-zero.
- **Recommendation:** Read-only namespace should omit `execution` (price-only) or stamp a recipient sentinel that provider-level execute() also rejects (mirror requireQuoteForThisWallet inside executeFromQuote). Open issue #435 proposes splitting price quote from executable quote.
- **suggestRefactor:** yes · **Candidate issue:** #435

### refines:F051 — V4 amount/minOut/maxIn encoded into uint128 params with no <= maxUint128 bound check
- **Surface:** swap · **File:line:** `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:257-293`
- **Severity:** low · **Class:** correctness · **Dedup status:** refines:F051
- **Detail:** V4 EXACT_*_SINGLE / CURRENCY_AMOUNT params encode `amountIn/amountOutMinimum/amountOut/amountInMaximum` as uint128 fields. The encoder passes raw bigints to `encodeAbiParameters` with no assertion they fit in uint128. For >18-decimal or ultra-high-supply tokens a value can exceed 2^128 (~3.4e20 base units); viem either throws (DoS) or the encoded value silently differs from intent.
- **Exploit/repro:** Quote a swap of a >18-decimal/ultra-high-supply token where amountInRaw exceeds 2^128.
- **Recommendation:** `assert(value <= maxUint128)` (clear AmountTooLargeError) before encoding any uint128 V4 param.
- **suggestRefactor:** no · **Candidate issue:** none

### refines:F049 — Every Velodrome/Aerodrome quote hard-codes priceImpact: 0
- **Surface:** swap · **File:line:** `packages/sdk/src/actions/swap/providers/velodrome/encoding/helpers.ts:60-83`
- **Severity:** low · **Class:** correctness · **Dedup status:** refines:F049
- **Detail:** `buildSwapPrice` returns `priceImpact: 0` for all Velodrome quotes (v2, leaf, CL). The SwapQuote surfaces this as a real `priceImpact` field. Any consumer guard that warns on high price impact sees 0% for every Velodrome swap and never fires. Uniswap computes a real impact via pool mid-price; Velodrome's flat 0 makes the protective field misleading.
- **Exploit/repro:** Quote a large swap into a thin Velodrome pool: `quote.priceImpact === 0` despite real double-digit impact.
- **Recommendation:** Compute Velodrome impact from reserves/mid-price (v2 getReserves; CL via quoter's sqrtPriceX96After). If infeasible, return `undefined`/NaN, not a literal 0, so guards distinguish "no impact" from "unknown".
- **suggestRefactor:** no · **Candidate issue:** none

### refines:F001 — Provider-level getQuote() skips validateSwapExecute entirely
- **Surface:** swap · **File:line:** `packages/sdk/src/actions/swap/core/SwapProvider.ts:164-167`
- **Severity:** low · **Class:** info · **Dedup status:** refines:F001
- **Detail:** `SwapProvider.getQuote` (164-167) does only `assertChainSupported` before `_getQuote`, which builds full executable calldata. The richer validation (`validateNotSameAsset`, `validateMarketAllowed`, `validateAssetOnChain`, `validateAmountPositiveIfExists`, `validateSlippage`, `validateRecipient`) lives only in `validateSwapExecute`. So a quote produced via getQuote() can encode calldata for a blocklisted pair or out-of-range slippage, then trusted verbatim by the pre-built-quote execute path (which only re-checks metadata).
- **Exploit/repro:** `provider.getQuote({...blocklisted pair...})` returns a fully-built quote; feeding it back to execute() only re-validates metadata, so the blocklist is bypassable.
- **Recommendation:** Apply the same validation surface in getQuote() that execute() applies (allowlist/blocklist, slippage bounds, amount positivity, recipient).
- **suggestRefactor:** yes · **Candidate issue:** #435

---

## LEND

### F071 — LendProvider.openPosition/closePosition encode caller-supplied walletAddress verbatim as onBehalfOf / receiver / owner / to
- **Surface:** lend
- **File:line:** `packages/sdk/src/actions/lend/core/LendProvider.ts:84-118, 195-227`
- **Severity:** high · **Class:** malicious-sign
- **Dedup status:** NEW (assigned F071). Lend instance of the metadata-vs-calldata recipient gap; sibling of borrow F054, not previously in the ledger for lend.
- **Detail:** `LendProvider` and `MorphoLendProvider` are publicly exported from src/index.ts:13. `openPosition`/`closePosition` validate `params.walletAddress` only for zero-address/format (validateWalletAddress, 85, 196) then thread it verbatim into deposit/withdraw calldata as recipient: Aave `supply(asset, amount, onBehalfOf=walletAddress, 0)` (AaveLendProvider.ts:267-272), `depositETH(pool, onBehalfOf=walletAddress, 0)` (229-237), `withdraw(asset, amount, to=walletAddress)` (359-367), `withdrawETH(pool, amount, to=walletAddress)` (314-322), Morpho `deposit(amount, receiver=walletAddress)` and `withdraw(assets, receiver=walletAddress, owner=walletAddress)` (MorphoLendProvider.ts:64-67, 107-114). Nothing on dispatch re-checks the embedded recipient equals the signer (WalletLendNamespace.dispatch → executeTransactionBatch → wallet.send signs raw bytes). The high-level WalletLendNamespace forces `walletAddress: this.wallet.address` (41, 78), but the exported provider methods are a lower-trust surface where an integrator (or a wrapper forwarding a caller-influenced address) can deposit the signing wallet's funds and mint shares to a DIFFERENT onBehalfOf.
- **Exploit/repro:** `const p = new MorphoLendProvider(cfg, cm); p.openPosition({ asset: USDC, amount: 1000, marketId: vault, walletAddress: ATTACKER })` → returns a deposit that pulls USDC from whoever signs but mints vault shares to ATTACKER; the LendTransaction metadata shows only marketId/assetAddress.
- **Recommendation:** Assert the recipient encoded into the resulting calldata equals params.walletAddress, or push the wallet-binding down so providers cannot emit a position tx whose onBehalfOf/receiver/owner/to differs from the signing wallet. At minimum, document that only the WalletLendNamespace path binds recipient to signer.
- **suggestRefactor:** yes · **Candidate issue:** #477

### refines:F008 — buildLendApproval grants ERC-20 (max-mode) allowance for caller asset; openPosition never validates asset vs market underlying
- **Surface:** lend · **File:line:** `packages/sdk/src/actions/lend/core/LendProvider.ts:100-106, 279-291`
- **Severity:** medium · **Class:** fund-loss · **Dedup status:** refines:F008 (also sharpens F053)
- **Detail:** openPosition builds the approval from `position.assetAddress` (= getAssetAddress(params.asset)) and `position.spender` (pool/vault). openPosition NEVER calls validateMarketAsset (only closePosition does, 206). So if params.asset mismatches the market underlying, buildLendApproval (279-291) still emits `approve(callerAsset → spender, resolveErc20ApprovalAmount(mode, amount))`. With approvalMode='max' this grants maxUint256 of the caller's chosen token to the trusted pool/vault BEFORE the deposit runs. The deposit reverts (vault pulls a different token), but the unbounded approval for the WRONG token persists on-chain.
- **Exploit/repro:** `openPosition({ asset: USDC, amount: 1, marketId: <DAI vault>, approvalMode: 'max' })` → approval = `approve(USDC → vault, maxUint256)` + a deposit that reverts; the max USDC allowance remains granted.
- **Recommendation:** Call validateMarketAsset(market, params.asset) inside openPosition (mirroring closePosition) BEFORE building the approval. The market is already fetched in _openPosition (getMarket for APY); reuse it.
- **suggestRefactor:** yes · **Candidate issue:** #334

### refines:F008 — Morpho _openPosition fetches the vault but never compares vaultInfo.asset to params.asset
- **Surface:** lend · **File:line:** `packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts:48-84`
- **Severity:** medium · **Class:** correctness · **Dedup status:** refines:F008
- **Detail:** _openPosition computes assetAddress (53) and fetches vaultInfo via getMarket (59) purely for APY (77). It builds `MetaMorphoAction.deposit(amountWei, walletAddress)` (64) whose ERC4626 deposit(assets, receiver) shape encodes amount + receiver but NOT the asset. The asset actually pulled is whatever the vault's underlying is; the SDK's "USDC was deposited" claim is decoupled from on-chain reality. vaultInfo.asset is available but never asserted equal to params.asset. Combined with the missing validateMarketAsset on open, a caller can pass an asset whose decimals differ from the vault underlying and the amount is mis-scaled by parseAssetAmount. Same structural gap for Aave supply (asset=params.asset is caller-driven, withdraw asset=marketInfo.asset is market-driven) — an open/close asymmetry.
- **Exploit/repro:** `openPosition({ asset: <6-dec token>, amount: 100, marketId: <18-dec-underlying vault> })` → amountWei scaled by 6 decimals into an 18-decimal vault; no exception raised before signing.
- **Recommendation:** Assert vaultInfo.asset (Morpho) / marketInfo.asset (Aave) equals params.asset before encoding deposit calldata and approval. Reuse the already-fetched market.
- **suggestRefactor:** yes · **Candidate issue:** #334

### refines:F011 — Aave _openPosition/_closePosition catch-all rethrows a generic Error, masking allowlist + asset-mismatch signals
- **Surface:** lend · **File:line:** `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts:79-83, 117-119`
- **Severity:** medium · **Class:** correctness · **Dedup status:** refines:F011
- **Detail:** _openPosition rethrows `Failed to open position with <amount> of <symbol>` (79-83); _closePosition rethrows `Failed to close position` (117-119). Inside, getMarket → getReserve throws MarketNotAllowedError (sdk.ts:85-90), getAssetAddress throws NativeAssetAddressError / AssetNotSupportedOnChainError. All precise, security-relevant signals are flattened into one opaque string. A caller cannot distinguish "you tried to lend into a non-allowlisted market" from an RPC hiccup.
- **Recommendation:** Rethrow named errors unchanged (or via mapSdkError); only wrap genuinely unknown errors. Let MarketNotAllowedError, NativeAssetAddressError, AssetNotSupportedOnChainError, ChainNotSupportedError propagate.
- **suggestRefactor:** yes · **Candidate issue:** #474

### refines:F009 — Lend open/close never reject non-positive, NaN, or non-finite amount
- **Surface:** lend · **File:line:** `packages/sdk/src/actions/lend/core/LendProvider.ts:84-90, 195-218`
- **Severity:** low · **Class:** correctness · **Dedup status:** refines:F009
- **Detail:** openPosition (90) and closePosition (215-218) call parseAssetAmount(asset, params.amount) with no positivity/finiteness check; parseAssetAmount → parseDecimalAmount → parseUnits(amount.toString(), decimals) (assets.ts:16-18). The swap sibling validates positivity/finiteness; lend does not. A 0 amount yields a still-signable 0 deposit/withdraw (gas wasted); a non-integer/scientific-notation number throws deep inside viem with an opaque message.
- **Recommendation:** Add a shared positive-finite-amount guard (amount > 0 and Number.isFinite) at the top of openPosition/closePosition, throwing InvalidParamsError before any calldata is built.
- **suggestRefactor:** no · **Candidate issue:** #303

### refines:F010 — marketBlocklist declared in the type but no lend path enforces it
- **Surface:** lend · **File:line:** `packages/sdk/src/actions/lend/core/LendProvider.ts:200-201`
- **Severity:** low · **Class:** info · **Dedup status:** refines:F010
- **Detail:** LendProviderConfig declares `marketBlocklist?: LendMarketConfig[]` (types/lend/base.ts:200-201), but validateMarketAllowed (234-257) only consults marketAllowlist; no code path reads or enforces marketBlocklist (grep confirms). An integrator who configures a blocklist gets silent no-op enforcement.
- **Recommendation:** Either enforce marketBlocklist in validateMarketAllowed or remove the field so integrators do not rely on a non-existent guard.
- **suggestRefactor:** no · **Candidate issue:** #334

---

## BORROW

### refines:F054 — Pre-built borrow quote dispatch signs execution.transactions verbatim; guards check only metadata
- **Surface:** borrow · **File:line:** `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:207-247`
- **Severity:** high · **Class:** malicious-sign · **Dedup status:** refines:F054 (sharpens the original into a concrete exploit)
- **Detail:** validateQuoteForThisWallet (207-222) is the ONLY gate before dispatch and inspects four metadata fields: quote.recipient (vs wallet), quote.action, quote.expiresAt, quote.marketId (allowlist). dispatch() (232-247) passes quote.execution.transactions straight to executeTransactionBatch, which signs/sends verbatim (no decodeFunctionData anywhere on dispatch). The metadata fields are assembled INDEPENDENTLY of the calldata (assembleBorrowQuote, core/quote.ts:42-62), while onBehalfOf/receiver/to/spender/amount are baked into transactions[].data. An adversary sets quote.recipient = wallet.address (passing line 211) and an allowlisted quote.marketId (passing 220) while transactions[].data encodes a Morpho borrow with receiver=attacker, or an ERC-20 approve to an attacker spender. The spec test (WalletBorrowNamespace.spec.ts:235-250) names the threat yet exercises only the metadata recipient with opaque `0xdeadbeef` calldata — the guard provably does not constrain the bytes.
- **Exploit/repro:** Build a quote via `actions.borrow.getQuote({action:'open', market, walletAddress})`; keep the allowlisted marketId, set recipient = victimWallet.address, replace execution.transactions[].data with `encodeMorphoBorrow(..., onBehalf=victim, receiver=attacker)` (or an approve to an attacker spender). Call `victimWallet.borrow.openPosition(tamperedQuote)`: all four metadata checks pass, the wallet signs attacker-routed bytes.
- **Recommendation:** Decode each leg against the known borrow/approve ABIs for the resolved allowlisted provider+market and assert: every leg's `to` is the expected protocol contract (or an approve whose spender is one of those); the borrow/withdraw onBehalfOf/receiver/to equals wallet.address; encoded amounts match quote.borrowAmountRaw/collateralAmountRaw. Alternatively, do not accept opaque pre-built quotes on the wallet path — always re-quote from raw params (the raw path already does this safely). Mirror swap #373.
- **suggestRefactor:** yes · **Candidate issue:** #373

### refines:F054 — validateBorrowMarketIdInAnyAllowlist proves marketId is allowlisted but never binds it to the calldata target
- **Surface:** borrow · **File:line:** `packages/sdk/src/actions/borrow/core/validations.ts:83-102`
- **Severity:** medium · **Class:** malicious-sign · **Dedup status:** refines:F054
- **Detail:** validateBorrowMarketIdInAnyAllowlist (83-102, called from WalletBorrowNamespace.ts:220) returns as soon as ANY provider's allowlist contains quote.marketId. It does not return/use the matched BorrowMarketConfig, and dispatch never consults the config's protocol addresses to check transactions[].to. A tampered quote can present a legitimate allowlisted marketId while the approval leg grants an allowance to an attacker spender and the action leg calls an attacker contract. The sibling write path (resolveTrustedBaseParams, BorrowProvider.ts:309-321) DOES resolve marketId to a trusted config and rebuilds calldata; the pre-built-quote dispatch skips that trust resolution.
- **Exploit/repro:** marketId = an allowlisted Morpho market (passes loop), execution.transactions = [approve(loanToken, spender=ATTACKER, max), attackerContract.call()], recipient = wallet.address. Dispatch passes; the wallet signs an unlimited approval to the attacker.
- **Recommendation:** Have validateBorrowMarketIdInAnyAllowlist return the matched trusted BorrowMarketConfig and use it in dispatch to assert every leg's `to` is that market's protocol contract (or an approve spender equal to it).
- **suggestRefactor:** yes · **Candidate issue:** #334

### refines:F054 — Borrow receipt envelope reports amounts/positionAfter copied from quote metadata, not from executed calldata
- **Surface:** borrow · **File:line:** `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:238-246`
- **Severity:** low · **Class:** correctness · **Dedup status:** refines:F054
- **Detail:** dispatch() builds the BorrowReceipt by copying borrowAmount = quote.borrowAmountRaw, collateralAmount = quote.collateralAmountRaw, marketId = quote.marketId, positionAfter = quote.positionAfter straight from the (possibly tampered or stale) quote. These are presented as the on-chain result. The dispatch path never re-derives them from the signed calldata or a post-execution read. Even absent tampering, a max repay/close uses live debt while the metadata is a quote-time snapshot, so positionAfter/borrowAmount can diverge.
- **Exploit/repro:** Dispatch any max-repay quote: receipt.borrowAmount equals the quote-time snapshot while the on-chain repay clears live (larger) debt.
- **Recommendation:** Derive reported amounts from the executed calldata or a post-dispatch position read, or clearly mark positionAfter/amounts as projected-at-quote-time.
- **suggestRefactor:** no · **Candidate issue:** none

### refines:F015 — Borrow amounts have no positivity/finiteness validation
- **Surface:** borrow · **File:line:** `packages/sdk/src/actions/borrow/core/internalParams.ts:129-140`
- **Severity:** medium · **Class:** correctness · **Dedup status:** refines:F015
- **Detail:** toAmountWei (129-132) returns amount.amountRaw verbatim for the `{ amountRaw: bigint }` path with no checks; parseDecimalAmount (assets.ts:17-19) feeds amount.toString() to parseUnits with no positivity/finiteness guard. The swap path validates amount positivity; borrow does not. A negative amountRaw throws an opaque viem error; a 0n borrow/collateral encodes a reverting no-op leg; a NaN throws deep in parseUnits.
- **Exploit/repro:** `wallet.borrow.openPosition({ market, borrowAmount: { amountRaw: 0n } })` builds a borrow(0) leg that reverts after burning gas; `{ amountRaw: -1n }` throws an opaque encoder error.
- **Recommendation:** Add a positivity/finiteness check at the borrow param boundary (reject amountRaw <= 0n and non-finite decimal), matching the swap validateAmount sibling.
- **suggestRefactor:** no · **Candidate issue:** #303

### refines:F055 — safeCeilingLtv surfaced as a safety value but never enforced
- **Surface:** borrow · **File:line:** `packages/sdk/src/actions/borrow/core/quote.ts:54`
- **Severity:** low · **Class:** correctness · **Dedup status:** refines:F055
- **Detail:** assembleBorrowQuote sets safeCeilingLtv = positionAfter.maxLtv * (1 - healthBufferPct) (54) and every quote carries it, implying a guardrail. But no borrow path compares the projected positionAfter LTV against safeCeilingLtv before returning the quote. The field reads as a protective ceiling the SDK honors, but it is purely informational; a caller trusting it can sign a borrow that lands at a near-liquidation LTV.
- **Exploit/repro:** Open a position whose projected LTV exceeds maxLtv*(1-healthBufferPct): the quote returns with that same safeCeilingLtv field and dispatches normally.
- **Recommendation:** Either enforce projected LTV <= safeCeilingLtv on open/borrow/withdrawCollateral (throw unless an explicit override flag is set), or rename/document the field as advisory-only.
- **suggestRefactor:** no · **Candidate issue:** none

### refines:F053 — Morpho max-repay/close in 'max' mode grants unbounded maxUint256 loan-token allowance to Morpho Blue
- **Surface:** borrow · **File:line:** `packages/sdk/src/actions/borrow/providers/morpho/blue.ts:165-176`
- **Severity:** low · **Class:** correctness · **Dedup status:** refines:F053
- **Detail:** buildMorphoMaxLoanApproval (165-176) issues `approve(loanToken, MorphoBlue, maxUint256)` for shares-based (max) repay/close in approvalMode 'max' — a standing unlimited allowance to the Morpho Blue singleton held after the action. The exact-mode sibling (buildMorphoLoanApproval) bounds the approval to liveDebtAssetsWei. The default/misconfigured 'max' mode leaves a residual unlimited allowance (larger blast radius than Permit2-scoped/exact).
- **Exploit/repro:** `wallet.borrow.repay({ market, amount: { max: true } })` with approvalMode 'max' emits approve(loanToken, MorphoBlue, maxUint256); after repay the unlimited allowance persists.
- **Recommendation:** Document that 'max' mode grants a standing unlimited allowance; default borrow approvals to exact (or Permit2 where available) so a residual unlimited allowance is opt-in.
- **suggestRefactor:** no · **Candidate issue:** #133

---

## WALLET-CORE

### F072 — executeTransactionBatch is the shared verbatim-signing choke point with zero calldata validation; lend guards nothing
- **Surface:** wallet-core
- **File:line:** `packages/sdk/src/wallet/core/utils/executeTransactionBatch.ts:25-37`
- **Severity:** high · **Class:** malicious-sign
- **Dedup status:** NEW (assigned F072). Generalizes F054 (borrow-only) into the shared dispatch seam; not previously captured at this location.
- **Detail:** executeTransactionBatch(wallet, transactions, chainId) is the single dispatch helper used by WalletLendNamespace, WalletSwapNamespace, WalletBorrowNamespace. It does no validation beyond non-empty: it forwards the caller-supplied TransactionData[] straight to wallet.send/sendBatch, which sign and broadcast the raw bytes. The only upstream guards are metadata checks: WalletBorrowNamespace.validateQuoteForThisWallet (211) and WalletSwapNamespace.requireQuoteForThisWallet (94) compare quote.recipient (a sidecar field) to wallet.address — they never decode transactions[i].to / .data / .value. WalletLendNamespace.dispatch (97) calls executeTransactionBatch with NO recipient guard whatsoever. One calldata-integrity assertion here (or in each namespace before dispatch) catches all three actions.
- **Exploit/repro:** Build a BorrowQuote/SwapQuote with recipient=userWallet but execution.transactions=[{to: collateralToken, data: encode(transfer(attacker, amount)), value: 0n}]. validateQuoteForThisWallet passes (recipient matches), executeTransactionBatch signs it, funds move to attacker.
- **Recommendation:** Add a calldata-integrity reconciliation at the dispatch seam (or in each namespace's validate-before-dispatch): for each leg, decode .to and the recipient/onBehalfOf actually encoded in .data and confirm it equals wallet.address (and .value matches the quoted native amount). At minimum, give lend the same metadata recipient guard borrow/swap already have. Treat executeTransactionBatch as security-relevant, not a thin 1-vs-N switch.
- **suggestRefactor:** yes · **Candidate issue:** #373

### refines:F061 — EOAWallet.send/sendBatch and DefaultSmartWallet.send/sendBatch are open-ended verbatim-signing surfaces with no guard
- **Surface:** wallet-core · **File:line:** `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:62-100`
- **Severity:** medium · **Class:** malicious-sign · **Dedup status:** refines:F061
- **Detail:** send/sendBatch on both EOAWallet (62, 90) and DefaultSmartWallet (217, 261) accept arbitrary TransactionData (to/data/value) and sign+broadcast with no validation: no checksum/zero-address check on `to`, no value sanity, no chainId-vs-calldata cross-check, no integrator allowlist or per-tx confirmation hook. These are public SDK wallet methods already called with raw to/data by integrators (demo/backend/src/services/faucet.ts:90, usdcDemo.ts:14, demoMagic/aaveDemoMagic.ts:72, demoAssetMinting.ts:61). A typo'd / address-poisoned / model-hallucinated `to` is signed with nothing to catch it.
- **Exploit/repro:** Agent computes a recipient; an off-by-one/poisoned address lands in tx.to; wallet.send signs and broadcasts; no SDK-level check rejects it.
- **Recommendation:** Add an optional integrator-supplied guard hook (validateTransaction(tx, chainId) callback or address allowlist) before sign/broadcast, plus a minimal built-in isAddress(to) check. Keep send/sendBatch as the escape hatch; surface explicit safe helpers (transfer/contractCall) so raw-bytes signing is the exception.
- **suggestRefactor:** yes · **Candidate issue:** #414

### refines:F023 — Retrieved smart wallet signs UserOps against a caller-asserted owner set/index never reconciled on-chain
- **Surface:** wallet-core · **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:196-207`
- **Severity:** medium · **Class:** malicious-sign · **Dedup status:** refines:F023
- **Detail:** getCoinbaseSmartAccount builds the signing account from this.deploymentAddress, this.signers, this.signerIndex with no on-chain read of the actual owners. When a wallet is obtained via getSmartWallet({walletAddress, signer}) without `signers`, `signers` defaults to [signer.address] and signerIndex=0 (122, ensureLocalAccountSigner). The UserOp signature embeds ownerIndex; it is built for slot 0 of an asserted single-owner set against an address whose real owner layout is never verified. Either every UO reverts (signer not owner-0) or the SDK produces signatures for ANY walletAddress paired with ANY signer, with no check the signer controls that address.
- **Exploit/repro:** getSmartWallet({signer, walletAddress: someOtherWallet}) returns a wallet; .send signs a UO with ownerIndex 0 against someOtherWallet and broadcasts; reverts on-chain or, if indices align, signs for an address the caller never verified control of.
- **Recommendation:** On getWallet/getSmartWallet for an existing address, resolve signerIndex from chain (findSignerIndexOnChain) and/or assert the signer is a current owner before returning a signing wallet.
- **suggestRefactor:** yes · **Candidate issue:** #163

### refines:F037 — send/sendBatch call prepareUserOperation then sendUserOperation forwarding only suffixed callData/initCode; gas+paymaster dropped
- **Surface:** wallet-core · **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:224-236`
- **Severity:** medium · **Class:** correctness · **Dedup status:** refines:F037
- **Detail:** In sendBatch (224-236) and send (268-281), prepareUserOperation({calls, paymaster:true}) → sendUserOperation({callData: appendAttributionSuffix(uo.callData), initCode: appendAttributionSuffix(uo.initCode), paymaster:true}). Only callData/initCode are forwarded — all gas limits, fee fields, and paymaster sponsorship from the first prep are discarded, so viem re-runs prepareUserOperation inside sendUserOperation. (1) The first prep estimated gas / obtained sponsorship for the UN-suffixed callData, while the bytes actually signed carry the 16-byte attribution suffix; (2) the explicit prep is waste and masks that the suffix is never validated against the executeBatch decoder.
- **Exploit/repro:** Configure attributionSuffix; send a tx. prepareUserOperation gas-estimates callData=X; sendUserOperation signs/submits callData=X||suffix. Under a strict paymaster the sponsorship validates X, not X||suffix.
- **Recommendation:** Append the suffix INSIDE the single prepare step (custom callData or middleware) so exactly one prepare runs over the final suffixed bytes and gas/paymaster data corresponds to what is signed.
- **suggestRefactor:** yes · **Candidate issue:** #456

### refines:F022 — EOA send/sendBatch never pin chainId into the signed tx; calldata-vs-chain mismatch signed silently
- **Surface:** wallet-core · **File:line:** `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:62-100`
- **Severity:** low · **Class:** correctness · **Dedup status:** refines:F022
- **Detail:** send builds a walletClient for `chainId` and calls sendTransaction(transactionData) where TransactionData has only to/data/value — no chainId. viem signs for the wallet client's chain. The dispatch helpers pass a chainId derived from the quote, but there is no assertion the calldata/approvals were encoded for that same chain, and send/sendBatch accept any SupportedChainId with no cross-check (distinct from the F022 config-membership gap). A quote whose transactions target chain A dispatched with chainId B signs approvals/transfers against chain B addresses.
- **Exploit/repro:** Dispatch a quote built for Base with chainId=OP; the same USDC-style address exists on both; approval/transfer is signed on OP routing to whatever lives at that address.
- **Recommendation:** Carry the intended chainId on the quote/transaction and assert it equals the dispatch chainId before signing; reject multi-chain batches. Combine with the F022 config-membership check.
- **suggestRefactor:** no · **Candidate issue:** none

### refines:F035 — sendTokens does not validate recipientAddress is a well-formed address (falsy-only)
- **Surface:** wallet-core · **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:512-561`
- **Severity:** low · **Class:** malicious-sign · **Dedup status:** refines:F035
- **Detail:** sendTokens checks only `if (!recipientAddress)` (518) then encodes recipientAddress as native-transfer `to` (540) or the first arg of erc20 transfer (553). No isAddress, no checksum, and tokenAddress is force-cast `as Address` (557). A non-empty but invalid/typo'd/poisoned address passes the guard and is committed into signed calldata.
- **Exploit/repro:** sendTokens(1, USDC, chainId, '0xdeadBEEF...truncated') — non-empty string passes, encoded into transfer(to,amount), signed, broadcast.
- **Recommendation:** Add isAddress(recipientAddress) (and getAddress checksum-normalize) before encoding; validate the resolved token Address rather than casting; reject non-finite/mis-scaled amounts (ties F036/F041).
- **suggestRefactor:** no · **Candidate issue:** #379

### refines:F023 — getSmartWallet derives address from deploymentSigners but signs with a separate, unreconciled signers array
- **Surface:** wallet-core · **File:line:** `packages/sdk/src/wallet/core/providers/WalletProvider.ts:97-131`
- **Severity:** low · **Class:** correctness · **Dedup status:** refines:F023
- **Detail:** WalletProvider.getSmartWallet computes walletAddress from deploymentSigners (getWalletAddress, 121) but constructs the signing wallet with the DIFFERENT optional `signers` param (getWallet, 126-130). deploymentSigners (address derivation) and signers (owner bytes / ownerIndex for the signature) are never checked for consistency. A caller can pass deploymentSigners=[A,B] but signers=[signer], producing a wallet bound to the correct address but signing as a single-owner set with ownerIndex 0. Construction-time root of the F023 reconciliation gap, reachable via the normal public API.
- **Exploit/repro:** getSmartWallet({signer:A, deploymentSigners:[A,B]}) — address is the 2-owner wallet, but signers defaults to [A], signerIndex 0; UO signature built for a single-owner layout against the 2-owner address.
- **Recommendation:** When both deploymentSigners and signers are supplied, assert they describe the same owner set (or derive signers from deploymentSigners). When only walletAddress is given, require signers or resolve owners on-chain.
- **suggestRefactor:** yes · **Candidate issue:** #163

### refines:F063 — appendAttributionSuffix mutates bundler-returned callData/initCode with no inert-suffix assertion and no v0.7 guard
- **Surface:** wallet-core · **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:594-598`
- **Severity:** low · **Class:** correctness · **Dedup status:** refines:F063
- **Detail:** appendAttributionSuffix concatenates a 16-byte suffix onto callData/initCode after prepareUserOperation (231-234, 276-279, 595-597). The suffixed callData is hashed into userOpHash and signed; this relies on the on-chain decoder silently ignoring trailing bytes, with no assertion of that property and no test that a suffixed call routes identically. Combined with F059 (initCode absent on EntryPoint v0.7, so the initCode branch is dead) and F063/F065 (initCode mutation / missing length assert), the attribution feature appends to security-critical signed calldata with no guard that the suffix is inert.
- **Exploit/repro:** n/a direct exploit; correctness risk if a future account impl strict-decodes calldata length, in which case every suffixed UO reverts.
- **Recommendation:** Assert/document that the account's call decoder ignores trailing bytes; add a test that a suffixed call produces identical on-chain effects; gate the suffix behind the call encoding; drop the dead initCode branch for v0.7.
- **suggestRefactor:** no · **Candidate issue:** none

---

## WALLET-HOSTED

### F073 — React Privy createSigner re-wraps an already-valid viem account through toAccount and casts signTypedData (EIP-712 seam)
- **Surface:** wallet-hosted
- **File:line:** `packages/sdk/src/wallet/react/wallets/hosted/privy/utils/createSigner.ts:22-29`
- **Severity:** medium · **Class:** malicious-sign
- **Dedup status:** NEW (assigned F073). Distinct from F030/F062 (Dynamic raw-hash sign / connector cast); this is the react Privy typed-data path.
- **Detail:** toViemAccount({ wallet }) already returns a fully-formed viem account from Privy. Instead of returning it, createSigner re-assembles a fresh LocalAccount via toAccount({ address, sign, signMessage, signTransaction, signTypedData }), and signTypedData is the ONLY member requiring a cast: `privyViemAccount.signTypedData as CustomSource['signTypedData']` (27-28). The other three sign methods forward uncast (structurally matching CustomSource); signTypedData does not. A cast is a compile-time silencer, not a runtime adapter: if Privy's signTypedData has a different param/generic shape, viem invokes it with the argument object it builds for typed-data signing and Privy may receive a differently-shaped payload. signTypedData is exactly the EIP-712 / Permit2 / 4337-userOp-typed-data signing surface, with no test asserting the produced signature recovers to the wallet's address.
- **Exploit/repro:** Construct a react PrivyWallet, request an EIP-712 typed-data signature (e.g. a Permit2 PermitSingle). The casted signTypedData is invoked with viem's typed-data argument object; if Privy's signature differs from viem's CustomSource contract, the recovered signer/permit is wrong. No test asserts the recovered signer for this path.
- **Recommendation:** Return the genuine Privy viem account directly (`return privyViemAccount`) rather than re-wrapping; this removes the cast and preserves Privy's correct-by-construction signTypedData plus dropped account capabilities. If a re-wrap is genuinely required, add a unit/integration test that signs a representative EIP-712 payload and asserts the signature recovers to the account address.
- **suggestRefactor:** yes · **Candidate issue:** none

### F074 — No shared signer-identity reconciliation seam in the abstract HostedWalletProvider; each provider trusts a caller-/vendor-supplied .address verbatim
- **Surface:** wallet-hosted
- **File:line:** `packages/sdk/src/wallet/core/providers/hosted/abstract/HostedWalletProvider.ts:45-56`
- **Severity:** medium · **Class:** malicious-sign
- **Dedup status:** NEW (assigned F074). Structural/refactor framing across all hosted providers; relates F029 but is the shared-seam recommendation, not previously in the ledger.
- **Detail:** The abstract HostedWalletProvider defines toActionsWallet and createSigner with no post-construction invariant that the produced LocalAccount.address is the address actually controlled by the signing credential. Each concrete provider re-implements (or omits) this independently, producing an inconsistent trust boundary right before the verbatim-signing surface: node Privy stores a caller-supplied address and signs via walletId with no reconciliation (F029); node Privy createSigner skips even the getAddress its own toActionsWallet applies (F028); Turnkey trusts an optional ethereumAddress override blindly (F031); Turnkey trusts signWith unvalidated (this pass); only Dynamic and react Privy/Turnkey happen to derive address from the signer. The resulting signer.address is consumed as (a) the EOAWallet.send/sendBatch from-account, (b) the smart-wallet owner set, (c) lend onBehalfOf / approval owner. Because send/sendBatch sign whatever they are handed, a wrong .address upstream is never caught downstream.
- **Exploit/repro:** Any provider whose .address is not reconciled (node Privy caller address, Turnkey ethereumAddress override) yields a wallet that reports/operates under address B while signing with key A. send/sendBatch and smart-wallet owner derivation accept B verbatim; funds move from A while the position/owner is credited to B.
- **Recommendation:** Add a shared reconciliation step in the abstract HostedWalletProvider (or a common util) that, after the signer is built, asserts signer.address equals the credential's true on-chain/vendor-reported address (fetch-by-walletId for Privy; query-by-signWith for Turnkey) and throws on mismatch before the wallet is usable. Route every concrete provider through it so the invariant cannot be silently dropped by a new provider.
- **suggestRefactor:** yes · **Candidate issue:** none

### refines:F031 — Turnkey signWith (the key-selector) forwarded to createAccount with zero validation in node and react
- **Surface:** wallet-hosted · **File:line:** `packages/sdk/src/wallet/node/wallets/hosted/turnkey/utils/createSigner.ts:25-31`
- **Severity:** low · **Class:** malicious-sign · **Dedup status:** refines:F031
- **Detail:** createSigner destructures `signWith` and passes it straight into @turnkey/viem createAccount with no non-empty/format check (node 25-31, react 22-28). signWith selects WHICH Turnkey key signs every value-moving transaction. Prior F031 focused on the optional ethereumAddress override; signWith is more load-bearing because it picks the signing key itself, yet is equally unguarded. An empty/whitespace value, or one belonging to a different key, is accepted; the resulting LocalAccount.address (when ethereumAddress omitted) and every signature derive from whatever key Turnkey resolves.
- **Exploit/repro:** createSigner({ client, organizationId, signWith: '' }) or signWith pointing at an unintended key constructs a signer with no error; downstream send/sendBatch sign with whatever key Turnkey resolves.
- **Recommendation:** Reject obviously-invalid signWith at construction: assert non-empty trimmed string, and when in address form run it through isAddress/getAddress. Document that signWith selects the signing key.
- **suggestRefactor:** no · **Candidate issue:** none

### refines:F033 — React hosted registry validateOptions are unconditional `return true`; no centralized validation choke point
- **Surface:** wallet-hosted · **File:line:** `packages/sdk/src/wallet/react/providers/registry/ReactHostedWalletProviderRegistry.ts:24-26,41-43,58-60`
- **Severity:** low · **Class:** info · **Dedup status:** refines:F033
- **Detail:** All three react validateOptions guards (dynamic, privy, turnkey) `return true` because ReactOptionsMap values are undefined (no build-time options). The only place caller-supplied signing inputs (Dynamic wallet handle, Privy connectedWallet, Turnkey client/organizationId/signWith/ethereumAddress) are checked is the per-call toActionsWallet/createSigner methods, which under-validate. Confirms there is no centralized validation choke point on the react signing path; mirrors node F033's truthiness-only validateOptions.
- **Exploit/repro:** No exploit; documents that all signing-input validation must live in the per-provider toActionsWallet/createSigner paths.
- **Recommendation:** Leave validateOptions as-is (react construction options are genuinely empty), but enforce the address/key-selector reconciliation in toActionsWallet/createSigner per the shared-seam recommendation (F074).
- **suggestRefactor:** no · **Candidate issue:** none

---

## WALLET-SMART

### refines:F061 — send/sendBatch are unconstrained verbatim-signing primitives: no recipient allowlist, value cap, or calldata sanity
- **Surface:** wallet-smart · **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:217-294`
- **Severity:** high · **Class:** malicious-sign · **Dedup status:** refines:F061 (smart-wallet umbrella; same control as wallet-core F072/refines:F061)
- **Detail:** send() and sendBatch() take arbitrary TransactionData, wrap it into the smart-account callData via prepareUserOperation, append the attribution suffix, and sign+broadcast a UserOperation with NO validation: `to` is never checked for zero-address/EOA-vs-contract/allowlist; `value` is never bounded; `data` is never inspected. Unlike the swap/lend/borrow namespaces (which at least re-derive calldata from validated params), this is the lowest-level signing primitive and is fully open-ended. The smart wallet is the primary agent-funds path and is uncovered by any sibling guard.
- **Exploit/repro:** Caller passes `{ to: lookAlikePoisonedAddress, value: walletBalance, data: '0x' }` to send(); prepareUserOperation wraps it into execute(target,value,data); the op is signed and broadcast; funds leave to the attacker address.
- **Recommendation:** Add a minimal non-intent-guessing floor to send/sendBatch before prepareUserOperation: reject `to === zeroAddress`, reject non-address `to` (isAddress), reject negative `value`. Do NOT add refuse-to-sign heuristics. Expose explicit safe helpers (transfer/approve) and document send/sendBatch as the raw escape hatch.
- **suggestRefactor:** yes · **Candidate issue:** none

### refines:F037 — send/sendBatch sign the re-prepared op, not the prepared one; second prepare can diverge from the inspected op
- **Surface:** wallet-smart · **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:224-236,266-281`
- **Severity:** high · **Class:** correctness · **Dedup status:** refines:F037
- **Detail:** `const uo = await prepareUserOperation({account, calls, paymaster:true})` then `sendUserOperation({account, callData: appendAttributionSuffix(uo.callData), initCode: ..., paymaster:true})`. Because sendUserOperation is NOT given nonce/gas/fees/paymasterData from `uo`, viem internally calls prepareUserOperation AGAIN. The two prepares are independent RPC round-trips: nonce, gas, fees, and paymaster sponsorship can differ (nonce consumed by a concurrent op; paymaster policy flips). The first prepared op (which a caller might inspect/log) is discarded; the actually-signed op is the second. The only field carried verbatim from pass 1 is the suffix-mutated callData; everything else is recomputed, with no re-check that pass-2 callData == pass-1 suffixed callData.
- **Exploit/repro:** Concurrent op consumes nonce N between the two prepares; pass-2 prepares nonce N+1 with re-estimated gas; the op the user "saw" is never the op signed. Under a paymaster-policy flip between passes, sponsorship silently changes.
- **Recommendation:** Pass the full prepared UserOperation through to sendUserOperation (spread `...uo` then override callData/initCode with suffixed versions), so the signed op is exactly the prepared+suffixed op and no second prepare runs. Fixes the double-RPC cost in F037/#456.
- **suggestRefactor:** yes · **Candidate issue:** #456

### refines:F063 — appendAttributionSuffix mutates the SIGNED callData/initCode with no decode-safe assertion for the wrapping ABI
- **Surface:** wallet-smart · **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:231-234,277-279,594-598`
- **Severity:** medium · **Class:** correctness · **Dedup status:** refines:F063
- **Detail:** appendAttributionSuffix concatenates a 16-byte suffix onto uo.callData (the ABI-encoded execute/executeBatch call) and uo.initCode. For standard ABI decoding trailing bytes are typically ignored — but this is an UNVERIFIED assumption baked into the signing path: no check the wrapping function tolerates trailing bytes, no EntryPoint version check (v0.7 returns factory/factoryData, not initCode — F059), no assertion the suffix is exactly the configured 16 bytes at this call site (isValidAttributionSuffix runs only in the constructor). If a future account impl or non-Coinbase wrapper strict-decodes calldata length, the suffix turns a valid call into a revert; if the wrapped data ends in a dynamic tail whose offset math the consumer recomputes from total length, the suffix shifts it.
- **Exploit/repro:** Swap the account to an EntryPoint v0.7 / non-Coinbase wrapper that strict-length-decodes; the unconditionally-appended suffix makes every send revert.
- **Recommendation:** Gate suffix appending on a known-safe wrapping ABI/EntryPoint version, assert the suffix length at the append site, add a test that decodes suffixed execute/executeBatch back to the original (target,value,data). For v0.7, append to factoryData (not the absent initCode) or document attribution is unsupported there.
- **suggestRefactor:** yes · **Candidate issue:** none

### refines:F039 — removeSigner derives index and ownerBytes independently; a stale/wrong index can revert or remove the wrong owner
- **Surface:** wallet-smart · **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:390-411`
- **Severity:** medium · **Class:** correctness · **Dedup status:** refines:F039
- **Detail:** removeSigner resolves resolvedSignerIndex (caller-supplied OR findSignerIndexOnChain) and separately computes signerBytes = formatPublicKey(getSignerPublicKey(signer)), then calls removeOwnerAtIndex(index, signerBytes). When signerIndex is caller-supplied it is NOT cross-checked against the on-chain owner at that index. The contract reverts on WrongOwnerAtIndex if owner-at-index != ownerBytes, so a wrong index typically reverts — but the adversarial case: a stale index that, after a prior removal shifted indices (owners stored by absolute index with gaps), now points at a DIFFERENT live owner whose bytes the caller also controls/guesses, or the lookup races a concurrent add/remove. Combined with removeSigner being able to remove the only LocalAccount this client can sign with (F039), an agent can brick its own signing authority or remove a co-signer it should not.
- **Exploit/repro:** removeSigner(coSigner, chainId, staleIndex) where staleIndex was valid before an intervening removal; the index now resolves to a different live owner; if bytes happen to match, the wrong owner is removed.
- **Recommendation:** When signerIndex is supplied, read ownerAtIndex(index) on-chain and assert it equals signerBytes before building the call; ensure the lookup and send are not separated by an awaitable that could let owners shift. Guard against removing the last owner / the active signing LocalAccount.
- **suggestRefactor:** no · **Candidate issue:** #163

### refines:F023 — getCoinbaseSmartAccount signs with ownerIndex from caller-supplied signers array order, never reconciled with on-chain owner ordering
- **Surface:** wallet-smart · **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:196-207,76-87,122`
- **Severity:** high · **Class:** correctness · **Dedup status:** refines:F023
- **Detail:** signerIndex is computed by ensureLocalAccountSigner → findSignerInArray over the caller-supplied `signers` array, and passed straight to toCoinbaseSmartAccount as ownerIndex, which the contract uses to select which owner slot the signature corresponds to during validateUserOp. If the caller passes signers in a different order than the on-chain ownerAtIndex layout (e.g. retrieved wallet via getWallet with signers omitted → defaults to [signer.address] at index 0 even if on-chain the signer is at index 3), the signature is checked against the WRONG slot. Best case: validateUserOp reverts and funds are stuck. The owners array + ownerIndex pair is signing-critical and taken on trust with no on-chain reconciliation.
- **Exploit/repro:** getWallet({walletAddress, signer}) with signers omitted → signers=[signer.address], signerIndex=0; on-chain the signer is owner index 2; every UserOperation signs for slot 0 and validateUserOp reverts → wallet unusable / funds stuck.
- **Recommendation:** On construction/retrieval for a deployed wallet, resolve ownerIndex via findSignerIndexOnChain(signer) against the actual contract rather than trusting array position; for the getWallet path that defaults signers to [signer], read the on-chain owner index before signing.
- **suggestRefactor:** yes · **Candidate issue:** #163

### refines:F035 — sendTokens accepts recipientAddress with only a falsy check AND takes amount as a JS number (precision loss)
- **Surface:** wallet-smart · **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:512-561`
- **Severity:** medium · **Class:** fund-loss · **Dedup status:** refines:F035 (also F036/F041 legs)
- **Detail:** sendTokens validates only `!recipientAddress` and `amount <= 0`. It does NOT call isAddress (F035), does NOT reject NaN/Infinity/non-finite (F036), and amount is a JS number fed to parseAssetAmount → parseUnits(amount.toString()) which emits scientific notation for large/small values and silently loses precision (F041). The combined exposure on one signed transfer: an address-poisoning look-alike recipient plus a float amount that rounds wrong. This is the user-facing "send my tokens" primitive with the weakest validation of any signing entry point.
- **Exploit/repro:** sendTokens(1e21, USDC, chain, '0xPoison...') — recipient is a look-alike passing the falsy check; amount stringifies to '1e+21' and parseUnits misparses; a wrong-amount transfer to a wrong recipient is signed.
- **Recommendation:** Add isAddress(recipientAddress) (throw on invalid) and Number.isFinite(amount) checks; accept an optional raw bigint amount (#379) to avoid the float→string→parseUnits path.
- **suggestRefactor:** no · **Candidate issue:** #379

### refines:F034 — send()/sendBatch() return the UserOperation receipt without inspecting receipt.success
- **Surface:** wallet-smart · **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:261-294,217-250`
- **Severity:** high · **Class:** correctness · **Dedup status:** refines:F034 (confirmed live on the main dispatch path)
- **Detail:** send() and sendBatch() return userOperationReceipt directly. waitForUserOperationReceipt resolves once the UserOp is included, but ERC-4337 inclusion does NOT mean the inner call succeeded: the EntryPoint can mine a UserOp whose execute()/executeBatch() reverted (receipt.success === false) while still charging gas. addSigner/removeSigner/deploy DO check receipt.success (352, 414, 486), but the public send/sendBatch — the primitives every action namespace dispatches through executeTransactionBatch — do NOT. A swap/lend/borrow whose on-chain call reverts is surfaced as a completed action.
- **Exploit/repro:** A swap UserOp is bundled but the inner execute() reverts (slippage, insufficient approval); receipt.success=false; send() returns it as a normal receipt; caller marks the swap done.
- **Recommendation:** After waitForUserOperationReceipt, throw TransactionConfirmedButRevertedError when receipt.success is false (matching addSigner/removeSigner/deploy), making the success contract uniform.
- **suggestRefactor:** no · **Candidate issue:** none

### refines:F058 — Counterfactual address derived from getSupportedChains()[0] and nonce defaulting to 0; send() can target a different address than the user funded
- **Surface:** wallet-smart · **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:573-587,196-207`
- **Severity:** medium · **Class:** correctness · **Dedup status:** refines:F058 (also F040)
- **Detail:** getAddress() computes the deterministic address from factory.getAddress(signerBytes, nonce||0n) using only the FIRST supported chain's public client; the constructor stores nonce but the getWallet path (F058) can drop a caller-supplied nonce so it falls back to 0. The CREATE2 counterfactual address is a function of (owners, nonce); a wrong/zeroed nonce yields a DIFFERENT address than the one funded. send/sendBatch then operate via toCoinbaseSmartAccount on that derived address with the same nonce — the entire signing+funding flow can target the wrong counterfactual wallet. The single-chain read (F040) compounds this.
- **Exploit/repro:** User funds counterfactual wallet at nonce=5; getWallet drops nonce (F058) → SDK derives/operates on nonce=0 address; deposits are inaccessible from the SDK-driven wallet.
- **Recommendation:** Thread the caller-supplied nonce through every construction path (fixing F058); validate the derived address against deploymentAddress when both are known, or read getAddress on the chain the op targets rather than getSupportedChains()[0]. Surface a clear error if a nonce was supplied but dropped.
- **suggestRefactor:** yes · **Candidate issue:** #98

### refines:F064 — findSignerInArray returns -1 for WebAuthn-only owner sets; legitimate passkey wallets cannot be constructed
- **Surface:** wallet-smart · **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/utils/findSignerInArray.ts:13-30`
- **Severity:** low · **Class:** correctness · **Dedup status:** refines:F064
- **Detail:** findSignerInArray matches only string addresses and type==='local'; WebAuthn entries always return false. ensureLocalAccountSigner throws when the index is -1. The Signer type explicitly supports WebAuthnAccount owners, and getCoinbaseSmartAccount/_signerBytes pass them through, so a passkey-only wallet is supported on paper but cannot be instantiated. The documented WebAuthn signing path is therefore untested/unreachable, so any latent calldata/owner-bytes bug in the passkey branch (e.g. addSigner WebAuthn decode, F038) is never exercised.
- **Exploit/repro:** create({ signers: [webAuthnAccount], signer }) → findSignerInArray returns -1 → constructor throws even though the config is type-valid.
- **Recommendation:** Support a WebAuthn LocalAccount-equivalent in findSignerInArray (match the active signer's public key) or explicitly reject WebAuthn-only configs with a clear message. Add a test that constructs and signs from a passkey-owner wallet.
- **suggestRefactor:** no · **Candidate issue:** #163

### refines:F038 — addSigner WebAuthn path decodes publicKey as two bytes32 with no length check
- **Surface:** wallet-smart · **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:322-326`
- **Severity:** low · **Class:** correctness · **Dedup status:** refines:F038
- **Detail:** The webAuthn branch does decodeAbiParameters([bytes32,bytes32], signer.publicKey) to derive (x,y) for addOwnerPublicKey, assuming exactly 64 bytes with no validation. P256 keys can be raw 64-byte x||y or 65-byte uncompressed with a 0x04 prefix. A 65-byte key shifts every byte, producing wrong x/y that get permanently written as an owner via a signed UserOperation — adding an owner the user did not intend (or an unusable owner that bloats the set and shifts removeSigner indices). getSignerPublicKey/formatPublicKey pass the same key through for index lookup.
- **Exploit/repro:** addSigner({type:'webAuthn', publicKey: 0x04||x||y}, chain) → decodeAbiParameters splits at byte 32 → wrong x,y added as a permanent owner.
- **Recommendation:** Assert size(signer.publicKey)===64 (or normalize a 0x04-prefixed 65-byte key) before decoding; reject anything else with a clear error. Mirror the 16-byte attributionSuffix assertion.
- **suggestRefactor:** no · **Candidate issue:** none

### refines:F011 — send/sendBatch catch{} rewraps every failure into a generic "Failed to send transaction"
- **Surface:** wallet-smart · **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:243-249,287-293`
- **Severity:** low · **Class:** correctness · **Dedup status:** refines:F011
- **Detail:** Both send and sendBatch wrap the whole prepare→send→wait flow in try/catch that throws `Failed to send transaction: <message>`. This flattens distinct, security-relevant conditions — paymaster declined, invalid signature (wrong ownerIndex per the F023 finding), nonce already used, bundler rejection, on-chain revert — into one indistinguishable string. An agent cannot distinguish "signed for the wrong owner slot / wallet misconfigured" (halt) from "transient bundler hiccup" (retryable). Same masking pattern flagged for lend/borrow (F011/#474), now on the core dispatch primitive.
- **Exploit/repro:** Wallet with wrong ownerIndex signs an invalid signature; bundler returns AA24; send() reports a string identical to a transient timeout; caller retries forever.
- **Recommendation:** Preserve the original error (rethrow with cause, or map to named errors: PaymasterDeclined / InvalidSignature / BundlerRejected / UserOpReverted). Align with the named-error + mapSdkError direction in #474.
- **suggestRefactor:** no · **Candidate issue:** #474

---

## CORE-SERVICES

### F075 — QuoteRecipientMismatchError contract (the shared pre-built-quote recipient guard) trusts quote.recipient metadata, never the signed calldata bytes
- **Surface:** core-services
- **File:line:** `packages/sdk/src/core/error/errors.ts:330-350`
- **Severity:** high · **Class:** malicious-sign
- **Dedup status:** NEW (assigned F075). The core-services-level root of F054 expressed at the shared error/guard contract; distinct location, not previously in the ledger.
- **Detail:** errors.ts:330-337 documents the cross-action invariant the QuoteRecipientMismatchError family enforces: "some routers (Velodrome v2/leaf) and protocols (Morpho supplyCollateral/borrow/repay/withdrawCollateral) encode the recipient or onBehalf address directly into calldata, so silently swapping recipients would route assets or position changes to the wrong account." Both consumers — WalletSwapNamespace.requireQuoteForThisWallet (93-101) and WalletBorrowNamespace.validateQuoteForThisWallet (207-222) — only assert `isAddressEqual(quote.recipient, wallet.address)` on the METADATA field, then dispatch quote.execution.transactions VERBATIM via executeTransactionBatch (33-36) → wallet.send/sendBatch. Neither decodes the calldata to confirm the baked recipient/onBehalf equals quote.recipient. A BorrowQuote/SwapQuote is a plain object; any producer can set recipient = wallet.address (passing the guard) while the calldata routes onBehalf/to to an attacker. The WalletBorrowNamespace docstring even states "every leg onBehalfOf/to is baked at quote time" yet never re-derives them.
- **Exploit/repro:** Construct a BorrowQuote { recipient: walletAddress, marketId: <allowlisted>, expiresAt: <future>, action: 'borrow', execution: { transactions: [<calldata whose onBehalf = attacker>] } }. `wallet.borrow.execute(quote)` → validateQuoteForThisWallet passes (recipient field matches) → dispatch signs the attacker-onBehalf calldata. No re-quote, no calldata decode anywhere on the path.
- **Recommendation:** Make the recipient guard verify the calldata, not a sibling metadata field. Either (a) re-derive the on-chain recipient/onBehalf by decoding the relevant leg of quote.execution.transactions and assert it equals wallet.address, or (b) drop the pre-built-quote dispatch entirely and require re-quoting through the wallet namespace. At minimum, document that quote.recipient is NOT a trusted proxy for the calldata.
- **suggestRefactor:** yes · **Candidate issue:** #373

### refines:F043 — resolveAddress returns hex recipient verbatim with strict:false (no checksum validation)
- **Surface:** core-services · **File:line:** `packages/sdk/src/services/nameservices/ens/utils.ts:43-47`
- **Severity:** medium · **Class:** malicious-sign · **Dedup status:** refines:F043
- **Detail:** resolveAddress (43-47) is the resolver behind buildResolveRecipient (actions/swap/module.ts:21-24) and EnsNamespace.getAddress (EnsNamespace.ts:81). For a hex input it returns the string AS-IS after isAddress(input, { strict: false }) — strict:false disables EIP-55 checksum verification, so a recipient with a corrupted/mistyped checksum is accepted and passed into SwapExecuteParamsResolved.recipient, then into the Velodrome calldata the user signs. The sibling validateAddress (validation.ts:74) uses strict isAddress; resolveAddress diverges. Sharper than F043 which framed it as cosmetic.
- **Exploit/repro:** Pass recipient '0x52908400098527886E0F7030069857D2e4169EE7' (one byte case-flipped, invalid EIP-55) to wallet.swap.execute. resolveAddress returns it verbatim (strict:false accepts it); on Velodrome v2 the recipient is baked into calldata and signed.
- **Recommendation:** In resolveAddress, validate hex inputs with strict isAddress (checksum-enforced) for mixed-case inputs, or normalize via getAddress() and return the checksummed form. Mirror validation.ts:validateAddress.
- **suggestRefactor:** no · **Candidate issue:** #371

### refines:F068 — EnsNamespace.getAddress caches ENS→address resolution for 5 minutes with no invalidation
- **Surface:** core-services · **File:line:** `packages/sdk/src/services/nameservices/ens/EnsNamespace.ts:78-87`
- **Severity:** medium · **Class:** malicious-sign · **Dedup status:** refines:F068 (F068 covered reverse getName; this is forward getAddress cache staleness)
- **Detail:** getAddress (78-87) caches the resolved Address keyed by the raw input for DEFAULT_CACHE_TTL_MS = 5 minutes (17). The resolved address is consumed as quote.recipient and (on recipient-in-calldata routers like Velodrome v2/leaf) baked into the transaction the user signs. ENS forward records are mutable (owner/resolver/addr change, expiry + re-registration by an adversary). During the window the SDK returns the previously-resolved address even though the live record now points elsewhere. There is also no forward/round-trip confirmation. Because the resolved value flows into signed calldata, this is a signing-path (not merely UX) concern.
- **Exploit/repro:** actions.ens.getAddress('victim.eth') (caches addr A). Within 5 min the name's addr() changes to B (owner update or expiry+re-reg). A second getAddress('victim.eth') still returns cached A; funds route to the stale A, or a stale cache hides an adversary's just-set record.
- **Recommendation:** For recipient resolution that feeds signed calldata, bypass the cache (resolve fresh) or drastically shorten/validate the TTL, and surface the resolution timestamp. Consider a round-trip confirmation (name → addr, then reverse addr → name) before treating a resolution as authoritative for a value-bearing recipient.
- **suggestRefactor:** no · **Candidate issue:** #453

### refines:F066 — validateRecipient — the sole recipient guard on the pre-built-quote swap path — checks ONLY the zero address
- **Surface:** core-services · **File:line:** `packages/sdk/src/utils/validation.ts:176-180`
- **Severity:** medium · **Class:** malicious-sign · **Dedup status:** refines:F066
- **Detail:** validateRecipient (176-180) is invoked by SwapProvider.validateSwapExecute (450), which runs on BOTH the raw and the pre-built-quote (QUOTE_DISCRIMINATOR) execute paths (140-148). Its entire body: if recipient is a hex address, assert it is not the zero address. No checksum, no membership, no reconciliation against the encoded recipient in the quote's pre-built calldata. On the pre-built path this is the only recipient-touching validation inside the provider, so a quote whose recipient metadata is any non-zero address sails through while the calldata routes elsewhere. Combined with the metadata-only requireQuoteForThisWallet upstream, no point on the swap pre-built-quote signing path checks the recipient bytes against anything.
- **Exploit/repro:** On a router that bakes recipient into calldata, supply a pre-built SwapQuote with recipient = any non-zero address but calldata encoding attacker recipient. validateSwapExecute → validateRecipient passes, buildSwapTransactions reuses the quote's calldata, wallet signs attacker-routed output.
- **Recommendation:** On the pre-built-quote path, re-derive the recipient from the quote's swap calldata and assert it equals params.recipient/wallet.address, or refuse pre-built quotes not produced by this wallet's getQuote. Independently, give validateRecipient a strict checksum check.
- **suggestRefactor:** yes · **Candidate issue:** #437

### refines:F067 — buildPermit2ApprovalTx encodes spender/token/amount/expiration with no non-zero-spender / uint160 / uint48 bounds
- **Surface:** core-services · **File:line:** `packages/sdk/src/utils/approve.ts:107-130`
- **Severity:** low · **Class:** malicious-sign · **Dedup status:** refines:F067 (F067 covered expiration; this is the spender/amount legs)
- **Detail:** buildPermit2ApprovalTx (107-130) constructs the Permit2 approve(token, spender, amount, expiration) calldata the user signs/sends. The Permit2 ABI types amount as uint160 and expiration as uint48 (utils/abi/permit2.ts:27-29). The function encodes whatever bigint amount and computed expiration with no bound check: amount > maxUint160 or expiration > maxUint48 would be silently truncated by viem or revert, and there is no guard that spender is a real non-zero address. A zero/wrong spender grants a Permit2 inner allowance to the wrong contract; an out-of-range amount produces a malformed/over-scoped approval the user signs.
- **Exploit/repro:** Call buildPermit2ApprovalTx with spender = 0x0 (or a mis-derived spender) and amount = 2n**170n: viem encodes a truncated/garbage amount and a zero spender into the approve calldata, dispatched and signed with no guard.
- **Recommendation:** Validate spender is a syntactically valid non-zero address (reuse validateAddress + validateNotZeroAddress) and assert amount <= maxUint160 and expiration <= maxUint48 before encoding. resolvePermit2ApprovalAmount already knows the uint160 ceiling; share it.
- **suggestRefactor:** no · **Candidate issue:** none

### F076 — validateNotZeroAddress compares against a lowercase zero-address literal with === (representation-mismatch bypass)
- **Surface:** core-services
- **File:line:** `packages/sdk/src/utils/validation.ts:60-64`
- **Severity:** low · **Class:** correctness
- **Dedup status:** NEW (assigned F076). relatesToPriorFinding: none; net-new.
- **Detail:** validateNotZeroAddress (60-64) compares `address === ZERO_ADDRESS` where ZERO_ADDRESS is the lowercase literal '0x0000...0000' (25). It uses strict string === rather than viem's isAddressEqual / zeroAddress comparison. The all-zero address has no non-zero hex nibbles so checksumming leaves it lowercase and the literal happens to match in practice — but the guard is the recipient/wallet zero-check used across validateWalletAddress and validateRecipient, and relying on byte-exact lowercase equality is fragile: any path passing a value through getAddress, or a future non-canonical zero representation, silently bypasses it. The ENS-path zero check (utils.ts:78) correctly uses isAddressEqual(resolved, zeroAddress); this sibling does not. A bypassed zero-address recipient leads to funds sent to 0x0 (burned).
- **Exploit/repro:** Conceptual: validateNotZeroAddress with any non-canonical casing of a zero-equivalent value — string === fails to normalize, unlike isAddressEqual. Low likelihood for the literal zero today, but the guard is load-bearing on the recipient signing path.
- **Recommendation:** Use viem's isAddressEqual(address, zeroAddress) in validateNotZeroAddress to match the ENS-path sibling and remove dependence on the lowercase literal. One-line change.
- **suggestRefactor:** no · **Candidate issue:** none

### F077 — createWalletProvider dereferences config.smartWalletConfig.provider after the !config.smartWalletConfig branch is taken (TypeError on optional-config path)
- **Surface:** core-services
- **File:line:** `packages/sdk/src/actions.ts:250-267`
- **Severity:** low · **Class:** infra
- **Dedup status:** NEW (assigned F077). relatesToPriorFinding: none; net-new.
- **Detail:** In createWalletProvider (250-267) the IIFE returns new DefaultSmartWalletProvider when `(!config.smartWalletConfig || provider.type === 'default')`. But inside that same branch it reads config.smartWalletConfig.provider.attributionSuffix (260-261). When config.smartWalletConfig is undefined the first `||` operand is true so the branch is taken, then the body dereferences config.smartWalletConfig.provider → TypeError "Cannot read properties of undefined". The documented "smart wallet config optional" path crashes at first wallet use. On the wallet-construction seam every signed action flows through, and it silently contradicts the optional-config contract.
- **Exploit/repro:** Construct Actions with wallet config that omits smartWalletConfig, then trigger wallet provider creation: the lazy providerFactory runs createWalletProvider and throws TypeError on line 260-261.
- **Recommendation:** Guard the read: `attributionSuffix: config.smartWalletConfig?.provider.attributionSuffix`. Add a unit test for the no-smartWalletConfig construction path.
- **suggestRefactor:** no · **Candidate issue:** none

### refines:F045 — getBundlerClient builds the bundler RPC without binding to a verified chainId
- **Surface:** core-services · **File:line:** `packages/sdk/src/services/ChainManager.ts:90-127`
- **Severity:** low · **Class:** info · **Dedup status:** refines:F045
- **Detail:** getBundlerClient (90-127) creates a bundler/public client from chainConfig.bundler.url and getChain(chainId), not cross-verified (no eth_chainId reconciliation between the configured chainId and what the bundler endpoint reports). The smart-wallet path signs the bundler-prepared UserOperation; if a misconfigured/substituted bundler URL points at a different chain, the prepared calldata is built for the wrong chain yet still signed. RPC/bundler trust is the integrator's responsibility (recorded info, not a fix), but flagging the seam: no SDK-side assertion that bundler.chainId == configured chainId before its returned calldata enters the signing path. Pairs with the F037/F056 family.
- **Exploit/repro:** Config with chains[].chainId = 10 but bundler.url pointing at a chain-8453 bundler: getBundlerClient returns a client labeled chain 10; the prepared UserOperation reflects the bundler's actual chain and is signed without reconciliation. (Out-of-scope as a fix per RPC-trust rule; recorded as info.)
- **Recommendation:** Info only. If cheaply feasible, add a one-time eth_chainId reconciliation when a bundler client is first created for a chain.
- **suggestRefactor:** no · **Candidate issue:** #82
