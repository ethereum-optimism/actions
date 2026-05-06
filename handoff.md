# Handoff: Borrow PR #2 brainstorm in progress

> **MANDATORY cleanup before doing any other work:**
>
> Once you've finished reading this file and absorbed the context, you
> **MUST remove the handoff commit(s) from `kevin/borrow-pr2`'s git
> history** — not just delete the file, not just revert. The handoff is
> ephemeral context that must never appear in the PR diff.
>
> Steps (run from the worktree root):
>
> ```bash
> # 1. Identify every commit that touches handoff.md
> git log --oneline -- handoff.md
>
> # 2. If those commits are contiguous at HEAD (most common case),
> #    reset back past them. Example for a single handoff commit at HEAD:
> git reset --hard HEAD~1
> # If there are N handoff commits at HEAD: git reset --hard HEAD~N
>
> # 3. If handoff commits are interleaved with real work, rebase them out:
> git rebase -i origin/main   # then drop each handoff commit
>
> # 4. Force-push (with lease, to avoid clobbering anything you don't expect):
> git push --force-with-lease origin kevin/borrow-pr2
>
> # 5. Verify cleanup — both checks should return nothing:
> git log --oneline -- handoff.md
> ls handoff.md 2>/dev/null
> ```
>
> Force-pushing this **specific branch** (`kevin/borrow-pr2`) is
> authorized for this cleanup. Do NOT force-push `main` or any other
> branch. Do NOT amend or rewrite real work commits in the process —
> only the handoff commits should disappear.

