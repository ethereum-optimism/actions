# Actions SDK production-readiness tickets: index

This index is the canonical list of the production-readiness tickets and the wave schedule for running them as batches of parallel branches. Each row links to its full ticket file in this directory. Tickets marked **augment** extend an existing GitHub issue rather than opening a new one; the rest are new.

The schedule below is built to minimize merge conflicts: **within any single wave, no two tickets edit the same file**, so every wave can be cut as a set of parallel branches that merge cleanly in any order. Waves are serialized only where a later ticket either depends on an earlier one or would otherwise collide on a shared ("hot") file. That collision pressure, concentrated in a handful of heavily-edited SDK files, is what stretches the schedule to 16 waves.

## Summary

- **Total tickets:** 74
- **Waves:** 16
- **By severity:** 9 high, 44 medium, 21 low
- **By complexity (1-5):** 32×2, 30×3, 10×4, 2×5
- **Augmenting an existing issue:** 48; **net-new:** 26
- **By domain:** 14 wallet, 14 core, 9 swap, 9 frontend, 7 backend, 5 cli, 4 lend, 4 borrow, 4 infra, 4 testing

## Tickets

The canonical ticket list. **Wave** is the wave the ticket runs in (see the schedule below).

| Wave | Slug | Title | Sev | Cx | Domain | Issue | Augment? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [`backend-faucet-auth-and-rate-limit`](./backend-faucet-auth-and-rate-limit.md) | Authenticate the ETH faucet, add accounting + rate limiting | high | 3 | backend | — | no |
| 1 | [`lend-asset-market-validation`](./lend-asset-market-validation.md) | Validate lend caller asset vs market underlying, enforce lists | high | 4 | lend | #334 | yes |
| 1 | [`prebuilt-quote-calldata-integrity`](./prebuilt-quote-calldata-integrity.md) | Bind pre-built swap/borrow quote dispatch to its calldata bytes | high | 5 | core | #373 | yes |
| 1 | [`backend-env-secret-validation`](./backend-env-secret-validation.md) | Validate backend secrets/addresses at boot, drop Anvil key | medium | 2 | backend | — | no |
| 1 | [`cli-amount-slippage-deadline-parse`](./cli-amount-slippage-deadline-parse.md) | Add decimal/slippage/deadline sanity bounds to CLI parse layer | medium | 2 | cli | #419 | yes |
| 1 | [`cli-error-redactor-value-aware`](./cli-error-redactor-value-aware.md) | Make CLI error redactor value-aware (hex/secrets, depth caps) | medium | 3 | cli | — | no |
| 1 | [`ens-cache-and-resolution-correctness`](./ens-cache-and-resolution-correctness.md) | Bound ENS caches, forward-confirm resolved names/records | medium | 3 | core | #453 | yes |
| 1 | [`frontend-morpho-collateral-auto-pledge`](./frontend-morpho-collateral-auto-pledge.md) | Remove unconfirmed auto-submit max collateral pledge on mount | medium | 2 | frontend | — | no |
| 1 | [`hosted-signer-address-reconcile`](./hosted-signer-address-reconcile.md) | Add a shared hosted-wallet signer-address reconciliation seam | medium | 4 | wallet | — | no |
| 1 | [`network-fork-test-harness-consolidation`](./network-fork-test-harness-consolidation.md) | Consolidate the Anvil fork-test harness and land the PR #348 fixes | medium | 4 | testing | #332 / #348 / #335 | yes |
| 1 | [`sdk-dependency-pinning-and-optionality`](./sdk-dependency-pinning-and-optionality.md) | Pin signing-path dep ranges, make vendor SDKs optional/lazy | medium | 4 | infra | #131 | yes |
| 1 | [`smart-wallet-deployment-error-taxonomy`](./smart-wallet-deployment-error-taxonomy.md) | Export SmartWalletDeploymentError, align deploy-path errors | medium | 2 | wallet | #474 | yes |
| 1 | [`swap-quote-staleness-and-double-submit`](./swap-quote-staleness-and-double-submit.md) | Surface swap quote staleness, close double-submit window | medium | 3 | frontend | #435 | no |
| 1 | [`backend-request-schema-symmetry`](./backend-request-schema-symmetry.md) | Tighten backend request-schema validation symmetry | low | 2 | backend | — | no |
| 1 | [`frontend-config-parity-and-stub-pricing`](./frontend-config-parity-and-stub-pricing.md) | Reconcile frontend/backend config parity, stub-price fail-open | low | 2 | frontend | #482 | yes |
| 1 | [`frontend-wallet-signer-identity`](./frontend-wallet-signer-identity.md) | Recreate smart wallet on signer/account switch | low | 2 | frontend | — | no |
| 1 | [`permit2-payload-bounds`](./permit2-payload-bounds.md) | Bound Permit2 spender/amount/expiration, non-zero spender | low | 2 | core | — | no |
| 2 | [`eoa-batch-mid-revert-allowance`](./eoa-batch-mid-revert-allowance.md) | Stop EOA sendBatch continuing after a mid-batch revert | high | 3 | wallet | #335 | yes |
| 2 | [`slippage-bounds-negative-minout`](./slippage-bounds-negative-minout.md) | Clamp slippage to [0,1) so amountOutMin cannot go negative | high | 3 | swap | #318 | no |
| 2 | [`backend-mint-receipt-success-gate`](./backend-mint-receipt-success-gate.md) | Gate demo mint on UserOp receipt.success not unconditional 200 | medium | 2 | backend | — | no |
| 2 | [`hosted-wallet-signer-test-coverage`](./hosted-wallet-signer-test-coverage.md) | Conformance tests for hosted-wallet signer-to-address binding | medium | 3 | wallet | #335 | yes |
| 2 | [`lend-borrow-full-exit-max-sentinel`](./lend-borrow-full-exit-max-sentinel.md) | Provide a dust-free full-exit (max) path for close/max-close | medium | 3 | lend | #209 | yes |
| 2 | [`public-export-surface-guard`](./public-export-surface-guard.md) | Add a public-export-surface snapshot guard, fix asymmetric exports | medium | 2 | core | #483 | yes |
| 2 | [`safe-ceiling-ltv-enforcement`](./safe-ceiling-ltv-enforcement.md) | Enforce safeCeilingLtv against projected position LTV | medium | 3 | borrow | — | no |
| 2 | [`swap-review-modal-minout-source`](./swap-review-modal-minout-source.md) | Source swap review min-received/slippage from SDK quote | medium | 2 | frontend | #435 | no |
| 2 | [`backend-cors-and-error-opacity`](./backend-cors-and-error-opacity.md) | Harden backend CORS null-origin/LOCAL_DEV and error opacity | low | 2 | backend | — | no |
| 2 | [`frontend-collateral-address-identity`](./frontend-collateral-address-identity.md) | Match pledged collateral by address not symbol on withdraw | low | 2 | frontend | — | no |
| 2 | [`serializebigint-type-safety`](./serializebigint-type-safety.md) | Fix serializeBigInt type-lie and data-loss on CLI/HTTP boundary | low | 2 | core | #419 | yes |
| 3 | [`swap-recipient-encoding-ignored`](./swap-recipient-encoding-ignored.md) | Honor or reject caller recipient in swap calldata (V4/Velodrome) | high | 4 | swap | #444 | yes |
| 3 | [`assets-precision-and-format-roundtrip`](./assets-precision-and-format-roundtrip.md) | Harden amount parse/format precision, add *Raw escape hatches | medium | 3 | core | #379 | yes |
| 3 | [`backend-auth-token-binding`](./backend-auth-token-binding.md) | Bind verified access token to the wallet-selecting id token | medium | 3 | backend | — | no |
| 3 | [`hosted-provider-validateoptions`](./hosted-provider-validateoptions.md) | Make hosted registry validateOptions validate key selectors | medium | 3 | wallet | #330 | yes |
| 3 | [`max-mode-allowance-bound`](./max-mode-allowance-bound.md) | Bound max-mode allowances, fix deficit-vs-set ERC20 approval | medium | 3 | core | #133 | yes |
| 3 | [`validator-and-receipt-unit-coverage`](./validator-and-receipt-unit-coverage.md) | Unit coverage for signing-path validators and receipt-status handling | medium | 2 | testing | — | yes |
| 3 | [`zero-borrow-open-leg`](./zero-borrow-open-leg.md) | Reject or reroute zero-borrow collateral-only opens | medium | 2 | borrow | #303 | yes |
| 3 | [`backend-mirror-fire-and-forget`](./backend-mirror-fire-and-forget.md) | Make Aave USDC_DEMO mirror reconcile UserOp success, idempotent | low | 2 | backend | — | no |
| 3 | [`cli-lend-max-and-amountormax-projection`](./cli-lend-max-and-amountormax-projection.md) | Route CLI lend close --max through SDK full-balance path | low | 2 | cli | #334 | yes |
| 3 | [`frontend-double-submit-guards`](./frontend-double-submit-guards.md) | Close lend/withdraw double-submit window with executing ref | low | 2 | frontend | — | no |
| 4 | [`receipt-status-as-success`](./receipt-status-as-success.md) | Fail closed on reverted-but-mined receipts in send/sendBatch | high | 3 | wallet | #474 | yes |
| 4 | [`amount-decimals-scaling`](./amount-decimals-scaling.md) | Scale lend/borrow amounts by market-underlying decimals | medium | 3 | lend | #334 | yes |
| 4 | [`apy-finiteness-and-aave-share-price`](./apy-finiteness-and-aave-share-price.md) | Validate APY/reserve math, fix Aave share-price/utilization | medium | 3 | lend | #209 | yes |
| 4 | [`calldata-encoder-differential-oracles`](./calldata-encoder-differential-oracles.md) | Differential tests: our calldata vs the protocol SDKs own encoders | medium | 4 | testing | #318 | yes |
| 4 | [`dynamic-privy-eip712-signer-wiring`](./dynamic-privy-eip712-signer-wiring.md) | Fix Dynamic/Privy raw-digest and EIP-712/Permit2 signer wiring | medium | 3 | wallet | — | no |
| 4 | [`recipient-validation-symmetry`](./recipient-validation-symmetry.md) | Validate swap recipient consistently across providers/resolver | medium | 3 | swap | #437 | yes |
| 4 | [`frontend-mirror-reconcile`](./frontend-mirror-reconcile.md) | Reconcile frontend Aave mirror (success/over-removal/idempotency) | low | 2 | frontend | — | no |
| 5 | [`e2e-anvil-feature-test`](./e2e-anvil-feature-test.md) | Single consolidated end-to-end Anvil feature-test | high | 5 | testing | #335 | yes |
| 5 | [`borrow-marketid-calldata-bind`](./borrow-marketid-calldata-bind.md) | Bind borrow marketId/reserves to calldata, verify config | medium | 4 | borrow | #334 | yes |
| 5 | [`cli-recipient-validation-and-echo`](./cli-recipient-validation-and-echo.md) | Validate and echo CLI swap recipient before/after signing | medium | 2 | cli | #444 | yes |
| 5 | [`eoa-chain-pinning`](./eoa-chain-pinning.md) | Pin and verify chainId in EOA send/sendBatch signatures | medium | 2 | wallet | — | no |
| 5 | [`native-in-exact-output-value`](./native-in-exact-output-value.md) | Fix native-in exact-output msg.value placeholder | medium | 3 | swap | — | no |
| 5 | [`frontend-borrow-quote-param-parity`](./frontend-borrow-quote-param-parity.md) | Align borrow CTA-gate preview params with executed transaction | low | 2 | frontend | #427 | yes |
| 6 | [`borrow-quote-expiry-binding`](./borrow-quote-expiry-binding.md) | Bound borrow quote expiry window (quotedAt<=now<expiresAt) | medium | 2 | borrow | #373 | yes |
| 6 | [`sdk-protocol-dep-demotion`](./sdk-protocol-dep-demotion.md) | Demote ethers@5/@aave/@morpho ABI deps off the signing graph | medium | 3 | infra | #255 | yes |
| 6 | [`smart-wallet-owner-set-reconcile`](./smart-wallet-owner-set-reconcile.md) | Reconcile smart-wallet owner set/index/nonce before signing | medium | 4 | wallet | #163 | yes |
| 6 | [`velodrome-native-out-and-priceimpact`](./velodrome-native-out-and-priceimpact.md) | Velodrome native-ETH output unwrap and real priceImpact | medium | 3 | swap | — | no |
| 6 | [`cli-pre-send-confirmation`](./cli-pre-send-confirmation.md) | Add a pre-send dry-run/summary affordance for CLI fund verbs | low | 2 | cli | #414 | yes |
| 7 | [`remove-signer-lockout-guard`](./remove-signer-lockout-guard.md) | Guard removeSigner against removing the only signable key | high | 3 | wallet | #163 | yes |
| 7 | [`swap-deadline-validation`](./swap-deadline-validation.md) | Validate swap deadline finite/positive/future before calldata | medium | 2 | swap | #373 | yes |
| 7 | [`api-design-untyped-boundaries`](./api-design-untyped-boundaries.md) | Type external API boundaries, tighten lying public type contracts | low | 3 | core | #337 | yes |
| 7 | [`ci-dependency-audit-and-frozen-lockfile`](./ci-dependency-audit-and-frozen-lockfile.md) | Add CI dep audit, frozen-lockfile install, ship the lockfile | low | 2 | infra | #432 | yes |
| 8 | [`amount-positivity-finiteness`](./amount-positivity-finiteness.md) | Reject zero/negative/non-finite amounts on lend/borrow/transfer | medium | 3 | core | #303 | yes |
| 8 | [`permit2-approval-owner-and-expiry`](./permit2-approval-owner-and-expiry.md) | Use signer as Permit2 owner and bound expiration to deadline | medium | 3 | swap | #436 | yes |
| 9 | [`attribution-suffix-safety-asserts`](./attribution-suffix-safety-asserts.md) | Assert attribution-suffix inertness, EntryPoint-version guards | medium | 3 | wallet | #456 | yes |
| 9 | [`v4-uint128-bounds-and-encoder-divergence`](./v4-uint128-bounds-and-encoder-divergence.md) | Bound V4 uint128 params, reconcile encoder min-out/max-in | medium | 3 | swap | #318 | no |
| 9 | [`market-resolution-chain-aware`](./market-resolution-chain-aware.md) | Make asset/market allow/block filters and matchers chain-aware | low | 2 | core | #493 | yes |
| 10 | [`caller-address-validation-signing-targets`](./caller-address-validation-signing-targets.md) | isAddress-validate caller walletAddress/recipient pre-signing | medium | 3 | wallet | #163 | yes |
| 10 | [`exact-output-approval-and-routing`](./exact-output-approval-and-routing.md) | Key exact-output approval to maxAmountIn and route by input cost | medium | 4 | swap | #435 | no |
| 10 | [`prebuilt-quote-value-chain-reconcile`](./prebuilt-quote-value-chain-reconcile.md) | Reconcile native msg.value and dispatch chainId against encoded quote | medium | 4 | core | #373 | yes |
| 11 | [`transaction-receipt-union-types`](./transaction-receipt-union-types.md) | Tag wallet receipt/return-type unions, fix lying contracts | medium | 3 | wallet | #337 | yes |
| 12 | [`named-error-taxonomy-signing-path`](./named-error-taxonomy-signing-path.md) | Replace bare Error throws on signing paths with taxonomy | low | 3 | core | #474 | yes |
| 13 | [`chain-id-membership-validation`](./chain-id-membership-validation.md) | Validate chainId vs SUPPORTED_CHAIN_IDS at every cast site | low | 2 | core | #334 | yes |
| 14 | [`contract-address-provenance-pinning`](./contract-address-provenance-pinning.md) | Pin and integrity-test vendored router/factory/poolManager addrs | low | 2 | infra | #328 | yes |
| 15 | [`sdk-error-string-sanitization`](./sdk-error-string-sanitization.md) | Stop interpolating caller amount/asset and bundler errors | low | 2 | core | #474 | yes |
| 16 | [`wallet-namespace-init-retry`](./wallet-namespace-init-retry.md) | Clear poisoned init promise, reconcile init retryability | low | 2 | wallet | — | no |

