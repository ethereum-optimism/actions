---
title: Actions CLI PR #408 scaffolding — handoff
type: handoff
status: active
date: 2026-04-22
branch: feat/cli-scaffolding
github_issue: https://github.com/ethereum-optimism/actions/issues/408
parent_issue: https://github.com/ethereum-optimism/actions/issues/407
origin_brainstorm: docs/brainstorms/2026-04-21-actions-cli-brainstorm.md
origin_plan: docs/plans/2026-04-21-feat-actions-cli-scaffolding-plan.md
---

# Actions CLI PR #408 — Handoff

Pick up a scaffolding PR for a new `packages/cli/` workspace package. The CLI
is an **agent-first subprocess**: JSON on stdout, JSON error envelope on
stderr, five-value exit-code taxonomy, consumed by the `opie` Slack bot
(`git@github.com:ethereum-optimism/opie.git`).

## Where everything lives

| Artifact | Location |
|---|---|
| Working directory (worktree) | `/Users/kevin/github/optimism/actions-cli-scaffolding` |
| Branch | `feat/cli-scaffolding` (pushed, tracking `origin/feat/cli-scaffolding`) |
| GitHub issue | <https://github.com/ethereum-optimism/actions/issues/408> |
| Parent issue | <https://github.com/ethereum-optimism/actions/issues/407> |
| Brainstorm | `docs/brainstorms/2026-04-21-actions-cli-brainstorm.md` (on branch `kevin/actions-cli`, PR #420) |
| **Plan (source of truth)** | `docs/plans/2026-04-21-feat-actions-cli-scaffolding-plan.md` (on branch `kevin/actions-cli`, 734 lines, ce-deepened) |
| Engineering principles | <https://github.com/ethereum-optimism/actions/issues/380> (treat as binding) |
| Base commit | cut from `origin/main` at `58fc354d` (post-#356, so `hostedWalletConfig` is optional) |

## Commits already on the branch

```
c5a557b5  extract serializeBigInt to sdk util
ff235127  scope no-console error to cli
5969bca0  scaffold actions-cli package skeleton
```

## Task tracker state (24 total)

Use the existing TaskList. Completed: **#1 worktree, #2 skeleton, #3 eslint+changeset,
#4 serializeBigInt extraction**. Next up: **#5 writeJson**. Then #6 … #24 in order.
Dependencies are roughly linear — don't parallelize unless you re-read the plan's
interaction graph.

| # | Task |
|---|---|
| 5 | writeJson + tests |
| 6 | CliError + safeDetails + tests |
| 7 | writeError + EPIPE handling |
| 8 | Lazy requireEnv + contract test |
| 9 | Demo chains constants |
| 10 | Demo markets constants |
| 11 | Demo config + loadConfig |
| 12 | Asset resolver + tests |
| 13 | Chain resolver + tests |
| 14 | baseContext + tests |
| 15 | walletContext + tests |
| 16 | `assets` command + tests |
| 17 | `chains` command + tests |
| 18 | `wallet address` command + tests |
| 19 | `wallet balance` command + tests |
| 20 | Wire top-level index.ts |
| 21 | picocolors for --help + stderr `Error:` label only |
| 22 | SKILL.md + README.md |
| 23 | System tests per command |
| 24 | Final gates + open PR |

## Standing directives (from the user — do not deviate)

- **Commits:** 3–7 words, no AI/Claude mention, one `git add + git commit + git push`
  command per logical unit.
- **Verify before every commit:** `pnpm typecheck && pnpm lint` at repo root.
  Run `pnpm -C packages/sdk test` when SDK changes, `pnpm -C packages/cli test`
  when CLI changes.
- **Zero new lint warnings** — the backend has 75 pre-existing warnings and the
  SDK has 72. Do not let those counts increase. The CLI package itself must
  stay at 0.
- **picocolors scope:** `--help` output + stderr `Error:` label only. stdout
  JSON payload stays ANSI-free — **asserted by integration test** (task 23).

## Engineering principles to apply (from issue #380)

- **Reuse before invention** — grep canonical locations before writing new utils,
  mocks, fixtures. Extraction trigger = **second concrete usage**, not speculative.
  That's why `serializeBigInt` now lives in the SDK (CLI was the second usage;
  backend was the first).
- **Viem patterns:** named concrete error classes at throw sites only where callers
  need `instanceof`. For `CliError`, keep a single class with a `code` discriminator
  — the agent contract is the `err.code` string, not `instanceof`.
- **Type narrowness:** `SupportedChainId` not `number`, `Hex` not `string`, `Asset`
  not loose object shapes. No `any`. No `as Foo` casts — narrow at the source.
  Use `import type` for type-only symbols.
- **Structure:** ≤20 lines of logic per function, ≤200 lines per file, max 2
  nesting levels, prefer early returns / guard clauses.
- **JSDoc on every public function/class:** `@description` (what + why, not how),
  `@param`, `@returns`, `@throws`.
- **No module-level singletons.** CLI constructs `Actions` fresh per command via
  `baseContext()` / `walletContext()`. The backend's `let actionsInstance` is an
  anti-pattern for a short-lived subprocess.

## Key SDK references (verified on current HEAD)

- `packages/sdk/src/types/actions.ts` — `ActionsConfig`, `WalletConfig`
  (`hostedWalletConfig?:`), `NodeActionsConfig`, `SwapConfig` is
  `RequireAtLeastOne<{uniswap?, velodrome?}>` — **do not write `swap: {}`**,
  omit the key entirely.
- `packages/sdk/src/wallet/core/namespace/WalletNamespace.ts` — `getSmartWallet`,
  `toActionsWallet`, `ToActionsWalletParam<never>`.
- `packages/sdk/src/wallet/core/providers/smart/default/DefaultSmartWalletProvider.ts`
  — `getWalletAddress` performs **one `eth_call`** to the factory. `wallet address`
  is RPC-bound, not pure.
- `packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts` — `getBalance` uses
  nested `Promise.all` over (asset × chain). One failing RPC fails all 9 reads.
  Document in SKILL.md (plan already specifies this).
- `packages/sdk/src/nodeActionsFactory.ts` — `createActions<T extends NodeProviderTypes>`
  entry point.
- `packages/sdk/src/constants/assets.ts` — `USDC_DEMO`, `OP_DEMO`, `ETH`, `WETH`
  canonical exports. **Do not create `src/demo/assets.ts`.** Import from the SDK.
- `packages/sdk/src/utils/serializers.ts` — **just extracted in commit `c5a557b5`;
  import via `@eth-optimism/actions-sdk`**.
- `packages/sdk/src/utils/test.ts` — `ANVIL_ACCOUNTS` fixtures for
  deterministic-address unit tests.

## CLI package layout

From the plan's architecture section, Decision 13.

```
packages/cli/src/
  index.ts                 # bin entrypoint — commander + EPIPE + uncaughtException
  commands/
    assets.ts
    chains.ts
    wallet/
      index.ts             # registers wallet subcommand + children
      address.ts
      balance.ts
  config/
    loadConfig.ts          # returns resolved NodeActionsConfig
    env.ts                 # lazy envalid (NO module-top-level cleanEnv)
  context/
    baseContext.ts         # { config, actions } — read-only commands
    walletContext.ts       # { config, actions, signer, smartWallet } — wallet commands
  output/
    json.ts                # writeJson → stdout
    errors.ts              # CliError, ErrorCode, safeDetails, writeError → stderr + exit
  resolvers/
    assets.ts              # symbol → Asset (case-insensitive) from config.assets.allow
    chains.ts              # shortname ↔ SupportedChainId; round-trip property tested
  utils/
    (serializeBigInt NOT here — imports from SDK now)
  services/                # empty in PR 1; exists for PR 2/3 to grow into
  demo/                    # everything demo-specific
    config.ts              # baked NodeActionsConfig<never>
    chains.ts              # BASE_SEPOLIA, OPTIMISM_SEPOLIA, UNICHAIN (NO bundler in PR 1)
    markets.ts             # GauntletUSDCDemo, AaveETH (used by PR 2; referenced via demo config's lend allowlist now)
    # NO assets.ts — import USDC_DEMO, OP_DEMO, ETH from SDK
SKILL.md                   # Agent Skills spec frontmatter
README.md
```

**Directory names are deliberate:** `core/` is forbidden (SDK reserves it at
four levels). Nested `commands/wallet/` is deliberate for subcommand composition
— PR 2/3 add `commands/wallet/lend/` and `commands/wallet/swap/` under it.

## Smoke commands this PR ships

- `actions assets` — `actions.getSupportedAssets()` (no wallet needed)
- `actions chains` — enumerate `config.chains` via the chain resolver's inverse
  (no SDK call)
- `actions wallet address` — `smartWallet.address` (1 RPC to factory)
- `actions wallet balance` — `smartWallet.getBalance()` (N×M RPCs)

Lend/swap branches are **deliberately not registered** in PR 1. Commander's
default "unknown command" error (exit 1, plain text on stderr) is acceptable —
**don't route unknown commands through `writeError`**. Lock this distinction
in task 23's integration tests.

## Error taxonomy (exit codes + retryable defaults)

```
unknown=1       retryable=false   (fallback for uncaught errors)
validation=2    retryable=false
config=3        retryable=false   (missing env, malformed PRIVATE_KEY, malformed config)
network=4       retryable=true    (RPC failure — includes wallet-address factory read)
onchain=5       retryable=false   (PR 2/3 may flip for nonce conflicts etc.)
```

Error body shape:

```json
{ "error": "message", "code": "network", "retryable": true, "retry_after_ms": 1000, "details": { } }
```

**`details` must be redacted** via `safeDetails()` before serialization. viem
errors pack bundler URLs (containing Pimlico/Alchemy API keys), raw request
payloads, and signer metadata into `.details` / `.metaMessages`. Unit tests in
task 6 must assert:

- URL API-key path segments are stripped (pattern: `/v[0-9]+/[^/]+/rpc(\?.*)?`)
- viem `Error` objects are reduced to `{ errorName, shortMessage }`
- Signer `publicKey` / `address` metadata never passes through

## Lazy envalid contract (task 8)

`actions --help` must work with **no env vars set**. envalid's `cleanEnv` cannot
be called at module top-level. Structurally enforce with a test:

```ts
import * as envalid from 'envalid'
const spy = vi.spyOn(envalid, 'cleanEnv')
await import('../config/env.js')   // Must NOT call cleanEnv
expect(spy).not.toHaveBeenCalled()
requireEnv('PRIVATE_KEY')           // Must call it now
expect(spy).toHaveBeenCalledOnce()
```

## System tests (task 23) — use `execFile` against built `dist/index.js`

Minimum coverage per user directive ("e2e for each granular actions function call"):

- `actions assets` → stdout parses as JSON array, exit 0, no ANSI on stdout
- `actions chains` → stdout parses as JSON array, exit 0
- `actions wallet address` → happy path (fixed PRIVATE_KEY via `ANVIL_ACCOUNTS.ACCOUNT_0`,
  deterministic address match). Requires either anvil or a mock at the RPC
  layer. Decide during implementation.
- `actions wallet balance` → happy path (mocked or anvil)
- `actions wallet address` with no `PRIVATE_KEY` → stderr JSON `code: "config"`, exit 3
- `actions wallet balance` with `BASE_SEPOLIA_RPC_URL=http://127.0.0.1:1` (blackhole)
  → stderr JSON `code: "network"`, `retryable: true`, exit 4
- `actions <unknown>` → commander default plain-text error on stderr, exit 1
  (**not** `writeError` JSON — lock this distinction)
- `actions --help` → exit 0 with no env set

Tests must `beforeAll(() => pnpm -C packages/cli build)` or rely on CI having
built first. Document the choice in the test file.

## Final PR (task 24)

- Body must link #408 and the plan file path on the `kevin/actions-cli` branch.
- Include the **Post-Deploy Monitoring & Validation** section required by
  `/workflows:work` — for a dev-tool CLI with no production runtime, a one-liner
  `No additional operational monitoring required: agent-facing dev tool with no server component`
  is acceptable.
- Mark checkboxes in the plan file (`[ ]` → `[x]`) before committing the final
  changes. The plan lives on `kevin/actions-cli`; you can either cherry-pick /
  update those checkboxes in a separate small PR, or include a diff against
  that branch in this one. Discuss with Kevin — he may want to defer.

## Things that bit me; don't repeat

1. **`mkdir` / `git` / `pnpm` are not on the login shell PATH** when Bash
   commands run without a shell init — use absolute paths
   (`/opt/homebrew/bin/git`, `/Users/kevin/Library/pnpm/pnpm`).
2. **Prettier lints `dist/`** unless you add a local `packages/cli/.prettierignore`.
   Already created.
3. **SDK must be rebuilt** (`pnpm -C packages/sdk build`) after touching
   `packages/sdk/src/**` — the backend typecheck resolves
   `@eth-optimism/actions-sdk` through `packages/sdk/dist/`.
4. **`@/` path alias** needs `resolve-tspaths` in the CLI build script (already
   wired). Test for it by running the built binary from a fresh clone —
   `node dist/index.js --help` must resolve all `@/` imports.
5. **Shebang preservation** — TSC keeps it only if it's the very first token in
   `src/index.ts`. Don't add leading comments. Already working.

## Open product question flagged by the plan (do not resolve — surface to Kevin)

**#412 (1-of-2 signer onboarding)** — the plan notes this is *weaker* than 1-of-1
(more keys that can independently drain). If the intent is user-recovery /
fallback authority, 1-of-2 is correct but should be reframed as recovery. If
the intent is "user co-signs high-value actions," it needs to be k-of-n with
k>1, which needs a kernel that supports it (ZeroDev). Raise before #412 is
implemented.

## Blocker for PR #409 (not this PR, but don't forget)

PR #409 (lend) is **blocked on an offchain spending cap**
(`ACTIONS_SPEND_CAP_USD` / `_WEI`) enforced in the handler before UserOp
construction. ~20 LOC, no ZeroDev dependency. Full #414 onchain Call Policies
is a later follow-up. Call this out in the #409 kickoff.

---

Branch is clean at `c5a557b5`. Start with task 5 (`writeJson`). Good luck.