This file is a context dump for the next agent picking up work on
**Borrow PR #2: dynamic oracle and demo borrow market deploy**
(GitHub issue [ethereum-optimism/actions#389](https://github.com/ethereum-optimism/actions/issues/389)).

The brainstorm document is captured at
`docs/brainstorms/2026-05-05-borrow-pr2-oracle-and-market-deploy-brainstorm.md`.
That doc is the authoritative summary of what's settled. This file gives
operational context: where we are in the workflow, what's still open, and
what the next agent should do.

## Workflow state

We are mid-`/workflows:brainstorm`, in **Phase 4 handoff**, after surfacing
the brainstorm doc's open-questions block but before transitioning to
`/workflows:plan`. The user paused to better understand the problem behind
the open questions; partial answers were captured in the conversation but
not yet written back into the brainstorm doc.

**Resume point:** offer the user the handoff options once they've finished
clarifying, write resolved answers into the brainstorm doc's "Resolved
Questions" section, then offer to run `/workflows:plan`.

## Repo / worktree context

- **Worktree path:** `/Users/kevin/github/optimism/actions-borrow-pr2`
- **Branch:** `kevin/borrow-pr2`
- **Base:** `origin/main` at `3f8f5f2c` (Merge PR #455, factory plan migration)
- **Upstream tracking:** set to `origin/kevin/borrow-pr2`
- **Sibling worktree** (where the conversation started): `/Users/kevin/github/optimism/actions-borrow` on branch `kevin/borrow-foundations` (this is leftover; PR #1 already merged)
- **Repo:** `ethereum-optimism/actions` (pnpm workspace monorepo, Node ≥18)

## What this PR is

**Scope (settled):**
1. New oracle for dUSDC (vault-shares) ↔ OP borrow market — implemented as
   Morpho's audited `MorphoChainlinkOracleV2` + a tiny ~30-LOC
   `MockChainlinkFeed.sol` returning a constant peg.
2. New `DeployMorphoBorrowMarket.s.sol` Forge script (sibling to existing
   `DeployMorphoMarket.s.sol`).
3. Extension of `packages/demo/contracts/script/deploy-demo.sh` to invoke
   the new script with the existing state-file idempotency pattern.
4. Extension of `packages/demo/contracts/state/deployments.json` schema:
   nested `morpho.borrow.{oracle, mockFeed, marketId}`.
5. CI: a new `verify-contracts` job (or inline in `deploy-demo.sh` —
   open question, see below).

**Explicitly out of scope** (deferred to later PRs / cleanup):
- Any SDK code (BorrowProvider / namespaces / types) — that's PR #3.
- Backend endpoints (PR #4), frontend tab (PR #5), e2e UX (PR #6).
- Slither CI job (deferred to a separate cleanup PR).
- `[profile.deep]` fuzz / invariant config in `foundry.toml`.
- TWAP wrapping or per-block delta cap on the oracle.
- AaveBorrowProvider deploy.

## Source materials

**GitHub issues** (read in this order):
1. `gh issue view 389 --repo ethereum-optimism/actions` — this PR.
2. `gh issue view 366 --repo ethereum-optimism/actions` — parent epic
   "Borrow support".
3. Siblings: `#388` (PR #1 — merged as #383, "Refactor: shared namespace
   foundations"), `#390` (PR #3, SDK BorrowProvider), `#391` (PR #4,
   backend), `#392` (PR #5, frontend), `#427` (PR #6, e2e UX).
4. Cross-cutting: `#379` (optional `*Raw` bigint params), `#380` (closed,
   engineering-principles docs), `#382` (closed, ActionsError hierarchy),
   `#396` (open, wallet-layer refactor parallel to provider pattern).

**Plan doc** (origin/kevin/borrow-spec branch, ~3 weeks old, written
2026-04-16 — predates PR #1's merge and has stale assumptions):
- `docs/plans/2026-04-16-feat-morpho-borrow-provider-plan.md` — 911 lines,
  full delivery plan across all 6 PRs.
- `docs/brainstorms/2026-04-15-morpho-borrow-provider-brainstorm.md`
- `docs/specs/borrow-provider-summary.md`
- `docs/specs/borrow-provider-detailed.md` — 2921 lines, deepest detail.
- `docs/specs/aave-borrow-provider.md` — for the eventual sibling provider.

To view: `git show origin/kevin/borrow-spec:docs/plans/2026-04-16-feat-morpho-borrow-provider-plan.md | less`.

**This brainstorm doc:** `docs/brainstorms/2026-05-05-borrow-pr2-oracle-and-market-deploy-brainstorm.md`
(in this branch).

## Critical deltas from the original plan

The plan was written before PR #1 merged. Several of its assumptions are
stale. **Read these carefully before implementing:**

1. **`MorphoLendProvider._getPosition` decimals fix** is already done in
   main (`packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts:221-238`,
   `resolveUnderlyingDecimals()`). Plan said do it in PR #2; drop it.
2. **`DeployMorphoMarket.s.sol` rename** to `…LendMarket` is misleading —
   that script already deploys vault + lend market + bootstraps a borrow.
   Decision: keep the name; add sibling `DeployMorphoBorrowMarket.s.sol`.
3. **`deploy-demo.sh` does not use `jq` or `flock`.** It uses node
   one-liners + stdout `parse_address`/`parse_bytes32` + per-key state
   guards (see `read_state` / `write_state` in the script). New step
   matches existing pattern; no `flock` (no concurrent writers). `CHAIN_ID`
   is hardcoded to `84532`.
4. **Oracle approach changed.** Plan called for a bespoke
   `DynamicVaultOracle.sol`. Decision (during brainstorm): use Morpho's
   audited `MorphoChainlinkOracleV2` (from
   `morpho-org/morpho-blue-oracles`) instantiated directly, paired with a
   tiny `MockChainlinkFeed.sol` returning a constant `latestRoundData`.
   - **Note:** Morpho's `MorphoChainlinkOracleV2Factory` only has a
     documented Ethereum-mainnet deployment. We deploy
     `MorphoChainlinkOracleV2` directly via `new` (no factory). The lib
     supports this; the factory is a convenience layer for CREATE2 +
     event-emission only.
   - **Decimals gotcha** (per Morpho's README): when `baseVault` is set,
     `baseTokenDecimals` is the **underlying asset's** decimals (USDC = 6),
     not the vault's (18). This is the single most likely place to
     introduce a 12-orders-of-magnitude bug — call it out with an inline
     comment in the deploy script.
5. **`FixedPriceOracle.sol`** in main is just a constant
   (`PRICE = 1e24`) — not a "scaling-formula reference contract" the plan
   referred to. Don't model the new oracle on it. The Morpho convention
   to anchor on (from `morpho-blue-oracles` README) is
   `price = collateralPrice × 1e36 × 10^loanDecimals / 10^collateralDecimals`.
6. **Existing lend market uses LLTV 94.5%** (line 18 of
   `DeployMorphoMarket.s.sol`), not the conservative tier. Don't take
   that as a precedent — it's a bootstrap-yield artifact in the
   opposite-direction market (OP collateral, USDC loan). Borrow market
   uses **86%** as a Morpho-enabled tier appropriate for yield-bearing
   collateral.
7. **Morpho contract addresses are CREATE2-deterministic and already
   moved out of `lend/`** to `packages/sdk/src/actions/shared/morpho/contracts.ts`.
   Plan's `EXPECTED_MORPHO_BLUE_FOR_CHAIN[chainId]` mapping is redundant.
8. **CI:** existing `check-contracts` job runs `forge build`+`forge test`
   from `packages/demo/contracts` and is standalone (no
   `install-and-build` dep). New job slots in alongside.

## Settled decisions (from brainstorm dialogue)

| Topic | Decision | Why |
|---|---|---|
| Brainstorm posture | Validate plan as-is, surface gaps only — but plan is not gospel; push back where reality has drifted. | User's explicit framing. |
| Scope | Oracle + market deploy + verify-contract. **No SDK code in PR #2.** | AGENTS.md "one domain per PR" + clean review surface. |
| Deploy script shape | Sibling `DeployMorphoBorrowMarket.s.sol`. `DeployMorphoMarket.s.sol` keeps its name. | Existing script does vault+lend+bootstrap; rename misleads. |
| Idempotency | Bash-side state guard only (skip forge invocation if `morpho.borrow.marketId` is set). | Matches lend step exactly; no concurrent writers. |
| Oracle | `MorphoChainlinkOracleV2` (Morpho-audited) + `MockChainlinkFeed.sol` (~30 LOC). Direct instantiation, not factory. | Reuses audited code; mainnet swap = one address change. |
| CI strictness | **Defer slither** to a follow-up PR. PR #2 ships verify-contract only. | Demo contracts disclaim production use; slither cleanup belongs in its own PR. |
| State schema | Append nested `morpho.borrow.{oracle, mockFeed, marketId}`; existing keys untouched. | Additive; no consumer migration. |
| Foundry deps | Add `morpho-org/morpho-blue-oracles` via `forge install` as a `lib/` submodule. | Matches existing pattern with `forge-std`, `solady`, `v4-periphery`. |

## Open questions (partially resolved)

These were posed to the user during brainstorm Phase 4. Partial answers
captured in conversation; **not yet written into the brainstorm doc's
"Resolved Questions" section** — that's the next agent's first job.

| # | Question | Status / answer |
|---|---|---|
| 1 | OP/USDC peg for the mock feed | **Answered: `1 OP = $0.10`.** Mock feed returns 1e7 at 8-dec (or 1e8 at 9-dec — confirm convention). At this peg, 100 USDC of dUSDC value gives a max-borrow of 860 OP at 86% LLTV. |
| 2 | Borrowable OP liquidity to seed | **Answered: 100k OP.** Approx 100 typical demo borrows before utilization gets interesting. |
| 3 | Donation-attack virtual-share seed amount | **Unanswered.** User asked for problem context; agent explained. Realistic options: 1 USDC floor, 100 USDC defensive, or skip (existing lend market deploy already seats the vault with 1M USDC, dwarfing donation-inflation). |
| 4 | Basescan API key / verify-contract shape | **Unanswered.** Three shapes surfaced: (a) CircleCI job on main (wasteful — verify is one-shot per deploy), (b) inline in `deploy-demo.sh` gated on `BASESCAN_API_KEY` env var (ties verify to deploy operationally), (c) document manual `forge verify-contract` in README. Recommendation: option (b). |
| 5 | Fork-test pin block on baseSepolia | Plan-phase research. Needs Morpho Blue + MetaMorpho factory + the existing demo vault to all exist at the pinned block. Pick a block from after `2026-04-15` (when current vault was deployed). |
| 6 | `baseTokenDecimals` value for the oracle | Plan-phase implementation detail. Per Morpho's README it must be the **underlying** decimals (USDC = 6), not vault decimals (18). Inline comment required. |

## What the next agent should do

1. **Continue the dialogue** (the user is asking for problem context, not
   yet ready to commit answers). When they're ready, capture answers to
   Q3 and Q4. Q5 and Q6 can stay as plan-phase research items.
2. **Move resolved Q&A into a `## Resolved Questions` section** at the
   bottom of `docs/brainstorms/2026-05-05-borrow-pr2-oracle-and-market-deploy-brainstorm.md`,
   leaving any genuinely-open items in the existing `## Open Questions`
   section.
3. **Offer Phase 4 handoff options** per the brainstorm workflow:
   - Review and refine the brainstorm doc (loads `document-review` skill)
   - Proceed to `/workflows:plan`
   - Ask more questions
   - Done for now
4. **If user proceeds to plan:** the plan must internalize all 8 deltas
   above. Things easy to get wrong:
   - Oracle decimals: `baseTokenDecimals = 6`, not 18.
   - Market id is `keccak256(abi.encode(MarketParams))` — depends on
     oracle address. Pin the oracle address in state before computing the
     id; don't recompute on each rerun.
   - Existing `morpho.oracle` key in `deployments.json` is currently
     `null` (the lend market deploy logs `Oracle:` but the bash flow
     doesn't always parse it). Don't rely on it.
   - Reuse `actions/shared/morpho/contracts.ts` for the Morpho Blue
     address (single source of truth) — but inside a Forge script you'll
     need to redeclare or load via FFI. A constant declared in the script
     plus a `require(constant == expected)` self-check is fine.
5. **Run `/workflows:plan`** — it should detect the brainstorm doc by
   filename pattern and use it as input.

## Useful commands for resuming

```bash
# Where we are
git -C /Users/kevin/github/optimism/actions-borrow-pr2 status
git -C /Users/kevin/github/optimism/actions-borrow-pr2 log --oneline -5

# Read the brainstorm
$EDITOR /Users/kevin/github/optimism/actions-borrow-pr2/docs/brainstorms/2026-05-05-borrow-pr2-oracle-and-market-deploy-brainstorm.md

# Re-read the original plan
git show origin/kevin/borrow-spec:docs/plans/2026-04-16-feat-morpho-borrow-provider-plan.md | less

# Confirm engineering principles still apply
$EDITOR /Users/kevin/github/optimism/actions-borrow-pr2/AGENTS.md
$EDITOR /Users/kevin/github/optimism/actions-borrow-pr2/CONTRIBUTING.md

# Existing lend market deploy (the sibling for the new borrow market)
$EDITOR /Users/kevin/github/optimism/actions-borrow-pr2/packages/demo/contracts/script/DeployMorphoMarket.s.sol
$EDITOR /Users/kevin/github/optimism/actions-borrow-pr2/packages/demo/contracts/script/deploy-demo.sh
$EDITOR /Users/kevin/github/optimism/actions-borrow-pr2/packages/demo/contracts/state/deployments.json
```

## Engineering principles that bear on this PR

From `AGENTS.md` / `CONTRIBUTING.md`:
- **One protocol version per provider, one domain per PR** — PR #2 is
  deploy/oracle, *not* the borrow provider. Don't sneak SDK code in.
- **Avoid pulling protocol SDKs unless they provide material correctness
  value** — using `morpho-blue-oracles` for the audited oracle qualifies.
  Avoid `@morpho-org/blue-sdk-viem` in the deploy script; raw viem is fine.
- **Tests required for every feature; don't mock pure utilities.**
- **No em-dashes** in committed text.
- **Run `pnpm changeset`** — only relevant if you touch `packages/sdk/`,
  which PR #2 does *not*.

## Status as of this handoff

- Worktree clean except this `handoff.md` and the brainstorm doc.
- Branch tracks `origin/kevin/borrow-pr2`.
- No code changes yet.
- Tasks: brainstorm dialog completed, brainstorm doc captured, awaiting
  user resolution of open Q3/Q4 to finalize and proceed to plan.
