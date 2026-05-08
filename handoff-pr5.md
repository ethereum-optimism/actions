# Handoff: Borrow PR #5 (demo frontend borrow tab)

> **Status: not started.** Run `/ce-brainstorm` → `/ce-plan` → `/ce-work`
> from scratch. Treat any pre-existing brainstorm/plan docs in this tree
> as **historical artifacts, not gospel** — they predate PRs #1–#4 and
> are likely out of sync with what actually shipped. Always re-read the
> code that landed before adopting any design decision from old docs.
> Once the brainstorm doc lands, `git rm handoff-pr5.md` (this file —
> **do not touch other branches' handoff files**) in a standalone
> commit and proceed.

## Why this file is named `handoff-pr5.md`

PRs #4 / #5 / #6 are stacked branches developed in parallel. Each
branch carries **one and only one** handoff doc named after itself:

- `kevin/borrow-pr4` → `handoff-pr4.md`
- `kevin/borrow-pr5` → `handoff-pr5.md` (this file)
- `kevin/borrow-pr6` → `handoff-pr6.md`

Per-branch names prevent rebase conflicts: when each branch deletes
its own handoff post-brainstorm, downstream rebases see clean
delete/no-touch operations instead of edit/edit collisions on a
shared filename. **Touch only `handoff-pr5.md` from this branch.**
You may *read* `handoff-pr4.md` (propagated up from PR #4) and
`handoff-pr6.md` if they appear, to understand sibling work — but
never edit them here.

(`handoff.md` belongs to PR #3; ignore it on this branch — PR #3
will delete it on its own.)

## What this PR is

**Borrow PR #5 — demo frontend Borrow tab**
(GitHub issue [ethereum-optimism/actions#392](https://github.com/ethereum-optimism/actions/issues/392)).

Add the user-facing borrow experience to the demo frontend, consuming
the backend endpoints from PR #4. Frontend-only work inside
`packages/demo/frontend/`. **No** SDK changes, no contracts, no
backend (file follow-ups if backend gaps surface).

### Problems to solve (from #392)

- Demo has no Borrow tab; users can lend but can't borrow against
  their dUSDC.
- UX must match Aave/Morpho/Compound expectations:
  - health factor as a decimal with color tiers,
  - before/after preview as user types,
  - liquidation price in USD,
  - Max button that leaves a safety buffer.
- Risky positions (projected HF < 1.2) need confirmation friction,
  not silent submit.
- Current transaction UX uses a single shared `isLoading` flag across
  approval/position stages — agents have flagged this as a consistent
  source of double-click + misleading-state bugs. Fix as part of this
  PR or punt to a follow-up; decide explicitly.
- Lend tab's withdraw needs to warn when dUSDC is pledged as borrow
  collateral.
- Activity log needs borrow/repay action types and cross-tab
  highlighting.
- Empty states: no collateral → point to Lend tab; market out of
  liquidity → disabled CTA with reason.

## Repo / worktree context

- **Worktree path:** `/Users/kevin/github/optimism/actions-borrow-pr5`
- **Branch:** `kevin/borrow-pr5`
- **Base:** stacked on `kevin/borrow-pr4`. Sibling `kevin/borrow-pr6`
  worktree stacks on this branch. **Keep this branch fresh** —
  see "Coordination" below.
- **Repo:** `ethereum-optimism/actions` (pnpm monorepo, Node ≥ 18).
  Project conventions in `AGENTS.md` and `CONTRIBUTING.md`.

## Source materials (read in this order, code first)

1. `gh issue view 392 --repo ethereum-optimism/actions` — this PR.
2. `gh issue view 366 --repo ethereum-optimism/actions` — parent epic.
3. `gh issue view 391 --repo ethereum-optimism/actions` + the merged
   PR #4 code — actual backend contract this UI depends on.
4. `gh issue view 390 --repo ethereum-optimism/actions` + the merged
   PR #3 code — SDK types you'll see leak through.
5. `packages/demo/frontend/src/` — current Lend/Swap tab patterns to
   mirror.
6. **Outdated docs** in `docs/brainstorms/` and `docs/plans/`:
   useful directional context, not authoritative. Verify against
   current code before adopting any specific component, hook, or
   path.

## Suggested workflow

Use the full ce-loop. Do not skip to coding.

1. **`/ce-brainstorm`** — UX decisions: HF color thresholds, Max
   safety buffer %, confirmation modal vs inline ack, per-stage
   loading state shape, activity log schema additions, empty-state
   copy. Validate the existing-component palette before designing
   new ones.
2. **`/ce-plan`** — components, hooks, routes, test coverage.
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
  `git fetch origin && git rebase origin/kevin/borrow-pr4`. If PR #4
  hasn't pushed yet, work against the local branch + flag the gap.
  (Or read pr4's local worktree above to see in-flight state.)
- **Rebase, do not merge.** Linear history keeps PR #6 cheap to
  update.
- **Push your branch regularly** (after every small commit, or at
  minimum every logical chunk). PR #6 needs to rebase on this work
  as it lands.
- **Call out blocking decisions in `handoff-pr5.md` (or a new
  `decisions-pr5.md`) before resolving them.** If a UX shape forces
  a backend response shape, write it down + ping PR #4. Same for
  PR #6 polish concerns.
- If you discover the backend (PR #4) is missing data the UI needs,
  **decide explicitly** whether to amend PR #4, file a follow-up,
  or stub it client-side. Don't reach into the backend silently.

## Constraints to internalize

From `AGENTS.md`:

- **One domain per PR.** PR #5 is *only* frontend code. No SDK
  changes, no backend, no contracts.
- **Tests required for every feature.** Frontend testing bar is
  lighter than SDK/backend per `CLAUDE.md` ("only bare minimum
  testing required") — but critical user flows still need coverage.
- **No em-dashes** in committed text.

## Useful resume commands

```bash
# Confirm where we are
git -C /Users/kevin/github/optimism/actions-borrow-pr5 status
git -C /Users/kevin/github/optimism/actions-borrow-pr5 log --oneline -10

# Pull latest base
git -C /Users/kevin/github/optimism/actions-borrow-pr5 fetch origin
git -C /Users/kevin/github/optimism/actions-borrow-pr5 rebase origin/kevin/borrow-pr4

# Diff vs base
git -C /Users/kevin/github/optimism/actions-borrow-pr5 diff origin/kevin/borrow-pr4..HEAD --stat

# Existing tab pattern to mirror
ls /Users/kevin/github/optimism/actions-borrow-pr5/packages/demo/frontend/src/

# Engineering principles
$EDITOR /Users/kevin/github/optimism/actions-borrow-pr5/AGENTS.md
$EDITOR /Users/kevin/github/optimism/actions-borrow-pr5/CONTRIBUTING.md
```