## Parallelization waves

Run each wave as one batch of parallel branches. A wave starts only once every ticket in all lower-numbered waves has landed. **Within a wave, no two tickets edit the same file**, so the branches in a wave can be developed and merged concurrently without merge conflicts. Sizes shrink toward the tail because the remaining tickets all collide on the same few hot files (see below) and must serialize.

### Wave 1 (17 tickets)

4 of 6 chokepoints land here at the earliest possible wave (prebuilt-quote-calldata-integrity, lend-asset-market-validation, sdk-dependency-pinning-and-optionality, hosted-signer-address-reconcile) since none has blockers; remaining slots filled with disjoint-file tickets across backend/cli/frontend/ens/permit2.

[`prebuilt-quote-calldata-integrity`](./prebuilt-quote-calldata-integrity.md), [`lend-asset-market-validation`](./lend-asset-market-validation.md), [`sdk-dependency-pinning-and-optionality`](./sdk-dependency-pinning-and-optionality.md), [`hosted-signer-address-reconcile`](./hosted-signer-address-reconcile.md), [`backend-faucet-auth-and-rate-limit`](./backend-faucet-auth-and-rate-limit.md), [`network-fork-test-harness-consolidation`](./network-fork-test-harness-consolidation.md), [`swap-quote-staleness-and-double-submit`](./swap-quote-staleness-and-double-submit.md), [`smart-wallet-deployment-error-taxonomy`](./smart-wallet-deployment-error-taxonomy.md), [`cli-error-redactor-value-aware`](./cli-error-redactor-value-aware.md), [`cli-amount-slippage-deadline-parse`](./cli-amount-slippage-deadline-parse.md), [`ens-cache-and-resolution-correctness`](./ens-cache-and-resolution-correctness.md), [`backend-env-secret-validation`](./backend-env-secret-validation.md), [`frontend-morpho-collateral-auto-pledge`](./frontend-morpho-collateral-auto-pledge.md), [`permit2-payload-bounds`](./permit2-payload-bounds.md), [`backend-request-schema-symmetry`](./backend-request-schema-symmetry.md), [`frontend-config-parity-and-stub-pricing`](./frontend-config-parity-and-stub-pricing.md), [`frontend-wallet-signer-identity`](./frontend-wallet-signer-identity.md)

