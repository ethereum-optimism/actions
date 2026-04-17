# MorphoBorrowProvider + Demo Borrow Tab Brainstorm

**Date:** 2026-04-15
**Status:** Draft
**Branch:** kevin/borrow-spec

---

## What We're Building

Add borrowing support to the Actions SDK, starting with a MorphoBorrowProvider for Morpho Blue, and a Borrow tab in the demo frontend. The design prioritizes separation of concerns, DRY patterns, and a symmetrical API with the existing LendProvider.

### Demo User Flow

1. User deposits USDC into MetaMorpho vault via `Lend.openPosition()` -- receives dUSDC vault shares, earns yield
2. User calls `Borrow.getQuote()` to see how much OP they can borrow against their dUSDC
3. User calls `Borrow.openPosition()` -- SDK internally approves + supplies dUSDC as collateral to Morpho Blue + borrows OP
4. User calls `Borrow.closePosition()` -- repays OP debt + withdraws dUSDC collateral
5. User calls `Lend.closePosition()` -- redeems dUSDC for USDC from vault

### Key Insight: Yield-Bearing Collateral

The borrow market uses **dUSDC (vault shares) as collateral**, not raw USDC. This means:
- dUSDC appreciates in value as the vault earns yield
- Users earn yield on their collateral while borrowing against it
- This is the same pattern used in production Morpho Blue markets (wstETH, sDAI, etc.)

---

## Why This Approach

### Morpho Blue Market Design

A single new Morpho Blue market:
- **loanToken:** OP_DEMO (what users borrow)
- **collateralToken:** dUSDC (MetaMorpho vault shares -- yield-bearing)
- **oracle:** New dynamic oracle that calls `vault.convertToAssets()` to price dUSDC in terms of OP (tracks accrued vault yield)
- **irm:** Same adaptive curve IRM used by the lending market
- **lltv:** 86% (conservative Morpho standard tier -- gives a health-factor buffer for yield-bearing collateral)

No reverse market (OP collateral -> borrow USDC) is needed for the demo.

### Why Not Raw USDC Collateral

Morpho Blue collateral is idle -- it doesn't earn yield. By using dUSDC (vault shares) as collateral, users get yield + borrowing from the same capital. This creates a compelling demo narrative and mirrors real DeFi patterns.

### Why Morpho First (Not Aave)

While Aave's `supply()` natively enables yield + collateral on the same deposit, the demo already has a full Morpho lending deployment. Building Morpho borrow leverages existing infrastructure (contracts, deployment scripts, SDK Morpho code). Aave borrow follows as a second provider.

---

## Key Decisions

### 1. BorrowProvider API -- Symmetrical with LendProvider

**Public methods on BorrowProvider base class:**
- `openPosition(params)` -- supply collateral + borrow in one call
- `closePosition(params)` -- repay debt + withdraw collateral
- `getQuote(params)` -- bidirectional quoting (see below)
- `getMarket(params)` / `getMarkets(params)` -- market info
- `getPositions(params)` -- user's borrow positions (debt, collateral, health factor)

**Protected abstract methods (implemented by MorphoBorrowProvider, eventually AaveBorrowProvider):**
- `_openPosition()`, `_closePosition()`, `_getQuote()`, `_getMarket()`, `_getMarkets()`, `_getPositions()`

**Base class handles:** validation (chain support, allowlists, health factor, LTV caps), amount conversion (human-readable to wei), approval building, calldata integrity verification.

**MorphoBorrowProvider handles:** Morpho Blue contract calls (`supplyCollateral`, `borrow`, `repay`, `withdrawCollateral`), market params resolution, rate/position queries.

### 2. getQuote -- Bidirectional, Inspired by SwapProvider

`Borrow.getQuote()` accepts either direction:
- **Collateral amount in:** "I have 100 dUSDC, how much OP can I borrow?" -- returns max borrow amount
- **Borrow amount in:** "I want 50 OP, how much dUSDC collateral do I need?" -- returns required collateral

