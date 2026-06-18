# Actions SDK production-readiness tickets: index

This index is the canonical list of the production-readiness tickets and the phase schedule for running them. Each row links to its full ticket file in this directory. Tickets marked **augment** extend an existing GitHub issue rather than opening a new one; the rest are new.

The schedule is organized into **5 priority phases**, highest-value work first. Phases are ordered by priority, not by conflict avoidance: the earliest phases carry the most important and most-unblocking work, and the tail collects the lowest-priority cleanup plus the capstone whose blockers force it last. A little merge-conflict overlap inside a phase is acceptable; where two tickets in the same phase edit the same file, that pair is recorded below so the branches can be sequenced within the phase rather than merged blindly in parallel.

## Summary

- **Total tickets:** 74
- **Phases:** 5
- **By severity:** 9 high, 44 medium, 21 low
- **By complexity (1-5):** 32×2, 30×3, 10×4, 2×5
- **Augmenting an existing issue:** 48; **net-new:** 26
- **By domain:** 14 wallet, 14 core, 9 swap, 9 frontend, 7 backend, 5 cli, 4 lend, 4 borrow, 4 infra, 4 testing
- **Per phase:** Phase 1 — 16 tickets, Phase 2 — 15 tickets, Phase 3 — 15 tickets, Phase 4 — 14 tickets, Phase 5 — 14 tickets

## Tickets

The canonical ticket list. **Phase** is the priority phase the ticket runs in (see the schedule below).

