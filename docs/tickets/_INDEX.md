# Actions SDK production-readiness tickets: index

This index orders the production-readiness tickets for batched parallel execution. Each row links to its full ticket file in this directory. Tickets marked **augment** extend an existing GitHub issue rather than opening a new one; the rest are new.

## Summary

- **Total tickets:** 70
- **By severity:** 9 high, 40 medium, 21 low
- **By complexity (1-5):** 31×2, 29×3, 8×4, 2×5
- **Augmenting an existing issue:** 44; **net-new:** 26
- **By domain:** 14 core, 13 wallet, 9 swap, 9 frontend, 7 backend, 5 cli, 4 lend, 4 borrow, 4 infra, 1 testing

## Tickets

Sorted by wave, then severity. **Blocked-by** lists the in-set tickets that must land first (`*` = a sub-prerequisite tracked inside the e2e ticket, not a standalone ticket file).

| Wave | Slug | Title | Sev | Cx | Domain | Issue | Augment? | Blocked-by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | [`backend-faucet-auth-and-rate-limit`](./backend-faucet-auth-and-rate-limit.md) | Authenticate the ETH faucet, add accounting + rate limiting | high | 3 | backend | — | no | — |
| 0 | [`eoa-batch-mid-revert-allowance`](./eoa-batch-mid-revert-allowance.md) | Stop EOA sendBatch continuing after a mid-batch revert | high | 3 | wallet | #335 | yes | — |
| 0 | [`lend-asset-market-validation`](./lend-asset-market-validation.md) | Validate lend caller asset vs market underlying, enforce lists | high | 4 | lend | #334 | yes | — |
| 0 | [`prebuilt-quote-calldata-integrity`](./prebuilt-quote-calldata-integrity.md) | Bind pre-built swap/borrow quote dispatch to its calldata bytes | high | 5 | core | #373 | yes | — |
| 0 | [`receipt-status-as-success`](./receipt-status-as-success.md) | Fail closed on reverted-but-mined receipts in send/sendBatch | high | 3 | wallet | #474 | yes | — |
| 0 | [`slippage-bounds-negative-minout`](./slippage-bounds-negative-minout.md) | Clamp slippage to [0,1) so amountOutMin cannot go negative | high | 3 | swap | #318 | no | — |
| 0 | [`swap-recipient-encoding-ignored`](./swap-recipient-encoding-ignored.md) | Honor or reject caller recipient in swap calldata (V4/Velodrome) | high | 4 | swap | #444 | yes | — |
| 0 | [`amount-positivity-finiteness`](./amount-positivity-finiteness.md) | Reject zero/negative/non-finite amounts on lend/borrow/transfer | medium | 3 | core | #303 | yes | — |
| 0 | [`apy-finiteness-and-aave-share-price`](./apy-finiteness-and-aave-share-price.md) | Validate APY/reserve math, fix Aave share-price/utilization | medium | 3 | lend | #209 | yes | — |
| 0 | [`assets-precision-and-format-roundtrip`](./assets-precision-and-format-roundtrip.md) | Harden amount parse/format precision, add *Raw escape hatches | medium | 3 | core | #379 | yes | — |
| 0 | [`attribution-suffix-safety-asserts`](./attribution-suffix-safety-asserts.md) | Assert attribution-suffix inertness, EntryPoint-version guards | medium | 3 | wallet | #456 | yes | — |
| 0 | [`backend-auth-token-binding`](./backend-auth-token-binding.md) | Bind verified access token to the wallet-selecting id token | medium | 3 | backend | — | no | — |
| 0 | [`backend-env-secret-validation`](./backend-env-secret-validation.md) | Validate backend secrets/addresses at boot, drop Anvil key | medium | 2 | backend | — | no | — |
| 0 | [`backend-mint-receipt-success-gate`](./backend-mint-receipt-success-gate.md) | Gate demo mint on UserOp receipt.success not unconditional 200 | medium | 2 | backend | — | no | — |
| 0 | [`borrow-marketid-calldata-bind`](./borrow-marketid-calldata-bind.md) | Bind borrow marketId/reserves to calldata, verify config | medium | 4 | borrow | #334 | yes | — |
| 0 | [`caller-address-validation-signing-targets`](./caller-address-validation-signing-targets.md) | isAddress-validate caller walletAddress/recipient pre-signing | medium | 3 | wallet | #163 | yes | — |
| 0 | [`cli-amount-slippage-deadline-parse`](./cli-amount-slippage-deadline-parse.md) | Add decimal/slippage/deadline sanity bounds to CLI parse layer | medium | 2 | cli | #419 | yes | — |
| 0 | [`cli-error-redactor-value-aware`](./cli-error-redactor-value-aware.md) | Make CLI error redactor value-aware (hex/secrets, depth caps) | medium | 3 | cli | — | no | — |
| 0 | [`ens-cache-and-resolution-correctness`](./ens-cache-and-resolution-correctness.md) | Bound ENS caches, forward-confirm resolved names/records | medium | 3 | core | #453 | yes | — |
| 0 | [`eoa-chain-pinning`](./eoa-chain-pinning.md) | Pin and verify chainId in EOA send/sendBatch signatures | medium | 2 | wallet | — | no | — |
| 0 | [`exact-output-approval-and-routing`](./exact-output-approval-and-routing.md) | Key exact-output approval to maxAmountIn and route by input cost | medium | 4 | swap | #435 | no | — |
| 0 | [`frontend-morpho-collateral-auto-pledge`](./frontend-morpho-collateral-auto-pledge.md) | Remove unconfirmed auto-submit max collateral pledge on mount | medium | 2 | frontend | — | no | — |
| 0 | [`hosted-signer-address-reconcile`](./hosted-signer-address-reconcile.md) | Add a shared hosted-wallet signer-address reconciliation seam | medium | 4 | wallet | — | no | — |
| 0 | [`lend-borrow-full-exit-max-sentinel`](./lend-borrow-full-exit-max-sentinel.md) | Provide a dust-free full-exit (max) path for close/max-close | medium | 3 | lend | #209 | yes | — |
| 0 | [`max-mode-allowance-bound`](./max-mode-allowance-bound.md) | Bound max-mode allowances, fix deficit-vs-set ERC20 approval | medium | 3 | core | #133 | yes | — |
| 0 | [`native-in-exact-output-value`](./native-in-exact-output-value.md) | Fix native-in exact-output msg.value placeholder | medium | 3 | swap | — | no | — |
| 0 | [`permit2-approval-owner-and-expiry`](./permit2-approval-owner-and-expiry.md) | Use signer as Permit2 owner and bound expiration to deadline | medium | 3 | swap | #436 | yes | — |
| 0 | [`public-export-surface-guard`](./public-export-surface-guard.md) | Add a public-export-surface snapshot guard, fix asymmetric exports | medium | 2 | core | #483 | yes | — |
| 0 | [`recipient-validation-symmetry`](./recipient-validation-symmetry.md) | Validate swap recipient consistently across providers/resolver | medium | 3 | swap | #437 | yes | — |
| 0 | [`safe-ceiling-ltv-enforcement`](./safe-ceiling-ltv-enforcement.md) | Enforce safeCeilingLtv against projected position LTV | medium | 3 | borrow | — | no | — |
| 0 | [`sdk-dependency-pinning-and-optionality`](./sdk-dependency-pinning-and-optionality.md) | Pin signing-path dep ranges, make vendor SDKs optional/lazy | medium | 4 | infra | #131 | yes | — |
| 0 | [`smart-wallet-deployment-error-taxonomy`](./smart-wallet-deployment-error-taxonomy.md) | Export SmartWalletDeploymentError, align deploy-path errors | medium | 2 | wallet | #474 | yes | — |
| 0 | [`smart-wallet-owner-set-reconcile`](./smart-wallet-owner-set-reconcile.md) | Reconcile smart-wallet owner set/index/nonce before signing | medium | 4 | wallet | #163 | yes | — |
| 0 | [`swap-deadline-validation`](./swap-deadline-validation.md) | Validate swap deadline finite/positive/future before calldata | medium | 2 | swap | #373 | yes | — |
| 0 | [`swap-quote-staleness-and-double-submit`](./swap-quote-staleness-and-double-submit.md) | Surface swap quote staleness, close double-submit window | medium | 3 | frontend | #435 | no | — |
| 0 | [`swap-review-modal-minout-source`](./swap-review-modal-minout-source.md) | Source swap review min-received/slippage from SDK quote | medium | 2 | frontend | #435 | no | — |
| 0 | [`transaction-receipt-union-types`](./transaction-receipt-union-types.md) | Tag wallet receipt/return-type unions, fix lying contracts | medium | 3 | wallet | #337 | yes | — |
| 0 | [`velodrome-native-out-and-priceimpact`](./velodrome-native-out-and-priceimpact.md) | Velodrome native-ETH output unwrap and real priceImpact | medium | 3 | swap | — | no | — |
| 0 | [`zero-borrow-open-leg`](./zero-borrow-open-leg.md) | Reject or reroute zero-borrow collateral-only opens | medium | 2 | borrow | #303 | yes | — |
| 0 | [`api-design-untyped-boundaries`](./api-design-untyped-boundaries.md) | Type external API boundaries, tighten lying public type contracts | low | 3 | core | #337 | yes | — |
| 0 | [`backend-cors-and-error-opacity`](./backend-cors-and-error-opacity.md) | Harden backend CORS null-origin/LOCAL_DEV and error opacity | low | 2 | backend | — | no | — |
| 0 | [`backend-mirror-fire-and-forget`](./backend-mirror-fire-and-forget.md) | Make Aave USDC_DEMO mirror reconcile UserOp success, idempotent | low | 2 | backend | — | no | — |
| 0 | [`backend-request-schema-symmetry`](./backend-request-schema-symmetry.md) | Tighten backend request-schema validation symmetry | low | 2 | backend | — | no | — |
| 0 | [`chain-id-membership-validation`](./chain-id-membership-validation.md) | Validate chainId vs SUPPORTED_CHAIN_IDS at every cast site | low | 2 | core | #334 | yes | — |
| 0 | [`contract-address-provenance-pinning`](./contract-address-provenance-pinning.md) | Pin and integrity-test vendored router/factory/poolManager addrs | low | 2 | infra | #328 | yes | — |
| 0 | [`frontend-borrow-quote-param-parity`](./frontend-borrow-quote-param-parity.md) | Align borrow CTA-gate preview params with executed transaction | low | 2 | frontend | #427 | yes | — |
| 0 | [`frontend-collateral-address-identity`](./frontend-collateral-address-identity.md) | Match pledged collateral by address not symbol on withdraw | low | 2 | frontend | — | no | — |
| 0 | [`frontend-config-parity-and-stub-pricing`](./frontend-config-parity-and-stub-pricing.md) | Reconcile frontend/backend config parity, stub-price fail-open | low | 2 | frontend | #482 | yes | — |
| 0 | [`frontend-double-submit-guards`](./frontend-double-submit-guards.md) | Close lend/withdraw double-submit window with executing ref | low | 2 | frontend | — | no | — |
| 0 | [`frontend-mirror-reconcile`](./frontend-mirror-reconcile.md) | Reconcile frontend Aave mirror (success/over-removal/idempotency) | low | 2 | frontend | — | no | — |
| 0 | [`frontend-wallet-signer-identity`](./frontend-wallet-signer-identity.md) | Recreate smart wallet on signer/account switch | low | 2 | frontend | — | no | — |
| 0 | [`market-resolution-chain-aware`](./market-resolution-chain-aware.md) | Make asset/market allow/block filters and matchers chain-aware | low | 2 | core | #493 | yes | — |
| 0 | [`named-error-taxonomy-signing-path`](./named-error-taxonomy-signing-path.md) | Replace bare Error throws on signing paths with taxonomy | low | 3 | core | #474 | yes | — |
| 0 | [`permit2-payload-bounds`](./permit2-payload-bounds.md) | Bound Permit2 spender/amount/expiration, non-zero spender | low | 2 | core | — | no | — |
| 0 | [`serializebigint-type-safety`](./serializebigint-type-safety.md) | Fix serializeBigInt type-lie and data-loss on CLI/HTTP boundary | low | 2 | core | #419 | yes | — |
| 0 | [`wallet-namespace-init-retry`](./wallet-namespace-init-retry.md) | Clear poisoned init promise, reconcile init retryability | low | 2 | wallet | — | no | — |
| 1 | [`remove-signer-lockout-guard`](./remove-signer-lockout-guard.md) | Guard removeSigner against removing the only signable key | high | 3 | wallet | #163 | yes | `smart-wallet-owner-set-reconcile` |
| 1 | [`amount-decimals-scaling`](./amount-decimals-scaling.md) | Scale lend/borrow amounts by market-underlying decimals | medium | 3 | lend | #334 | yes | `lend-asset-market-validation` |
| 1 | [`borrow-quote-expiry-binding`](./borrow-quote-expiry-binding.md) | Bound borrow quote expiry window (quotedAt<=now<expiresAt) | medium | 2 | borrow | #373 | yes | `prebuilt-quote-calldata-integrity` |
| 1 | [`cli-recipient-validation-and-echo`](./cli-recipient-validation-and-echo.md) | Validate and echo CLI swap recipient before/after signing | medium | 2 | cli | #444 | yes | `swap-recipient-encoding-ignored`, `recipient-validation-symmetry` |
| 1 | [`dynamic-privy-eip712-signer-wiring`](./dynamic-privy-eip712-signer-wiring.md) | Fix Dynamic/Privy raw-digest and EIP-712/Permit2 signer wiring | medium | 3 | wallet | — | no | `hosted-signer-address-reconcile` |
| 1 | [`hosted-provider-validateoptions`](./hosted-provider-validateoptions.md) | Make hosted registry validateOptions validate key selectors | medium | 3 | wallet | #330 | yes | `hosted-signer-address-reconcile` |
| 1 | [`prebuilt-quote-value-chain-reconcile`](./prebuilt-quote-value-chain-reconcile.md) | Reconcile native msg.value and dispatch chainId against encoded quote | medium | 4 | core | #373 | yes | `prebuilt-quote-calldata-integrity` |
| 1 | [`sdk-protocol-dep-demotion`](./sdk-protocol-dep-demotion.md) | Demote ethers@5/@aave/@morpho ABI deps off the signing graph | medium | 3 | infra | #255 | yes | `sdk-dependency-pinning-and-optionality` |
| 1 | [`v4-uint128-bounds-and-encoder-divergence`](./v4-uint128-bounds-and-encoder-divergence.md) | Bound V4 uint128 params, reconcile encoder min-out/max-in | medium | 3 | swap | #318 | no | `slippage-bounds-negative-minout` |
| 1 | [`ci-dependency-audit-and-frozen-lockfile`](./ci-dependency-audit-and-frozen-lockfile.md) | Add CI dep audit, frozen-lockfile install, ship the lockfile | low | 2 | infra | #432 | yes | `sdk-dependency-pinning-and-optionality` |
| 1 | [`cli-lend-max-and-amountormax-projection`](./cli-lend-max-and-amountormax-projection.md) | Route CLI lend close --max through SDK full-balance path | low | 2 | cli | #334 | yes | `lend-borrow-full-exit-max-sentinel` |
| 1 | [`sdk-error-string-sanitization`](./sdk-error-string-sanitization.md) | Stop interpolating caller amount/asset and bundler errors | low | 2 | core | #474 | yes | `named-error-taxonomy-signing-path` |
| 2 | [`cli-pre-send-confirmation`](./cli-pre-send-confirmation.md) | Add a pre-send dry-run/summary affordance for CLI fund verbs | low | 2 | cli | #414 | yes | `cli-recipient-validation-and-echo` |
| 3 | [`e2e-anvil-feature-test`](./e2e-anvil-feature-test.md) | Single consolidated end-to-end Anvil feature-test | high | 5 | testing | #335 | yes | `network-fork-test-harness-consolidation*`, `calldata-encoder-differential-oracles*`, `validator-and-receipt-unit-coverage*`, `hosted-wallet-signer-test-coverage*` |

