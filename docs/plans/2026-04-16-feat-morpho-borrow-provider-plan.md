---
title: Morpho Borrow Provider + Demo Borrow Tab
type: feat
status: active
date: 2026-04-16
origin: docs/brainstorms/2026-04-15-morpho-borrow-provider-brainstorm.md
---

# Morpho Borrow Provider + Demo Borrow Tab

## Overview

Add a new `BorrowProvider` abstraction to `@eth-optimism/actions-sdk` with a first implementation for Morpho Blue (`MorphoBorrowProvider`), a new Borrow tab in the demo frontend, and the backend + deploy infrastructure to support them. The demo market uses **dUSDC (MetaMorpho vault shares) as yield-bearing collateral** against **OP (demo)** debt — users earn vault yield while borrowing.

This work also generalises the SDK's namespace and provider abstractions so that Lend, Swap, and Borrow share base classes, eliminating per-domain duplication carried over from prior work.

## Problem Statement / Motivation

The SDK today exposes `Lend` (Morpho + Aave) and `Swap` (Uniswap + Velodrome) but has no borrow primitive. Real DeFi users want to post collateral and borrow — especially against yield-bearing positions — and the demo app cannot tell that story. The brainstorm established the full product scope; this plan translates it into phased implementation.

Secondarily, the existing `LendProvider`/`SwapProvider`/namespace code diverged over time: Swap has generic provider-iteration, settings cascades, and a quote-draft pattern; Lend has none of those. Without shared abstractions, Borrow would extend that divergence. The plan treats the shared-base refactor as a prerequisite, not a follow-up.

(See brainstorm: `docs/brainstorms/2026-04-15-morpho-borrow-provider-brainstorm.md` §2–§8.)

## Proposed Solution

Ship the feature in six phases along dependency lines:

1. **Foundations** — `BaseProvider<TConfig>`, generic `BaseNamespace<TProviders, TProvider>`, shared Morpho directory, common types (`FilterAssetChain`, `TransactionOptions`, `MarketProviderConfig<T>`).
2. **Contracts & deploy** — new dynamic oracle contract for dUSDC→OP, new `DeployMorphoBorrowMarket.s.sol`, rename `DeployMorphoMarket.s.sol` → `DeployMorphoLendMarket.s.sol`, updated `deploy-demo.sh` orchestration.
3. **SDK BorrowProvider** — `BorrowProvider` abstract + `MorphoBorrowProvider` concrete + calldata integrity validator + position/HF queries via blue-sdk's `AccrualPosition`.
4. **Namespaces & wiring** — `BaseBorrowNamespace`, `ActionsBorrowNamespace`, `WalletBorrowNamespace`; add to `Actions.ts` and `Wallet.ts`; lift `executeTransactionBatch` into a shared wallet-namespace base.
5. **Backend** — `/borrow/{markets,quote,execute,repay,positions}` endpoints, Zod schemas, service layer, wallet-namespace guard (`requireWalletBorrow`).
6. **Frontend** — Borrow tab, Health Factor + Position Summary components, ActivityLog types, multi-tab generalisation (`ActionType`, `isTabHighlighted`, mobile menu, `ModeToggle`/`AmountLabel` parameterisation).

Phases 1 and 2 are independent and can run in parallel. Phases 3–6 are strictly sequential.

## Technical Approach

### Architecture

```
packages/sdk/src/
  core/
    BaseProvider.ts          (new)  chainManager, supportedChainIds, buildApprovalTx
    BaseNamespace.ts         (new)  generic getAllProviders/supportedChainIds/market fan-out
    BaseWalletNamespace.ts   (new)  executeTransactionBatch shared logic
  providers/
    morpho/                  (new — shared Morpho code extracted from lend/)
      contracts.ts           MORPHO_BLUE address, IRM per chain, registry
      abis.ts                re-exports blueAbi, metaMorphoAbi, adaptiveCurveIrmAbi
      types.ts               MarketParams, MorphoContractsRegistry
      calldata.ts            (new) decodeAndVerifyMorphoCalldata(...)
  lend/                      (existing, minor refactor)
    core/LendProvider.ts     extends BaseProvider
    namespaces/              extend BaseNamespace / BaseWalletNamespace
  swap/                      (existing, minor refactor)
    core/SwapProvider.ts     extends BaseProvider
    namespaces/              extend BaseNamespace / BaseWalletNamespace
  borrow/                    (new)
    core/BorrowProvider.ts
    providers/morpho/
      MorphoBorrowProvider.ts
      sdk.ts                 position/HF queries via AccrualPosition
      __tests__/
      __mocks__/
    namespaces/
      BaseBorrowNamespace.ts
      ActionsBorrowNamespace.ts
      WalletBorrowNamespace.ts
  types/
    common/                  (new)
      FilterAssetChain.ts
      TransactionOptions.ts  renamed from LendOptions
      MarketProviderConfig.ts
    borrow/
      base.ts                BorrowMarketConfig, BorrowMarketPosition, BorrowQuote, BorrowOpenPositionParams, BorrowClosePositionParams
      morpho.ts              Morpho-specific quote context
```

Key shape: `LendMarketId` stays address-based (vault contract), `BorrowMarketConfig` uses `{ collateralAsset, borrowAsset, chainId, name, borrowProvider }` and the SDK derives the `bytes32` market id internally via `keccak256(encodeAbiParameters(...MarketParams))`. Callers never touch market IDs. (See brainstorm: §5.)

### Oracle design

**Contract: `DynamicVaultOracle.sol`** — new Solidity file in `packages/demo/contracts/src/`.

The oracle prices dUSDC (18-dec shares backed by 6-dec USDC) in terms of OP (18-dec). Because the demo runs on baseSepolia with no real Chainlink feeds for demo tokens, we decompose:

```
price_dUSDC_in_OP = (usdc_per_share) * (op_per_usdc)
```

