---
title: "feat: Morpho borrow market deploy + dynamic oracle"
type: feat
status: active
date: 2026-05-06
origin: docs/brainstorms/2026-05-05-borrow-pr2-oracle-and-market-deploy-brainstorm.md
---

# feat: Morpho borrow market deploy + dynamic oracle

## Overview

Stand up the on-chain pieces for the borrow flow on baseSepolia: a
dUSDC-collateral / OP-loan Morpho Blue market, an oracle that tracks accrued
vault yield via `MorphoChainlinkOracleV2` + a constant-peg `MockChainlinkFeed`,
and an idempotent deploy step in `deploy-demo.sh`. No SDK code, no backend, no
frontend, no Basescan source verification (deferred). The borrow provider
skeleton lands in PR #3, not bundled here.

---

## Problem Frame

PR #1 (#383) shipped the shared lend/borrow namespace foundations. The next
step in the borrow track is the on-chain pieces the SDK provider will sit on
top of: a market with the *opposite* direction of the existing demo lend
market (dUSDC collateral instead of OP collateral), and an oracle whose
collateral-side price grows as dUSDC accrues yield. Without these, PR #3 has
nothing to integrate against.

A 911-line plan exists on `origin/kevin/borrow-spec` (written 2026-04-16).
Treat it as authoritative where main still matches; push back where main has
drifted (six load-bearing deltas captured in origin doc) or where the plan
over-engineers (bespoke oracle replaced with audited Morpho contract).

---

## Requirements Trace

- R1. Deploy a new Morpho Blue market on baseSepolia: dUSDC collateral, OP
  loan, 86% LLTV, adaptive-curve IRM.
- R2. Deploy an oracle that reads dUSDC `convertToAssets` so collateral value
  grows with vault yield.
- R3. Mock the OP/USDC peg via a Chainlink-shaped feed at 1 OP = $0.10
  (mainnet swap-in is one address change to a real feed).
- R4. Mint 100k OP and supply it to Morpho Blue as borrowable liquidity in
  the same forge run.
- R5. Wire the new step into `deploy-demo.sh` with the existing state-guard
  idempotency pattern; record results under nested
  `morpho.borrow.{oracle, mockFeed, marketId}`.
- R6. Fork-test the full deploy against a pinned baseSepolia block.
- R7. Stay within "one domain per PR" (`AGENTS.md`); no SDK, backend, or
  frontend changes.

---

## Scope Boundaries