## Parallelization waves

Run each wave as one batch of parallel agents. A wave starts only once every ticket in all lower-numbered waves has landed; within a wave all tickets are independent and may run concurrently.

### Wave 0 (56 tickets)

No in-set blockers. The foundation batch: the calldata-integrity choke point (`prebuilt-quote-calldata-integrity`), the receipt-status / batch-revert fail-closed gate, the slippage/recipient/lend-asset validators, the named-error taxonomy base, the hosted-signer reconciliation seam, the dep-pinning base, and every standalone backend/frontend/CLI/core hardening fix.

`backend-faucet-auth-and-rate-limit`, `eoa-batch-mid-revert-allowance`, `lend-asset-market-validation`, `prebuilt-quote-calldata-integrity`, `receipt-status-as-success`, `slippage-bounds-negative-minout`, `swap-recipient-encoding-ignored`, `amount-positivity-finiteness`, `apy-finiteness-and-aave-share-price`, `assets-precision-and-format-roundtrip`, `attribution-suffix-safety-asserts`, `backend-auth-token-binding`, `backend-env-secret-validation`, `backend-mint-receipt-success-gate`, `borrow-marketid-calldata-bind`, `caller-address-validation-signing-targets`, `cli-amount-slippage-deadline-parse`, `cli-error-redactor-value-aware`, `ens-cache-and-resolution-correctness`, `eoa-chain-pinning`, `exact-output-approval-and-routing`, `frontend-morpho-collateral-auto-pledge`, `hosted-signer-address-reconcile`, `lend-borrow-full-exit-max-sentinel`, `max-mode-allowance-bound`, `native-in-exact-output-value`, `permit2-approval-owner-and-expiry`, `public-export-surface-guard`, `recipient-validation-symmetry`, `safe-ceiling-ltv-enforcement`, `sdk-dependency-pinning-and-optionality`, `smart-wallet-deployment-error-taxonomy`, `smart-wallet-owner-set-reconcile`, `swap-deadline-validation`, `swap-quote-staleness-and-double-submit`, `swap-review-modal-minout-source`, `transaction-receipt-union-types`, `velodrome-native-out-and-priceimpact`, `zero-borrow-open-leg`, `api-design-untyped-boundaries`, `backend-cors-and-error-opacity`, `backend-mirror-fire-and-forget`, `backend-request-schema-symmetry`, `chain-id-membership-validation`, `contract-address-provenance-pinning`, `frontend-borrow-quote-param-parity`, `frontend-collateral-address-identity`, `frontend-config-parity-and-stub-pricing`, `frontend-double-submit-guards`, `frontend-mirror-reconcile`, `frontend-wallet-signer-identity`, `market-resolution-chain-aware`, `named-error-taxonomy-signing-path`, `permit2-payload-bounds`, `serializebigint-type-safety`, `wallet-namespace-init-retry`