### Wave 2 (11 tickets)

slippage-bounds-negative-minout chokepoint lands here (held out of wave 1 only because it shares SwapProvider.ts + core/error/errors.ts with prebuilt-quote-calldata-integrity, so it must rebase on it).

[`slippage-bounds-negative-minout`](./slippage-bounds-negative-minout.md), [`eoa-batch-mid-revert-allowance`](./eoa-batch-mid-revert-allowance.md), [`lend-borrow-full-exit-max-sentinel`](./lend-borrow-full-exit-max-sentinel.md), [`hosted-wallet-signer-test-coverage`](./hosted-wallet-signer-test-coverage.md), [`public-export-surface-guard`](./public-export-surface-guard.md), [`safe-ceiling-ltv-enforcement`](./safe-ceiling-ltv-enforcement.md), [`backend-mint-receipt-success-gate`](./backend-mint-receipt-success-gate.md), [`swap-review-modal-minout-source`](./swap-review-modal-minout-source.md), [`frontend-collateral-address-identity`](./frontend-collateral-address-identity.md), [`serializebigint-type-safety`](./serializebigint-type-safety.md), [`backend-cors-and-error-opacity`](./backend-cors-and-error-opacity.md)

### Wave 3 (10 tickets)

swap-recipient-encoding-ignored chokepoint lands here (shares WalletSwapNamespace.ts with prebuilt-quote in w1 and uniswap/encoding.ts + velodrome v2.ts with slippage-bounds in w2, so it serializes behind both).

