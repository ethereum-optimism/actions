# Review Pass 14 — Demo Frontend (frontend-ux + senior-frontend, review-only)

**Pass:** 14
**Skill:** ethskills:frontend-ux + engineering-skills:senior-frontend (review-only fund-safety/UX lens)
**Surfaces:** `packages/demo/frontend/src/**` — swap/borrow/lend review-confirm modals and their transaction hooks, the mutations/api clients, wallet/quote-state hooks, and the demoMagic mirror/reconcile flows.

## Summary

Four reviewer agents converged on the demo frontend, which prior passes 1-13 (SDK + backend) had left effectively un-reviewed. The frontend is a happy-path demo with reasonable error handling (mutations console.error + activity.error + rethrow; CTA double-submit guards via isLoading/isExecuting/isSwapping). The dominant theme is **display-vs-executed quote parity**: the swap Review modal fabricates the "Minimum received" / "Max slippage" the user relies on to approve a fund-moving swap, and the server-wallet execution path discards the reviewed quote entirely.

**Counts by severity (NEW findings):** 0 critical · 0 high · 4 medium · 8 low (12 total).
- 1 REFINES (frontend twin of backend F292).

**Notable highlights:**
- The swap Review modal (`ReviewSwapModal`) recomputes "Minimum received" and "Max slippage" from a hardcoded `0.005` literal applied to the *displayed* output, never reading the SDK quote's authoritative `amountOutMin`/`amountOutMinRaw`. Today it coincides with config because both are `0.005`, but they are wired from independent sources and silently diverge if either changes (F302, medium).
- The server-wallet `executeSwap` forwards a float `amountIn` and no slippage, so the backend re-quotes independently and the reviewed quote's min-out is never enforced — unlike the frontend-wallet path which executes the exact reviewed quote (F303, medium).
- `useReconcileMorphoCollateral` auto-submits an unconfirmed `depositCollateral({max:true})` on mount via a render effect — a fund-moving max collateral pledge with no review modal (F304, medium).
- The swap submit path swallows the revert reason (TransactionModal shown with no `errorMessage` → "Try again later."), while sibling lend/withdraw/borrow surface `ActionsError.shortMessage` — so a slippage-exceeded revert, the canonical fund-safety event, is the one action that hides its cause (F305, medium).

All findings are review-only and demo-scoped. No architectural refactors recommended. RPC/price-source trust noted as out-of-scope.

---

## Findings by surface

### Surface: frontend — swap review/confirm path