- BorrowProvider SDK skeleton (PR #3).
- Backend borrow endpoints (PR #4).
- Frontend borrow tab (PR #5).
- Slither CI job (separate cleanup PR).
- Basescan source verification (follow-up if/when wanted).
- TWAP / per-block delta cap on the oracle (production hardening).
- Replacing the mock feed with a real Chainlink feed.
- AaveBorrowProvider deploy.
- Donation-attack `0x…dEaD` virtual-share seed (the 100k OP liquidity seed
  obviates it).
- `[profile.deep]` fuzz tuning in `foundry.toml`.

---

## Context & Research

### Relevant Code and Patterns

- `packages/demo/contracts/script/DeployMorphoLendMarket.s.sol`; sibling deploy
  script. Uses `vm.envOr("DEMO_USDC_ADDRESS", ...)` env-reuse pattern, logs
  `DemoUSDC:` / `DemoOP:` / `Vault:` / `Oracle:` for stdout parsing, and
  computes `marketId = keccak256(abi.encode(MarketParams))`. Mirror this
  shape; do not extend it.
- `packages/demo/contracts/src/FixedPriceOracle.sol`; used by the lend
  market. **Not** reused for the borrow market: it returns a hardcoded
  `1e23` (1 OP = $0.10) and does not read vault `convertToAssets`. The new
  oracle needs to track yield. The `1e23` constant was aligned to the
  borrow market's mock Chainlink peg as part of this PR (was `1e24`).
- `packages/demo/contracts/script/deploy-demo.sh`; orchestrator. Uses
  `read_state` / `write_state` node one-liners + `parse_address` /
  `parse_bytes32` regex. New step wires in identically.
- `packages/demo/contracts/state/deployments.json`; chain `84532` keyed
  state. Existing `morpho.oracle` is `null` (lend script logs it but the
  bash step doesn't always parse it back); do not rely on it; use the
  new nested `morpho.borrow.*` keys.
- `packages/demo/contracts/lib/`; existing submodules (`forge-std`,
  `solady`, `v4-periphery`). No `.gitmodules` file present (forge writes
  one on first install).
- `packages/demo/contracts/foundry.toml`; minimal default profile.
- `packages/demo/contracts/test/`; currently only `Faucet.t.sol`. Test
  conventions are still being established here; both new tests are
  greenfield within the package.
- `.circleci/config.yml:165-185`; existing `check-contracts` job runs
  `pnpm build` + `pnpm test` from `packages/demo/contracts`; no changes
  needed (it picks up new tests automatically).

### Institutional Learnings

- `docs/solutions/` does not exist in this repo; no prior learnings to lean
  on. Worth recording the decimals trap (R-id below) and idempotent-deploy
  pattern after merge via `/ce-compound`.

### External References

- Morpho's [`morpho-blue-oracles`](https://github.com/morpho-org/morpho-blue-oracles)
  README; formula and `MorphoChainlinkOracleV2` constructor docs.
- Morpho's `MorphoChainlinkOracleV2Factory` is documented as Ethereum-mainnet
  only; we instantiate `MorphoChainlinkOracleV2` directly via `new` (the
  factory is a CREATE2 + event convenience layer, not load-bearing).

---

## Key Technical Decisions

- **Oracle: `MorphoChainlinkOracleV2` + `MockChainlinkFeed` direct
  construction.** Reuses ~80 LOC of audited Solidity in exchange for ~30 LOC
  of trivial mock; mainnet swap-in is a one-line address change.
- **Mock feed shape: Chainlink-V3 `latestRoundData` returning a constant.**
  Stored at construction; immutable. 8 decimals (Chainlink convention).
  Peg value = `1e7` (representing 1 OP = $0.10 in 8-dec Chainlink format,
  matching the resolved Q1 value).
- **Oracle wiring: mock feed lives in `quoteFeed1` slot (OP/USD).**
  `baseFeed1`/`baseFeed2`/`quoteFeed2` set to `address(0)` (Morpho treats as
  `1`). USDC ≈ USD so no base feed is needed. Net effect: oracle returns
  `dUSDC.convertToAssets(1) × 1 / 0.10` denominated in OP; i.e., dUSDC
  collateral value grows with vault yield, divided by the OP peg.
- **`baseTokenDecimals = 6` (USDC underlying), NOT 18 (vault).** This is
  the single most likely 12-orders-of-magnitude bug in this PR. Inline
  comment required at the constructor call site.
- **`baseVaultConversionSample = 1e18`**; sample size for the vault
  conversion ratio. 1e18 is the standard for 18-dec ERC-4626 vaults.
- **LLTV 86%.** Morpho-enabled tier appropriate for yield-bearing
  collateral. The lend market's 94.5% is a bootstrap-yield artifact in the
  opposite direction; do not take it as a precedent.
- **Idempotency via bash-side state guard only.** Skip the forge invocation
  when `morpho.borrow.marketId` is already set. On stale-state vs chain
  truth, Morpho Blue reverts with `MARKET_ALREADY_CREATED`; operator
  manually clears the stale key. Matches lend step exactly.
- **State schema: nested `morpho.borrow.{oracle, mockFeed, marketId}`.**
  Additive; no consumer migration. Existing `morpho.vault` and (null)
  `morpho.oracle` keys untouched.
- **Liquidity seed: 100k OP minted by deployer and supplied to Morpho Blue
  in the same script.** No faucet, no separate transaction. Same pattern as
  the lend bootstrap.
- **Foundry deps: add `morpho-org/morpho-blue-oracles` as a `lib/` submodule
  via `forge install`.** Avoids vendoring; matches existing pattern.
- **Borrow market itself does not need a bootstrap supply.** dUSDC
  collateral is provided organically when the SDK runs. The 100k OP seed
  alone is enough to make the market non-empty post-deploy.

---

## Open Questions

### Resolved During Planning

- **OP/USDC peg value (origin Q1)**; Resolved at 1 OP = $0.10. Encoded as
  `1e7` in the 8-decimal `latestRoundData.answer`.
- **Liquidity seed size (origin Q2)**; 100k OP.
- **Donation-attack mitigation (origin Q3)**; Skipped; 100k OP seed makes
  the market non-empty.
- **Verify-contract shape (origin Q4)**; Skipped entirely in this PR.
- **`baseTokenDecimals` value (origin Q6)**; Pinned at 6 (USDC underlying).
- **Mock-feed slot in oracle wiring**; `quoteFeed1` (OP/USD); base slots
  set to `address(0)`.
- **Mock-feed decimals**; 8 (Chainlink standard).
- **`baseVaultConversionSample`**; `1e18`.

### Deferred to Implementation

- **Fork-test pin block (origin Q5)**; Pick a baseSepolia block number
  after 2026-04-15 (current vault deploy) where Morpho Blue, MetaMorpho
  factory, and the existing demo vault all exist. Confirm at implementation
  time by querying chain history (e.g., via `cast block-number` against an
  archive RPC); the implementer should hardcode the chosen block in the
  fork-test setUp.
- **Exact Morpho Blue + MetaMorpho factory addresses for fork test**;
  Reuse the constants already in `DeployMorphoLendMarket.s.sol` (`MORPHO`,
  `METAMORPHO_FACTORY_V1_1`, `IRM`); no chain mapping needed.
- **Mock-feed `roundId` / `startedAt` / `updatedAt` / `answeredInRound`
  values**; Morpho's `MorphoChainlinkOracleV2` does not validate freshness,
  so static values (e.g., `block.timestamp` at deploy) are fine; pin
  whatever passes default `forge test` warnings.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for
> review, not implementation specification. The implementing agent should
> treat it as context, not code to reproduce.*

```
                                   ┌────────────────────────────┐
                                   │  deploy-demo.sh (Step 4)   │
                                   │  guard: morpho.borrow.     │
                                   │         marketId already?  │
                                   └────────────┬───────────────┘
                                                │ if absent
                                                ▼
                            forge script DeployMorphoBorrowMarket
                                                │
            ┌───────────────────────────────────┼───────────────────────────┐
            ▼                                   ▼                           ▼
    new MockChainlinkFeed         new MorphoChainlinkOracleV2          mint 100k OP
    (answer = 1e7, dec = 8)       (baseVault   = dUSDC vault           supply to
            │                      baseTokenDec = 6  ← USDC, not 18!    Morpho Blue
            └──────► quoteFeed1   baseVaultConversionSample = 1e18      borrowable
                                  quoteFeed1   = mockFeed                liquidity
                                  base/other Feeds = address(0))
                                                │
                                                ▼
                            IMorpho.createMarket(MarketParams{
                              loanToken:       OP,
                              collateralToken: dUSDC vault address,
                              oracle:          oracle,
                              irm:             IRM,
                              lltv:            86e16
                            })
                                                │
                                                ▼
                                stdout: BorrowMockFeed: 0x...
                                        BorrowOracle:   0x...
                                        BorrowMarketId: 0x... (bytes32)
                                                │
                                                ▼
                            deploy-demo.sh parses + write_state:
                              morpho.borrow.mockFeed
                              morpho.borrow.oracle
                              morpho.borrow.marketId
```

Read direction: top-to-bottom. The bash guard is the only idempotency layer;
the forge script itself is unconditional once invoked.

---

## Implementation Units

- [ ] U1. **Add `morpho-blue-oracles` submodule and remappings**

**Goal:** Bring Morpho's audited oracle into the Foundry build path so U2
and U3 can compile against it.

**Requirements:** R2

**Dependencies:** None

**Files:**
- Modify: `packages/demo/contracts/.gitmodules` (created on first
  `forge install`)
- Create: `packages/demo/contracts/lib/morpho-blue-oracles/` (submodule)
- Modify: `packages/demo/contracts/foundry.toml` (add remapping line if
  needed; check whether `morpho-blue-oracles` resolves out of the box)
- Modify: `packages/demo/contracts/remappings.txt` (create only if foundry
  doesn't auto-resolve from `lib/`)

**Approach:**
- Run `forge install morpho-org/morpho-blue-oracles --no-commit` from
  `packages/demo/contracts/`. Pin to a tagged release if one exists;
  otherwise the implementer picks a recent commit and records it.
- Verify `import {MorphoChainlinkOracleV2} from "morpho-blue-oracles/src/morpho-chainlink/MorphoChainlinkOracleV2.sol";`
  resolves with `forge build`. If it doesn't, add an explicit remapping.

**Patterns to follow:**
- Existing `lib/forge-std`, `lib/solady`, `lib/v4-periphery`; same
  install path; no special remappings used today.

**Test scenarios:**
- Test expectation: none; pure dependency wiring with no behavior of its
  own. U2 and U3 verify the dependency works end-to-end.

**Verification:**
- `forge build` succeeds from `packages/demo/contracts/`.
- `git status` shows `.gitmodules` and `lib/morpho-blue-oracles/` as new.

---

- [ ] U2. **Implement `MockChainlinkFeed.sol`**

**Goal:** Provide a 30-LOC Chainlink-V3-shaped feed that returns a constant
`latestRoundData` representing the OP/USD peg. Used by the borrow oracle
today; swappable for a real feed when one becomes available on baseSepolia.

**Requirements:** R3

**Dependencies:** None (independent of U1)

**Files:**
- Create: `packages/demo/contracts/src/MockChainlinkFeed.sol`
- Test: `packages/demo/contracts/test/MockChainlinkFeed.t.sol`

**Approach:**
- Implement `AggregatorV3Interface` (4 methods: `decimals`, `description`,
  `version`, `latestRoundData`). Constructor takes `(int256 answer,
  uint8 decimals)` and stores them as immutables. `latestRoundData` returns
  `(0, answer, block.timestamp at deploy, block.timestamp at deploy, 0)`.
- No setters, no admin role, no upgradeability. Truly immutable.

**Patterns to follow:**
- Solidity style of `packages/demo/contracts/src/FixedPriceOracle.sol`
  (concise NatSpec, no inheritance ceremony). Match SPDX header and pragma
  (`^0.8.26`).

**Test scenarios:**
- Happy path: deploying with `(1e7, 8)` then calling `latestRoundData()`
  returns `(_, 1e7, _, _, _)` and `decimals()` returns `8`.
- Happy path: `description()` returns a non-empty string and `version()`
  returns `1` (or whatever Chainlink convention dictates; confirm in U2).
- Edge case: `answer` is preserved even when `decimals` is `0` (defensive
  immutability check on the storage layout).

**Verification:**
- `forge test --match-contract MockChainlinkFeedTest` passes.

---

- [ ] U3. **Implement `DeployMorphoBorrowMarket.s.sol`**

**Goal:** Deploy the `MockChainlinkFeed`, the `MorphoChainlinkOracleV2`, the
Morpho Blue market, and seed 100k OP of borrowable liquidity, all in one
forge broadcast. Log each address in a format `deploy-demo.sh` can parse.

**Requirements:** R1, R2, R3, R4, R7

**Dependencies:** U1, U2

**Files:**
- Create: `packages/demo/contracts/script/DeployMorphoBorrowMarket.s.sol`

**Approach:**
- Mirror `DeployMorphoLendMarket.s.sol`'s shape: top-level constants, optional
  env-var reuse for `DEMO_VAULT_ADDRESS` and `DEMO_OP_ADDRESS`, single
  `vm.startBroadcast()` … `vm.stopBroadcast()` block, `console.log` each
  output address.
- Constants:
  - `LLTV = 86e16` (86%, Morpho-enabled tier)
  - `BORROWABLE_OP = 100_000e18` (100k OP)
  - `MOCK_FEED_ANSWER = 1e7` (OP/USD at $0.10, 8 decimals)
  - `MOCK_FEED_DECIMALS = 8`
  - `BASE_VAULT_CONVERSION_SAMPLE = 1e18`
  - `BASE_TOKEN_DECIMALS = 6` ← inline comment: "USDC underlying, NOT vault"
  - `QUOTE_TOKEN_DECIMALS = 18` (OP)
  - Reuse `MORPHO`, `METAMORPHO_FACTORY_V1_1`, `IRM` from sibling script
    (or move to a shared constants file; defer that refactor).
- Construct the oracle with: `baseVault = vault`, `baseFeed1 = baseFeed2 = address(0)`,
  `quoteFeed1 = mockFeed`, `quoteFeed2 = address(0)`,
  `baseVaultConversionSample = 1e18`, `baseTokenDecimals = 6`,
  `quoteTokenDecimals = 18`, `quoteVault = address(0)`,
  `quoteVaultConversionSample = 1`. Emit `BorrowOracle: <addr>` to stdout.
- `IMorpho.createMarket(MarketParams{loanToken: OP, collateralToken: vault,
  oracle: oracle, irm: IRM, lltv: 86e16})`. Compute and emit
  `BorrowMarketId: <bytes32>` via `keccak256(abi.encode(marketParams))`.
- Mint 100k OP to deployer, approve to `MORPHO`, call
  `IMorpho.supply(marketParams, BORROWABLE_OP, 0, deployer, "")` to seat
  borrowable liquidity.
- Stdout labels for `parse_*` functions: `BorrowMockFeed:`, `BorrowOracle:`,
  `BorrowMarketId:`.

**Technical design:** *(directional)*

```solidity
// At the oracle constructor; load-bearing comment:
new MorphoChainlinkOracleV2(
    IERC4626(vault),       // baseVault
    1e18,                   // baseVaultConversionSample
    AggregatorV3Interface(address(0)), // baseFeed1
    AggregatorV3Interface(address(0)), // baseFeed2
    6,                      // baseTokenDecimals; USDC underlying, NOT vault's 18
    IERC4626(address(0)),  // quoteVault
    1,                      // quoteVaultConversionSample
    AggregatorV3Interface(mockFeed),   // quoteFeed1; OP/USD peg
    AggregatorV3Interface(address(0)), // quoteFeed2
    18                      // quoteTokenDecimals
);
```

**Patterns to follow:**
- `packages/demo/contracts/script/DeployMorphoLendMarket.s.sol` for env reuse,
  logging, and broadcast structure.
- Imports of `IMorpho` / `MarketParams` from
  `packages/demo/contracts/src/interfaces/IMorpho.sol`.

**Test scenarios:**
- Covered in U4 (fork test). The script is not unit-tested directly; its
  meaningful behavior only emerges against a real chain state.

**Verification:**
- `forge build` succeeds.
- Manual run against a baseSepolia fork (covered by U4) emits all three
  expected stdout labels and creates a market.

---

- [ ] U4. **Fork test: `DeployMorphoBorrowMarket.t.sol`**

**Goal:** Prove end-to-end that the deploy script creates a market with a
working oracle against a real baseSepolia state, and that re-running the
script does not double-broadcast (idempotency from the bash side is
verified separately).

**Requirements:** R1, R2, R6

**Dependencies:** U3

**Files:**
- Test: `packages/demo/contracts/test/DeployMorphoBorrowMarket.t.sol`

**Approach:**
- `setUp()` forks baseSepolia at a pinned block (deferred to implementation
 ; see Open Questions).
- Use `vm.deal` / `vm.startPrank` to simulate a deployer account.
- Invoke the script's `run()` directly (forge convention); no broadcast on
  fork.
- Assert market id, oracle address, and that oracle returns a plausible
  price at the pinned block.

**Execution note:** Test-first encouraged here; the oracle wiring is the
single highest-risk piece in this PR, so writing the price assertion first
and watching it fail until the oracle is wired correctly is the most
direct way to catch a decimals slip.

**Patterns to follow:**
- `forge-std/Test.sol` conventions; mirror any setup helpers from
  `packages/demo/contracts/test/Faucet.t.sol`.

**Test scenarios:**
- Covers R1: full script run against fork creates a market whose id matches
  `keccak256(abi.encode(marketParams))`. Inputs: pinned block + deployer
  account → expected: `Morpho.market(id).lastUpdate != 0`.
- Covers R2: oracle's returned price is within 10% of the hardcoded peg
  (`1 dUSDC ≈ 10 OP` at $0.10/OP, accounting for whatever vault yield has
  accrued by the pinned block).
- Edge case (decimals trap): if `baseTokenDecimals` is mistakenly `18`
  instead of `6`, the oracle price will be off by `1e12`. Test scenario:
  `assertApproxEqRel(oraclePrice, expectedPrice, 0.1e18)` will fail loudly,
  surfacing the trap.
- Integration: after the script runs, deployer's OP balance dropped by
  exactly 100k (or stays at 0 if mint went straight to Morpho).
- Integration: market is borrowable; `IMorpho.market(id).totalSupplyAssets`
  ≥ 100k OP after the run.

**Verification:**
- `forge test --match-contract DeployMorphoBorrowMarketTest --fork-url <baseSepolia RPC>`
  passes from `packages/demo/contracts/`.
- The same test passes under the existing `check-contracts` CI job
  (CI provides an RPC env var or default; verify at implementation time
  whether the existing config has one).

---

- [ ] U5. **Wire borrow market step into `deploy-demo.sh` and extend state schema**

**Goal:** Add a Step 5 ("Deploy Morpho Borrow Market") to the deploy
orchestrator that mirrors the existing lend step exactly: state-guard,
forge invocation, parse stdout, write nested state. Bump the JSON schema
to include the new keys.

**Requirements:** R5, R7

**Dependencies:** U3 (script must exist for orchestrator to call it)

**Files:**
- Modify: `packages/demo/contracts/script/deploy-demo.sh`
- Modify: `packages/demo/contracts/state/deployments.json`

**Approach:**
- Insert Step 5 after the existing Step 4 ("Deploy Velodrome Pool"); order
  is independent, but place it adjacent to the lend Step 2 if scripts are
  reorganized; otherwise append.
- Guard: `MARKET_ID=$(read_state "morpho.borrow.marketId")`. If non-empty,
  skip; else invoke. Read existing `VAULT_ADDR` from earlier step (no new
  env plumbing).
- Forge invocation:
  `DEMO_VAULT_ADDRESS="$VAULT_ADDR" DEMO_OP_ADDRESS="$OP_ADDR" forge script
  script/DeployMorphoBorrowMarket.s.sol:DeployMorphoBorrowMarket
  "${FORGE_ARGS[@]}" --broadcast`.
- Parse: `BORROW_ORACLE_ADDR=$(parse_address "BorrowOracle:" "$OUTPUT")`,
  `BORROW_FEED_ADDR=$(parse_address "BorrowMockFeed:" "$OUTPUT")`,
  `BORROW_MARKET_ID=$(parse_bytes32 "$OUTPUT")`. Note: `parse_bytes32`
  takes the *first* bytes32 line; if the output emits multiple, scope the
  match. Confirm the script only emits one bytes32 line (the market id) or
  prefix the label.
- Write: `write_state "morpho.borrow.oracle" "$BORROW_ORACLE_ADDR"`,
  `write_state "morpho.borrow.mockFeed" "$BORROW_FEED_ADDR"`,
  `write_state "morpho.borrow.marketId" "$BORROW_MARKET_ID"`. The existing
  `write_state` already handles dotted-path nesting (see lines 42-53 of
  the script).
- `state/deployments.json` schema bump: add an empty `"borrow": {}` skeleton
  under `"morpho"` so a fresh deployer sees the shape, but it is not
  load-bearing; `write_state` will create the path on first run regardless.

**Patterns to follow:**
- Existing Step 2 (Morpho Market); same `read_state` guard, env var
  injection, `parse_*` helpers, and `write_state` calls.

**Test scenarios:**
- Test expectation: none; bash plumbing without behavior of its own.
  Manual smoke-test plus U4's fork test cover the end-to-end behavior.

**Verification:**
- Running `./script/deploy-demo.sh --rpc-url <X> --private-key <Y>` against
  a fresh state file deploys the borrow market and writes
  `morpho.borrow.{oracle, mockFeed, marketId}`.
- Re-running the same command emits `>>> Borrow market already deployed:
  marketId=<X>` and skips the forge invocation.

---

## System-Wide Impact

- **Interaction graph:** Borrow market is its own Morpho Blue market;
  independent of the lend market. No callbacks back into existing code; the
  oracle reads `convertToAssets` on the lend market's vault, but that's a
  pure read.
- **Error propagation:** `IMorpho.createMarket` reverts with
  `MARKET_ALREADY_CREATED` if state is stale. Operator clears
  `morpho.borrow.marketId` from `deployments.json` and re-runs. Document
  this in PR description.
- **State lifecycle risks:** Re-running `deploy-demo.sh` mid-flight (e.g.,
  after the script wrote `oracle` but before `marketId`) would re-broadcast
  the oracle deploy on the next run. Acceptable; wastes ~1¢ of testnet
  ETH; not a correctness issue. The same risk exists for lend.
- **API surface parity:** None. PR #2 adds no SDK/backend/frontend surface.
- **Integration coverage:** U4's fork test is the only cross-layer
  guarantee. If the fork test passes but mainnet behavior differs, the
  cause will almost certainly be the decimals trap or a wrong Morpho
  address; both surfaced by the test.
- **Unchanged invariants:** The existing lend market (`morpho.vault`,
  `morpho.oracle`) is untouched on already-deployed chains. On fresh
  redeploys, its `FixedPriceOracle` now returns `1e23` (1 OP = $0.10)
  instead of `1e24` (1:1) so both markets share one peg. The bootstrap
  borrow (999k USDC against 100M OP collateral at 94.5% LLTV) still has
  ~10× headroom under the new price.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `baseTokenDecimals` set to 18 (vault) instead of 6 (USDC underlying); would skew oracle price by 1e12. | Inline comment at the constructor call site; U4's price-within-10%-of-peg assertion fails loudly if the trap fires. |
| `quoteFeed1` placement is wrong direction (collateral grows in wrong axis). | U4 fork test asserts `oraclePrice ≈ 10 × 1e36` (1 dUSDC = 10 OP at $0.10/OP); a flipped slot would assert `0.1 × 1e36`. |
| Morpho Blue / MetaMorpho factory addresses drift between baseSepolia and where the script's hardcoded constants point. | Reuse the constants from the existing lend script (already validated against current baseSepolia deployments); no new chain mapping. |
| `parse_bytes32` matches the wrong bytes32 line if the script emits >1. | The script only logs one bytes32 (`BorrowMarketId:`); enforced by U3 review and U4 stdout assertion. |
| Submodule pinning drift (Morpho's oracle repo updates). | Pin to a tagged release at `forge install` time; record commit in PR description. |
| Fork test flakiness against pinned block (RPC archive coverage). | Pick a recent block; if RPC drops the block from archive, bump the pin in a follow-up. |

---

## Documentation / Operational Notes

- PR description must call out the `MARKET_ALREADY_CREATED` recovery
  procedure (clear `morpho.borrow.marketId` and re-run).
- After merge, run `/ce-compound` to capture the decimals trap, the
  state-guard idempotency pattern, and the "audit-Morpho-not-bespoke-oracle"
  decision into `docs/solutions/`.
- No `pnpm changeset` needed; PR #2 does not touch `packages/sdk/`.

---

## Sources & References

- **Origin document:** `docs/brainstorms/2026-05-05-borrow-pr2-oracle-and-market-deploy-brainstorm.md`
- Existing lend script:
  `packages/demo/contracts/script/DeployMorphoLendMarket.s.sol`
- Orchestrator:
  `packages/demo/contracts/script/deploy-demo.sh`
- State file:
  `packages/demo/contracts/state/deployments.json`
- CI: `.circleci/config.yml:165-185` (`check-contracts` job picks up new
  tests automatically)
- GitHub issue: [ethereum-optimism/actions#389](https://github.com/ethereum-optimism/actions/issues/389)
- Parent epic: [ethereum-optimism/actions#366](https://github.com/ethereum-optimism/actions/issues/366)
- External: `morpho-org/morpho-blue-oracles` README (oracle formula,
  factory caveat)
