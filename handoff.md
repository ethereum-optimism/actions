# PR #424 (`feat/cli-swap`) Rework — Handoff

> **Cleanup instruction:** Once you've read this file and have full context, **remove the handoff commit from git history entirely** (do not just delete the file in a follow-up commit — the commit itself must not exist in history). If it's still the tip commit, run `git reset --hard HEAD~1`. If you've already committed work on top, use `git rebase -i` and drop the handoff commit. Verify with `git log --oneline | grep handoff` (should return nothing) before continuing. Never push the handoff commit upstream.

## Context

This is the third PR in a stack. The first two have been polished and the relevant changes propagated:

- **#421** (CLI scaffolding) — merged into `main`
- **#423** (`feat/cli-lend`) — reworked, polished, **rebased into this branch**
- **#424** (`feat/cli-swap`) — current focus, applying multi-agent review findings on top of the lend work

Working tree: `/Users/kevin/github/optimism/actions-feat-cli-swap`
Branch: `feat/cli-swap` (16+ commits ahead of `origin/feat/cli-swap`)

The user is reviewing each change carefully. Discipline matters more than speed.

## Working agreements

- **Very small commits.** One finding per commit. 3-7 word messages. Never mention AI/Claude.
- **Verification chain in one Bash call**: `pnpm build && pnpm test && pnpm lint:fix && pnpm lint` (run from `packages/cli`).
- **Git operations in a separate Bash call**: `git add <files> && git commit -m "..."` is fine to chain, just not chained with the verification.
- **Never `git add .`** — stage the specific files for that commit.
- **No em-dashes** in writing. Use commas/colons/parentheses.
- The user prefers the user pushes themselves. Do not push unless asked.

## State of the queue

### Done in this rework session (most recent first)
- `f36c444a extract formatReceiptList helper` — collapsed two byte-identical tx-receipt loops in `printOutput.ts`
- `71b21fe2 defer slippage upper bound to sdk` — reverted arbitrary 5% cap; CLI just validates plain-decimal shape, SDK enforces upper bound via `SlippageOutOfRangeError` (default `maxSlippage: 0.5`)
- `c1ef06a9 type SDK swap recipient guard errors` — `QuoteRecipientMismatchError` and `QuoteRecipientMissingError` (`ActionsError` subclasses)
- `5ad7084b expose wallet swap quote and quotes` — recipient-bound `wallet.swap.getQuote/getQuotes` CLI commands
- `60c21868 add deadline flag to wallet swap execute`
- `5ca39deb add recipient flag to wallet swap execute`
- `1ef1bd8c add approval-mode flag to wallet swap execute`
- `110c910c split QuoteFlags into typed amount union` — discriminated union with `?: never` branches; runtime mutex still in `parseAmountFlags` since commander argv is loosely typed
- `f3185a1b enrich swap execute errors with context` — `rethrowWithContext` in `output/errors.ts`
- `e2ca5ece test simulation revert mapping for swap`
- `00a6a8c2 tighten parseSlippage to plain decimal`
- `0e57525f label parseAmount errors per flag` — `parseAmount(raw, flag = '--amount')`
- `1564aee4 add --provider flag to swap market`
- `c0e4dae5 add --asset filter to swap markets`
- `a5ee7527 share quote options with wallet swap`
- `4dad7afe extract addQuoteOptions to options module` — new `commands/actions/swap/options.ts`
- `16e5a132 add configuredAssets helper`
- `6415a578 import ANVIL_ACCOUNT_0 from shared mock`
- `8c9f24ba drop unichain from swap tests`

### Skipped per user

- **P1 #2 — `--quote-file` flag** for pre-built quote → execute path. The user said "lets skip the --quote-file flag." Do not revisit unless they ask.

### P3 polish batch — not yet started

These are low-value cosmetic/structural improvements. Confirm with the user before starting; some may not be worth the churn:

