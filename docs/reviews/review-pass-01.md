# Review Pass 01 — ce-code-review Baseline

- **Pass number:** 1
- **Skill:** ce-code-review (baseline)
- **Surfaces:** swap, lend, borrow, wallet-core, wallet-hosted, wallet-smart, core-services
- **Ledger state at start:** empty (`NEXT_ID: F001`); all findings are new seeds.

## Summary

| Severity | Count (incoming, by class/severity field) |
|----------|-------|
| high     | 5     |
| medium   | 11    |
| low      | 31    |
| of which class=info | 6 |
| **total incoming** | **47** |
| **new (IDs assigned)** | **45** (F001–F045) |
| **refines** | **1** (refines:F008) |
| **dup** | **1** (dup:F006) |

Dedup outcome: the ledger was empty, so 45 findings are filed new as **F001–F045**. One core-services finding (amount positivity/finiteness on lend+borrow) refines the lend amount-validation finding (**refines:F008**); one core-services finding (validateNotSameAsset symbol-only, same file `validation.ts:51`) duplicates the swap finding (**dup:F006**). `NEXT_ID` advances to **F046**.

### Notable highlights (cross-surface theme)

1. **Read-only `getQuote` / receipt paths are materially less validated than their sibling write/execute paths.** Swap `getQuote` skips the entire `validateSwapExecute` gate (F001); EOA and Smart wallet send/sendBatch never inspect `receipt.status`/`receipt.success`, so a reverted swap/lend/borrow/transfer is reported as success (F021, F022, F036).
2. **Amount positivity/finiteness validation is wired only into swap, absent on lend and borrow value paths** — `0`/negative/`NaN`/`Infinity` flow unguarded into `parseUnits` and then into `approve()`/deposit/borrow calldata (F008, F016, refined by the core-services umbrella).
3. **`recipient` is handled inconsistently across the swap value path** — approval allowance check uses `quote.recipient` as the token owner instead of the executing wallet (F002), and universal/CL router encoders silently drop the caller's recipient while v2/leaf honor it (F003).
4. **Hosted-wallet signing path has inconsistent address validation across siblings** — node Privy `createSigner` omits the `getAddress` check its own `toActionsWallet` enforces (F030); node PrivyWallet trusts a caller address never reconciled with the signing `walletId` (F031).
5. **Highest-severity titles:** F001 (swap getQuote validation gap), F008 (lend openPosition asset/market mismatch → wrong-token approval), F021/F022 (EOA send reverted-as-success / mid-batch revert continuation), F036 (smart send/sendBatch reverted-as-success).

Several findings map to existing issues: #435, #436, #444, #318, #493, #334, #303, #474, #209, #211, #163, #396, #456, #98, #477, #379, #133, #419, #255, #335.

---

## Findings by surface

### Surface: swap

> Reviewed the swap surface end-to-end: core/SwapProvider (validation gate, approval building, slippage math, params resolution), the three namespaces (Base/Actions/Wallet incl. the recipient-mismatch guard), the Uniswap V4 provider+encoding, the Velodrome provider+encoding (v2/leaf/universal routers and CL/Slipstream), shared markets helpers, and the validation/approve utilities. Dominant theme: the read-only getQuote path is materially less validated than the sibling execute path.

#### F001 — getQuote() skips blocklist, slippage, recipient, and same-asset validation that execute() enforces
- **Surface:** swap
- **File:line:** `packages/sdk/src/actions/swap/core/SwapProvider.ts:164-167`
- **Severity:** high · **Class:** correctness
- **Detail:** `SwapProvider.getQuote()` only calls `assertChainSupported` then delegates to `_getQuote`. The sibling `execute()` path runs the full `validateSwapExecute()` gate (lines 440-451): `validateNotSameAsset`, `validateMarketAllowed` (blocklist), `validateAssetOnChain`, `validateSlippage`, `validateRecipient`. None of these run on the quote path. Consequences: (1) a pair that is both allowlisted AND blocklisted gets a fully-encoded executable `SwapQuote` because `_getQuote` -> `resolveMarketConfig` (300-313) only checks `marketAllowlist`; the blocklist is only honored by `validateMarketAllowed`, which getQuote never calls. (2) `slippage` is passed straight into `resolveQuoteDefaults` -> `computeSlippageBounds` with no range check; `slippage > 1.0` makes `(BPS_DENOMINATOR - slippageBps)` negative (line 293), yielding a negative `amountOutMinRaw`. (3) `recipient` is not zero-address-checked, so a zero recipient flows into v2/leaf calldata. `executeFromQuote` (line 434) only re-validates expiry and routerAddress, so for explicit-recipient or provider-direct flows these bad quotes can reach calldata.
- **Exploit/repro:** `actions.swap.getQuote({assetIn, assetOut, amountIn, chainId, slippage: 5})` returns a quote whose `amountOutMinRaw` is negative; `getQuote` on a pair present in both allowlist and blocklist returns executable calldata even though `execute()` would reject the same pair.
- **Recommendation:** Hoist the value-relevant subset of `validateSwapExecute` (same-asset, market allowed/blocklist, slippage range, recipient zero-check) into `getQuote()` before calling `_getQuote`, or have `_getQuote` call `validateMarketAllowed` + `validateSlippage` + `validateRecipient`. At minimum enforce the blocklist and slippage range.
- **suggestRefactor:** true · **Candidate issue:** #435 · **Dedup:** new

#### F002 — Approval allowance check uses quote.recipient as the token owner instead of the executing wallet
- **Surface:** swap
- **File:line:** `packages/sdk/src/actions/swap/providers/uniswap/UniswapSwapProvider.ts:92`
- **Severity:** medium · **Class:** correctness
- **Detail:** `UniswapSwapProvider._buildApprovals` sets both `recipient: quote.recipient` AND `walletAddress: quote.recipient` (91-92). `buildPermit2Approvals` (SwapProvider.ts:349-363) then uses `params.walletAddress` as the `owner` for both the ERC20->Permit2 and Permit2->spender allowance checks. Same pattern in `VelodromeSwapProvider._buildApprovals` (line 220: `owner: quote.recipient`). The swap pulls input tokens from msg.sender (the wallet), not the recipient. On the raw-params path `resolveParams` sets `recipient = params.recipient ?? params.walletAddress` (line 466), so a caller passing `recipient != walletAddress` makes the approval check query the recipient's allowance. Result: a needed approval can be skipped (swap reverts) or a redundant approval emitted. WalletSwapNamespace masks this by enforcing recipient==wallet, but provider-direct and explicit-recipient raw paths do not.
- **Exploit/repro:** `provider.execute({...raw, walletAddress: A, recipient: B})` with A having approvals and B not: approvals are computed against B and the swap reverts when the router tries `transferFrom(A)`.
- **Recommendation:** Thread the true token owner (walletAddress / msg.sender) separately from recipient into `_buildApprovals` and use it as the allowance `owner`. Recipient should only affect output routing.
- **suggestRefactor:** true · **Candidate issue:** #436 · **Dedup:** new

#### F003 — Universal-router and CL swap paths silently ignore the caller-supplied recipient
- **Surface:** swap
- **File:line:** `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/v2.ts:225`
- **Severity:** medium · **Class:** correctness
- **Detail:** `encodeUniversalV2Swap` (v2.ts:225) and `encodeCLSwap` (cl.ts:152) hardcode the calldata recipient to `UNIVERSAL_ROUTER_MSG_SENDER` (address(1)), discarding the caller's `recipient`. The v2/leaf router path (`encodeRouterSwap`, v2.ts:257/265/272) encodes the caller's `recipient` directly. So for the same SDK call, output routing depends on which chain/router-type/pool-type is selected: Base Sepolia (universal) and all CL/Slipstream pools route output to msg.sender regardless of `recipient`. The direction is safe (funds go to the wallet, not lost), but it is an inconsistent, surprising contract across siblings.
- **Exploit/repro:** `wallet.swap.execute({assetIn, assetOut, amountIn, chainId: baseSepolia, recipient: thirdParty})` delivers output to the wallet, not thirdParty; same call on a CL pool on Base/Optimism behaves identically while the v2 path on the same chain would honor thirdParty.
- **Recommendation:** Either make all router paths honor `recipient` (decode the sentinel only when recipient==wallet) or reject a non-wallet `recipient` on universal/CL paths with an explicit error. At minimum document the invariant and add a provider guard before encoding.
- **suggestRefactor:** false · **Candidate issue:** #444 · **Dedup:** new

