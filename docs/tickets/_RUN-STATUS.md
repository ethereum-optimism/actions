# Production-readiness run status

Live source of truth for the aiur-driven implementation of the production-readiness backlog. Updated as agents progress.

**Last updated:** 2026-06-23 11:10 PT — aiur `--bg` launched (`d96812c`), all 5 agents dispatched and `in-progress` on `claude:opus`.

## How the work flows

Per ticket: `agent:todo` on `its-applekid/actions` → an aiur agent picks it up (`agent:in-progress`) → opens a PR on the fork → this agent runs a compound-engineering review → operator signs off → **re-create / reopen the issue on `ethereum-optimism/actions`** (fork issue #s do NOT carry over — see below) → the `reopen-pr` skill replays the commits as a draft PR there, **with the PR body's issue references rewritten to the upstream issue #**.

Run config: tracker `its-applekid/actions`; all complexity → `claude:opus`; prewarm base off the warmed `~/.aiur/repo/its-applekid/actions`; ~5 agents at a time.

State progression: `todo → in-progress → human-review → ce-reviewed → signed-off → reopened`.

### Reopen renumbering (read before reopening)

The fork (`its-applekid/actions`) and upstream (`ethereum-optimism/actions`) have **different issue numbers**. `reopen.sh` copies the PR body verbatim, so any `Fixes #N` / `#N` in a fork PR points at the wrong (or nonexistent) upstream issue. At reopen time, per ticket:
1. Ensure the tracking issue exists on `ethereum-optimism/actions` — most active tickets **augment an existing upstream issue** (the "actions issue" column below); reopen it if closed, or create a new one for net-new tickets.
2. Run `reopen-pr` to open the draft PR.
3. **Rewrite the PR body** so issue references point at the upstream issue # (and add the right `Fixes #<upstream>` / `Refs #<upstream>`).

## Active batch — Phase 1, critical 5

The most fund-safety-critical Phase-1 tickets. All `agent:todo` on `its-applekid/actions`. The "actions issue" is the existing upstream augment-target (candidate to reference/reopen at replay; confirm open/closed at reopen time).

| # | Ticket | Sev | Cx | applekid | State | Fork PR | CE review | Sign-off | actions issue | actions PR |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | prebuilt-quote-calldata-integrity | high | 5 | [#37](https://github.com/its-applekid/actions/issues/37) | in-progress | — | — | — | #373 | — |
| 2 | swap-recipient-encoding-ignored | high | 4 | [#38](https://github.com/its-applekid/actions/issues/38) | in-progress | — | — | — | #444 | — |
| 3 | lend-asset-market-validation | high | 4 | [#39](https://github.com/its-applekid/actions/issues/39) | in-progress | — | — | — | #334 | — |
| 4 | receipt-status-as-success | high | 3 | [#40](https://github.com/its-applekid/actions/issues/40) | in-progress | — | — | — | #474 | — |
| 5 | slippage-bounds-negative-minout | high | 3 | [#34](https://github.com/its-applekid/actions/issues/34) | in-progress | — | — | — | #318 | — |

Overlap to watch at reopen time: #1/#2/#5 all touch swap provider/encoder files, so their fork PRs may conflict on swap code — replay them sequentially. #3 (lend) and #4 (wallet) are independent.

## Deferred / not in this batch

Created on the fork but untagged (no `agent:todo`) — queue next:

| Ticket | Sev | Cx | applekid | actions issue | Note |
|---|---|---|---|---|---|
| backend-faucet-auth-and-rate-limit | high | 3 | [#35](https://github.com/its-applekid/actions/issues/35) | (net-new) | isolated backend; strong next-batch pick |
| hosted-signer-address-reconcile | med | 4 | [#36](https://github.com/its-applekid/actions/issues/36) | (net-new) | Phase 1, lower priority |

## Phase 1 backlog — not yet created as issues

`eoa-batch-mid-revert-allowance` (high, 3) · `sdk-dependency-pinning-and-optionality` (med, 4) · `network-fork-test-harness-consolidation` (med, 4) · `calldata-encoder-differential-oracles` (med, 4) · `smart-wallet-owner-set-reconcile` (med, 4) · `lend-borrow-full-exit-max-sentinel` (med, 4) · `recipient-validation-symmetry` (med, 3) · `hosted-wallet-signer-test-coverage` (med, 3) · `validator-and-receipt-unit-coverage` (med, 2)

Full backlog and phase schedule: [`_INDEX.md`](./_INDEX.md).