### Wave 1 (12 tickets)

Unblocked once their wave-0 prerequisite lands: value/chainId reconcile and borrow-expiry on top of calldata-integrity, V4 bounds on top of slippage single-sourcing, decimals-scaling on top of lend-asset validation, removeSigner lockout on top of owner-set reconcile, hosted validateOptions + Dynamic/Privy wiring on top of the signer seam, dep demotion + CI lockfile on top of dep-pinning, error-string sanitization on top of the named-error taxonomy, CLI recipient echo + lend-max on top of their SDK fixes.

`remove-signer-lockout-guard`, `amount-decimals-scaling`, `borrow-quote-expiry-binding`, `cli-recipient-validation-and-echo`, `dynamic-privy-eip712-signer-wiring`, `hosted-provider-validateoptions`, `prebuilt-quote-value-chain-reconcile`, `sdk-protocol-dep-demotion`, `v4-uint128-bounds-and-encoder-divergence`, `ci-dependency-audit-and-frozen-lockfile`, `cli-lend-max-and-amountormax-projection`, `sdk-error-string-sanitization`

### Wave 2 (1 tickets)

`cli-pre-send-confirmation` layers the dry-run/summary affordance on top of the CLI recipient validate+echo from wave 1.

`cli-pre-send-confirmation`

