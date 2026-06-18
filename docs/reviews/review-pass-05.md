# Review Pass 05 — `engineering-skills:security-pen-testing` AppSec & Boundaries

**Pass:** 5
**Skill / lens:** `engineering-skills:security-pen-testing` — application-security / pen-testing methodology applied to the SDK boundaries: input validation at public entrypoints (A03 injection/prototype-pollution, A08 integrity/unsafe-deserialization, A09 sensitive-data-in-errors), unsafe casts hiding runtime contracts, untrusted external data flowing into addresses/amounts/chainId/calldata, secret/key-material handling, and config-integrity/tamper guards.
**Surfaces:** swap, lend, borrow, wallet-core, wallet-hosted, wallet-smart, core-services.

The verbatim-signing / calldata-integrity seam (F054 / F070–F075), the signer-identity reconciliation seam (F028/F029/F031/F062/F073/F074), and the bulk of the wallet-conformance cluster (F078–F096) were treated as known and intentionally NOT re-flagged. This pass hunts appsec gaps *beyond* those seams: unvalidated numeric/address inputs that reach signed calldata, NaN/scientific-notation bypasses of shared validators, missing config-integrity binds, and the handful of secret/log-exposure / DoS-hardening footguns. Secret handling was probed on every surface and is clean (no private keys, mnemonics, API tokens, walletIds, or signed payloads logged, persisted, or embedded in thrown error strings); prototype-pollution sinks were probed and none are exploitable.

## Summary

**Incoming:** 31 per-surface findings across 7 surface groups (swap, lend, borrow, wallet-core, wallet-hosted, wallet-smart, core-services).
**Outcome:** 17 NEW (F097–F113), 7 REFINES, 7 DUP. NEXT_ID advances F097 → F114.

**NEW by severity:** 1 high, 7 medium, 9 low.
**REFINES by severity:** 4 medium, 3 low.
**DUP:** F079, F012, F092, F030, F031, F029, F033.

### Counts by class (NEW only)
- malicious-sign: 4
- correctness: 4
- info: 9

### Notable highlights
- **F103 (HIGH, borrow):** `AaveBorrowProvider`'s constructor never verifies `config.marketId == computeAaveBorrowMarketId({chainId, collateralReserve, debtReserve})` — the Morpho sibling closes exactly this hole (`verifyMorphoMarketId`, throwing `BorrowMarketParamsMismatchError`). Because allowlist matching keys on `marketId` while all Aave calldata is encoded from the raw `aave.*` reserves, an entry whose `marketId` was derived from a legitimate (WETH, USDC) pair but whose reserve fields were spliced to attacker tokens passes every guard and routes borrow/supply/repay/withdraw + ERC20 approvals against the spliced reserves. `computeAaveBorrowMarketId` is implemented and exported but never invoked in any validation path.
- **F099 (MEDIUM, lend):** `openPosition` validates `walletAddress` but never runs `marketId.address` through `isAddress`; Morpho bakes it verbatim as BOTH the ERC-20 approval spender and the tx `to`. Distinct from F081 (fail-open allowlist) and F071 (walletAddress verbatim): the gap is the complete absence of `isAddress` on `marketId.address` on the signing path.
- **F105 (MEDIUM, wallet-core):** `getSmartWallet`/`getWallet` never `isAddress`-validate the caller-supplied `walletAddress` before it becomes the signed `to:` target of owner-management and deploy UserOps. `Address` is only a compile-time brand; a truncated/poisoned string is accepted and signed against.
- **F110 (MEDIUM, core-services):** `validateSlippage` admits `NaN` — `slippage < 0 || slippage > max` is `false` for `NaN`, so the single shared slippage choke point silently passes `NaN`. Today it fails late inside `BigInt(Math.round(NaN*BPS))`, but any sibling consumer that multiplies in float would silently disable slippage protection and sign a zero-min-out swap.
- **F112 (LOW, core-services):** `ChainManager` validates config `chainId`s against viem's GLOBAL `chainById` registry, not the SDK's `SUPPORTED_CHAIN_IDS`, so a viem-known but SDK-unsupported chain is accepted at the infra layer; the chain-scope invariant rests solely on a bypassable TS type (producer-side sibling of F095).

## AppSec assertions this pass tested
- **Numeric inputs:** every caller `amount`/`slippage`/`deadline` reaching signed calldata is finite, positive, and representable as a plain decimal before `parseUnits`/`BigInt` (F097, F110, F111, refines:F041, refines:F015).
- **Address inputs:** every address that becomes an approval spender, tx `to`, `onBehalf`/owner, or CREATE2 input is `isAddress`-validated/checksummed at the boundary it enters (F099, F105, F108, refines:F066).
- **Config integrity:** each allowlist entry's `marketId` is cryptographically bound to the reserve/params it routes calldata against (F103, F104).
- **Chain scope:** caller `chainId` is asserted against the SDK's configured chain set, not just a TS brand or viem's global registry (F109, F112).
- **External data:** untrusted GraphQL/ENS values are finiteness/scheme-validated before flowing into displayed numbers or rendered URLs (F101, F113).
- **Secret/log hygiene:** no key material in logs/errors; untrusted free-text is not concatenated into thrown error strings that integrators log (F106, refines:F011 lend + wallet-smart).
- **DoS hardening:** contract-returned counters at caller-influenced addresses do not drive unbounded sequential RPC fan-out (F107).

---

## Surface: swap

### F097 — Caller-supplied swap `deadline` is never validated for finiteness/positivity/futureness before `BigInt(deadline)` is baked into signed router calldata
- **Status:** NEW
- **File:** `packages/sdk/src/actions/swap/core/SwapProvider.ts:272-273, 462-464`
- **Severity:** medium · **Class:** malicious-sign
- **Detail:** `deadline` is an optional caller-supplied `number` that flows untouched from quote/execute params into encoded swap calldata: `resolveQuoteDefaults` uses `params.deadline ?? now + quoteExpirationSeconds` (line 273), `resolveParams` does the same (lines 462-464), and the value is passed straight to `BigInt(deadline)` inside every encoder (uniswap/encoding.ts:308; velodrome/encoding/routers/v2.ts:235,257,265,272; cl.ts:162). There is no `validateDeadline` anywhere in the SDK (grep-confirmed). Consequences: (1) a non-integer deadline (e.g. `Date.now()` in ms passed as seconds, or any float) makes `BigInt(deadline)` throw an opaque `RangeError` deep in encoding; (2) a `deadline` of 0 or any past timestamp is encoded verbatim into the swap calldata. On the pre-built-quote execute path the quote's `expiresAt` is set equal to that same deadline (uniswap line 183, velodrome line 201) so `validateQuoteNotExpired` would catch a past value there — but on the raw-params `execute()` path and on every `getQuote()` return there is no deadline sanity check, so a quote carrying a zero/past on-chain deadline can be produced and signed (guaranteed on-chain revert, wasted gas), or a far-future deadline a caller did not intend keeps the swap executable long after the user expected it to lapse.
- **Exploit/repro:** `await actions.swap.getQuote({ ...pair, amountIn: 1, deadline: 1.5, chainId })` → opaque `RangeError` from `BigInt(1.5)` inside `encodeUniversalRouterSwap`. `execute({ ...rawParams, deadline: 1 })` (past unix second) encodes `deadline=1` into calldata with no validation, producing a guaranteed-revert signed swap.
- **Recommendation:** Add a shared `validateDeadline(deadline)` that asserts `Number.isInteger(deadline) && deadline > now` (allow a small skew) and call it in `validateSwapExecute` and at the quote boundary (`SwapProvider.getQuote`), mirroring `validateSlippage`/`validateQuoteNotExpired`. At minimum reject non-integer/non-positive values before `BigInt(deadline)`, and reconcile the encoded deadline with `expiresAt`.
- **suggestRefactor:** true · **Candidate issue:** #373 · **Relates to:** —

