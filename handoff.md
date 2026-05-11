# Handoff: Borrow PR #3 (SDK BorrowProvider)

> **Status: Phases 1-5 landed.** Plan-defined Phase 6 (top-level wiring),
> Phase 7 (mocks + fork test), Phase 8 (changeset + docs) remain.

## Where we are

| Phase | Done | Notes |
|---|---|---|
| **1.** Types | ✅ | `types/borrow/base.ts` + `BorrowConfig`/`BorrowSettings` in `actions.ts` |
| **2.** Shared helpers | ✅ | `marketParams.ts` (compute/verify) + decimals extraction + `QUOTE_DISCRIMINATOR` promoted to `actions/shared/` |
| **3.** Abstract `BorrowProvider` base | ✅ | Mirrors `LendProvider` shape; owns amount normalization + approval-mode cascading + allowlist enforcement |
| **4.** `MorphoBorrowProvider` | ✅ | Reads via raw `blueAbi` multicall (1 RTT), passes results through Morpho's `Market`/`AccrualPosition` for math. Write side encodes `supplyCollateral`/`borrow`/`repay`/`withdrawCollateral` with allowance pre-flight. `BorrowMarketParamsMismatchError` thrown at construction. |
| **5.** Namespaces | ✅ | `BaseBorrowNamespace`, `ActionsBorrowNamespace`, `WalletBorrowNamespace` with QUOTE_DISCRIMINATOR routing + recipient binding + dispatch via `executeTransactionBatch` |
| **6.** Top-level wiring | 🔲 | `Actions.ts` borrow block + `WalletNamespace` accessor; thread `borrowProviders` through `ActionsContext` (currently optional during rollout) |
| **7.** `MockBorrowProvider` + fork test | 🔲 | 7.1 unblocked. 7.2 fork test reads `marketParams` from `deployments.json` (already plumbed in commit `bc80b1fa`) |
| **8.** Changeset + docs | 🔲 | Minor bump on `@eth-optimism/actions-service`; `llms-full.txt` borrow section |

## Significant deviations from the plan

These differ from the plan/brainstorm and matter to readers downstream:

1. **`@morpho-org/blue-sdk`'s chain registry does not include baseSepolia.**
   The plan locked "full delegation to `AccrualPosition.fetch` /
   `Market.fetch`" — those helpers route through `getChainAddresses(chainId)`
   and throw on baseSepolia. We instead read raw state via `blueAbi`
   multicall, then construct `Market` + `AccrualPosition` locally so the
   SDK's getters (`healthFactor`, `ltv`, `liquidationPrice`, `borrowAssets`)
   still compute the math. Net effect: same math, no per-chain registry
   coupling. Documented in `MorphoBorrowProvider.ts` header.
2. **`BorrowProviderName`** moved to `types/providers.ts` (alongside
   `LendProviderName`/`SwapProviderName`) when main consolidated those.
   `actions.ts` re-exports it. The original plan put it in
   `types/borrow/base.ts` — superseded by main's restructure.
3. **`marketParams` write to `deployments.json`** built in this branch
   (commit `bc80b1fa`) — PR #2 didn't include this follow-up so we added
   it ourselves: the Solidity deploy script now logs each `MarketParams`
   field, and `deploy-demo.sh` parses them into
   `morpho.borrow.marketParams.{loanToken,collateralToken,oracle,irm,lltv}`.
   No deploy has run yet; values are still `null` in JSON.
4. **`ActionsContext.borrowProviders` is currently optional.** Full
   threading to every `WalletNamespace`/`HostedWalletProvider` site is
   deferred to Phase 6 to avoid a sprawling diff. The borrow namespaces
   themselves are wired and tested.
5. **Wallet-namespace max-path re-encoding (Phase 5.3 in plan) is
   deferred.** Quotes encode the `borrowShares` snapshot taken at quote
   time. The wallet namespace re-quotes via `provider.openPosition` / etc.
   when called with raw params (not a quote), which re-fetches fresh
   shares. The "rebuild calldata in-place at dispatch time" optimization
   for accepted quotes can land in Phase 5 polish or alongside Phase 6.

## Open items for Phase 6+

- **Thread `borrowProviders` through `ActionsContext` consumers.** Today
  `borrowProviders?: BorrowProviders` is optional in `types/actions.ts:178`;
  every `WalletNamespace`/`HostedWalletProvider`/`Wallet` site that holds
  an `ActionsContext` needs the field, plus a default `{}` when no borrow
  config is supplied.
- **`actions.borrow` and `wallet.borrow` accessors** in `Actions.ts` and
  `WalletNamespace.ts`, mirroring the lend block at `actions.ts:87-104`.