#### F302 — Review modal recomputes "Minimum received" / "Max slippage" from a hardcoded 0.5% instead of the SDK quote's enforced amountOutMin
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/components/earn/ReviewSwapModal.tsx:121,135-137` (rendered without `slippage` prop at `SwapAction.tsx:593-606`)
- **Severity:** medium
- **Class:** correctness
- **Dedup:** new (consolidated from all 4 surface reports; relates to SDK F005 / #435 at the modal layer)
- **Detail:** `ReviewSwapModal` receives the full SDK `SwapQuote` as `priceQuote`/`quote` but narrows it to `{ price, priceImpact }`, discarding `amountOut`/`amountOutMin`/`amountOutMinRaw`. It then derives `formattedMinReceived = formatSwapAmount((parsedOut * (1 - slippage)).toFixed(6))` where `slippage` defaults to the literal `0.005` (line 121), and renders "Max slippage" = `(slippage*100).toFixed(1)%` = "0.5%". `SwapAction.tsx` never passes a `slippage` prop, so the modal always falls back to 0.5%. The authoritative protection is `quote.amountOutMin` / `amountOutMinRaw` (`sdk/src/types/swap/base.ts:217-219`), computed by each provider's `computeSlippageBounds` from its configured `defaultSlippage` (`config/actions.ts:49,55` = 0.005 today) and baked into the signed router calldata. The displayed number is therefore cosmetic and applied to the *displayed* `amountOut` with a *constant* 0.5%, not derived from the bytes that execute. The two `0.005` values are independent literals in two files; they coincide today so the figures match by coincidence. Change either provider's `defaultSlippage`, add a per-quote slippage, or let an SDK-side clamp/round occur, and the confirm screen shows a min-received and max-slippage with no relationship to what executes on-chain. For the server-wallet path this is doubly disconnected: the backend re-quotes server-side, so the executed min-out comes from a fresh server quote the user never saw, yet the modal still displays a locally-fabricated min-received.
- **Exploit/repro:** Set `swap.uniswap.defaultSlippage` to `0.02` (2%) in `config/actions.ts`. The SDK signs a swap protected to `amountOut*(1-0.02)`, but ReviewSwapModal still renders "Max slippage 0.5%" and "Minimum received = amountOut*0.995", overstating protection and misleading the approver.
- **Recommendation:** Display the quote's own `quote.amountOutMin` for "Minimum received" (formatted via asset decimals) and derive "Max slippage" from `quote.slippage` (or the configured default), rather than recomputing from a local `0.005` literal. At minimum thread the real configured slippage from `SwapAction` into the modal so display and execution cannot diverge. Low-risk: deletes a computation rather than adding logic.
- **suggestRefactor:** false
- **Candidate issue:** #435

#### F303 — Server-wallet executeSwap discards the reviewed quote's min-out and re-quotes server-side, so executed slippage is never tied to what the user reviewed
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/components/earn/serverWalletOperations.ts:46-64`
- **Severity:** medium
- **Class:** correctness
- **Dedup:** new (consolidated from surface reports 1 and 3)
- **Detail:** On the server-wallet (Privy) path, `executeSwap(quote)` forwards only `quote.amountIn` (a display-approximation `number`, per `base.ts:208-209`), token addresses, `chainId`, and `provider` to `POST /swap/execute` (lines 53-62). It does NOT forward `slippage`, `amountInRaw`, or `amountOutMinRaw`. The backend (`swap.ts:147-155`) then performs a completely fresh getQuote+execute using that float `amountIn` and the SDK default slippage. Consequences: (1) precision loss — `amountInRaw` (the source of truth, `base.ts:210-211`) is discarded and the float is re-parsed server-side; (2) the slippage/min-out the user reviewed has no effect on execution; (3) the exact `SwapQuote` the user reviewed, including its `amountOutMinRaw`, is thrown away. Contrast the frontend-wallet (Turnkey/Dynamic) path (`frontendWalletOperations.ts:91-99`) which passes the whole `quote` into `wallet.swap.execute(quote)`, so the SDK enforces the quote's own `amountOutMinRaw`. The two sibling execution paths thus have different parity guarantees. `actionsApi.executeSwap` already accepts a `slippage` field (`actionsApi.ts:242`) that this path never populates.
- **Exploit/repro:** Server-wallet user reviews a quote showing amountOut=100 USDC, min-received=99.5. The POST `/swap/execute` body omits slippage and uses the float `amountIn`; price moves between review and the backend re-quote; backend executes against a fresh quote with its own floor. The user-reviewed 99.5 floor was never sent and is not enforced.
- **Recommendation:** Forward the reviewed quote's `amountOutMinRaw` (or at least an explicit `slippage`, ideally an `amountInRaw`-derived value) into `/swap/execute` so the executed floor is bounded by what the user reviewed, matching the frontend-wallet path. If the backend must re-quote, have it reject when the fresh min-out is below the client-supplied floor.
- **suggestRefactor:** false
- **Candidate issue:** #435

