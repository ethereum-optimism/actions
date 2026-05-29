---
title: "feat: Add AaveBorrowProvider end-to-end"
status: active
created: 2026-05-29
deepened: 2026-05-29
type: feat
issue: 468
origin: docs/brainstorms/2026-05-29-aave-borrow-provider-requirements.md
decision: docs/decisions/2026-05-29-aave-borrow-demo-mirror.md
---

# feat: Add AaveBorrowProvider end-to-end

Add Aave V3 as a first-class borrow provider parallel to Morpho, working end to end through the SDK, demo backend, and demo frontend. The SDK provider is pure, reusable, real-Aave-only. The demo keeps its balance economy coherent through a single shared mirror module that mints `USDC_DEMO` on borrow and removes it (via transfer-to-sink) on repay on Base Sepolia, reflecting a real Aave borrow on OP Sepolia.

Origin requirements: `docs/brainstorms/2026-05-29-aave-borrow-provider-requirements.md`. This plan revises the prior ADR's Base Sepolia assumption to OP Sepolia for the real Aave leg (see origin).

---

## Problem Frame

The borrow domain ships Morpho Blue only. Morpho fits the demo because we deploy isolated demo markets with demo assets. Aave V3 is a shared protocol-managed pool: we cannot add arbitrary demo reserves, so the Aave demo must use real testnet reserves while keeping the demo economy (which runs on `USDC_DEMO`) coherent.

The core mechanic is a two-ledger model:

- Real USDC: the actual Aave borrow on OP Sepolia, parked and untouched in the user's wallet, changes only on real borrow/repay. It is what real Aave enforces collateral and health against.
- Demo USDC (`USDC_DEMO`): minted on borrow and removed on repay, on Base Sepolia, freely spent by the user across the rest of the demo. It is what the user sees and uses.

Rules (see origin): repay capacity is answered by the `USDC_DEMO` balance, not the parked real USDC; the real repay amount is slaved to the demo removal so real debt equals mirror debt; health, debt, liquidation price, and withdraw gating are computed from the mirror ledger, with only collateral read live from Aave.

---

## Scope Boundaries

In scope: SDK `AaveBorrowProvider` (pure real-Aave), demo backend Aave market config and mirror module, demo frontend Aave market display and gating, collateral USD pricing sufficient for display.

### Deferred to Follow-Up Work