### F098 — Provider iteration in `getMarket`/`fetchAllQuotes` swallows every provider error indistinguishably, masking security-relevant guard rejections
- **Status:** NEW
- **File:** `packages/sdk/src/actions/swap/namespaces/BaseSwapNamespace.ts:131-137, 266-275`
- **Severity:** low · **Class:** info
- **Detail:** `getMarket` (lines 131-137) loops providers in `try { return await p.getMarket(params) } catch { continue }`, and `fetchAllQuotes` (lines 266-275) uses `Promise.allSettled` then silently drops every rejected result. Both paths collapse all failure modes into the same outcome: a security-meaningful rejection (a market deliberately excluded by `validateMarketAllowed`/blocklist, or a malformed-input throw from encoding) is indistinguishable from a transient RPC failure. For an appsec/defense-in-depth lens a provider's allowlist/blocklist enforcement failing open, or a validation throw, is invisible to the caller and to logging, and a 'best quote' can be returned from whichever provider happened not to throw with no signal another provider rejected the pair for a safety reason. No fund-loss by itself, but it weakens the ability to detect that a guard fired.
- **Exploit/repro:** n/a (observability gap). With two providers, if provider A throws because the pair is blocklisted and provider B returns a quote, the caller silently gets B's quote with no indication A rejected for a safety reason.
- **Recommendation:** Distinguish expected 'pair not supported / blocked' rejections (return empty/skip) from unexpected errors (surface/aggregate them via an onError hook or by attaching rejected reasons to the result) so an allowlist/blocklist rejection or an input-validation throw is observable rather than silently swallowed. RPC-trust itself is out of scope; this is about not masking SDK-side guard rejections.
- **suggestRefactor:** true · **Candidate issue:** #334 · **Relates to:** —

### refines:F041 — `amount: number` boundary forwards JS scientific-notation strings into viem `parseUnits`, throwing an opaque `InvalidDecimalNumberError` on legitimate large (>=1e21) and tiny (<1e-6) swap amounts
- **Status:** refines:F041
- **File:** `packages/sdk/src/utils/assets.ts:17-19, 30-36`
- **Severity:** medium · **Class:** correctness
- **Detail:** Every swap quote/execute boundary funnels the caller's `amount: number` through `parseAssetAmount(asset, amount)` → `parseDecimalAmount(amount, decimals)` → `parseUnits(amount.toString(), decimals)` (lines 18, 35). `Number.prototype.toString()` emits scientific notation for any magnitude `>= 1e21` (`(1e21).toString() === "1e+21"`) and `< 1e-6` (`(1e-7).toString() === "1e-7"`). viem's `parseUnits` validates against `^(-?)([0-9]*)\.?([0-9]*)$` and throws `InvalidDecimalNumberError` for any exponent string (viem 2.x parseUnits.js:14). There is no SDK-level validation that `amount` is representable as a plain decimal before it reaches `parseUnits`. A caller swapping a large base-unit quantity of a low-unit-value/high-supply token (a number `>= 1e21` is realistic for an 18-decimal meme/utility token where the human amount is large), or a very small fractional amount, receives an opaque library-internal throw deep inside encoding rather than a clear named SDK validation error. Reachable on `actions.swap.getQuote`, `wallet.swap.getQuote`, and `execute(rawParams)` via both `resolveQuoteDefaults` (SwapProvider.ts:275) and `resolveParams` (SwapProvider.ts:457). F041 recorded the scientific-notation defect at this file generically; this sharpens it to the swap public boundary with the concrete `>=1e21`/`<1e-6` thresholds and the shared lend/borrow blast radius.
- **Exploit/repro:** Confirmed in-environment: `(1e21).toString()` → `"1e+21"`, `(1e-7).toString()` → `"1e-7"`; viem regex rejects both → `InvalidDecimalNumberError`. `await actions.swap.getQuote({ assetIn: someToken18dec, assetOut: USDC, amountIn: 1e21, chainId })` throws an opaque viem error.
- **Recommendation:** Add a public-boundary guard that rejects (or normalizes) non-plain-decimal amounts before `parseUnits`: either validate `Number.isFinite(amount) && amount >= 0` AND `amount.toString()` contains no `e`/`E` (throw a named `InvalidAmountError`), or format with `amount.toFixed(decimals)` / a BigNumber-safe conversion. Centralize in `parseDecimalAmount`/`parseAssetAmount` so lend/borrow inherit the fix. Pair with `validateAmountPositiveIfExists` so validation runs on the quote path too.
- **suggestRefactor:** true · **Candidate issue:** #303 · **Relates to:** F041

### refines:F001 — `getQuote` skips `validateSlippage`, so a slippage between `maxSlippage` and `1.0` bakes an arbitrarily-loose (or, `>=1.0`, negative) `minAmountOut` into the returned quote's calldata
- **Status:** refines:F001
- **File:** `packages/sdk/src/actions/swap/core/SwapProvider.ts:164-167, 271, 286-297`
- **Severity:** low · **Class:** malicious-sign
- **Detail:** The public `getQuote()` (lines 164-167) only calls `assertChainSupported`; it never calls `validateSlippage`. `resolveQuoteDefaults` then takes `params.slippage ?? defaultSlippage` with no clamp (line 271), and `computeSlippageBounds`/`encodeUniversalRouterSwap` compute `minAmountOut = quote.amountOutRaw * (1 - slippage)` (encoding.ts:252, SwapProvider.ts:292). With `slippage` in `(maxSlippage, 1.0)` the encoder produces a positive but arbitrarily small minOut (slippage 0.9 ⇒ minOut = 10% of expected, a 90%-loss-tolerant swap) baked into the returned quote's calldata; with `slippage >= 1.0` the term `(1 - slippage)` goes `<= 0` and `BigInt(Math.round((1-slippage)*10000))` is negative, yielding a negative/garbage minOut. The pre-built-quote `execute()` re-runs `validateSlippage(quote.slippage, maxSlippage)` (line 449), so this is execute-gated for `maxSlippage: 0.5` — but (a) any config setting `maxSlippage >= 0.9` lets a 90%-loss quote pass to signing, and (b) `actions.swap.getQuote` returns the garbage-minOut quote object to callers who may build their own tx from `quote.execution.swapCalldata`. The existing refines:F001 entries flag that `getQuote` skips `validateSwapExecute` generally; this sharpens to the slippage-specific mint-time calldata hazard.
- **Exploit/repro:** `actions.swap.getQuote({ ...pair, amountIn: 1, slippage: 5, chainId })` returns a `SwapQuote` whose `execution.swapCalldata` encodes a negative `amountOutMinimum` (`Math.round((1-5)*10000) = -40000`); no error is thrown at the quote boundary.
- **Recommendation:** Call `validateSlippage(params.slippage ?? defaultSlippage, maxSlippage)` inside `SwapProvider.getQuote` (and/or `resolveQuoteDefaults`) so the encoded slippage is bounded at mint time, not only re-checked at execute. Additionally clamp/guard `computeSlippageBounds`/`encodeUniversalRouterSwap` so `slippage >= 1.0` can never produce a negative minOut.
- **suggestRefactor:** true · **Candidate issue:** #435 · **Relates to:** F001

### dup:F079 — v2/leaf encoders cast caller-derived recipient into signed calldata with no `isAddress`/checksum guard
- **Status:** dup:F079
- **File:** `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/v2.ts:250-273`
- **Severity:** low · **Class:** malicious-sign
- **Detail:** Same root cause, same file/lines as ledger F079 (added in pass 4): `encodeRouterSwap` passes the caller-sourced `recipient` directly into `encodeFunctionData` for `swapExactETHForTokens`/`swapExactTokensForETH`/`swapExactTokensForTokens` with no `isAddress`/`validateAddress` check at the encoding seam, while universal/CL encoders hard-code the `UNIVERSAL_ROUTER_MSG_SENDER` sentinel and `validateRecipient` no-ops on non-`isAddress` values. Confirmed already captured; not re-filed.
- **Recommendation:** (per F079) Add an `isAddress(recipient)` assertion at the top of `encodeRouterSwap` (and CL/universal for parity); tighten `validateRecipient`.
- **suggestRefactor:** false · **Candidate issue:** #437 · **Relates to:** F079 (duplicate)

---

## Surface: lend

