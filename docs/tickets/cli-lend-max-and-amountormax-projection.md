# Route CLI lend close --max through an SDK full-balance path and project all AmountOrMax cases

> **AUGMENT existing issue #334 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | low |
| **Complexity** | 2 / 5 |
| **Domain** | cli |
| **Surface** | `lend/runLendAction` `close --max`; `borrow/runBorrowAction` `amountOrMaxToEnvelope` `{amountRaw}` branch; `resolvers/assets` ambiguity guard |
| **Resolves findings** | F333, F337, F342 |
| **Candidate existing issue** | #334 |
| **Blocked by** | `lend-borrow-full-exit-max-sentinel` (#209 — supplies the SDK full-balance close path this CLI change routes through) |

## Problem

These are three sibling-parity gaps on the CLI write verbs (`lend close`, `borrow`, `swap`). None is an over-withdraw / over-spend fund-loss today — the framing is *the CLI re-derives a "max" amount itself instead of deferring to the SDK sentinel its sibling already uses*, *the union projection drops a fund-moving leg from the receipt*, and *the asset resolver silently picks one of several same-symbol tokens on the signed swap path*.

- **lend close `--max` snapshots a float-formatted balance.** Instead of forwarding the SDK's `{ max: true }` full-balance sentinel the way the borrow `--max` siblings do, `runLendAction` reads `getPosition().balanceFormatted` and re-parses it through `parseAmount`. This has two distinct effects: (1) the float round-trip (`Number(raw)` in `parseDecimal`) drops low-order wei on an 18-decimal balance, so `--max` under-withdraws and strands dust — the position the user asked to close stays open with a residual; (2) on a zero/empty position `balanceFormatted` is `'0'`, which `parseAmount` rejects with `Invalid --amount: 0`, naming a `--amount` flag the user never passed and masking the real condition (nothing to close). Both stem from the same snapshot-balance mechanism the borrow side avoids by deferring on-chain resolution to the SDK.
- **`amountOrMaxToEnvelope` returns `undefined` for `{ amountRaw }`.** It is the single projection from the SDK `AmountOrMax` union into the user-facing borrow envelope, and it handles only `{ max }` and `{ amount }`. Every borrow handler builds `{amount}`/`{max}` today so this is not currently reachable, but the SDK union permits `{ amountRaw }`; if a future leg ever passes it, the receipt would print no amount for a fund-moving leg while the tx still dispatches the raw value — a silent observability hole on a write verb's confirmation output.
- **`resolveAsset` has no ambiguity guard.** It returns the first symbol match via `allow.find(...)`, while its sibling resolvers `resolveMarket` and `resolveBorrowMarket` deliberately throw on duplicate-key collisions. It feeds the fund-moving swap `--in`/`--out` path that builds and signs `WalletSwapParams`, so a config with two same-symbol assets (a mock plus a real token, or the same symbol across chains) makes `--in USDC` silently select the first-listed token address — a different ERC-20 than intended, built and signed against it.

## Findings

- **F333** — `lend close --max` snapshots `getPosition().balanceFormatted` and dispatches a fixed re-parsed amount instead of the SDK `{ max: true }` sentinel the borrow siblings use, leaving interest/precision dust (`packages/cli/src/commands/wallet/lend/runLendAction.ts:76-80`; sibling `{max:true}` at `packages/cli/src/commands/wallet/borrow/runBorrowAction.ts`).
- **F337** — `amountOrMaxToEnvelope` maps the SDK `{ amountRaw }` union variant to `undefined`, so a future raw-amount leg would render a blank amount in the borrow receipt (`packages/cli/src/commands/wallet/borrow/runBorrowAction.ts:81-88`; receipt formatter `packages/cli/src/output/printOutput.ts:238-242`).
- **F342** — `resolveAsset` first-matches by symbol with no ambiguity throw, unlike its sibling market resolvers, on the signed swap `--in`/`--out` path (`packages/cli/src/resolvers/assets.ts:27-39`; consumed at `packages/cli/src/commands/actions/swap/util.ts:148-149`; sibling guards at `packages/cli/src/resolvers/markets.ts:44-56` and `packages/cli/src/resolvers/borrowMarkets.ts:48-60`).

## Root cause

Each verb re-implements a "max"/lookup step locally instead of reusing the safer, on-chain-resolving, or ambiguity-throwing path that a sibling already establishes:

- lend `close --max` derives the amount in the CLI from a snapshotted, float-formatted balance, whereas borrow `--max` forwards the SDK `{ max: true }` sentinel and lets the SDK resolve the live balance at dispatch. The CLI snapshot path cannot exist without the SDK exposing a full-balance close (the `lend-borrow-full-exit-max-sentinel` ticket adds it).
- `amountOrMaxToEnvelope` is an exhaustive-looking union projection that is not exhaustive: it silently falls through to `undefined` for one variant instead of explicitly handling or rejecting it.
- `resolveAsset` predates (or simply omits) the ambiguity-throw convention its two sibling resolvers adopted, so the same config shape is rejected by the market resolvers and silently accepted by the asset resolver.

## Recommended approach

Review-only, no architectural refactor. These are low-risk sibling-parity and projection fixes on the demo CLI.

- **F333 (lend close `--max`)** — once the SDK full-balance close path lands (`lend-borrow-full-exit-max-sentinel` / #209), route `lend close --max` through that `{ max: true }`-equivalent path so it resolves the live balance on-chain at dispatch, matching the borrow siblings and eliminating both the float-precision dust and the inflight-interest dust. Until then, as a minimal standalone fix, detect an empty/zero position before `parseAmount` and surface a clear `CliError` (e.g. `No open lend position to close in <market>`) so the misleading `Invalid --amount: 0` no longer names a flag the user never passed. The on-chain-resolve routing is the parity fix; the empty-position guard is the cheap interim error-clarity fix.
- **F337 (`amountOrMaxToEnvelope`)** — add an explicit `if ('amountRaw' in value) return value.amountRaw.toString()` branch (or a `throw` for an unprojectable leg) so the union projection is exhaustive and a future raw-amount leg cannot silently render a blank amount on a fund-moving receipt. Strictly defensive; no behavior change today since no handler builds `{amountRaw}`.
- **F342 (`resolveAsset`)** — mirror `resolveMarket`/`resolveBorrowMarket`: collect all case-insensitive symbol matches, throw `CliError('validation', 'Ambiguous asset: <symbol>')` (listing name + chainId + address) when more than one matches, and keep first-match only when exactly one matches. Add the missing ambiguity test.

## Affected files

- `packages/cli/src/commands/wallet/lend/runLendAction.ts:76-80` (lend `close --max` snapshot + empty-position guard)
- `packages/cli/src/commands/wallet/borrow/runBorrowAction.ts:81-88` (`amountOrMaxToEnvelope` `{amountRaw}` branch); reference sibling `resolveAmountOrMax -> {max:true}` in the same file
- `packages/cli/src/output/printOutput.ts:238-242` (borrow receipt formatter that consumes the projected amount)
- `packages/cli/src/resolvers/assets.ts:27-39` (`resolveAsset` ambiguity guard)
- `packages/cli/src/commands/actions/swap/util.ts:148-149` (signed-swap consumer of `resolveAsset`)
- `packages/cli/src/resolvers/markets.ts:44-56`, `packages/cli/src/resolvers/borrowMarkets.ts:48-60` (sibling ambiguity-throw pattern to mirror)

## Acceptance criteria / tests

- `lend close --max` on a position routes through the SDK full-balance path (once #209 lands) and leaves no residual dust on an interest-accruing 18-decimal position; a test asserts the SDK is called with the `{ max: true }`-equivalent rather than a re-parsed `balanceFormatted` float.
- `lend close --max` on a zero/empty position surfaces a clear `CliError` naming the empty position, not `Invalid --amount: 0` referencing a flag the user never passed. Test covers the empty-position branch.
- `amountOrMaxToEnvelope({ amountRaw })` returns the raw amount as a string (or throws) — never `undefined`. A unit test exercises the `{amountRaw}` variant so the projection is exhaustive over the SDK union.
- `resolveAsset` throws `CliError('validation', 'Ambiguous asset: <symbol>')` when an allowlist contains more than one entry with the same `metadata.symbol`, and still returns the single match for the unique case. A new ambiguity test mirrors the existing `markets.test.ts` / `borrowMarkets.test.ts` ambiguity coverage (`assets.test.ts` currently covers only exact/case-insensitive/unknown/empty).

## Notes

- This augments existing issue #334; the lend `--max` parity item is the primary driver. The empty-position error-clarity refinement and the float-precision dust mechanism both attach to F333 on the same `runLendAction.ts:76-80` path.
- Blocked-by `lend-borrow-full-exit-max-sentinel` (#209): the SDK does not expose a full-balance lend close today, so the F333 parity fix depends on that SDK path landing first. The empty-position guard and the F337/F342 fixes are independent and can ship ahead of it.
- F337 is not reachable today (no borrow handler builds `{amountRaw}`); it is filed as a defensive projection-completeness fix, not a live bug.
- F342 is config-agnostic: the demo config has unique symbols today, so the wrong-token selection only manifests under a config that surfaces two same-symbol assets. The fix is sibling-parity, not a response to a live exploit.