| Phase | Slug | Title | Sev | Cx | Domain | Issue | Augment? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [`prebuilt-quote-calldata-integrity`](./prebuilt-quote-calldata-integrity.md) | Bind pre-built swap/borrow quote dispatch to its calldata bytes | high | 5 | core | #373 | yes |
| 1 | [`swap-recipient-encoding-ignored`](./swap-recipient-encoding-ignored.md) | Honor or reject caller recipient in swap calldata (V4/Velodrome) | high | 4 | swap | #444 | yes |
| 1 | [`lend-asset-market-validation`](./lend-asset-market-validation.md) | Validate lend caller asset vs market underlying, enforce lists | high | 4 | lend | #334 | yes |
| 1 | [`slippage-bounds-negative-minout`](./slippage-bounds-negative-minout.md) | Clamp slippage to [0,1) so amountOutMin cannot go negative | high | 3 | swap | #318 | no |
| 1 | [`hosted-signer-address-reconcile`](./hosted-signer-address-reconcile.md) | Add a shared hosted-wallet signer-address reconciliation seam | medium | 4 | wallet | — | no |
| 1 | [`sdk-dependency-pinning-and-optionality`](./sdk-dependency-pinning-and-optionality.md) | Pin signing-path dep ranges, make vendor SDKs optional/lazy | medium | 4 | infra | #131 | yes |
| 1 | [`network-fork-test-harness-consolidation`](./network-fork-test-harness-consolidation.md) | Consolidate the Anvil fork-test harness and land the PR #348 fixes | medium | 4 | testing | #332 / #348 / #335 | yes |
| 1 | [`hosted-wallet-signer-test-coverage`](./hosted-wallet-signer-test-coverage.md) | Conformance tests for hosted-wallet signer-to-address binding | medium | 3 | wallet | #335 | yes |
| 1 | [`validator-and-receipt-unit-coverage`](./validator-and-receipt-unit-coverage.md) | Unit coverage for signing-path validators and receipt-status handling | medium | 2 | testing | — | yes |
| 1 | [`calldata-encoder-differential-oracles`](./calldata-encoder-differential-oracles.md) | Differential tests: our calldata vs the protocol SDKs own encoders | medium | 4 | testing | #318 | yes |
| 1 | [`backend-faucet-auth-and-rate-limit`](./backend-faucet-auth-and-rate-limit.md) | Authenticate the ETH faucet, add accounting + rate limiting | high | 3 | backend | — | no |
| 1 | [`eoa-batch-mid-revert-allowance`](./eoa-batch-mid-revert-allowance.md) | Stop EOA sendBatch continuing after a mid-batch revert | high | 3 | wallet | #335 | yes |
| 1 | [`receipt-status-as-success`](./receipt-status-as-success.md) | Fail closed on reverted-but-mined receipts in send/sendBatch | high | 3 | wallet | #474 | yes |
| 1 | [`smart-wallet-owner-set-reconcile`](./smart-wallet-owner-set-reconcile.md) | Reconcile smart-wallet owner set/index/nonce before signing | medium | 4 | wallet | #163 | yes |
| 1 | [`recipient-validation-symmetry`](./recipient-validation-symmetry.md) | Validate swap recipient consistently across providers/resolver | medium | 3 | swap | #437 | yes |
| 1 | [`lend-borrow-full-exit-max-sentinel`](./lend-borrow-full-exit-max-sentinel.md) | Provide a dust-free full-exit (max) path for close/max-close | medium | 3 | lend | #209 | yes |
| 2 | [`remove-signer-lockout-guard`](./remove-signer-lockout-guard.md) | Guard removeSigner against removing the only signable key | high | 3 | wallet | #163 | yes |
| 2 | [`cli-recipient-validation-and-echo`](./cli-recipient-validation-and-echo.md) | Validate and echo CLI swap recipient before/after signing | medium | 2 | cli | #444 | yes |
| 2 | [`borrow-marketid-calldata-bind`](./borrow-marketid-calldata-bind.md) | Bind borrow marketId/reserves to calldata, verify config | medium | 4 | borrow | #334 | yes |
| 2 | [`exact-output-approval-and-routing`](./exact-output-approval-and-routing.md) | Key exact-output approval to maxAmountIn and route by input cost | medium | 4 | swap | #435 | no |
| 2 | [`prebuilt-quote-value-chain-reconcile`](./prebuilt-quote-value-chain-reconcile.md) | Reconcile native msg.value and dispatch chainId against encoded quote | medium | 4 | core | #373 | yes |
| 2 | [`amount-decimals-scaling`](./amount-decimals-scaling.md) | Scale lend/borrow amounts by market-underlying decimals | medium | 3 | lend | #334 | yes |
| 2 | [`amount-positivity-finiteness`](./amount-positivity-finiteness.md) | Reject zero/negative/non-finite amounts on lend/borrow/transfer | medium | 3 | core | #303 | yes |
| 2 | [`apy-finiteness-and-aave-share-price`](./apy-finiteness-and-aave-share-price.md) | Validate APY/reserve math, fix Aave share-price/utilization | medium | 3 | lend | #209 | yes |
| 2 | [`assets-precision-and-format-roundtrip`](./assets-precision-and-format-roundtrip.md) | Harden amount parse/format precision, add *Raw escape hatches | medium | 3 | core | #379 | yes |
| 2 | [`attribution-suffix-safety-asserts`](./attribution-suffix-safety-asserts.md) | Assert attribution-suffix inertness, EntryPoint-version guards | medium | 3 | wallet | #456 | yes |
| 2 | [`backend-auth-token-binding`](./backend-auth-token-binding.md) | Bind verified access token to the wallet-selecting id token | medium | 3 | backend | — | no |
| 2 | [`caller-address-validation-signing-targets`](./caller-address-validation-signing-targets.md) | isAddress-validate caller walletAddress/recipient pre-signing | medium | 3 | wallet | #163 | yes |
| 2 | [`cli-error-redactor-value-aware`](./cli-error-redactor-value-aware.md) | Make CLI error redactor value-aware (hex/secrets, depth caps) | medium | 3 | cli | — | no |
| 2 | [`dynamic-privy-eip712-signer-wiring`](./dynamic-privy-eip712-signer-wiring.md) | Fix Dynamic/Privy raw-digest and EIP-712/Permit2 signer wiring | medium | 3 | wallet | — | no |
| 2 | [`ens-cache-and-resolution-correctness`](./ens-cache-and-resolution-correctness.md) | Bound ENS caches, forward-confirm resolved names/records | medium | 3 | core | #453 | yes |
| 3 | [`hosted-provider-validateoptions`](./hosted-provider-validateoptions.md) | Make hosted registry validateOptions validate key selectors | medium | 3 | wallet | #330 | yes |
| 3 | [`max-mode-allowance-bound`](./max-mode-allowance-bound.md) | Bound max-mode allowances, fix deficit-vs-set ERC20 approval | medium | 3 | core | #133 | yes |
| 3 | [`native-in-exact-output-value`](./native-in-exact-output-value.md) | Fix native-in exact-output msg.value placeholder | medium | 3 | swap | — | no |
| 3 | [`permit2-approval-owner-and-expiry`](./permit2-approval-owner-and-expiry.md) | Use signer as Permit2 owner and bound expiration to deadline | medium | 3 | swap | #436 | yes |
| 3 | [`safe-ceiling-ltv-enforcement`](./safe-ceiling-ltv-enforcement.md) | Enforce safeCeilingLtv against projected position LTV | medium | 3 | borrow | — | no |
| 3 | [`sdk-protocol-dep-demotion`](./sdk-protocol-dep-demotion.md) | Demote ethers@5/@aave/@morpho ABI deps off the signing graph | medium | 3 | infra | #255 | yes |
| 3 | [`swap-quote-staleness-and-double-submit`](./swap-quote-staleness-and-double-submit.md) | Surface swap quote staleness, close double-submit window | medium | 3 | frontend | #435 | no |
| 3 | [`transaction-receipt-union-types`](./transaction-receipt-union-types.md) | Tag wallet receipt/return-type unions, fix lying contracts | medium | 3 | wallet | #337 | yes |
| 3 | [`v4-uint128-bounds-and-encoder-divergence`](./v4-uint128-bounds-and-encoder-divergence.md) | Bound V4 uint128 params, reconcile encoder min-out/max-in | medium | 3 | swap | #318 | no |
| 3 | [`velodrome-native-out-and-priceimpact`](./velodrome-native-out-and-priceimpact.md) | Velodrome native-ETH output unwrap and real priceImpact | medium | 3 | swap | — | no |
| 3 | [`backend-env-secret-validation`](./backend-env-secret-validation.md) | Validate backend secrets/addresses at boot, drop Anvil key | medium | 2 | backend | — | no |
| 3 | [`backend-mint-receipt-success-gate`](./backend-mint-receipt-success-gate.md) | Gate demo mint on UserOp receipt.success not unconditional 200 | medium | 2 | backend | — | no |
| 3 | [`borrow-quote-expiry-binding`](./borrow-quote-expiry-binding.md) | Bound borrow quote expiry window (quotedAt<=now<expiresAt) | medium | 2 | borrow | #373 | yes |
| 3 | [`cli-amount-slippage-deadline-parse`](./cli-amount-slippage-deadline-parse.md) | Add decimal/slippage/deadline sanity bounds to CLI parse layer | medium | 2 | cli | #419 | yes |
| 3 | [`eoa-chain-pinning`](./eoa-chain-pinning.md) | Pin and verify chainId in EOA send/sendBatch signatures | medium | 2 | wallet | — | no |
| 4 | [`frontend-morpho-collateral-auto-pledge`](./frontend-morpho-collateral-auto-pledge.md) | Remove unconfirmed auto-submit max collateral pledge on mount | medium | 2 | frontend | — | no |
| 4 | [`public-export-surface-guard`](./public-export-surface-guard.md) | Add a public-export-surface snapshot guard, fix asymmetric exports | medium | 2 | core | #483 | yes |
| 4 | [`smart-wallet-deployment-error-taxonomy`](./smart-wallet-deployment-error-taxonomy.md) | Export SmartWalletDeploymentError, align deploy-path errors | medium | 2 | wallet | #474 | yes |
| 4 | [`swap-deadline-validation`](./swap-deadline-validation.md) | Validate swap deadline finite/positive/future before calldata | medium | 2 | swap | #373 | yes |
| 4 | [`swap-review-modal-minout-source`](./swap-review-modal-minout-source.md) | Source swap review min-received/slippage from SDK quote | medium | 2 | frontend | #435 | no |
| 4 | [`zero-borrow-open-leg`](./zero-borrow-open-leg.md) | Reject or reroute zero-borrow collateral-only opens | medium | 2 | borrow | #303 | yes |
| 4 | [`named-error-taxonomy-signing-path`](./named-error-taxonomy-signing-path.md) | Replace bare Error throws on signing paths with taxonomy | low | 3 | core | #474 | yes |
| 4 | [`api-design-untyped-boundaries`](./api-design-untyped-boundaries.md) | Type external API boundaries, tighten lying public type contracts | low | 3 | core | #337 | yes |
| 4 | [`backend-cors-and-error-opacity`](./backend-cors-and-error-opacity.md) | Harden backend CORS null-origin/LOCAL_DEV and error opacity | low | 2 | backend | — | no |
| 4 | [`backend-mirror-fire-and-forget`](./backend-mirror-fire-and-forget.md) | Make Aave USDC_DEMO mirror reconcile UserOp success, idempotent | low | 2 | backend | — | no |
| 4 | [`backend-request-schema-symmetry`](./backend-request-schema-symmetry.md) | Tighten backend request-schema validation symmetry | low | 2 | backend | — | no |
| 4 | [`chain-id-membership-validation`](./chain-id-membership-validation.md) | Validate chainId vs SUPPORTED_CHAIN_IDS at every cast site | low | 2 | core | #334 | yes |
| 4 | [`ci-dependency-audit-and-frozen-lockfile`](./ci-dependency-audit-and-frozen-lockfile.md) | Add CI dep audit, frozen-lockfile install, ship the lockfile | low | 2 | infra | #432 | yes |
| 4 | [`cli-lend-max-and-amountormax-projection`](./cli-lend-max-and-amountormax-projection.md) | Route CLI lend close --max through SDK full-balance path | low | 2 | cli | #334 | yes |
| 5 | [`e2e-anvil-feature-test`](./e2e-anvil-feature-test.md) | Single consolidated end-to-end Anvil feature-test | high | 5 | testing | #335 | yes |
| 5 | [`cli-pre-send-confirmation`](./cli-pre-send-confirmation.md) | Add a pre-send dry-run/summary affordance for CLI fund verbs | low | 2 | cli | #414 | yes |
| 5 | [`contract-address-provenance-pinning`](./contract-address-provenance-pinning.md) | Pin and integrity-test vendored router/factory/poolManager addrs | low | 2 | infra | #328 | yes |
| 5 | [`frontend-borrow-quote-param-parity`](./frontend-borrow-quote-param-parity.md) | Align borrow CTA-gate preview params with executed transaction | low | 2 | frontend | #427 | yes |
| 5 | [`frontend-collateral-address-identity`](./frontend-collateral-address-identity.md) | Match pledged collateral by address not symbol on withdraw | low | 2 | frontend | — | no |
| 5 | [`frontend-config-parity-and-stub-pricing`](./frontend-config-parity-and-stub-pricing.md) | Reconcile frontend/backend config parity, stub-price fail-open | low | 2 | frontend | #482 | yes |
| 5 | [`frontend-double-submit-guards`](./frontend-double-submit-guards.md) | Close lend/withdraw double-submit window with executing ref | low | 2 | frontend | — | no |
| 5 | [`frontend-mirror-reconcile`](./frontend-mirror-reconcile.md) | Reconcile frontend Aave mirror (success/over-removal/idempotency) | low | 2 | frontend | — | no |
| 5 | [`frontend-wallet-signer-identity`](./frontend-wallet-signer-identity.md) | Recreate smart wallet on signer/account switch | low | 2 | frontend | — | no |
| 5 | [`market-resolution-chain-aware`](./market-resolution-chain-aware.md) | Make asset/market allow/block filters and matchers chain-aware | low | 2 | core | #493 | yes |
| 5 | [`permit2-payload-bounds`](./permit2-payload-bounds.md) | Bound Permit2 spender/amount/expiration, non-zero spender | low | 2 | core | — | no |
| 5 | [`sdk-error-string-sanitization`](./sdk-error-string-sanitization.md) | Stop interpolating caller amount/asset and bundler errors | low | 2 | core | #474 | yes |
| 5 | [`serializebigint-type-safety`](./serializebigint-type-safety.md) | Fix serializeBigInt type-lie and data-loss on CLI/HTTP boundary | low | 2 | core | #419 | yes |
| 5 | [`wallet-namespace-init-retry`](./wallet-namespace-init-retry.md) | Clear poisoned init promise, reconcile init retryability | low | 2 | wallet | — | no |

