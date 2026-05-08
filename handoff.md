# Handoff: Borrow PR #3 (SDK BorrowProvider)

> **Status: brainstorm in progress, mid-flight.** The previous agent ran
> partial `/ce-brainstorm` discovery + decision-laddering with the user
> but did **not** write a brainstorm doc to `docs/brainstorms/`. Pick up
> from "Brainstorm state — where we left off" below before doing anything
> else. Once the brainstorm doc lands, `git rm handoff.md` in a standalone
> commit (the PR #2 convention) and proceed to `/ce-plan` → `/ce-work`.

## Brainstorm state — where we left off

**Decisions resolved during the 2026-05-07 / 2026-05-08 sessions are
recorded under "Resolved decisions" below. Outstanding decisions are
listed at the end of this section. Sibling agents working on
subsequent borrow PRs (#391 backend, #392 frontend, #427 Aave) can
treat the resolved sections as load-bearing.**

## Resolved decisions

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

## Outstanding decisions (Decision 1 done; 5 to go)

- **Decision 2 — `closePosition` / repay shape.** Original plan: drop
  `partialShares` from `CloseBorrowMode`; use Morpho's
  `repay(shares=max)` convention to dodge the `toSharesUp` 1-wei-dust
  bug on full repayments. **Open sub-question: does `closePosition`
  also withdraw collateral on full repay?** (Decision 1 left this
  hanging — close-side asymmetry mitigation.)
- **Decision 3 — `amount` XOR `amountRaw` discriminated union (#379).**
  Issue is open and explicitly says *"same convention applied to new
  Borrow namespaces from day one."* Borrow params should ship with
  this from the start, not retrofit later.
- **Decision 4 — `BorrowMarketPosition` fields.** Health factor
  (decimal, not basis points) and liquidation price (USD) are
  first-class per #390. Lock exact field set + naming
  (`healthFactor`, `liquidationPrice`, `liquidationPriceFormatted`?).
  Reserve room for protocol-extension fields per forward-looking
  finding #5.
- **Decision 5 — Calldata pre-build validation surface.** Parent #390
  calls out validation as a new SDK capability. Use Morpho's
  `MarketParamsLib.id` / `getMarketId()` (per original plan) — public
  API: stand-alone helper, method on the provider, or both?
- **Decision 6 — Quote shape: immutable `BorrowQuote` with
  `withBorrowAmount(x)` builder vs simple object.** Original plan
  picked the immutable builder. Re-validate against current SDK
  conventions before adopting.

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

- PR #2 is merged-ready in draft state at PR #457; expect review iteration
  before merge.
- This branch (`kevin/borrow-pr3`) is at the same HEAD as PR #2's tip
  (`6febb45b`); diff against `origin/main` to see what PR #2 brought in.
- Worktree clean except this `handoff.md` (now committed for cross-agent
  pickup; delete once the brainstorm doc is written).
- No SDK code changes yet. Next move: resolve A-vs-B above (decisions
  #2–#6 from the original list still untouched: repay/closePosition
  shape, `amount` XOR `amountRaw` per #379, `BorrowMarketPosition`
  field set, `getMarketId` validation surface, `BorrowQuote` shape).
  Then write `docs/brainstorms/2026-05-08-borrow-pr3-sdk-borrow-provider-brainstorm.md`,
  then `/ce-plan` → `/ce-work`.

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