### F099 — `openPosition` validates `walletAddress` but never runs `marketId.address` through `isAddress`; Morpho bakes it verbatim as the approval spender and tx `to`
- **Status:** NEW
- **File:** `packages/sdk/src/actions/lend/core/LendProvider.ts:84-118, 234-257`
- **Severity:** medium · **Class:** malicious-sign
- **Detail:** On the signing path `openPosition` calls `validateWalletAddress(params.walletAddress)` (line 85) then `validateMarketAllowed(params.marketId)` (line 87). `validateMarketAllowed` only checks chain support and allowlist membership via `lendMarketIdMatches`, a `.toLowerCase()` string compare (markets.ts:18-23) — it never calls `isAddress`/`validateAddress` on `marketId.address`, and short-circuits to a no-op when the allowlist is empty/undefined (lines 237-242). The resolved `marketId.address` then flows straight into signed calldata: in `MorphoLendProvider._openPosition` it becomes BOTH `spender: params.marketId.address` and `transaction.to` (MorphoLendProvider.ts:70-74), and the base class builds an ERC-20 `approve(spender, amount)` to that same value (LendProvider.ts:286-290). `validateWalletAddress` already exists and is applied to `walletAddress`; the sibling swap providers run recipient/spender addresses through `isAddress` sentinels (F079), but the lend deposit spender/`to` gets no syntactic address validation at all. Distinct from F081 (empty-allowlist fail-open) and F071 (walletAddress encoded verbatim): the gap here is the *complete absence of isAddress validation on `marketId.address`* before it is an approval spender on the signing path.
- **Exploit/repro:** Configure a `LendProvider` with no `marketAllowlist`. Call `actions.lend.openPosition({ asset: USDC, amount: 1, marketId: { address: '0xdeadbeef' /* 4 bytes */, chainId: 10 }, walletAddress })`. `validateMarketAllowed` returns early, `MorphoLendProvider._openPosition` sets `spender=to='0xdeadbeef'`, and the base class emits `approve('0xdeadbeef', amount)` + deposit to `'0xdeadbeef'` as a signable batch. No `isAddress` guard fires.
- **Recommendation:** In `openPosition`/`closePosition` (or inside `validateMarketAllowed`), call `validateAddress(marketId.address, 'marketId.address')` before the value builds any approval or position tx. Mirrors `validateWalletAddress` and the swap providers' `isAddress` checks, and closes the spender/`to` hole independent of allowlist state.
- **suggestRefactor:** true · **Candidate issue:** #334 · **Relates to:** F081

### F100 — Morpho GraphQL fetch has no timeout/AbortController; a hung `api.morpho.org` stalls `getVault` and therefore open/close position flows indefinitely
- **Status:** NEW
- **File:** `packages/sdk/src/actions/lend/providers/morpho/api.ts:73-89`
- **Severity:** low · **Class:** info
- **Detail:** `fetchRewards` issues `await fetch(MORPHO_API_ENDPOINT, ...)` (line 74) with no `signal`/AbortController and no timeout. `getVault` awaits `fetchAndCalculateRewards` (sdk.ts:349) which awaits `fetchRewards`. `getVault` is invoked by `MorphoLendProvider._openPosition` (line 59) and `_closePosition` (line 96) *before* the signing transaction is built, to snapshot APY. A slow or hostile-but-reachable external endpoint (TCP-accept-but-never-respond) blocks the entire open/close call with no upper bound. The endpoint is hardcoded to the public Morpho API — outside the integrator's RPC trust boundary (an external HTTP dependency, not the integrator-supplied RPC). The catch block only handles thrown/rejected fetches, not a hang. Sibling on-chain reads go through the integrator's viem client (which can carry its own timeout); this raw fetch does not.
- **Exploit/repro:** Point DNS/network for `api.morpho.org` at a server that accepts the connection and never responds. Call `actions.lend.getMarket(...)` or `wallet.lend.openPosition(...)` for a Morpho vault: the promise never settles because `fetchRewards`'s `fetch` has no timeout.
- **Recommendation:** Pass an `AbortSignal.timeout(<n>ms)` (or an AbortController + setTimeout) to the `fetch` so a stalled Morpho API degrades to the existing null/empty-rewards fallback instead of hanging the open/close flow.
- **suggestRefactor:** false · **Candidate issue:** #211 · **Relates to:** F014

### F101 — External Morpho GraphQL reward values (`supplyApr`, `supplyAssetsUsd`, `fee`) consumed as `any` with only `|| 0` coalescing; no numeric/finiteness/sign validation before flowing into displayed APY
- **Status:** NEW
- **File:** `packages/sdk/src/actions/lend/providers/morpho/sdk.ts:538-579 (540, 553, 569)`
- **Severity:** low · **Class:** info
- **Detail:** `fetchRewards` returns `Promise<any>` (api.ts:20) and the entire downstream consumes untrusted GraphQL JSON as `any` (`calculateRewardsBreakdown(apiVault: any)` sdk.ts:515, `calculateBaseApy(vault: any)` sdk.ts:80, `calculateApyBreakdown(vault: any)` sdk.ts:468). Reward magnitudes are read with only falsy coalescing: `reward.supplyApr || 0` (lines 540, 569), `alloc.supplyAssetsUsd || 0` (lines 553, 565), and `Number(vault.fee)` (lines 473, 112). None validate the value is a finite, non-negative number. A compromised or buggy `api.morpho.org` response with `supplyApr: "1e9"` (string), a negative APR, or `NaN` (which survives `|| 0` → 0, but a string like `"5"` survives and is later summed/arithmetic-coerced) propagates into `total`/`totalRewards` of the `ApyBreakdown` returned by `getMarket`/`getMarkets`. That APY is the number a user reads when deciding whether to deposit; there is no clamp or schema. An A08 (integrity) / unvalidated-external-data gap: the value side of the response is trusted even though `categorizeRewardAsset` bounds the key side.
- **Exploit/repro:** Stub fetch to return `{ data: { vaultByAddress: { state: { rewards: [{ asset: { address: USDC }, supplyApr: '999' }], allocation: [] } } } }`. `calculateRewardsBreakdown` does `rewardsByCategory[usdc] += '999'` → string coercion artifacts, and `totalRewards` reduce yields a polluted APY surfaced via `getMarket().apy.total`.
- **Recommendation:** Coerce and validate external reward numerics at the boundary in `calculateRewardsBreakdown`/`calculateApyBreakdown`: read each `supplyApr`/`supplyAssetsUsd`/`fee` via `Number(x)` + `Number.isFinite` + non-negative guard (drop or zero out invalid entries), and narrow `fetchRewards`'s return from `any` to a typed/zod-validated shape.
- **suggestRefactor:** true · **Candidate issue:** #337 · **Relates to:** —

### F102 — `getMarkets` accepts a caller-supplied `markets` array that bypasses the allowlist prefilter; read path is fail-closed while the write path (F081) is fail-open
- **Status:** NEW
- **File:** `packages/sdk/src/actions/lend/core/LendProvider.ts:141-154`
- **Severity:** low · **Class:** info
- **Detail:** `getMarkets` uses `params.markets || filteredMarkets` (line 152), passing a caller-supplied `markets: LendMarketConfig[]` straight to `_getMarkets` → `getReserves`/`getVaults` → per-market `getReserve`/`getVault`. The per-market functions re-check allowlist membership (sdk.ts:328-334 morpho, sdk.ts:85-91 aave), so an allowlisted deployment is protected. However: (1) when the allowlist is empty/undefined, `findMarketInAllowlist` returns undefined and `getVault`/`getReserve` throw `MarketNotAllowedError` — so the read path is *stricter* than the write path (write fail-opens per F081, read fail-closes), an inconsistency worth noting; (2) the caller-supplied `LendMarketConfig` is trusted wholesale for `marketConfig.address`/`marketConfig.chainId` with no `isAddress`/chain validation before the on-chain reads fire. Read-only (info), but the asymmetry between the fail-open write allowlist (F081) and the fail-closed read allowlist is a latent confusion that should be reconciled when F081 is fixed.
- **Exploit/repro:** With a non-empty allowlist, `getMarkets({ markets: [{ address: someNonAllowlistedVault, chainId: 10, ... }] })` reaches `getVault` which throws `MarketNotAllowedError` — confirming read is fail-closed while open/closePosition with empty allowlist is fail-open (F081). The divergence is the finding.
- **Recommendation:** When fixing F081, reconcile the two paths so allowlist semantics (fail-open vs fail-closed) are identical for read and write, and validate caller-supplied `markets[].address` with `isAddress` before issuing on-chain reads. Document that `getMarkets` honors an explicit `markets` override only within the allowlist.
- **suggestRefactor:** true · **Candidate issue:** #334 · **Relates to:** F081

