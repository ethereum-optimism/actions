# Handoff: Borrow PR #4 (demo backend borrow endpoints)

> **Status: not started.** Run `/ce-brainstorm` → `/ce-plan` → `/ce-work`
> from scratch. Treat any pre-existing brainstorm/plan docs in this tree
> as **historical artifacts, not gospel** — they predate PRs #1–#3 and
> are likely out of sync with what actually shipped. Always re-read the
> code that landed before adopting any design decision from old docs.
> Once the brainstorm doc lands, `git rm handoff-pr4.md` (this file —
> **do not touch other branches' handoff files**) in a standalone
> commit and proceed.

## Why this file is named `handoff-pr4.md`

PRs #4 / #5 / #6 are stacked branches developed in parallel. Each
branch carries **one and only one** handoff doc named after itself:

- `kevin/borrow-pr4` → `handoff-pr4.md` (this file)
- `kevin/borrow-pr5` → `handoff-pr5.md`
- `kevin/borrow-pr6` → `handoff-pr6.md`

Per-branch names prevent rebase conflicts: when each branch deletes
its own handoff post-brainstorm, downstream rebases see clean
delete/no-touch operations instead of edit/edit collisions on a
shared filename. **Touch only `handoff-pr4.md` from this branch.**
You may *read* `handoff-pr5.md` / `handoff-pr6.md` if they propagate
down via rebase to understand sibling work, but never edit them
here.

(`handoff.md` belongs to PR #3; ignore it on this branch — PR #3
will delete it on its own.)

## What this PR is

**Borrow PR #4 — demo backend `/borrow` endpoints**
(GitHub issue [ethereum-optimism/actions#391](https://github.com/ethereum-optimism/actions/issues/391)).

Expose the SDK's borrow surface (shipped in PR #3) through the demo
backend so the frontend (PR #5) can drive it. Backend-only work inside
`packages/demo/backend/`. **No** SDK changes, no contracts, no
frontend.

### Problems to solve (from #391)

- Backend has no borrow endpoints today; frontend (#392) can't reach
  the SDK's borrow primitives.
- Request/response schemas need to stay in sync with SDK public types
  as they evolve.
- Error handling should surface structured failures (market not
  allowed, chain mismatch, insufficient liquidity) instead of opaque
  500s.
- Lend's `closePosition` endpoint currently has no check for dUSDC
  pledged as borrow collateral — users could try to withdraw collateral
  that's locked. Decide whether this guard lives in PR #4 or punts to
  PR #5.

## Repo / worktree context

- **Worktree path:** `/Users/kevin/github/optimism/actions-borrow-pr4`
- **Branch:** `kevin/borrow-pr4`
- **Base:** stacked on `kevin/borrow-pr3`. Sibling `kevin/borrow-pr5`
  and `kevin/borrow-pr6` worktrees exist and stack on top of this
  branch. **Keep this branch fresh** — see "Coordination" below.
- **Repo:** `ethereum-optimism/actions` (pnpm monorepo, Node ≥ 18).
  Project conventions in `AGENTS.md` and `CONTRIBUTING.md`.

## Source materials (read in this order, code first)

1. `gh issue view 391 --repo ethereum-optimism/actions` — this PR.
2. `gh issue view 366 --repo ethereum-optimism/actions` — parent epic.
3. `gh issue view 390 --repo ethereum-optimism/actions` — PR #3 (SDK
   BorrowProvider). Whatever shipped there is the actual contract for
   this PR. Re-read the merged code, not pre-merge plans.
4. `packages/demo/backend/src/` — current backend layout (Hono +
   controllers + services). Mirror the lend endpoint pattern.
5. **Outdated docs** in `docs/brainstorms/` and `docs/plans/`: useful
   for *why* the on-chain shape exists, but assume the SDK shape may
   have shifted during PR #3. Verify against current code before
   adopting any specific function name, type, or path.

## Suggested workflow

Use the full ce-loop. Do not skip to coding.

1. **`/ce-brainstorm`** — frame the endpoint surface (one route per
   verb? combined `/borrow/positions` REST? RPC-style?), error
   taxonomy, response schemas, validation layer, where the
   collateral-locked guard lives.
2. **`/ce-plan`** — translate to implementation units, file paths,
   test coverage.
3. **`/ce-work`** — implement, one small commit at a time.

## Commit discipline (every commit)

1. Do the work.
2. Add / update / run tests.
3. `pnpm build` (root or affected package).
4. `pnpm lint:fix`.
5. Commit message: **3–7 words, never mention AI or Claude**.
6. `git push`.

Small commits beat one big one. Each step should leave the tree
buildable + tests green.

## Coordination across PR #4 / #5 / #6

Work on these three branches happens **in parallel**. Keeping the
stack fresh matters more than usual.

### Local sibling worktrees (this machine)

All four borrow branches have co-resident worktrees on this
filesystem. Agents (and humans) can read sibling state directly,
including unpushed commits and in-flight docs, without waiting for
`git push`:

- `/Users/kevin/github/optimism/actions-borrow-pr3` (`kevin/borrow-pr3`)
- `/Users/kevin/github/optimism/actions-borrow-pr4` (`kevin/borrow-pr4`)
- `/Users/kevin/github/optimism/actions-borrow-pr5` (`kevin/borrow-pr5`)
- `/Users/kevin/github/optimism/actions-borrow-pr6` (`kevin/borrow-pr6`)

Inspect with `git -C <path> log --oneline -10`, `git -C <path> status`,
or direct file reads under that path. Treat the local worktree as
authoritative for "what's actually staged" when origin lags.
**Edit only your own worktree.** Cross-branch propagation still
goes through rebase, not direct edits.

### Stack hygiene

- **Pull base before doing anything:**
  `git fetch origin && git rebase origin/kevin/borrow-pr3`. If PR #3
  hasn't pushed yet, pull `origin/main` instead and flag the gap.
  (Or read pr3's local worktree above to see in-flight state.)
- **Rebase, do not merge.** Linear history keeps downstream branches
  cheap to update.
- **Push your branch regularly** (after every small commit, or at
  minimum every logical chunk). Sibling branches need to rebase on
  this work as it lands.
- **Call out blocking decisions in `handoff-pr4.md` (or a new
  `decisions-pr4.md`) before resolving them.** If a choice in PR #4
  forces a shape on PR #5 (e.g., response field naming), write it
  down + push so the PR #5 agent can react. Same in reverse.
- If you discover the SDK (PR #3) is missing something you need,
  **prefer filing a follow-up issue over expanding PR #4 scope**
  unless it's a hard blocker.

## Constraints to internalize

From `AGENTS.md`:

- **One domain per PR.** PR #4 is *only* backend code. No SDK changes,
  no frontend, no contracts.
- **Tests required for every feature.** Don't mock pure utilities.
- **No em-dashes** in committed text.

## Useful resume commands

```bash
# Confirm where we are
git -C /Users/kevin/github/optimism/actions-borrow-pr4 status
git -C /Users/kevin/github/optimism/actions-borrow-pr4 log --oneline -10

# Pull latest base
git -C /Users/kevin/github/optimism/actions-borrow-pr4 fetch origin
git -C /Users/kevin/github/optimism/actions-borrow-pr4 rebase origin/kevin/borrow-pr3

# Diff vs base
git -C /Users/kevin/github/optimism/actions-borrow-pr4 diff origin/kevin/borrow-pr3..HEAD --stat

# Existing backend pattern to mirror
ls /Users/kevin/github/optimism/actions-borrow-pr4/packages/demo/backend/src/

# Engineering principles
$EDITOR /Users/kevin/github/optimism/actions-borrow-pr4/AGENTS.md
$EDITOR /Users/kevin/github/optimism/actions-borrow-pr4/CONTRIBUTING.md
```