- **`usdc_per_share`** — dynamic, via `IERC4626(vault).convertToAssets(baseVaultConversionSample)`. This is where the "dynamic" behaviour lives: as the MetaMorpho vault accrues yield, `convertToAssets` increases, so collateral value grows with the vault.
- **`op_per_usdc`** — hardcoded constant at deploy time (demo assumption: 1 OP ≈ 1 USDC). Constructor parameter, stored as immutable.

Return value follows Morpho's `IOracle.price()` contract: **scale = `36 + loanDecimals − collateralDecimals = 36 + 18 − 18 = 36`** because both dUSDC shares and OP are 18-dec. The conversion from USDC (6-dec, underlying of dUSDC) to 18-dec loan-token units happens via an internal `SCALE_FACTOR = 10**(36 + opDecimals - usdcDecimals - log10(baseVaultConversionSample))`.

**Critical gotchas codified in the contract and test:**
- `baseVaultConversionSample` **must be `1e10` (not `1e18`)** for USDC-underlying vaults — `1e18` underflows the scale factor and returns zero, resulting in instant liquidation of any position.
- Constructor decimals refer to the **underlying asset** (USDC = 6), not the share token (dUSDC = 18). Source: Morpho's `MorphoChainlinkOracleV2` + `VaultLib`, and the PAXG/USDC exploit post-mortem.
- Use `convertToAssets`, never `previewRedeem` (fee-distorted). `previewRedeem` underprices collateral and unfairly triggers liquidations.

**Donation-inflation defence:** before `createMarket`, the deploy script seeds the MetaMorpho vault with ≥ `1e9` shares deposited to `0x000000000000000000000000000000000000dEaD` (virtual-supply mint). Already partially handled by MetaMorpho V1, but we make it explicit in the demo deploy flow.

(See brainstorm: §2 market design; carried-forward decision: "Dynamic oracle that calls `vault.convertToAssets()`".)

### Calldata integrity validation

Novel capability in this repo — issue #373 tracks backporting to `SwapProvider`. Module: `packages/sdk/src/providers/morpho/calldata.ts`.

For each of `supplyCollateral` / `borrow` / `repay` / `withdrawCollateral` the validator:

1. Compares `tx.to` against the expected `MORPHO_BLUE` address for the chain.
2. Hard-compares the function selector (precomputed via `toFunctionSelector` at module load) against `tx.data.slice(0, 10)` before calling `decodeFunctionData`.
3. Calls `decodeFunctionData({ abi: blueAbi, data: tx.data })`.
4. Recomputes `keccak256(encodeAbiParameters(tupleType, [loanToken, collateralToken, oracle, irm, lltv]))` from the decoded `MarketParams` and compares against the expected market ID.
5. Asserts `onBehalf === wallet.address` and (for `borrow`/`withdrawCollateral`) `receiver === wallet.address`. Demo always uses self-delegation.
6. Asserts amount/shares match the quote within exact-equality tolerance; for `repay` with `mode: 'full'`, the validator expects `assets === 0 && shares === position.borrowShares` (dust-safe path).

Failure throws a typed `CalldataMismatchError` with a `field` discriminator (`to` / `selector` / `marketId` / `amount` / `onBehalf` / `receiver` / `shares`). Surfaces as `CALLDATA_MISMATCH` in the user-facing error taxonomy.

### Quote contract

`BorrowQuote` is a mutable draft with a strict API surface:

- **Caller may set:** `borrowAmount`, `recipient`, `slippage` (reserved — Morpho Blue borrow has no slippage, but keep the field for symmetry).
- **Recomputed on set:** `collateralAmount` (if the source was collateral-in), `healthFactor`, `liquidationPrice`, `ltv`, `execution.calldata`, `execution.value`, `quotedAt`.
- **Immutable fields:** `market`, `chainId`, `borrowProvider`, `oracle.sampleScale`, `marketParams`, `marketId`.

Staleness: `openPosition(quote)` rejects with `QUOTE_STALE` if `Date.now() - quote.quotedAt > settings.quoteExpirationSeconds` (default 60s) **or** if `currentBlock - quote.quotedAtBlock > maxQuoteAgeBlocks` (default 5). Block-tag consistency: `_getQuote` captures a single `latest` block tag and reads market, position, and oracle at that tag; the tag is stored in the quote.

Bidirectional semantics (see brainstorm §2):
- `getQuote({ collateralAmount })` — returns max borrow at the market's max LTV, minus safety buffer. User may then set `borrowAmount` to any value ≤ that max.
- `getQuote({ borrowAmount })` — returns required collateral at max LTV + safety buffer.

Safety buffer: `settings.maxBorrowSafetyBuffer` resolves provider → BorrowConfig.settings → default `1.0` (no buffer). A buffer of `0.95` borrows at 95% of max LTV. This mirrors popular protocol UX (Morpho app leaves ~5% headroom on Max button). (See brainstorm §2 + §3.)

`ActionsBorrowNamespace.getQuote` defaults `includeCalldata: false`; `WalletBorrowNamespace.getQuote` defaults `includeCalldata: true`. Mirrors Swap's forthcoming pattern (issue #331).

### Position math & health factor

Use `@morpho-org/blue-sdk-viem`'s `AccrualPosition.fetch(user, marketId, client)` — it returns accrued state and exposes getters:

- `healthFactor: bigint` (WAD-scaled; `MaxUint256` when debt = 0)
- `liquidationPrice: bigint` (in loan-token terms, oracle-scaled)
- `ltv: bigint` (WAD)
- `borrowAssets: bigint` (accrued debt in loan-token units)
- `collateralValue: bigint` (in loan-token terms)
- `isHealthy: boolean`

No manual HF math in SDK code. Fixture tests against HF = 1.0, 1.0001, 0.9999 at LLTV=86% confirm SDK behaviour matches on-chain `_isHealthy`.