### refines:F011 — Aave open/close/getPosition catch-all interpolates caller-controlled amount and asset symbol into thrown Error strings (log-injection / output-spoofing lens)
- **Status:** refines:F011
- **File:** `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts:79-83, 117-119, 205-209`
- **Severity:** low · **Class:** info
- **Detail:** `_openPosition` rethrows `Failed to open position with ${params.amountWei} of ${params.asset.metadata.symbol}` (lines 80-82) and `_getPosition` rethrows `...for ${params.walletAddress} in market ${params.marketId.address}` (lines 206-208). These embed caller-supplied values (amount, `asset.metadata.symbol`, walletAddress, `marketId.address`). `asset.metadata.symbol` is fully attacker/integrator-controlled free text on the public boundary. If forwarded to a log aggregator or surfaced in a UI without encoding, a crafted symbol (newlines or ANSI/markup) enables log forging / output spoofing. This is the appsec companion to F011 (error flattening): beyond masking precise errors, the rebuilt message is an *injection sink* for unvalidated free-text. No secret/key material is leaked (good), but the symbol passthrough is unsanitized.
- **Exploit/repro:** Pass an Asset whose `metadata.symbol` is `USDC\n[ALERT] forged log line` and trigger the catch path (e.g. unsupported chain). The thrown message embeds the newline-laden symbol; if logged line-oriented, it forges a second log entry.
- **Recommendation:** Drop the interpolated free-text (`asset.metadata.symbol`) from thrown messages, or pass structured fields on a named error object rather than concatenating untrusted strings. At minimum do not interpolate `asset.metadata.symbol` verbatim. This also recovers the precise inner error masked by F011's catch-all.
- **suggestRefactor:** true · **Candidate issue:** #474 · **Relates to:** F011

### dup:F012 — Dead exported helper `findBestVaultForAsset` matches caller asset against `Object.values(vault.asset.address)` chain-agnostically
- **Status:** dup:F012
- **File:** `packages/sdk/src/actions/lend/providers/morpho/sdk.ts:434-459`
- **Severity:** low · **Class:** info
- **Detail:** Same root cause, same file/lines as ledger F012: `findBestVaultForAsset` (exported, unreferenced) filters with `Object.values(vault.asset.address).includes(asset)` (line 447), matching the asset on ANY chain not the requested chain, then returns `assetVaults[0].address` with a hardcoded `chainId: 0` in the not-found error. Re-confirmed present and still exported in the current tree under the appsec lens (latent footgun if ever wired into a deposit flow), but already captured. Not re-filed.
- **Recommendation:** (per F012) Delete the dead export, or make it chain-scoped (require chainId, compare `vault.asset.address[chainId]`) and validate the resolved address with `isAddress`.
- **suggestRefactor:** true · **Candidate issue:** none · **Relates to:** F012 (duplicate)

---

## Surface: borrow

### F103 — `AaveBorrowProvider` constructor never verifies `marketId == computeAaveBorrowMarketId(chain, collateralReserve, debtReserve)`; the Morpho sibling DOES enforce its marketId↔params bind
- **Status:** NEW
- **File:** `packages/sdk/src/actions/borrow/providers/aave/AaveBorrowProvider.ts:47-54, 174-186`
- **Severity:** high · **Class:** correctness
- **Detail:** `AaveBorrowProvider`'s constructor calls only `assertAaveMarketChainsSupported` (chain support). It never checks that each allowlist entry's `config.marketId` equals `computeAaveBorrowMarketId({ chainId, collateralAddress: aave.collateralReserve, debtAddress: aave.debtReserve })`. The Morpho sibling closes exactly this hole at construction: `MorphoBorrowProvider.ts:79-87` throws `BorrowMarketParamsMismatchError` when `verifyMorphoMarketId(marketId, marketParams)` is false. In the Aave config type (types/borrow/market.ts:101-106), `marketId` (Hex) and `aave.{debtReserve,collateralReserve}` (Address) are independent fields. Routing/allowlist matching keys solely on `marketId` (`marketIdMatches` core/markets.ts:26-31, used by `requireAllowlistedBorrowMarketConfig` core/validations.ts:42-76), while ALL Aave calldata is encoded from the raw `aave.*` reserves (calldata.ts:31-34 borrow uses `config.aave.debtReserve`; :72 supply and :89 withdraw use `config.aave.collateralReserve`; state.ts reads/approves the same). Consequence: an allowlist entry whose `marketId` was derived from a legitimate (WETH, USDC) pair but whose `aave.debtReserve`/`collateralReserve` were spliced to attacker-controlled token addresses passes every SDK guard (allowlist hit, chain support, recipient check) and the provider emits borrow/supply/repay/withdraw + ERC20 approvals against the spliced reserves. `computeAaveBorrowMarketId` is implemented and publicly exported (index.ts:8) but is never invoked in any validation path. This is the Aave analogue of the marketParams-splice attack the Morpho check explicitly documents preventing.
- **Exploit/repro:** Build an `ActionsConfig` with an aave-v3 borrow allowlist entry: `marketId = computeAaveBorrowMarketId({chainId, WETH, USDC})` (a legitimate pair the user expects), but set `aave.debtReserve = ATTACKER_TOKEN` and `aave.collateralReserve = ATTACKER_TOKEN`. Call `wallet.borrow.openPosition({ market: thatEntry, ... })`. The allowlist match succeeds (keyed on `marketId`), `assertChainSupported` passes, and `encodeAaveBorrow`/`encodeAaveSupply` emit `Pool.borrow`/`supply` against `ATTACKER_TOKEN` plus a `maxUint256`-capable ERC20 `approve` to the pool for `ATTACKER_TOKEN`. Morpho rejects the identical splice at construction; Aave does not.
- **Recommendation:** In `AaveBorrowProvider`'s constructor (mirroring MorphoBorrowProvider.ts:79-87), iterate `config.marketAllowlist`, skip non-`'aave-v3'` entries, and throw `BorrowMarketParamsMismatchError` (already defined, errors.ts:185) when `market.marketId.toLowerCase() !== computeAaveBorrowMarketId({ chainId: market.chainId, collateralAddress: market.aave.collateralReserve, debtAddress: market.aave.debtReserve }).toLowerCase()`. Add a construction-time test that a spliced-reserve config throws, matching the Morpho mismatch test.
- **suggestRefactor:** true · **Candidate issue:** #334 · **Relates to:** F017

### F104 — `computeAaveBorrowMarketId` hashes raw caller-supplied addresses without checksum/`isAddress` normalization; no exported `verifyAaveMarketId` helper to pair with the Morpho one
- **Status:** NEW
- **File:** `packages/sdk/src/actions/borrow/providers/aave/marketId.ts:14-25`
- **Severity:** low · **Class:** info
- **Detail:** `computeAaveBorrowMarketId` (exported via index.ts:8) `keccak256`s `encodeAbiParameters` over `BigInt(chainId)` and the two raw `Address` inputs. It performs no `isAddress`/checksum normalization, so a config author passing a lowercased vs checksummed (or malformed-but-coercible) reserve string can produce a `marketId` that silently fails to match the same pair entered with different casing elsewhere. Morpho exposes `verifyMorphoMarketId` as a paired helper (marketParams.ts:27-32, case-insensitive); the Aave module exposes no analogous `verifyAaveMarketId`, which is part of why the construction-time bind (F103) was never wired. Low/info because the hash is deterministic and viem `encodeAbiParameters` rejects a non-address string at runtime; the gap is the missing canonicalization + missing verify helper, not a direct fund path on its own.
- **Exploit/repro:** Static: `computeAaveBorrowMarketId({chainId, collateral: lowercased, debt})` vs the same pair entered checksummed produce different `marketId`s, desyncing allowlist matching from calldata for a config author who is inconsistent about casing.
- **Recommendation:** Add an exported `verifyAaveMarketId(marketId, { chainId, collateralAddress, debtAddress })` mirroring `verifyMorphoMarketId`, and have `computeAaveBorrowMarketId` run `getAddress()` on both inputs before hashing so casing differences cannot desync allowlist matching from calldata. Consume `verifyAaveMarketId` in the constructor per F103.
- **suggestRefactor:** true · **Candidate issue:** #328 · **Relates to:** —

### refines:F015 — Morpho exact-amount `depositCollateral`/`withdrawCollateral` never reject a zero amount; a zero-value leg is encoded and dispatched
- **Status:** refines:F015
- **File:** `packages/sdk/src/actions/borrow/providers/morpho/MorphoBorrowProvider.ts:190-229, 231-272`
- **Severity:** low · **Class:** correctness
- **Detail:** In `_depositCollateral`, `amountWei` resolves to `params.amount.amountWei` for the exact path (line 202) and is then encoded via `encodeMorphoSupplyCollateral` unconditionally (lines 213-215) — `buildMorphoCollateralApproval` returns undefined for `0n` but the supply leg is still pushed. In `_withdrawCollateral` the exact path takes `amountWei = params.amount.amountWei` (line 248) and always encodes `encodeMorphoWithdrawCollateral` (lines 252-257). There is no positivity guard for the exact-amount case (the max case is guarded for empty position). Same class as F015 (borrow amounts never validated positive) but on the collateral legs specifically: a caller passing `amount {amount:'0'}` gets a quote with a zero-value tx that wastes gas / reverts on-chain rather than failing fast in the SDK. Aave's `depositCollateral` rejects max but likewise does not reject an explicit zero.
- **Exploit/repro:** `wallet.borrow.depositCollateral({ market, amount: { amount: '0' } })` returns a quote whose collateral-supply leg is encoded with `0n` and dispatched, reverting/wasting gas on-chain instead of throwing in the SDK.
- **Recommendation:** Centralize a positivity check in `core/internalParams.ts` `toAmountWei` / the `buildSingleAmountInternalParams` path so every exact borrow/collateral amount must be `> 0n` (covering open borrowAmount, deposit, withdraw, repay, close), throwing `InvalidParamsError`. This subsumes F015 and these collateral legs in one place rather than per-provider guards.
- **suggestRefactor:** true · **Candidate issue:** #303 · **Relates to:** F015