- **`MockBorrowProvider`** mirrors `MockLendProvider` and lands in Phase 7.1.
  Backend (PR #4) consumes it.
- **Fork test** lives at the contracts package and exercises open / get /
  close round-trip against an anvil fork of baseSepolia. Reads marketId +
  MarketParams from `deployments.json`.

## Next agent: how to continue

1. Run `/ce-work` against the plan file pointing at Phase 6. The plan's
   Phase 6 section calls out the exact files and patterns.
2. Phase 7.1 (`MockBorrowProvider`) is independent of Phase 6 and can run
   in parallel if you split.
3. Commit cadence stays the same: build → tests → lint:fix → commit (3-7
   word messages, no PR numbers, no AI/Claude mentions).
4. **Update this handoff after each phase.** Per user direction
   (2026-05-11), the handoff is the rolling status doc across phases.

## Decision history (reference only)

Sections below preserve the decision-by-decision history that led to
the brainstorm and plan. Useful for understanding *why* a choice was
made; not load-bearing for implementation. **The plan supersedes any
phrasing here that conflicts.**

## Brainstorm state — where we left off

**Decisions resolved during the 2026-05-07 / 2026-05-08 sessions are
recorded under "Resolved decisions" below. Outstanding decisions are
listed at the end of this section. Sibling agents working on
subsequent borrow PRs (#391 backend, #392 frontend, #427 Aave) can
treat the resolved sections as load-bearing.**

## Resolved decisions

### Decision 7 — Health-buffer config (locked, escalated from PR #5)

PR #5's Borrow tab needs a `healthBufferPct` config value to compute
the safe-ceiling LTV (`safe_ceiling = LLTV * (1 - healthBufferPct)`).
The Health bar normalizes 100% to safe-ceiling; the Max button
prefills to safe-ceiling. SDK owns the config; demo reads it.

**Resolutions:**

1. **Granularity — global default + per-market override.** Same
   pattern as `approvalMode`.

   ```ts
   interface BorrowSettings {
     // ...
     healthBufferPct?: number      // default 0.05
   }

   interface BorrowMarketConfig {
     // ...
     healthBufferPct?: number      // per-market override
   }
   ```

   Resolution rule (consumer side):

   ```ts
   const buffer =
     market.healthBufferPct ??
     actions.borrow.settings.healthBufferPct ??
     0.05
   ```

2. **Default value:** `0.05` (5%) for the demo, settable via
   `BorrowSettings`.

3. **API shape:** no separate `getBorrowSafetyConfig()` getter —
   settings + market config are sufficient. Avoids new API surface
   for two field reads.

4. **Units:** fraction (0.05), not percent (5). Matches every other
   ratio field in the borrow types (`borrowApy`, `liquidationBonus`,
   `ltv`, `maxLtv`).

5. **Enforcement:** SDK does **not** enforce the buffer. It's a UX
   recommendation, not a protocol rule. Consumers (demo frontend)
   decide whether to gate user actions in the buffer zone. PR #5
   plans to render a "buffer zone" warning rather than block.

**Quote/price augmentation:** `BorrowQuote` and `BorrowPrice` both
gain a precomputed `safeCeilingLtv: number` field
(`= maxLtv * (1 - healthBufferPct)`) so frontends don't recompute
the bar normalization on every render.

**Type surface that lands in PR #3:**

- New `BorrowSettings` interface with `healthBufferPct?: number`.
- New `BorrowMarketConfig` interface with `healthBufferPct?: number`
  (analogous to `LendMarketConfig`).
- `BorrowQuote.safeCeilingLtv: number` and
  `BorrowPrice.safeCeilingLtv: number` added to Decision 6's shapes.

**PR #5 cleanup:** the frontend constant
`BORROW_HEALTH_BUFFER_PCT = 0.05` becomes a one-line swap to read from
`actions.borrow.settings.healthBufferPct`. PR #5 stub stays in place
until PR #3 lands.

---

### Decision 5 — Calldata pre-build validation surface (locked)

**Standalone helper only.** Pure functions exported from
`packages/sdk/src/actions/shared/morpho/marketParams.ts`:

```ts
// Pure: keccak256(abi.encode(MarketParams)) → bytes32
export function computeMorphoMarketId(params: MarketParams): Hex

// Convenience: compute + compare
export function verifyMorphoMarketId(
  marketId: Hex,
  params: MarketParams,
): boolean
```

No provider method. Pure functions have no dependency on provider
state, and binding them to a provider class would add API surface
without payoff. Standalone exports are tree-shakeable.

**Production rule:** runtime code reads `marketId` from
`deployments.json`'s `morpho.borrow.marketId` — does **not** recompute
from `MarketParams` at runtime. The helper exists for verification
(does the configured `marketId` match the configured params?), tests
(fork tests deriving ids from params), and external consumers.

**Why this isn't deferred:** parent issue #390 names calldata pre-build
validation as a new SDK capability. Shipping the Morpho helper in PR #3
sets the pattern for sibling helpers that future protocols (Aave V3
reserve config, Comet base/collateral lookup, Liquity branch resolution)
will follow.

---

### Decision 6 — Quote/commit pattern (locked)

Mirrors swap's pattern at `packages/sdk/src/types/swap/base.ts` +
`WalletSwapNamespace`. Read-only namespace surfaces `getPrice` and
`getQuote`; wallet methods accept either fresh params (re-quote
internally) or a pre-built `BorrowQuote` (uses pre-built calldata,
throws if recipient ≠ wallet).

**Namespace surface:**

```ts
// Read-only — no wallet binding
actions.borrow.getPrice(params): BorrowPrice    // light: HF/LTV/APY/fees preview
actions.borrow.getQuote(params): BorrowQuote    // full: pre-built bundle, recipient-bound

// Wallet — accepts params OR pre-built quote
wallet.borrow.openPosition(params | BorrowQuote):       BorrowReceipt
wallet.borrow.closePosition(params | BorrowQuote):      BorrowReceipt
wallet.borrow.depositCollateral(params | BorrowQuote):  BorrowReceipt
wallet.borrow.withdrawCollateral(params | BorrowQuote): BorrowReceipt
wallet.borrow.repay(params | BorrowQuote):              BorrowReceipt
```

**`BorrowQuote` shape:**

```ts
type BorrowAction =
  | 'open' | 'close' | 'depositCollateral' | 'withdrawCollateral' | 'repay'

interface BorrowQuote {
  marketId: BorrowMarketId
  action: BorrowAction

  // Action-specific input echo (raw + display, per #379 convention)
  borrowAmount?: number
  borrowAmountRaw?: bigint
  collateralAmount?: number
  collateralAmountRaw?: bigint

  // Position state preview — central UX value
  positionBefore: BorrowMarketPosition | null   // null on first-time open
  positionAfter:  BorrowMarketPosition

  // Fee breakdown
  fees: BorrowFees

  // Buffer-aware safe ceiling (Decision 7) — = maxLtv * (1 - healthBufferPct)
  safeCeilingLtv: number

  // Pre-built bundle (varies in size: Morpho 3 txs, Aave 4)
  execution: { transactions: TxRequest[] }

  // Metadata (mirrors swap)
  provider: BorrowProviderName
  recipient: Address
  quotedAt: number
  expiresAt: number
  gasEstimate?: bigint
}
```

**`BorrowPrice` shape (lighter, no execution):**

```ts
interface BorrowPrice {
  marketId: BorrowMarketId
  action: BorrowAction
  positionAfter: BorrowMarketPosition   // hypothetical state
  fees: BorrowFees
  safeCeilingLtv: number                // Decision 7
}
```

**`BorrowFees` shape:**

```ts
interface BorrowFees {
  // Required — applies to every protocol we ship now
  borrowApy: number              // current borrow APY as decimal (e.g. 0.045 = 4.5%)
  liquidationBonus: number       // discount liquidator gets (e.g. 0.05 = 5%)

  // Forward-looking (Liquity-style protocols only — not implemented in PR #3)
  originationFee?: {
    amount: number
    amountRaw: bigint
    asset: Asset
    description: string
  }
}
```

**Recipient binding (mirrors swap):** quote bakes recipient into bundle
calldata. Wallet `execute` rejects mismatched quotes; consumer must
re-quote via `wallet.borrow.getQuote(...)` when executor differs from
quote's recipient.

**How fees actually flow (informational, ties Decision 4 + 6):**

- Morpho/Aave/Comet/Euler: no upfront fee. Interest accrues on the
  debt itself (`borrowAmount` grows over time, repaid in borrow
  asset). Liquidation bonus is paid from collateral only if the
  position is liquidated. Reserve factor is hidden behind the gross
  APY surfaced to the user.
- Liquity (future): upfront fee deducted from minted BOLD plus
  user-chosen rate. `originationFee` populates only here.

**Dropped from scope:**

- Liquity-specific surfaces (per-trove rate, redemption priority,
  upfront fee field population). Fields exist as `?` slots but are
  not wired in PR #3.

---

### Decision 4 — `BorrowMarketPosition` fields (locked)

```ts
interface BorrowMarketPosition {
  marketId: BorrowMarketId

  // Collateral side
  collateralAsset: Asset
  collateralAmount: bigint              // raw wei
  collateralAmountFormatted: string

  // Debt side
  borrowAsset: Asset
  borrowAmount: bigint                  // raw wei
  borrowAmountFormatted: string

  // Risk state (#390 first-class fields)
  healthFactor: number                  // 1.0 = at liquidation; Infinity if no debt
  liquidationPrice: bigint              // USD, in collateralAsset's price decimals
  liquidationPriceFormatted: string

  // Required across all protocols we ship
  borrowApy: number                     // current borrow APY as decimal
  liquidationBonus: number              // liquidator discount as decimal

  // Optional, where the protocol exposes them
  ltv?: number                          // current LTV as decimal
  maxLtv?: number                       // protocol's LLTV for this market
}
```

**Notes:**

- `healthFactor` is `Infinity` when `borrowAmount === 0n` (collateral
  with no debt — surfaces from `getPosition` even when no borrow is
  active).
- `liquidationPrice` is USD-denominated using the collateral asset's
  oracle decimals (typically 8 for Chainlink). Both raw and formatted
  surface so frontends don't re-derive.
- `borrowApy` and `liquidationBonus` are required (not optional) —
  Morpho/Aave/Comet/Euler all expose them; surfacing them on every
  position lets the frontend render fee context without an extra
  market read.
- `collateralValueUsd` / `borrowValueUsd` are intentionally **not**
  fields — frontends compute from `collateralAmount * price` to keep
  the position type narrow and avoid stale-cache confusion.
- Field set is stable for Morpho/Aave/Comet/Euler. Future
  protocol-specific fields (Liquity redemption priority, Euler sub-
  account index) will be added as `?` slots when those providers
  ship; no `extensions` indirection until a second protocol forces it.

---

### Decision 3 — `amount` XOR `amountRaw` shape (locked, #379 from day one)

```ts
type AmountExact =
  | { amount:    number }    // human-readable, e.g. 1.5
  | { amountRaw: bigint }    // raw wei, e.g. 1500000000000000000n

type AmountWithMax = AmountExact | { max: true }
```

**Per-method usage:**

| Method | Field(s) | Type |
|---|---|---|
| `openPosition` | `borrowAmount` (req), `collateralAmount?` | `AmountExact` |
| `depositCollateral` | `amount` | `AmountExact` |
| `closePosition` | `borrowAmount` (req), `collateralAmount?` | `AmountWithMax` |
| `withdrawCollateral` | `amount` | `AmountWithMax` |
| `repay` | `amount` | `AmountWithMax` |

**Why `{ max: true }` rather than `'max'`:** keeps `amount` strictly
typed as `number`. `'max'` only meaningful on operations targeting an
existing balance (close/withdraw/repay) — opens and deposits always
need a specific amount. Wallet "max" (use full wallet balance) is a
frontend concern: call `balanceOf`, pass it as `amountRaw`.

**Status of #379 in lend:** lend has not migrated yet (uses
`amount: number` plain). Borrow ships first with this convention; lend
retrofit is downstream.

---

### Decision 2 — Borrow namespace primitives + `closePosition` shape (locked)

**Final API surface:**

```ts
borrow.openPosition({  collateralAmount?, borrowAmount })
borrow.closePosition({ collateralAmount?, borrowAmount })
borrow.depositCollateral({ amount })
borrow.withdrawCollateral({ amount })
borrow.repay({ amount })
```

5 borrow primitives. `closePosition` is the symmetric inverse of
`openPosition`: same param names, same shape, both `bigint | 'max'`
(exact wire format defers to Decision 3 / #379). On both sides
`borrowAmount` is required; `collateralAmount` is optional.

**Per-protocol semantics:**

- **Morpho:** typical close passes both `('max', 'max')`. Provider
  emits `[repay(shares=balance), withdrawCollateral(max)]`. If caller
  omits `collateralAmount`, dUSDC stays stranded earning 0% — SDK is
  honest about this; frontend defaults to passing both.
- **Aave:** typical close passes `borrowAmount: 'max'` only — aTokens
  stay earning yield. If `collateralAmount` is passed, the borrow
  provider builds `Pool.withdraw` calldata directly (no cross-namespace
  delegation per Decision 1).
- **Liquity (future):** when both amounts are `'max'`, provider emits
  `closeTrove` natively. Otherwise emits `repayBold` /
  `withdrawColl` / `adjustTrove` as appropriate.
- **Compound V3 / Euler V2 (future):** providers translate the
  user-facing `'max'` to the protocol's idiomatic full-repay path
  (`type(uint256).max` / EVC batch).

**Implementation notes:**

- `closePosition` with `borrowAmount: 'max'` uses Morpho's
  `repay(shares=position.borrowShares, assets=0)` idiom internally to
  dodge the `toSharesUp` 1-wei-dust bug. Shares-as-user-param is
  dropped entirely — Morpho-internal detail only.
- Standalone `depositCollateral` / `withdrawCollateral` / `repay`
  handle partial / non-close operations: top-up to fix HF, release
  excess collateral, partial debt reduction.
- No "repay without protocol side-effect" escape hatches. Aave-flag
  resets on full-repay are implementation details inside the provider.

**Forward-looking — quote/commit pattern (deferred to Decision 6):**

The borrow surface needs a quote→commit flow analogous to swap, so
callers can preview HF, liquidation price, and post-action position
state before committing. Decision 6 will define the `BorrowQuote`
shape and which methods produce quotes vs. direct execution. Likely
candidates for quote-bearing methods: `openPosition`, `closePosition`,
`depositCollateral`, `withdrawCollateral`, `repay` (effectively all of
them, since every borrow action moves health factor).

**Dropped:**

- `partialShares` mode from `CloseBorrowMode` — shares is internal-only.
- `closePosition` as a 2-verb-magic method without an explicit
  collateral param (rejected in favor of explicit
  `collateralAmount?`).
- Cross-namespace delegation (borrow provider reaching into lend
  provider for `Pool.withdraw` calldata).

**Open downstream concern (PR #391 backend):**

Lend's `closePosition` currently has no check for dUSDC pledged as
borrow collateral. Per Decision 1, dUSDC-as-collateral lives in the
borrow namespace. PR #391's check is "lend's `closePosition` must
verify the user isn't withdrawing dUSDC that's pledged in a borrow
position." Backend concern, not PR #3.

---

### Decision 1 — Optional collateral on `borrow.openPosition` (locked)

**Shape:**
```ts
actions.borrow.openPosition({
  market,
  collateralAsset?,    // required for Morpho fresh positions; optional for Aave
  collateralAmount?,
  borrowAmount,
})
```

**Rule:** each borrow provider builds its own bundle. Do **not** have
`AaveBorrowProvider` (or any other) reach into `LendProvider` to
construct the deposit tx. Namespaces stay orthogonal; borrow works
without lend being registered.

**Why this won over the lend-side sibling provider:**

- **Liquity V2 forces it.** CDP-style `openTrove(collAmount, boldAmount, …)`
  is atomic at the protocol level. There is no "supply collateral, then
  borrow later" path — BOLD is minted only when debt opens. If
  collateral lived in the lend namespace, Liquity (and any future
  CDP-shaped protocol: Sky/Maker, Inverse, etc.) cannot be modeled.
- **Euler V2 strongly prefers it.** Native flow is one
  `EVC.batch([deposit, enableCollateral, enableController, borrow])`.
  Splitting across `lend.open` and `borrow.openPosition` would double
  userOps and fight the protocol design.
- **Compound V3 (Comet) is neutral.** Two-call shape
  (`supply(collateral)` + `withdraw(base, amount)`) works equally well
  in either namespace placement.
- **Aave V3 still works.** `collateralAmount` is optional; users who
  pre-supplied via `lend.open` (for yield) just pass `borrowAmount`
  and the provider skips the deposit tx.

**Trade-off accepted:** `openPosition` owns two verbs (deposit +
borrow) on protocols that need it. Asymmetry with `closePosition`
remains an open question (Decision 2).

**Implementation notes for downstream PRs:**

- Top-ups (add collateral to fix HF on existing position) are scoped
  out of PR #3. Add a `borrow.addCollateral` primitive when sibling
  issue #391 (backend) or #392 (frontend) needs it.
- Aave's bundle for first-time-borrow-with-collateral is potentially
  4 txs: `[approve, Pool.supply, setUserUseReserveAsCollateral(true), Pool.borrow]`.
  The borrow provider must emit `setUserUseReserveAsCollateral` because
  Aave's flag persists across supplies (a previously-disabled asset
  won't auto-re-enable).
- `MorphoLendProvider` (PR #1) is **untouched** by this PR. It stays
  vault-only.

## Forward-looking findings (carry into PR #3 design and beyond)

These came out of the cross-protocol research (Compound V3, Liquity V2,
Euler V2). Don't solve them in PR #3, but design the borrow types so
these don't require a breaking change later.

1. **Operator/authorization patterns vary.** Comet uses `allow`,
   Morpho uses `setAuthorization`, Euler uses EVC enables, Aave uses
   only ERC-20 approval. The base `BorrowProvider` should expose a
   hook for "authorize an operator before the bundle if the protocol
   requires it" — not Aave-shaped, not pure ERC-20.
2. **`borrowAsset` is sometimes market-derived.** Morpho, Comet, and
   Liquity derive the borrow asset from the market. Aave lets the user
   pick. SDK should treat it as market-derived by default; require it
   only where the provider needs it.
3. **`BorrowMarketId` will be a tagged union.** Morpho `bytes32`,
   Aave `(asset, chainId)`, Comet `(comet contract, chainId)`,
   Liquity `(branchAddress, troveId)` with troveId per-position,
   Euler `(controllerVault, collateralVault, subAccountIndex)`. PR #3
   ships only the Morpho variant, but the type should be designed for
   the union from day one (mirroring the `LendMarketId` widening we
   touched on but did not need for PR #3 itself).
4. **Liquity-specific param leak: `interestRate`.** Required by
   `openTrove`, no Morpho/Aave analogue. Reserve an optional
   protocol-extension slot on `BorrowParams` (e.g., `extensions?: {
   liquity?: { annualInterestRate, interestRateDelegate? } }`) so
   future protocols can attach required params without reshaping the
   base type.
5. **Liquity-specific position state: redemption risk.**
   `BorrowMarketPosition` will eventually need extension fields for
   things like Liquity's redemption priority or Euler's
   sub-account index. Don't pre-abstract in PR #3; leave room.
6. **Bundle size grows with protocol complexity.** Morpho 3 txs, Aave
   first-time-with-collateral 4, Comet 2–3, Euler first-time 4–5.
   ERC-4337 makes this functionally a non-issue, but gas-estimation
   surfaces should not assume a fixed count.

## Outstanding decisions

All seven decisions resolved (six original + Decision 7 escalated
from PR #5). Next step: synthesize into
`docs/brainstorms/2026-05-08-borrow-pr3-sdk-borrow-provider-brainstorm.md`,
then `git rm handoff.md` in a standalone commit (PR #2 convention),
then `/ce-plan` → `/ce-work`.

**Other architectural points the conversation surfaced (informational):**

- **Morpho permits separate txs for `supplyCollateral` and `borrow`** —
  atomic batching is a UX choice, not a protocol requirement. ERC-4337
  smart wallets give us single-userOp atomicity for free across all
  configured providers (Privy/Kernel/Safe/LightAccount).
- **Bundler3 was rejected** in the original plan: not on baseSepolia,
  no benefit for the demo, extra dependency. Stay rejected.
- **`executeTransactionBatch` module-level helper exists** at
  `packages/sdk/src/wallet/core/utils/executeTransactionBatch.ts` —
  use it for borrow's dispatch, do not introduce a new
  `BaseWalletNamespace` class (the deferred refactor from PR #1 is
  still deferred per "extraction trigger: second concrete usage,
  not third").
- **Protected `_method` pattern** is the canonical shape per
  `LendProvider`: base owns the public method + cross-cutting concerns
  (approval mode, native-vs-ERC20, error wrapping); the concrete
  provider only implements `_method` describing protocol-specific
  calldata.
- **`MorphoLendProvider` is vault-only today** (uses
  `MetaMorphoAction.deposit/withdraw` from `@morpho-org/blue-sdk-viem`).
  Whatever choice we make on (1)–(4) above, do **not** reshape it as
  part of this PR — that's PR #1 territory.
- **Sibling issues land downstream:** #391 (PR #4 backend, /borrow
  endpoints, **explicitly notes** "Lend's closePosition currently has
  no check for dUSDC pledged as borrow collateral" — wherever
  collateral lives, that check needs to be reachable); #392 (PR #5
  frontend, HF color tiers, before/after preview, Max button with
  safety buffer); #427 (PR #6 future Aave). Don't solve their problems,
  but design the borrow provider so the data they need is exposed.

**Files examined this session (so the next agent doesn't re-walk):**

- `packages/sdk/src/types/lend/base.ts` — `LendMarketId`,
  `LendMarketConfig`, `LendOpenPosition`, `LendProviderMethods`. The
  base contract for any new `LendProvider` subclass; mirror the same
  shape on the borrow side.
- `packages/sdk/src/types/providers.ts` — `LendProviders { morpho?,
  aave? }`, `SwapProviders { uniswap?, velodrome? }`. Single source
  of truth for provider registry. Borrow needs a parallel
  `BorrowProviders { morpho?, aave? }`.
- `packages/sdk/src/types/actions.ts` — `LendConfig` (RequireAtLeastOne),
  `LendSettings { approvalMode? }`, `ActionsContext` threading.
  `BorrowConfig` / `BorrowSettings` should mirror this exactly.
- `packages/sdk/src/actions/lend/namespaces/WalletLendNamespace.ts` —
  the dispatch pattern (`txs = [approval?, position]`, defer to
  `executeTransactionBatch`). Borrow's wallet namespace should
  follow the same shape — for `openPosition` the txs become
  `[approval?, supplyCollateral?, borrow]` (assuming option 1).
- `packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts`
  — concrete impl reference. `resolveUnderlyingDecimals` (allowlist
  first, on-chain fallback) is reusable; do not rebuild.
- `packages/sdk/src/actions/shared/morpho/contracts.ts` —
  `MORPHO_BLUE = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb'`,
  `getMorphoContracts(chainId)`. Use, don't redeclare.
- `packages/demo/contracts/state/deployments.json` — chain `84532`
  has `morpho.borrow.{mockFeed: null, oracle: null, marketId: null}`
  at HEAD. PR #2's deploy hasn't been run+committed yet, so SDK
  config plumbing must tolerate `null`s during dev (or the next
  agent should run the deploy first; see PR #2 worktree).

## Original handoff (still applies)

## What this PR is

**Borrow PR #3 — SDK `BorrowProvider` skeleton + Morpho implementation**
(GitHub issue [ethereum-optimism/actions#390](https://github.com/ethereum-optimism/actions/issues/390)).

Adds the SDK's borrow domain on top of the on-chain pieces PR #2 just
shipped: a `BorrowProvider` namespace + abstract base + `MorphoBorrowProvider`
that talks to the dUSDC-collateral / OP-loan market. Pure TypeScript work
inside `packages/sdk/`. **No** backend, frontend, or contracts — those are
PRs #4, #5, and #6 respectively.

## Repo / worktree context

- **Worktree path:** `/home/orangekid/github/actions-borrow-pr3`
- **Branch:** `kevin/borrow-pr3`
- **Base:** stacked on `kevin/borrow-pr2` (HEAD `6febb45b`), which itself
  rebases cleanly on `origin/main`. **Do not rebase off main yet** — PR #2
  needs to land first, otherwise this branch will need a merge step. If the
  PR #2 branch is force-pushed (e.g., review feedback rewrites it), this
  branch will need a corresponding rebase before merge.
- **Sibling worktree (PR #2, in review):**
  `/home/orangekid/github/actions-borrow-pr2` on branch `kevin/borrow-pr2`.
  PR is at https://github.com/ethereum-optimism/actions/pull/457 (draft).
- **Repo:** `ethereum-optimism/actions` (pnpm monorepo, Node ≥ 18). Project
  conventions live in `AGENTS.md` and `CONTRIBUTING.md`.

### Local sibling worktrees (this machine)

Borrow PRs #2-#6 are all being worked on as co-resident local worktrees.
On the orangekid box the paths are `/home/orangekid/github/actions-borrow-prN`
(per the worktree-path line above). On the Mac (`kevinw@oplabs.co`) the
parallel paths are:

- `/Users/kevin/github/optimism/actions-borrow-pr2` (`kevin/borrow-pr2`)
- `/Users/kevin/github/optimism/actions-borrow-pr3` (`kevin/borrow-pr3`)
- `/Users/kevin/github/optimism/actions-borrow-pr4` (`kevin/borrow-pr4`)
- `/Users/kevin/github/optimism/actions-borrow-pr5` (`kevin/borrow-pr5`)
- `/Users/kevin/github/optimism/actions-borrow-pr6` (`kevin/borrow-pr6`)

Sibling agents can read each other's state directly via `git -C <path>
log/status` and direct file reads, including unpushed commits and
in-flight brainstorm docs, without waiting for `git push`. Treat the
local worktree as authoritative for "what's actually staged" when
origin lags. **Edit only your own worktree.** Cross-branch propagation
still goes through rebase, not direct edits.

## What PR #2 already shipped (load-bearing context)

PR #2 added the on-chain pieces this SDK work consumes. Read these files
before designing the provider:

- `packages/demo/contracts/script/DeployMorphoBorrowMarket.s.sol` — the
  deploy script. Tells you the exact oracle wiring and market params your
  SDK will read at runtime.
- `packages/demo/contracts/src/MockChainlinkFeed.sol` — only relevant if you
  ever need to interact with the feed directly (you almost certainly do
  not).
- `packages/demo/contracts/src/interfaces/IMorpho.sol` — the minimal
  Solidity interface PR #2 extended with `supply()`, `market()`, and
  `IOracle`. The corresponding TS interface in the SDK is what you will
  call.
- `packages/demo/contracts/state/deployments.json` — chain `84532` runtime
  addresses. After deploy, look for `morpho.borrow.{mockFeed, oracle, marketId}`.

## Source materials (read in this order)

1. `gh issue view 390 --repo ethereum-optimism/actions` — this PR.
2. `gh issue view 366 --repo ethereum-optimism/actions` — parent epic
   "Borrow support".
3. `gh issue view 389 --repo ethereum-optimism/actions` — PR #2 (just
   shipped).
4. `docs/brainstorms/2026-05-05-borrow-pr2-oracle-and-market-deploy-brainstorm.md`
   — PR #2's brainstorm. Useful for understanding the *why* behind the
   on-chain shape.
5. `docs/plans/2026-05-06-001-feat-morpho-borrow-market-deploy-plan.md`
   — PR #2's plan. The eight deltas-from-original-plan section is still
   relevant for how SDK code should match reality.
6. **Original 911-line plan** on `origin/kevin/borrow-spec`:
   - `docs/plans/2026-04-16-feat-morpho-borrow-provider-plan.md`
   - `docs/specs/borrow-provider-detailed.md` (~2900 lines, deepest detail)
   - `docs/specs/borrow-provider-summary.md`
   - View via: `git show origin/kevin/borrow-spec:docs/plans/2026-04-16-feat-morpho-borrow-provider-plan.md | less`
   - **Caveat:** plan is from 2026-04-16, predates PR #1 (#383, namespace
     foundations) and PR #2 (this branch). Treat as authoritative for SDK
     shape but verify against current main + PR #2 before adopting any
     specific function or file path.
7. **PR #1 (#383) shipped namespace foundations.** The shared lend/borrow
   provider pattern lives at `packages/sdk/src/actions/lend/providers/morpho/`
   and `packages/sdk/src/actions/shared/morpho/`. Mirror that structure for
   borrow, do not invent a new one.

## Suggested workflow for PR #3

PR #3 is bigger than PR #2 (SDK work touches more files and has more
product decisions). Recommend the full ce-loop:

1. `/ce-brainstorm` — frame what the BorrowProvider's public API looks
   like, what `Position` returns mean, error taxonomy, what the abstract
   base does vs Morpho-specific implementation. The 911-line plan is
   useful input here but should not be treated as gospel.
2. `/ce-plan` — translate the brainstorm into implementation units.
3. `/ce-work` — implement.

Don't skip brainstorm → plan and jump straight to coding. PR #3 has
genuinely-open product questions (param shape, error hierarchy, position
semantics) that the original plan glossed over.

## Constraints to internalize before starting

From `AGENTS.md`:
- **One domain per PR.** PR #3 is *only* SDK code. No backend endpoints, no
  frontend tab, no contract changes. If implementation discovers a missing
  piece on a non-SDK surface, file a follow-up issue rather than expand
  scope.
- **One protocol version per provider.** This PR targets Morpho Blue v1
  only. Aave's borrow provider (#427 / future) is a separate PR with a
  shared base class.
- **Tests required for every feature; don't mock pure utilities.**
- **No em-dashes** in committed text.
- **Run `pnpm changeset`** when you touch `packages/sdk/`. PR #3 will.

## Critical deltas from the original plan (carry forward)

These come from PR #2's plan and still apply to PR #3:

1. **`MorphoLendProvider._getPosition` decimals fix is already done** in
   main (PR #1's `resolveUnderlyingDecimals()`). The borrow provider's
   `getPosition` should use the same helper (or a sibling) — do not rebuild
   decimal handling.
2. **Morpho contract addresses live in
   `packages/sdk/src/actions/shared/morpho/contracts.ts`** — single source
   of truth. Do not redeclare Morpho Blue / IRM / factory addresses in
   borrow code.
3. **The borrow market's `marketId` is `keccak256(abi.encode(MarketParams))`**
   and depends on the oracle address. Read it from `deployments.json`'s
   `morpho.borrow.marketId` rather than recomputing — the deploy script
   is the source of truth, and recomputing in TS opens a foot-gun if any
   param changes.
4. **The lend provider's `MorphoLendProvider`** lives at
   `packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts`.
   Read it before designing borrow — it's the closest sibling and PR #1's
   namespace work made it the canonical example.

## Pragma note (irrelevant for SDK, but you may notice it)

PR #2 added `lib/morpho-blue-oracles` as a Foundry submodule pinned to
solc `=0.8.21`. To compose, PR #2 loosened `IMorpho.sol` and the new
mock/script/test pragmas to `^0.8.21`. Existing lend code is untouched
and still compiles fine. **None of this affects SDK / TS code** — flag is
purely informational in case fork tests or contracts work surfaces.

## Status as of this handoff

- **Brainstorm:** committed at
  `docs/brainstorms/2026-05-08-borrow-pr3-sdk-borrow-provider-brainstorm.md`.
  All seven decisions locked.
- **Plan:** committed at
  `docs/plans/2026-05-11-feat-borrow-provider-sdk-plan.md`. Deepened
  with 11-agent review pass on 2026-05-11; Enhancement Summary at the
  top of the plan documents the corrections applied.
- **PR #2 (#457):** draft, in review. Local worktree at
  `/Users/kevin/github/optimism/actions-borrow-pr2` is authoritative for
  the deploy script + `deployments.json` shape until the PR merges.
- **PR #2 follow-up (gating Phase 4):** `deployments.json` must be
  extended to write `morpho.borrow.marketParams: { loanToken,
  collateralToken, oracle, irm, lltv }` alongside `marketId`. Phase 1-3
  of this PR's plan ship unblocked; **Phase 4 cannot start without the
  follow-up.**
- **No SDK code changes yet on this branch.** Next move: `/ce-work`
  against the plan, beginning at Phase 1.

## Useful resume commands

```bash
# Confirm where we are
git -C /home/orangekid/github/actions-borrow-pr3 status
git -C /home/orangekid/github/actions-borrow-pr3 log --oneline -10

# Diff PR #2 contributions (everything stacked on origin/main)
git -C /home/orangekid/github/actions-borrow-pr3 diff origin/main..HEAD --stat

# Read the lend provider (the closest sibling pattern)
$EDITOR /home/orangekid/github/actions-borrow-pr3/packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts

# Read PR #2's plan (still on this branch)
$EDITOR /home/orangekid/github/actions-borrow-pr3/docs/plans/2026-05-06-001-feat-morpho-borrow-market-deploy-plan.md

# Read PR #2's brainstorm
$EDITOR /home/orangekid/github/actions-borrow-pr3/docs/brainstorms/2026-05-05-borrow-pr2-oracle-and-market-deploy-brainstorm.md

# Pull the original 911-line plan (predates PRs #1 and #2)
git -C /home/orangekid/github/actions-borrow-pr3 show origin/kevin/borrow-spec:docs/plans/2026-04-16-feat-morpho-borrow-provider-plan.md | less

# Engineering principles
$EDITOR /home/orangekid/github/actions-borrow-pr3/AGENTS.md
$EDITOR /home/orangekid/github/actions-borrow-pr3/CONTRIBUTING.md
```