### Wave 3 (1 tickets)

`e2e-anvil-feature-test` is the consolidated capstone: it builds on every logic fix above plus its own four internal test-harness prerequisites (`network-fork-test-harness-consolidation`, `calldata-encoder-differential-oracles`, `validator-and-receipt-unit-coverage`, `hosted-wallet-signer-test-coverage`, the PR #348/#332 harness foundation tracked inside the ticket). Run it last.

`e2e-anvil-feature-test`

## Critical path

The longest in-set blocker chain is three deep:

`swap-recipient-encoding-ignored` → `cli-recipient-validation-and-echo` → `cli-pre-send-confirmation`

The SDK swap-recipient fix must land before the CLI can validate+echo the recipient, which in turn gates the CLI pre-send confirmation affordance. The `e2e-anvil-feature-test` capstone sits beyond all four waves: it consumes every logic fix plus its own internal test-harness prerequisites (the #348/#332 harness foundation), so it is the true end of the schedule even though no standalone ticket lists it as a blocker.

Two other notable two-deep chains run in parallel: the calldata-integrity choke point (`prebuilt-quote-calldata-integrity` → `prebuilt-quote-value-chain-reconcile` / `borrow-quote-expiry-binding`) and the hosted-signer seam (`hosted-signer-address-reconcile` → `hosted-provider-validateoptions` / `dynamic-privy-eip712-signer-wiring`). Sequencing wave 0 to prioritize these three chokepoints maximizes how much of waves 1-2 can run concurrently.