**Full-repay uses shares, never assets:** `repay({ mode: 'full' })` calls `repay(marketParams, 0n, position.borrowShares, user, "0x")`. Repaying `borrowAssets` as assets leaves 1 wei of debt dust due to `toSharesUp` rounding — this bricks subsequent `withdrawCollateral` (full) because the dust keeps the position open. (See research: Morpho Blue SharesMathLib rounding.)

### Implementation Phases

#### Phase 1: Foundations (SDK refactor — prerequisite)

**Files created:**
- `packages/sdk/src/core/BaseProvider.ts`
- `packages/sdk/src/core/BaseNamespace.ts`
- `packages/sdk/src/core/BaseWalletNamespace.ts`
- `packages/sdk/src/types/common/{FilterAssetChain,TransactionOptions,MarketProviderConfig}.ts`
- `packages/sdk/src/providers/morpho/{contracts,abis,types,calldata}.ts`

**Files refactored:**
- `packages/sdk/src/lend/core/LendProvider.ts` → extends `BaseProvider`
- `packages/sdk/src/swap/core/SwapProvider.ts` → extends `BaseProvider`
- `packages/sdk/src/lend/namespaces/*.ts` → extend new bases; replace hard-coded `getAllProviders()` (`BaseLendNamespace.ts:57-61`) with generic `Object.values(providers).filter(Boolean)` pattern from `BaseSwapNamespace.ts:195`
- `packages/sdk/src/swap/namespaces/*.ts` → extend new bases
- `packages/sdk/src/lend/providers/morpho/contracts.ts` → **move to** `packages/sdk/src/providers/morpho/contracts.ts`; update all imports
- Types: rename `LendOptions` → `TransactionOptions` in `types/lend/base.ts:193-200` (keep a `type LendOptions = TransactionOptions` alias for one release cycle to avoid breaking demo imports, then remove)

**Deliverables:**
- Existing lend + swap tests pass unchanged (behaviour preserved).
- New `BaseProvider.test.ts`, `BaseNamespace.test.ts`, `BaseWalletNamespace.test.ts` cover the shared surface.
- Typecheck + lint + build clean across the monorepo.

**Review checkpoint.** Merge-ready refactor PR before Phase 3 begins.

#### Phase 2: Contracts & deploy (runs in parallel with Phase 1)

**Files created:**
- `packages/demo/contracts/src/DynamicVaultOracle.sol` — implements `IOracle`; constructor takes `(address vault, uint256 opPerUsdcWad, uint256 baseVaultConversionSample)`; `price()` returns the Morpho-scaled rate.
- `packages/demo/contracts/script/DeployMorphoBorrowMarket.s.sol` — env vars `DEMO_OP_ADDRESS`, `DEMO_VAULT_ADDRESS`; deploys oracle, asserts `isLltvEnabled(86%)`, calls `createMarket(MarketParams{loanToken: OP, collateralToken: dUSDC, oracle, irm, lltv: 86%})`, seeds OP liquidity via `supply(MarketParams, opInitialSupply, 0, msg.sender, "0x")`.
- `packages/demo/contracts/test/DynamicVaultOracle.t.sol` — fork tests covering: (a) fresh vault, `convertToAssets(1e10)` sane; (b) after yield accrual, `price()` increases monotonically; (c) donation attack — simulate `token.transfer(vault, 1e9 USDC)` and assert oracle only moves by the expected virtual-share-diluted amount; (d) decimal-mismatch regression (ensure `baseVaultConversionSample=1e18` would return zero).

**Files renamed:**
- `packages/demo/contracts/script/DeployMorphoMarket.s.sol` → `DeployMorphoLendMarket.s.sol`. Update `deploy-demo.sh` references.

**Files updated:**
- `packages/demo/contracts/script/deploy-demo.sh` — add step 2b between existing steps 2 and 3: `forge script DeployMorphoBorrowMarket ... DEMO_OP_ADDRESS=$OP_ADDR DEMO_VAULT_ADDRESS=$VAULT_ADDR`; parse `BorrowOracle:`, `BorrowMarketId:` prefixes; persist to `state/deployments.json` under `morpho.borrowOracle`, `morpho.borrowMarketId`.
- Idempotency: each step reads `state/deployments.json` first; if the expected output keys already exist, skip the forge run. Implementation follows existing `read_state`/`write_state` helpers at `deploy-demo.sh:35-54`.

**Deliverables:**
- Fresh `deploy-demo.sh` run succeeds on a clean baseSepolia fork.
- Partial-failure rerun (simulated by deleting only the borrow-related state keys) resumes cleanly.
- Gas snapshot of `createMarket` + `supply` recorded in `test/snapshots/`.

#### Phase 3: SDK BorrowProvider

**Files created:**
- `packages/sdk/src/borrow/core/BorrowProvider.ts` — abstract class; public methods `openPosition`, `closePosition`, `getQuote`, `getMarket`, `getMarkets`, `getPosition`, `getPositions`; protected abstract methods `_openPosition`, `_closePosition`, `_getQuote`, `_getMarket`, `_getMarkets`, `_getPosition`, `_getPositions`; shared validation, amount conversion (human → wei), approval building, calldata verification.
- `packages/sdk/src/borrow/providers/morpho/MorphoBorrowProvider.ts` — concrete provider. Uses `blueAbi` + `encodeFunctionData` directly (no `BlueAction` helper exists in `@morpho-org/blue-sdk-viem`). Implements:
  - `_openPosition` — builds `supplyCollateral` + `borrow` calls as a single userOp-batch (Privy smart wallet EIP-4337 batching), or a multicall via Morpho's bundler if configured. Default: two-call batch via `wallet.sendBatch([approval, supplyCollateral, borrow])`.
  - `_closePosition` — `{ mode: 'full' }` builds `repay(0, borrowShares, ...)` + `withdrawCollateral(all)`; `{ mode: 'partial', assets }` builds `repay(assets, 0, ...)` only (no withdraw unless caller requests).
  - `_getQuote` — calls `Market.fetch`, `AccrualPosition.fetch`, computes max-borrow / required-collateral, builds calldata, returns `BorrowQuote` with captured block tag.
  - `_getPosition` / `_getPositions` — returns `{ collateral, debt, healthFactor, liquidationPrice, ltv, borrowAssets, borrowShares }` from `AccrualPosition`.