## Priority phases

Run each phase as one batch of branches, in phase order: a phase starts only once every ticket in all lower-numbered phases has landed (so a ticket's blockers, listed in each ticket's **Blocked by** line, are always in an earlier phase). **Phases are priority-ordered, not file-disjoint.** Two tickets in the same phase may touch the same file; those pairs are listed under "Known intra-phase file overlaps" below, and the dev should sequence those branches within the phase instead of merging them blindly in parallel.

### Phase 1 (16 tickets)

Highest priority. All six named chokepoints land here (`prebuilt-quote-calldata-integrity`, `swap-recipient-encoding-ignored`, `lend-asset-market-validation`, `slippage-bounds-negative-minout`, `hosted-signer-address-reconcile`, `sdk-dependency-pinning-and-optionality`) alongside the highest-severity, highest-leverage fund-safety fixes and the test-infra prerequisites that unblock the most downstream work, including all four blockers of the `e2e-anvil-feature-test` capstone.

[`prebuilt-quote-calldata-integrity`](./prebuilt-quote-calldata-integrity.md), [`swap-recipient-encoding-ignored`](./swap-recipient-encoding-ignored.md), [`lend-asset-market-validation`](./lend-asset-market-validation.md), [`slippage-bounds-negative-minout`](./slippage-bounds-negative-minout.md), [`hosted-signer-address-reconcile`](./hosted-signer-address-reconcile.md), [`sdk-dependency-pinning-and-optionality`](./sdk-dependency-pinning-and-optionality.md), [`network-fork-test-harness-consolidation`](./network-fork-test-harness-consolidation.md), [`hosted-wallet-signer-test-coverage`](./hosted-wallet-signer-test-coverage.md), [`validator-and-receipt-unit-coverage`](./validator-and-receipt-unit-coverage.md), [`calldata-encoder-differential-oracles`](./calldata-encoder-differential-oracles.md), [`backend-faucet-auth-and-rate-limit`](./backend-faucet-auth-and-rate-limit.md), [`eoa-batch-mid-revert-allowance`](./eoa-batch-mid-revert-allowance.md), [`receipt-status-as-success`](./receipt-status-as-success.md), [`smart-wallet-owner-set-reconcile`](./smart-wallet-owner-set-reconcile.md), [`recipient-validation-symmetry`](./recipient-validation-symmetry.md), [`lend-borrow-full-exit-max-sentinel`](./lend-borrow-full-exit-max-sentinel.md)