---

## Surface: wallet-core

### F105 — `getSmartWallet`/`getWallet` never `isAddress`-validate caller-supplied `walletAddress` before it becomes the signed `to:` target of owner-management and deploy UserOps
- **Status:** NEW
- **File:** `packages/sdk/src/wallet/core/providers/WalletProvider.ts:97-131`
- **Severity:** medium · **Class:** malicious-sign
- **Detail:** `GetSmartWalletOptions.walletAddress` is typed `Address` (types/wallet.ts:26), a compile-time brand on `0x${string}` with zero runtime guarantee. In `WalletProvider.getSmartWallet` (lines 97-131) the caller's `walletAddressParam` is passed straight to `smartWalletProvider.getWallet` (line 126), which forwards it into `DefaultSmartWallet.create` as `deploymentAddress` (DefaultSmartWalletProvider.ts:181). `DefaultSmartWallet.getAddress()` returns it verbatim (DefaultSmartWallet.ts:574) and it becomes `this._address`, used as the `to:` of every signed owner-management call: `addSigner → addOwnerAddress` (line 314), `removeSigner → removeOwnerAtIndex` (line 403), and the account address fed to `getCoinbaseSmartAccount` for send/sendBatch UserOps (line 200). No `isAddress`/checksum check exists anywhere on this path, and no upstream validation in `actions.ts createWalletProvider`. A malformed, lowercase-mangled, truncated, or address-poisoned string (copy-paste, address book, untrusted UI input) is accepted and signed against. Distinct from F023 (ownerIndex/owners reconciliation) and F058 (dropped nonce) which assume a well-formed address; this is the missing format guard on the address itself. Sibling validation exists for other inputs (`sendTokens` recipient F035; signer arrays go through `getAddress` in `findSignerInArray`), so this is a gap-fill.
- **Exploit/repro:** `actions.wallet.getSmartWallet({ signer, walletAddress: '0xDEADBEEF' as Address })` — the truncated string is accepted; a subsequent `addSigner`/`removeSigner`/`send` signs a UserOp whose sender/`to` is a junk address, at best wasting a sponsored op, at worst (address-poisoning) operating on an attacker-chosen lookalike address the user believed was theirs.
- **Recommendation:** In `WalletProvider.getSmartWallet` (or `DefaultSmartWalletProvider.getWallet`), when `walletAddress` is provided, run `if (!isAddress(walletAddressParam)) throw new InvalidParamsError(...)` and normalize via `getAddress()` before using it as `deploymentAddress`. Mirror the `isAddress` usage already imported in `formatPublicKey.ts`.
- **suggestRefactor:** true · **Candidate issue:** #163 · **Relates to:** F023

### F106 — `getSmartWallet` validation branch uses throw-inside-try + `console.error(error)` + rethrow, emitting library-level logs from an SDK boundary
- **Status:** NEW
- **File:** `packages/sdk/src/wallet/core/providers/WalletProvider.ts:106-117`
- **Severity:** low · **Class:** info
- **Detail:** The neither-walletAddress-nor-deploymentSigners guard is written as a throw inside a try block whose catch does `console.error(error)` then re-throws the identical message (lines 107-116). Two problems: (1) an SDK has no business writing to the integrator's console — it pollutes their structured logs, and library `console.error` of caught Error objects is the A09 anti-pattern of uncontrolled log emission from a dependency (here it logs a full stack trace for a plain caller-input error); (2) the self-throw-then-catch-then-rethrow is pure dead control flow — the error object logged carries no info the thrown error does not. This is the only `console.*` call in the entire wallet/core tree (grep-confirmed), an inconsistency with the rest of the SDK which surfaces errors purely via thrown named errors.
- **Exploit/repro:** Call `getSmartWallet({ signer })` with neither `walletAddress` nor `deploymentSigners`: a full Error stack is printed to the host process stderr in addition to the thrown error.
- **Recommendation:** Replace the whole block with a single `throw new InvalidParamsError('Either walletAddress or deploymentSigners array must be provided to locate the smart wallet')` and drop the `console.error`. Leave logging decisions to the integrator's catch handler.
- **suggestRefactor:** true · **Candidate issue:** #474 · **Relates to:** —