[`swap-recipient-encoding-ignored`](./swap-recipient-encoding-ignored.md), [`validator-and-receipt-unit-coverage`](./validator-and-receipt-unit-coverage.md), [`hosted-provider-validateoptions`](./hosted-provider-validateoptions.md), [`zero-borrow-open-leg`](./zero-borrow-open-leg.md), [`assets-precision-and-format-roundtrip`](./assets-precision-and-format-roundtrip.md), [`max-mode-allowance-bound`](./max-mode-allowance-bound.md), [`backend-auth-token-binding`](./backend-auth-token-binding.md), [`cli-lend-max-and-amountormax-projection`](./cli-lend-max-and-amountormax-projection.md), [`frontend-double-submit-guards`](./frontend-double-submit-guards.md), [`backend-mirror-fire-and-forget`](./backend-mirror-fire-and-forget.md)

### Wave 4 (7 tickets)

amount-decimals-scaling now eligible (blocker lend-asset-market-validation in w1); dynamic-privy-eip712-signer-wiring eligible (blocker hosted-signer-address-reconcile in w1).

[`receipt-status-as-success`](./receipt-status-as-success.md), [`recipient-validation-symmetry`](./recipient-validation-symmetry.md), [`calldata-encoder-differential-oracles`](./calldata-encoder-differential-oracles.md), [`amount-decimals-scaling`](./amount-decimals-scaling.md), [`apy-finiteness-and-aave-share-price`](./apy-finiteness-and-aave-share-price.md), [`dynamic-privy-eip712-signer-wiring`](./dynamic-privy-eip712-signer-wiring.md), [`frontend-mirror-reconcile`](./frontend-mirror-reconcile.md)

