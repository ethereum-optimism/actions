---
title: "feat: SDK borrow provider (Morpho + abstract base)"
type: feat
status: active
date: 2026-05-11
origin: docs/brainstorms/2026-05-08-borrow-pr3-sdk-borrow-provider-brainstorm.md
---

# feat: SDK borrow provider (Morpho + abstract base)

## Enhancement Summary

**Deepened on:** 2026-05-11
**Sources:** 11 parallel review/research agents (architecture, simplicity, performance, pattern, security, TS, best-practices, framework-docs, repo-research, git-history, sharp-edges, document-review).

### Material corrections applied

1. **`@morpho-org/blue-sdk-viem` exposes Morpho Blue helpers.** v2.0.2 ships `AccrualPosition.fetch`, `Market.fetch`, `MarketParams`. **Read side delegates fully to the SDK** (HF, accrued debt, isHealthy, liquidationPrice, ltv). Only write-side calldata (`supplyCollateral`, `borrow`, `repay`, `withdrawCollateral`) needs hand-rolled `viem.encodeFunctionData` against `IMorpho` ABI. Phase 2.1 narrows accordingly.
2. **`MarketParams` source.** Locked to option A: persisted in `deployments.json` and surfaced on `BorrowMarketConfig`. **Phase 4 is gated on a PR #2 follow-up** that extends `deployments.json` to write `morpho.borrow.marketParams: { loanToken, collateralToken, oracle, irm, lltv }`. Hardcoded fixture path is dropped.
3. **Recipient defaulting moves to namespace.** Per swap precedent, the abstract base requires a resolved recipient; the wallet namespace binds it to `wallet.address`. Base does not own this.
4. **`QUOTE_DISCRIMINATOR` promoted to shared.** Move from `swap/core/SwapProvider.ts:70` to `actions/shared/quoteDiscriminator.ts` in PR #3 to avoid borrow→swap coupling. Same commit refactors swap's import.
5. **`QuoteExpiredError` reused.** Already exists at `packages/sdk/src/core/error/errors.ts:148`; do not redefine.

### New constraints / defaults