### F107 — `findSignerIndexOnChain` runs an unbounded sequential read loop driven by `nextOwnerIndex` of a caller-influenced wallet address
- **Status:** NEW
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/utils/findSignerIndexOnChain.ts:39-65`
- **Severity:** low · **Class:** info
- **Detail:** `findSignerIndexOnChain` reads `nextOwnerIndex` from the smart wallet `address` (which, per F105, can originate from unvalidated caller input) and then issues one sequential `ownerAtIndex` `readContract` per index from `nextOwnerIndex-1` down to 0 (lines 47-63). There is no upper bound or batching: the iteration count is whatever the contract at the supplied address reports. If `address` points at a hostile or wrong contract returning a very large `nextOwnerIndex`, the SDK call fans out into an arbitrarily large number of serialized RPC round-trips (a self-inflicted DoS / latency amplification on the addSigner/removeSigner path, which calls this via `retryOnStaleRead`). RPC trust itself is out of scope, but the missing iteration cap and the lack of any sanity bound on a contract-returned counter is an appsec hardening gap independent of RPC honesty. Real Coinbase smart wallets keep this small, so impact is low and conditional on the address-validation gap.
- **Exploit/repro:** `getSmartWallet` with a `walletAddress` pointing at a contract whose `nextOwnerIndex()` returns a large value, then call `removeSigner` without an explicit `signerIndex`: the resolver loops once per owner slot with no ceiling.
- **Recommendation:** Cap the loop (a `MAX_OWNER_SCAN` constant, or multicall/batch the reads) and short-circuit with a clear error when `nextOwnerIndex` exceeds a sane bound, so a wrong/hostile address cannot turn one SDK call into thousands of sequential reads.
- **suggestRefactor:** true · **Candidate issue:** none · **Relates to:** —

---

## Surface: wallet-hosted

### dup:F092 — `isLocalAccount` structural guard runs BEFORE provider dispatch and never `isAddress`-validates `account.address`; a duck-typed object becomes a signing wallet
- **Status:** dup:F092
- **File:** `packages/sdk/src/wallet/core/namespace/WalletNamespace.ts:22-34, 193-201`
- **Severity:** medium · **Class:** malicious-sign
- **Detail:** Same root cause and file/lines as ledger F092 (`WalletNamespace.ts:22-34,190-206` — `isLocalAccount` type-guard accepts any object with `type:'local'`+function fields; no address/checksum or signer-capability validation before wrapping into a signing wallet). `toActionsWallet()` calls `isLocalAccount(params)` FIRST, before any provider dispatch; the guard only checks `typeof === 'object'`, `type === 'local'`, `address` is a string, and `signMessage`/`signTransaction` are functions — never `isAddress(record.address)`. Any object satisfying the duck-type routes straight into `LocalWallet.create({ account })`, bypassing the hosted provider's `validateOptions` and `getAddress()` normalization, and `LocalWallet` takes `account.address` verbatim. F092 already captures the missing address/checksum validation; this is the same gap viewed through the dispatch-ordering lens. Not re-filed.
- **Recommendation:** (per F092) Additionally require `isAddress(record.address)` (and ideally `getAddress` equality) before returning true; normalize via `getAddress(account.address)` in `LocalWallet`'s constructor.
- **suggestRefactor:** true · **Candidate issue:** none · **Relates to:** F092 (duplicate)

### refines:F092 — `isLocalAccount` admits accounts missing `signTypedData` (optional clause); EIP-712 / Permit2 / Aave credit-delegation / Morpho setAuthorization signing then fails at sign time instead of at wallet construction
- **Status:** refines:F092
- **File:** `packages/sdk/src/wallet/core/namespace/WalletNamespace.ts:32`
- **Severity:** low · **Class:** correctness
- **Detail:** Line 32 makes `signTypedData` optional: `(!('signTypedData' in record) || typeof record.signTypedData === 'function')`. An account with no `signTypedData` passes the guard and is wrapped into a signing `LocalWallet`. Several action flows depend on EIP-712 typed-data signing (Permit2 sub-approvals, Aave credit delegation / Morpho `setAuthorization` signatures noted in F083/F086, any future signed Permit2). With a typedData-less account, the failure surfaces only when the user attempts the action, mid-flow, rather than when the wallet is created. For a sign-capability gate this is the wrong place to be permissive. F092 flags the absence of signer-capability validation generally; this sharpens to the specific `signTypedData` optional clause and the EIP-712 flows it defers.
- **Exploit/repro:** Wrap a `type:'local'` account that omits `signTypedData`; `toActionsWallet` accepts it, and the first Permit2/credit-delegation sign throws mid-flow rather than at construction.
- **Recommendation:** Require `typeof record.signTypedData === 'function'` unconditionally in `isLocalAccount`, or document explicitly that typed-data-incapable accounts are unsupported and fail fast in `toActionsWallet` with a named error rather than at first EIP-712 sign.
- **suggestRefactor:** false · **Candidate issue:** none · **Relates to:** F092

### dup:F030 — Dynamic signer's raw-hash `sign()` strips the `0x` prefix off the EIP-712/transaction digest before `connector.signRawMessage`, while the other sign methods use a different backend
- **Status:** dup:F030
- **File:** `packages/sdk/src/wallet/react/wallets/hosted/dynamic/utils/createSigner.ts:28-33`
- **Severity:** medium · **Class:** malicious-sign
- **Detail:** Same root cause and file/lines as ledger F030 (Dynamic signer hand-rolls `sign()` with `0x` hex-stripping on a divergent backend) plus the pass-4 refines:F030/F062 entries. `sign()` does `message: hash.startsWith('0x') ? hash.slice(2) : hash` and forwards the un-prefixed hex to `connector.signRawMessage`, while `signMessage`/`signTransaction`/`signTypedData` route to `walletClient` — two signing backends never cross-checked, with no recovery self-test that the produced signature recovers to `walletClient.account.address`. Already captured. Not re-filed.
- **Recommendation:** (per F030) Confirm `signRawMessage`'s expected encoding and pass exactly that; add a unit test recovering the signer from the raw-hash signature and asserting it equals the account address; prefer routing all four sign methods through one backend.
- **suggestRefactor:** true · **Candidate issue:** none · **Relates to:** F030 (duplicate)

### dup:F031 — Turnkey caller-supplied `ethereumAddress` is used verbatim as the account address with no API round-trip to confirm it matches the key (verified against vendor source)
- **Status:** dup:F031
- **File:** `packages/sdk/src/wallet/node/wallets/hosted/turnkey/utils/createSigner.ts:25-31`
- **Severity:** medium · **Class:** malicious-sign
- **Detail:** Same root cause and file/lines as ledger F031 and the pass-4 refines:F031 (Turnkey caller-supplied `ethereumAddress` becomes the reported signing address with no reconciliation against the resolved `signWith` key; shortcut bypasses the API round-trip). Confirmed against `@turnkey/viem createAccount`: when `signWith` is a private-key ID AND `ethereumAddress` is provided, `ethereumAddress` is used directly without an API lookup; `TurnkeyWallet` sets `address = signer.address`, so a wrong `ethereumAddress` propagates as the wallet identity (lend onBehalfOf, smart-wallet owner, self-checks) while signatures come from a different key. Already captured. Not re-filed.
- **Recommendation:** (per F031/refines) When `signWith` is not itself an address, force the verified API lookup or perform a recover-signer self-test; at minimum `isAddress`-validate `ethereumAddress`/`signWith` and require a non-empty `organizationId`.
- **suggestRefactor:** true · **Candidate issue:** none · **Relates to:** F031 (duplicate)

### dup:F029 — Node Privy `createSigner` forwards caller address straight into `createViemAccount` where it is taken verbatim (`address as Hex`) as the account's reported address while signing is keyed on `walletId`
- **Status:** dup:F029
- **File:** `packages/sdk/src/wallet/node/wallets/hosted/privy/createSigner.ts:27-33`
- **Severity:** low · **Class:** malicious-sign
- **Detail:** Same root cause as ledger F029 (Node Privy caller-supplied address used as wallet identity, never reconciled with signing `walletId`) plus the pass-4 refines and F028 (createSigner skips the `getAddress` its `toActionsWallet` sibling applies). Verified against `@privy-io/node createViemAccount`: `toAccount({ address: address as Hex, sign: ... uses walletId ... })` — the reported `account.address` is whatever the caller passed; signatures are produced keyed on `walletId`; the two are never reconciled, and `PrivyWallet.address` is set to caller-supplied `params.address`. Already captured across F028/F029. Not re-filed.
- **Recommendation:** (per F029) Apply `getAddress()` in `createSigner` (parity with `toActionsWallet`); better, derive the reported address from the Privy `walletId` (authenticated lookup) or perform a recover-signer self-test.
- **suggestRefactor:** true · **Candidate issue:** none · **Relates to:** F029 (duplicate)

### dup:F033 — React hosted registry `validateOptions` are all unconditional `return true`; no shape validation on signing-key selectors at any registry choke point
- **Status:** dup:F033
- **File:** `packages/sdk/src/wallet/react/providers/registry/ReactHostedWalletProviderRegistry.ts:24, 41, 58`
- **Severity:** low · **Class:** info
- **Detail:** Same root cause and file as ledger F033 and the pass-4 refines:F033 (React hosted registry `validateOptions` unconditional `return true`; no centralized validation choke point). All three React factories implement `validateOptions` as `return true`, and the Node registry only checks `Boolean(client)`; the signing-key selectors (Turnkey `organizationId`/`signWith`/`ethereumAddress`, Privy `walletId`/`address`, Dynamic wallet) pass through with zero format/shape validation. Already captured. Not re-filed.
- **Recommendation:** (per F033) Give each `validateOptions` a real type-guard asserting provider-specific required fields are present and well-formed (non-empty strings; `isAddress` where the field is an address).
- **suggestRefactor:** true · **Candidate issue:** none · **Relates to:** F033 (duplicate)

---

## Surface: wallet-smart

### F108 — `formatPublicKey` silently passes non-address owner identifiers through verbatim into CREATE2 derivation and the on-chain owner comparison with no length/shape validation
- **Status:** NEW
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/utils/formatPublicKey.ts:9-14`
- **Severity:** medium · **Class:** correctness
- **Detail:** `formatPublicKey` is the only sanity gate applied to a string/Hex owner identifier on the smart-wallet path. It pads only when `isAddress(publicKey)` is true; for ANY other value it returns the input verbatim (line 13). It is invoked from the `_signerBytes` getter (DefaultSmartWallet.ts:104-109), which maps every signer through `getSignerPublicKey → formatPublicKey`, and that array feeds directly into (a) the factory `getAddress` CREATE2 read deriving the wallet's counterfactual address (DefaultSmartWallet.ts:580-585), (b) the factory `createAccount` deployment calldata (DefaultSmartWallet.ts:480), and (c) the on-chain owner comparison in `findSignerIndexOnChain` (lines 44, 59). A WebAuthn `publicKey` or any owner Hex that is not a canonical 20-byte address (a 33-byte compressed key, a truncated/over-long blob, or a malformed hex) is never asserted to be 32 or 64 bytes; it flows in as raw bytes. The Coinbase factory packs each owner entry into the initCode hash, so a malformed entry produces a *different but still-derivable* counterfactual address: the SDK computes and reports a wallet address the user funds, while the on-chain owner layout (and any later `isOwnerBytes`/`ownerAtIndex` check) disagrees. This is the appsec input-validation gap underneath F038/F064 (which cover the `addSigner` decode and `findSignerInArray` ignoring WebAuthn) but distinct: it is the address-DERIVATION path, where no entrypoint asserts the owner-bytes shape before CREATE2.
- **Exploit/repro:** `DefaultSmartWallet.create({ signer, signers: [signer.address, someWebAuthnAccountWithA33ByteOrTruncatedPublicKey] })`. `_signerBytes` maps the WebAuthn entry through `formatPublicKey` unchanged; `getAddress` returns a CREATE2 address computed over the malformed owner bytes. The user funds that address. The deployed contract initializes with the same malformed bytes (or reverts `InvalidOwnerBytesLength` on deploy), so the reported address either holds funds an owner set cannot control or never matches the intended owner layout.
- **Recommendation:** In `formatPublicKey`, reject inputs that are neither a valid 20-byte address (pad to 32) nor an exactly-64-byte WebAuthn public key: throw on any other size rather than returning verbatim. Equivalently, add an owner-bytes shape assertion (size === 32 after padding, or 64 for WebAuthn) at the `_signerBytes` boundary before the value reaches `getAddress`/`createAccount`, so a malformed owner identifier fails loudly at construction instead of producing a silently-wrong funded address.
- **suggestRefactor:** true · **Candidate issue:** #163 · **Relates to:** F038