#### F004 — Native-in exact-output swap sends a placeholder 1-unit msg.value instead of maxAmountIn
- **Surface:** swap
- **File:line:** `packages/sdk/src/actions/swap/providers/uniswap/UniswapSwapProvider.ts:172`
- **Severity:** medium · **Class:** fund-loss
- **Detail:** For an exact-output swap with a native input asset, `_getQuote` sets `value: isNativeAsset(assetIn) ? (amountInRaw ?? 0n) : 0n` (line 172). `amountInRaw` comes from `resolveQuoteDefaults` which defaults the input to 1 when `params.amountIn` is undefined: `parseAssetAmount(params.assetIn, params.amountIn ?? 1)` (SwapProvider.ts:275). On the exact-output path `params.amountIn` is undefined, so `amountInRaw` is 1 ETH worth, not the quoted `maxAmountIn`. The V4 SETTLE_ALL action requires msg.value to cover `maxAmountIn`. If the true input exceeds 1 unit the swap reverts; if below, the user overpays 1 ETH and relies on unguaranteed router refund behavior. No test coverage for native-input exact-output.
- **Exploit/repro:** `getQuote({assetIn: ETH (native), assetOut: USDC, amountOut: N, chainId})` yields `execution.value == 1e18` regardless of real ETH cost; executing reverts (underpaid) or overpays.
- **Recommendation:** For native-input exact-output, set `value` to the encoded `maxAmountIn` (the slippage-buffered `quote.amountInRaw`). Add a test asserting `execution.value` equals the encoded `amountInMaximum`.
- **suggestRefactor:** false · **Candidate issue:** none · **Dedup:** new

#### F005 — Encoded minAmountOut/maxAmountIn recomputed independently of the quote's reported slippage bounds
- **Surface:** swap
- **File:line:** `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:252`
- **Severity:** low · **Class:** correctness
- **Detail:** `computeSlippageBounds` (SwapProvider.ts:286-298) computes the `amountOutMin` reported on the SwapQuote using `slippageBps = round(slippage*10000)`. The Uniswap encoder recomputes the calldata value independently: `minAmountOut = quote.amountOutRaw * round((1-slippage)*10000) / 10000` (encoding.ts:252) for exact-in and `maxAmountIn = quote.amountInRaw + quote.amountInRaw*round(slippage*10000)/10000` (line 271) for exact-out. The formulas agree for clean slippage but can diverge by a wei for odd slippages due to differing float rounding. The number reported to the user is therefore not guaranteed to equal the number enforced on-chain.
- **Exploit/repro:** Choose a slippage where `round((1-s)*1e4) != 1e4-round(s*1e4)`; the quote's `amountOutMin` differs from the `minAmountOut` encoded in `swapCalldata`.
- **Recommendation:** Pass the already-derived `amountOutMinRaw` (and a symmetric `amountInMaxRaw`) from the provider into the encoder instead of recomputing from `slippage`.
- **suggestRefactor:** true · **Candidate issue:** #318 · **Dedup:** new

#### F006 — Same-asset guard compares only token symbols, not addresses/chain identity
- **Surface:** swap
- **File:line:** `packages/sdk/src/utils/validation.ts:51`
- **Severity:** low · **Class:** correctness
- **Detail:** `validateNotSameAsset` (validation.ts:51-58) rejects a swap only when `assetIn.metadata.symbol.toLowerCase() === assetOut.metadata.symbol.toLowerCase()`. It never compares resolved on-chain addresses. Two distinct tokens sharing a symbol (legit USDC vs a look-alike, or differently-bridged variants) would be wrongly rejected; conversely the symbol is attacker-influenced metadata, so it is not a reliable identity. The rest of the swap surface keys on addresses (containsPairByAddress, resolvePoolParams), making this the one place identity falls back to symbol. Low severity because downstream pool resolution would also fail.
- **Exploit/repro:** Two assets with symbol 'USDC' but different addresses are rejected as same-asset even though they form a valid pair.
- **Recommendation:** Compare resolved addresses on the target chain (with native/wrapped normalization) in addition to the symbol when both resolve to an address; keep the symbol check as a fallback.
- **suggestRefactor:** false · **Candidate issue:** #493 · **Dedup:** new (later duplicated by core-services finding, see dup:F006)

#### F007 — Explicit-provider getQuote/getQuotes bypasses the isMarketSupported eligibility filter
- **Surface:** swap
- **File:line:** `packages/sdk/src/actions/swap/namespaces/BaseSwapNamespace.ts:58`
- **Severity:** low · **Class:** correctness
- **Detail:** In `BaseSwapNamespace.getQuote` (58-65) and `getQuotes` (92-100), when `params.provider` is set the code resolves that named provider and calls `getQuote` directly, skipping the `isMarketSupported` filter the price-routing branch applies (`fetchAllQuotes`, 250-264). Combined with F001, an explicitly-named provider will attempt to quote any pair, relying solely on `_getQuote`/`resolveMarketConfig` (allowlist only) to fail. This is the path most likely to surface a blocklisted-pair quote.
- **Exploit/repro:** `actions.swap.getQuote({provider: 'uniswap', assetIn, assetOut, amountIn, chainId})` on a blocklisted pair returns a quote because neither the namespace filter nor a blocklist check runs.
- **Recommendation:** Run `validateMarketAllowed`/`isMarketSupported` for the explicitly-named provider before quoting.
- **suggestRefactor:** false · **Candidate issue:** #435 · **Dedup:** new

---

### Surface: lend