### Wave 5 (6 tickets)

e2e-anvil-feature-test unblocks: all 4 blockers (network-fork w1, calldata-encoder-differential w4, validator-and-receipt w3, hosted-wallet-signer-test w2) are now strictly earlier. cli-recipient-validation-and-echo eligible after recipient-validation-symmetry (w4) and swap-recipient-encoding (w3).

[`e2e-anvil-feature-test`](./e2e-anvil-feature-test.md), [`cli-recipient-validation-and-echo`](./cli-recipient-validation-and-echo.md), [`eoa-chain-pinning`](./eoa-chain-pinning.md), [`native-in-exact-output-value`](./native-in-exact-output-value.md), [`borrow-marketid-calldata-bind`](./borrow-marketid-calldata-bind.md), [`frontend-borrow-quote-param-parity`](./frontend-borrow-quote-param-parity.md)

### Wave 6 (5 tickets)

borrow-quote-expiry-binding waits on prebuilt-quote-calldata-integrity (w1) but serializes on SwapProvider/validation/WalletBorrowNamespace hot files; cli-pre-send-confirmation after cli-recipient-validation-and-echo (w5).

[`smart-wallet-owner-set-reconcile`](./smart-wallet-owner-set-reconcile.md), [`borrow-quote-expiry-binding`](./borrow-quote-expiry-binding.md), [`velodrome-native-out-and-priceimpact`](./velodrome-native-out-and-priceimpact.md), [`sdk-protocol-dep-demotion`](./sdk-protocol-dep-demotion.md), [`cli-pre-send-confirmation`](./cli-pre-send-confirmation.md)

