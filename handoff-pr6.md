# Handoff: Borrow PR #6 (full borrow e2e UX)

> **Status: not started, scope still soft.** Issue #427 has only a
> title ("Full borrow e2e UX") — no body. Run `/ce-brainstorm` first
> to **scope this PR** before anything else, then `/ce-plan` →
> `/ce-work`. Treat any pre-existing brainstorm/plan docs in this tree
> as **historical artifacts, not gospel** — they predate PRs #1–#5 and
> are likely out of sync with what actually shipped. Always re-read
> the code that landed before adopting any design decision from old
> docs. Once the brainstorm doc lands, `git rm handoff-pr6.md` (this
> file — **do not touch other branches' handoff files**) in a
> standalone commit and proceed.

## Why this file is named `handoff-pr6.md`

PRs #4 / #5 / #6 are stacked branches developed in parallel. Each
branch carries **one and only one** handoff doc named after itself:

- `kevin/borrow-pr4` → `handoff-pr4.md`
- `kevin/borrow-pr5` → `handoff-pr5.md`
- `kevin/borrow-pr6` → `handoff-pr6.md` (this file)

Per-branch names prevent rebase conflicts: when each branch deletes
its own handoff post-brainstorm, downstream rebases see clean
delete/no-touch operations instead of edit/edit collisions on a
shared filename. **Touch only `handoff-pr6.md` from this branch.**
You may *read* `handoff-pr4.md` and `handoff-pr5.md` (propagated up
via rebase) to understand sibling work — but never edit them here.

(`handoff.md` belongs to PR #3; ignore it on this branch — PR #3
will delete it on its own.)

## What this PR is

**Borrow PR #6 — full borrow e2e UX**
(GitHub issue [ethereum-optimism/actions#427](https://github.com/ethereum-optimism/actions/issues/427)).

The capstone PR for the borrow epic. PRs #2–#5 ship the on-chain
market, SDK provider, backend endpoints, and frontend tab
respectively; PR #6 is what's needed to make the e2e demo feel
finished and demo-ready.

**Scope is soft on purpose.** Until PR #5 lands, the exact polish
gaps aren't visible. Things this PR is *likely* to cover (validate
during brainstorm, do not assume):

- end-to-end demo narrative tightening (lend → borrow → repay loop
  with a clear story arc),
- skipped follow-ups punted from PR #4 / PR #5 (per-stage loading
  state, collateral-locked guard, activity log polish),
- toast/copy/empty-state polish discovered during PR #5 brainstorm,
- recorded demo walk-through (see `compound-engineering:feature-video`
  skill),
- any cross-tab integration the per-PR scope rule blocked
  (#391 explicitly notes the lend-side collateral guard as
  cross-cutting),
- gap analysis vs Morpho's official UI / Aave UI for parity bar.

The first action of this PR is to **decide what's actually in
scope**. Don't commit to a list before brainstorming.

## Repo / worktree context

- **Worktree path:** `/Users/kevin/github/optimism/actions-borrow-pr6`
- **Branch:** `kevin/borrow-pr6`
- **Base:** stacked on `kevin/borrow-pr5`. **Last branch in the
  stack** — nobody is downstream of you, but you're the most
  exposed to upstream churn.
- **Repo:** `ethereum-optimism/actions` (pnpm monorepo, Node ≥ 18).
  Project conventions in `AGENTS.md` and `CONTRIBUTING.md`.

## Source materials (read in this order, code first)

1. `gh issue view 427 --repo ethereum-optimism/actions` — this PR
   (currently body-less; expect to write the spec yourself during
   brainstorm).
2. `gh issue view 366 --repo ethereum-optimism/actions` — parent epic.
3. **The merged PR #2–#5 code as-shipped.** Read PR #5's frontend
   work first — it's the closest neighbour and surfaces the polish
   gaps you'll inherit.
4. Sibling open issues:
   - `gh issue view 391` (PR #4 problem list — collateral-locked
     guard explicitly cross-cutting),
   - `gh issue view 392` (PR #5 problem list — per-stage loading
     flag, activity log, empty states).
   Anything those PRs explicitly punted is fair game here.
5. Sibling handoffs (`handoff-pr4.md`, `handoff-pr5.md`) if they
   propagate up via rebase — useful for understanding what each
   sibling track decided.
6. **Outdated docs** in `docs/brainstorms/` and `docs/plans/`:
   directional only. Verify everything against current code.

## Suggested workflow

Use the full ce-loop. The brainstorm step is **load-bearing** here
because scope is open.

1. **`/ce-brainstorm`** — *first*, define what "done" looks like for
   the borrow epic. Walk the demo flow end-to-end against
   merged PRs #2–#5 and list gaps. *Then* prioritize. Output: a
   brainstorm doc with a scoped problem list, not a feature wishlist.
2. **`/ce-plan`** — translate scoped gaps into implementation units.
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

You sit at the **top of the stack** and inherit churn from both
upstreams. Defensive habits matter most here.

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

- **Pull both bases before any work session:**
  `git fetch origin && git rebase origin/kevin/borrow-pr5`. If PR #5
  has rebased on PR #4 since your last pull, this picks up both
  jumps. (Or read pr5's local worktree above to see in-flight state.)
- **Rebase, do not merge.** Even more important here — merge
  commits multiply downstream conflict risk if anyone forks off
  this branch.
- **Push your branch regularly** so the in-flight scope is visible
  to humans coordinating the stack.
- **Call out blocking decisions in `handoff-pr6.md` (or a new
  `decisions-pr6.md`)** explicitly. Because scope is soft, it's
  tempting to silently absorb cross-cutting fixes — don't. Write
  them down so PR #4 / PR #5 know whether they need to ship the
  fix themselves before merge.
- If upstream churn (PR #4 or PR #5) lands a fix you were planning
  to ship, **drop your version**. Don't double-ship.

## Constraints to internalize

From `AGENTS.md`:

- **One domain per PR** (still applies — but "the polish PR" can
  legitimately touch frontend + backend + lend-side guard).
  Brainstorm should call out the surfaces touched and justify them.
- **Tests required for every feature.** Don't mock pure utilities.
- **No em-dashes** in committed text.

## Useful resume commands

```bash
# Confirm where we are
git -C /Users/kevin/github/optimism/actions-borrow-pr6 status
git -C /Users/kevin/github/optimism/actions-borrow-pr6 log --oneline -10

# Pull latest base (and transitively whatever PR #4 brought in)
git -C /Users/kevin/github/optimism/actions-borrow-pr6 fetch origin
git -C /Users/kevin/github/optimism/actions-borrow-pr6 rebase origin/kevin/borrow-pr5

# Diff vs base
git -C /Users/kevin/github/optimism/actions-borrow-pr6 diff origin/kevin/borrow-pr5..HEAD --stat

# Diff vs main (to see the whole borrow epic delta)
git -C /Users/kevin/github/optimism/actions-borrow-pr6 diff origin/main..HEAD --stat

# Engineering principles
$EDITOR /Users/kevin/github/optimism/actions-borrow-pr6/AGENTS.md
$EDITOR /Users/kevin/github/optimism/actions-borrow-pr6/CONTRIBUTING.md
```