### Phase 2 (15 tickets)

High-to-medium severity work with the most downstream leverage after the chokepoints: the signer-lockout guard, the recipient/marketId/value-chain calldata bindings, amount decimals/positivity scaling, and the precision/encoder hardening that the rest of the swap and lend surfaces build on.

[`remove-signer-lockout-guard`](./remove-signer-lockout-guard.md), [`cli-recipient-validation-and-echo`](./cli-recipient-validation-and-echo.md), [`borrow-marketid-calldata-bind`](./borrow-marketid-calldata-bind.md), [`exact-output-approval-and-routing`](./exact-output-approval-and-routing.md), [`prebuilt-quote-value-chain-reconcile`](./prebuilt-quote-value-chain-reconcile.md), [`amount-decimals-scaling`](./amount-decimals-scaling.md), [`amount-positivity-finiteness`](./amount-positivity-finiteness.md), [`apy-finiteness-and-aave-share-price`](./apy-finiteness-and-aave-share-price.md), [`assets-precision-and-format-roundtrip`](./assets-precision-and-format-roundtrip.md), [`attribution-suffix-safety-asserts`](./attribution-suffix-safety-asserts.md), [`backend-auth-token-binding`](./backend-auth-token-binding.md), [`caller-address-validation-signing-targets`](./caller-address-validation-signing-targets.md), [`cli-error-redactor-value-aware`](./cli-error-redactor-value-aware.md), [`dynamic-privy-eip712-signer-wiring`](./dynamic-privy-eip712-signer-wiring.md), [`ens-cache-and-resolution-correctness`](./ens-cache-and-resolution-correctness.md)

### Phase 3 (15 tickets)

Medium-severity correctness work: max-mode and Permit2 allowance bounds, native-in/exact-output and Velodrome encoder fixes, borrow quote-expiry and LTV enforcement, receipt-union typing, plus the backend boot/secret and CLI parse hardening.