### Wave 7 (4 tickets)

remove-signer-lockout-guard eligible after smart-wallet-owner-set-reconcile (w6); ci-dependency-audit after sdk-dependency-pinning (w1) but shares package.json with sdk-protocol-dep-demotion in w6.

[`remove-signer-lockout-guard`](./remove-signer-lockout-guard.md), [`swap-deadline-validation`](./swap-deadline-validation.md), [`ci-dependency-audit-and-frozen-lockfile`](./ci-dependency-audit-and-frozen-lockfile.md), [`api-design-untyped-boundaries`](./api-design-untyped-boundaries.md)

### Wave 8 (2 tickets)

both blocked only by DefaultSmartWallet.ts / approve.ts hot-file serialization against earlier waves.

[`amount-positivity-finiteness`](./amount-positivity-finiteness.md), [`permit2-approval-owner-and-expiry`](./permit2-approval-owner-and-expiry.md)

### Wave 9 (3 tickets)

v4-uint128-bounds eligible after slippage-bounds-negative-minout (w2) but serializes on uniswap/encoding.ts + SwapProvider.ts hot files.

[`attribution-suffix-safety-asserts`](./attribution-suffix-safety-asserts.md), [`v4-uint128-bounds-and-encoder-divergence`](./v4-uint128-bounds-and-encoder-divergence.md), [`market-resolution-chain-aware`](./market-resolution-chain-aware.md)

### Wave 10 (3 tickets)

prebuilt-quote-value-chain-reconcile eligible after prebuilt-quote-calldata-integrity (w1) but shares SwapProvider.ts/WalletSwapNamespace.ts/EOAWallet.ts with many earlier hot-file edits.

[`caller-address-validation-signing-targets`](./caller-address-validation-signing-targets.md), [`prebuilt-quote-value-chain-reconcile`](./prebuilt-quote-value-chain-reconcile.md), [`exact-output-approval-and-routing`](./exact-output-approval-and-routing.md)

### Wave 11 (1 ticket)

Forced solo by DefaultSmartWallet.ts (16-ticket hot file) plus LendProvider.ts, types/lend/base.ts, WalletBorrowNamespace.ts conflicts against every remaining and prior ticket.

[`transaction-receipt-union-types`](./transaction-receipt-union-types.md)

### Wave 12 (1 ticket)

Forced solo: touches the AaveLendProvider/MorphoLendProvider/LendProvider/DefaultSmartWallet/BorrowProvider/errors.ts hot cluster simultaneously.

[`named-error-taxonomy-signing-path`](./named-error-taxonomy-signing-path.md)

### Wave 13 (1 ticket)

Forced solo by DefaultSmartWallet.ts + validation.ts (10-ticket) + ChainManager.ts + backend schemas/controllers overlaps.

[`chain-id-membership-validation`](./chain-id-membership-validation.md)

### Wave 14 (1 ticket)

Forced solo by DefaultSmartWallet.ts + smart/default/constants + aave/marketId.ts conflicts.

[`contract-address-provenance-pinning`](./contract-address-provenance-pinning.md)

### Wave 15 (1 ticket)

Blocked by named-error-taxonomy-signing-path (w12) and shares AaveLendProvider/MorphoLendProvider/DefaultSmartWallet.ts with it; lands once that is strictly earlier and the hot files clear.

[`sdk-error-string-sanitization`](./sdk-error-string-sanitization.md)

### Wave 16 (1 ticket)

Final tail: WalletNamespace.ts + Wallet.ts + actions.ts + DefaultSmartWallet.ts all conflict with earlier waves, so it serializes last.

[`wallet-namespace-init-retry`](./wallet-namespace-init-retry.md)

## Hot files (serialized across waves)

These files are each edited by multiple tickets. Because no wave may contain two tickets that touch the same file, the tickets listed against each file are spread across different waves rather than batched together. The four hottest files below are the reason the schedule has a long, mostly-solo tail: every ticket touching `DefaultSmartWallet.ts`, `validation.ts`, `SwapProvider.ts`, or `uniswap/encoding.ts` must wait for the previous editor of that file to land and then rebase on it.