#### F305 — Swap submit swallows the revert reason: TransactionModal shown with no errorMessage while sibling lend/withdraw/borrow surface ActionsError.shortMessage
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/components/earn/SwapAction.tsx:443-446,608-612`
- **Severity:** medium
- **Class:** correctness
- **Dedup:** new (surface report 2)
- **Detail:** `handleConfirmSwap` catches a failed swap, only `console.error('[swap] execution failed:', err)` (line 444), sets `txModalStatus = 'error'` with no message, and renders `<TransactionModal isOpen status onClose />` (lines 608-612) passing NO `errorMessage`. TransactionModal falls back to "Try again later." (`TransactionModal.tsx:84`). The sibling lend/withdraw path extracts `e instanceof ActionsError ? e.shortMessage` and passes it as `errorMessage` (`Action.tsx:210-214,355`), and the borrow path does the same via `setTxError(msg)` → `txModal.errorMessage` (`useBorrowTransaction.ts:118-122`; `BorrowActionModals.tsx:95`). So the one fund-moving action most likely to revert for a fund-safety reason (slippage exceeded, insufficient balance, expired/stale quote) is the only one that hides the reason from the user, who cannot distinguish a slippage trip from a transient failure and may blindly retry.
- **Exploit/repro:** Trigger a slippage-exceeded revert on a swap; the modal shows only "Try again later." with no indication the swap tripped its slippage floor.
- **Recommendation:** Mirror the lend/borrow pattern: capture the caught error's `ActionsError.shortMessage` (or message) into state and pass it as `errorMessage` to the swap's TransactionModal. Low-risk, additive, matches existing siblings.
- **suggestRefactor:** false
- **Candidate issue:** none

#### F306 — Swap quote has no staleness/expiry surfacing; an open Review modal can submit an arbitrarily stale quote
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/components/earn/SwapAction.tsx:273-324,387-453`
- **Severity:** low
- **Class:** correctness
- **Dedup:** new (consolidated from surface reports 1, 2, 3, 4)
- **Detail:** The `SwapQuote` carries `quotedAt`, `expiresAt`, and `deadline` (`sdk/src/types/swap/base.ts:242-247) but no frontend code references any of them. The quote is fetched on a 500ms debounce, stored in `quote` state, surfaced in the Review modal, and reused unchanged in `handleConfirmSwap` → `onSwap(quote)` with no recency/expiry check and no re-fetch when the user clicks Confirm. A user who opens Review and waits (price moves) then clicks Swap executes against a stale displayed quote: the frontend-wallet path executes the literal stale `quote.execution` calldata (min-out computed against an old price); the server-wallet path re-quotes server-side so the executed price is fresh but the user confirmed against stale displayed amounts. There is no "quote expired, refresh" affordance. This compounds F302.
- **Exploit/repro:** Get a quote, open Review, leave it open, click Swap minutes later. No staleness check; the displayed amounts are from the original quote.
- **Recommendation:** Compare `quote.expiresAt` to now on Review open / before confirm; if expired, block confirm and prompt a re-quote (or auto-refresh). Show a "quote may be stale" hint when open beyond a short TTL. Low-risk, additive UI gate.
- **suggestRefactor:** false
- **Candidate issue:** #435

#### F307 — Swap double-submit guard is async React-state-based (isSwapping/isExecuting) vs borrow's synchronous reentry ref
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/hooks/useSwap.ts:98-117`
- **Severity:** low
- **Class:** correctness
- **Dedup:** new (consolidated from surface reports 2 and 3)
- **Detail:** `handleSwap` guards reentry with `if (isSwapping) return` (line 100) reading React state set via `setIsSwapping`, and the CTA is disabled via `disabled={isExecuting}` (`SwapAction.tsx:603`). Both are async: two confirms dispatched within the same render tick (before the state flush / button re-disable) can both pass the guard and dispatch `operations.executeSwap(quote)` twice, sending two fund-moving swaps that spend the input token twice. The sibling borrow flow uses a synchronous `executingRef` set before the first await (`useBorrowTransaction.ts:47,60-61`), which closes exactly this same-tick window. The swap path is the inconsistent sibling. Exposure is small in practice because the modal button is also disabled on isExecuting, but the window exists.
- **Exploit/repro:** Double-click Confirm faster than one React render cycle; the closure's `isSwapping` is still false on the second call, both proceed to `operations.executeSwap`.
- **Recommendation:** Add a `useRef` reentry guard in `handleSwap` (set synchronously at entry, cleared in `finally`), matching `useBorrowTransaction`'s `executingRef`. Low-risk, fills the sibling gap.
- **suggestRefactor:** false
- **Candidate issue:** none

### Surface: frontend — demoMagic mirror/reconcile flows

#### F304 — useReconcileMorphoCollateral auto-submits an unconfirmed max-collateral depositCollateral on mount via a render effect
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/demoMagic/morphoDemoMagic.ts:9-40`
- **Severity:** medium
- **Class:** correctness (info per surface 2; taken at the higher of the two)
- **Dedup:** new (consolidated from surface reports 1 and 2)
- **Detail:** `useReconcileMorphoCollateral` runs inside a `useEffect` and, for any Morpho lend position with `depositedSharesRaw > 0` that maps to a borrow market, fires `void handleTransaction('depositCollateral', { marketId, amount: { max: true } })` (lines 27-33) with NO review modal and NO user confirmation. `handleTransaction` routes straight to `operations.depositCollateral` → `wallet.borrow.depositCollateral` (`useBorrowProvider.ts:291-296`), submitting a real on-chain transaction pledging the user's ENTIRE lend-vault share balance as borrow collateral. The only guard is `reconciledRef` (a Set), which resets on every component remount/refresh and is cleared on failure (retries next render). It is intentional demo "magic," but from a fund-safety lens an automatic, unconfirmed, `max: true` collateral pledge driven by a render effect moves user funds without explicit intent and can misrepresent the lend-position state (the user may believe shares are freely withdrawable when they are now pledged). Withdraw flows gate on a health card so the downstream effect is partially surfaced, but the pledge itself is silent. The amount is `{ max: true }`, not bounded to a user-entered value.
- **Exploit/repro:** Mount the borrow view with an existing Morpho lend position holding unpledged shares; an on-chain `depositCollateral(max)` is submitted with no modal. A page refresh re-arms `reconciledRef` and can re-fire if the prior tx has not yet settled into positions.
- **Recommendation:** Demo-only, review-only: keep but make the silent fund-moving nature explicit. Gate behind an idempotency key that survives remounts (persist reconciled market keys) so a transient re-mount with stale positions cannot re-pledge; add a code comment flagging this is an unconfirmed on-chain mutation; consider a visible activity-log entry. Do NOT promote this pattern outside the demo.
- **suggestRefactor:** false
- **Candidate issue:** none

#### F308 — Frontend Aave USDC_DEMO mirror is fire-and-forget with swallowed failures and no idempotency, so a failed mirror drifts the displayed balance while the UI shows success
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/demoMagic/aaveDemoMagic.ts:35-89`
- **Severity:** low
- **Class:** info
- **Dedup:** refines:F292 (frontend twin of the backend mirror.ts fire-and-forget issue; consolidated from surface reports 1 and 4)
- **Detail:** `frontendWalletOperations.openPosition/closePosition/repay` call `mirrorBorrowReceipt(...)` (`frontendWalletOperations.ts:153,158,167`) and RETURN the real borrow receipt immediately; `mirrorBorrowReceipt` internally does `void (mint|remove)MirrorUsdcDemo(...)` (`aaveDemoMagic.ts:44-46`), a second un-awaited `sendBatch` whose failures are swallowed in a try/catch that only `console.error`s (`sendMirrorTx`, lines 58-88) and never reads the UserOp success flag. So the borrow/repay reports success and the activity log confirms, but the user's displayed (mirrored) USDC_DEMO balance may never update if the mirror tx fails. There is no idempotency key, so a client-side retry of the borrow double-mirrors (mints USDC_DEMO twice). The repay gate (`repayGateAsset`) then gates repay on the USDC_DEMO balance, so a failed mint after a real borrow leaves a real on-chain debt but zero USDC_DEMO, and the UI's `ReacquireDebtNotice` shows "You need USDC to repay this loan" with no indication the mirror failed. Permissionless mock token on a testnet; no protocol fund loss. This is the user-visible twin of backend F292.
- **Exploit/repro:** Borrow on the Aave mirror market with an in-browser wallet while the mirror `sendBatch` fails (transient RPC error). The borrow shows Confirmed but USDC_DEMO balance does not increase; only a `console.error` is emitted.
- **Recommendation:** Review-only backlog, tracked alongside F292. Either await + surface the mirror result so a failed mirror does not present as a clean success, or document the best-effort nature in-UI (activity log / non-blocking toast). No fix required for the demo, but the drift is user-visible here.
- **suggestRefactor:** false
- **Candidate issue:** none

### Surface: frontend — api clients / mutations

#### F309 — Lend and swap fund-moving POSTs carry no idempotency key; a retried mutation re-submits the on-chain action
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/api/actionsApi.ts:108-127,236-289`
- **Severity:** low
- **Class:** info
- **Dedup:** new (surface report 1)
- **Detail:** `lendMutation` (lines 108-127) and `executeSwap` (lines 236-289) POST to `/lend/position/{action}` and `/swap/execute` with the action params only, no client-generated idempotency key. The same is true of `borrowApi.postMutation` (`borrowApi.ts:133-153`). React Query mutations are guarded against UI double-click via isLoading/isExecuting/isSwapping flags (`Action.tsx:155,187`; `useSwap.ts:100-101`; `BorrowAction.tsx:260`), covering the common case, but `AbortSignal.timeout` (`apiClient.ts:33`, `MUTATION_TIMEOUT_MS=30s`) means a slow-but-eventually-successful mutation aborts client-side; any caller-level retry (or a user reload + re-submit) re-executes the on-chain action with no server-side dedup. For a 30s-ceiling fund-moving call this is the realistic double-spend window.
- **Exploit/repro:** Submit a lend/swap; if the backend takes >30s the client `AbortSignal.timeout` fires and surfaces an error while the tx may still land, then a user retry re-submits with no dedup.
- **Recommendation:** Review-only backlog: note as a known gap. A client idempotency key threaded through these POSTs (and honored server-side) would close the timeout/retry double-submit window. Not a demo blocker; the in-flight UI guards cover ordinary double-clicks.
- **suggestRefactor:** false
- **Candidate issue:** none

### Surface: frontend — borrow CTA gate / valuation

#### F310 — Borrow CTA gate validates a preview quote with collateral params that differ from the executed transaction on the top-up path
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/hooks/useBorrowQuotePreview.ts:50-64`
- **Severity:** low
- **Class:** correctness
- **Dedup:** new (surface report 3)
- **Detail:** On the borrow top-up path (`currentCollUsd > 0`), the preview built in `useBorrowQuotePreview.ts:50-64` pledges `collateralAmount: { amountRaw: directDepositedSharesRaw }` when direct shares exist, but the actually-executed transaction in `useBorrowTransaction.ts:88-97` sends NO `collateralAmount` for top-ups (the `...(!isTopUp && ... ? {collateralAmount} : {})` spread evaluates to `{}` when `isTopUp` is true). So the backend `/borrow/quote` that gates the Confirm CTA (`BorrowAction.tsx:236` `!isPreviewLoading`) validates a borrow-with-added-collateral, while the execution adds debt against existing collateral only. The CTA can pass on the lower-LTV preview variant while the executed no-collateral borrow is riskier. Severity is contained because the user-visible health card and the buffer/liquidation CTA gates are driven by the local stub-price projection (`useBorrowProjection`, using current collateral), not by this preview — the preview only acts as a "did the backend accept these params" gate. But gating on params that don't match the executed call defeats the gate's purpose.
- **Exploit/repro:** Top up an existing Morpho borrow with freshly-added direct lend shares: the preview pledges those shares (lower projected LTV, gate passes), the execution pledges none.
- **Recommendation:** Make the preview params match the executed params: on top-up, omit `collateralAmount` in `useBorrowQuotePreview` so the gating quote reflects the borrow that will actually be sent. Review-only; demo surface.
- **suggestRefactor:** false
- **Candidate issue:** none

#### F311 — Portfolio USD valuation uses a 1-unit swap quote as a linear price, baking swap impact/slippage into the displayed balance
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/hooks/useTotalBalance.ts:49-71,89-90`
- **Severity:** low
- **Class:** info
- **Dedup:** new (surface report 3)
- **Detail:** `useTotalBalance` derives a per-token USD price by requesting a swap quote for `amountIn: 1` (lines 49-55) and using `quote.amountOut` as the unit price, then multiplying by the full held balance (line 90 `balance * price`). The quote's `amountOut` already reflects pool price impact and the swap route, so (a) the unit price embeds the 1-unit trade's impact, and (b) extrapolating it linearly to the whole balance misrepresents realizable value for larger holdings. The price is also cached indefinitely per symbol for the component's lifetime (priceCache ref, no TTL), so the displayed total USD can drift from market without refresh. Only affects the nav/portfolio total display (no transaction is built from it), hence info, but it can mislead a user about portfolio value before they decide to move funds.
- **Exploit/repro:** Hold a large OP balance; the displayed USD total uses the 1-OP swap quote price * balance, ignoring that selling the full balance would realize a different rate.
- **Recommendation:** Backlog (tracked by #482): source the display price from a read-only price oracle/quote helper rather than an executable swap quote, or at least cache with a TTL and note the value is indicative. Demo display surface, review-only.
- **suggestRefactor:** false
- **Candidate issue:** #482

### Surface: frontend — stub pricing / token display

#### F312 — stubPriceUsd returns 0 for unknown symbols, so an unpriced collateral/borrow asset values a position at $0 and renders a leveraged position as falsely healthy (HF = Infinity)
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/utils/borrowValuation.ts:17-32`
- **Severity:** low
- **Class:** info
- **Dedup:** new (surface report 4)
- **Detail:** `positionUsd` multiplies formatted amounts by `stubPriceUsd(symbol)` (lines 19-26). `stubPriceUsd` (`stubPrices.ts:14-18`) returns `0` for any symbol absent from the hardcoded table. If a borrow position's collateral or borrow asset symbol is not in {USDC, OP, ETH, WETH} (or `_DEMO` variants), its USD value silently becomes 0. A zero `borrowValueUsd` makes `computeHealthFactor` return `Infinity` (`borrowMath.ts:61`) and `computeProjection` treat the position as fully safe (`borrowMath.ts:106-117`), visually misrepresenting a position with real debt as never at liquidation risk. Today the borrow markets are restricted to in-table assets so this is not currently reachable, hence info. The hazard is the fail-open default (0/Infinity) rather than fail-closed; the file is already flagged for retirement by #482 (PriceProvider).
- **Exploit/repro:** Add a borrow market whose asset symbol is not in `STUB_PRICES_USD`: the Borrow tab health card shows HF = Infinity and a safe bar despite open debt.
- **Recommendation:** Backlog (tracked by #482): when the price source is retired, ensure an unpriceable asset fails closed (omit/disable health rendering) rather than defaulting to $0 / Infinity-HF. No change needed while #482 is pending and markets are allowlisted to priced assets.
- **suggestRefactor:** false
- **Candidate issue:** #482

#### F313 — deriveUsdRates back-derives the non-stable side's USD price from the swap's own output, forcing pay-USD == receive-USD and masking price impact in the confirm modal
- **Surface:** frontend
- **File:** `packages/demo/frontend/src/utils/tokenDisplay.ts:56-77`
- **Severity:** low
- **Class:** info
- **Dedup:** new (surface report 4)
- **Detail:** `deriveUsdRates` prices a non-stablecoin from the opposite leg of the same swap (e.g. for OP→USDC, `usdPerIn = amountOut/amountIn`). The review modal (`ReviewSwapModal.tsx:128-133,148,161`) then renders "You pay" USD and "You receive" USD using these rates, which by construction makes the two USD figures equal (paidUSD == receivedUSD). This hides the price impact / fee cost in the USD display: a user always sees a 1:1 USD trade regardless of actual slippage or impact, so the USD readout can never signal that they are receiving less value than they paid. Known demo simplification (real pricing is #482), so info, but it is a fund-relevant display that cannot surface an unfavorable trade.
- **Exploit/repro:** Quote a swap with non-trivial price impact: the modal's "You pay $X" and "You receive $X" are identical because the OP price is back-derived from the USDC output, regardless of impact.
- **Recommendation:** Backlog (tracked by #482): once a real PriceProvider exists, price each leg independently so the confirm modal's USD figures can reflect value lost to impact/fees. No change while the demo intentionally stubs prices.
- **suggestRefactor:** false
- **Candidate issue:** #482

---

## Dedup notes

- **F302/F303/F306** consolidate the swap-quote-parity findings that recurred across all/multiple surface reports into one finding each (modal display, server-wallet execution, staleness). They reference SDK findings F005/F001 and issue #435 as `relatesToPriorFinding`, but are distinct frontend-layer findings: the SDK findings live in `packages/sdk/src/actions/swap/...` (encoding/computeSlippageBounds), whereas these are in `packages/demo/frontend/...` (modal/operation builders). Recorded as `new`.
- **F308** is recorded as `refines:F292`: F292 is the backend `mirror.ts` fire-and-forget mirror; F308 is its user-visible frontend twin in `aaveDemoMagic.ts`. Linked, not duplicated.
- **F304/F307** consolidate findings that appeared in two surface reports each.
- No incoming finding duplicates an existing frontend ledger row (the ledger had no `packages/demo/frontend/` entries before this pass).