[`hosted-provider-validateoptions`](./hosted-provider-validateoptions.md), [`max-mode-allowance-bound`](./max-mode-allowance-bound.md), [`native-in-exact-output-value`](./native-in-exact-output-value.md), [`permit2-approval-owner-and-expiry`](./permit2-approval-owner-and-expiry.md), [`safe-ceiling-ltv-enforcement`](./safe-ceiling-ltv-enforcement.md), [`sdk-protocol-dep-demotion`](./sdk-protocol-dep-demotion.md), [`swap-quote-staleness-and-double-submit`](./swap-quote-staleness-and-double-submit.md), [`transaction-receipt-union-types`](./transaction-receipt-union-types.md), [`v4-uint128-bounds-and-encoder-divergence`](./v4-uint128-bounds-and-encoder-divergence.md), [`velodrome-native-out-and-priceimpact`](./velodrome-native-out-and-priceimpact.md), [`backend-env-secret-validation`](./backend-env-secret-validation.md), [`backend-mint-receipt-success-gate`](./backend-mint-receipt-success-gate.md), [`borrow-quote-expiry-binding`](./borrow-quote-expiry-binding.md), [`cli-amount-slippage-deadline-parse`](./cli-amount-slippage-deadline-parse.md), [`eoa-chain-pinning`](./eoa-chain-pinning.md)

### Phase 4 (14 tickets)

Medium-to-low severity hardening and typed-surface cleanup: export-surface and deployment-error taxonomy, swap deadline/review-modal sourcing, the named-error taxonomy and chain-id membership checks, dependency-audit/lockfile, and the backend/CLI follow-ons.

[`frontend-morpho-collateral-auto-pledge`](./frontend-morpho-collateral-auto-pledge.md), [`public-export-surface-guard`](./public-export-surface-guard.md), [`smart-wallet-deployment-error-taxonomy`](./smart-wallet-deployment-error-taxonomy.md), [`swap-deadline-validation`](./swap-deadline-validation.md), [`swap-review-modal-minout-source`](./swap-review-modal-minout-source.md), [`zero-borrow-open-leg`](./zero-borrow-open-leg.md), [`named-error-taxonomy-signing-path`](./named-error-taxonomy-signing-path.md), [`api-design-untyped-boundaries`](./api-design-untyped-boundaries.md), [`backend-cors-and-error-opacity`](./backend-cors-and-error-opacity.md), [`backend-mirror-fire-and-forget`](./backend-mirror-fire-and-forget.md), [`backend-request-schema-symmetry`](./backend-request-schema-symmetry.md), [`chain-id-membership-validation`](./chain-id-membership-validation.md), [`ci-dependency-audit-and-frozen-lockfile`](./ci-dependency-audit-and-frozen-lockfile.md), [`cli-lend-max-and-amountormax-projection`](./cli-lend-max-and-amountormax-projection.md)

### Phase 5 (14 tickets)

Lowest-priority tail: low/info cleanup (string sanitization, init-retry, chain-aware market resolution, serializeBigInt), the remaining frontend polish, and the `e2e-anvil-feature-test` capstone, which lands last because all four of its test-infra blockers sit in Phase 1.

[`e2e-anvil-feature-test`](./e2e-anvil-feature-test.md), [`cli-pre-send-confirmation`](./cli-pre-send-confirmation.md), [`contract-address-provenance-pinning`](./contract-address-provenance-pinning.md), [`frontend-borrow-quote-param-parity`](./frontend-borrow-quote-param-parity.md), [`frontend-collateral-address-identity`](./frontend-collateral-address-identity.md), [`frontend-config-parity-and-stub-pricing`](./frontend-config-parity-and-stub-pricing.md), [`frontend-double-submit-guards`](./frontend-double-submit-guards.md), [`frontend-mirror-reconcile`](./frontend-mirror-reconcile.md), [`frontend-wallet-signer-identity`](./frontend-wallet-signer-identity.md), [`market-resolution-chain-aware`](./market-resolution-chain-aware.md), [`permit2-payload-bounds`](./permit2-payload-bounds.md), [`sdk-error-string-sanitization`](./sdk-error-string-sanitization.md), [`serializebigint-type-safety`](./serializebigint-type-safety.md), [`wallet-namespace-init-retry`](./wallet-namespace-init-retry.md)

## Hot files (multi-ticket, sequence within a phase)

These files are each edited by multiple tickets. The phase label on each slug shows which priority phase it runs in; where two slugs against the same file share a phase, those branches must be sequenced within the phase (see the next section). Tickets touching the same file in different phases serialize naturally by phase order.

