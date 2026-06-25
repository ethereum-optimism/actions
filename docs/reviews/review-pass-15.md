# Review Pass 15 — Frontend (ce-code-review, review-only)

**Pass:** 15
**Skill:** compound-engineering:ce-code-review (review-only)
**Surfaces:** `packages/demo/frontend/src/**` — split across four sub-surface reviews:
1. `mutations/` + `api/` (useLendPosition, useMintAsset, actionsApi, apiClient, borrowApi serializers/types) and immediate fund-moving-submit consumers (Action.tsx, useWalletBalance, useBorrow*).
2. `components/earn/**` — swap and borrow review/confirm modals, display-vs-executed quote parity.
3. `hooks/`, `queries/`, `contexts/`, `providers/` — wallet/quote/position state wiring, cache coherence, projection/health hooks, activity-log.
4. `config/`, `util/`, `demoMagic/**` — Actions config, Serialized<T> wire type, Aave/Morpho demo mirrors.

## Summary

16 findings this pass: **13 NEW**, **3 REFINES** (no dups).

By severity (incoming):
- **medium:** 1 (F314 — borrow repay-full never uses SDK `{max:true}`, leaves dust debt).
- **low:** 15 (12 NEW low + 3 refines low).

By class: correctness 9, info 7.

Notable highlights:
- **F314 (medium, correctness):** Repay-full discards the SDK's dust-free `{ max: true }` close; `parseFloat` destroys the exact-debt string the Max button deliberately preserves, so a full repay computed at review time is always below the interest-accrued debt at execution and leaves residual dust debt. Distinct from F310 (collateral-param gap on the top-up path).
- **F317 (low, correctness):** Lend/withdraw is the third fund-moving sibling (after swap F307, vs borrow's executingRef) still relying only on async React state for double-submit protection — two fast taps dispatch two on-chain deposit/withdraw txs.
- **F322 (low, correctness):** Smart wallet is created once and never recreated on a signer/account switch (Dynamic and Turnkey), so post-switch lend/borrow/swap txs sign from the stale prior account's wallet.
- **Two F302 refinements** (the "Max slippage" row + the `formatSwapAmount` string/zero-guard nit) confirm the swap Review modal ignores the quote's authoritative `slippage`/`amountOutMin`/`amountOutMinRaw` across all rows, not just "Minimum received".

The executable signing path (calldata) is built server-side or by the in-browser SDK from authoritative raw amounts, not from these demo/formatter helpers, so no new fund-loss / malicious-sign bug surfaced. F302–F313 (Pass 14) cover the swap min-out parity, server-wallet re-quote, error swallowing, double-submit, quote staleness, and stub-price USD/LTV hazards and were NOT re-filed.

---

## Surface 1 — `mutations/` + `api/`

### F317 — Lend/withdraw fund-moving submit has no synchronous double-submit guard (sibling gap to borrow's executingRef)
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/mutations/useLendPosition.ts:48-75` (useOpenPosition/useClosePosition mutationFn); dispatched by `components/earn/Action.tsx:178-219,221-249` and `hooks/useWalletBalance.ts:263-296`
- **Severity:** low · **Class:** correctness
- **Status:** NEW (relates F307)
- **Detail:** The lend open/close path is the only fund-moving action whose double-submit protection is entirely React async state. `Action.tsx#handleCtaClick` (line 221) checks `isActionDisabled` (which folds in `isLoading`, a useState at 104/155) and `runTransaction` (line 178) sets `setIsLoading(true)` only AFTER the check, then calls `mutateAsync` (useWalletBalance.ts:283-284). React Query does not dedupe concurrent `mutateAsync` calls on the same mutation instance, and CtaButton has no debounce, so two synchronous taps within the same render tick both observe `isLoading===false` and both dispatch `openPositionMutation`/`closePositionMutation.mutateAsync`, sending two on-chain deposit/withdraw txs. The review-modal confirm path (`handleReviewConfirm`, Action.tsx:247) has the same exposure (gated only by `isExecuting={isLoading}`, Action.tsx:340). Borrow closes this window with a synchronous `useRef` guard (useBorrowTransaction.ts:47 executingRef, checked+set at 60-61 before any await); F307 flagged swap as the inconsistent sibling. Lend/withdraw is the third sibling still missing the synchronous guard, and it moves real user principal.
- **Repro:** In the Lend tab, double-click the Lend/Withdraw CTA (or the review-modal Confirm) fast enough that React has not re-rendered with `isLoading=true` between the two clicks; both pass `isActionDisabled` and both call `mutateAsync`, dispatching the deposit/withdraw twice.
- **Recommendation:** Add a synchronous reentry guard mirroring borrow: a `useRef(false)` checked-and-set before the await in `Action.tsx#runTransaction` (or inside the useOpenPosition/useClosePosition mutationFn), cleared in finally. Low-risk, isolated to the lend dispatch wrapper.
- **suggestRefactor:** false · **Candidate issue:** none

### F318 — lendMutation derives tokenAddress without the chain-fallback its own caller uses
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/api/actionsApi.ts:108-127` (lendMutation tokenAddress derivation), line 119
- **Severity:** low · **Class:** correctness
- **Status:** NEW
- **Detail:** lendMutation builds the POST `/lend/position/{action}` body with `tokenAddress: asset.address[marketId.chainId]` (line 119) and no fallback. If `asset.address` has no entry for `marketId.chainId`, the value is `undefined` and `JSON.stringify` omits the key entirely, sending a body with no tokenAddress. The sibling that resolves the same address for display/gating (useWalletBalance.ts:132-133) deliberately falls back to `Object.values(market.asset.address)[0]`, so the two derivations of the same token address can disagree. Contained today (allowlisted markets each carry their chain address; backend 400s on a missing tokenAddress rather than mis-executing), so this is a fail-closed latency footgun, not a mis-send — a sibling-validation gap on a fund-moving body builder.
- **Repro:** Not exploitable with current allowlisted markets; reachable only if a future lend asset lacks an address entry for its market's chainId, in which case the POST omits tokenAddress and the backend rejects it as an opaque 4xx.
- **Recommendation:** Either assert `asset.address[marketId.chainId]` is present before building the body (throw a clear client error) or apply the same fallback the caller uses, so the executed body's tokenAddress can never silently diverge from the displayed/gated one. Single line.
- **suggestRefactor:** false · **Candidate issue:** #303

### F319 — dripEthToWallet POSTs a caller-supplied walletAddress with no auth headers, unlike every sibling mutation
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/api/actionsApi.ts:143-156` (dripEthToWallet)
- **Severity:** low · **Class:** info
- **Status:** NEW
- **Detail:** dripEthToWallet (line 143) sends POST `/wallet/eth` with a caller-supplied `walletAddress` in the body and passes NO headers/auth, whereas `mintDemoUsdcToWallet` (72-85) and the lend/borrow/swap mutations all forward auth headers. The caller (serverWalletOperations.ts:84-90, buildMintOperation) hands it the resolved walletAddress. This is a test-token faucet drip (no user principal) and the actual address/auth enforcement is a backend concern (the unauth'd `/wallet/eth` route itself is the backend F272), but the frontend asymmetry is worth recording: the faucet recipient can be specified independently of the authenticated session, so faucet-abuse rate-limiting cannot key off the session on this path.
- **Repro:** Not a user fund-loss vector; a client can call `/wallet/eth` with any walletAddress and no auth header, so any rate limiting must live entirely server-side keyed on something other than the session.
- **Recommendation:** Record as info. If the backend faucet route is meant to drip only to the authenticated wallet, route this through `getAuthHeaders()` like the other mutations and derive the address server-side. No fund-safety change required for the demo.
- **suggestRefactor:** false · **Candidate issue:** none

### F320 — API-client error tests assert inside catch with no expect.assertions guard, so they pass silently if the call does not throw
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/api/actionsApi.spec.ts:22-37, 39-55`
- **Severity:** low · **Class:** info
- **Status:** NEW
- **Detail:** Both error-handling tests wrap the awaited call in try/catch and put the `expect(...)` assertions only inside the catch block, with no `expect.assertions(n)` and no `fail()` in the try. If a refactor made `BaseApiClient.request` stop throwing on a non-2xx (e.g. swallowing the error and returning a value), the catch body would never run and the test would still pass green, hiding a real regression in the error-propagation contract that the lend/swap/borrow mutation error-surfacing (and F305-style revert-reason display) depends on. Test-quality lens (a test that cannot fail when the behavior it guards changes), not a runtime bug.
- **Repro:** Mutate `BaseApiClient.request` to return instead of throw on `response.ok===false`; both tests still pass.
- **Recommendation:** Add `expect.assertions(1)` (or use `await expect(actionsApi.getMarkets()).rejects.toThrowError(...)`) so the test fails if request stops throwing.
- **suggestRefactor:** false · **Candidate issue:** none

---

## Surface 2 — `components/earn/**`

### F314 — Repay-full never uses the SDK's dust-free `{ max: true }` path; `parseFloat` destroys the exact-debt string the Max button preserves, leaving residual dust debt
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/hooks/useBorrowTransaction.ts:99-102` (repay dispatch); `BorrowAction.tsx:147,183-187`; `useBorrowQuotePreview.ts:69`
- **Severity:** medium · **Class:** correctness
- **Status:** NEW
- **Detail:** The SDK exposes `{ max: true }` on `BorrowRepayParams.amount` specifically for a dust-free full close (sdk params.ts:59-62, internalParams.ts:138 `if (isMaxAmount(amount)) return { max: true }`). The demo never uses it. `handleMax` (BorrowAction.tsx:183-187) deliberately sets `amount = activePosition.borrowAmountFormatted` (the exact debt string) with the comment "exact string avoids dust", but that is nullified twice: (1) BorrowAction.tsx:147 computes `amountNum = parseFloat(amount)`, dropping precision before it reaches the mutation; (2) `runTransaction` (useBorrowTransaction.ts:101) and the preview (useBorrowQuotePreview.ts:69) always submit `{ amount: amountNum }` — a fixed float — even when the user chose Max/repay-in-full (`canRepayFull`, BorrowAction.tsx:120). Because debt accrues interest continuously between quote display and on-chain execution, a fixed-float repay computed at review time is always slightly below the true outstanding debt at execution, so the position cannot be fully closed and leaves dust debt (which then trips `DEBT_DUST_THRESHOLD`/repay-gate logic). Not a fund-loss (SDK floors at outstanding debt, so no over-repay), but it defeats the user's intent to close the position — a display-vs-executed parity gap distinct from F310 (collateral params on the top-up borrow path, not the repay amount).
- **Repro:** Open a borrow position, let a few seconds pass so interest accrues, click Max in Repay (UI shows full debt string), confirm. The submitted float repay is below the now-larger debt; a small residual debt remains instead of a clean close.
- **Recommendation:** When the user clicks Max in repay mode (`canRepayFull`/debtBalance covers the debt), thread a `{ max: true }` sentinel through `amount` → `runTransaction` → `handleTransaction('repay', { amount: { max: true } })` instead of `{ amount: parseFloat(...) }`, so the SDK resolves the live full debt at dispatch. Keep the float-amount path only for partial repays.
- **suggestRefactor:** false · **Candidate issue:** #427

### REFINES F302 — "Max slippage" row is rendered from the same hardcoded 0.005 literal, never from `quote.slippage`
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/components/earn/ReviewSwapModal.tsx:88-91` (Max slippage row), 121 (default), 135-137 (min received)
- **Severity:** low · **Class:** correctness
- **Status:** REFINES F302
- **Detail:** Sharpens F302. F302 names the "Minimum received" recompute from a hardcoded 0.005. The sibling "Max slippage" DetailRow (88-91) is driven by the SAME `slippage` prop that defaults to `0.005` (line 121) and is never passed by SwapAction.tsx:593-606. The `SwapQuote` passed in as `priceQuote` already carries the authoritative `slippage` the SDK baked into `amountOutMinRaw`/router calldata (sdk base.ts:240-241), plus `amountOutMin`/`amountOutMinRaw` (216-219). The modal destructures only `price`/`priceImpact` and ignores all three. Additionally `handleGetQuote` (useSwap.ts:68-76) and frontendWalletOperations.ts:113-120 call `getQuote` WITHOUT a `slippage` argument, so the SDK applies its own resolved `defaultSlippage` (SwapProvider.ts:91-95, currently 0.005). Both the displayed slippage % and min-received are independent literals that merely coincide with the SDK default today; if any integrator overrides `defaultSlippage`/`maxSlippage`, the confirm screen displays a slippage figure and min-out the executed tx does not enforce.
- **Repro:** Set an integrator `defaultSlippage` of e.g. 0.01 in ActionsConfig. The swap executes with a 1% min-out, but Review still shows "Max slippage 0.5%" and a min-received computed at 0.5%.
- **Recommendation:** Have SwapAction pass `slippage={quote.slippage}` and a `formattedMinReceived` derived from `quote.amountOutMin` (or `formatUnits(quote.amountOutMinRaw, decimals)`) into ReviewSwapModal, so both rows reflect the quote the user is actually signing.
- **suggestRefactor:** false · **Candidate issue:** #435

### F315 — Borrow review modal renders the live (non-snapshotted) projection, so confirmed numbers can change underneath an open modal
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/components/earn/borrow/BorrowActionModals.tsx:78-90` (live health/amount props); `BorrowAction.tsx:316,332-348`
- **Severity:** low · **Class:** info
- **Status:** NEW (relates F310)
- **Detail:** `BorrowActionModals` renders `ReviewBorrowHealthModal` with the LIVE `health`, `amount`, `amountUsd`, and `activeAsset` computed every render in BorrowAction (268-281), not a snapshot frozen when the user opened the review. While the modal is open, the debounced `useBorrowQuotePreview` can still resolve/flip `isPreviewLoading`, and `currentCollUsd`/`projectionCollateralUsd` can change if `borrowPositions`/`tokenBalances` refetch, causing the modal's projected LTV / health-factor / warning band to mutate after the user opened it. `runTransaction` then dispatches `amountNum` (also live). The user cannot change `amount` while the modal covers the form, so not directly exploitable, but the reviewed projection and the confirm-time projection are not guaranteed identical. The projection itself is stub-priced (useBorrowProjection.ts:62), already flagged by F312/F313; this is the lifecycle/snapshot angle, not the pricing source.
- **Repro:** Open Review with the preview still in flight; the projected LTV shown can shift when the preview settles, changing the warning banner state after the user has begun reviewing.
- **Recommendation:** Snapshot `{ amount, amountUsd, health }` into modal-local state at the moment `setReviewModalOpen(true)` fires, and confirm against that snapshot. Low priority for the demo.
- **suggestRefactor:** false · **Candidate issue:** none

### REFINES F302 — `formatSwapAmount` (typed `(amount: number)`) is called with a string from `.toFixed(6)` for the min-received line
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/components/earn/ReviewSwapModal.tsx:135-137`
- **Severity:** low · **Class:** info
- **Status:** REFINES F302
- **Detail:** `formatSwapAmount` is declared `(amount: number)` (tokenDisplay.ts:110) but ReviewSwapModal.tsx:135-137 passes `(parsedOut * (1 - slippage)).toFixed(6)`, a string. It works because the body does `String(amount).split('.')` and `String('x') === 'x'`, but the `amount === 0` guard (tokenDisplay.ts:114) uses `===` against a number and never matches a string, so a zero min-received renders as "0.000000" rather than "0". Purely cosmetic, but the signature is violated and the zero-guard is silently dead on this call path. Folds into the F302 fix (passing `quote.amountOutMin` as a number).
- **Repro:** A swap whose slipped output rounds to 0 shows "0.000000" min-received instead of "0".
- **Recommendation:** When wiring the authoritative `quote.amountOutMin` per the F302/#435 fix, pass it as a number so the signature and zero-guard hold. No standalone change needed.
- **suggestRefactor:** false · **Candidate issue:** #435

---

## Surface 3 — `hooks/`, `queries/`, `contexts/`, `providers/`

### F321 — useCollateralStatus matches the pledged borrow position by symbol only, not by collateral asset address
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/hooks/useCollateralStatus.ts:26-30`
- **Severity:** low · **Class:** correctness
- **Status:** NEW
- **Detail:** useCollateralStatus filters borrowPositions for the lend asset by `p.collateralAsset.metadata.symbol === asset.metadata.symbol && asset.address?.[p.marketId.chainId] !== undefined` (26-30). It matches on the human symbol plus "the lend asset happens to have *some* address on the borrow market's chain", but never compares the actual on-chain collateral address against the lend asset's address on that chain. The selected position (`positions[0]`) flows into useWithdrawCollateral, which derives `releaseCollateralAmountRaw` from `pledgedPosition.collateralShares/collateralAmount` and feeds a real `borrowOperations.withdrawCollateral(walletAddress, { marketId: pledgedPosition.marketId, amount: { amountRaw } })` (useLendProvider.ts:442-446, Action.tsx:193-200). If two configured assets ever share a symbol (bridged vs native variant, or two markets wrapping the same symbol) the withdraw could release collateral from the wrong borrow market. Contained today (unique symbols in the allowlist), but it is a symbol-based identity check on a fund-moving path where an address-based check is available.
- **Repro:** Configure two earn assets with the same `metadata.symbol` on the same chain, one securing a Morpho borrow. Open Lend→Withdraw for the non-pledged asset: useCollateralStatus returns the pledged position by symbol, useWithdrawCollateral surfaces the health card and computes `releaseCollateralAmountRaw` against the wrong position, and Confirm sends withdrawCollateral against the unrelated borrow market.
- **Recommendation:** Match the pledged position on the resolved collateral asset address for the position's chain (compare `asset.address?.[p.marketId.chainId]` to the position's collateral token address) in addition to symbol. Low-risk: tightens an existing filter, no behavior change for the current allowlist.
- **suggestRefactor:** false · **Candidate issue:** none

### F323 — Collateral-shares-to-release is ceil-rounded with no upper clamp to the position's total shares
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/hooks/useWithdrawCollateral.ts:122-129`
- **Severity:** low · **Class:** correctness
- **Status:** NEW
- **Detail:** `releaseCollateralAmountRaw` converts the underlying withdraw amount into vault shares with ceil division: `numerator = collateralAmountRaw * collateralShares + collateralAmount - 1n; return numerator / collateralAmount` (125-129). Rounding UP releases up to one share-wei MORE collateral than the underlying being withdrawn — the opposite of the conservative direction for a collateral release on a borrow position (releasing slightly more collateral weakens the position marginally more than the health card projected, which floor-rounds via stub USD math). The guard only rejects non-positive inputs (line 122); there is no clamp to `pledgedPosition.collateralShares`, so an `amountValue` exceeding the position's underlying collateral produces a shares figure above the position balance and relies entirely on the SDK/contract to revert. The `exceedsDeposit` gate keys off the lend `maxAmount`, not the pledged collateral amount, so the two can diverge.
- **Repro:** On a Morpho lend position securing a borrow, withdraw an amount whose direct-deposit-excess maps to the full collateral: the ceil math yields `collateralShares + (rounding)`, exceeding the position balance, and the release tx reverts at the contract rather than being caught/clamped client-side.
- **Recommendation:** Round shares-to-release DOWN (floor) for a collateral release, and clamp the result to `pledgedPosition.collateralShares` so a client-side over-input cannot encode an out-of-range release. Both are 1-line changes; floor-rounding also matches the conservative direction.
- **suggestRefactor:** false · **Candidate issue:** none

### F322 — Smart wallet is created once and never recreated on signer/account switch (Dynamic and Turnkey)
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/hooks/useDynamicWallet.ts:25-52`
- **Severity:** low · **Class:** correctness
- **Status:** NEW
- **Detail:** useDynamicWallet guards smart-wallet creation with `if (isCreating || smartWallet) return` (line 25) and only resets when `primaryWallet` becomes null (19-23). On a non-null → different-non-null signer transition (account switch without a logout that nulls primaryWallet) the existing `smartWallet` is retained, and EarnWithFrontendWallet memoizes `operations`/`borrowOperations` on that stale `wallet`, so subsequent lend/borrow/swap txs are signed and submitted from the previous account's smart wallet. useTurnkeyWallet has the same `if (isCreating || smartWallet) return` guard (line 64) and its create-effect dep array `[embeddedWallet, actions, isCreating, smartWallet]` (line 101) omits `httpClient`, `session`, and the `embeddedWallet.accounts[0].address` it reads, so a session/org or first-match-embedded-wallet change does not re-derive the signer. The downstream Earn cache reset keys on `walletAddress` (Earn.tsx:429-434), which also would not fire if the address never updates. This is the signing-path identity that determines whose funds move.
- **Repro:** With Turnkey, if `wallets` resolves to a different first-match embedded wallet after `smartWallet` is already set, the create-effect keeps the old SmartWallet; the Earn cache clear (gated on walletAddress, which never changed) does not fire, so balances/positions and the signing wallet stay bound to the prior account.
- **Recommendation:** Key smart-wallet creation on the underlying signer identity: reset/recreate when `primaryWallet` (Dynamic) or `embeddedWallet.accounts[0].address`/`session.organizationId` (Turnkey) changes, not only on null. At minimum add those to the effect deps and drop the `smartWallet`-present short-circuit when the signer identity differs.
- **suggestRefactor:** false · **Candidate issue:** none

### F324 — Activity log persists to a provider-shared localStorage key before the wallet address resolves
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/providers/ActivityLogProvider.tsx:45-52`
- **Severity:** low · **Class:** info
- **Status:** NEW
- **Detail:** The storage key is `activity-log-${walletAddress}` only when walletAddress is truthy; otherwise it falls back to `activity-log-${walletProvider}` or `activity-log` (45-52). For the server-wallet/Turnkey/Dynamic paths the address resolves asynchronously, so any activity logged during the pre-address window (and the `${key}-next-id` counter) is written under the provider-shared key. On a shared machine, a second user of the same provider reads the prior user's persisted (confirmed, transaction-typed) activity rows — including block-explorer URLs disclosing the prior user's addresses/tx hashes — until the address resolves and the effect at 80-99 swaps keys. Display/privacy only (no funds move), but it leaks per-user activity across sessions on the same browser profile.
- **Repro:** Load the demo with a provider that resolves the address asynchronously, trigger a read/transaction activity before the address is known: the row lands in `activity-log-dynamic`. Open the demo as a different user of the same provider before their address resolves; the panel hydrates from the shared key showing the prior user's rows.
- **Recommendation:** Gate persistence (and the initial localStorage read) until walletAddress is known, or namespace the provider-fallback key per session.
- **suggestRefactor:** false · **Candidate issue:** none

---

## Surface 4 — `config/`, `util/`, `demoMagic/**`

### F325 — deserializeQuote spreads `...q` and only re-hydrates top-level bigints, leaving `BorrowQuote.execution.transactions[].value` as strings while typed bigint (latent type-lie on the quote the SDK doc says to re-dispatch)
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/api/borrowApi.serializers.ts:62-75`
- **Severity:** low · **Class:** correctness
- **Status:** NEW (relates F252)
- **Detail:** deserializeQuote (line 62) returns a value typed `BorrowQuote` by spreading `...q` (the wire shape `Serialized<BorrowQuote>`) and manually converting only `borrowAmountRaw`, `collateralAmountRaw`, `gasEstimate`, and the two nested positions. It never touches `q.execution`. `BorrowQuote.execution` is a pre-built transaction bundle whose per-tx `value` fields are `bigint` (sdk quote.ts:82-83). After JSON serialization those bigints are decimal strings, and the spread leaves them as strings while the field is statically `bigint`. The SDK explicitly documents (quote.ts:48-49) "Pass the quote back into the matching wallet.borrow.* method to dispatch without re-quoting" — the exact usage that would feed these string-typed values to viem. Today the server-wallet path is safe (borrowApi.postMutation re-executes from raw Stub*Params; the quote is consumed only by the gate/preview reading positionAfter/borrowAmountRaw), so NOT exploitable now. But it is a real type-contract hole: any future caller dispatching the deserialized quote in-browser (the SDK's advertised pattern) would send malformed/zero value legs with no compile-time warning. Same family as F252/F044 (serializer type-signature lie) but on the frontend deserialize side that under-hydrates.
- **Repro:** Quote a borrow via the server-wallet path; inspect the object from `borrowApi.getQuote` — `execution.transactions[].value` is a string at runtime despite the bigint type. Passing it to `wallet.borrow.repay(quote)` would dispatch malformed value legs.
- **Recommendation:** Either re-hydrate the nested `execution.transactions[].value` (and any other bigint leg fields) inside deserializeQuote, or narrow the return type to an explicit gate-only shape that does not claim a dispatchable `BorrowQuote`. Add a regression test asserting `typeof quote.execution.transactions[0].value === 'bigint'` after deserialize.
- **suggestRefactor:** false · **Candidate issue:** #419

### REFINES F308 — Aave mirror removes `receipt.borrowAmount` (principal+accrued interest) but only principal was minted, so the dead-sink transfer over-withdraws and silently reverts after interest accrues
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/demoMagic/aaveDemoMagic.ts:44-71`
- **Severity:** low · **Class:** info
- **Status:** REFINES F308
- **Detail:** On borrow, mirrorBorrowReceipt mints `receipt.borrowAmount = quote.borrowAmountRaw` USDC_DEMO (principal delta). On a full close/repay (frontendWalletOperations.ts:158,167) it removes `receipt.borrowAmount`, which for an Aave close is `repay.repayAmount` = the full outstanding debt INCLUDING accrued interest (sdk aave/quote.ts:278). Because only principal was ever minted to the user's USDC_DEMO twin, after any interest accrual the "remove" transfer (aaveDemoMagic.ts:67-72) requests more USDC_DEMO than the wallet holds and reverts. sendMirrorTx swallows that revert into console.error (80-88, the fire-and-forget path of F308), so the UI shows the real close as Confirmed while stale USDC_DEMO remains — and the repay gate (repayGateAsset → USDC_DEMO balance, BorrowAction.tsx:109,117) then reflects phantom funds. Demo-only (no real funds), but it misrepresents fund state. Sharpens F308 with the concrete over-removal arithmetic.
- **Repro:** Open an Aave USDC borrow via the in-browser wallet (mints principal as USDC_DEMO), let interest accrue, then fully close. The mirror "remove" transfer reverts (insufficient USDC_DEMO), is swallowed, and stale USDC_DEMO lingers after a successful real close.
- **Recommendation:** Cap the mirror removal at the wallet's current USDC_DEMO balance (`min(receipt.borrowAmount, balance)`) before encoding the transfer, so a full close after interest accrual zeroes the twin instead of reverting. Demo-only fix; no SDK change.
- **suggestRefactor:** false · **Candidate issue:** none

### F326 — Partial-repay notice renders `maxRepayable` as an unfloored raw JS float, so the "You can repay up to X" figure can show above the user's actual decimal-floored repayable amount
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/demoMagic/ReacquireDebtNotice.tsx:20`
- **Severity:** low · **Class:** info
- **Status:** NEW
- **Detail:** `maxRepayable` is `Math.min(debtBalance, outstandingDebt)` (BorrowAction.tsx:118) where both inputs are parseFloat-derived numbers, passed straight into ReacquireDebtNotice (BorrowAction.tsx:322) and interpolated raw into "You can repay up to ${maxRepayable} ${symbol}" (ReacquireDebtNotice.tsx:20). The amount input itself is floored to asset decimals via floorToAsset before submit (BorrowAction.tsx:127-131,208), but this advisory text is not, so a value like 12.3456789012 can display, and (being unfloored) can read slightly higher than the floored input would accept. Display-only, no tx impact, but it slightly over-states repayable funds in a fund-state hint.
- **Repro:** Enter repay mode on the mirror market holding a USDC_DEMO balance with many fractional digits below the outstanding debt; the partial notice prints the full-precision float rather than the 6-decimal floored value.
- **Recommendation:** Format `maxRepayable` through the same floor-to-asset-decimals helper used for the input (or a shared formatAmount) before passing it to ReacquireDebtNotice.
- **suggestRefactor:** false · **Candidate issue:** none

### F316 — Frontend Morpho lend allowlist uses GauntletUSDCDemo while the backend uses MorphoUSDCLendDemo for the same vault, and the frontend chains array omits UNICHAIN present in the backend (config drift)
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/config/actions.ts:37-39`
- **Severity:** low · **Class:** info
- **Status:** NEW
- **Detail:** config/actions.ts:38 sets `lend.morpho.marketAllowlist` to `[GauntletUSDCDemo]` (address 0x018e22BB..., markets.ts:17), whereas the backend (packages/demo/backend/src/config/actions.ts:39) uses `[MorphoUSDCLendDemo]`. The address 0x018e22BB matches `MorphoUSDCBorrowOPDemo.marketParams.collateralToken` (markets.ts:66), so they appear to be the same vault under two names — but the divergent symbol means a change to one allowlist won't track the other, and a reviewer cannot confirm parity by name. Separately, the frontend chains list (67-92) includes only baseSepolia + optimismSepolia, while the backend includes UNICHAIN, BASE_SEPOLIA, OPTIMISM_SEPOLIA. No fund-safety impact today (the frontend operates only on the two listed chains and the allowlists are SDK-enforced regardless of demo config), but the two configs are meant to mirror each other ("matching backend structure", actions.ts:18) and have silently diverged.
- **Repro:** Diff packages/demo/frontend/src/config/actions.ts against packages/demo/backend/src/config/actions.ts: lend.morpho.marketAllowlist names differ and the chains arrays differ by UNICHAIN.
- **Recommendation:** Align the frontend and backend Morpho lend allowlist on a single shared market constant (rename to one name or import the same symbol), and document the intentional UNICHAIN omission in the frontend chains array.
- **suggestRefactor:** false · **Candidate issue:** none

---

## Dedup notes

- **Not re-filed (already in ledger):** F302–F313 cover the swap min-out parity, server-wallet re-quote (F303/F310), error swallowing (F305), double-submit (F307), quote staleness/expiry (F306), and the stub-price USD/LTV hazards (F311/F312/F313). F309 covers the missing client idempotency key + 30s timeout-abort double-submit window for lend/swap/borrow. F304/F308 cover the demo mirror auto-pledge and fire-and-forget swallowing.
- **F317** is NEW (not a dup of F307): F307 is swap-specific; this is the lend/withdraw sibling missing the same synchronous guard.
- **F315** is NEW (relates F310): F310 is the collateral-param gate-vs-execute gap; this is the modal lifecycle/snapshot angle.
- **F325** is NEW (relates F252): F252 is the core-services serializeBigInt *test* gap; this is the frontend deserialize side under-hydrating execution bigints.
- **The "Max slippage" row** and **`formatSwapAmount` string/zero-guard** findings REFINE F302 (same hardcoded-0.005 root, additional loci on the same modal).
- **The Aave mirror over-removal** finding REFINES F308 (concrete over-removal arithmetic on the same fire-and-forget mirror).