1. Collapse `swap/quote.ts` and `swap/quotes.ts` into a single `runSwapQuote(action, flags)` helper (or leave separate for clarity)
2. Inline single-field flag interfaces (`SwapMarketsFlags`, `SwapMarketFlags`) — they wrap one field each
3. Drop bigint-string re-assertions from handler tests (covered by `writeJson` tests)
4. Inline `parseAmountFlags` / `parseSlippage` / `parseProvider` exports if only `buildQuoteParams` consumes them — verify call sites first
5. `priceImpact?: number` optional in `SwapExecuteDoc` (SDK type allows undefined)
6. Trim `wallet/swap/execute.ts` JSDoc — SDK internals references rot
7. Add a comment in `actions/swap/quote.ts` warning the quote isn't wallet-bound; remove once `wallet swap getQuote` is documented in SKILL.md
8. **SKILL.md updates**: document `--deadline` default; list `provider`, `recipient`, `expiresAt` in quote payload note; document the new flags (`--approval-mode`, `--recipient`, `--deadline`, `--provider`, `--asset`)
9. `parseProvider` cast-then-check — replace with a real type guard rather than `as SwapProviderName` before `.includes`
10. `runSwapMarkets` should drop the default `flags = {}`; commander always passes an object
11. `PROVIDERS` allowlist drift-proofing — derive from a const enum or `as const` tuple in the SDK rather than redeclaring in CLI util
12. `--routing <price|default>` flag — defer; needs SDK design

## Project layout cheatsheet (post-rework)

- `packages/cli/src/commands/actions/` — read-only commands (no wallet)
- `packages/cli/src/commands/wallet/` — write commands (need wallet provider)
- `packages/cli/src/commands/actions/swap/` — `quote`, `quotes`, `markets`, `market`, plus shared `options.ts` (`addQuoteOptions`, `QUOTE_OPTIONS_HELP`) and `util.ts` (`buildQuoteParams`, `buildWalletExecuteParams`, parsers)
- `packages/cli/src/commands/wallet/swap/` — `execute`, `quote`, `quotes` (recipient-bound)
- `packages/cli/src/__mocks__/` — shared test fixtures (matches SDK convention; do **not** rename to `__test-utils__`)
- `packages/cli/src/output/errors.ts` — `toCliError`, `rethrowWithContext`
- `packages/cli/src/utils/parseAmount.ts` — strict decimal regex with `flag` label param
- `packages/cli/src/utils/receipts.ts` — `ensureOnchainSuccess` default-deny guard
- `packages/cli/src/resolvers/` — `assets.ts` (`resolveAsset`, `configuredAssets`), `chains.ts`, `markets.ts` (`configuredMarkets`)

## Conventions to preserve

- **Naming**: `configuredAssets` / `configuredMarkets` (not `collectAssets` / `getAssets`). User chose this; don't churn it.
- **Error mapping**: typed `ActionsError` subclasses on the SDK side, mapped to CLI `validation` / `forbidden` / etc. via `output/errors.ts:toCliError`. When adding a new SDK error type, also add the mapping.
- **Slippage**: CLI passes a decimal (input is percent, divide by 100). Don't impose CLI-side upper bounds; the SDK does that.
- **Quote recipient**: `WalletSwapNamespace.requireQuoteForThisWallet` rejects pre-built quotes whose recipient differs from the wallet (Velodrome v2/leaf encodes recipient in calldata). Don't relax this.
- **JSON mode**: `setJsonMode(true)` in tests, `--json` flag in CLI. `writeJson` is bigint-aware and pretty-prints.
- **Discriminated unions for flag shapes**: prefer `?: never` branches over plain optionals for mutually-exclusive args. Tests that exercise the runtime mutex cast through `as never`.

## Repo-level commands

```bash
# From /Users/kevin/github/optimism/actions-feat-cli-swap/packages/cli
pnpm build && pnpm test && pnpm lint:fix && pnpm lint
```

## Memory

User feedback to honor:
- Always lint before commit
- No em-dashes
- Very small commits, 3-7 word messages, no AI/Claude mentions
- Separate verification chain from git operations
- `__mocks__` not `__test-utils__`
- `configuredAssets` / `configuredMarkets` (not `collect*`/`get*`)