### F109 — No smart-wallet entrypoint validates the caller-supplied `chainId` against the configured/supported chain set before it selects the signing client and the chain used for address derivation, deploy, and send
- **Status:** NEW
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:196-207, 261-294, 217-250, 456-500, 512-561, 573-587`
- **Severity:** low · **Class:** info
- **Detail:** Every public smart-wallet method (`send`, `sendBatch`, `addSigner`, `removeSigner`, `findSignerIndexOnChain`, `deploy`, `getCoinbaseSmartAccount`) accepts a `chainId: SupportedChainId` and passes it straight to `chainManager.getPublicClient`/`getBundlerClient` with no membership check that the chain is actually configured. `SupportedChainId` is a compile-time type only; at runtime an integrator-driven value (from a quote or user selection cast to `SupportedChainId`) is trusted. `getAddress` derives the counterfactual address from `getSupportedChains()[0]` (lines 577-579) while `send`/`deploy` operate on the passed `chainId`, so the address-derivation chain and the broadcast chain are never reconciled. The smart-wallet sibling of F022 (EOA chainId not validated against configured chains) and F095 (`ChainManager.getChain` no membership check). Recorded info-only because the concrete failure (wrong client / fallback RPC) sits behind the RPC-trust assumption that is out of scope; the SDK-side gap is the absence of a configured-chain membership assert at the wallet boundary.
- **Exploit/repro:** Call any smart-wallet method with a `chainId` not in the configured set (cast to `SupportedChainId`): `getPublicClient`/`getBundlerClient` resolve without rejecting the out-of-scope chain, and the address-derivation chain (`getSupportedChains()[0]`) is never reconciled against it.
- **Recommendation:** Add a single chainId-membership guard (`assert chainManager.getSupportedChains().includes(chainId)`) at the top of the send/sendBatch/deploy/addSigner/removeSigner entrypoints, mirroring the EOA fix (F022). Fail loud on an unconfigured chainId rather than letting `getPublicClient`/`getBundlerClient` fall back to a default/unintended client.
- **suggestRefactor:** false · **Candidate issue:** none · **Relates to:** F022

### refines:F011 — `send`/`sendBatch`/`deploy` catch blocks interpolate an unredacted bundler/paymaster `error.message` into a thrown string, the one place an external error string (potentially echoing signed callData/initCode bytes) reaches the caller
- **Status:** refines:F011
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:243-249, 287-293, 494-499`
- **Severity:** low · **Class:** info
- **Detail:** The generic `catch{}` in `send` (287-293), `sendBatch` (243-249), and `deploy` (494-499) builds the thrown message as `Failed to send transaction: ${error.message}` (and the deploy equivalent), passing through whatever string the bundler RPC, paymaster, or viem returns. From an appsec/secret-handling lens this is the only spot on the smart-wallet surface where externally-sourced text is concatenated into a thrown error that propagates to integrators and their logs. No private keys or signatures are constructed or logged here (the LocalAccount signs inside viem), so info-only, but bundler/viem error strings routinely embed the full UserOperation callData/initCode bytes (which, after `appendAttributionSuffix`, are the signed bytes); surfacing them verbatim in thrown errors integrators commonly log is an information-exposure footgun, and it collapses paymaster/nonce/signature/revert failures into one opaque class. The existing refines:F011 entry flags the `send`/`sendBatch` flattening; this sharpens to the unredacted external-string pass-through and adds the `deploy:494-499` location.
- **Exploit/repro:** Trigger a bundler/paymaster rejection on `send`/`deploy`; the rejection string (which may contain the full signed callData/initCode hex) is interpolated verbatim into the thrown `Failed to send transaction: ...` and surfaced to the integrator's logger.
- **Recommendation:** Wrap bundler/paymaster failures in a named error (e.g. `SmartWalletSendError`) that preserves the original as `cause` rather than string-interpolating `error.message`, and document that integrators must not log the raw cause at info level since it may contain full signed callData. Pairs with the F011 named-error refactor.
- **suggestRefactor:** true · **Candidate issue:** #474 · **Relates to:** F011

---

## Surface: core-services

### F110 — `validateSlippage` admits `NaN`: `slippage<0||slippage>max` is `false` for `NaN`, so a `NaN` slippage bypasses the shared range guard
- **Status:** NEW
- **File:** `packages/sdk/src/utils/validation.ts:111-115`
- **Severity:** medium · **Class:** correctness
- **Detail:** `validateSlippage(slippage, maxSlippage)` rejects only when `slippage < 0 || slippage > maxSlippage`. For `slippage = NaN` both comparisons evaluate to `false`, so NaN passes. This is the single shared slippage choke point called from `SwapProvider.validateSwapExecute` (SwapProvider.ts:449) for every execute/quote. Today a NaN that slips past reaches `computeSlippageBounds` (SwapProvider.ts:291) where `BigInt(Math.round(NaN*BPS))` throws 'Cannot convert NaN to a BigInt' — so it currently fails loud but late and with a confusing error rather than at the validation layer. The danger is defense-in-depth: the guard's contract is to bound slippage but it silently passes NaN; any future/sibling consumer that does not funnel `slippage` through `BigInt()` (a provider that multiplies amountOut by `(1 - slippage)` in float) would silently disable slippage protection and sign a swap with zero min-out enforcement. Numeric inputs reach this from caller-supplied `SwapExecuteParams.slippage`/`SwapQuoteParams.slippage` (number, unvalidated for finiteness).
- **Exploit/repro:** Verified: `function v(s,m){if(s<0||s>m)throw 0} v(NaN,0.5)` returns without throwing. With `slippage=NaN` forwarded to `SwapProvider`, `validateSlippage` passes and the call only errors later inside `computeSlippageBounds` via `BigInt(NaN)`.
- **Recommendation:** Add a finiteness check at the top of `validateSlippage` (`if (!Number.isFinite(slippage)) throw new SlippageOutOfRangeError(slippage, maxSlippage)`) so NaN/Infinity are rejected by the guard rather than by an incidental downstream `BigInt` throw. Apply the same `Number.isFinite` gate in `validateAmountPositiveIfExists`.
- **suggestRefactor:** true · **Candidate issue:** #303 · **Relates to:** F009

### F111 — `validateAmountPositiveIfExists` admits `NaN`/`Infinity`: `amount <= 0` is `false` for `NaN` and `+Infinity`
- **Status:** NEW
- **File:** `packages/sdk/src/utils/validation.ts:36-40`
- **Severity:** low · **Class:** correctness
- **Detail:** `validateAmountPositiveIfExists` guards with `amount !== undefined && amount <= 0`. For `amount = NaN` the `<= 0` is false (passes); for `amount = +Infinity` it is also false (passes); only `-Infinity` is caught. This shared guard is the positivity check on the swap value path (`SwapProvider.validateSwapExecute`, SwapProvider.ts:447-448). NaN/Infinity that pass here flow into `parseAssetAmount → parseDecimalAmount → parseUnits('NaN'/'Infinity', decimals)`, which throws downstream — so the bad input fails loud but at the parse layer with a non-domain error rather than as an `InvalidAmountError` at the validation boundary. Same class as F036 (smart-wallet sendTokens NaN) but at the shared swap validator, which F036 did not cover.
- **Exploit/repro:** Verified: `validateAmountPositiveIfExists(NaN)` and `(Infinity)` both return without throwing; `(-Infinity)` throws.
- **Recommendation:** Reject non-finite amounts explicitly: `if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) throw new InvalidAmountError(amount)`. Pairs with the `validateSlippage` fix (F110).
- **suggestRefactor:** true · **Candidate issue:** #379 · **Relates to:** F036