- `packages/sdk/src/borrow/providers/morpho/sdk.ts` — Morpho-specific read helpers (parallel to `lend/providers/morpho/sdk.ts`); borrow APY via `Market.getBorrowApy()`.
- `packages/sdk/src/types/borrow/base.ts` — `BorrowMarketConfig`, `BorrowMarketId = bytes32`, `BorrowMarketPosition`, `BorrowQuote`, `BorrowQuoteParams`, `BorrowOpenPositionParams`, `BorrowClosePositionParams`, `BorrowProviderConfig<T>`, `BorrowSettings`.
- `packages/sdk/src/types/borrow/morpho.ts` — `MorphoBorrowProviderContext`, `MorphoQuoteExecution`.
- `packages/sdk/src/constants/providers.ts` — add `MORPHO_BORROW = 'morpho'` (reuse existing `MORPHO` const; disambiguated by config key).
- `packages/sdk/src/borrow/__tests__/BorrowProvider.test.ts` — subclass-to-expose-protected pattern from `LendProvider.test.ts:10-18`.
- `packages/sdk/src/borrow/providers/morpho/__tests__/MorphoBorrowProvider.test.ts` — covers success paths + each calldata-validation failure.
- `packages/sdk/src/borrow/__mocks__/MockBorrowProvider.ts` — modeled on `MockLendProvider`.

**Important correctness fixes during Phase 3:**
- `MorphoLendProvider._getPosition` hard-codes `formatUnits(balance, 6)` at line 209. **Fix at the same time:** use `asset.metadata.decimals`. Avoids replicating the bug in `MorphoBorrowProvider`.

**Deliverables:**
- 100% unit test coverage on `BorrowProvider` validation paths.
- Network-project integration test against baseSepolia deployment covering open / quote / full-close / partial-repay.
- Fixture HF tests at 1.0 / 1.0001 / 0.9999 boundaries.

#### Phase 4: Namespaces & wiring

**Files created:**
- `packages/sdk/src/borrow/namespaces/BaseBorrowNamespace.ts`
- `packages/sdk/src/borrow/namespaces/ActionsBorrowNamespace.ts`
- `packages/sdk/src/borrow/namespaces/WalletBorrowNamespace.ts`

**Files updated:**
- `packages/sdk/src/actions.ts` — add `_borrow`, `_borrowProviders` fields (parallel to `_lend`, `_swap`, `_swapProviders` at lines 50-53); wire `MorphoBorrowProvider` from `config.borrow.morpho` in constructor (parallel to lines 79-93); `borrow` getter that throws if not configured (parallel to `lend` getter at 128-135).
- `packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts` — add optional `borrow?: WalletBorrowNamespace` field (lines 23-30); wire in constructor if any borrow provider present (parallel to 71-80).
- `packages/sdk/src/types/actions.ts` — add `BorrowConfig` (parallel to `LendConfig` / `SwapConfig`); add `borrow?: BorrowConfig` to `ActionsConfig` at lines 98-112. `BorrowConfig` follows the **SwapConfig pattern** (with `.settings`), not LendConfig (which has no settings) — borrow needs `maxBorrowSafetyBuffer`, `quoteExpirationSeconds`, `maxQuoteAgeBlocks`.
- `packages/sdk/src/types/providers.ts` — add `BorrowProviders = { morpho?: MorphoBorrowProvider }` with extension path for future Aave.

**Deliverables:**
- Single-line `actions.borrow.openPosition(...)` works end-to-end.
- `wallet.borrow` is `undefined` when config lacks borrow providers (no throw on read, throw on access, matching `wallet.lend` behaviour).

#### Phase 5: Backend

**Files created:**
- `packages/demo/backend/src/controllers/borrow.ts` — endpoints: `GET /borrow/markets`, `POST /borrow/quote`, `POST /borrow/execute`, `POST /borrow/repay`, `GET /borrow/positions`. Zod body/query schemas. `requireAuth` for all except `/markets`.
- `packages/demo/backend/src/services/borrow.ts` — `getBorrowMarkets`, `getBorrowQuote`, `executeBorrow` (openPosition), `executeRepay` (closePosition), `getBorrowPositions`. Shared `executeBorrowPosition(params, 'open' | 'close')` helper mirrors `lend.ts:28-71`.
- `packages/demo/backend/src/controllers/borrow.test.ts`

**Files updated:**
- `packages/demo/backend/src/router.ts` — add 5 routes under `/borrow/*`.
- `packages/demo/backend/src/services/wallet.ts` — add `requireWalletBorrow` guard (parallel to lend guard at lines 66-68).

**Endpoint naming decision:** the brainstorm lists `/borrow/execute` and `/borrow/repay`; Lend currently uses `/lend/position/open` and `/lend/position/close`. **Adopt the brainstorm naming** (`/execute` + `/repay`) because `/repay` is the idiomatic verb for the closing half of a borrow and Swap already uses `/execute`. Leave `/lend/*` untouched to avoid API churn; file a separate issue to consider harmonising in a future release.

**Deliverables:**
- All 5 endpoints covered by controller + service tests.
- Curl smoke test scripts in `packages/demo/backend/scripts/` matching existing `lend-*.sh` pattern.

#### Phase 6: Frontend Borrow tab