- All `_getPosition` reads via `publicClient.multicall` (1 RTT). Same for `_getMarket`. Acceptance criterion added.
- `BorrowSettings.quoteExpirationSeconds` default = **30** (not swap's 60). Two oracles drift on borrow.
- `BorrowSettings.approvalMode` default = **`'exact'`** (not `'max'`). Borrow is high-stakes; require opt-in to infinite allowance.
- `BorrowMarketPosition.healthFactor: number | null` (`null` when no debt — JSON-safe, replaces `Infinity`).
- `BorrowMarketPosition.ltv` and `maxLtv` are **required**, not optional.
- `MorphoBorrowProvider` constructor calls `verifyMorphoMarketId(config.marketId, config.marketParams)` synchronously and throws `BorrowMarketParamsMismatchError` on mismatch.
- Drop runtime `idToMarketParams` calls; verification at construction only.

### Security additions (must-bake)

- HF math: use `10n ** 36n` not `1e36`. Order multiplies/divides to minimize intermediates. Round-up on `borrowShares → borrowAssets` (`toAssetsUp`).
- `requireQuoteForThisWallet` also asserts `quote.marketId.chainId === params.market.chainId` and `quote.marketId.marketId === params.market.marketId`.
- For `borrowAmount: 'max'`: re-fetch `position.borrowShares` at **bundle-build time** (immediately before `executeTransactionBatch`), not at quote time. Document in JSDoc.
- Amount validation rules: reject `NaN`, `Infinity`, negative, sub-decimal precision exceeding asset decimals.
- `MorphoMarketParams` consumers destructure by name, never by tuple position.

### YAGNI cuts

- Drop `BorrowFees.originationFee?` from PR #3 types. Forward-looking only; re-add when Liquity ships.
- Drop Phase 2.4 (re-export of `MorphoMarketParams` through `shared/morpho/types.ts`). Define once in `types/borrow/base.ts`; import directly.

### Open items — resolved 2026-05-11

1. **`safeCeilingLtv` naming — KEEP.** Field stays `safeCeilingLtv` per
   brainstorm Decision 7. Non-enforcement documented in JSDoc; consumers
   that need to gate explicitly check `positionAfter.ltv > safeCeilingLtv`.
2. **`Amount` type names — SHORTER.** Rename `AmountExact` → `Amount` and
   `AmountWithMax` → `AmountOrMax`. All Phase 1.1 + downstream references
   use the shorter names.
3. **`AccrualPosition` adoption — LOCKED: full delegation.** Read-side
   uses `@morpho-org/blue-sdk-viem`'s `AccrualPosition.fetch` plus a thin
   adapter to `BorrowMarketPosition`. Manual math is removed from the
   plan. If any individual field is missing from the SDK return shape
   (discovered during Phase 4.2), we file a per-field one-shot read,
   **not** a full math reimplementation.

---

## Overview

The third sub-PR in the borrow track, scoped to `packages/sdk/`. Ships the
SDK's `borrow` namespace on top of the on-chain pieces PR #2 already shipped:
abstract `BorrowProvider` base, `MorphoBorrowProvider` concrete implementation
for the dUSDC-collateral / OP-loan market, five action primitives
(`openPosition`, `closePosition`, `depositCollateral`, `withdrawCollateral`,
`repay`), quote/commit pattern mirroring swap, and a `MockBorrowProvider` for
downstream PR #4 backend tests. No backend, no frontend, no contracts.

All design decisions are locked in the brainstorm. This plan translates them
into file-level work units in dependency order so implementation can proceed
as small, individually shippable commits.

## Problem Statement

The Actions SDK exposes `lend` (vault deposits for yield) and `swap` (token
exchange). It does not yet expose `borrow`. PR #2 deployed an on-chain Morpho
Blue market (dUSDC collateral, OP loan); without a TypeScript surface,
downstream consumers (PR #4 backend, PR #5 frontend) cannot integrate it.

The original 911-line plan at
`docs/plans/2026-04-16-feat-morpho-borrow-provider-plan.md` (on
`origin/kevin/borrow-spec`) predates PR #1 (#383) and PR #2 (#389) and is
treated as directional input. The brainstorm (see brainstorm:
`docs/brainstorms/2026-05-08-borrow-pr3-sdk-borrow-provider-brainstorm.md`)
resolved seven decisions that supersede or refine that plan:

1. Optional collateral on `borrow.openPosition` (not in lend namespace).
2. Five primitives: open, close, depositCollateral, withdrawCollateral, repay.
3. `amount` XOR `amountRaw` discriminated union (#379) from day one.
4. `BorrowMarketPosition` field set (HF, liquidationPrice, borrowApy, etc.).
5. `computeMorphoMarketId` as standalone helper (no provider method).
6. Quote/commit pattern mirrors swap (BorrowQuote, BorrowPrice, BorrowFees).
7. Health buffer config (`healthBufferPct` on settings + per-market override).

## Proposed Solution

Mirror lend's directory and class layout exactly. Mirror swap's quote/commit
pattern exactly. Reuse `executeTransactionBatch` (already references
`WalletBorrowNamespace` in its docstring at
`packages/sdk/src/wallet/core/utils/executeTransactionBatch.ts:13`). Extract
two shared helpers from the existing `MorphoLendProvider` (decimals
resolution) and add one new shared helper (`marketParams.ts`) that ships the
`computeMorphoMarketId` and `verifyMorphoMarketId` pure functions.

### Implementation note: Morpho Blue calldata + SDK use

**Read side:** `@morpho-org/blue-sdk-viem` v2.0.2 exposes `AccrualPosition.fetch`,
`Market.fetch`, and `MarketParams` against Morpho Blue directly (in addition to
the vault-only `MetaMorphoAction.{deposit,withdraw}`). Provider `_getPosition`,
`_getMarket`, and HF math delegate fully to the SDK. Per-field gaps surface
during Phase 4.2 as one-shot reads, not as math reimplementations.

**Write side:** the SDK does **not** ship helpers for `supplyCollateral`,
`borrow`, `repay`, `withdrawCollateral` calldata. `MorphoBorrowProvider`
encodes these via `viem.encodeFunctionData` against an `IMorpho` ABI shipped
at `packages/sdk/src/actions/shared/morpho/abi.ts`. The Solidity counterpart
at `packages/demo/contracts/src/interfaces/IMorpho.sol` is the reference
shape.

### Plan-level decision: MarketParams in config (locked, option A)

PR #2's `deployments.json` schema persists `morpho.borrow.marketId` (bytes32)
but **not** the underlying `MarketParams` (loanToken, collateralToken,
oracle, irm, lltv). Every Morpho Blue calldata for supplyCollateral / borrow
/ repay / withdrawCollateral requires the full `MarketParams` struct.

**Decision (refining brainstorm Decision 5):** the Morpho variant of
`BorrowMarketConfig` carries the full `MarketParams` struct alongside the
bytes32 `marketId`. **PR #3 is gated on a PR #2 follow-up** that extends
`deployments.json` to write `morpho.borrow.marketParams`. The hardcoded
fixture fallback is dropped — ship one path, not two.

**Primary rationale:** enables config-time `verifyMorphoMarketId` sanity
check that surfaces misconfigured deployments synchronously at provider
construction. (The "avoids RPC" argument is secondary — `idToMarketParams`
is a one-shot static read; the verifiability win is what matters.)

`computeMorphoMarketId(MarketParams)` (brainstorm Decision 5) is the
verification helper. `MorphoBorrowProvider` constructor calls it with the
configured params and throws `BorrowMarketParamsMismatchError` on mismatch.
This is the **only** place `idToMarketParams` would be needed (for sanity
verification), and the helper makes the RPC unnecessary.

## Architecture

### File layout (mirrors lend / swap)

```
packages/sdk/src/
├── actions/
│   ├── borrow/                                       # NEW
│   │   ├── core/
│   │   │   └── BorrowProvider.ts                     # abstract base (~450 LOC)
│   │   ├── namespaces/
│   │   │   ├── ActionsBorrowNamespace.ts             # read-only thin re-export (~10 LOC)
│   │   │   ├── BaseBorrowNamespace.ts                # provider selection + quote routing (~250 LOC)
│   │   │   └── WalletBorrowNamespace.ts              # wallet methods (~200 LOC)
│   │   ├── providers/morpho/
│   │   │   ├── MorphoBorrowProvider.ts               # concrete impl (~350 LOC)
│   │   │   └── __mocks__/mockMorphoBorrowMarket.ts   # fixtures
│   │   ├── utils/markets.ts                          # findMarketInAllowlist analog (~60 LOC)
│   │   ├── __mocks__/MockBorrowProvider.ts           # for PR #4 (~400 LOC)
│   │   └── index.ts                                  # re-exports
│   └── shared/morpho/                                # existing (PR #1)
│       ├── contracts.ts                              # existing — no change
│       ├── types.ts                                  # existing — extend
│       ├── abi.ts                                    # NEW — IMorpho ABI
│       ├── marketParams.ts                           # NEW — compute / verify marketId
│       └── decimals.ts                               # NEW — lift from MorphoLendProvider
└── types/
    ├── borrow/                                        # NEW
    │   ├── base.ts                                    # types (~400 LOC)
    │   └── index.ts                                   # re-exports
    ├── actions.ts                                     # add BorrowConfig, BorrowSettings, BorrowProviders thread
    └── providers.ts                                   # add BorrowProviders { morpho? }
```

`MorphoLendProvider` stays vault-only and untouched, except for a mechanical
extraction of `resolveUnderlyingDecimals` to `shared/morpho/decimals.ts`
(behavior preserved, lend code updated to import from the new location).

### Class hierarchy

```
BorrowProvider<Config>                      [abstract]
  protected _openPosition(...)              [abstract]
  protected _closePosition(...)             [abstract]
  protected _depositCollateral(...)         [abstract]
  protected _withdrawCollateral(...)        [abstract]
  protected _repay(...)                     [abstract]
  protected _getPosition(...)               [abstract]
  protected _getMarket(...)                 [abstract]
  protected _getMarkets(...)                [abstract]
  protected _getQuote(...)                  [abstract]
  protected _getPrice(...)                  [abstract]

  public openPosition(params)               # builds bundle [approve?, supply?, borrow]
  public closePosition(params)              # builds bundle [repay, withdraw?]
  public depositCollateral(params)          # [approve?, supply]
  public withdrawCollateral(params)         # [withdraw]
  public repay(params)                      # [approve?, repay]
  public getPosition(...)                   # delegates to _getPosition
  public getMarket(...)                     # delegates to _getMarket
  public getMarkets(...)                    # filters + delegates
  public getQuote(params)                   # builds quote with positionBefore/After, fees, safeCeilingLtv, recipient binding
  public getPrice(params)                   # lighter, no execution

MorphoBorrowProvider extends BorrowProvider<MorphoBorrowProviderConfig>
  implements all _method hooks
  uses shared/morpho/{abi, marketParams, decimals, contracts}
```

### Namespace hierarchy

```
BaseBorrowNamespace
  - provider selection (resolveProvider by marketId.kind or explicit provider)
  - quote routing across providers when ambiguous
  - getMarket / getMarkets / getPrice / getQuote / getPosition

ActionsBorrowNamespace extends BaseBorrowNamespace
  - read-only re-export (tiny, matches ActionsLendNamespace pattern)

WalletBorrowNamespace extends BaseBorrowNamespace
  - constructor takes wallet + providers + settings
  - overrides getQuote to bind recipient to wallet.address (mirrors WalletSwapNamespace:39)
  - 5 wallet methods each accept (params | BorrowQuote)
  - QUOTE_DISCRIMINATOR ('quotedAt') used for the `in` check
  - requireQuoteForThisWallet validates quote.recipient === wallet.address
  - dispatch via executeTransactionBatch
```

### How `getQuote` works (the central UX value)

1. Resolve provider from `params.market` or explicit `params.provider`.
2. Read current position state from chain via `_getPosition` →
   `positionBefore`.
3. Compute the action's effect on position state → `positionAfter` (uses
   provider-specific math: Morpho's `expectedBorrowAssets` from shares, oracle
   price, LLTV).
4. Build the calldata bundle. For Morpho:
   - `openPosition`: `[approve(collateralToken, MORPHO_BLUE)?, supplyCollateral(MarketParams, collateralAmountWei), borrow(MarketParams, borrowAmountWei, 0, walletAddress, recipient)]`
   - `closePosition` with `borrowAmount: 'max'`: `[approve(loanToken, MORPHO_BLUE)?, repay(MarketParams, 0, position.borrowShares, walletAddress, '0x')]` + optional `withdrawCollateral(MarketParams, collateralAmountWei, walletAddress, recipient)`.
   - `closePosition` with partial `borrowAmount`: `[approve(loanToken, MORPHO_BLUE)?, repay(MarketParams, repayAssetsWei, 0, walletAddress, '0x')]`.
   - `depositCollateral`: `[approve?, supplyCollateral]`.
   - `withdrawCollateral`: `[withdrawCollateral(MarketParams, assetsWei, walletAddress, recipient)]`.
   - `repay`: `[approve?, repay]`. `repay` with `amount: 'max'` uses
     `shares=position.borrowShares` (dust-safe).
5. Return `BorrowQuote` with `execution.transactions`, fees, safeCeilingLtv,
   `recipient`, `quotedAt`, `expiresAt = quotedAt + quoteExpirationSeconds`.

### How `execute(params | BorrowQuote)` works (each wallet method)

```ts
const executeParams =
  QUOTE_DISCRIMINATOR in params
    ? this.requireQuoteForThisWallet(params)
    : await this.resolveRawParams(params)  // re-quote

const provider = this.resolveProvider(...)
const txs = executeParams.execution.transactions
return executeTransactionBatch(this.wallet, txs, params.market.chainId)
```

## Implementation Phases

Each phase produces independently shippable, buildable commits. Order is
strict (later phases depend on earlier ones).

### Phase 1 — Types (no runtime dependencies)

Pure type-only files. Each commit adds one file or one cohesive type set
(3-5 lines per type, exported, JSDoc'd). Tests are typecheck only (`pnpm
tsc --noEmit`).

#### 1.1 `packages/sdk/src/types/borrow/base.ts`

Types to define (in this order, top of file → bottom):

```ts
// Identity
export type BorrowMarketId =
  | { kind: 'morpho-blue'; marketId: Hex; chainId: SupportedChainId }
  // future variants documented as comments only — no Aave/Comet/Euler/Liquity in PR #3

export type BorrowProviderName = 'morpho'  // future: | 'aave' | 'comet' | 'euler' | 'liquity'

// Morpho-specific market params (mirrors IMorpho.sol struct)
export interface MorphoMarketParams {
  loanToken:       Address
  collateralToken: Address
  oracle:          Address
  irm:             Address
  lltv:            bigint
}

// Market metadata + config
export interface BorrowMarketConfigMetadata {
  name: string
  collateralAsset: Asset
  borrowAsset: Asset
  borrowProvider: BorrowProviderName
  lendProvider: LendProviderName
  healthBufferPct?: number  // Decision 7 per-market override
}

// Discriminated config (Morpho-only for PR #3)
export type BorrowMarketConfig =
  | (BorrowMarketId & BorrowMarketConfigMetadata & {
      kind: 'morpho-blue'
      marketParams: MorphoMarketParams  // refining Decision 5 — see "Plan-level decision" above
    })

// Market public info
export interface BorrowMarket {
  marketId: BorrowMarketId
  name: string
  collateralAsset: Asset
  borrowAsset: Asset
  borrowApy: number
  liquidationBonus: number
  maxLtv: number
  totalBorrowed: bigint
  totalCollateral: bigint
}

// Position
export interface BorrowMarketPosition {
  marketId: BorrowMarketId
  collateralAsset: Asset
  collateralAmount: bigint
  collateralAmountFormatted: string
  borrowAsset: Asset
  borrowAmount: bigint
  borrowAmountFormatted: string
  healthFactor: number | null            // null when no debt (JSON-safe; replaces Infinity)
  liquidationPrice: bigint               // Morpho-scaled; prefer Formatted for display
  liquidationPriceFormatted: string
  borrowApy: number                      // fraction (e.g., 0.045 = 4.5%)
  liquidationBonus: number               // fraction (e.g., 0.05 = 5% liquidator discount)
  ltv: number | null                     // null when no debt
  maxLtv: number                         // always known from MarketParams
}

// Amount inputs (#379)
export type Amount =
  | { amount: number }
  | { amountRaw: bigint }
export type AmountOrMax = Amount | { max: true }

// Action params
export interface BorrowOpenPositionBaseParams {
  market: BorrowMarketConfig
  walletAddress?: Address
  options?: TransactionOptions
  approvalMode?: ApprovalMode
}
export type BorrowOpenPositionParams = BorrowOpenPositionBaseParams & {
  borrowAmount: Amount
  collateralAmount?: Amount
}
export type BorrowClosePositionParams = BorrowOpenPositionBaseParams & {
  borrowAmount: AmountOrMax
  collateralAmount?: AmountOrMax
}
export type BorrowDepositCollateralParams = BorrowOpenPositionBaseParams & {
  amount: Amount
}
export type BorrowWithdrawCollateralParams = BorrowOpenPositionBaseParams & {
  amount: AmountOrMax
}
export type BorrowRepayParams = BorrowOpenPositionBaseParams & {
  amount: AmountOrMax
}

// Quote / Price / Fees
export type BorrowAction =
  | 'open' | 'close' | 'depositCollateral' | 'withdrawCollateral' | 'repay'

export interface BorrowFees {
  borrowApy: number          // fraction
  liquidationBonus: number   // fraction
  // originationFee: dropped per YAGNI; re-add when Liquity ships
}

export interface BorrowQuoteExecution {
  // Ordered bundle: [approve?, collateral?, primary]. Use readonly so consumers can't mutate the quote.
  transactions: readonly TransactionData[]
  approvalsSkipped?: boolean // true when existing on-chain allowance covers the bundle
}

export interface BorrowQuote {
  marketId: BorrowMarketId
  action: BorrowAction
  borrowAmount?: number
  borrowAmountRaw?: bigint
  collateralAmount?: number
  collateralAmountRaw?: bigint
  positionBefore: BorrowMarketPosition | null
  positionAfter:  BorrowMarketPosition
  fees: BorrowFees
  safeCeilingLtv: number
  execution: BorrowQuoteExecution
  provider: BorrowProviderName
  recipient: Address
  quotedAt: number
  expiresAt: number
  gasEstimate?: bigint
}

export interface BorrowPrice {
  marketId: BorrowMarketId
  action: BorrowAction
  positionAfter: BorrowMarketPosition
  fees: BorrowFees
  safeCeilingLtv: number
}

// Filter for getMarkets
export interface GetBorrowMarketsParams {
  collateralAsset?: Asset
  borrowAsset?: Asset
  chainId?: SupportedChainId
  markets?: BorrowMarketConfig[]
}

// Receipt
export interface BorrowReceipt {
  receipt: BatchTransactionReturnType | TransactionReturnType
  action: BorrowAction
  borrowAmount?: bigint
  collateralAmount?: bigint
  marketId: BorrowMarketId
  positionAfter?: BorrowMarketPosition
}

// Internal params (post-amount-normalization)
export interface BorrowOpenPositionInternalParams { /* amountWei fields, walletAddress required */ }
// ... internal variants for each action

// Provider config + methods
export interface BorrowProviderConfig {
  marketAllowlist?: BorrowMarketConfig[]
  marketBlocklist?: BorrowMarketConfig[]
  approvalMode?: ApprovalMode
  quoteExpirationSeconds?: number
}

export interface BorrowProviderMethods { /* abstract method signatures */ }
```

**Test:** `pnpm tsc --noEmit` passes. No runtime tests yet.

#### 1.2 `packages/sdk/src/types/borrow/index.ts`

Re-exports from `base.ts`. ~5 LOC.

#### 1.3 `packages/sdk/src/types/providers.ts` — add BorrowProviders

```ts
export type BorrowProviders = {
  morpho?: BorrowProvider<BorrowProviderConfig>
}
```

#### 1.4 `packages/sdk/src/types/actions.ts` — add BorrowConfig, BorrowSettings, thread into ActionsContext

```ts
export interface BorrowSettings {
  approvalMode?: ApprovalMode
  quoteExpirationSeconds?: number
  healthBufferPct?: number    // Decision 7 default
}

export type BorrowConfig = RequireAtLeastOne<{
  morpho?: BorrowProviderConfig
}> & {
  settings?: BorrowSettings
}

// Extend ActionsContext / WalletNamespace context
export interface ActionsContext {
  // existing fields...
  borrowProviders: BorrowProviders
  borrowSettings?: BorrowSettings
}
```

**Files touched:** `types/actions.ts`, `types/providers.ts`, `types/borrow/{base,index}.ts`.

**Commit count:** 2-3 commits (types + providers + actions).

### Phase 2 — Shared helpers

#### 2.1 `packages/sdk/src/actions/shared/morpho/abi.ts` (NEW)

Hand-written `IMorpho` ABI as a `const` array, mirroring the
`IMorpho.sol` shape at `packages/demo/contracts/src/interfaces/IMorpho.sol`.
Methods needed: `supply`, `supplyCollateral`, `borrow`, `repay`,
`withdraw`, `withdrawCollateral`, `position`, `market`, `idToMarketParams`.
Plus `IOracle.price()`.

**Test:** typecheck. Encoding sanity check with `encodeFunctionData` in a
unit test.

#### 2.2 `packages/sdk/src/actions/shared/morpho/marketParams.ts` (NEW)

```ts
import { encodeAbiParameters, keccak256, type Hex } from 'viem'
import type { MorphoMarketParams } from '@/types/borrow/index.js'

const MARKET_PARAMS_ABI = [
  { type: 'address' }, { type: 'address' }, { type: 'address' },
  { type: 'address' }, { type: 'uint256' },
] as const

export function computeMorphoMarketId(params: MorphoMarketParams): Hex {
  return keccak256(encodeAbiParameters(MARKET_PARAMS_ABI, [
    params.loanToken, params.collateralToken, params.oracle,
    params.irm, params.lltv,
  ]))
}

export function verifyMorphoMarketId(
  marketId: Hex,
  params: MorphoMarketParams,
): boolean {
  return computeMorphoMarketId(params).toLowerCase() === marketId.toLowerCase()
}
```

**Test:** Unit tests with known marketId fixtures (e.g., the deployed
baseSepolia market once PR #2 lands; until then, use synthetic params and
cross-check against a manual keccak).

#### 2.3 `packages/sdk/src/actions/shared/morpho/decimals.ts` (NEW)

Lift `resolveUnderlyingDecimals` from
`packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts:221-238`.
Generalize the `marketId` parameter shape so both lend (vault address) and
borrow (vault address from MarketParams.collateralToken) can call it.

```ts
export async function resolveUnderlyingDecimals(
  publicClient: PublicClient,
  options: { allowlist?: LendMarketConfig[]; vaultAddress: Address },
): Promise<number> {
  // allowlist match → return Asset.metadata.decimals
  // else on-chain: vaultAddress.asset() → underlying.decimals()
}
```

**Test:** Adapt existing MorphoLendProvider tests to verify behavior is
preserved post-extraction. Add new test for the standalone helper.

**Mechanical change:** `MorphoLendProvider.ts` updated to call the new
helper. No behavior change.

#### 2.4 (cut — see Enhancement Summary YAGNI cuts)

`MorphoMarketParams` is defined once in `types/borrow/base.ts` and imported
directly wherever needed. No re-export through `shared/morpho/types.ts`.

#### 2.5 `packages/sdk/src/actions/shared/quoteDiscriminator.ts` (NEW)

Promote `QUOTE_DISCRIMINATOR = 'quotedAt' as const` out of
`swap/core/SwapProvider.ts:70` into a shared module both swap and borrow
import. Update swap's import in the same commit. Avoids a borrow→swap
namespace coupling.

**Commit count:** 3-4 commits (abi, marketParams + test, decimals
extraction + lend wire-up, quoteDiscriminator extraction).

### Phase 3 — Abstract base `BorrowProvider`

#### 3.1 `packages/sdk/src/actions/borrow/core/BorrowProvider.ts`

Mirror `LendProvider.ts` (415 lines) structure:

- Constructor: takes `(config, chainManager, settings?)`.
- Public methods: 10 (5 actions + getMarket/getMarkets/getPosition/getPrice/getQuote).
- Abstract protected `_method` hooks for each public method.
- Owns ApprovalMode cascading (call → provider → settings → default).
- Owns native-vs-ERC20 routing for the collateral side (Morpho's
  collateralToken is always ERC20 today; native handling reserved for future
  WETH-collateral markets).
- Owns amount normalization: converts `Amount | AmountOrMax` to
  `amountWei: bigint` + `isMax: boolean` before invoking `_method`.
- Owns quote expiration math (`quotedAt`, `expiresAt`).
- Owns recipient defaulting.
- Owns error wrapping via descriptive Error subclasses (mirror
  `LendProvider.ts`'s pattern).

**Test:** Unit tests with a `TestBorrowProvider` fake that records calls. Test
each public method's normalization + bundling, ApprovalMode cascading, quote
expiration, error paths.

**Commit count:** 1-2 commits (base + tests).

### Phase 4 — `MorphoBorrowProvider` concrete implementation

The largest single file (~350 LOC). Recommend splitting by method group.

#### 4.1 `MorphoBorrowProvider` skeleton + `_getMarket` + `_getMarkets`

Constructor calls `verifyMorphoMarketId(config.marketId, config.marketParams)`
synchronously for every allowlisted market; throws
`BorrowMarketParamsMismatchError` on any mismatch. No runtime
`idToMarketParams` call — verification happens against config.

Market reads use `viem.multicall` (1 RTT for `Morpho.market(id)` +
`IOracle(MarketParams.oracle).price()`). Or, when the field shape fits,
delegate to `Market.fetch` from `@morpho-org/blue-sdk-viem` (OPEN: confirm
during Phase 4.2). Returns `BorrowMarket` with `borrowApy` (derived from
the configured `irm`'s rate), `liquidationBonus` (derived from LLTV via
Morpho's `LIQUIDATION_CURSOR = 0.3e18` and
`MAX_LIQUIDATION_INCENTIVE_FACTOR = 1.15e18` curve in `ConstantsLib.sol`),
`maxLtv = Number(lltv) / 1e18`, totals from the multicall result.

**Acceptance:** no `_getMarket` call issues more than 1 RPC roundtrip.

**Test:** mock multicall response; verify returned shapes; fixture for
`liquidationBonus` math against a known LLTV.

#### 4.2 `_getPosition`

Locked: full delegation to `@morpho-org/blue-sdk-viem`. We do not
reimplement Morpho's HF / share-to-assets / liquidation-price math.

```ts
import '@morpho-org/blue-sdk-viem/lib/augment/Position'
import { AccrualPosition } from '@morpho-org/blue-sdk'

protected async _getPosition(params): Promise<BorrowMarketPosition> {
  const { marketId, walletAddress, market } = params
  // SDK handles share→assets, accrual, isHealthy
  const pos = await AccrualPosition.fetch(
    walletAddress,
    marketId,
    this.chainManager.getPublicClient(marketId.chainId),
  )

  // SDK gives us: collateral (bigint), borrowAssets (bigint, accrued),
  // borrowShares, supplyShares, isHealthy (boolean), maxBorrowableAssets,
  // borrowableAssets, liquidationPrice.
  return {
    marketId,
    collateralAsset: market.collateralAsset,
    collateralAmount: pos.collateral,
    collateralAmountFormatted: formatUnits(pos.collateral, market.collateralAsset.metadata.decimals),
    borrowAsset: market.borrowAsset,
    borrowAmount: pos.borrowAssets,
    borrowAmountFormatted: formatUnits(pos.borrowAssets, market.borrowAsset.metadata.decimals),
    healthFactor: pos.borrowAssets === 0n
      ? null
      : Number(pos.healthFactor) / 1e18,        // SDK exposes raw WAD
    liquidationPrice: pos.liquidationPrice ?? 0n,
    liquidationPriceFormatted: /* derived */,
    borrowApy: market.borrowApy,
    liquidationBonus: market.liquidationBonus,
    ltv: pos.borrowAssets === 0n ? null : Number(pos.ltv) / 1e18,
    maxLtv: market.maxLtv,
  }
}
```

**Per-field gap escape hatch.** If a specific field is missing from
`AccrualPosition.fetch`'s return shape (discovered during implementation),
add a one-shot read for that field only and combine in the adapter. Do
not reimplement Morpho's math. Expected fields from `AccrualPosition`:
`collateral`, `borrowShares`, `borrowAssets` (accrued), `supplyShares`,
`isHealthy`, `healthFactor` (WAD-scaled), `ltv` (WAD-scaled),
`liquidationPrice`. Verify all are present during Phase 4.2; flag gaps
in the PR description.

**Test:**
- Fixture-driven math against Morpho's on-chain `_isHealthy` view (parity
  check on healthy + liquidatable positions).
- Edge cases: zero debt → HF null + LTV null; zero collateral; rounding
  on borderline HF≈1.

#### 4.3 `_openPosition`

Builds `[supplyCollateral?, borrow]` (plus approvals handled by base).
Requires `collateralAmount` for fresh positions; if provider detects the
user has no existing collateral on this market AND `collateralAmount` is
omitted, throws with a clear error.

**Test:** Calldata encoding verified against `encodeFunctionData(IMorpho,
'supplyCollateral', [...])` and `'borrow', [...]`. Mock chain calls for
position fetch.

#### 4.4 `_closePosition`

Builds `[repay, withdrawCollateral?]`. `borrowAmount: 'max'` → fetches
`position.borrowShares` at **bundle-build time** (not at quote time;
re-fetched immediately before `executeTransactionBatch` to absorb accruing
interest dust) and passes `(assets=0,
shares=position.borrowShares)`. Partial `borrowAmount` → `(assets=amountWei,
shares=0)`. Optional `collateralAmount` → appends `withdrawCollateral` to
bundle.

**Test:** Both max and partial paths. Verify shares-based path uses freshly
fetched shares (not cached).

#### 4.5 `_depositCollateral`, `_withdrawCollateral`, `_repay`

Three primitives, each ~50 LOC. Same patterns as the bundled paths.

**Test:** Each as its own test file.

#### 4.6 `_getPrice`, `_getQuote`

`_getPrice`: builds `positionAfter` via simulation (delta-applying the action
to the current position state). Returns `BorrowPrice` (no calldata, no
expiration).

`_getQuote`: invokes `_getPrice` for position simulation, plus the per-action
calldata builder, plus `safeCeilingLtv = maxLtv * (1 - resolvedBufferPct)`.
Returns full `BorrowQuote`.

**Test:** Quote shape for each action. Verify recipient defaulting,
expiration math, position transition math.

**Commit count:** 5-7 commits across the methods.

### Phase 5 — Namespaces

#### 5.1 `BaseBorrowNamespace.ts`

Provider selection by `marketId.kind` (Morpho variant → `providers.morpho`).
Quote routing across providers (only one provider in PR #3, but the dispatch
shape is built for the future). Exposes `getMarket`, `getMarkets`,
`getPosition`, `getPrice`, `getQuote`.

#### 5.2 `ActionsBorrowNamespace.ts`

Thin re-export. ~10 LOC matching `ActionsLendNamespace.ts:7`.

#### 5.3 `WalletBorrowNamespace.ts`

Mirror `WalletSwapNamespace.ts`:

- Constructor: `(providers, wallet, settings?)`.
- Override `getQuote` to bind `recipient = wallet.address`.
- 5 wallet methods, each accepting `params | BorrowQuote`.
- Use `QUOTE_DISCRIMINATOR` imported from
  `@/actions/shared/quoteDiscriminator.js` (promoted in Phase 2.5).
- `requireQuoteForThisWallet(quote)` validates:
  1. `isAddressEqual(quote.recipient, wallet.address)`.
  2. `quote.marketId.chainId === params.market.chainId` (chain-id binding).
  3. `quote.marketId.marketId === params.market.marketId` (market identity
     binding — defends against backend-issued quotes being dispatched
     against a different market by accident).
  Throws existing `QuoteRecipientMismatchError` analog; reuse swap's
  pattern (plain Error in swap today; consider promoting to a typed error
  alongside Phase 2.5's quote discriminator extraction).
- Private `dispatch(borrowTx, chainId)` helper for symmetry with
  `WalletLendNamespace.dispatch` and `WalletSwapNamespace.dispatch`. Calls
  `executeTransactionBatch`.
- For `borrowAmount: 'max'` paths: at `dispatch` time (after
  `requireQuoteForThisWallet`, before `executeTransactionBatch`), re-fetch
  `position.borrowShares` via the same multicall the quote used and rebuild
  the repay tx's calldata in-place. Document this in the method JSDoc.

**Test:** Unit tests with mock wallet + mock provider:
- Recipient binding (positive + mismatch throws).
- ChainId binding (mismatch throws).
- Market-id binding (mismatch throws).
- Quote-vs-params union dispatch.
- Max-path re-encoding (shares drift between quote and dispatch produces
  correct calldata).
- Correct tx ordering and dispatch through `executeTransactionBatch`.

**Commit count:** 3-5 commits.

### Phase 6 — Top-level wiring

#### 6.1 `packages/sdk/src/actions.ts`

Add `borrow` block mirroring `lend` block at `actions.ts:87-104`:

```ts
const borrowSettings = config.borrow?.settings
if (config.borrow?.morpho) {
  this._borrowProviders.morpho = new MorphoBorrowProvider(
    config.borrow.morpho, this.chainManager, borrowSettings,
  )
}
if (this._borrowProviders.morpho) {
  this._borrow = new ActionsBorrowNamespace(this._borrowProviders)
}
```

Plus `get borrow()`, `get borrowProviders()` accessors.

#### 6.2 `WalletNamespace.ts` (and `LocalWallet`, `SmartWallet`)

Thread `borrowProviders` and `borrowSettings` through `ActionsContext`. Add
`wallet.borrow` accessor that lazily constructs a `WalletBorrowNamespace`.
Mirror exactly how `wallet.lend` / `wallet.swap` work today.

**Test:** End-to-end test that wires a real config, instantiates Actions,
calls `actions.borrow.getMarket(...)`, calls `wallet.borrow.getQuote(...)`.

**Commit count:** 2-3 commits.

### Phase 7 — Mocks + fork tests

#### 7.1 `MockBorrowProvider.ts`

Mirrors `MockLendProvider.ts` (414 lines). Returns deterministic position
state, configurable failures, in-memory market state. PR #4 backend tests
will consume this.

#### 7.2 Fork test against baseSepolia Morpho Blue

A single integration test that uses an anvil fork of baseSepolia, points at
the deployed PR #2 market (read marketId + MarketParams from
`deployments.json`), and exercises:

- `openPosition` with collateral deposit → assert on-chain state.
- `getPosition` round-trip.
- `closePosition` full close.

Mirror PR #2's `DeployMorphoBorrowMarket.t.sol` style for the fork harness.

**Commit count:** 2-3 commits.

### Phase 8 — Changeset, docs, llms-full

#### 8.1 `pnpm changeset`

Minor version bump for `@eth-optimism/actions-service` (per AGENTS.md
requirement). Changeset body summarizes: new borrow namespace, Morpho Blue
support, quote/commit pattern, types.

#### 8.2 `llms-full.txt` updates

Add borrow namespace section. Document the five primitives + quote/commit
flow + recipient binding.

#### 8.3 README / inline docs

Spot-update any SDK README references. Inline JSDoc on every public type and
method is part of each preceding phase, not a separate pass.

**Commit count:** 1-2 commits.

## Alternative Approaches Considered

All design alternatives were resolved during brainstorming (see brainstorm:
`docs/brainstorms/2026-05-08-borrow-pr3-sdk-borrow-provider-brainstorm.md`).
Key rejected alternatives:

- **Collateral lives in the lend namespace as a sibling `MorphoBlueLendProvider`.**
  Rejected because Liquity V2's atomic `openTrove` can't be modeled, and
  Euler V2's `EVC.batch` prefers atomicity. See brainstorm Decision 1.
- **`closePosition` does only repay (no collateral withdrawal).** Rejected
  for symmetry with `openPosition`. See brainstorm Decision 2.
- **`{ amount: 'max' }` string sentinel.** Rejected in favor of `{ max: true }`
  tagged variant to keep `amount` strictly typed as `number`. See brainstorm
  Decision 3.
- **`getMarketId` as a provider method.** Rejected in favor of standalone
  pure function — no provider state needed, tree-shakeable. See brainstorm
  Decision 5.
- **SDK enforces health buffer.** Rejected. Buffer is UX recommendation;
  enforcement is a footgun for power users. See brainstorm Decision 7.

## System-Wide Impact

### Interaction graph

`actions.borrow.openPosition(...)` invokes:
1. `BaseBorrowNamespace.resolveProvider(marketId)` → MorphoBorrowProvider.
2. `MorphoBorrowProvider.openPosition(params)` →
3. base class normalizes amounts → resolves ApprovalMode → invokes
   `_openPosition` → encodes calldata via shared/morpho/abi + marketParams →
4. returns `BorrowTransaction` with `[approve?, supplyCollateral?, borrow]`
   bundle → caller (wallet namespace) dispatches via
   `executeTransactionBatch` → `wallet.sendBatch` → ERC-4337 userOp.

### Error propagation

- `MarketIdRequiredError`, `AddressRequiredError`, `MarketNotConfiguredError`,
  `ProviderNotConfiguredError` (existing classes; reused).
- New: `BorrowMarketParamsMismatchError` (thrown by
  `verifyMorphoMarketId`-based init when config marketParams don't keccak to
  the configured marketId).
- New: `QuoteExpiredError` (thrown on execute path when
  `now >= quote.expiresAt`).
- New: `QuoteRecipientMismatchError` (thrown by `requireQuoteForThisWallet`).

All errors carry structured fields for downstream consumers (mirror existing
`@/core/error/errors.js` patterns).

### State lifecycle risks

- Quote → execute race: position state (especially `position.borrowShares`)
  can drift between quote time and execute time due to accruing interest.
  Mitigation: at execute time, if `borrowAmount: 'max'` is in the quote, the
  wallet namespace re-fetches `position.borrowShares` and rebuilds the repay
  calldata. (This is a small re-encoding, not a re-quote.) Document in JSDoc
  on `requireQuoteForThisWallet`.
- Partial bundle failure: an atomic userOp either fully lands or fully
  reverts. No partial-state risk inside one userOp. Across multiple userOps
  (e.g., depositCollateral followed by openPosition), state can be observed
  mid-flight by consumers — this is by design, not a bug.

### API surface parity

- `actions.lend` and `actions.borrow` share the namespace shape
  (`Actions{X}Namespace` + `Wallet{X}Namespace`).
- `actions.borrow` and `actions.swap` share the quote/commit pattern.
- Backend (PR #4) consumes `BorrowMarketConfig`, `BorrowQuote`,
  `BorrowMarketPosition`, `BorrowFees`. Frontend (PR #5) consumes the same
  plus `safeCeilingLtv`.

### Integration test scenarios

1. **Open + close round-trip on baseSepolia fork.** Deposit collateral,
   open borrow, close with both `'max'` values, verify final position is
   `{ collateralAmount: 0n, borrowAmount: 0n }`.
2. **Quote expiration.** Get a quote, advance time past `expiresAt`,
   attempt to execute; expect `QuoteExpiredError`.
3. **Recipient mismatch.** Get a quote for wallet A, try to execute with
   wallet B; expect `QuoteRecipientMismatchError`.
4. **Dust-free full repay.** Open a position, wait for interest accrual,
   call `closePosition({ borrowAmount: 'max', collateralAmount: 'max' })`,
   verify on-chain `position(marketId, user).borrowShares === 0n`.
5. **Health factor transition.** Open a position at LTV ~50%, depositCollateral,
   verify HF increases; withdrawCollateral, verify HF decreases.

## Acceptance Criteria

### Functional

- [ ] `actions.borrow.getMarket(morphoMarketId)` returns a `BorrowMarket`
      with `maxLtv === Number(lltv) / 1e18`, `borrowApy >= 0n`,
      `liquidationBonus > 0` for the baseSepolia dUSDC/OP market.
- [ ] `actions.borrow.getMarkets({ collateralAsset })` returns only markets
      whose `collateralAsset.address` matches the input.
- [ ] `actions.borrow.getMarkets({ borrowAsset })` filters by borrow side.
- [ ] `actions.borrow.getMarkets({ collateralAsset, borrowAsset })` returns
      markets matching the exact pair.
- [ ] `actions.borrow.getPosition({ marketId, walletAddress })` for a fresh
      wallet returns `{ collateralAmount: 0n, borrowAmount: 0n,
      healthFactor: null, ltv: null }`.
- [ ] `_getPosition` issues exactly **1 RPC roundtrip** (single multicall).
- [ ] `_getMarket` issues exactly **1 RPC roundtrip**.
- [ ] `wallet.borrow.openPosition({ collateralAmount: X, borrowAmount: Y })`
      lands a position on baseSepolia fork; post-state asserts
      `position.collateral === X_wei` and `position.borrowShares > 0n`.
- [ ] `wallet.borrow.closePosition({ borrowAmount: 'max', collateralAmount:
      'max' })` zeros the position: `position.borrowShares === 0n` and
      `position.collateral === 0n` even after 30s of interest accrual
      between quote and execute.
- [ ] `wallet.borrow.depositCollateral`, `withdrawCollateral`, `repay`
      independently land transactions.
- [ ] `wallet.borrow.getQuote(...)` returns a quote with `recipient ===
      wallet.address`, `quotedAt > 0`, `expiresAt = quotedAt + 30`.
- [ ] `wallet.borrow.openPosition(quote)` executes the quote's calldata
      verbatim (after the `'max'`-path re-encode where applicable).
- [ ] Mismatched recipient throws (use existing `Error` shape or new
      `QuoteRecipientMismatchError` if promoted).
- [ ] Expired quote throws existing `QuoteExpiredError` from
      `core/error/errors.ts:148`.
- [ ] Mismatched `chainId` in quote vs params throws.
- [ ] Mismatched `marketId` in quote vs params throws.
- [ ] `computeMorphoMarketId(deployedMarketParams)` ===
      `deployments.json.morpho.borrow.marketId` (fixture assertion).
- [ ] `MorphoBorrowProvider` constructor throws
      `BorrowMarketParamsMismatchError` when fed inconsistent
      `(marketId, marketParams)`.
- [ ] `BorrowSettings.healthBufferPct` defaults to `0.05`; per-market
      override resolves correctly.
- [ ] `BorrowSettings.approvalMode` default is `'exact'`.
- [ ] `BorrowSettings.quoteExpirationSeconds` default is `30`.
- [ ] `BorrowQuote.safeCeilingLtv === maxLtv * (1 - healthBufferPct)`
      (computed numerically in TS, matches bigint fraction).
- [ ] HF parity test: TS-computed `healthFactor` matches Morpho's on-chain
      `_isHealthy` boolean for three fixtures (healthy, borderline,
      liquidatable) within 1 wei tolerance on the underlying ratio.

### Non-functional

- [ ] `pnpm build`, `pnpm test`, `pnpm lint:fix`, `pnpm tsc --noEmit` all
      pass.
- [ ] `pnpm changeset` entry added (minor bump).
- [ ] No em-dashes in committed text (per AGENTS.md).
- [ ] No `// AI` or `// Claude` mentions (per user preferences).
- [ ] Existing lend + swap tests pass without modification (except the
      `QUOTE_DISCRIMINATOR` extraction commit which updates swap's import
      path and adds the re-export).
- [ ] `MorphoLendProvider` decimals extraction preserves existing behavior
      (existing tests still pass).
- [ ] All seven brainstorm decisions cited inline in the plan's phases.

### Quality gates

- [ ] Code review approval.
- [ ] Fork test green on CI (baseSepolia anvil fork).
- [ ] Each public method has JSDoc with `@param`, `@returns`, `@throws`.
- [ ] Each exported type has JSDoc.
- [ ] No `any` casts in public API surfaces.

## Dependencies & Prerequisites

- **PR #2 (#389)** must be merged or its local worktree state must reflect
  a successful deploy with `deployments.json` populated.
- **PR #2 follow-up (GATING):** `deployments.json` shape extended to include
  `morpho.borrow.marketParams: { loanToken, collateralToken, oracle, irm,
  lltv }` alongside `marketId`. **Phase 4.1 cannot land without this.** File
  the follow-up as a small PR to #2 before Phase 4 starts; hardcoded
  fixture path has been dropped from the plan.
- **PR #1 (#383)** namespace foundations — already merged on main.
- `@morpho-org/blue-sdk-viem` — already a dependency. v2.0.2 exposes
  `AccrualPosition.fetch`, `Market.fetch`, `MarketParams` for Morpho Blue
  (in addition to vault helpers). Read-side delegates fully; per-field
  gaps surface as one-shot reads, not math reimplementations.
- **viem `multicall`** — used for all `_getPosition` / `_getMarket` reads.
  Multicall3 already deployed on every supported chain.

## Risk Analysis & Mitigation

### Risk: `MarketParams` missing from `deployments.json`

**Likelihood:** Medium. PR #2 currently writes only `marketId`.

**Mitigation:** Phase 4.1 is **gated** on a PR #2 follow-up that extends
`deployments.json` to write `marketParams`. Phases 1-3 (types + shared
helpers + abstract base) ship unblocked. No hardcoded fallback fixture.

### Risk: Quote drift on full-repay (TOCTOU + sandwich)

**Likelihood:** High (interest accrues continuously); medium for sandwich
(requires attacker observing the bundler mempool).

**Mitigation:**
- Re-fetch `position.borrowShares` at **bundle-build time** (immediately
  before `executeTransactionBatch`), not at quote time. Documented in
  `WalletBorrowNamespace.dispatch` JSDoc.
- Add fork test: quote → wait 30s → execute → assert
  `position.borrowShares === 0n`.
- Add fork test: quote → third-party transfer or borrow against the same
  account between quote and execute → assert the SDK either fully closes
  or surfaces a clear error. This catches sandwich-style drift.
- Collateral-side `'max'` has the analogous parallel risk; same
  re-fetch-at-dispatch pattern applies.

### Risk: Quote tampering between issuance and submit

**Likelihood:** Low for in-process SDK use. Medium when `BorrowQuote` is
serialized over the wire (PR #4 backend → frontend → wallet).

**Mitigation:** At dispatch, `WalletBorrowNamespace` re-encodes the
expected calldata from `(params, positionAfter)` and asserts byte-equality
against `quote.execution.transactions[i].data`. Detects tampering on the
bundle's `to`/`data` even when metadata (recipient, quotedAt, expiresAt)
is intact.

### Risk: Oracle assumption

**Likelihood:** Low for the demo's controlled `MockChainlinkFeed`; medium
for future production markets.

**Mitigation:** `_getMarket` and `_getPosition` assert `oraclePrice > 0n`;
otherwise throw `OracleReadError`. JSDoc on `getPosition` and `getQuote`
declares "trusts the configured oracle." Forward-looking: consider an
optional `oracleSanityBounds?: { min: bigint; max: bigint }` per-market
in PR #4 / #5 telemetry, but not in PR #3.

### Risk: HF math correctness

**Likelihood:** Medium. Morpho's HF formula is non-obvious; off-by-one or
decimal-scale errors are easy.

**Mitigation:** Compare TypeScript HF math against Morpho Blue's on-chain
`isHealthy` view (via `Morpho.market(id)` + manual computation) in tests.
Fixture inputs from known liquidatable + healthy positions.

### Risk: `MorphoLendProvider` decimals extraction breaks lend

**Likelihood:** Low (mechanical extraction).

**Mitigation:** Run existing `MorphoLendProvider` tests after extraction.
Keep the extraction as its own commit so it's revertible.

### Risk: Type union for `BorrowMarketId` becomes unwieldy when Aave/Comet
land

**Likelihood:** Low for PR #3 itself; medium for PR #6.

**Mitigation:** Design the discriminator (`kind` literal) up front; document
that adding a variant is non-breaking. Forward-looking finding #3 in the
brainstorm captures the planned shape.

### Risk: `WalletNamespace.ts` / `LocalWallet` / `SmartWallet` test breakage

**Likelihood:** Low. Borrow threading touches `ActionsContext` in
`WalletNamespace.ts` and is consumed by `LocalWallet.create` and the smart
wallet factory.

**Mitigation:** Phase 6.2 must update all three call sites. Run the full
wallet test suite after Phase 6 commits. Any failures revert the threading
commit and re-do.

### Risk: HF math `1e36` vs `10n ** 36n`

**Likelihood:** Medium if someone copies pseudocode literally; `1e36` is a
JS `number` that loses precision above 2^53.

**Mitigation:** Plan-text pseudocode uses `10n ** 36n` and named constants
(`ORACLE_PRICE_SCALE`, `WAD`). Acceptance test compares TS output against
Morpho's on-chain `_isHealthy` for healthy / borderline / liquidatable
fixtures within 1 wei tolerance.

## Resource Requirements

Single engineer for PR #3 implementation. Estimated ~3-5 days for full
implementation + tests + fork validation, assuming PR #2 is merged. Sibling
agents on PR #4, #5, #6 can read this branch's worktree directly (per the
handoff's local-sibling-worktree note) to align contracts as code lands.

## Future Considerations

- **PR #6 / #427 — Aave V3 borrow provider.** Adds `aave` variant to
  `BorrowMarketId` union, registers under `BorrowProviders.aave`. Bundle
  for first-time-borrow-with-collateral may need 4 txs (Aave's
  `useReserveAsCollateral` flag persistence). See forward-looking finding in
  brainstorm.
- **Liquity, Compound V3, Euler V2 providers.** Each adds a `BorrowMarketId`
  variant. Liquity introduces an `extensions?` slot on `BorrowParams` for
  required `annualInterestRate`. Euler introduces sub-account index in
  position identity.
- **`extensions?` slot on `BorrowMarketPosition` / `BorrowParams`.** Defer
  until a second protocol forces it (forward-looking findings #4, #5).
- **Operator/authorization base hook.** Comet's `allow`, Morpho's
  `setAuthorization`, Euler's EVC enables. Base class will need a
  `_buildOperatorAuth` hook when a second protocol with non-ERC20 auth
  lands.

## Documentation Plan

- JSDoc on every public type and method in `types/borrow/base.ts`,
  `actions/borrow/core/BorrowProvider.ts`, and each namespace.
- `llms-full.txt`: new borrow namespace section.
- Changeset body: human-readable summary of new capability.
- This plan + brainstorm remain in `docs/plans/` and `docs/brainstorms/` as
  historical context.

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-05-08-borrow-pr3-sdk-borrow-provider-brainstorm.md](../brainstorms/2026-05-08-borrow-pr3-sdk-borrow-provider-brainstorm.md).
  Key decisions carried forward: optional collateral on openPosition (Decision 1),
  five primitives + symmetric closePosition (Decision 2),
  amount/amountRaw + max sentinel (Decision 3),
  BorrowMarketPosition field set (Decision 4),
  standalone marketId helpers (Decision 5),
  quote/commit pattern mirroring swap (Decision 6),
  health-buffer config (Decision 7).

### Internal References

- Existing lend namespace (pattern to mirror):
  `packages/sdk/src/actions/lend/core/LendProvider.ts:1-415`
- Existing swap quote pattern (pattern to mirror):
  `packages/sdk/src/actions/swap/core/SwapProvider.ts:70` (`QUOTE_DISCRIMINATOR`),
  `packages/sdk/src/actions/swap/namespaces/WalletSwapNamespace.ts:39-100`
  (recipient binding + execute)
- Shared dispatch primitive:
  `packages/sdk/src/wallet/core/utils/executeTransactionBatch.ts:13`
  (already references `WalletBorrowNamespace`)
- Existing Morpho contracts registry:
  `packages/sdk/src/actions/shared/morpho/contracts.ts:22-86`
- Existing `MorphoLendProvider`:
  `packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts:1-239`
- IMorpho Solidity interface (TS ABI source):
  `packages/demo/contracts/src/interfaces/IMorpho.sol`
- PR #2 deploy state: `packages/demo/contracts/state/deployments.json`
- ApprovalMode resolution:
  `packages/sdk/src/types/actions.ts:154`,
  `packages/sdk/src/actions/lend/core/LendProvider.ts:136-140`
- Top-level Actions factory:
  `packages/sdk/src/actions.ts:87-128` (lend + swap wiring blocks)

### External References

- Morpho Blue protocol overview: <https://docs.morpho.org/morpho/concepts/morpho-blue/>
- Morpho Blue contract reference: <https://github.com/morpho-org/morpho-blue/tree/main/src>
- `@morpho-org/blue-sdk-viem`: <https://www.npmjs.com/package/@morpho-org/blue-sdk-viem>
- ERC-4337 user operations (atomic batching context):
  <https://eips.ethereum.org/EIPS/eip-4337>

### Related Work

- Sibling PRs:
  - #389 — PR #2 (oracle + market deploy), prerequisite.
  - #391 — PR #4 (backend, consumes this PR's types).
  - #392 — PR #5 (frontend, consumes this PR's types + `safeCeilingLtv`).
  - #427 — PR #6 (future Aave V3 borrow provider).
- Parent epic: #366 — Borrow support.
- Issue: #390 — this PR.
- Original 911-line plan (historical):
  `docs/plans/2026-04-16-feat-morpho-borrow-provider-plan.md` on
  `origin/kevin/borrow-spec`. Treat as directional only.