| File | Tickets | Slugs |
| --- | --- | --- |
| `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts` | 16 | `sdk-dependency-pinning-and-optionality` (p1), `validator-and-receipt-unit-coverage` (p1), `eoa-batch-mid-revert-allowance` (p1), `receipt-status-as-success` (p1), `smart-wallet-owner-set-reconcile` (p1), `remove-signer-lockout-guard` (p2), `amount-positivity-finiteness` (p2), `attribution-suffix-safety-asserts` (p2), `caller-address-validation-signing-targets` (p2), `transaction-receipt-union-types` (p3), `named-error-taxonomy-signing-path` (p4), `chain-id-membership-validation` (p4), `e2e-anvil-feature-test` (p5), `contract-address-provenance-pinning` (p5), `sdk-error-string-sanitization` (p5), `wallet-namespace-init-retry` (p5) |
| `packages/sdk/src/actions/swap/core/SwapProvider.ts` | 10 | `prebuilt-quote-calldata-integrity` (p1), `slippage-bounds-negative-minout` (p1), `recipient-validation-symmetry` (p1), `prebuilt-quote-value-chain-reconcile` (p2), `hosted-provider-validateoptions` (p3), `native-in-exact-output-value` (p3), `permit2-approval-owner-and-expiry` (p3), `v4-uint128-bounds-and-encoder-divergence` (p3), `borrow-quote-expiry-binding` (p3), `swap-deadline-validation` (p4) |
| `packages/sdk/src/utils/validation.ts` | 10 | `slippage-bounds-negative-minout` (p1), `validator-and-receipt-unit-coverage` (p1), `recipient-validation-symmetry` (p1), `amount-positivity-finiteness` (p2), `borrow-quote-expiry-binding` (p3), `eoa-chain-pinning` (p3), `swap-deadline-validation` (p4), `chain-id-membership-validation` (p4), `market-resolution-chain-aware` (p5), `permit2-payload-bounds` (p5) |
| `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts` | 8 | `swap-recipient-encoding-ignored` (p1), `slippage-bounds-negative-minout` (p1), `calldata-encoder-differential-oracles` (p1), `exact-output-approval-and-routing` (p2), `native-in-exact-output-value` (p3), `v4-uint128-bounds-and-encoder-divergence` (p3), `velodrome-native-out-and-priceimpact` (p3), `swap-deadline-validation` (p4) |
| `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts` | 7 | `prebuilt-quote-calldata-integrity` (p1), `receipt-status-as-success` (p1), `prebuilt-quote-value-chain-reconcile` (p2), `safe-ceiling-ltv-enforcement` (p3), `transaction-receipt-union-types` (p3), `borrow-quote-expiry-binding` (p3), `e2e-anvil-feature-test` (p5) |
| `packages/sdk/src/actions/lend/core/LendProvider.ts` | 7 | `lend-asset-market-validation` (p1), `amount-decimals-scaling` (p2), `amount-positivity-finiteness` (p2), `max-mode-allowance-bound` (p3), `transaction-receipt-union-types` (p3), `named-error-taxonomy-signing-path` (p4), `e2e-anvil-feature-test` (p5) |
| `packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts` | 7 | `calldata-encoder-differential-oracles` (p1), `lend-borrow-full-exit-max-sentinel` (p1), `max-mode-allowance-bound` (p3), `named-error-taxonomy-signing-path` (p4), `ci-dependency-audit-and-frozen-lockfile` (p4), `e2e-anvil-feature-test` (p5), `sdk-error-string-sanitization` (p5) |
| `packages/sdk/src/core/error/errors.ts` | 7 | `prebuilt-quote-calldata-integrity` (p1), `slippage-bounds-negative-minout` (p1), `v4-uint128-bounds-and-encoder-divergence` (p3), `velodrome-native-out-and-priceimpact` (p3), `eoa-chain-pinning` (p3), `zero-borrow-open-leg` (p4), `named-error-taxonomy-signing-path` (p4) |
| `packages/sdk/src/types/swap/base.ts` | 7 | `exact-output-approval-and-routing` (p2), `assets-precision-and-format-roundtrip` (p2), `native-in-exact-output-value` (p3), `swap-quote-staleness-and-double-submit` (p3), `borrow-quote-expiry-binding` (p3), `public-export-surface-guard` (p4), `api-design-untyped-boundaries` (p4) |
| `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts` | 6 | `calldata-encoder-differential-oracles` (p1), `lend-borrow-full-exit-max-sentinel` (p1), `max-mode-allowance-bound` (p3), `sdk-protocol-dep-demotion` (p3), `named-error-taxonomy-signing-path` (p4), `sdk-error-string-sanitization` (p5) |
| `packages/sdk/src/actions/swap/providers/uniswap/UniswapSwapProvider.ts` | 6 | `prebuilt-quote-calldata-integrity` (p1), `exact-output-approval-and-routing` (p2), `assets-precision-and-format-roundtrip` (p2), `native-in-exact-output-value` (p3), `permit2-approval-owner-and-expiry` (p3), `swap-deadline-validation` (p4) |
| `packages/sdk/src/types/lend/base.ts` | 6 | `lend-asset-market-validation` (p1), `lend-borrow-full-exit-max-sentinel` (p1), `apy-finiteness-and-aave-share-price` (p2), `assets-precision-and-format-roundtrip` (p2), `transaction-receipt-union-types` (p3), `api-design-untyped-boundaries` (p4) |
| `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts` | 6 | `hosted-signer-address-reconcile` (p1), `validator-and-receipt-unit-coverage` (p1), `eoa-batch-mid-revert-allowance` (p1), `receipt-status-as-success` (p1), `prebuilt-quote-value-chain-reconcile` (p2), `eoa-chain-pinning` (p3) |
| `packages/sdk/src/actions/borrow/core/internalParams.ts` | 5 | `lend-borrow-full-exit-max-sentinel` (p1), `amount-decimals-scaling` (p2), `amount-positivity-finiteness` (p2), `zero-borrow-open-leg` (p4), `frontend-borrow-quote-param-parity` (p5) |
| `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/v2.ts` | 5 | `swap-recipient-encoding-ignored` (p1), `recipient-validation-symmetry` (p1), `velodrome-native-out-and-priceimpact` (p3), `swap-deadline-validation` (p4), `named-error-taxonomy-signing-path` (p4) |
| `packages/sdk/src/index.ts` | 5 | `borrow-marketid-calldata-bind` (p2), `sdk-protocol-dep-demotion` (p3), `public-export-surface-guard` (p4), `smart-wallet-deployment-error-taxonomy` (p4), `named-error-taxonomy-signing-path` (p4) |
| `packages/sdk/package.json` | 4 | `sdk-dependency-pinning-and-optionality` (p1), `calldata-encoder-differential-oracles` (p1), `sdk-protocol-dep-demotion` (p3), `ci-dependency-audit-and-frozen-lockfile` (p4) |
| `packages/sdk/src/actions.ts` | 4 | `recipient-validation-symmetry` (p1), `borrow-marketid-calldata-bind` (p2), `market-resolution-chain-aware` (p5), `wallet-namespace-init-retry` (p5) |
| `packages/sdk/src/actions/borrow/core/BorrowProvider.ts` | 4 | `lend-asset-market-validation` (p1), `safe-ceiling-ltv-enforcement` (p3), `borrow-quote-expiry-binding` (p3), `named-error-taxonomy-signing-path` (p4) |
| `packages/sdk/src/actions/borrow/providers/morpho/MorphoBorrowProvider.ts` | 4 | `borrow-marketid-calldata-bind` (p2), `amount-decimals-scaling` (p2), `amount-positivity-finiteness` (p2), `market-resolution-chain-aware` (p5) |
| `packages/sdk/src/wallet/core/wallets/abstract/types/index.ts` | 3 | `eoa-batch-mid-revert-allowance` (p1), `transaction-receipt-union-types` (p3), `frontend-mirror-reconcile` (p5) |
| `packages/sdk/src/actions/swap/namespaces/WalletSwapNamespace.ts` | 3 | `prebuilt-quote-calldata-integrity` (p1), `receipt-status-as-success` (p1), `prebuilt-quote-value-chain-reconcile` (p2) |
| `packages/sdk/src/utils/approve.ts` | 3 | `max-mode-allowance-bound` (p3), `permit2-approval-owner-and-expiry` (p3), `permit2-payload-bounds` (p5) |
| `packages/sdk/src/wallet/core/error/errors.ts` | 3 | `eoa-batch-mid-revert-allowance` (p1), `receipt-status-as-success` (p1), `named-error-taxonomy-signing-path` (p4) |
| `packages/sdk/src/wallet/core/namespace/WalletNamespace.ts` | 3 | `hosted-signer-address-reconcile` (p1), `hosted-provider-validateoptions` (p3), `wallet-namespace-init-retry` (p5) |

