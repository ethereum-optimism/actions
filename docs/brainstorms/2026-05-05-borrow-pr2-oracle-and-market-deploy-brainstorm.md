---
date: 2026-05-05
topic: borrow-pr2-oracle-and-market-deploy
related:
  - https://github.com/ethereum-optimism/actions/issues/389
  - https://github.com/ethereum-optimism/actions/issues/366
  - docs/plans/2026-04-16-feat-morpho-borrow-provider-plan.md (origin/kevin/borrow-spec)
---

# Borrow PR #2: dynamic oracle and demo borrow market deploy

## What We're Building

The second sub-PR in the borrow track. Stands up the on-chain pieces the
SDK's borrow provider (PR #3) will sit on top of: a dUSDC-collateral / OP-loan
Morpho Blue market, an oracle that tracks accrued vault yield, an idempotent
deploy step in `deploy-demo.sh`, and a CircleCI verify-contract job. No SDK
code, no backend, no frontend. baseSepolia only.

The borrow narrative: a user supplies USDC into the existing demo lending
vault, receives dUSDC vault shares, then borrows OP against those shares in a
**separate** Morpho Blue market whose oracle reads the vault's
`convertToAssets` so collateral value grows with vault yield.

## Why This Approach

A heavyweight plan already exists at
`docs/plans/2026-04-16-feat-morpho-borrow-provider-plan.md` (on
`origin/kevin/borrow-spec`, 911 lines). Treating it as authoritative
where reality matches; pushing back where main has drifted since 2026-04-16
or where the plan over-engineers.

### Deltas from the plan (load-bearing)

1. **Dropped:** `MorphoLendProvider._getPosition` decimals fix. PR #1 (#383)
   already shipped `resolveUnderlyingDecimals()` at
   `packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts:221-238`.
2. **Dropped:** Renaming `DeployMorphoMarket.s.sol` →
   `DeployMorphoLendMarket.s.sol`. The existing script deploys vault + market
   + bootstraps borrow yield in one shot — the rename would be misleading and
   add `deploy-demo.sh` + README churn for no semantic gain.
3. **Replaced:** Bespoke `DynamicVaultOracle.sol` swapped for Morpho's
   audited `MorphoChainlinkOracleV2` (from `morpho-org/morpho-blue-oracles`)
   wired to a tiny `MockChainlinkFeed.sol`. Reuses code that already handles
   ERC-4626 vault shares + decimals scaling correctly; mainnet swap-in is
   one address change (mock feed → real Chainlink feed). Our owned attack
   surface shrinks from ~80 LOC of bespoke solidity to ~30 LOC of trivial
   mock.
4. **Dropped:** `flock state/.lock` + `jq` JSON-artifact handoff in
   `deploy-demo.sh`. Existing script uses node one-liners and stdout
   `parse_address`/`parse_bytes32`; no concurrent writers; no need to
   modernize as a side-effect of PR #2.
5. **Deferred:** Slither CI job. Demo contracts explicitly disclaim production
   use (`README.md:3`); a noisy slither rollout fits a dedicated cleanup PR
   better than this one. PR #2 ships verify-contract only.
6. **Deferred:** `[profile.deep]` in `foundry.toml`. Default fuzz runs are
   sufficient for the small surface PR #2 introduces.

## Key Decisions

- **Scope = oracle + market deploy + verify-contract CI. No SDK code.**
  Per `AGENTS.md:66` "one domain per PR" — the borrow provider skeleton lands
  in PR #3, not bundled here.
- **Oracle: `MorphoChainlinkOracleV2` (Morpho-audited) +
  `MockChainlinkFeed.sol` (~30 LOC).** Composed via direct construction in
  the deploy script, not via Morpho's factory (the factory's listed
  deployment is Ethereum-mainnet only; direct `new` works on any chain). The
  mock feed returns a constant `latestRoundData` representing the OP/USDC
  peg; oracle picks up vault yield via the `baseVault` +
  `baseVaultConversionSample` parameters.
- **Market: dUSDC collateral, OP loan, LLTV 86%, adaptive-curve IRM,
  Morpho Blue on baseSepolia.** LLTV 86% is a Morpho-enabled tier and
  conservative for yield-bearing collateral; the existing lend market uses
  94.5% in the opposite direction (OP collateral, USDC loan) and is a
  bootstrap-only artifact, not a precedent.
