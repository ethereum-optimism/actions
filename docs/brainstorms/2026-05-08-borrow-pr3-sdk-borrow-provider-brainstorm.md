---
date: 2026-05-08
topic: borrow-pr3-sdk-borrow-provider
related:
  - https://github.com/ethereum-optimism/actions/issues/390
  - https://github.com/ethereum-optimism/actions/issues/366
  - https://github.com/ethereum-optimism/actions/issues/389
  - https://github.com/ethereum-optimism/actions/issues/391
  - https://github.com/ethereum-optimism/actions/issues/392
  - https://github.com/ethereum-optimism/actions/issues/427
  - https://github.com/ethereum-optimism/actions/issues/379
  - docs/brainstorms/2026-05-05-borrow-pr2-oracle-and-market-deploy-brainstorm.md
  - docs/plans/2026-05-06-001-feat-morpho-borrow-market-deploy-plan.md
  - docs/plans/2026-04-16-feat-morpho-borrow-provider-plan.md (origin/kevin/borrow-spec)
---

# Borrow PR #3: SDK Borrow Provider

## What We're Building

The third sub-PR in the borrow track. Adds the SDK's borrow domain on top of
the on-chain pieces PR #2 shipped: a `BorrowProvider` namespace, an abstract
base, and `MorphoBorrowProvider` for the dUSDC-collateral / OP-loan market.
Pure TypeScript work inside `packages/sdk/`. No backend, frontend, or
contracts; those are PRs #4, #5, and #6 respectively.