> Reviewed packages/sdk/src/actions/lend/** plus actions/shared/aave/** and actions/shared/morpho/**. Dominant concern: the deposit path (openPosition) does not verify the caller-supplied asset matches the routed market's underlying, unlike the withdraw path (closePosition).

#### F008 — openPosition does not validate caller asset matches the market underlying (closePosition does); Morpho approves the wrong token to the vault
- **Surface:** lend
- **File:line:** `packages/sdk/src/actions/lend/core/LendProvider.ts:84-118`
- **Severity:** high · **Class:** fund-loss
- **Detail:** `closePosition()` calls `validateMarketAsset(market, params.asset)` (LendProvider.ts:205-207), but `openPosition()` (84-118) never validates that `params.asset` matches the routed market's underlying. For Morpho (`MorphoLendProvider._openPosition`, 53-77) the deposit calldata `MetaMorphoAction.deposit(amount, receiver)` carries no asset argument — the vault pulls its own fixed underlying. So `openPosition({ asset: WETH, marketId: <USDC vault>, amount })` builds an ERC-20 approval for WETH to the vault while the vault's deposit will `transferFrom` USDC. Result: a granted allowance on the unintended token plus a returned `LendTransaction` describing the wrong asset; the deposit typically reverts. For Aave the `supply(asset,...)` calldata echoes the caller asset (internally consistent), but the missing guard still lets a deposit build against a mismatched market with no early rejection.
- **Exploit/repro:** `wallet.lend.openPosition({ asset: WETH, marketId: <allowlisted USDC MetaMorpho vault>, amount: 1 })` returns transactionData with `approve(vault, amount)` on WETH and a vault deposit; signing grants WETH allowance to the vault and the deposit reverts.
- **Recommendation:** In `openPosition()`, after `validateMarketAllowed`, fetch the market and call `validateMarketAsset(market, params.asset)` before building the deposit, mirroring `closePosition`. Reject mismatches with `MarketNotAllowedError`.
- **suggestRefactor:** false · **Candidate issue:** #334 · **Dedup:** new

#### F009 — No positive/non-zero amount validation on lend open/close amounts (swap sibling validates it)
- **Surface:** lend
- **File:line:** `packages/sdk/src/actions/lend/core/LendProvider.ts:84-118`
- **Severity:** medium · **Class:** correctness
- **Detail:** `openPosition` (line 90) and `closePosition` (line 215) convert `params.amount` straight through `parseAssetAmount` -> `parseUnits` with no prior guard. The swap sibling validates this (SwapProvider.ts:446-448). A zero amount produces a 0-value supply/withdraw; a negative amount is stringified and passed to `parseUnits`, yielding a negative bigint that flows into `approve(spender, amount)` and the supply/withdraw uint256 argument; a NaN/fractional amount causes an opaque `parseUnits` throw. `validateAmountPositiveIfExists` already exists in utils/validation.ts.
- **Exploit/repro:** `wallet.lend.openPosition({ asset, marketId, amount: 0 })` builds a real approval+supply tx for 0; `amount: -5` feeds a negative value into `parseUnits`/`approve`.
- **Recommendation:** Add `validateAmountPositiveIfExists(params.amount)` (and a non-undefined check) at the top of `openPosition`/`closePosition`. Reject `amount <= 0` with `InvalidAmountError`.
- **suggestRefactor:** false · **Candidate issue:** #303 · **Dedup:** new

#### F010 — marketBlocklist config field is accepted and address-validated but never enforced on any lend path
- **Surface:** lend
- **File:line:** `packages/sdk/src/actions/lend/core/LendProvider.ts:234-257`
- **Severity:** medium · **Class:** correctness
- **Detail:** `LendProviderConfig` declares `marketBlocklist` (types/lend/base.ts:201) and `validateAddresses.ts:94-106` validates its addresses, but `validateMarketAllowed` (234-257) only consults `marketAllowlist`; grep shows zero references to blocklist anywhere under src/actions/lend/. A developer who blocklists a market still has open/close/getMarket succeed against it. The blocklist is silently inert — a safety-config footgun.
- **Exploit/repro:** Configure `lend.morpho.marketBlocklist = [vaultX]`; `wallet.lend.openPosition` against vaultX still builds and dispatches a deposit.
- **Recommendation:** Either enforce `marketBlocklist` in `validateMarketAllowed` (and `getProviderForMarket` routing), or remove the field. Add a test asserting a blocklisted market is rejected.
- **suggestRefactor:** true · **Candidate issue:** #334 · **Dedup:** new

#### F011 — Catch-all blocks in provider open/close/getPosition flatten precise named errors into generic messages
- **Surface:** lend
- **File:line:** `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts:79-83`
- **Severity:** low · **Class:** correctness
- **Detail:** `_openPosition` (AaveLendProvider.ts:59-84), `_closePosition` (92-120), `_getPosition` (160-210) and the Morpho equivalents (MorphoLendProvider.ts:51-83, 95-132, 175-218) wrap their whole body in `try {...} catch { throw new Error('Failed to ...') }`. This swallows `ChainNotSupportedError`, `MarketNotAllowedError`, `AssetNotSupportedOnChainError` and RPC errors into an opaque message that drops the cause. Tests lock in this lossy behavior. Inconsistent too: `closePosition`'s base-class `getMarket` call escapes the catch and surfaces its real message.
- **Exploit/repro:** Call `openPosition` on a chain with no Aave pool: instead of `ChainNotSupportedError` the caller receives `'Failed to open position with <amount> of <symbol>'`.
- **Recommendation:** Drop the blanket catch (or rethrow already-typed SDK errors unchanged and only wrap genuinely-unknown errors with `{ cause }`). Align with #474.
- **suggestRefactor:** true · **Candidate issue:** #474 · **Dedup:** new

#### F012 — Dead helper findBestVaultForAsset matches asset addresses across all chains (chain-agnostic)
- **Surface:** lend
- **File:line:** `packages/sdk/src/actions/lend/providers/morpho/sdk.ts:434-459`
- **Severity:** low · **Class:** correctness
- **Detail:** `findBestVaultForAsset` filters the allowlist with `Object.values(vault.asset.address).includes(asset)` — testing the asset address against the asset's address map for EVERY chain, ignoring which chain the asset/vault is on, then returns `assetVaults[0].address`. The error path hard-codes `chainId: 0` (line 452). Not exported and has no callers (dead code), but a latent cross-chain mis-routing bug if wired up.
- **Exploit/repro:** Static: `assetVaults = allowlist.filter(v => Object.values(v.asset.address).includes(asset))` ignores chainId.
- **Recommendation:** Delete the unused helper, or make it chain-aware (filter by `marketId.chainId` and `asset.address[chainId]`) and propagate the real chainId.
- **suggestRefactor:** true · **Candidate issue:** none · **Dedup:** new

#### F013 — Morpho close uses assets-denominated withdraw with no full-balance / rounding handling
- **Surface:** lend
- **File:line:** `packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts:107-114`
- **Severity:** low · **Class:** correctness
- **Detail:** `_closePosition` builds `MetaMorphoAction.withdraw(assets = params.amount, receiver, owner)`, an exact-assets ERC-4626 withdraw. To fully close, a caller must pass the exact current underlying balance, but balance accrues between read and execution; a slightly-stale balance can exceed `maxWithdraw` and revert, or leave residual shares. Aave supports `type(uint256).max` as withdraw-all; Morpho's `withdraw(assets,...)` has no such sentinel and there is no `redeem(shares)` path. A UI "withdraw max" is prone to off-by-accrual reverts.
- **Exploit/repro:** `getPosition` -> balance B; `closePosition({ amount: B })` one block later: `vault.maxWithdraw < B`, withdraw reverts, or leaves dust shares.
- **Recommendation:** Offer a shares-based `redeem` path (or a `closeAll` flag) so full closes are not sensitive to inter-block accrual. Add a full-close rounding test.
- **suggestRefactor:** false · **Candidate issue:** #209 · **Dedup:** new

#### F014 — Aave getReserve constructs a fresh ethers JsonRpcProvider from chain default RPC, bypassing the integrator client
- **Surface:** lend
- **File:line:** `packages/sdk/src/actions/lend/providers/aave/sdk.ts:108-118`
- **Severity:** low · **Class:** info
- **Detail:** `getReserve` creates a new ethers `JsonRpcProvider` from `publicClient.chain.rpcUrls.default.http[0]` (110-118) to drive the Aave UiPoolDataProvider, rather than reusing the integrator-configured ChainManager transport. Reserve data feeding APY/market metadata comes from the chain's hard-coded default public RPC. RPC trust is out of scope, so recorded as info; noted because the rest of the lend path reads through `chainManager.getPublicClient`, making this the one spot reading off a different endpoint.
- **Exploit/repro:** Static: `ethersProvider = new providers.JsonRpcProvider(publicClient.chain?.rpcUrls.default.http[0])` ignores the configured transport.
- **Recommendation:** Info only. If/when the Aave SDK dep is removed (#211), route reserve reads through the same chainManager client.
- **suggestRefactor:** false · **Candidate issue:** #211 · **Dedup:** new

> Note: the lend amount-validation gap (F009) is the same root cause the core-services pass frames as a cross-cutting umbrella; see refines:F008 in the core-services section.

---

### Surface: borrow

> Reviewed the full borrow surface: core (BorrowProvider base, validations, internalParams, quote assembly, markets routing), namespaces, and both providers (Aave V3, Morpho Blue). Signing-path tamper protections are strong. Top finding: no borrow path validates amounts are positive/non-zero.

#### F015 — Borrow amounts are never validated as positive/non-zero, unlike the swap sibling
- **Surface:** borrow
- **File:line:** `packages/sdk/src/actions/borrow/core/internalParams.ts:129-140`
- **Severity:** medium · **Class:** correctness
- **Detail:** No borrow write path validates the user-supplied amount is positive. `toAmountWei` (129) calls `parseDecimalAmount` -> `parseUnits`, which accepts a leading '-' and produces a NEGATIVE bigint for `{ amount: -5 }`; the `{ amountRaw: bigint }` branch passes any bigint (negative or 0n) through unchecked. These flow into projection math and calldata: `projectAavePositionState` clamps via `max0` (presentation.ts:132-135), so a quote built from a negative `borrowAmount` PRESENTS a healthy position while the encoded `Pool.borrow`/`Morpho.borrow` calldata carries a garbage amount. The swap sibling guards this via `validateAmountProvided` + `validateAmountPositiveIfExists` (SwapProvider.ts:446-448).
- **Exploit/repro:** `actions.borrow.getQuote({ action:'open', market, walletAddress, borrowAmount:{ amount:-100 } })` encodes a negative bigint into `Pool.borrow`/`Morpho.borrow` calldata while the projected position is clamped to look unchanged. Same for `{ amountRaw: 0n }`.
- **Recommendation:** In `BorrowProvider`'s public write methods (or the `buildXInternalParams` builders), reject non-`max` amounts that are `<= 0` (both variants, after wei conversion) with `InvalidAmountError`. Apply uniformly to open/repay/deposit/withdrawCollateral/close.
- **suggestRefactor:** true · **Candidate issue:** none · **Dedup:** new

#### F016 — getMarkets accepts a public `markets` array that bypasses the provider allowlist
- **Surface:** borrow
- **File:line:** `packages/sdk/src/actions/borrow/core/BorrowProvider.ts:215-236`
- **Severity:** low · **Class:** correctness
- **Detail:** `GetBorrowMarketsParams.markets?: BorrowMarketConfig[]` (types/borrow/market.ts:203) is a PUBLIC field, commented 'used internally' but not private. `BorrowProvider.getMarkets` (232-235) passes `params.markets ?? filtered`, and `_getMarkets` reads each via `_getMarket` with NO allowlist/blocklist check. Every other borrow path resolves a trusted config via `requireAllowlistedBorrowMarketConfig` (validations.ts:42). A caller passing `{ markets: [arbitraryConfig] }` makes the SDK read arbitrary reserve/oracle addresses and surface them as a 'borrow market'. Read-only (no signing), hence low.
- **Exploit/repro:** `actions.borrow.getMarkets({ markets: [{ kind:'aave-v3', chainId, marketId, aave:{ collateralReserve: attackerToken, debtReserve: attackerToken }, ... }] })` returns a fabricated market with attacker-chosen APY/LTV/liquidation data.
- **Recommendation:** Drop `markets` from the public type (move to internal-only), or filter `params.markets` through `requireAllowlistedBorrowMarketConfig`/`filterMatchingConfigs` against the allowlist before reading; apply the blocklist too.
- **suggestRefactor:** true · **Candidate issue:** #334 · **Dedup:** new

#### F017 — Morpho marketId<->marketParams integrity is verified for the allowlist but not the blocklist
- **Surface:** borrow
- **File:line:** `packages/sdk/src/actions/borrow/providers/morpho/MorphoBorrowProvider.ts:79-88`
- **Severity:** low · **Class:** correctness
- **Detail:** The Morpho constructor verifies each `marketAllowlist` entry's `marketId == keccak256(marketParams)` via `verifyMorphoMarketId`, throwing `BorrowMarketParamsMismatchError` (79-87) — the load-bearing guard stopping calldata built from spliced `marketParams`. The `marketBlocklist` (matched only by `marketIdMatches`) is never integrity-checked. A blocklist entry with a garbage `marketId` silently fails to block the intended market. Lower severity because blocklist is dev-config, but the asymmetry gives a false sense of exclusion.
- **Exploit/repro:** Configure a blocklist entry whose marketId does not match its marketParams; the intended-to-be-blocked market still resolves and executes because blocklist matching is by id only.
- **Recommendation:** Run `verifyMorphoMarketId` over `marketBlocklist` entries (kind==='morpho-blue') in the constructor.
- **suggestRefactor:** false · **Candidate issue:** #334 · **Dedup:** new

#### F018 — safeCeilingLtv can go negative when healthBufferPct is misconfigured > 1
- **Surface:** borrow
- **File:line:** `packages/sdk/src/actions/borrow/core/quote.ts:54`
- **Severity:** low · **Class:** correctness
- **Detail:** `assembleBorrowQuote` computes `safeCeilingLtv: args.positionAfter.maxLtv * (1 - args.healthBufferPct)` (54). `healthBufferPct` resolves per-market -> settings -> 0.05 and is never validated within [0,1). A config of `1.5` yields a negative `safeCeilingLtv`; any value > 1 makes the safe ceiling meaningless, so a UI/agent gating borrow size on it could under- or over-borrow. Config-time input, hence low.
- **Exploit/repro:** Construct a provider with `settings.healthBufferPct = 1.5`; every quote's `safeCeilingLtv` is negative.
- **Recommendation:** Validate `healthBufferPct` in [0,1) at construction (throw `InvalidParamsError`), or clamp the `1 - healthBufferPct` factor to `>= 0`.
- **suggestRefactor:** false · **Candidate issue:** none · **Dedup:** new

#### F019 — Aave depositCollateral rejects `max` but Morpho accepts it — divergent sibling behavior
- **Surface:** borrow
- **File:line:** `packages/sdk/src/actions/borrow/providers/aave/quote.ts:153-167`
- **Severity:** low · **Class:** info
- **Detail:** `buildAaveDepositCollateralQuoteArgs` throws `InvalidParamsError` for `{ max: true }` on depositCollateral (160-166), citing the native-ETH gateway path. Morpho's `_depositCollateral` resolves `max` to the wallet's full collateral-token balance (MorphoBorrowProvider.ts:202). The same public call answers differently across providers with no type-level signal. Not fund-loss, but an API-consistency gap.
- **Exploit/repro:** `actions.borrow.depositCollateral({ amount:{max:true} })` throws on an Aave market but deposits the full balance on a Morpho market.
- **Recommendation:** Decide one contract: reject uniformly (and reflect in the type), or support it on Aave for the non-gateway ERC-20 path. Document the native-ETH limitation.
- **suggestRefactor:** false · **Candidate issue:** #493 · **Dedup:** new

---

### Surface: wallet-core

> Reviewed packages/sdk/src/wallet/core/** (EOAWallet, DefaultSmartWallet + provider, abstract Wallet/SmartWallet, WalletNamespace/WalletProvider, executeTransactionBatch, retryOnStaleRead, signer utils). Dominant gap: the EOA value-moving path never inspects receipt.status.

#### F020 — EOAWallet.send returns a reverted receipt as success (no status check)
- **Surface:** wallet-core
- **File:line:** `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:62-73`
- **Severity:** high · **Class:** correctness
- **Detail:** `EOAWallet.send` calls `waitForTransactionReceipt({ hash })` and returns the receipt unconditionally. viem's `waitForTransactionReceipt` RESOLVES (does not throw) for mined-but-reverted transactions, and `EOATransactionReceipt` is typed `status: 'success' | 'reverted'`. Nothing in EOAWallet, executeTransactionBatch, or the lend/swap/borrow namespaces inspects `receipt.status`. So `wallet.lend.lend(...)`, `wallet.swap.swap(...)`, `wallet.borrow.*` over an EOA can return a reverted receipt treated as success. Sibling asymmetry: the SmartWallet signer-op path throws `TransactionConfirmedButRevertedError`/`SmartWalletDeploymentError` on `!receipt.success`.
- **Exploit/repro:** Mock `waitForTransactionReceipt` to resolve `{ status: 'reverted', transactionHash }`; `wallet.send(tx, chainId)` resolves with no error; the swap/lend namespace wraps it as a successful receipt.
- **Recommendation:** After `waitForTransactionReceipt`, throw `TransactionConfirmedButRevertedError(receipt)` when `receipt.status === 'reverted'`. Add a unit test. Return the reverted receipt via the thrown error's `receipt` field if callers need it.
- **suggestRefactor:** true · **Candidate issue:** none · **Dedup:** new

#### F021 — EOAWallet.sendBatch continues signing subsequent txs after a mid-batch revert
- **Surface:** wallet-core
- **File:line:** `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:90-100`
- **Severity:** high · **Class:** fund-loss
- **Detail:** `sendBatch` loops `for (const tx of transactionData) { const receipt = await this.send(tx, chainId); receipts.push(receipt) }`. Because `send` never throws on revert (F020), a revert in tx N does not stop tx N+1 from being signed and broadcast. Dispatch builds ordered batches like `[tokenApproval, permit2Approval, swap]` or `[approve, deposit]`. If the approval reverts, the EOA still signs and sends the value-moving step, executing out of its intended precondition ordering, and the caller still receives a complete-looking receipt array. The documented contract ('each transaction is awaited to inclusion before the next is signed') implies inclusion-as-success semantics the code does not enforce.
- **Exploit/repro:** Mock tx0 `status:'reverted'`, tx1 `status:'success'`; `sendBatch([tx0,tx1])` sends both and returns `[reverted, success]` with no error.
- **Recommendation:** With the F020 fix (`send` throws on revert), the `await this.send(...)` loop short-circuits on the first reverted tx. Add a test: a 2-tx batch where tx0 reverts must throw and must NOT call `sendTransaction` for tx1.
- **suggestRefactor:** true · **Candidate issue:** none · **Dedup:** new

#### F022 — EOAWallet.send/sendBatch accept any chainId without validating against configured chains
- **Surface:** wallet-core
- **File:line:** `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:62-73`
- **Severity:** low · **Class:** correctness
- **Detail:** `send` -> `walletClient(chainId)` -> `chainManager.getChain(chainId)`, and `getChain` is `return chainById[chainId]` with NO existence check (unlike `getPublicClient`/`getChainConfig` which throw `ChainNotSupportedError`). For an unconfigured-but-known chainId, `getChain` returns a chain object while `getTransportForChain` falls back to `http()` (default transport). The send can then be built against an unintended/default endpoint. The smart-wallet path is protected because `getBundlerClient`/`getPublicClient` validate.
- **Exploit/repro:** Call `wallet.send(tx, <id not in chainConfigs>)`; `getChain` returns a chain and `getTransportForChain` returns default `http()` rather than throwing.
- **Recommendation:** Validate chainId is in `chainManager.getSupportedChains()` at the top of `send`/`sendBatch` (or make `getChain` throw `ChainNotSupportedError`). A `validateChainSupported` helper exists in utils/validation.ts.
- **suggestRefactor:** false · **Candidate issue:** none · **Dedup:** new

#### F023 — getSmartWallet with walletAddress but no signers pins ownerIndex to 0 / owners to [signer]
- **Surface:** wallet-core
- **File:line:** `packages/sdk/src/wallet/core/providers/WalletProvider.ts:97-131`
- **Severity:** medium · **Class:** correctness
- **Detail:** `getSmartWallet`/`getWallet` create via `DefaultSmartWallet.create({ signers, signer, deploymentAddress: walletAddress })`. When the caller supplies `walletAddress` + `signer` but omits `signers` (a supported shape), `create` defaults `signers = [signer.address]` and `ensureLocalAccountSigner` resolves `signerIndex = 0`. `getCoinbaseSmartAccount` is built with `ownerIndex: 0` and `owners: [signer.address]` regardless of the signer's actual on-chain owner index. For a multi-owner wallet where the signer is index !=0, every send/sendBatch UserOperation encodes the wrong ownerIndex and reverts. Unlike addSigner/removeSigner (which reconcile via `findSignerIndexOnChain`), the send path never reconciles.
- **Exploit/repro:** Deploy a 2-owner wallet with the EOA at index 1; call `getSmartWallet({ walletAddress, signer })` without signers; any send() builds ownerIndex 0 and the UserOp reverts at signature validation.
- **Recommendation:** When `walletAddress` is provided without full `signers`, resolve the signer's on-chain owner index via `findSignerIndexOnChain` during init, or require `signers`/`deploymentSigners`, throwing otherwise. Document that omitting signers only works for single-owner wallets where the signer is owner 0.
- **suggestRefactor:** true · **Candidate issue:** #163 · **Dedup:** new

#### F024 — Wallet base constructor attaches action namespaces but never initializes the wallet address
- **Surface:** wallet-core
- **File:line:** `packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts:90-100`
- **Severity:** medium · **Class:** correctness
- **Detail:** The abstract `Wallet` constructor eagerly attaches lend/swap/borrow namespaces (which capture `wallet`), but `initialize()`/`performInitialization()` (which sets `_address`) is only invoked by the concrete `create()` factories. Nothing in the base enforces that public value-moving methods are gated on initialization. For DefaultSmartWallet, `get address` throws if `_address` is unset, but the namespaces are already attached, so a caller obtaining a Wallet through any path that skips `initialize()` can invoke `wallet.swap.swap()` -> dispatch -> send against an uninitialized wallet. The address-throw is the only backstop and is per-subclass.
- **Exploit/repro:** Construct a DefaultSmartWallet without awaiting `initialize` (bypassing create); `wallet.address` throws, but the namespace was already wired, so the failure surfaces deep in dispatch.
- **Recommendation:** Gate send/sendBatch (or namespace dispatch) on an `initialized` flag in the base class, or assert `_address` is set in DefaultSmartWallet.send/sendBatch before building the UserOp.
- **suggestRefactor:** true · **Candidate issue:** #396 · **Dedup:** new

#### F025 — deploy() catch wraps all errors into SmartWalletDeploymentError and drops the receipt
- **Surface:** wallet-core
- **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:494-499`
- **Severity:** low · **Class:** info
- **Detail:** In `deploy`, the inner `SmartWalletDeploymentError('deployment transaction reverted', chainId, receipt)` (with receipt attached) is thrown, then caught by the outer `catch (error)` which rethrows a NEW `SmartWalletDeploymentError('Failed to deploy...: ${error.message}', chainId)` WITHOUT the receipt. The post-mortem receipt is lost and the message is double-wrapped. `createWallet`'s filter still classifies it as failure, but consumers lose the receipt.
- **Exploit/repro:** Force the deploy UserOp to revert: `createWallet` returns a failure whose `error.receipt` is undefined despite a receipt existing.
- **Recommendation:** In the outer catch, rethrow the original error if already a `SmartWalletDeploymentError` (preserving chainId/receipt); only wrap unknown errors.
- **suggestRefactor:** false · **Candidate issue:** none · **Dedup:** new

#### F026 — isValidAttributionSuffix has dead null-guard and misleading byte-count message
- **Surface:** wallet-core
- **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:178-188`
- **Severity:** low · **Class:** info
- **Detail:** `isValidAttributionSuffix(suffix: Hex)` opens with `if (suffix == null) return`, but the only caller guards with `if (params.attributionSuffix)` first, so the null branch is dead; a null/empty suffix would be silently accepted as 'valid'. The function name/return type imply a boolean while it actually throws. Low impact (suffix only affects calldata attribution, not value), but the contract is muddy.
- **Exploit/repro:** (none provided)
- **Recommendation:** Drop the dead null-guard (or make it throw), and align the method to consistently throw on invalid input.
- **suggestRefactor:** false · **Candidate issue:** none · **Dedup:** new

#### F027 — EOAWallet.sendBatch silently returns [] for empty input while executeTransactionBatch rejects it
- **Surface:** wallet-core
- **File:line:** `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:90-100`
- **Severity:** low · **Class:** correctness
- **Detail:** `executeTransactionBatch` throws `'executeTransactionBatch: empty transaction list'` for an empty list, but `EOAWallet.sendBatch([])` silently returns `[]` (asserted by an EOA test). The two entrypoints disagree on whether an empty batch is an error. A caller building a degenerate empty batch (e.g. a swap path where all txs were filtered out by a bug) gets a benign-looking empty success array.
- **Exploit/repro:** `await wallet.sendBatch([], chainId)` resolves to `[]` with no error.
- **Recommendation:** Decide one contract: make sendBatch throw on empty (matching executeTransactionBatch) or document that empty batches are a no-op. Prefer throwing.
- **suggestRefactor:** false · **Candidate issue:** none · **Dedup:** new

> Note: the swap/lend/borrow namespaces consume these EOA receipts unchecked; the smart-wallet equivalent of the receipt-status gap is filed separately as F036.

---

### Surface: wallet-hosted

> Reviewed the wallet-hosted surface: core abstract HostedWalletProvider + registry, node Privy/Turnkey providers/wallets/createSigner utils, react Privy/Turnkey/Dynamic equivalents, registries and type maps, tests/mocks. Dominant findings: missing/inconsistent obvious validation across siblings on the signing path.

#### F028 — Node Privy createSigner skips the getAddress validation its sibling toActionsWallet applies
- **Surface:** wallet-hosted
- **File:line:** `packages/sdk/src/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.ts:87-95`
- **Severity:** medium · **Class:** malicious-sign
- **Detail:** `toActionsWallet` (67) checksums/validates the caller address via `getAddress(params.address)` (spec asserts it throws on '0x123'). The sibling `createSigner` (87-95) forwards `params.address` straight into `createViemAccount(privyClient, { walletId, address })` with NO `getAddress`/`isAddress`. Both are public entrypoints (WalletNamespace/WalletProvider forward caller params). A malformed/non-checksummed address that `toActionsWallet` rejects is silently accepted by `createSigner`, producing a `LocalAccount` whose `.address` is the passed string. That signer is used for EOA txs and installed as a Coinbase smart-wallet owner (signs userOp hashes) — a signing path.
- **Exploit/repro:** `await wallet.createSigner({ walletId: 'id', address: '0x123' })` returns a LocalAccount instead of throwing; the equivalent `toActionsWallet` call rejects.
- **Recommendation:** Apply `address: getAddress(params.address)` in `createSigner` (or move the `getAddress` call into node utils/createSigner.ts so both paths share it). Add a `createSigner` test asserting it throws on an invalid address.
- **suggestRefactor:** true · **Candidate issue:** none · **Dedup:** new

#### F029 — Node PrivyWallet reports caller-supplied address that is never reconciled with the signing walletId
- **Surface:** wallet-hosted
- **File:line:** `packages/sdk/src/wallet/node/wallets/hosted/privy/PrivyWallet.ts:36`
- **Severity:** medium · **Class:** correctness
- **Detail:** PrivyWallet sets `this.address = params.address` (36) from caller input, and `createViemAccount(privyClient, { walletId, address })` uses that same caller address as the LocalAccount address while actually signing via `walletId`. `address` and `walletId` are independent inputs, never cross-checked. A mismatched walletId/address makes the wallet operate getBalance/transfers against `address` while producing signatures recoverable to the key behind `walletId` (a different address). Every sibling derives `this.address = this.signer.address` (react Privy, node/react Turnkey, react Dynamic); the node Privy wallet is the lone outlier trusting an unverified caller address.
- **Exploit/repro:** Construct PrivyWallet with walletId for wallet A and address of wallet B: `wallet.address` returns B, but signatures recover to A; no error.
- **Recommendation:** After signer creation in `performInitialization`, assert `this.address` (getAddress) equals `this.signer.address` and throw on mismatch, OR derive `this.address` from `this.signer.address` like every sibling.
- **suggestRefactor:** true · **Candidate issue:** none · **Dedup:** new

#### F030 — Dynamic signer hand-rolls sign() with 0x hex-stripping on a different code path than its other sign methods
- **Surface:** wallet-hosted
- **File:line:** `packages/sdk/src/wallet/react/wallets/hosted/dynamic/utils/createSigner.ts:28-37`
- **Severity:** medium · **Class:** correctness
- **Detail:** The Dynamic createSigner builds a LocalAccount where signMessage/signTransaction/signTypedData come from walletClient, but `sign` (raw-hash) is hand-implemented: `connector.signRawMessage({ accountAddress, message: hash.startsWith('0x') ? hash.slice(2) : hash })`. It is the only provider that (a) manually strips 0x and (b) routes raw-hash signing through `connector.signRawMessage` instead of walletClient. viem calls `account.sign({ hash })` with a 0x-prefixed 32-byte digest when this account is a Coinbase smart-wallet owner signing userOp hashes. If `signRawMessage` expects the 0x prefix or re-hashes/prefixes the input, stripping 0x yields a signature over the wrong digest — silently rejected on-chain or valid over unintended data. The Dynamic SDK is a peer dep not installed here, so the exact contract could not be verified.
- **Exploit/repro:** Use a Dynamic-backed hosted signer as a smart-wallet owner; sign a userOp. If signRawMessage's expected encoding differs from the stripped bare-hex, the recovered signer/signature mismatches and the userOp fails or signs an unintended digest. No test asserts the exact bytes.
- **Recommendation:** Verify against the Dynamic WaaS connector docs whether signRawMessage expects a 0x-prefixed hash and whether it re-hashes. Add a unit test asserting the bytes passed match what viem hands `account.sign`, and that a userOp signed through this owner verifies. Prefer reusing the Dynamic SDK's own viem account abstraction.
- **suggestRefactor:** true · **Candidate issue:** none · **Dedup:** new

#### F031 — Turnkey signer forwards ethereumAddress/signWith with no format validation
- **Surface:** wallet-hosted
- **File:line:** `packages/sdk/src/wallet/node/wallets/hosted/turnkey/utils/createSigner.ts:25-31`
- **Severity:** low · **Class:** correctness
- **Detail:** Both node and react Turnkey createSigner forward `ethereumAddress` and `signWith` straight into `@turnkey/viem` `createAccount` with no validation. `ethereumAddress`, when supplied, is used directly as the account address. Unlike the node Privy provider (which checksums via `getAddress` in `toActionsWallet`), no Turnkey path applies `getAddress`/`isAddress`, and `signWith` is not checked for non-empty. A malformed `ethereumAddress` becomes the LocalAccount.address and then `this.address`, feeding getBalance with no early failure. Same class as F028 on the sibling provider.
- **Exploit/repro:** `createSigner({ client, organizationId, signWith: '', ethereumAddress: '0xABC...nonchecksummed' })` is accepted; the account address is the unvalidated string.
- **Recommendation:** Normalize `ethereumAddress` with `getAddress` (and reject empty `signWith`) before passing to `createAccount`. Add a test covering a malformed address.
- **suggestRefactor:** true · **Candidate issue:** none · **Dedup:** new

#### F032 — Test adequacy: no coverage for createSigner address validation or address/walletId mismatch
- **Surface:** wallet-hosted
- **File:line:** `packages/sdk/src/wallet/node/providers/hosted/privy/__tests__/PrivyHostedWalletProvider.spec.ts:120-141`
- **Severity:** low · **Class:** info
- **Detail:** The createSigner test only passes a well-formed mock address (always checksummed via `getRandomAddress`), never exercising the missing-getAddress gap (F028). No test anywhere constructs a hosted wallet with an address that does not match its walletId/signer, so the reconciliation gap (F029) is entirely unguarded. The existing tests assert the happy path but cannot fail when the validation invariant is violated.
- **Exploit/repro:** N/A (test-gap); see F028/F029 for the underlying behavior.
- **Recommendation:** Add (1) a createSigner test asserting it throws on an invalid/non-checksummed address; (2) a test asserting node PrivyWallet derives address from signer or throws when caller address and signer.address disagree.
- **suggestRefactor:** false · **Candidate issue:** #335 · **Dedup:** new

#### F033 — Hosted provider validateOptions only checks truthiness of the client handle, not its shape
- **Surface:** wallet-hosted
- **File:line:** `packages/sdk/src/wallet/node/providers/hosted/registry/NodeHostedWalletProviderRegistry.ts:24-26`
- **Severity:** low · **Class:** info
- **Detail:** Both node factories validate config by `Boolean(options?.privyClient)` / `Boolean(options?.client)`. Any truthy value (a plain object, a wrong-SDK client, a stub) passes `validateOptions` and is accepted as the signing backend. There is no verification it is a Privy/Turnkey client, so a misconfiguration surfaces only later as an opaque failure inside createViemAccount/createAccount. Trust-adjacent and low; recorded as info.
- **Exploit/repro:** `factory.validateOptions({ privyClient: {} })` returns true even though `{}` is not a usable PrivyClient; the error only manifests at signer-creation time.
- **Recommendation:** Duck-type `validateOptions` against a known method on the expected client so an obviously-wrong handle is rejected at config time with `ProviderNotConfiguredError`.
- **suggestRefactor:** true · **Candidate issue:** none · **Dedup:** new

---

### Surface: wallet-smart

> Reviewed DefaultSmartWallet (4337 send/sendBatch, deploy, addSigner/removeSigner, sendTokens, attribution suffix, deterministic address), the abstract SmartWallet base, signer utils, constants, and SmartWalletDeploymentError; cross-referenced EOAWallet, executeTransactionBatch, the lend/swap/borrow namespaces, and viem v2 internals.

#### F034 — send() and sendBatch() ignore UserOperation receipt.success — a reverted swap/lend/borrow/transfer is reported as success
- **Surface:** wallet-smart
- **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:261-294, 217-250`
- **Severity:** high · **Class:** correctness
- **Detail:** `send` (L282-286) and `sendBatch` (L237-242) return the `waitForUserOperationReceipt` result WITHOUT inspecting `receipt.success`. In ERC-4337 a UserOperation can be mined-but-reverted (`success === false`, no exception). Every value-moving path routes through these via `executeTransactionBatch` (L34/L36), and none of `WalletLendNamespace`/`WalletSwapNamespace`/`WalletBorrowNamespace` inspect `.success`. A swap/deposit/borrow/repay/transfer that reverts on-chain (slippage, allowance, failed transfer) is surfaced as a successful receipt. Sibling inconsistency: `addSigner` (L350-357), `removeSigner` (L414-419), `deploy` (L486-492) DO check `.success` and throw.
- **Exploit/repro:** Call `wallet.swap.execute(...)` (or `wallet.send(transfer, chainId)`) with a tx that reverts (e.g. ERC20 transfer exceeding balance, or a swap that breaks minOut). The UserOp mines with `success:false`; `send`/`sendBatch` return it with no error; the namespace returns success. No test covers `success:false`.
- **Recommendation:** After `waitForUserOperationReceipt`, check `receipt.success` and throw `TransactionConfirmedButRevertedError(receipt)` when false, mirroring addSigner/removeSigner/deploy.
- **suggestRefactor:** true · **Candidate issue:** none · **Dedup:** new

#### F035 — sendTokens() does not validate recipientAddress is a real address — only checks falsy
- **Surface:** wallet-smart
- **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:512-561`
- **Severity:** medium · **Class:** correctness
- **Detail:** `sendTokens` guards `if (!recipientAddress) throw` (L518-520) but never validates the value is a valid EVM address via `isAddress`. A malformed-but-truthy string flows into the native transfer `to` (L540) or the ERC20 `transfer(recipientAddress, amount)` encoding (L553). Sibling value-moving paths enforce recipient correctness (`WalletSwapNamespace.ts` L94, `WalletBorrowNamespace.ts` L211 assert `isAddressEqual(quote.recipient, wallet.address)`); the recipient on the wallet's own transfer helper is the one unguarded address. A bad address can route funds to an unrecoverable destination.
- **Exploit/repro:** `wallet.sendTokens(1, asset, chainId, '0x1234')` passes the falsy check and encodes an ERC20 transfer to a malformed address.
- **Recommendation:** Add `if (!isAddress(recipientAddress)) throw new Error('Invalid recipient address')` (viem `isAddress`) alongside the falsy check.
- **suggestRefactor:** false · **Candidate issue:** none · **Dedup:** new

#### F036 — sendTokens() amount check `amount <= 0` does not reject NaN or non-finite values
- **Surface:** wallet-smart
- **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:522-525,536-561`
- **Severity:** low · **Class:** correctness
- **Detail:** The guard is `if (amount <= 0) throw` (L523). `NaN <= 0` is `false`, so `NaN` and `Infinity` pass and reach `parseAssetAmount(asset, amount)` -> `parseDecimalAmount`, yielding a wrong/zero/garbage bigint encoded into a real transfer value. `amount` is typed `number`, so callers can produce NaN from a bad parse.
- **Exploit/repro:** `wallet.sendTokens(Number('abc'), asset, chainId, recipient)` -> amount is NaN, passes `<=0`, gets parsed and encoded.
- **Recommendation:** Strengthen to `if (!Number.isFinite(amount) || amount <= 0) throw`.
- **suggestRefactor:** false · **Candidate issue:** #379 · **Dedup:** new

#### F037 — send/sendBatch prepare the UserOperation twice; the explicit prepare result is discarded except callData/initCode
- **Surface:** wallet-smart
- **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:224-236,266-281`
- **Severity:** low · **Class:** correctness
- **Detail:** `send`/`sendBatch` call `bundlerClient.prepareUserOperation({account, calls, paymaster:true})` then `bundlerClient.sendUserOperation({account, callData: appendAttributionSuffix(uo.callData), initCode, paymaster:true})`. In viem v2 `sendUserOperation`, when an `account` is supplied it internally re-runs `prepareUserOperation`. Because the second call passes `callData`/`initCode` and NOT `calls`, the suffixed values are preserved (attribution survives), but gas, fees, nonce, paymaster stub, and signature are re-estimated, making the first round-trip pure waste and an extra bundler/RPC dependency on the hot signing path. The gas numbers the caller might inspect from `uo` are not the ones sent.
- **Exploit/repro:** Instrument `prepareUserOperation`; observe it is invoked twice per `send`/`sendBatch`.
- **Recommendation:** Build the suffixed UO once: append the suffix to `prepared.callData`/`initCode` and pass the FULL prepared request to `sendUserOperation` without re-triggering prepare, or document why the double-prepare is intentional.
- **suggestRefactor:** true · **Candidate issue:** #456 · **Dedup:** new

#### F038 — addSigner WebAuthn path decodes publicKey as two bytes32 with no length validation
- **Surface:** wallet-smart
- **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:322-335`
- **Severity:** low · **Class:** correctness
- **Detail:** For a `webAuthn` signer, `decodeAbiParameters([{type:'bytes32'},{type:'bytes32'}], signer.publicKey)` (L323-326) assumes `publicKey` is exactly 64 bytes (x||y), with no length check. If a caller supplies a `WebAuthnAccount` whose `publicKey` is not the bare 64-byte form (e.g. a 65-byte 0x04-prefixed key), `decodeAbiParameters` throws or mis-splits x/y, and `addOwnerPublicKey(x,y)` registers the WRONG owner key — a security-relevant misconfiguration (a passkey the user does not control could be granted ownership). The same-file `isValidAttributionSuffix` validates `size(suffix) === 16`, so precedent exists.
- **Exploit/repro:** Pass a `webAuthn` signer with a 65-byte publicKey to `addSigner`; x/y are mis-derived and an unintended owner key is added (or the call reverts after consuming a UserOperation).
- **Recommendation:** Validate `size(signer.publicKey) === 64` before decoding, throwing a clear error on mismatch.
- **suggestRefactor:** false · **Candidate issue:** none · **Dedup:** new

#### F039 — removeSigner does not cross-check that the caller-provided signerIndex actually holds the given signer
- **Surface:** wallet-smart
- **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:390-422`
- **Severity:** low · **Class:** correctness
- **Detail:** When `signerIndex` is provided (L393-396), `removeSigner` skips the on-chain lookup and encodes `removeOwnerAtIndex(BigInt(signerIndex), formatPublicKey(getSignerPublicKey(signer)))`. The contract reverts with `WrongOwnerAtIndex` on a mismatch, but there is no client-side guard ensuring the index corresponds to the signer before spending a sponsored UserOperation. A stale/incorrect index wastes a UO and gets a generic revert. Lower severity because the contract enforces the invariant; flagged as a missing-validation gap relative to `addSigner` which resolves the index from chain.
- **Exploit/repro:** `wallet.removeSigner(signerA, chainId, indexOfSignerB)`; the UO is built and broadcast, then reverts on-chain with WrongOwnerAtIndex.
- **Recommendation:** Optionally verify the provided `signerIndex` via `ownerAtIndex(index)` equals the formatted signer bytes before sending, or document that the caller owns index correctness; surface a clearer error than the raw revert.
- **suggestRefactor:** false · **Candidate issue:** #163 · **Dedup:** new

#### F040 — Deterministic wallet address derived from a single chain's RPC read (getSupportedChains()[0])
- **Surface:** wallet-smart
- **File:line:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:573-587`
- **Severity:** low · **Class:** info
- **Detail:** `getAddress` reads the CREATE2 address from the factory on `getSupportedChains()[0]` only (L577-585) and assumes the factory and result are identical across all chains. The smart wallet `address` (used as from/owner for every send, transfer, addSigner, removeSigner) depends entirely on one chain's RPC. RPC trust is out of scope, so recorded as info; noted because a wrong address mis-targets every downstream value-moving operation.
- **Exploit/repro:** N/A (RPC-trust, info only).
- **Recommendation:** No action under the current RPC-trust assumption. If hardening: compute the CREATE2 address locally from initCodeHash + owners + nonce, or cross-check across configured chains.
- **suggestRefactor:** false · **Candidate issue:** #98 · **Dedup:** new

---

### Surface: core-services

> Reviewed packages/sdk/src/services/**, core/error, utils/**, constants/**, types/**, index*.ts through the fund-safety / missing-validation lens.

#### (refines:F008) — Amount positivity/finiteness validation exists for swap but is absent on the lend and borrow value paths
- **Surface:** core-services
- **File:line:** `packages/sdk/src/utils/validation.ts:27-49`
- **Severity:** high · **Class:** fund-loss
- **Detail:** `validateAmountPositiveIfExists` and `validateAmountProvided` (validation.ts:27-49) are only invoked on the swap path (SwapProvider.ts:446-448). The sibling lend and borrow value paths never call them. `LendProvider.openPosition` (84-90) goes straight to `parseAssetAmount` with no amount check; the borrow path (`internalParams.ts:129-131` `toAmountWei` -> `parseDecimalAmount`) likewise has no guard. So `0`/negative/`NaN`/`Infinity` is not rejected before `parseUnits` (via `parseDecimalAmount`, utils/assets.ts:17-19). `parseUnits` does `amount.toString()`, so a negative amount parses to a NEGATIVE bigint flowing into `approve(spender, amount)` and deposit/borrow calldata; `NaN`/`Infinity` yield malformed calldata. This is the shared/umbrella framing of the per-surface findings F009 (lend) and F015 (borrow).
- **Exploit/repro:** `actions.lend.openPosition({ amount: -5, asset, marketId })` -> `parseUnits('-5', d)` -> negative bigint into approve()/deposit calldata; `{ amount: NaN }` -> `parseUnits('NaN', d)`.
- **Recommendation:** Add `validateAmountProvided`/`validateAmountPositiveIfExists` (extended to reject non-finite numbers) to the lend openPosition/closePosition and borrow open/repay/deposit/withdraw entry points, mirroring `SwapProvider.validateSwapExecute`.
- **suggestRefactor:** true · **Candidate issue:** #477
- **Dedup:** refines:F008 — same root cause as the lend (F009/F008) and borrow (F015) amount-validation gaps; this is the cross-cutting shared-util framing. No new ID consumed.

#### F041 — parseDecimalAmount feeds number.toString() to parseUnits, producing scientific notation for small/large amounts
- **Surface:** core-services
- **File:line:** `packages/sdk/src/utils/assets.ts:17-19`
- **Severity:** medium · **Class:** correctness
- **Detail:** `parseDecimalAmount(amount, decimals)` calls `parseUnits(amount.toString(), decimals)`. JS `Number.toString()` emits scientific notation below 1e-6 (e.g. `(0.0000001).toString() === '1e-7'`) and at/above 1e21. viem's `parseUnits` expects a plain decimal string and does not parse scientific notation, so a legitimate small/large human-readable amount throws inside `parseUnits` rather than converting. Every value path taking a human number (lend openPosition, borrow, Wallet transfer via parseAssetAmount) funnels through this helper. Numbers above `Number.MAX_SAFE_INTEGER` also silently lose precision before stringification.
- **Exploit/repro:** Request `0.0000001 WBTC` (8 decimals) or a very large notional -> opaque failure or wrong amount.
- **Recommendation:** Normalize to a non-exponential decimal string before `parseUnits` (accept a string amount, or format via fixed-notation, or require string/bigint outside the safe number range). Reject non-finite and out-of-safe-range inputs with a clear error.
- **suggestRefactor:** true · **Candidate issue:** #379 · **Dedup:** new

#### F042 — getApprovalDeficit + buildApprovalTxIfNeeded approve the DEFICIT, but ERC-20 approve sets (not increments) the allowance
- **Surface:** core-services
- **File:line:** `packages/sdk/src/utils/approve.ts:184-216`
- **Severity:** medium · **Class:** correctness
- **Detail:** `getApprovalDeficit` returns `amount - current` (192) and `buildApprovalTxIfNeeded` builds `approve(spender, deficit)` (201-216, 162-176). Standard ERC-20 `approve(spender, value)` SETS the allowance to value, not adds. So when current=300000 and required=500000, this produces `approve(spender, 200000)`, leaving the allowance at 200000 — still below 500000 — and the subsequent transfer/swap reverts. The correct value is the full amount (or 0-then-amount for reset-required tokens). The unit test asserts the tx exists but never decodes the calldata amount. These helpers have no production callers today (no live impact), but they are exported SDK utilities and a latent trap.
- **Exploit/repro:** Static: with current=300000, required=500000, the helper emits `approve(spender, 200000)`; allowance stays at 200000 < 500000.
- **Recommendation:** Either remove the deficit semantics and approve the full required amount, or, if a top-up model is intended, emit `increaseAllowance` and document the token requirement. Update the test to decode and assert the approved amount.
- **suggestRefactor:** true · **Candidate issue:** #133 · **Dedup:** new

#### F043 — resolveAddress / EnsNamespace.getAddress accept and return non-checksummed hex recipients unchecked
- **Surface:** core-services
- **File:line:** `packages/sdk/src/services/nameservices/ens/utils.ts:43-47`
- **Severity:** low · **Class:** correctness
- **Detail:** `resolveAddress` returns a hex input verbatim when `isAddress(input, { strict: false })` is true (47), and `EnsNamespace.getAddress` caches/returns it unchanged (78-87), despite both JSDocs promising a checksummed hex address. With `strict:false`, a mixed-case address that fails EIP-55 (likely a typo) passes through unmodified and is used as the swap recipient (swap/module.ts:23 -> SwapProvider). Downstream `validateRecipient` (validation.ts:176-180) only checks the zero address. viem's `getAddress` at the calldata boundary would re-checksum/reject, limiting blast radius, but the SDK silently propagates an address whose checksum it could have validated. `validateAddress` (70-81) uses strict `isAddress` for walletAddress; recipient resolution does not.
- **Exploit/repro:** A bad-checksum recipient passes through `resolveAddress`/`EnsNamespace.getAddress` unflagged.
- **Recommendation:** Return `getAddress(input)` (checksummed) from `resolveAddress` for the hex branch, or validate with strict `isAddress` and throw on checksum failure. Key the EnsNamespace cache on a normalized form.
- **suggestRefactor:** true · **Candidate issue:** none · **Dedup:** new

#### F044 — serializeBigInt return type lies (bigint fields become strings) and silently drops Map/Set/Date/undefined
- **Surface:** core-services
- **File:line:** `packages/sdk/src/utils/serializers.ts:15-21`
- **Severity:** low · **Class:** correctness
- **Detail:** `serializeBigInt<T>(obj: T): T` round-trips through `JSON.parse(JSON.stringify(...))`. The declared return type `T` is false at runtime: every bigint field is now a string, so downstream code trusting the type and doing bigint arithmetic on, e.g., `amountInRaw` would string-concatenate, producing wrong amounts at a serialization boundary handling balances. JSDoc warns but the type does not encode it. Additionally `JSON.stringify` drops undefined/function values, stringifies Date, and converts Map/Set to `{}`. For a fund-display surface (CLI stdout / HTTP responses), a silently-coerced amount is a correctness risk.
- **Exploit/repro:** Static: a bigint field becomes a string after `serializeBigInt`, so downstream `+` concatenates rather than adds.
- **Recommendation:** Change the signature to a `Serialized<T>` mapped type that turns bigint into string (callers opt into the string view), or return `unknown`/`JsonValue`. Guard/reject the Map/Set/Date cases.
- **suggestRefactor:** true · **Candidate issue:** #419 · **Dedup:** new

#### (dup:F006) — validateNotSameAsset compares by symbol only, missing same-address/different-symbol collisions and over-rejecting same-symbol/different-address pairs
- **Surface:** core-services
- **File:line:** `packages/sdk/src/utils/validation.ts:51-58`
- **Severity:** low · **Class:** correctness
- **Detail:** `validateNotSameAsset` rejects a swap only when `assetIn.metadata.symbol.toLowerCase() === assetOut.metadata.symbol.toLowerCase()` (51-58), the only same-asset guard on the swap path (SwapProvider.ts:441). Two token entries resolving to the SAME contract address but with different symbols are NOT caught, so a no-op self swap can be quoted/executed. Conversely two different tokens sharing a ticker (scam clones) are incorrectly blocked. The robust invariant is address equality on the execution chain. This is the same file and same root cause as F006 (filed first under the swap surface).
- **Exploit/repro:** Two assets resolving to the same on-chain address with different symbols pass the guard; two different addresses sharing a ticker are wrongly blocked.
- **Recommendation:** Compare resolved on-chain addresses for `params.chainId` (via `getAssetAddress`, handling the native sentinel) and reject when equal; keep the symbol check as a fast-path.
- **suggestRefactor:** true · **Candidate issue:** #493 · **Dedup:** dup:F006 (same file `validation.ts:51`, same root cause; no new ID consumed)

#### F045 — getTransportForChain falls back to viem default public RPC (http()) when no rpcUrls configured
- **Surface:** core-services
- **File:line:** `packages/sdk/src/services/ChainManager.ts:180-185`
- **Severity:** low · **Class:** info
- **Detail:** When a configured chain has no `rpcUrls`, `getTransportForChain` returns a bare `http()` transport (182-184), which viem points at its built-in default public endpoint. Public default RPCs are rate-limited and are a trust boundary the integrator did not explicitly choose; balance reads (tokenBalance.ts), allowance checks (approve.ts), and quote pricing flow through an endpoint the SDK selected silently. RPC trust is out of scope per the standing rules, so recorded as info: a foot-gun that a missing/empty rpcUrls config degrades to an implicit public RPC rather than failing loudly.
- **Exploit/repro:** Configure a chain with no rpcUrls; reads and quote pricing silently route through viem's default public endpoint.
- **Recommendation:** Consider failing loudly (or warning) when a chain is configured with no rpcUrls. No action required under current RPC-trust scope.
- **suggestRefactor:** false · **Candidate issue:** #255 · **Dedup:** new

---

## Dedup ledger summary for this pass

| Surface | Incoming | New IDs | Other dispositions |
|---------|----------|---------|--------------------|
| swap | 7 | F001–F007 | — |
| lend | 7 | F008–F014 | — |
| borrow | 5 | F015–F019 | — |
| wallet-core | 8 | F020–F027 | — |
| wallet-hosted | 6 | F028–F033 | — |
| wallet-smart | 7 | F034–F040 | — |
| core-services | 7 | F041–F045 (5 new) | refines:F008 (amount validation umbrella); dup:F006 (validateNotSameAsset) |

ID accounting cross-check: 7 + 7 + 5 + 8 + 6 + 7 + 5 = **45 new IDs (F001–F045)**, plus 1 refines (folds into F008/F009 amount finding) and 1 dup (F006). Total incoming dispositions = 47. `NEXT_ID` advances to **F046**.

The ledger table is authoritative for canonical ID assignment.