The quote object is a mutable draft:
- Contains both amounts, rates, health factor projections, market context
- User can adjust `borrowAmount` before passing to `openPosition()`
- Supports `includeCalldata` flag (mirrors issue #331 for SwapProvider):
  - `ActionsBorrowNamespace.getQuote()` defaults to `includeCalldata: false` (read-only, display data)
  - `WalletBorrowNamespace.getQuote()` defaults to `includeCalldata: true` (execution-ready)

### 3. openPosition -- Exact Amounts Required

`Borrow.openPosition()` accepts either:
- **A quote object** -- passes it directly, SDK validates and executes
- **Raw params** -- must specify exact `borrowAmount` (how much to borrow), not collateral amount

This differs from `getQuote` which accepts either direction. At execution time, the user must be explicit about what they want to borrow -- no SDK guessing.

### 4. Calldata Integrity Validation

BorrowProvider validates calldata when executing from a quote:
- Verify `to` address matches known Morpho Blue contract for the chain
- Decode calldata via `decodeFunctionData` and verify params match quote's amounts, market params, recipient
- Verify MarketParams hash matches expected market ID
- Verify function selectors are expected (`supplyCollateral`, `borrow`)

This is a security improvement over SwapProvider, which currently trusts calldata blobs. Issue ethereum-optimism/actions#373 tracks adding equivalent validation to SwapProvider.

### 5. Separate Types -- No Shared MarketId

`LendMarketId` and `BorrowMarketId` are independent types:
- **LendMarketId:** `{ address: Address, chainId }` -- address is the vault contract
- **BorrowMarketConfig:** `{ collateralAsset: Asset, borrowAsset: Asset, chainId, name, borrowProvider }` -- the SDK hashes MarketParams internally, callers never touch bytes32 market IDs

Shared generic types extracted to `types/common/`:
- `FilterAssetChain` -- `{ asset?, chainId? }`
- `TransactionOptions` -- deadline, gas overrides (renamed from `LendOptions`)
- `MarketProviderConfig<TMarketConfig>` -- generic allowlist/blocklist pattern

### 6. Shared BaseProvider Abstract Class

Extract common logic from LendProvider, SwapProvider, BorrowProvider into `BaseProvider<TConfig>`:
- `chainManager: ChainManager`
- `supportedChainIds()` -- intersection of protocol, SDK, and developer chains
- `protocolSupportedChainIds()` -- abstract, declared by each provider
- `buildApprovalTx()` -- ERC20 approval building
- `isChainSupported()` -- convenience check

LendProvider, SwapProvider, BorrowProvider all extend BaseProvider.

### 7. Full Namespace Abstraction

Refactor the namespace layer to be generic, reducing duplication across Lend/Swap/Borrow:

**Shared base abstractions:**
- `BaseNamespace<TProviders, TProvider>` -- `getAllProviders()`, `supportedChainIds()`, generic market fan-out
- Shared `executeTransactionBatch()` logic in wallet namespaces
- Generic registry pattern for provider/namespace wiring in `Wallet.ts` and `Actions.ts`

**Borrow gets full three namespaces:**
- `BaseBorrowNamespace` -- multi-provider aggregation, read operations
- `ActionsBorrowNamespace` -- read-only (`getQuote`, `getMarkets`, `positions(walletAddress)`, `rates`)
- `WalletBorrowNamespace` -- signing (`openPosition`, `closePosition`, `getQuote`, `positions`)

### 8. Shared Morpho Code Directory

Extract Morpho-specific code shared between lend and borrow:

```
packages/sdk/src/
  providers/
    morpho/
      contracts.ts    (MORPHO_BLUE address, IRM per chain, registry)
      abis.ts         (blueAbi, metaMorphoAbi, adaptiveCurveIrmAbi)
      types.ts        (MorphoContracts, MarketParams, MorphoContractsRegistry)
  lend/
    providers/morpho/
      MorphoLendProvider.ts  (vault-specific: deposit, withdraw, vault queries)
      sdk.ts                 (vault data fetching, APY calculation)
  borrow/
    providers/morpho/
      MorphoBorrowProvider.ts (borrow-specific: supplyCollateral, borrow, repay)
      sdk.ts                  (position queries, rate calculation, health factor)
```

### 9. Demo Deployment -- Separate Solidity Files

- Rename `DeployMorphoMarket.s.sol` to `DeployMorphoLendMarket.s.sol`
- New `DeployMorphoBorrowMarket.s.sol`:
  - Takes vault address (dUSDC) and OP address via env vars
  - Deploys new dynamic oracle for dUSDC:OP pricing (reads `vault.convertToAssets()`)
  - Creates Morpho Blue market (loanToken=OP, collateralToken=dUSDC)
  - Mints OP and supplies directly to Morpho Blue as loanable liquidity
- `deploy-demo.sh` updated to call both scripts sequentially, passing addresses between steps

### 10. Demo Frontend -- Borrow Tab

**Tab structure:**
- Add "Borrow" to `ActionTabs` (`ActionType = 'lend' | 'swap' | 'borrow'`)
- New `BorrowTab` component in `Earn.tsx` following `LendTab` pattern

**Market selector:**
- Reuse `MarketSelector` and `Dropdown` components
- Filter to only show borrow markets where user holds the collateral token (dUSDC)
- Empty state: "Lend USDC first to get dUSDC collateral" pointing to Lend tab

**Action card:**
- Reuse `ModeToggle` component with "Borrow" / "Repay" labels
- Reuse `AmountInput`, `AmountLabel`, `CtaButton` components
- Borrow mode: show collateral balance, borrow amount input, health factor indicator
- Repay mode: show debt balance, repay amount input, remaining debt
- Health factor color coding: green (>1.5), yellow (1.1-1.5), red (<1.1)

**Components to reuse directly:** MarketSelector, Dropdown, ModeToggle, AmountInput, AmountLabel, CtaButton, TransactionModal, Toast

**New components needed:** Health factor display, collateral/debt position summary

---

## Resolved Questions

- **Market direction:** Single market only: dUSDC collateral -> borrow OP. No reverse market needed.
- **Collateral source:** dUSDC vault shares used as yield-bearing collateral. Users earn yield while borrowing.
- **Oracle pricing for dUSDC:** Dynamic oracle that calls `vault.convertToAssets()` to read real dUSDC value. Tracks accrued vault yield so collateral value grows with the vault.
- **LLTV for borrow market:** 86% -- conservative Morpho standard tier, gives a health-factor buffer suited to yield-bearing collateral and a dynamic oracle.
- **Max borrow safety buffer:** Configurable via cascading defaults: provider config -> BorrowConfig.settings. No hardcoded SDK default -- defaults to 100% (no buffer). Developers opt in to a safety margin if they want one.
- **Deployment approach:** Separate .sol files (DeployMorphoLendMarket, DeployMorphoBorrowMarket), bash script orchestrates.
- **Namespace pattern:** Full three namespaces (Base, Actions, Wallet) with generic shared abstractions.
- **Type sharing:** Separate LendMarketId and BorrowMarketConfig types. SDK hashes MarketParams internally.
- **Provider inheritance:** Shared BaseProvider abstract class for all three provider types.
- **Calldata validation:** BorrowProvider validates calldata integrity from day one. Issue #373 tracks backporting to SwapProvider.
- **Backend API endpoints:** Full parity with lend -- `/borrow/execute`, `/borrow/repay`, `/borrow/positions`, `/borrow/markets`, `/borrow/quote`.
- **Activity log integration:** Add 'borrow' and 'repay' action types to ActivityLog. Update ActivityHighlightContext to highlight borrow tab on hover.
- **Frontend approach:** Borrow tab reuses existing components, filters markets to those with collateral, Borrow/Repay toggle.