- Mirror reconciliation fallback. On page load, detect a failed mint/removal by comparing the lockstep debt invariant (cumulative mirrored amount vs real Aave debt), not raw wallet balances, and re-apply the missing mint/removal. Must avoid misfiring on the healthy spend-down deviation (demo balance below real debt is normal because the user spent borrowed funds). Requires a small persisted per-wallet mirror marker, which v1 omits. (User direction, 2026-05-29.)
- Redeploy `DemoUSDC` with a permissionless `burn(address,uint256)` so the mirror does a true burn instead of a transfer-to-sink. Deferred because redeploying `USDC_DEMO` orphans the Morpho demo vault and market that reference its address.
- Deploy a `MockChainlinkFeed` for ETH if live Aave-oracle pricing proves insufficient for display.
- Borrow CLI support (#469), Aave v4 (#251), E-mode, isolation mode, stable-rate borrowing.

### Out of Scope

- Adding arbitrary new Aave reserves on testnet.
- Surfacing mirror mint/removal as user-facing activity (activity log, toast, explorer link). Mirror side effects are silent and operator-visible only.

---

## Key Technical Decisions

1. **Chain split.** Real Aave borrow/repay on OP Sepolia (reuse the existing `AaveETH` lend market in `packages/demo/backend/src/config/markets.ts` and the OP Sepolia ETH faucet in `packages/demo/backend/src/services/faucet.ts`). Mirror `USDC_DEMO` mint/removal on Base Sepolia.

2. **SDK provider is pure.** `AaveBorrowProvider` contains zero mirror, demo, mint, or balance-emulation logic. It reads and writes real Aave only.

3. **Cross-domain Aave hoist first.** Per CONTRIBUTING ("Introducing a new Provider"), extract shared Aave addresses and ABIs out of `packages/sdk/src/actions/lend/providers/aave/` into a cross-domain home `packages/sdk/src/actions/shared/aave/` (mirroring `actions/shared/morpho/`) before the borrow provider consumes them. Lend keeps importing from the new home.

4. **Synthetic `aave-v3` market id.** Aave has no params-hash market id. Derive a stable synthetic `marketId: Hex` from `keccak256(chainId, collateralAsset address, debtAsset address)` so existing `marketId: Hex` consumers (`marketIdMatches`, serializer URL paths, allowlist lookup) keep working. An Aave borrow market is modeled as a synthetic (collateral, debt) pair backed by aggregate `getUserAccountData`.

5. **`collateralShares` mapping.** `BorrowMarketPosition` requires `collateralShares`/`collateralSharesFormatted` (designed for Morpho vault-share collateral). Aave collateral (aWETH) is 1:1 with the underlying, so for Aave set `collateralShares == collateralAmount` and the formatted variants equal. No type change.

6. **Collateral flow.** The user supplies ETH collateral through the existing `AaveETH` lend market (`wallet.lend`), then borrows USDC against it, paralleling the Morpho demo's lend-then-borrow coupling. The SDK `AaveBorrowProvider` still implements `depositCollateral`/`withdrawCollateral` (Pool `supply`/`withdraw`, WETHGateway for native ETH) for honesty and reuse, but the demo open flow borrows against already-supplied aWETH and does not re-deposit collateral.

7. **Mirror execution (v1).** Asynchronous and best-effort. UI reflects success when the real Aave tx completes; the mirror mint/removal fires after and the frontend updates balances via listeners when it settles. No retry, idempotency store, or reconciliation in v1 (the backend has no persistence layer). Reconciliation/retry was consciously deferred per user direction (2026-05-29), superseding the cited ADR's "retry and reconciliation" note. Two failure asymmetries are accepted but must be handled: (a) a mint failure after a successful borrow strands the user with real debt and no spendable `USDC_DEMO`, which is worse than a removal failure, so the mint failure surfaces a non-blocking "balance syncing" state in the UI and an operator log rather than silent success; (b) the sync repay gate reads a live `USDC_DEMO` balance while the removal fires async, so repay requests are serialized per wallet (a per-wallet in-memory lock) to prevent two repays both passing the gate against the same balance.

8. **Mirror removal mechanism.** `DemoUSDC` (`packages/demo/contracts/src/DemoUSDC.sol`, solady ERC20) has a permissionless `mint(to, amount)` and no `burn`. The mirror removal on repay is therefore a silent transfer of `USDC_DEMO` to a sink address, not a token burn, and the transfer amount is strictly bounded to the repay amount validated in the same request (never the user's full balance). Mint stays a permissionless `mint` from a backend admin wallet. (See deferred work for the redeploy-with-burn alternative.)

9. **Single shared mirror module.** All mirror logic lives in one backend module (`packages/demo/backend/src/services/mirror.ts`) consumed by `services/borrow.ts` for both frontend-wallet and backend-wallet flows. The real Aave tx is signed by the user's wallet; the mirror mint is driven by a backend admin wallet, and the sink transfer is driven by the server-custodied user smart wallet. Custody note (verified against `services/wallet.ts` `getWallet(idToken)` and the `faucet.ts` admin-wallet pattern): the backend reconstructs the user's smart wallet from the authenticated Privy `idToken` and can therefore sign the sink transfer server-side during an authenticated request, so the removal does not require a separate client signature. If a wallet type cannot be backend-signed, the Aave borrow flow is rejected at the backend for that wallet type rather than silently skipping the removal (silent skip would break the lockstep invariant on every repay).

10. **Mirror-ledger display and provider/service boundary.** The SDK `AaveBorrowProvider._getPosition` reads the real Aave position only (it stays pure). The demo backend computes the displayed position by combining the live collateral read from the provider with the mirror debt it owns. The overlay must be applied on the **steady-state read path**, which is `services/wallet.ts::getBorrowPosition` -> `actions.borrow.getPosition` (NOT `services/borrow.ts`, which has no `getPosition`); the quote-side overlay is applied in `services/borrow.ts::getQuote`, which does exist. The provider is never passed a mirror-debt override. During a pending or failed mirror, `getBorrowPosition` returns the **mirror debt** (the demo's authoritative ledger), so a stranded-mint position shows the just-borrowed debt rather than a falsely-healthy real read; the frontend reflects this via the syncing state (U10). Because both `getBorrowPosition` and the `borrowApi` quote/receipt `positionAfter` feed the frontend, both must carry the overlaid value so the frontend's local fallback (U10) cannot disagree.

11. **Interest accrual and "fully repaid".** Real Aave variable debt accrues every block, so the mirror ledger (principal mint minus principal removed) drifts below real debt over time. Lockstep is therefore defined on principal, not on the penny-exact real balance. A full repay (`{ max: true }`) uses Aave's max-repay path (`type(uint256).max`) so the real debt and accrued interest both clear on-chain; the mirror removal uses the principal-equivalent the user is shown. Residual interest is funded from the parked real USDC and is invisible to the demo ledger. "Fully repaid" means the real Aave debt is closed by the max-repay; the demo shows zero debt once the corresponding removal settles. The deferred reconciliation must compare principal, not raw real debt, to avoid misfiring on accrued interest.

12. **Repay cap.** The repay amount is capped to `min(USDC_DEMO balance, outstanding real Aave debt principal)`, not the `USDC_DEMO` balance alone. Because `DemoUSDC.mint` is permissionless (anyone can inflate a balance), capping on balance alone would let a user repay more real debt than they borrowed through the demo; bounding by outstanding real debt closes that vector without needing the deferred persistence layer.

---

## System-Wide Impact

This change touches three layers across two chains; the cross-boundary seams below are the regression-prone surfaces.

**SDK surface.** Gains `AaveBorrowProvider` and turns `BorrowMarketId`/`BorrowMarketConfig` from a single-member shape into a real discriminated union (`packages/sdk/src/types/borrow/market.ts`). This is the first time every `switch (kind)` site must become exhaustive, so it is a cross-cutting change, not additive: a missed site silently mis-routes a Morpho id through a new `aave-v3` branch. Exhaustiveness-regression sites for the Morpho path: `BaseBorrowNamespace.getProviderForMarket` routing fallback, `MorphoBorrowProvider`'s `kind` skip, the backend `BorrowMarketIdSchema` (U6), and the frontend `marketIdPath`/`sameMarketId`/`positionKey`/repay-mode matchers (U9). Requires a changeset and a README provider-list update (AGENTS.md).

**Existing AaveETH lend path.** The U1 hoist physically moves `addresses.ts` and `abis/pool.ts` out of `actions/lend/providers/aave/`, so every existing lend import path changes. Lend is the more exposed flow (it is in production; borrow is new), so U1's verification must keep the lend tests green.

**Backend.** Gains a mirror service and an Aave borrow market. The mirror integration lives in the shared `services/borrow.ts` mutation wrappers and (for reads) `services/wallet.ts`, both of which the Morpho path also uses, so the mirror fire, per-wallet lock, and repay cap must be strictly conditioned on `kind === 'aave-v3'`. The steady-state position read is the most fragile seam: it runs through `services/wallet.ts::getBorrowPosition` -> `actions.borrow.getPosition`, not `services/borrow.ts`, so the mirror-debt overlay must be applied there (see Decision 10 and U8).

**Frontend.** Gains `aave-v3` market-id handling and `USDC_DEMO` repay/withdraw gating; no new routes. `BorrowAction` does not unconditionally trust the backend: it falls back to a local `borrowMath`/`borrowValuation` projection when `positionAfter` is null, so for Aave the displayed `selectedMarketPosition` must carry the overlaid mirror debt and use the same ETH USD source as the backend, or the fallback recomputes a different health number (see U10).

**Cross-chain failure propagation.** Because the SDK provider is pure (returns real Aave debt) while the backend overlay intends mirror debt, a pending or failed mirror leaves the two ledgers diverged by exactly the un-mirrored amount; the plan resolves which ledger the read returns in that window (Decision 10) and ties the position/health card, not just the balance widget, to the syncing state (U10). The per-wallet repay lock is in-process only (no persistence): it does not survive a restart or protect a second backend instance, so horizontal scaling of the demo backend would reopen the concurrent-repay race.

**Existing Morpho borrow flows must keep passing**, verified by asserting the Morpho branch fires no mirror, acquires no lock, and applies no repay cap (not just a green happy path).

---

## Implementation Units

Phasing: U1 to U5 are SDK (pure Aave), U6 to U8 are demo backend (real Aave + mirror), U9 to U11 are demo frontend and pricing. Within the SDK phase, U1 unblocks the provider; U2 unblocks routing and config.

### U1. Hoist shared Aave protocol module and extend ABIs

**Goal:** Create a cross-domain Aave home with addresses and ABIs that both lend and borrow consume, and extend the Pool ABI with the borrow-side functions.

**Requirements:** Decision 3; origin "Reuse or hoist shared Aave pieces".

**Dependencies:** none.

**Files:**
- `packages/sdk/src/actions/shared/aave/addresses.ts` (moved from `actions/lend/providers/aave/addresses.ts`)
- `packages/sdk/src/actions/shared/aave/abis/pool.ts` (moved and extended from `actions/lend/providers/aave/abis/pool.ts`)
- `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts`, `sdk.ts` (update imports to the new home)
- `packages/sdk/src/actions/shared/aave/__tests__/addresses.test.ts`

**Approach:** Move `addresses.ts` (already populated for `optimismSepolia.id`) and the pool/gateway ABIs to `actions/shared/aave/`. Extend the ABI with `borrow`, `repay`, `getUserAccountData`, `getReservesList`, the existing `getReserveData`, and the borrow WETH gateway (`WrappedTokenGatewayV3` `borrowETH`/`repayETH`) as `as const` fragments. Update lend imports so behavior is unchanged.

**Patterns to follow:** `packages/sdk/src/actions/shared/morpho/contracts.js` as the cross-domain precedent; existing `as const` ABI style in `actions/lend/providers/aave/abis/pool.ts`.

**Test scenarios:**
- `getAaveAddresses`/`getPoolAddress`/`getWETHGatewayAddress` return the OP Sepolia addresses and throw for unsupported chains.
- ABI exposes the new function fragments (encode a `borrow` and a `getUserAccountData` call without error).
- Lend provider tests still pass against the relocated imports.

**Verification:** SDK typechecks; lend tests green; new address tests green.

---

### U2. Extend BorrowMarketId / BorrowMarketConfig with the aave-v3 variant

**Goal:** Make the borrow market id and config discriminated unions that include `aave-v3`, and update every site that switches on `kind`.

**Requirements:** Decisions 4, 5; origin "How an Aave borrow market is identified".

**Dependencies:** none (parallel to U1).

**Files:**
- `packages/sdk/src/types/borrow/market.ts` (add `aave-v3` to `BorrowMarketId` and `BorrowMarketConfig`; add Aave config fields: debt reserve underlying, collateral underlying, WETH-gateway flag)
- `packages/sdk/src/actions/borrow/core/markets.ts` (confirm `marketIdMatches` is variant-agnostic)
- `packages/sdk/src/actions/borrow/providers/aave/marketId.ts` (new: synthetic id derivation)
- `packages/sdk/src/actions/borrow/providers/aave/__tests__/marketId.test.ts`

**Approach:** Add the `aave-v3` literal variants. Implement `computeAaveBorrowMarketId({ chainId, collateralAsset, debtAsset })` as `keccak256(encodeAbiParameters(...))`. Keep `marketIdMatches` comparing `kind`/`chainId`/`marketId` so it stays the canonical equality. Audit `MorphoBorrowProvider.ts` `kind !== 'morpho-blue'` skip and `BaseBorrowNamespace` routing (handled in U5).

**Patterns to follow:** `packages/sdk/src/actions/borrow/providers/morpho/marketParams.ts` (`computeMorphoMarketId`/`verifyMorphoMarketId`).

**Test scenarios:**
- `computeAaveBorrowMarketId` is deterministic and distinct for different collateral/debt/chain inputs.
- A `BorrowMarketConfig` with `kind: 'aave-v3'` typechecks and round-trips through `marketIdMatches`.
- A morpho-blue config and an aave-v3 config with different ids do not match.

**Verification:** SDK typechecks; union exhaustiveness satisfied; new tests green.

---

### U3. AaveBorrowProvider read layer

**Goal:** Implement market and position reads against real Aave via viem multicall, adapted to the generic borrow types.

**Requirements:** origin "Aave market and position semantics"; Decisions 2, 5.

**Dependencies:** U1, U2.

**Files:**
- `packages/sdk/src/actions/borrow/providers/aave/AaveBorrowProvider.ts` (read hooks)
- `packages/sdk/src/actions/borrow/providers/aave/state.ts` (multicall reads + reserve config bitmap decode, collocated as a single-use helper)
- `packages/sdk/src/actions/borrow/providers/aave/presentation.ts` (adapters to `BorrowMarket`/`BorrowMarketPosition`)
- `packages/sdk/src/actions/borrow/providers/aave/__tests__/AaveBorrowProvider.read.spec.ts`

**Approach:** `_getMarket`/`_getMarkets` read `getReserveData(debtAsset)` for `currentVariableBorrowRate` (RAY) and decode the collateral reserve `configuration.data` bitmap for LTV (bits 0-15), liquidation threshold (16-31), and liquidation bonus (32-47). Keep the bitmap decoder inline in `state.ts` next to its only caller (mirrors how Morpho collocates single-use helpers; promote to a `config.ts` only if a second consumer appears). `_getPosition` reads the **specific reserve positions** rather than the aggregate to avoid contamination from unrelated Aave positions on the same wallet: read the user's `variableDebtToken.balanceOf` for the debt and `aToken.balanceOf` for the collateral (token addresses come from `getReserveData`), and read `getUserAccountData` only for the protocol-computed health factor and liquidation threshold context. Derive `liquidationPrice` for the synthetic pair from collateral amount, debt, and liquidation threshold (the price at which `collateral * liqThreshold == debt`), expressed in loan-asset units like the Morpho path; the ETH collateral USD reference comes from the Aave oracle base-currency values (see U11). Convert RAY rates; set `collateralShares == collateralAmount`. Health factor and ltv `null` when no debt.

**Patterns to follow:** `packages/sdk/src/actions/borrow/providers/morpho/state.ts` (multicall `allowFailure:false`) and `presentation.ts` (adapters, `formatUnits`, ltv/HF/liquidationPrice derivation). Do not use `@aave/math-utils` here (CONTRIBUTING prefers viem snippets); that stays in the lend `sdk.ts`.

**Test scenarios:**
- `_getMarket` maps a reserve to `BorrowMarket` with correct `borrowApy` (RAY divided by 1e27), `maxLtv`, `liquidationBonus` from the decoded bitmap.
- Config bitmap decoder extracts LTV/threshold/bonus/decimals from a known packed `uint256`.
- `_getPosition` reads `variableDebtToken.balanceOf` and `aToken.balanceOf` for the specific pair (not the aggregate), maps debt, ltv, healthFactor; `collateralShares == collateralAmount`.
- `_getPosition` derives a `liquidationPrice` in loan-asset units consistent with the collateral, debt, and liquidation threshold; verify against a hand-computed example.
- `_getPosition` with zero debt returns `healthFactor: null`, `ltv: null`.
- A wallet with an unrelated extra Aave reserve position does not change the reported debt/collateral for the synthetic pair (contamination guard).
- Rate conversion: a RAY value maps to the expected decimal APY.

**Verification:** Read hooks return correctly shaped data against mocked multicall results; new tests green.

---

### U4. AaveBorrowProvider write layer and quote assembly

**Goal:** Build calldata and quotes for open, close, deposit collateral, withdraw collateral, and repay against the real Aave Pool, including native ETH via the WETH gateway.

**Requirements:** origin "Support the standard borrow surface"; Decision 6.

**Dependencies:** U3.

**Files:**
- `packages/sdk/src/actions/borrow/providers/aave/AaveBorrowProvider.ts` (write hooks)
- `packages/sdk/src/actions/borrow/providers/aave/calldata.ts` (encoders + approvals)
- `packages/sdk/src/actions/borrow/providers/aave/__tests__/AaveBorrowProvider.write.spec.ts`

**Approach:** `_openPosition` borrows the debt asset (Pool `borrow(asset, amount, 2, 0, onBehalfOf)`, interestRateMode 2 = variable) against existing aWETH collateral; optional collateral deposit path supported but unused by the demo open flow. `_repay` builds an ERC20 approval (or skips with allowance) then `repay(asset, amount, 2, onBehalfOf)`, using `type(uint256).max` for `{ max: true }` so a full repay clears principal plus accrued interest on-chain (Decision 11). `_depositCollateral`/`_withdrawCollateral` use Pool `supply`/`withdraw` or WETHGateway `depositETH`/`withdrawETH` for native ETH. `_closePosition` repays (max) then withdraws. Assemble `BorrowQuote` with `provider: 'aave'`, `quotedAt`/`expiresAt`, `safeCeilingLtv = maxLtv * (1 - bufferPct)`, `positionBefore`/`positionAfter`.

**Patterns to follow:** `packages/sdk/src/actions/borrow/providers/morpho/{blue,open,close,repay}.ts` and `presentation.ts` `assembleMorphoBorrowQuote`; `@/utils/approve.js` `buildErc20ApprovalTx`/`resolveErc20ApprovalAmount`; native-vs-WETH handling in `AaveLendProvider.ts`.

**Test scenarios:**
- `_repay` with an exact amount emits approval-then-repay; with `{ max: true }` uses `type(uint256).max`; skips approval when allowance is sufficient.
- `_openPosition` emits a single `borrow` call with interestRateMode 2 and the resolved debt asset address.
- `_withdrawCollateral` for native ETH routes through the WETH gateway; for an ERC20 reserve uses Pool `withdraw`.
- Quote `safeCeilingLtv`, `provider`, and expiration are populated; `positionAfter` reflects the projected debt.
- Calldata encoders never mock `encodeFunctionData` (assert on decoded args).

**Verification:** Write hooks produce correct transaction bundles against fixtures; new tests green.

---

### U5. Register the Aave borrow provider

**Goal:** Wire `aave` into provider names, config, the borrow module, public exports, namespace routing, and ship a mock and changeset.

**Requirements:** origin acceptance "exists, exported, registered".

**Dependencies:** U2, U3, U4.

**Files:**
- `packages/sdk/src/types/providers.ts` (add `'aave'` to `BORROW_PROVIDER_NAMES`)
- `packages/sdk/src/types/actions.ts` (add `aave?` to `BorrowConfig`)
- `packages/sdk/src/actions/borrow/module.ts` (construct `AaveBorrowProvider` from `config.aave`)
- `packages/sdk/src/actions/borrow/index.ts`, `packages/sdk/src/index.ts` (export `AaveBorrowProvider`)
- `packages/sdk/src/actions/borrow/namespaces/BaseBorrowNamespace.ts` (add `aave-v3` routing fallback)
- `packages/sdk/src/actions/borrow/__mocks__/MockAaveBorrowProvider.ts` (new)
- `packages/sdk/README.md` (provider list)
- `.changeset/aave-borrow-provider.md` (new)
- `packages/sdk/src/actions/borrow/__tests__/registration.spec.ts`

**Approach:** Mirror the morpho registration blocks and the lend module's aave block. Constructor-time validation: confirm configured collateral/debt assets resolve to addresses on the chain (parallel to Morpho's `verifyMorphoMarketId`). `MockAaveBorrowProvider` mirrors `MockBorrowProvider.ts` shape.

**Patterns to follow:** `packages/sdk/src/actions/lend/module.ts` aave block; `packages/sdk/src/actions/borrow/__mocks__/MockBorrowProvider.ts`.

**Test scenarios:**
- `config.borrow.aave` constructs an `AaveBorrowProvider` registered under `'aave'`.
- A market with `kind: 'aave-v3'` routes to the aave provider; `morpho-blue` still routes to morpho.
- `AaveBorrowProvider` is exported from the SDK entry point.
- Invalid Aave config (unresolvable asset on chain) throws at construction.

**Verification:** `pnpm --filter @eth-optimism/actions-sdk typecheck test` green; changeset present.

---

### U6. Backend Aave market config and schema

**Goal:** Configure the real OP Sepolia Aave borrow market and the real USDC debt asset, and accept `aave-v3` in request validation.

**Requirements:** origin "Backend integration"; Decision 1.

**Dependencies:** U5.

**Files:**
- `packages/demo/backend/src/config/markets.ts` (add the `aave-v3` borrow market: OP Sepolia, ETH collateral, USDC debt)
- `packages/demo/backend/src/config/actions.ts` (add `borrow.aave.marketAllowlist`)
- `packages/demo/backend/src/helpers/schemas.ts` (extend `BorrowMarketIdSchema` to accept `aave-v3`)
- `packages/demo/backend/src/services/borrow.ts` (add the Aave market to `BORROW_MARKETS`)
- `packages/demo/backend/src/services/borrow.spec.ts`

**Approach:** Define the Aave borrow market config with the synthetic id from U2. Use the existing SDK `USDC` constant for the debt asset (it already has an OP Sepolia entry at `packages/sdk/src/constants/assets.ts`); do not add a redundant local USDC definition in the backend config. Extend the zod market-id schema with the `aave-v3` discriminant.

**Patterns to follow:** existing `MorphoUSDCBorrowDemo` and `AaveETH` entries in `config/markets.ts`; the morpho branch of `BorrowMarketIdSchema`.

**Test scenarios:**
- `resolveMarketConfig` resolves the aave-v3 market id to the Aave config.
- `BorrowMarketIdSchema` accepts a valid `aave-v3` id and rejects a malformed one.
- `/borrow/markets` includes the Aave market alongside Morpho.

**Verification:** Backend typechecks; market resolution tests green.

---

### U7. Mirror module (single shared)

**Goal:** Implement the one mirror module that mints `USDC_DEMO` on borrow and removes it on repay, asynchronously and silently, for both wallet types.

**Requirements:** Decisions 7, 8, 9; origin "Demo mirror".

**Dependencies:** U6.

**Files:**
- `packages/demo/backend/src/services/mirror.ts` (new)
- `packages/demo/backend/src/config/env.ts` (mint admin key + sink address config, via `.env.example` only)
- `packages/demo/backend/src/services/mirror.spec.ts`

**Approach:** `mintMirrorUsdc(recipient, amount)` builds a backend admin smart wallet from a dedicated mint key (a new `DEMO_MIRROR_MINTER_PRIVATE_KEY`, distinct from the faucet key; the wallet must be gas-funded on Base Sepolia) and calls `DemoUSDC.mint(recipient, amount)` (permissionless mint). `removeMirrorUsdc(userWallet, amount)` directs the server-custodied user smart wallet (reconstructed from the authenticated Privy `idToken`, per Decision 9) to `transfer` `USDC_DEMO` to a configured sink address; the amount is bounded to the validated repay amount, never the full balance. Both fire after the real Aave tx confirms, do not block the borrow/repay response, and emit operator logs only (real tx hash, wallet, amount, action, mirror status). No activity-log or toast emission. The mint log additionally records the real Aave tx hash so the deferred reconciliation can detect duplicate mints. If a wallet type cannot be backend-signed for the sink transfer, the Aave borrow flow rejects that wallet type at the backend rather than silently skipping the removal (Decision 9).

**Patterns to follow:** `packages/demo/backend/src/services/faucet.ts` (admin smart wallet build and `sendBatch`); `packages/demo/backend/src/services/wallet.ts` `mintDemoUsdcToWallet` (existing USDC_DEMO mint calldata) and `getWallet(idToken)` (server-custodied user wallet reconstruction).

**Test scenarios:**
- `mintMirrorUsdc` builds a `DemoUSDC.mint(recipient, amount)` tx on Base Sepolia from the mint admin wallet.
- `removeMirrorUsdc` builds a `USDC_DEMO.transfer(sink, amount)` tx from the server-custodied user wallet, with `amount` equal to the passed repay amount (never the full balance).
- A mirror failure is logged with the required fields (incl. real tx hash) and does not throw into the borrow/repay response path.
- A wallet type that cannot be backend-signed is rejected before the real borrow, not silently skipped at removal time.
- Mirror calls emit no activity-log or toast side effect.

**Verification:** Mirror unit tests green; no user-facing emission asserted.

---

### U8. Backend borrow integration with the mirror and ledger overlay

**Goal:** Wrap real Aave borrow/repay with the mirror, gate repay on `USDC_DEMO` balance, and return mirror-debt-driven position and quote values.

**Requirements:** Decisions 7, 10; origin two-ledger rules.

**Dependencies:** U7.

**Files:**
- `packages/demo/backend/src/services/borrow.ts` (integrate mirror into openPosition/repay mutation wrappers; overlay quote `positionAfter` for the Aave market)
- `packages/demo/backend/src/services/wallet.ts` (overlay the steady-state `getBorrowPosition` read for the Aave market: this is the actual position-read path, not `services/borrow.ts`)
- `packages/demo/backend/src/controllers/borrow.routes.spec.ts` (aave fixtures)
- `packages/demo/backend/src/services/borrow.spec.ts`
- `packages/demo/backend/src/services/wallet.spec.ts`

**Approach:** On borrow, after `wallet.borrow.openPosition` confirms, fire `mintMirrorUsdc` async. On repay, under a per-wallet lock (Decision 7): validate the requested amount against `min(USDC_DEMO balance, outstanding real debt principal)` (Decision 12), execute the real repay of that amount, then fire `removeMirrorUsdc` async with that same amount. The mirror-debt overlay (Decision 10) is applied in two places for the Aave market: the quote `positionAfter` in `services/borrow.ts::getQuote`, and the steady-state read in `services/wallet.ts::getBorrowPosition` (combine the provider's live collateral read with the mirror debt). All mirror behavior (mint fire, lock, repay cap, overlay) is strictly gated on `kind === 'aave-v3'`; the Morpho branch runs the existing wrappers untouched.

**Patterns to follow:** existing `services/borrow.ts` mutation wrappers and `resolveWalletOrThrow`; `services/wallet.ts` `getBorrowPosition`.

**Test scenarios:**
- Borrow returns success on the real tx and enqueues the mint without awaiting it.
- Repay with sufficient `USDC_DEMO` proceeds and enqueues the removal; repay exceeding `USDC_DEMO` balance is rejected with a clear "re-acquire USDC_DEMO" error.
- Repay amount is capped to `min(USDC_DEMO balance, outstanding real debt principal)`; a request above outstanding debt is capped to the debt.
- Two concurrent repays for the same wallet do not both pass the gate against the same balance (per-wallet lock serializes them within one process).
- `getBorrowPosition` for an Aave market returns service-overlaid mirror debt and health, collateral from the live provider read; the SDK provider is not handed a mirror value.
- During a pending/failed mirror after a borrow, `getBorrowPosition` returns the mirror debt (just-borrowed debt), not a falsely-healthy real-Aave read.
- Morpho regression: a Morpho borrow/repay fires no mirror call, acquires no per-wallet lock, and applies no repay cap; its `getBorrowPosition` is byte-for-byte the pre-change behavior.

**Verification:** `pnpm --filter @eth-optimism/actions-service typecheck test` green.

---

### U9. Frontend aave-v3 market-id handling and provider logo

**Goal:** Make every frontend site that switches on market-id kind handle `aave-v3`, and show the Aave provider logo.

**Requirements:** origin "Frontend integration".

**Dependencies:** U6 (markets exposed).

**Files:**
- `packages/demo/frontend/src/api/borrowApi.serializers.ts` (`marketIdPath` aave-v3 branch)
- `packages/demo/frontend/src/hooks/useBorrowProvider.ts` (`selectedMarketPosition`, `sameMarketId`)
- `packages/demo/frontend/src/components/earn/borrow/BorrowAction.tsx` (repay-mode `activeMarket` matcher)
- `packages/demo/frontend/src/components/earn/borrow/BorrowPositions.tsx` (`positionKey`)
- `packages/demo/frontend/src/constants/logos.ts` (confirm `Aave` logo mapping)
- `packages/demo/frontend/src/hooks/__tests__/useBorrowProvider.spec.tsx`

**Approach:** Add `aave-v3` branches everywhere the code currently special-cases `morpho-blue` for id equality, URL path encoding, position matching, and stable keys. `marketProviderDisplayName` already maps `aave-v3` to "Aave"; ensure `MARKET_LOGO.Aave` resolves. The Aave market hits a live shared pool (not demo-deployed contracts), so specify its non-happy display states: a loading/skeleton state while market and position data fetch, an error state if the OP Sepolia read fails (the market card shows an unavailable state rather than crashing the borrow tab), and an empty/no-liquidity state if the reserve returns no borrowable liquidity. Reuse whatever loading/error treatment the Morpho market card uses; do not invent a new pattern.

**Patterns to follow:** the existing `morpho-blue` branches in each file; the Morpho market card's loading/error handling.

**Test scenarios:**
- `marketIdPath` encodes an `aave-v3` id into the `/wallet/borrow/:chainId/:marketId/position` path.
- `sameMarketId` and `selectedMarketPosition` match an Aave position to its market.
- An Aave position row gets a stable `positionKey` (not `unknown-`).
- A failed Aave market read renders the unavailable state, not a crashed borrow tab.

**Verification:** `pnpm --filter actions-ui typecheck test` green for borrow hooks.

---

### U10. Frontend Aave borrow flow, gating, and silent balance listeners

**Goal:** Let the user borrow/repay/manage the Aave market with `USDC_DEMO`-gated repay and silent async balance updates when the mirror settles.

**Requirements:** Decisions 7, 10; origin "borrow/repay/collateral flows".

**Dependencies:** U8, U9.

**Files:**
- `packages/demo/frontend/src/components/earn/borrow/BorrowTab.tsx` (couple Aave market to the `AaveETH` lend position by ETH collateral symbol)
- `packages/demo/frontend/src/components/earn/borrow/BorrowAction.tsx` (repay/withdraw gating on `USDC_DEMO` balance)
- `packages/demo/frontend/src/hooks/useBorrowProvider.ts` (balance listener refresh on mirror settle; no activity-log entry)
- `packages/demo/frontend/src/components/earn/borrow/__tests__/BorrowAction.spec.tsx`

**Approach:** Couple the Aave borrow market to the existing ETH lend position. Gate the repay CTA on `min(USDC_DEMO balance, outstanding debt)` (read via the existing token-balances query) in addition to the buffer/LTV gate. After a borrow/repay receipt (real tx success), refresh balances on the existing positions-changed event and a delayed reconcile so the async mirror settle is picked up, without writing an activity-log entry for the mirror.

This unit must specify the mirror UX states (the silent async mirror would otherwise read as a glitch):

- **Borrow pending-to-settled.** On a successful borrow, show the real-tx success immediately, then a transient "balance syncing" affordance on the `USDC_DEMO` balance until the mint settles (the balance updates via the positions-changed listener). Do not show a zero/healthy position as final during the lag window; reflect the just-borrowed debt from the receipt's `positionAfter`.
- **Mint-failure state.** If the mint does not settle within the reconcile window, keep the "balance syncing" affordance (not a hard error toast) so the deferred reconciliation can repair it; log operator-side. Never silently show a wrong-looking healthy balance as final.
- **Re-acquire-USDC_DEMO state.** When the repay CTA is gated by insufficient `USDC_DEMO`, show explanatory copy ("You need more USDC_DEMO to repay this loan") with a concrete entry point to acquire it (link to the swap or faucet path used elsewhere in the demo), not a bare disabled button.
- **Locked-collateral state.** When the user has Aave debt but cannot fully repay (insufficient `USDC_DEMO`), the withdraw-collateral control shows a locked state with copy explaining the ETH is locked behind the outstanding debt until repaid, pointing back to the re-acquire path.
- **Partial repay.** The repay input defaults to the max repayable (`min(USDC_DEMO balance, outstanding debt)`) and allows any amount up to that; typing above it caps with a hint rather than hard-blocking submit.
- **Lend-first entry.** When the user opens the Aave borrow tab with no ETH lend position, show a "lend ETH first" prompt/CTA into the lend flow rather than a borrow form that would fail.
- **Fallback coherence (split-brain guard).** `BorrowAction` prefers backend `positionAfter.ltv/healthFactor` but falls back to a local `borrowMath.computeProjection` over `borrowValuation.positionUsd` (stub prices) when the backend value is null. For the Aave market, the `selectedMarketPosition` the fallback reads must be the backend-overlaid mirror-debt value (from `getBorrowPosition`, U8), and the ETH collateral USD must use the same source the backend uses (U11), so the local fallback can never compute a different health number than the backend overlay. The health card and balance widget both reflect the syncing state during the mirror lag, not just the balance.

**Patterns to follow:** Morpho `BorrowAction` quote-driven projection and CTA gating; existing `EARN_POSITIONS_CHANGED_EVENT` and delayed reconcile in `useBorrowProvider`.

**Test scenarios:**
- Repay CTA is disabled with explanatory copy and an acquire-path link when `USDC_DEMO` balance is below the repay amount.
- Borrow submit reflects success on the real receipt; debt and health show from the overlaid `positionAfter` during the mirror lag, not a stale healthy state; no mirror entry appears in the activity log.
- For an Aave position, the local `borrowMath` fallback and the backend `positionAfter` produce the same ltv/health (no split-brain) because both read the overlaid mirror debt and the same ETH USD source.
- Withdraw-collateral control shows the locked state when debt is outstanding and `USDC_DEMO` is insufficient to repay.
- Repay input defaults to max repayable and caps over-entry with a hint.
- Opening the borrow tab with no ETH lend position shows the lend-first prompt, not a failing borrow form.
- Balance and health card refresh after the positions-changed event without a user-facing mirror toast.

**Verification:** `pnpm --filter actions-ui typecheck test` green; manual demo flow per origin success criteria.

---

### U11. Collateral USD pricing for display

**Goal:** Supply USD values for ETH collateral and `USDC_DEMO` so the Aave borrow UI renders health and valuations.

**Requirements:** origin "Demo strategy and price feeds".

**Dependencies:** U8.

**Files:**
- `packages/demo/frontend/src/utils/stubPrices.ts` (ensure ETH and `USDC_DEMO` entries)
- `packages/demo/backend/src/services/borrow.ts` (source collateral USD from Aave `getUserAccountData` base-currency values where available)

**Approach:** Keep `USDC_DEMO` at a fixed $1. For ETH collateral USD, prefer Aave's base-currency values returned by `getUserAccountData` (already USD-denominated for health), falling back to the existing `stubPrices` ETH value for synchronous display. Do not deploy a `MockChainlinkFeed` in v1 unless live pricing proves insufficient (deferred).

**Patterns to follow:** existing `stubPrices.ts` and `borrowValuation.ts` usage.

**Test scenarios:**
- `USDC_DEMO` resolves to $1 and ETH resolves to a positive USD value in valuation helpers.
- Aave position USD collateral value renders without NaN when collateral is present.
- Backend price sourcing: when it only forwards Aave base-currency values, assert the forwarded value is USD-scaled.

**Verification:** Borrow valuation renders correct USD figures for the Aave market.

---

## Dependencies / Prerequisites

- SDK changeset (mandatory for `packages/sdk` changes, AGENTS.md).
- Backend env: a dedicated `DEMO_MIRROR_MINTER_PRIVATE_KEY` (gas-funded on Base Sepolia, separate from the faucet key) and a sink address. Configure via `.env.example` and inject from a secrets manager; never commit and never read real `.env`.
- Verify gate after each unit: `pnpm typecheck && pnpm lint && pnpm test`, package-scoped with `--filter` during iteration.

---

## Assumptions to Validate During Work

- Real Aave V3 on OP Sepolia has a borrowable USDC reserve with enough testnet liquidity for demo amounts.
- The OP Sepolia ETH faucet drips enough ETH to collateralize a demo-sized borrow.
- The mint admin wallet (`DEMO_MIRROR_MINTER_PRIVATE_KEY`) is gas-funded on Base Sepolia.
- The server-custodied wallet model lets the backend sign the sink transfer from the user's wallet via the authenticated Privy `idToken` (verified against `services/wallet.ts`); wallet types that cannot be backend-signed are rejected from the Aave borrow flow (Decision 9), not silently skipped.

---

## Risks and Mitigation

- **Two-chain coherence drift.** Real Aave on OP Sepolia and mirror on Base Sepolia can diverge if a mirror tx fails. v1 accepts rare drift and logs it (with the real tx hash, wallet, amount, action, and mirror status so the deferred reconciliation has the breadcrumbs to repair the right wallets); the deferred reconciliation fallback (compare principal invariant, not raw balances) repairs it later.
- **Mint failure strands the user.** A failed mint after a successful borrow leaves real debt with no spendable `USDC_DEMO`. Mitigated by the persistent "balance syncing" UI state (U10) plus operator logging; not silently shown as final success.
- **Interest accrual drift.** Real variable debt accrues; the mirror tracks principal. Mitigated by max-repay on full close-out (Decision 11) and by defining lockstep on principal. Residual interest is funded from parked real USDC and invisible to the demo.
- **Permissionless `DemoUSDC.mint` + admin key.** Anyone can mint `USDC_DEMO`, so the repay cap is bounded by outstanding real debt, not balance alone (Decision 12). The mint admin key is a privileged credential even on testnet: load it from a secrets manager / injected env (never committed), use a separate key per environment, and annotate `.env.example` that it controls minting. Documented as an accepted testnet trust assumption; a real deployment must add mint access control before reuse.
- **Concurrent-repay race.** The sync gate reads a live balance while the removal fires async. Mitigated by a per-wallet repay lock (Decision 7), which is in-process only: it does not survive a backend restart and does not protect a second instance, so horizontally scaling the demo backend reopens the race. Acceptable for the single-instance demo; documented as a deployment constraint. Duplicate mints from a retried borrow are detectable via the real-tx-hash recorded in the mint log (full idempotency deferred with reconciliation).
- **Backend has no persistence.** v1 avoids any feature that needs it (no idempotency store, no job queue); reconciliation is deferred until a marker store is added.
- **Aggregate account data leakage.** Mitigated by reading the specific reserve token balances (aWETH, variableDebtUSDC) instead of the aggregate `getUserAccountData` for debt/collateral (U3), so an unrelated Aave position on the same wallet does not corrupt the displayed synthetic pair.
- **Sink permanence.** The sink address permanently accumulates `USDC_DEMO`, and the true-burn redeploy is structurally blocked by the Morpho coupling, so the transfer-to-sink is effectively the long-term mechanism, not a temporary one. The sink address is operator-controlled config.

---

## Execution Posture

Test-first for the SDK provider read/write hooks (U3, U4) and the mirror module (U7): write the failing behavior test before the implementation, since these encode protocol math and silent side-effect contracts that are easy to get subtly wrong.