## Known intra-phase file overlaps (sequence within the phase)

Each row is a set of same-phase tickets that edit the same file. These are the accepted, recorded overlaps: develop the branches in the listed order (or coordinate a shared base) and rebase the later ones rather than merging them in parallel. Tickets touching the file in different phases are not listed here because phase order already serializes them.

| Phase | File | Overlapping tickets (sequence in order) |
| --- | --- | --- |
| 1 | `packages/sdk/package.json` | `sdk-dependency-pinning-and-optionality`, `calldata-encoder-differential-oracles` |
| 1 | `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts` | `prebuilt-quote-calldata-integrity`, `receipt-status-as-success` |
| 1 | `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts` | `calldata-encoder-differential-oracles`, `lend-borrow-full-exit-max-sentinel` |
| 1 | `packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts` | `calldata-encoder-differential-oracles`, `lend-borrow-full-exit-max-sentinel` |
| 1 | `packages/sdk/src/actions/swap/core/SwapProvider.ts` | `prebuilt-quote-calldata-integrity`, `slippage-bounds-negative-minout`, `recipient-validation-symmetry` |
| 1 | `packages/sdk/src/actions/swap/namespaces/WalletSwapNamespace.ts` | `prebuilt-quote-calldata-integrity`, `receipt-status-as-success` |
| 1 | `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts` | `swap-recipient-encoding-ignored`, `slippage-bounds-negative-minout`, `calldata-encoder-differential-oracles` |
| 1 | `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/v2.ts` | `swap-recipient-encoding-ignored`, `recipient-validation-symmetry` |
| 1 | `packages/sdk/src/core/error/errors.ts` | `prebuilt-quote-calldata-integrity`, `slippage-bounds-negative-minout` |
| 1 | `packages/sdk/src/types/lend/base.ts` | `lend-asset-market-validation`, `lend-borrow-full-exit-max-sentinel` |
| 1 | `packages/sdk/src/utils/validation.ts` | `slippage-bounds-negative-minout`, `validator-and-receipt-unit-coverage`, `recipient-validation-symmetry` |
| 1 | `packages/sdk/src/wallet/core/error/errors.ts` | `eoa-batch-mid-revert-allowance`, `receipt-status-as-success` |
| 1 | `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts` | `hosted-signer-address-reconcile`, `validator-and-receipt-unit-coverage`, `eoa-batch-mid-revert-allowance`, `receipt-status-as-success` |
| 1 | `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts` | `sdk-dependency-pinning-and-optionality`, `validator-and-receipt-unit-coverage`, `eoa-batch-mid-revert-allowance`, `receipt-status-as-success`, `smart-wallet-owner-set-reconcile` |
| 2 | `packages/sdk/src/actions/borrow/core/internalParams.ts` | `amount-decimals-scaling`, `amount-positivity-finiteness` |
| 2 | `packages/sdk/src/actions/borrow/providers/morpho/MorphoBorrowProvider.ts` | `borrow-marketid-calldata-bind`, `amount-decimals-scaling`, `amount-positivity-finiteness` |
| 2 | `packages/sdk/src/actions/lend/core/LendProvider.ts` | `amount-decimals-scaling`, `amount-positivity-finiteness` |
| 2 | `packages/sdk/src/actions/swap/providers/uniswap/UniswapSwapProvider.ts` | `exact-output-approval-and-routing`, `assets-precision-and-format-roundtrip` |
| 2 | `packages/sdk/src/types/lend/base.ts` | `apy-finiteness-and-aave-share-price`, `assets-precision-and-format-roundtrip` |
| 2 | `packages/sdk/src/types/swap/base.ts` | `exact-output-approval-and-routing`, `assets-precision-and-format-roundtrip` |
| 2 | `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts` | `remove-signer-lockout-guard`, `amount-positivity-finiteness`, `attribution-suffix-safety-asserts`, `caller-address-validation-signing-targets` |
| 3 | `packages/sdk/src/actions/borrow/core/BorrowProvider.ts` | `safe-ceiling-ltv-enforcement`, `borrow-quote-expiry-binding` |
| 3 | `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts` | `safe-ceiling-ltv-enforcement`, `transaction-receipt-union-types`, `borrow-quote-expiry-binding` |
| 3 | `packages/sdk/src/actions/lend/core/LendProvider.ts` | `max-mode-allowance-bound`, `transaction-receipt-union-types` |
| 3 | `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts` | `max-mode-allowance-bound`, `sdk-protocol-dep-demotion` |
| 3 | `packages/sdk/src/actions/swap/core/SwapProvider.ts` | `hosted-provider-validateoptions`, `native-in-exact-output-value`, `permit2-approval-owner-and-expiry`, `v4-uint128-bounds-and-encoder-divergence`, `borrow-quote-expiry-binding` |
| 3 | `packages/sdk/src/actions/swap/providers/uniswap/UniswapSwapProvider.ts` | `native-in-exact-output-value`, `permit2-approval-owner-and-expiry` |
| 3 | `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts` | `native-in-exact-output-value`, `v4-uint128-bounds-and-encoder-divergence`, `velodrome-native-out-and-priceimpact` |
| 3 | `packages/sdk/src/core/error/errors.ts` | `v4-uint128-bounds-and-encoder-divergence`, `velodrome-native-out-and-priceimpact`, `eoa-chain-pinning` |
| 3 | `packages/sdk/src/types/swap/base.ts` | `native-in-exact-output-value`, `swap-quote-staleness-and-double-submit`, `borrow-quote-expiry-binding` |
| 3 | `packages/sdk/src/utils/approve.ts` | `max-mode-allowance-bound`, `permit2-approval-owner-and-expiry` |
| 3 | `packages/sdk/src/utils/validation.ts` | `borrow-quote-expiry-binding`, `eoa-chain-pinning` |
| 4 | `packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts` | `named-error-taxonomy-signing-path`, `ci-dependency-audit-and-frozen-lockfile` |
| 4 | `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/v2.ts` | `swap-deadline-validation`, `named-error-taxonomy-signing-path` |
| 4 | `packages/sdk/src/core/error/errors.ts` | `zero-borrow-open-leg`, `named-error-taxonomy-signing-path` |
| 4 | `packages/sdk/src/index.ts` | `public-export-surface-guard`, `smart-wallet-deployment-error-taxonomy`, `named-error-taxonomy-signing-path` |
| 4 | `packages/sdk/src/types/swap/base.ts` | `public-export-surface-guard`, `api-design-untyped-boundaries` |
| 4 | `packages/sdk/src/utils/validation.ts` | `swap-deadline-validation`, `chain-id-membership-validation` |
| 4 | `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts` | `named-error-taxonomy-signing-path`, `chain-id-membership-validation` |
| 5 | `packages/sdk/src/actions.ts` | `market-resolution-chain-aware`, `wallet-namespace-init-retry` |
| 5 | `packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts` | `e2e-anvil-feature-test`, `sdk-error-string-sanitization` |
| 5 | `packages/sdk/src/utils/validation.ts` | `market-resolution-chain-aware`, `permit2-payload-bounds` |
| 5 | `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts` | `e2e-anvil-feature-test`, `contract-address-provenance-pinning`, `sdk-error-string-sanitization`, `wallet-namespace-init-retry` |