### refines:F066 — Recipient resolver (`strict:false`) vs `validateRecipient` (strict) mismatch: the zero-address guard silently no-ops on the exact non-checksummed inputs the resolver passes through
- **Status:** refines:F066
- **File:** `packages/sdk/src/utils/validation.ts:176-180`
- **Severity:** medium · **Class:** malicious-sign
- **Detail:** The swap recipient pipeline resolves via `BaseSwapNamespace.resolveRecipient → passthroughResolver` (utils.ts:21) or `resolveAddress` (utils.ts:47), both of which accept `isAddress(r, { strict: false })` and return the hex string VERBATIM (non-checksummed accepted). The only subsequent recipient sanity check is `validateRecipient` (validation.ts:176-180), which runs `if (recipient && isAddress(recipient))` using viem's DEFAULT strict `isAddress`. A non-checksummed (mixed-case-invalid) hex address therefore (a) passes the resolver and is baked into calldata for routers/protocols that encode recipient/onBehalf, yet (b) fails the strict `isAddress` in `validateRecipient`, so `validateNotZeroAddress` is never reached and the zero-address guard is skipped for exactly those inputs. Net effect: the one recipient guard on the pre-resolved swap path is defeated by the same malformed-but-parseable inputs the resolver admits, and no layer asserts the recipient is a syntactically canonical address before signing. F066 flags that `validateRecipient` only zero-checks; this sharpens to the strict/non-strict predicate mismatch between resolver and validator.
- **Exploit/repro:** Pass `recipient: '0xabc...DEF'` with an invalid checksum to `actions.swap.getQuote`/`execute`: `passthroughResolver`/`resolveAddress` accept it (`strict:false`) and return it unchanged into calldata, while `validateRecipient`'s strict `isAddress(recipient)` is false so `validateNotZeroAddress` is skipped.
- **Recommendation:** Make the resolvers normalize/checksum (use `getAddress(r)` instead of returning the raw string when `isAddress(strict:false)` is true), OR make `validateRecipient` use the same `strict:false` predicate plus a `getAddress`/zero-address check so the guard runs on every value the resolver could have produced. Aligning the two predicates closes the gap regardless of direction.
- **suggestRefactor:** true · **Candidate issue:** #437 · **Relates to:** F066

### F112 — `ChainManager` validates config `chainId`s against viem's global `chainById` registry, not the SDK's `SUPPORTED_CHAIN_IDS`; chain-scope rests on a bypassable TS type
- **Status:** NEW
- **File:** `packages/sdk/src/services/ChainManager.ts:198-202`
- **Severity:** low · **Class:** correctness
- **Detail:** `ChainManager` constructor → `createPublicClients` only rejects a config chain when `chainById[chainConfig.chainId]` is falsy (lines 199-202). `chainById` is viem/@eth-optimism's GLOBAL chain registry, far larger than the SDK's `SUPPORTED_CHAINS_TUPLE`. The type `ChainConfig.chainId` is `SupportedChainId`, but that is a compile-time constraint only; JS integrators or any `as`-cast can pass any number. A `chainId` that exists in viem but is not in `SUPPORTED_CHAIN_IDS` is silently accepted, a public client is built for it, and `getChain(chainId) = chainById[chainId]` returns a real Chain (lines 162-164) that then feeds EIP-155-bound clients/signatures. No runtime call to `validateChainSupported`/`SUPPORTED_CHAIN_IDS` guards `config.chains` anywhere (grep-confirmed it is enforced only inside per-action providers, not at `ChainManager`). The chain-scope invariant the SDK advertises is weaker than it appears at the infrastructure layer. The producer-side sibling of F095's `getChain` membership gap.
- **Exploit/repro:** Construct `Actions` with `chains: [{ chainId: <a viem-known but SDK-unsupported chain id> } as ChainConfig]`: `ChainManager` accepts it (`chainById` has it), builds a public client, and `getChain` returns it; nothing rejects the out-of-scope chain at the infra layer.
- **Recommendation:** In `createPublicClients`, additionally assert each `chainConfig.chainId` is in `SUPPORTED_CHAIN_IDS` (throw `ChainNotSupportedError` otherwise), so the runtime chain set cannot exceed the SDK's declared support regardless of TS casts. The producer-side complement of F095.
- **suggestRefactor:** true · **Candidate issue:** none · **Relates to:** F095

### F113 — `EnsNamespace.getInfo` returns attacker-controlled ENS text records (`url`/`avatar`/`email`/etc.) verbatim with no sanitization or doc warning
- **Status:** NEW
- **File:** `packages/sdk/src/services/nameservices/ens/EnsNamespace.ts:155-183`
- **Severity:** low · **Class:** info
- **Detail:** `getInfo` fetches ENSIP-5/18 text records (avatar, url, email, twitter, github, etc.) for an arbitrary, attacker-registerable ENS name and returns them as raw strings in `EnsInfo`. These values are fully controlled by whoever owns the ENS name's resolver. The SDK hands them back without normalization, scheme allowlisting, or a documented 'untrusted, sanitize before rendering' warning. An integrator that renders `info.avatar` into an `<img src>` or `info.url` into an `<a href>`/`fetch` inherits a stored-XSS (`javascript:`/`data:` URI) or SSRF/credential-leak vector seeded entirely from a name the end user typed. This is a consumer responsibility, but the SDK is the boundary that introduces externally-controlled data into the app, so it should at least document the trust level.
- **Exploit/repro:** Register an ENS name whose `url` text record is `javascript:alert(document.cookie)` (or `avatar` = a `data:`/internal-IP URL); `actions.ens.getInfo(name).url` returns it verbatim for the integrator to render/fetch.
- **Recommendation:** Document in the `getInfo` JSDoc that all returned fields are untrusted resolver-controlled text and must be sanitized/scheme-checked before rendering or fetching. Optionally normalize `avatar`/`url` to reject non-`http(s)` schemes at the SDK boundary. No behavioral change required if documented.
- **suggestRefactor:** false · **Candidate issue:** #371 · **Relates to:** F068

---

## Dedup summary

| Incoming (file:line) | Decision | Assigned/Target |
|----------------------|----------|-----------------|
| swap assets.ts:17-19,30-36 | refines | F041 |
| swap SwapProvider.ts:272-273,462-464 deadline | new | F097 |
| swap SwapProvider.ts:164-167 getQuote skips validateSlippage | refines | F001 |
| swap BaseSwapNamespace.ts:131-137,266-275 error swallow | new | F098 |
| swap velodrome v2.ts:250-273 recipient no isAddress | dup | F079 |
| lend LendProvider.ts:84-118,234-257 marketId.address no isAddress | new | F099 |
| lend morpho/api.ts:73-89 fetch no timeout | new | F100 |
| lend morpho/sdk.ts:538-579 reward values as any | new | F101 |
| lend aave/AaveLendProvider.ts error-string injection | refines | F011 |
| lend morpho/sdk.ts:434-459 dead findBestVaultForAsset | dup | F012 |
| lend LendProvider.ts:141-154 getMarkets bypass / asymmetry | new | F102 |
| borrow aave/AaveBorrowProvider.ts:47-54,174-186 marketId bind | new | F103 |
| borrow aave/marketId.ts:14-25 no checksum/verify helper | new | F104 |
| borrow morpho/MorphoBorrowProvider.ts collateral zero-amount | refines | F015 |
| wallet-core WalletProvider.ts:97-131 walletAddress no isAddress | new | F105 |
| wallet-core WalletProvider.ts:106-117 console.error | new | F106 |
| wallet-core findSignerIndexOnChain.ts:39-65 unbounded loop | new | F107 |
| wallet-hosted WalletNamespace.ts:22-34,193-201 isLocalAccount no isAddress | dup | F092 |
| wallet-hosted WalletNamespace.ts:32 missing signTypedData | refines | F092 |
| wallet-hosted dynamic/createSigner.ts:28-33 raw-hash sign | dup | F030 |
| wallet-hosted turnkey/createSigner.ts:25-31 ethereumAddress verbatim | dup | F031 |
| wallet-hosted privy/createSigner.ts:27-33 verbatim address | dup | F029 |
| wallet-hosted ReactHostedWalletProviderRegistry.ts validateOptions | dup | F033 |
| wallet-smart formatPublicKey.ts:9-14 verbatim into CREATE2 | new | F108 |
| wallet-smart DefaultSmartWallet.ts chainId membership | new | F109 |
| wallet-smart DefaultSmartWallet.ts catch interpolates bundler error | refines | F011 |
| core-services validation.ts:111-115 validateSlippage NaN | new | F110 |
| core-services validation.ts:36-40 validateAmountPositiveIfExists NaN/Inf | new | F111 |
| core-services validation.ts:176-180 strict mismatch | refines | F066 |
| core-services ChainManager.ts:198-202 producer-side chain validation | new | F112 |
| core-services EnsNamespace.ts:155-183 getInfo text records | new | F113 |