**Files created:**
- `packages/demo/frontend/src/components/earn/BorrowTab.tsx` — top-level tab, composes `MarketSelector` + `BorrowAction` + `BorrowPositionSummary`.
- `packages/demo/frontend/src/components/earn/BorrowAction.tsx` — mode toggle (`borrow`/`repay`), `AmountInput`, HF-before-after preview, CTA.
- `packages/demo/frontend/src/components/earn/HealthFactorDisplay.tsx` — colored decimal (`1.45`, not `1.45x`); thresholds green > 1.5, amber 1.1–1.5, red < 1.1; optional "before → after" arrow variant for the action card.
- `packages/demo/frontend/src/components/earn/LiquidationPriceDisplay.tsx` — USD value shown alongside HF (Morpho/Compound pattern — the research named this as the #1 "nice-to-have" from UX research).
- `packages/demo/frontend/src/components/earn/BorrowPositionSummary.tsx` — collateral value, debt, LTV / LLTV (e.g. `62.4% / 86.0%`), HF, liquidation price, borrow APY, collateral APY (from `useLendProvider`).
- `packages/demo/frontend/src/hooks/useBorrowProvider.ts` — parallel to `useLendProvider`; exposes `getMarkets`, `getQuote`, `openPosition`, `closePosition`, `getPosition`.
- Component spec files.

**Files updated:**
- `packages/demo/frontend/src/components/earn/ActionTabs.tsx` — `ActionType = 'lend' | 'swap' | 'borrow'` (line 4); add `{id: 'borrow', label: 'Borrow'}` to `TABS` (lines 11-14); add `BORROW_ACTIONS` set; generalise `isTabHighlighted` (lines 24-43) to accept three tabs.
- `packages/demo/frontend/src/components/earn/Earn.tsx` — add `{activeTab === 'borrow' && <BorrowTab ... />}` at line 535–555; unhardcode `['lend', 'swap']` at line 131 (`TABS.map(t => t.id)`).
- `packages/demo/frontend/src/components/earn/ModeToggle.tsx` — generalise `mode` prop from `'lend' | 'withdraw'` to a parameter type `TMode extends string`, with labels passed in.
- `packages/demo/frontend/src/components/earn/AmountLabel.tsx` — parameterise `mode` type and label map.
- `packages/demo/frontend/src/hooks/useLendProvider.ts` — `EarnOperations` interface (lines 25-47): add `getBorrowMarkets`, `getBorrowQuote`, `openBorrowPosition`, `closeBorrowPosition`, `getBorrowPosition`.
- `packages/demo/frontend/src/constants/activityLogConfigs.ts` — add entries for `borrow`, `repay`, `getBorrowMarket`, `getBorrowPosition`, `getBorrowQuote`. Each with `description`, `apiMethod` (e.g. `'wallet.borrow.openPosition()'`), `tooltip`.
- `packages/demo/frontend/src/providers/ActivityLogProvider.tsx` — extend `ActivityEntry.type` (line 21) with `'borrow' | 'repay'`; extend `ActivityMetadata` (lines 6-17) with `collateralAmount`, `borrowAmount`, `healthFactor`, `borrowAssetSymbol`, `collateralAssetSymbol`.

**UX specifications (from protocol UX research):**
- HF colouring: green > 1.5, amber 1.1–1.5, red < 1.1. Pulses red below 1.1.
- Max button reserves `maxBorrowSafetyBuffer` headroom (default per config) rather than borrowing to HF=1.0.
- Before/after HF preview updates live as the user types (from Aave/Morpho).
- Position Summary shows `LTV / LLTV` as a single reading (`62.4% / 86.0%`) — Morpho pattern.
- Liquidation Price shown in USD as a first-class field (Morpho/Compound/Fluid pattern).
- Token amount primary (e.g. `100.00 OP`), USD value muted underneath — not side-by-side.
- Empty states:
  - User has no dUSDC → "Lend USDC first to get dUSDC collateral" with button linking to Lend tab.
  - Market liquidity insufficient → CTA disabled, tooltip "Not enough OP available to borrow".
- Confirmation friction: checkbox "I understand this may liquidate" when projected HF < 1.2.

## Alternative Approaches Considered

- **Aave-first borrow provider.** Rejected: demo already has full Morpho lending infrastructure; Aave adds net-new contracts, addresses, ABIs, deploy scripts. Aave will be a second `BorrowProvider` later (see brainstorm §2 "Why Morpho First").
- **Raw USDC collateral** (instead of dUSDC shares). Rejected: Morpho Blue collateral is idle — loses the demo's "yield + borrow" narrative (brainstorm §2 "Why Not Raw USDC").
- **Reverse market (OP collateral → borrow USDC).** Rejected: not needed for demo; one market keeps the UI and deploy surface minimal. Adding later is purely additive.
- **Fixed-price oracle for dUSDC.** Rejected during reconciliation (see brainstorm "Resolved Questions" — oracle is dynamic, tracking vault yield).
- **LLTV 94.5%** (matching the lending market). Rejected during reconciliation for 86% — lending market's 94.5% is between correlated assets; dUSDC↔OP is uncorrelated. 86% is the standard Morpho tier for this shape of market, with ~4.38% liquidation incentive.
- **Unified `MarketId` type across Lend/Borrow.** Rejected: `LendMarketId.address` is a vault contract address, `BorrowMarketConfig` needs full `MarketParams` to derive a `bytes32` market id. Shoehorning into one type loses type safety (brainstorm §5).
- **Separate Borrow repo/package.** Rejected: integration with `Wallet` and `Actions` is tight; a sibling package adds version-skew risk with no architectural benefit.

## System-Wide Impact

### Interaction graph

`Wallet.borrow.openPosition(params)` → `WalletBorrowNamespace.openPosition` → `BorrowProvider.openPosition` (validates chain, asset allowlists, amount → wei, calldata integrity) → `MorphoBorrowProvider._openPosition` (builds `supplyCollateral` + `borrow` calldata; returns `{ approval, transactions: [supplyCollateral, borrow] }`) → `WalletBorrowNamespace.executeTransactionBatch` → `BaseWalletNamespace.executeTransactionBatch` (shared) → `Wallet.sendBatch` → Privy smart-wallet `eth_sendUserOperation` → bundler → Morpho Blue on-chain.

On success, Morpho emits `SupplyCollateral(id, caller, onBehalf, assets)` and `Borrow(id, caller, onBehalf, receiver, assets, shares)`. The frontend captures the receipt, writes an `ActivityEntry{type: 'borrow', metadata: {collateralAmount, borrowAmount, healthFactor}}` to the log provider, which persists to `localStorage`.

### Error & failure propagation

- **Pre-flight** (all thrown synchronously from `BorrowProvider`): `NO_COLLATERAL`, `INSUFFICIENT_LIQUIDITY`, `UNHEALTHY_POSITION`, `QUOTE_STALE`, `APPROVAL_REVOKED`, `CHAIN_MISMATCH`, `MARKET_NOT_CREATED`, `REPAY_EXCEEDS_DEBT`.
- **Calldata integrity** (thrown from `MorphoBorrowProvider` during `executeFromQuote`): `CALLDATA_MISMATCH` with field discriminator.
- **RPC / oracle**: `ORACLE_UNAVAILABLE` (oracle revert bubbled up with context).
- **Execution**: `BATCH_PARTIAL_FAILURE` — the real hard case. Privy smart-wallet batching via ERC-4337 userOps is **atomic** at the userOp level (bundler either includes the whole userOp or doesn't), so `supplyCollateral` + `borrow` in one userOp cannot partially fail. However the separate ERC-20 approval step is a distinct userOp. If approval succeeds but the combined userOp reverts, the user has dangling approval but no position. Acceptable outcome; reconciled on next quote by checking allowance.
- **Session**: `SESSION_EXPIRED` bubbled from Privy — surfaced via toast; action modal returns user to pre-flow state.

### State lifecycle risks

- **Approval leaks.** If user backs out between approval and execute, approval persists on-chain. Fine — next quote detects sufficient allowance and skips approval.
- **Interest-accrual drift.** Between quote and execution, debt accrues ~rate/block. Full repay always uses shares (atomic with current block), so dust is impossible. Partial repay uses assets and may leave dust — intentional (user specified an asset amount).
- **Collateral locked during lend close.** `Lend.closePosition` **must** check whether the caller's dUSDC balance is pledged in Morpho Blue as collateral. If so, backend returns HTTP 409 with `COLLATERAL_LOCKED_AS_BORROW`; frontend shows: "Your dUSDC is pledged as collateral. Repay debt before withdrawing." New guard added in Phase 4's wallet-namespace work.
- **ActivityLog rehydration.** On mount, reconcile localStorage entries against on-chain position state. If a borrow entry exists but `getPosition` returns `{borrowShares: 0n}`, mark entry stale with a single reconciliation toast. Do not auto-delete — preserves audit trail.

### API surface parity

- `Actions.borrow` (read-only SDK surface for dapp devs): `getQuote`, `getMarkets`, `getMarket`, `positions(walletAddress)`, `getMarket`, `rates`.
- `Wallet.borrow` (signing surface): `openPosition`, `closePosition`, `getQuote` (calldata-included), `positions`.
- Backend: `/borrow/{markets,quote,execute,repay,positions}`.
- Frontend: Borrow tab parity with Lend (selector + action + summary + activity log).

### Integration test scenarios

1. **Happy path end-to-end.** Mint USDC → `Lend.openPosition` → wait for vault yield accrual (mock) → `Borrow.getQuote({borrowAmount: 50 OP})` → `Borrow.openPosition(quote)` → assert on-chain balances, position, emitted events → `Borrow.closePosition({mode: 'full'})` → assert collateral reclaimed, debt zero, shares zero (no dust).
2. **Stale quote replay.** Capture quote, advance time by `quoteExpirationSeconds + 1`, call `openPosition(quote)`, expect `QUOTE_STALE`.
3. **Calldata tamper.** Capture quote, mutate `quote.execution.calldata` byte, call `openPosition(quote)`, expect `CALLDATA_MISMATCH` with `field: 'marketId'`.
4. **Oracle yield accrual.** Simulate vault yield → assert `AccrualPosition.collateralValue` increases → assert user's `maxBorrowable` grows without any action.
5. **Lend close while pledged.** Open borrow → call `Lend.closePosition` on the exact dUSDC shares → expect `COLLATERAL_LOCKED_AS_BORROW`.
6. **Full repay dust check.** Open borrow → wait many blocks for interest accrual → full repay via shares → assert `position.borrowShares === 0n`.

## Acceptance Criteria

### Functional

- [ ] `Actions.borrow.getQuote({collateralAmount})` and `Actions.borrow.getQuote({borrowAmount})` produce mutually consistent results (round-trip within 1 wei).
- [ ] `Wallet.borrow.openPosition` accepts either a raw params object or a `BorrowQuote` (discriminator-based).
- [ ] `Wallet.borrow.closePosition({mode: 'full'})` uses `repay(assets=0, shares=position.borrowShares)` path; post-condition `position.borrowShares === 0n`.
- [ ] `Wallet.borrow.closePosition({mode: 'partial', assets})` only repays; does not withdraw collateral unless user passes `withdrawCollateral: true`.
- [ ] `BorrowProvider` validates calldata against `to`, selector, market ID, amount/shares, `onBehalf`, `receiver` — each failure path raises `CalldataMismatchError` with correct `field`.
- [ ] `BorrowProvider` rejects stale quotes (time-based OR block-based) with `QuoteStaleError`.
- [ ] `DynamicVaultOracle.price()` returns non-zero with `baseVaultConversionSample=1e10`; returns zero (or reverts) with `1e18` — covered by regression test.
- [ ] `DeployMorphoBorrowMarket.s.sol` asserts `isLltvEnabled(86%)` before `createMarket`.
- [ ] `deploy-demo.sh` is idempotent: re-running after a completed step is a no-op for that step.
- [ ] Frontend Borrow tab visible on desktop and mobile (`['lend', 'swap', 'borrow']`).
- [ ] Empty state renders when user has 0 dUSDC, with a link to Lend tab.
- [ ] Liquidity-insufficient state disables CTA with explanatory tooltip.
- [ ] HF display transitions colours at 1.1 and 1.5 boundaries; red pulse at < 1.1.
- [ ] Max button reserves `maxBorrowSafetyBuffer` headroom; default buffer `1.0` (no headroom), developer-configurable per brainstorm §3.
- [ ] ActivityLog persists `borrow` and `repay` entries and reconciles against on-chain state on mount.
- [ ] Cross-tab highlight: hovering a Borrow-tab action dims Lend/Swap tabs correctly via `isTabHighlighted`.
- [ ] `Lend.closePosition` on dUSDC that is actively pledged as collateral returns `COLLATERAL_LOCKED_AS_BORROW`.

### Non-functional

- [ ] Build, typecheck, lint pass across all packages.
- [ ] SDK unit test coverage ≥ existing LendProvider coverage for equivalent surface.
- [ ] Oracle fork test covers donation-inflation defence.
- [ ] No regression in existing Lend or Swap namespaces (existing tests green post-refactor).
- [ ] New SDK public API fully JSDoc'd (per CLAUDE.md convention) — classes and public methods carry `@description`, `@param`, `@returns`, `@throws`.
- [ ] No `any` types in borrow code; strict null checks enabled.
- [ ] Borrow tab meets existing Earn page accessibility baseline (keyboard nav, semantic HTML).

### Quality gates

- [ ] All phases reviewed and merged independently.
- [ ] Integration test scenarios (§6 above) pass against baseSepolia deployment.
- [ ] Docker images build cleanly for backend + frontend.

## Success Metrics

- Demo user can complete the full loop (lend USDC → borrow OP → repay → unwind) from a single wallet session without manual intervention.
- SDK types compile for external consumers without downstream changes (monitored by running demo backend + frontend against the published SDK build).
- Time-to-first-borrow ≤ 3 user clicks from Borrow tab entry (select market, enter amount, sign).
- Zero instances of post-full-repay dust across integration tests (hard correctness gate).

## Dependencies & Prerequisites

- **External:** `@morpho-org/blue-sdk-viem` ≥ 3.1.1 (already in `packages/sdk/package.json`), `@morpho-org/blue-sdk` ≥ 4.5.1, `viem` ≥ 2.24.1.
- **Internal:** Phase 1 blocks Phases 3–6; Phase 2 blocks Phase 6 (frontend needs deployed market for dev); Phase 3 blocks Phase 4; Phase 4 blocks Phases 5 and 6.
- **Deployment:** baseSepolia deployment of `DynamicVaultOracle` + borrow market must occur before E2E frontend testing.
- **Governance:** LLTV 86% must be enabled on the target chain's Morpho Blue deployment (`isLltvEnabled(860000000000000000)` returns true). Verified in deploy script.

## Risk Analysis & Mitigation

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Oracle decimals bug (PAXG-class exploit) | Medium | High | Fork tests cover `baseVaultConversionSample` edge cases; code review by someone who's read the PAXG post-mortem; regression test asserts `1e18` sample produces zero price |
| Calldata validator false positives on valid calldata | Low | Medium | Exhaustive unit tests with fuzz inputs; in-repo first use — backport to Swap blocked by #373 until proven stable |
| BaseNamespace refactor breaks existing lend/swap behaviour | Medium | High | Phase 1 has its own review checkpoint; existing tests must pass unchanged; merge separately before Phase 3 |
| Full-repay dust | Low | Medium | Mandatory shares-based full-repay path + dedicated integration test |
| Privy smart-wallet batching doesn't produce atomic userOp | Low | High | Validate assumption against current Privy + smart-wallet SDK docs; fallback to Morpho Bundler multicall if needed |
| LLTV 86% aggressive for uncorrelated dUSDC↔OP | Low | Medium | Demo-only; document explicitly in README; real production would use 62.5–77% |
| Hardcoded OP/USDC price diverges from real markets | N/A | N/A | Demo assumption; disclosed in on-screen "Demo" banner |

## Future Considerations

- **AaveBorrowProvider** — second provider; shares `BaseProvider`, `BaseBorrowNamespace`. Uses Aave v3 `borrow`/`repay` with separate e-mode handling.
- **Real oracle feeds** — when demo graduates to real OP mainnet, replace `DynamicVaultOracle` with `MorphoChainlinkOracleV2` + OP/USDC Chainlink feed.
- **Calldata validator for Swap** — backport via issue #373 once the Morpho validator is battle-tested.
- **Bundler integration** — Morpho Bundler enables single-sig supply+borrow. Revisit after Privy userOp batching is proven.
- **Reverse market** — OP collateral → USDC borrow. Purely additive; no architectural changes.
- **Liquidation UX** — currently out of scope; Morpho Blue liquidations happen externally. Add a "Liquidated" state to ActivityLog in a later release.

## Documentation Plan

- Update `packages/sdk/README.md` with `Actions.borrow` and `Wallet.borrow` API reference.
- Update `packages/demo/README.md` (if present) with borrow flow screenshots.
- Run `pnpm docs` (TypeDoc) on SDK; commit generated docs per existing convention.
- Add a new `docs/guides/borrow-integration.md` showing end-to-end integration with code samples.
- Update root `CLAUDE.md` if any new conventions emerge (expected: none; plan adheres to existing conventions).

## Sources & References

### Origin

- **Brainstorm:** [`docs/brainstorms/2026-04-15-morpho-borrow-provider-brainstorm.md`](../brainstorms/2026-04-15-morpho-borrow-provider-brainstorm.md). Key decisions carried forward: separate `LendMarketId` / `BorrowMarketConfig` types (§5), shared `BaseProvider` + `BaseNamespace` (§6–§7), calldata integrity validation as a novel capability (§4), dynamic oracle reading `vault.convertToAssets()` (resolved questions), LLTV 86% (resolved questions), full Base/Actions/Wallet namespace trio (§7).

### Internal references

- `packages/sdk/src/lend/core/LendProvider.ts` — base class template for `BorrowProvider`.
- `packages/sdk/src/swap/core/SwapProvider.ts:67,131,410` — quote-draft + discriminator patterns to mirror.
- `packages/sdk/src/lend/namespaces/BaseLendNamespace.ts:57-61` — hard-coded `getAllProviders` anti-pattern; replace with `BaseSwapNamespace.ts:195` generic pattern.
- `packages/sdk/src/lend/providers/morpho/MorphoLendProvider.ts:209` — hard-coded `formatUnits(balance, 6)` bug; fix during Phase 3.
- `packages/sdk/src/lend/providers/morpho/contracts.ts` — move to `packages/sdk/src/providers/morpho/contracts.ts`.
- `packages/demo/contracts/script/DeployMorphoMarket.s.sol` — template for `DeployMorphoBorrowMarket.s.sol`; rename to `DeployMorphoLendMarket.s.sol`.
- `packages/demo/contracts/src/FixedPriceOracle.sol` — reference for oracle scaling formula.
- `packages/demo/contracts/script/deploy-demo.sh` — orchestration hooks for new step 2b.
- `packages/demo/frontend/src/components/earn/{Earn,ActionTabs,Action,ModeToggle,AmountLabel}.tsx` — components to generalise.
- `packages/demo/frontend/src/providers/ActivityLogProvider.tsx` — extend for borrow action types.
- `docs/specs/aave-borrow-provider.md`, `docs/specs/borrow-provider-detailed.md`, `docs/specs/borrow-provider-summary.md` — earlier draft specs; cross-reference for historical context but brainstorm supersedes.

### External references

- [Morpho Blue IMorpho interface](https://github.com/morpho-org/morpho-blue/blob/main/src/interfaces/IMorpho.sol)
- [Morpho Blue IOracle interface](https://github.com/morpho-org/morpho-blue/blob/main/src/interfaces/IOracle.sol)
- [MorphoChainlinkOracleV2](https://github.com/morpho-org/morpho-blue-oracles/blob/main/src/morpho-chainlink/MorphoChainlinkOracleV2.sol)
- [Morpho Blue SharesMathLib](https://github.com/morpho-org/morpho-blue/blob/main/src/libraries/SharesMathLib.sol)
- [blue-sdk-viem abis](https://github.com/morpho-org/sdks/blob/main/packages/blue-sdk-viem/src/abis.ts)
- [blue-sdk AccrualPosition](https://github.com/morpho-org/sdks/blob/main/packages/blue-sdk/src/position/AccrualPosition.ts)
- [viem encodeFunctionData](https://github.com/wevm/viem/blob/main/site/pages/docs/contract/encodeFunctionData.md)
- [viem decodeFunctionData](https://github.com/wevm/viem/blob/main/site/pages/docs/contract/decodeFunctionData.md)
- [Morpho LTV concepts](https://docs.morpho.org/build/borrow/concepts/ltv)
- [Morpho liquidation mechanics](https://docs.morpho.org/learn/concepts/liquidation/)
- [PAXG/USDC oracle exploit post-mortem](https://medium.com/coinmonks/decoding-morphoblues-230k-exploit-6296565ced40) — decimals class of bug
- [Aave v3 borrow UX reference](https://aave.com/help/borrowing/borrow-tokens)
- [Morpho app borrow UX reference](https://docs.morpho.org/build/borrow/get-started)
- [Compound v3 collateral & borrowing docs](https://docs.compound.finance/collateral-and-borrowing/)
- [Fluid docs](https://docs.fluid.instadapp.io/)

### Related work

- Issue ethereum-optimism/actions#331 — `includeCalldata` flag for Swap quotes (pattern mirrored for Borrow).
- Issue ethereum-optimism/actions#373 — backport calldata validation to `SwapProvider`.

## User-facing error taxonomy

| Code | Message | Origin |
|---|---|---|
| `NO_COLLATERAL` | "Lend USDC first to get dUSDC collateral." | Frontend empty state |
| `INSUFFICIENT_LIQUIDITY` | "Not enough OP available to borrow. Try a smaller amount." | SDK pre-check |
| `UNHEALTHY_POSITION` | "This borrow would put your health factor below 1.0. Reduce borrow amount or add collateral." | SDK validation |
| `QUOTE_STALE` | "Prices changed. Refresh your quote." | SDK calldata check |
| `CALLDATA_MISMATCH` | "Transaction integrity check failed. Please retry." | SDK calldata validator |
| `ORACLE_UNAVAILABLE` | "Cannot price collateral right now. Try again in a moment." | Oracle revert caught |
| `APPROVAL_REVOKED` | "Approval was removed. Please re-approve dUSDC." | Pre-flight allowance check |
| `COLLATERAL_LOCKED_AS_BORROW` | "Your dUSDC is pledged as collateral. Repay debt before withdrawing." | Lend.closePosition guard |
| `BATCH_PARTIAL_FAILURE` | "Collateral supplied, but borrow failed. Review your position or contact support." | Post-tx reconciliation (expected unreachable under ERC-4337) |
| `SESSION_EXPIRED` | "Session expired. Please reconnect your wallet." | Privy error bubble |
| `CHAIN_MISMATCH` | "Switch to Base Sepolia to continue." | Chain guard |
| `LLTV_NOT_ENABLED` | (deploy-only) "LLTV 86% not enabled on Morpho Blue." | Forge script |
| `MARKET_NOT_CREATED` | "This market isn't deployed yet." | SDK market lookup |
| `REPAY_EXCEEDS_DEBT` | "Repay amount exceeds outstanding debt. Using max." | SDK clamp + toast |