- **Deploy script: sibling `DeployMorphoBorrowMarket.s.sol`.** Reads
  `DEMO_VAULT_ADDRESS` + `DEMO_OP_ADDRESS` from env (matching the existing
  script's `DEMO_USDC_ADDRESS` + `DEMO_OP_ADDRESS` pattern). Logs
  `BorrowOracle:`, `BorrowMockFeed:`, and the market id as a bytes32 line
  for `parse_bytes32` to pick up.
- **Idempotency: bash-side state guard only.** Skip the forge invocation if
  `state/deployments.json` already records `morpho.borrow.marketId`. On
  stale state file vs chain truth, Morpho Blue reverts with
  `MARKET_ALREADY_CREATED` — operator clears the stale key and re-runs.
  Matches the lend market step exactly.
- **State schema: nested `morpho.borrow.{oracle, mockFeed, marketId}`** in
  `state/deployments.json`, leaving `morpho.vault` and the existing (currently
  null) `morpho.oracle` key untouched. Additive change; no consumer migration.
- **Donation-attack mitigation: ≥ 1 USD-equivalent virtual share supply seeded
  to `0x…dEaD`** in the same forge run, before any user-facing liquidity.
  Plan's choice; still applies because vault-share inflation is independent
  of which oracle reads it.
- **Liquidity seed: deployer mints OP and supplies directly to Morpho Blue**
  as borrowable liquidity. No faucet. Same pattern as the existing lend
  market's bootstrap.
- **Foundry deps: add `morpho-org/morpho-blue-oracles` as a `lib/` submodule**
  via `forge install`. Avoids vendoring; matches existing pattern with
  `forge-std`, `solady`, `v4-periphery`.
- **CI: one new `verify-contracts` job** running on main-branch merges, using
  forge's `broadcast/.../run-latest.json` + Basescan API key. Slot alongside
  existing `check-contracts` job (no dep change off `install-and-build`).

## Test Strategy

PR #2 contracts test scope (replaces the plan's 11-test suite for
`DynamicVaultOracle`):

- `MockChainlinkFeed.t.sol` — happy-path `latestRoundData`, `decimals()`,
  immutability of `answer`. ~3 tests, trivial.
- `DeployMorphoBorrowMarket.t.sol` — fork test against a baseSepolia fork
  pinned at a recent block: full script run, assert market id matches
  expected hash, assert oracle returns plausible price (within 10% of the
  hardcoded peg), assert idempotency by re-running and checking no duplicate
  tx is broadcast.
- No fuzz, no invariant. Default `forge test`.

## Open Questions

(To resolve in `/workflows:plan` before implementation.)

1. **OP/USDC peg value** baked into the mock feed: 1 OP = $1 (clean demo
   math) or 1 OP ≈ current real price (realistic but ages poorly)? Once
   chosen, oracle is immutable — drift requires redeploying oracle + creating
   a new market id.
2. **Liquidity seed size**: how much OP to mint and supply as borrowable
   inventory? Plan didn't pin a number.
3. **Virtual-share donation seed amount**: floor at exactly 1 USD-equivalent,
   or 10×/100× to be defensive? Plan said "≥ 1 USD-equivalent."
4. **Verify-contract API key**: where does the Basescan API key live in
   CircleCI? Existing config has none. Need to coordinate with the
   project-secrets owner before merging the CI job.
5. **Fork-test pin block**: which baseSepolia block do we pin the fork test
   against? Needs Morpho Blue + MetaMorpho factory + the existing demo vault
   to all exist at that block.
6. **`baseTokenDecimals` for the oracle**: per Morpho's README, this is the
   *underlying* asset's decimals (USDC = 6), not the vault's (18). Confirm
   in plan and add an inline comment in the deploy script — this is the
   single most likely place to introduce a 12-orders-of-magnitude bug.

## Out of Scope (deferred to later PRs or follow-ups)

- `BorrowProvider` SDK skeleton (PR #3).
- Backend borrow endpoints (PR #4).
- Frontend borrow tab (PR #5).
- Slither CI job (separate cleanup PR).
- TWAP / per-block delta cap on the oracle (production hardening).
- Replacing the mock feed with a real Chainlink feed when a baseSepolia or
  base mainnet feed is available.
- AaveBorrowProvider deploy.

## Next Steps

→ `/workflows:plan` to translate the decisions above into a step-by-step
implementation plan with concrete file diffs, env-var setup for the verify
job, and the calibration values for items 1–5 in Open Questions.