| File | Tickets | Slugs |
| --- | --- | --- |
| `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts` | 16 | `sdk-dependency-pinning-and-optionality` (w1), `eoa-batch-mid-revert-allowance` (w2), `validator-and-receipt-unit-coverage` (w3), `receipt-status-as-success` (w4), `e2e-anvil-feature-test` (w5), `smart-wallet-owner-set-reconcile` (w6), `remove-signer-lockout-guard` (w7), `amount-positivity-finiteness` (w8), `attribution-suffix-safety-asserts` (w9), `caller-address-validation-signing-targets` (w10), `transaction-receipt-union-types` (w11), `named-error-taxonomy-signing-path` (w12), `chain-id-membership-validation` (w13), `contract-address-provenance-pinning` (w14), `sdk-error-string-sanitization` (w15), `wallet-namespace-init-retry` (w16) |
| `packages/sdk/src/actions/swap/core/SwapProvider.ts` | 10 | `prebuilt-quote-calldata-integrity` (w1), `slippage-bounds-negative-minout` (w2), `hosted-provider-validateoptions` (w3), `recipient-validation-symmetry` (w4), `native-in-exact-output-value` (w5), `borrow-quote-expiry-binding` (w6), `swap-deadline-validation` (w7), `permit2-approval-owner-and-expiry` (w8), `v4-uint128-bounds-and-encoder-divergence` (w9), `prebuilt-quote-value-chain-reconcile` (w10) |
| `packages/sdk/src/utils/validation.ts` | 10 | `permit2-payload-bounds` (w1), `slippage-bounds-negative-minout` (w2), `validator-and-receipt-unit-coverage` (w3), `recipient-validation-symmetry` (w4), `eoa-chain-pinning` (w5), `borrow-quote-expiry-binding` (w6), `swap-deadline-validation` (w7), `amount-positivity-finiteness` (w8), `market-resolution-chain-aware` (w9), `chain-id-membership-validation` (w13) |
| `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts` | 8 | `slippage-bounds-negative-minout` (w2), `swap-recipient-encoding-ignored` (w3), `calldata-encoder-differential-oracles` (w4), `native-in-exact-output-value` (w5), `velodrome-native-out-and-priceimpact` (w6), `swap-deadline-validation` (w7), `v4-uint128-bounds-and-encoder-divergence` (w9), `exact-output-approval-and-routing` (w10) |
| `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts` | 7 | `prebuilt-quote-calldata-integrity` (w1), `safe-ceiling-ltv-enforcement` (w2), `receipt-status-as-success` (w4), `e2e-anvil-feature-test` (w5), `borrow-quote-expiry-binding` (w6), `prebuilt-quote-value-chain-reconcile` (w10), `transaction-receipt-union-types` (w11) |
| `packages/sdk/src/actions/lend/core/LendProvider.ts` | 7 | `lend-asset-market-validation` (w1), `max-mode-allowance-bound` (w3), `amount-decimals-scaling` (w4), `e2e-anvil-feature-test` (w5), `amount-positivity-finiteness` (w8), `transaction-receipt-union-types` (w11), `named-error-taxonomy-signing-path` (w12) |
| `packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts` | 7 | `lend-borrow-full-exit-max-sentinel` (w2), `max-mode-allowance-bound` (w3), `calldata-encoder-differential-oracles` (w4), `e2e-anvil-feature-test` (w5), `ci-dependency-audit-and-frozen-lockfile` (w7), `named-error-taxonomy-signing-path` (w12), `sdk-error-string-sanitization` (w15) |
| `packages/sdk/src/core/error/errors.ts` | 7 | `prebuilt-quote-calldata-integrity` (w1), `slippage-bounds-negative-minout` (w2), `zero-borrow-open-leg` (w3), `eoa-chain-pinning` (w5), `velodrome-native-out-and-priceimpact` (w6), `v4-uint128-bounds-and-encoder-divergence` (w9), `named-error-taxonomy-signing-path` (w12) |
| `packages/sdk/src/types/swap/base.ts` | 7 | `swap-quote-staleness-and-double-submit` (w1), `public-export-surface-guard` (w2), `assets-precision-and-format-roundtrip` (w3), `native-in-exact-output-value` (w5), `borrow-quote-expiry-binding` (w6), `api-design-untyped-boundaries` (w7), `exact-output-approval-and-routing` (w10) |
| `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts` | 6 | `lend-borrow-full-exit-max-sentinel` (w2), `max-mode-allowance-bound` (w3), `calldata-encoder-differential-oracles` (w4), `sdk-protocol-dep-demotion` (w6), `named-error-taxonomy-signing-path` (w12), `sdk-error-string-sanitization` (w15) |
| `packages/sdk/src/actions/swap/providers/uniswap/UniswapSwapProvider.ts` | 6 | `prebuilt-quote-calldata-integrity` (w1), `assets-precision-and-format-roundtrip` (w3), `native-in-exact-output-value` (w5), `swap-deadline-validation` (w7), `permit2-approval-owner-and-expiry` (w8), `exact-output-approval-and-routing` (w10) |
| `packages/sdk/src/types/lend/base.ts` | 6 | `lend-asset-market-validation` (w1), `lend-borrow-full-exit-max-sentinel` (w2), `assets-precision-and-format-roundtrip` (w3), `apy-finiteness-and-aave-share-price` (w4), `api-design-untyped-boundaries` (w7), `transaction-receipt-union-types` (w11) |
| `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts` | 6 | `hosted-signer-address-reconcile` (w1), `eoa-batch-mid-revert-allowance` (w2), `validator-and-receipt-unit-coverage` (w3), `receipt-status-as-success` (w4), `eoa-chain-pinning` (w5), `prebuilt-quote-value-chain-reconcile` (w10) |
| `packages/sdk/src/actions/borrow/core/internalParams.ts` | 5 | `lend-borrow-full-exit-max-sentinel` (w2), `zero-borrow-open-leg` (w3), `amount-decimals-scaling` (w4), `frontend-borrow-quote-param-parity` (w5), `amount-positivity-finiteness` (w8) |
| `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/v2.ts` | 5 | `swap-recipient-encoding-ignored` (w3), `recipient-validation-symmetry` (w4), `velodrome-native-out-and-priceimpact` (w6), `swap-deadline-validation` (w7), `named-error-taxonomy-signing-path` (w12) |
| `packages/sdk/src/index.ts` | 5 | `smart-wallet-deployment-error-taxonomy` (w1), `public-export-surface-guard` (w2), `borrow-marketid-calldata-bind` (w5), `sdk-protocol-dep-demotion` (w6), `named-error-taxonomy-signing-path` (w12) |
| `packages/sdk/package.json` | 4 | `sdk-dependency-pinning-and-optionality` (w1), `calldata-encoder-differential-oracles` (w4), `sdk-protocol-dep-demotion` (w6), `ci-dependency-audit-and-frozen-lockfile` (w7) |
| `packages/sdk/src/actions.ts` | 4 | `recipient-validation-symmetry` (w4), `borrow-marketid-calldata-bind` (w5), `market-resolution-chain-aware` (w9), `wallet-namespace-init-retry` (w16) |
| `packages/sdk/src/actions/borrow/core/BorrowProvider.ts` | 4 | `lend-asset-market-validation` (w1), `safe-ceiling-ltv-enforcement` (w2), `borrow-quote-expiry-binding` (w6), `named-error-taxonomy-signing-path` (w12) |
| `packages/sdk/src/actions/borrow/providers/morpho/MorphoBorrowProvider.ts` | 4 | `amount-decimals-scaling` (w4), `borrow-marketid-calldata-bind` (w5), `amount-positivity-finiteness` (w8), `market-resolution-chain-aware` (w9) |
| `packages/sdk/src/wallet/core/wallets/abstract/types/index.ts` | 3 | `eoa-batch-mid-revert-allowance` (w2), `frontend-mirror-reconcile` (w4), `transaction-receipt-union-types` (w11) |
| `packages/sdk/src/actions/swap/namespaces/WalletSwapNamespace.ts` | 3 | `prebuilt-quote-calldata-integrity` (w1), `receipt-status-as-success` (w4), `prebuilt-quote-value-chain-reconcile` (w10) |
| `packages/sdk/src/utils/approve.ts` | 3 | `permit2-payload-bounds` (w1), `max-mode-allowance-bound` (w3), `permit2-approval-owner-and-expiry` (w8) |
| `packages/sdk/src/wallet/core/error/errors.ts` | 3 | `eoa-batch-mid-revert-allowance` (w2), `receipt-status-as-success` (w4), `named-error-taxonomy-signing-path` (w12) |
| `packages/sdk/src/wallet/core/namespace/WalletNamespace.ts` | 3 | `hosted-signer-address-reconcile` (w1), `hosted-provider-validateoptions` (w3), `wallet-namespace-init-retry` (w16) |

## Chokepoint ordering

The six named chokepoints land as early as their overlaps allow: `prebuilt-quote-calldata-integrity`, `lend-asset-market-validation`, `sdk-dependency-pinning-and-optionality`, and `hosted-signer-address-reconcile` in wave 1 (no blockers, mutually file-disjoint); `slippage-bounds-negative-minout` in wave 2 (rebases on `prebuilt-quote-calldata-integrity` via `SwapProvider.ts` + `core/error/errors.ts`); `swap-recipient-encoding-ignored` in wave 3 (rebases on `prebuilt-quote-calldata-integrity` via `WalletSwapNamespace.ts` and on `slippage-bounds-negative-minout` via `uniswap/encoding.ts` + velodrome `v2.ts`).

Within each wave, no two tickets edit the same source file (verified against each ticket's **Affected files** section), so every wave can be cut as a set of parallel branches that merge cleanly in any order.