The borrow surface mirrors swap's quote/commit pattern, exposes five action
primitives (open, close, deposit collateral, withdraw collateral, repay), and
ships ready for Aave V3 (PR #6) plus future protocols (Compound V3, Euler V2)
to drop in cleanly.

## Why This Approach

Six product decisions plus one escalated from PR #5 were resolved through
collaborative research and protocol comparison. The full per-decision write-up
lives in the now-deleted `handoff.md` (commit history); this brainstorm is the
distilled outcome.

The original plan at `docs/plans/2026-04-16-feat-morpho-borrow-provider-plan.md`
(on `origin/kevin/borrow-spec`, 911 lines, 2026-04-16) is treated as
directional input, not gospel. PR #1 (#383, namespace foundations) and PR #2
(#389, oracle and market deploy) shipped after that plan and reshape several
of its assumptions. Where the original plan is still load-bearing it is cited
inline below; otherwise it is superseded.

Cross-protocol research (Compound V3, Liquity V2, Euler V2) was used to
stress-test the API shape before locking. Aave V3 was already on the roadmap
via PR #6 / issue #427.

## Key Decisions

### 1. Optional collateral lives on `borrow.openPosition`

```ts
borrow.openPosition({
  market,
  collateralAsset?,     // required for fresh Morpho positions
  collateralAmount?,    // optional for Aave (collateral may pre-exist via lend.open)
  borrowAmount,
})
```

Each borrow provider builds its own bundle. No cross-namespace delegation
(the borrow provider does **not** reach into the lend provider to construct
deposit calldata). Namespaces stay orthogonal: borrow works without lend
being registered.

Driver for this shape: Liquity V2's CDP-style `openTrove(collAmount, boldAmount)`
is atomic at the protocol level. There is no "supply collateral, then borrow
later" path. If collateral lived in the lend namespace, every CDP-shaped
protocol (Liquity, Sky/Maker, Inverse) becomes unmodelable. Euler V2 also
strongly prefers this: its native `EVC.batch([deposit, enableCollateral,
enableController, borrow])` wants to be one atomic operation, not split
across namespaces. Compound V3 is neutral; Aave V3 still works because
`collateralAmount` is optional.

The `MorphoLendProvider` (PR #1) is **untouched**. Vault-only, as shipped.

### 2. Five borrow primitives, `closePosition` symmetric with `openPosition`

```ts
borrow.openPosition({  collateralAmount?, borrowAmount })
borrow.closePosition({ collateralAmount?, borrowAmount })
borrow.depositCollateral({ amount })
borrow.withdrawCollateral({ amount })
borrow.repay({ amount })
```

Both `openPosition` and `closePosition` take `(collateralAmount?, borrowAmount)`.
On both, `borrowAmount` is required and `collateralAmount` is optional. Same
TypeScript type, no protocol-conditional required-ness. Top-ups, partial
repays, and standalone collateral moves use the three direct primitives.

Per protocol:

- **Morpho:** typical close passes both as `'max'`. Provider emits
  `[repay(shares=balance), withdrawCollateral(max)]`. Caller may omit
  `collateralAmount`, leaving dUSDC stranded at 0 APY; SDK is honest about
  it and frontend defaults to passing both.
- **Aave V3:** typical close passes only `borrowAmount: 'max'`. aTokens
  stay earning yield. If `collateralAmount` is passed, the borrow provider
  builds `Pool.withdraw` calldata directly.
- **Compound V3 / Euler V2 (future):** same pattern, providers translate
  `'max'` to the protocol's idiomatic full-repay path.

The original plan's `partialShares` mode is dropped. Shares-as-user-param is
not a concept in the SDK; Morpho's full-repay dust-avoidance
(`repay(shares=position.borrowShares, assets=0)`) is an internal detail of
`MorphoBorrowProvider`.

### 3. `amount` XOR `amountRaw` from day one (#379)

```ts
type AmountExact =
  | { amount:    number }    // human-readable, e.g. 1.5
  | { amountRaw: bigint }    // raw wei, source of truth

type AmountWithMax = AmountExact | { max: true }
```

| Method | Field(s) | Type |
|---|---|---|
| `openPosition` | `borrowAmount` (req), `collateralAmount?` | `AmountExact` |
| `depositCollateral` | `amount` | `AmountExact` |
| `closePosition` | `borrowAmount` (req), `collateralAmount?` | `AmountWithMax` |
| `withdrawCollateral` | `amount` | `AmountWithMax` |
| `repay` | `amount` | `AmountWithMax` |

`{ max: true }` is a tagged variant rather than a string sentinel so `amount`
stays strictly typed as `number`. `'max'` is meaningful only on operations
targeting an existing balance. Wallet-side "max" (use the full wallet
balance) is a frontend concern: call `balanceOf`, pass it as `amountRaw`.

Per #379, this convention is applied to borrow from day one. Lend has not
migrated yet; lend retrofit is a downstream concern.

### 4. `BorrowMarketPosition` field set

```ts
interface BorrowMarketPosition {
  marketId: BorrowMarketId

  collateralAsset: Asset
  collateralAmount: bigint
  collateralAmountFormatted: string

  borrowAsset: Asset
  borrowAmount: bigint
  borrowAmountFormatted: string

  healthFactor: number              // 1.0 = at liquidation; Infinity if no debt
  liquidationPrice: bigint          // USD, in collateralAsset's price decimals
  liquidationPriceFormatted: string

  borrowApy: number                 // current borrow APY as fraction
  liquidationBonus: number          // liquidator discount as fraction

  ltv?: number                      // current LTV as fraction
  maxLtv?: number                   // protocol's LLTV
}
```

`healthFactor` is `Infinity` when no debt is open (collateral-only state).
`borrowApy` and `liquidationBonus` are required because every protocol we
ship now exposes them; surfacing both lets frontends render fee context
without an extra market read. `collateralValueUsd` and `borrowValueUsd` are
intentionally absent: frontends compute from price oracles to avoid
stale-cache confusion.

Future protocol-specific fields (Liquity redemption priority, Euler
sub-account index) are added as `?` slots when those providers ship; no
`extensions` indirection until a second protocol forces it.

### 4a. `BorrowMarketId` and `BorrowMarketConfig`

A lend market is one asset; a borrow market is two assets (collateral and
borrow). The market types reflect that. Market identity is also
fundamentally different across protocols.

**`BorrowMarketId` is a tagged union.** PR #3 ships only the Morpho variant;
the union is structured for forward-compat with Aave/Compound/Liquity/Euler
(forward-looking finding #3).

```ts
type BorrowMarketId =
  | { kind: 'morpho-blue'; marketId: Hex; chainId: SupportedChainId }
  // future:
  // | { kind: 'aave-v3';      collateralAsset: Address; borrowAsset: Address; chainId }
  // | { kind: 'compound-v3';  cometAddress: Address;    chainId }
  // | { kind: 'liquity-v2';   branchAddress: Address;   troveId: Hex; chainId }
  // | { kind: 'euler-v2';     controllerVault: Address; collateralVault: Address;
  //                            subAccountIndex: number; chainId }
```

**Per-protocol identity:**

- **Morpho Blue** has a real on-chain market: `marketId = keccak256(abi.encode(loanToken, collateralToken, oracle, irm, lltv))`. The bytes32 commits to the entire parameter set; same loan + collateral with different LLTVs are distinct markets.
- **Aave V3** has no market object. There is a single `Pool` per chain holding many reserves; users borrow any asset against any other (subject to per-asset rules). The SDK's `(collateralAsset, borrowAsset)` pair is a virtual abstraction. `getPosition` for Aave attributes a slice of the user's Pool state to one chosen pair; HF and liquidation price are global to the user's Aave account, not per-pair.
- **Compound V3 / Liquity V2 / Euler V2** each have their own identity scheme (see forward-looking finding #3).

**`BorrowMarketConfig`:**

```ts
type BorrowMarketConfig = BorrowMarketId & {
  name: string
  collateralAsset: Asset                 // dUSDC for Morpho, USDC for Aave
  borrowAsset: Asset                     // OP for Morpho, any reserve for Aave
  borrowProvider: BorrowProviderName     // which protocol owns the borrow side
  lendProvider: LendProviderName         // which lend market produced the collateral
  healthBufferPct?: number               // per-market override of BorrowSettings (Decision 7)
}
```

`borrowProvider` mirrors `LendMarketConfig.lendProvider`. `lendProvider` is
also present so the frontend / backend can render and orchestrate the
"Lend USDC via Morpho → Borrow OP via Morpho" flow as a single connected
operation, and so consumers know which provider's `lend.open` to invoke
when bootstrapping a fresh borrow position.

Both assets are denormalized into config (despite Morpho's marketId already
committing to them) for ergonomics: UI rendering needs `Asset` objects
(symbol, decimals, logo); resolving these from a bytes32 every render is
expensive, and provider-agnostic consumers (PR #4 backend, PR #5 frontend)
benefit from a uniform shape across protocols.

### 5. `getMarketId` validation lives as a standalone helper

```ts
// packages/sdk/src/actions/shared/morpho/marketParams.ts
export function computeMorphoMarketId(params: MarketParams): Hex
export function verifyMorphoMarketId(marketId: Hex, params: MarketParams): boolean
```

Pure functions, tree-shakeable, no provider binding. Production code reads
`marketId` from `deployments.json`'s `morpho.borrow.marketId`; the helper
exists for verification (does the configured `marketId` match the configured
params?), tests, and external consumers deriving ids from params.

Per #390, calldata pre-build validation is a new SDK capability. Shipping the
Morpho helper here sets the pattern for sibling helpers (Aave reserve config,
Comet base/collateral lookup, Liquity branch resolution) when those
providers land.

### 6. Quote/commit pattern mirrors swap

Read-only namespace surfaces `getPrice` (lighter) and `getQuote` (full,
recipient-bound). Wallet methods accept either fresh params (re-quote
internally) or a pre-built `BorrowQuote` (uses pre-built calldata, throws if
recipient ≠ wallet). Identical to swap's pattern at
`packages/sdk/src/types/swap/base.ts` and `WalletSwapNamespace`.

```ts
// Read-only, no wallet binding
actions.borrow.getMarket(marketId: BorrowMarketId): BorrowMarket
actions.borrow.getMarkets(params: GetBorrowMarketsParams): BorrowMarket[]
actions.borrow.getPosition({ marketId, walletAddress }): BorrowMarketPosition
actions.borrow.getPrice(params): BorrowPrice
actions.borrow.getQuote(params): BorrowQuote

// Wallet, accepts params or pre-built quote
wallet.borrow.openPosition(params | BorrowQuote): BorrowReceipt
wallet.borrow.closePosition(params | BorrowQuote): BorrowReceipt
wallet.borrow.depositCollateral(params | BorrowQuote): BorrowReceipt
wallet.borrow.withdrawCollateral(params | BorrowQuote): BorrowReceipt
wallet.borrow.repay(params | BorrowQuote): BorrowReceipt
```

`getMarket(s)` and `getPosition` mirror lend's `ActionsLendNamespace` shape.
`getPosition` replaces lend's `getMarketBalance` for symmetry with the rest of
the borrow surface.

`GetBorrowMarketsParams` is borrow-specific (not the shared `FilterAssetChain`
that lend uses) because borrow markets carry two assets:

```ts
interface GetBorrowMarketsParams {
  collateralAsset?: Asset           // filter: markets accepting this collateral
  borrowAsset?: Asset               // filter: markets lending this asset
  chainId?: SupportedChainId
  markets?: BorrowMarketConfig[]    // explicit allowlist (matches lend's pattern)
}
```

Filter semantics: both unset → all configured markets; one set → markets
matching that side; both set → markets matching the exact pair. Searches the
`BorrowProviderConfig.marketAllowlist` config rather than chain (per
Decision 5: config is the source of truth).

```ts
type BorrowAction =
  | 'open' | 'close' | 'depositCollateral' | 'withdrawCollateral' | 'repay'

interface BorrowQuote {
  marketId: BorrowMarketId
  action: BorrowAction

  borrowAmount?: number
  borrowAmountRaw?: bigint
  collateralAmount?: number
  collateralAmountRaw?: bigint

  positionBefore: BorrowMarketPosition | null   // null on first-time open
  positionAfter:  BorrowMarketPosition

  fees: BorrowFees
  safeCeilingLtv: number                        // see Decision 7

  execution: { transactions: TxRequest[] }      // bundle, not single calldata

  provider: BorrowProviderName
  recipient: Address
  quotedAt: number
  expiresAt: number
  gasEstimate?: bigint
}

interface BorrowPrice {
  marketId: BorrowMarketId
  action: BorrowAction
  positionAfter: BorrowMarketPosition
  fees: BorrowFees
  safeCeilingLtv: number
}

interface BorrowFees {
  borrowApy: number                  // current borrow APY as fraction
  liquidationBonus: number           // discount liquidator gets

  originationFee?: {                 // forward-looking (Liquity); not populated by Morpho/Aave
    amount: number
    amountRaw: bigint
    asset: Asset
    description: string
  }
}
```

Key shape differences from swap:

- **Bundle, not single tx.** `execution.transactions: TxRequest[]` (Morpho 3,
  Aave 4, Euler 4-5). No single router/value field.
- **`positionBefore` / `positionAfter`** replaces swap's `price` /
  `priceImpact`. Frontends get HF transition for free.
- **One union type** discriminated by `action`. Five wallet methods, one
  quote shape.
- **Recipient binding** identical: quote bakes recipient into bundle
  calldata; wallet `execute` rejects mismatched quotes.

How fees actually flow (informational): for Morpho, Aave, Compound V3, and
Euler V2, no upfront fee. Interest accrues on the debt; `borrowAmount` grows
over time, repaid in the borrow asset. Liquidation bonus is paid from
collateral only if liquidated. Reserve factor is hidden behind the gross APY
surfaced to the user. `originationFee` is reserved for future Liquity-style
protocols.

### 7. Health-buffer config (escalated from PR #5)

PR #5's Borrow tab needs a `healthBufferPct` to compute a safe-ceiling LTV
(`safe_ceiling = LLTV * (1 - healthBufferPct)`). The Health bar normalizes
100% to safe-ceiling; the Max button prefills to safe-ceiling.

```ts
interface BorrowSettings {
  // ...
  healthBufferPct?: number          // default 0.05
}

interface BorrowMarketConfig {
  // ...
  healthBufferPct?: number          // per-market override
}
```

Resolution rule on the consumer side: `market.healthBufferPct ?? settings.healthBufferPct ?? 0.05`.
Same pattern as `approvalMode` (PR #1).

Defaults: `0.05` (5%). Units: fraction (matches every other ratio field).
SDK does **not** enforce the buffer; it is a UX recommendation, not a
protocol rule. Power users may legitimately operate in the buffer zone for
active HF management. Consumers (the demo frontend) decide whether to gate.

`safeCeilingLtv` is precomputed on `BorrowQuote` and `BorrowPrice` so
frontends do not recompute on every render.

PR #5's stub `BORROW_HEALTH_BUFFER_PCT = 0.05` becomes a one-line swap to
`actions.borrow.settings.healthBufferPct` once this PR lands.

## Forward-Looking Findings

Carry-forward notes from cross-protocol research. None of these are solved in
PR #3, but the borrow types are designed so they don't require a breaking
change later.

1. **Operator/authorization patterns vary.** Comet uses `allow`, Morpho uses
   `setAuthorization`, Euler uses EVC enables, Aave uses only ERC-20
   approval. The base `BorrowProvider` should expose a hook for
   "authorize an operator before the bundle if the protocol requires it."
   Not Aave-shaped, not pure ERC-20.
2. **`borrowAsset` is sometimes market-derived.** Morpho, Compound V3, and
   Liquity derive the borrow asset from the market identity. Aave V3 lets
   the user pick. Treat as market-derived by default; provider validates if
   user-supplied.
3. **`BorrowMarketId` will be a tagged union.** Morpho `bytes32`, Aave
   `(asset, chainId)`, Comet `(comet contract, chainId)`, Liquity
   `(branchAddress, troveId)`, Euler `(controllerVault, collateralVault,
   subAccountIndex)`. PR #3 ships only the Morpho variant, but design the
   type for the union from day one.
4. **Liquity-specific param leak: `interestRate`.** Required by `openTrove`,
   no Morpho/Aave analogue. Reserve an optional protocol-extension slot on
   `BorrowParams` (e.g., `extensions?: { liquity?: { annualInterestRate, … } }`)
   when the Liquity provider lands.
5. **Liquity-specific position state: redemption risk.**
   `BorrowMarketPosition` will eventually need a redemption priority field.
   Don't pre-abstract in PR #3.
6. **Bundle size scales with protocol complexity.** Morpho 3 txs, Aave
   first-time-with-collateral 4, Comet 2-3, Euler first-time 4-5. ERC-4337
   makes this functionally a non-issue, but gas estimation should not
   assume a fixed count.

## What Lands Where

```
packages/sdk/src/
├── actions/
│   ├── borrow/
│   │   ├── core/
│   │   │   └── BorrowProvider.ts             # abstract base
│   │   ├── namespaces/
│   │   │   ├── ActionsBorrowNamespace.ts     # read-only: getQuote, getPrice, getMarket(s)
│   │   │   ├── BaseBorrowNamespace.ts        # shared dispatch
│   │   │   └── WalletBorrowNamespace.ts      # wallet methods (5 actions)
│   │   ├── providers/morpho/
│   │   │   └── MorphoBorrowProvider.ts       # only borrow + repay; collateral via shared helpers
│   │   └── utils/
│   │       └── markets.ts                    # findMarketInAllowlist analog
│   └── shared/
│       └── morpho/
│           ├── contracts.ts                   # already exists (PR #1)
│           ├── marketParams.ts                # NEW: computeMorphoMarketId, verifyMorphoMarketId
│           └── decimals.ts                    # NEW: lift resolveUnderlyingDecimals from MorphoLendProvider
└── types/
    ├── borrow/
    │   ├── base.ts                            # NEW: BorrowMarketId, BorrowMarketConfig, BorrowMarketPosition, BorrowQuote, BorrowPrice, BorrowFees, etc.
    │   └── index.ts                           # re-exports
    ├── actions.ts                             # add BorrowConfig, BorrowSettings, ActionsContext threading
    └── providers.ts                           # add BorrowProviders { morpho?, aave? }
```

`MorphoBorrowProvider` only owns `borrow` and `repay`. The collateral side
(`supplyCollateral`, `withdrawCollateral`) is consumed via shared helpers in
`actions/shared/morpho/`, since the same calldata is used by every Morpho
market interaction.

## Out of Scope for PR #3

- Backend endpoints (`/borrow/*`) — PR #4 / #391.
- Frontend Borrow tab — PR #5 / #392.
- Aave V3 borrow provider — PR #6 / #427.
- Liquity, Compound V3, Euler V2 providers — future PRs.
- `MorphoLendProvider` reshape — vault-only, untouched by this PR.
- Lend's `closePosition` check for dUSDC pledged as borrow collateral —
  PR #4 / #391 backend concern (called out in #391).
- Top-up / partial-collateral / partial-repay UX flows beyond what the five
  primitives provide.
- Buffer enforcement at the SDK level (Decision 7: UX recommendation only).
- `BorrowMarketId` widening beyond the Morpho variant (forward-looking
  finding #3).
- `extensions?` slot for Liquity-style required params (forward-looking
  finding #4).

## Open Items (downstream)

- **PR #391 (backend):** `lend.closePosition` must check dUSDC isn't pledged
  as borrow collateral before allowing withdrawal. Per Decision 1,
  collateral lives in the borrow namespace.
- **PR #392 (frontend):** swap the `BORROW_HEALTH_BUFFER_PCT` constant for
  `actions.borrow.settings.healthBufferPct` once this PR lands.
- **PR #427 / future Aave V3 borrow provider:** the bundle for first-time
  borrow with collateral may need 4 txs because Aave's
  `useReserveAsCollateral` flag persists across supplies. The borrow
  provider must emit `setUserUseReserveAsCollateral(asset, true)` if the
  user has previously disabled the asset as collateral.

## Constraints (from `AGENTS.md`)

- One domain per PR. PR #3 is SDK only.
- One protocol version per provider. Morpho Blue v1 only.
- Tests required for every feature; don't mock pure utilities.
- No em-dashes in committed text.
- `pnpm changeset` when touching `packages/sdk/`.

## Next

Run `/ce-plan` against this brainstorm. The plan turns the locked decisions
into concrete file-level work units (types, provider, namespaces, tests,
fixtures), validates each unit against current main + PR #2 head, and
produces the implementation queue for `/ce-work`.
