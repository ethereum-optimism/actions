---
title: Actions CLI scaffolding + --help + smoke tests (PR 1)
type: feat
status: active
date: 2026-04-21
origin: docs/brainstorms/2026-04-21-actions-cli-brainstorm.md
github_issue: https://github.com/ethereum-optimism/actions/issues/408
parent_issue: https://github.com/ethereum-optimism/actions/issues/407
---

# Actions CLI scaffolding + `--help` + smoke tests (PR 1)

## Overview

Ship the first pull request in the Actions CLI initiative (#407): a new `packages/cli/` workspace package that exposes an `actions` binary, wires up the full command tree, and lands four smoke-test commands (`assets`, `chains`, `wallet address`, `wallet balance`) that prove the `PRIVATE_KEY → signer → smart wallet → SDK call` pipeline end-to-end. Lend (#409) and swap (#410) ship as subsequent PRs; this PR deliberately builds the infrastructure they will plug into, but ships zero lend/swap commands.

The CLI is agent-first. Output is JSON on stdout; errors are JSON on stderr with distinct exit codes. The `opie` Hono + Slack bot spawns it as a subprocess and parses results. No TTY-pretty rendering, no interactive prompts. All choices about command surface, wallet bootstrap, config source, demo isolation, and output format are locked in the brainstorm (see brainstorm: `docs/brainstorms/2026-04-21-actions-cli-brainstorm.md`).

## Problem Statement

Today, any agent that wants to invoke Actions SDK functionality has to either (a) embed the SDK directly inside the agent runtime (ties the agent to TypeScript + Node + the SDK's peer deps), or (b) stand up a bespoke HTTP wrapper (the demo backend does this, but auth and shape are tuned to browser clients). Neither fits an LLM-driven Slack bot that reasons in natural language and is happiest composing shell commands.

We need a surface that:

- Maps 1:1 to SDK method signatures so the agent's "skill" is a lookup table, not a translation problem.
- Runs statelessly per invocation so the agent service doesn't need session management.
- Produces structured output the agent can parse reliably (JSON) with deterministic error behavior (exit codes).
- Can evolve to a non-demo mode later (per-user config via interactive agent onboarding — #411) without rewriting the core.

PR 1's job is only to land the foundation. It must be rich enough that PR 2 (lend) and PR 3 (swap) are pure additions — no retrofits.

## Proposed Solution

A new `packages/cli/` package (npm `actions-cli`, bin `actions`) that:

1. **Boots an `Actions` SDK instance from a baked demo config.** Config lives under `src/demo/` so the non-demo follow-up (#411) can swap `loadConfig()`'s source without touching anything else (brainstorm Decision 13).
2. **Derives a smart wallet from `PRIVATE_KEY`** on any command that needs it, using `actions.wallet.getSmartWallet({ signer, deploymentSigners: [signer.address], nonce: 0n })` — no hosted wallet, no `toActionsWallet`, lazy deploy via UserOp initCode on first mutation (brainstorm Decision 5/6).
3. **Wires a full `commander` tree** matching the brainstorm's naming heuristic (`getX()` → bare noun `x`). PR 1 only implements the four smoke commands; lend/swap subtrees are deliberately absent so unknown-command errors are clear. They are added in PR 2/3.
4. **Standardises output and error handling.** JSON-on-stdout (bigint-aware), JSON-on-stderr, five exit codes keyed to an error taxonomy.
5. **Ships `SKILL.md`**, a minimal agent skill describing the command tree, resolution rules, and error codes — enough for opie on day one, filled in per-namespace in PR 2/3.

## Technical Approach

### Architecture

Three concentric layers, strictly separated:

```
src/
  index.ts                    # bin entrypoint — commander tree + top-level error handler
  commands/                   # handlers: thin glue, zero business logic
    assets.ts
    chains.ts
    wallet/
      address.ts
      balance.ts
      index.ts                # registers the wallet subcommand + adds children
  core/                       # config-agnostic infrastructure; PR 2/3 reuse all of it
    config/
      loadConfig.ts           # returns a resolved NodeActionsConfig
      env.ts                  # lazy envalid accessor (see "Env handling" below)
    context/
      baseContext.ts          # { config, actions } — for read-only/no-wallet commands
      walletContext.ts        # { config, actions, signer, smartWallet } — for wallet commands
    output/
      json.ts                 # writeJson(doc) — stdout writer with bigint serializer
      errors.ts               # CliError, ErrorCode, writeError(err) → stderr + exit
    resolvers/
      assets.ts               # symbol → Asset (from config.assets.allow)
      chains.ts               # shortname → SupportedChainId (from config.chains)
      # markets.ts intentionally absent — added in PR 2
    bigint.ts                 # local serializeBigInt copy, until #419 extracts to SDK
  demo/                       # everything demo-specific; deleted/replaced by #411
    config.ts                 # the baked NodeActionsConfig
    assets.ts                 # USDC_DEMO, OP_DEMO (copied from demo backend, see Risk 2)
    chains.ts                 # BASE_SEPOLIA, OP_SEPOLIA, UNICHAIN with RPC env wiring
    markets.ts                # GauntletUSDCDemo, AaveETH (allowlist — used by PR 2)
SKILL.md                      # agent skill — command tree + resolution rules + error codes
package.json
tsconfig.json                 # extends root tsconfig.base.json, mirrors backend's shape
README.md                     # brief; point at SKILL.md and brainstorm
```

Key architectural rules (carried forward from brainstorm Decision 13):

- **Command handlers live in `src/commands/` and know nothing about demo data.** They take a context (from `src/core/context/`) and produce a JSON document. Any demo-specific reference is a bug.
- **Resolvers live in `src/core/resolvers/` and operate against the resolved config.** They don't know whether the config is demo or user-owned.
- **Everything under `src/demo/` is the only thing the interactive-onboarding follow-up will need to replace.** No `if (demo)` branches anywhere else.

### Command tree (PR 1)

```
actions                       — prints top-level --help
├── assets                    — actions.getSupportedAssets()
├── chains                    — enumerate config.chains (CLI-local — no SDK method)
└── wallet
    ├── address               — derive smart-wallet address from PRIVATE_KEY (no RPC)
    └── balance               — wallet.getBalance() across configured chains/assets
```

Lend/swap branches are not registered in PR 1. Commander's unknown-command error (exit 1, "error: unknown command 'lend'") is acceptable; PR 2/3 replace those errors with real handlers.

### Context / bootstrap

Commands declare their needs by importing the right context helper. Two tiers:

**Tier 0 — `baseContext` (no wallet):**

```ts
// src/core/context/baseContext.ts
export async function baseContext() {
  const config = loadConfig()
  const actions = createActions(config)
  return { config, actions }
}
```

Used by `assets`, `chains`. Does not read `PRIVATE_KEY`, does not hit RPC.

**Tier 1 — `walletContext` (smart wallet derived):**

```ts
// src/core/context/walletContext.ts
export async function walletContext() {
  const { config, actions } = await baseContext()
  const signer = privateKeyToAccount(requireEnv('PRIVATE_KEY') as `0x${string}`)
  const smartWallet = await actions.wallet.getSmartWallet({
    signer,
    deploymentSigners: [signer.address],
    nonce: 0n,
  })
  return { config, actions, signer, smartWallet }
}
```

Used by `wallet address`, `wallet balance`, and every wallet-scoped command PR 2/3 will add. Deterministic address derivation — no RPC needed for `wallet address`; `wallet balance` makes one RPC call per (chain, asset) tuple via the SDK's existing `fetchERC20Balance`/`fetchETHBalance` path.

### Env handling

envalid is lazy — called inside `requireEnv()`, not at module top-level — so `actions --help` works in an environment with no `PRIVATE_KEY` set (critical: the agent runs `--help` to discover commands before it has any wallet context).

```ts
// src/core/config/env.ts
import { cleanEnv, str } from 'envalid'

let cache: { PRIVATE_KEY?: `0x${string}`; [k: string]: unknown } | undefined

export function requireEnv<K extends 'PRIVATE_KEY'>(name: K): string {
  cache ??= cleanEnv(process.env, {
    PRIVATE_KEY: str({ desc: 'Agent signer private key (0x-prefixed)' }),
    // RPC overrides per chain — all optional; fall back to viem defaults
    BASE_SEPOLIA_RPC_URL: str({ default: '' }),
    OP_SEPOLIA_RPC_URL: str({ default: '' }),
    UNICHAIN_RPC_URL: str({ default: '' }),
  })
  const value = cache[name]
  if (!value) {
    throw new CliError('config', `Missing env var: ${name}`)
  }
  return value as string
}
```

### Output — JSON writer

```ts
// src/core/output/json.ts
export function writeJson(doc: unknown): void {
  process.stdout.write(stringifyWithBigInt(doc) + '\n')
}

// src/core/bigint.ts — PR 1 copies this locally; #419 extracts to SDK
export function stringifyWithBigInt(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, v) => (typeof v === 'bigint' ? v.toString() : v),
    2,
  )
}
```

### Error taxonomy + exit codes

Error shape includes `retryable: boolean` and optional `retry_after_ms` so the agent can decide whether to retry without parsing free-form messages. Retry semantics stay in the JSON body, not encoded in the exit code alone — the body gets parsed anyway, so adding it here costs little and lets the agent act on failures without hardcoded heuristics.

```ts
// src/core/output/errors.ts
export type ErrorCode =
  | 'validation' // bad flag, unknown asset/market/chain symbol
  | 'config'     // missing env, malformed config, RPC unreachable at load
  | 'network'    // RPC failure mid-operation
  | 'onchain'    // reverted tx, UserOp failure
  | 'unknown'    // uncaught

const EXIT: Record<ErrorCode, number> = {
  unknown: 1, validation: 2, config: 3, network: 4, onchain: 5,
}

// Default retryability per code. Network is retryable; everything else is not
// until we have evidence. Specific onchain sub-classes (nonce conflicts, gas
// underpricing) can flip retryable=true by constructing CliError explicitly.
const RETRYABLE_DEFAULT: Record<ErrorCode, boolean> = {
  unknown: false, validation: false, config: false, network: true, onchain: false,
}

export class CliError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
    public retryableOverride?: boolean,
    public retryAfterMs?: number,
  ) { super(message) }
  get retryable(): boolean {
    return this.retryableOverride ?? RETRYABLE_DEFAULT[this.code]
  }
}

function isEpipe(err: unknown): boolean {
  return (
    err instanceof Error &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'EPIPE'
  )
}

export function writeError(err: unknown): never {
  const code: ErrorCode = err instanceof CliError ? err.code : 'unknown'
  const message = err instanceof Error ? err.message : String(err)
  const details = err instanceof CliError ? err.details : undefined
  const retryable =
    err instanceof CliError ? err.retryable : RETRYABLE_DEFAULT[code]
  const retry_after_ms = err instanceof CliError ? err.retryAfterMs : undefined
  try {
    process.stderr.write(
      stringifyWithBigInt({ error: message, code, retryable, retry_after_ms, details }) + '\n',
    )
  } catch (writeErr) {
    // Parent process closed its read pipe — nothing we can do. Exit quietly.
    if (!isEpipe(writeErr)) throw writeErr
  }
  process.exit(EXIT[code])
}
```

Top-level entrypoint wraps the commander invocation and installs EPIPE guards so a prematurely-closed parent pipe doesn't leave Node throwing `Unhandled 'error' event`:

```ts
// src/index.ts
#!/usr/bin/env node
// ... imports
import { Command } from 'commander'

// Swallow EPIPE on stdout/stderr: happens when the agent closes its read pipe
// before the CLI finishes writing. Exit 0 — we wrote what we had.
process.stdout.on('error', (err) => { if (isEpipe(err)) process.exit(0) })
process.stderr.on('error', (err) => { if (isEpipe(err)) process.exit(0) })
process.on('uncaughtException', (err) => {
  if (isEpipe(err)) process.exit(0)
  writeError(err)
})

const program = new Command()
  // Strip ANSI in case commander ever emits colored help text under a TTY-less
  // parent. Modern commander respects NO_COLOR and detects non-TTY writers,
  // but the subprocess model makes this belt-and-suspenders cheap.
  .configureOutput({
    writeOut: (s) => process.stdout.write(s),
    writeErr: (s) => process.stderr.write(s),
  })
  .name('actions')
  // ...

program.parseAsync(process.argv).catch(writeError)
```

(Shebang is preserved by TSC as long as it's the first line of source; no post-build hack needed.)

### Resolvers

**Asset resolver** — maps `USDC` / `ETH` / etc. to `Asset` objects from `config.assets.allow`. Case-insensitive match on `metadata.symbol`. Ambiguity caveat: the demo config uses `USDC_DEMO` / `OP_DEMO` as symbols to distinguish from mainnet. PR 1 resolver uses exact-match; if a user-written config has colliding symbols we error with `validation`. Documented in `SKILL.md`.

**Chain resolver** — maps shortnames (`base`, `optimism`, `unichain`, `base-sepolia`, `op-sepolia`, `unichain-sepolia`) to `SupportedChainId`. Implemented as an explicit `Record<string, SupportedChainId>` in `src/core/resolvers/chains.ts`, restricted to chain IDs present in `config.chains`. We do **not** rely on viem's `chain.name` (which returns "OP Mainnet", "Base", etc. — poor fit for shell args).

### Demo config

Mirrors the demo backend's structure minus Privy. Uses `hostedWalletConfig: undefined` (post-#356 optional). Demo markets/assets are duplicated into `src/demo/` rather than imported from the backend package (see Risk 2).

```ts
// src/demo/config.ts — sketch
import { ETH } from '@eth-optimism/actions-sdk'
import type { NodeActionsConfig } from '@eth-optimism/actions-sdk/node'
import { USDC_DEMO, OP_DEMO } from './assets.js'
import { BASE_SEPOLIA, OPTIMISM_SEPOLIA, UNICHAIN } from './chains.js'
import { GauntletUSDCDemo, AaveETH } from './markets.js'

export function getDemoConfig(): NodeActionsConfig<never> {
  return {
    wallet: {
      // hostedWalletConfig omitted (#356)
      smartWalletConfig: { provider: { type: 'default', attributionSuffix: 'actions' } },
    },
    lend: {
      morpho: { marketAllowlist: [GauntletUSDCDemo] },
      aave: { marketAllowlist: [AaveETH] },
    },
    swap: { /* minimal — full setup lands in PR 3 */ },
    assets: { allow: [USDC_DEMO, OP_DEMO, ETH] },
    chains: [BASE_SEPOLIA, OPTIMISM_SEPOLIA, UNICHAIN],
  }
}

// src/core/config/loadConfig.ts
import { getDemoConfig } from '@/demo/config.js'

export function loadConfig() {
  return getDemoConfig()
}
```

The `<never>` generic parameter is the concrete claim that no hosted provider is configured (confirmed by reading `WalletNamespace.toActionsWallet`'s `ToActionsWalletParam<never>` branch at `origin/main:packages/sdk/src/wallet/core/namespace/WalletNamespace.ts`). If inference breaks in practice, fall back to explicit `createActions<never>(config)`.

### `SKILL.md` skeleton (PR 1 scope)

The file conforms to the [Agent Skills specification](https://agentskills.io/specification) (standardized in 2026, recognized by GitHub CLI, Claude Code, Cursor, Codex, Gemini CLI, VS Code, and OpenCode). Required YAML frontmatter: `name` (lowercase, hyphens, ≤64 chars, matching the containing directory's name) and `description` (≤1024 chars, explains what the skill does and when to use it). Body is free-form markdown but should stay under ~500 lines / ~5000 tokens for progressive disclosure — per-namespace detail for PR 2/3 should move into `packages/cli/references/{lend,swap}.md` rather than bloat the main file.

Directory layout: keeping `SKILL.md` at the package root (`packages/cli/SKILL.md`) is partial-conformance; strict spec-conformance nests it at `packages/cli/skills/actions-cli/SKILL.md`. Given single-consumer (opie) scope for PR 1, root-level is acceptable and can be migrated later if other tools need to discover it.

Five sections; lend/swap sub-sections are placeholders filled in PR 2/3:

```md
---
name: actions-cli
description: Invoke the Actions SDK from the shell — query assets/chains, derive a smart-wallet address from a PRIVATE_KEY env var, read balances. Use when an agent needs to interact with the Actions SDK without embedding TypeScript. Lend and swap commands land in PR 2/3.
compatibility: Requires Node.js >=18 and the PRIVATE_KEY env var for wallet-scoped commands.
---

# Actions CLI — Agent Skill

## Invocation
Spawn the `actions` binary as a subprocess. Pass subcommands + flags on argv. Read stdout as JSON. On nonzero exit, read stderr as JSON for error info.

## Command tree (current — PR 1)
- `actions assets` — supported-asset list.
- `actions chains` — configured chain shortnames + IDs.
- `actions wallet address` — derived smart-wallet address (deterministic; no RPC).
- `actions wallet balance` — balances per chain+asset.
- `actions wallet lend …` — [PR 2 — not yet available]
- `actions wallet swap …` — [PR 3 — not yet available]

## Resolution rules
- Assets: pass the `metadata.symbol` value from the allowlist (e.g. `USDC_DEMO`). Case-insensitive.
- Chains: pass a shortname from the configured chains (`base`, `op-sepolia`, etc.). Run `actions chains` for the current list.

## Output
- Success: JSON document on stdout, exit 0.
- Error: JSON `{error, code, retryable, retry_after_ms?, details?}` on stderr, non-zero exit. `retryable: true` means the agent may retry (typically network failures); `retry_after_ms` is present when a specific back-off is recommended.

## Exit codes
| Code | Meaning | Retryable |
|------|---------|-----------|
| 0    | Success | —        |
| 1    | Unknown error | false  |
| 2    | Validation (bad input) | false |
| 3    | Config error (missing env, malformed config) | false |
| 4    | Network error (RPC, timeout) | true |
| 5    | Onchain error (revert, UserOp failure) | false (caller may flip for specific sub-classes like nonce conflicts) |
```

### Implementation Phases

#### Phase 1 — Package scaffolding

Deliverables:
- `packages/cli/package.json` (deps: `@eth-optimism/actions-sdk` workspace, `commander`, `envalid`, `viem`; dev: `tsx`, `typescript`, `vitest`, `eslint`, `prettier`; scripts mirror backend: `build`, `clean`, `dev`, `lint`, `lint:fix`, `test`, `typecheck`).
- `packages/cli/tsconfig.json` extending `tsconfig.base.json`, identical shape to `packages/demo/backend/tsconfig.json` (NodeNext, `paths: {"@/*": ["./src/*"]}`, `target: es2021`).
- `packages/cli/vitest.config.ts` with `@` alias.
- `packages/cli/src/index.ts` with shebang + empty commander program + `writeError` wrapper. Running it prints the top-level help with zero subcommands registered (sanity gate).
- Changeset entry describing "Add actions-cli package".

Success criteria:
- `pnpm install` at repo root picks up the new workspace.
- `pnpm -C packages/cli build` produces `dist/index.js` with shebang preserved.
- `pnpm -C packages/cli dev` via tsx shows the top-level help.
- `pnpm typecheck` / `pnpm lint` pass at repo root.

#### Phase 2 — Core infrastructure

Deliverables (all under `src/core/`):
- `output/json.ts` + `bigint.ts` — `writeJson`, `stringifyWithBigInt`.
- `output/errors.ts` — `CliError`, `ErrorCode`, `writeError`, exit-code mapping. Unit tests covering each code path.
- `config/env.ts` — lazy `requireEnv()`; unit test that missing `PRIVATE_KEY` produces a `CliError` with code `config`.
- `config/loadConfig.ts` — single export returning the demo config.
- `context/baseContext.ts` + `context/walletContext.ts` — factory functions; `walletContext` calls `getSmartWallet` with `deploymentSigners`.
- `resolvers/assets.ts` + `resolvers/chains.ts` — unit-tested against a synthetic config (not the demo config; resolvers are config-agnostic).
- `demo/config.ts` + `demo/assets.ts` + `demo/chains.ts` + `demo/markets.ts` — mirroring backend constants but **owned by the CLI package** (no cross-package imports).

Success criteria:
- Unit test: `stringifyWithBigInt({a: 1n})` yields `{"a":"1"}`.
- Unit test: `writeError(new CliError('config', 'x'))` exits 3 and emits valid JSON on stderr.
- Unit test: asset resolver returns the right `Asset` for `USDC_DEMO` and errors on `UNKNOWN`.
- Unit test: chain resolver returns `baseSepolia.id` for `base-sepolia` and errors on `mars`.
- Unit test: `walletContext` with a test `PRIVATE_KEY` returns a `smartWallet` with a non-empty address — no RPC mock required (address derivation is pure).

#### Phase 3 — Smoke commands + SKILL.md + integration test

Deliverables:
- `commands/assets.ts` — calls `baseContext`, returns `actions.getSupportedAssets()`.
- `commands/chains.ts` — calls `baseContext`, returns `config.chains.map({chainId, shortname})` (maps chainId back to shortname via the chain resolver's inverse).
- `commands/wallet/address.ts` — calls `walletContext`, returns `{address: smartWallet.address}`.
- `commands/wallet/balance.ts` — calls `walletContext`, returns `await smartWallet.getBalance()` serialized with bigint coercion.
- `commands/wallet/index.ts` — builds the `wallet` commander subcommand and registers `address` and `balance` children.
- `SKILL.md` at package root with the five sections above.
- `README.md` pointing at `SKILL.md` and the parent brainstorm.
- One integration test that spawns the built binary (`node dist/index.js assets` + `node dist/index.js unknown-thing`) and asserts shape/exit code.

Success criteria (manual/live):
- `PRIVATE_KEY=0x<test key> actions wallet address` → JSON with a deterministic smart-wallet address.
- `PRIVATE_KEY=0x<funded sepolia key> actions wallet balance` → JSON array of per-chain balances (zero-balance entries included).
- `actions assets` (no env) → JSON array of configured assets.
- `actions --help` (no env) → top-level help text.
- `actions wallet nonsense` → non-zero exit; stderr JSON.

## Alternative Approaches Considered

**Task-level NL commands (`actions "swap 100 USDC for ETH"`)** — rejected in brainstorm. Duplicates the LLM's job in the CLI. Agent would still need to translate responses back to structured data.

**Single `actions exec <json>` dispatcher** — rejected in brainstorm. No `--help` per method, no shell ergonomics, makes SKILL.md a prose document rather than a command reference.

**User-supplied `./actions.config.ts` from cwd (no baked config)** — rejected in brainstorm. Extra onboarding step that doesn't pay off for hackathon timelines. Interactive agent onboarding (#411) is the better long-term path and it slots cleanly into `loadConfig()` via Decision 13.

**Explicit `actions wallet init` that calls `createSmartWallet`** — rejected in brainstorm. Adds a bootstrap step the agent has to remember. Lazy initCode via first UserOp is the standard ERC-4337 pattern and costs nothing.

**Bundle commands via oclif** — rejected implicitly by framework choice. The backend already uses `commander` and the SDK lists it as a peer dep; consistency wins. oclif's plugin system / code generation is overkill for a 10-command surface.

**Import demo constants from `@eth-optimism/actions-service`** (the backend package) **instead of duplicating** — see Risk 2. Duplication wins for demo isolation (brainstorm Decision 13); the shared extraction lives in #419's follow-up.

## System-Wide Impact

### Interaction graph

When the agent invokes `actions wallet balance`:

1. Commander parses argv, routes to `commands/wallet/balance.ts`.
2. Handler calls `walletContext()`:
   1. `loadConfig()` returns the demo config (synchronous, no I/O).
   2. `createActions(config)` constructs `Actions`, which instantiates `ChainManager(config.chains)`, `MorphoLendProvider`, `AaveLendProvider`, `UniswapSwapProvider`, `VelodromeSwapProvider` — all lazily used, none make RPC calls at construction.
   3. `requireEnv('PRIVATE_KEY')` runs envalid once; cached.
   4. `privateKeyToAccount(...)` creates a viem `LocalAccount` (pure).
   5. `actions.wallet.getSmartWallet({ signer, deploymentSigners: [signer.address], nonce: 0n })` → `WalletNamespace.resolveProvider()` builds a `WalletProvider` (lazy factory) → `smartWalletProvider.getWallet({ walletAddress, signer, signers })`. The `walletAddress` is derived via `getWalletAddress({ signers, nonce })` which, per `DefaultSmartWalletProvider`, is a pure EIP-1014 CREATE2 calculation — **no RPC**.
3. Handler calls `smartWallet.getBalance()`:
   1. Wallet iterates `supportedAssets` + ETH.
   2. For each (chain, asset) combo, `fetchERC20Balance` / `fetchETHBalance` issues a single `eth_call` / `eth_getBalance` via `chainManager.getPublicClient(chainId)`.
   3. Returns an array of `TokenBalance` objects with `bigint` fields.
4. Handler coerces bigints via `writeJson(balances)`, writes to stdout, exits 0.

Failure modes at each step are mapped to error codes in "Error propagation" below.

### Error & failure propagation

| Origin                                  | Surface as           | Code         | Retryable | Exit |
| --------------------------------------- | -------------------- | ------------ | --------- | ---- |
| Missing `PRIVATE_KEY`                   | `CliError('config')` | config       | false     | 3    |
| Malformed `PRIVATE_KEY` (not hex)       | viem error rethrown  | config (*)   | false     | 3    |
| Unknown asset symbol (resolver)         | `CliError('validation')` | validation | false   | 2    |
| Unknown chain shortname (resolver)      | `CliError('validation')` | validation | false   | 2    |
| RPC unreachable during `getBalance()`   | SDK throws           | network (*)  | **true**  | 4    |
| On-chain reversion (N/A for PR 1 reads) | —                    | onchain      | false (†) | 5    |
| Everything else                         | `Error` fallthrough  | unknown      | false     | 1    |

(†) PR 2/3 onchain errors may flip `retryable: true` for specific sub-classes (nonce conflict, gas underpricing) by passing `retryableOverride: true` to `CliError`. Default stays false until we have evidence.

(*) These require `writeError` to classify unknown errors. Strategy: `writeError` gets a small classifier that inspects error `.name` / message for viem's `InvalidAddressError`, `HttpRequestError`, etc. and maps them. If the classifier can't place an error, it falls through to `unknown` (exit 1). The classifier lives alongside `writeError` and is straightforward to extend in PR 2/3.

No partial failures on the PR 1 surface: `getBalance()` currently returns per-chain balances via `Promise.all`, so a single chain failing rejects the whole call. We leave that behavior alone in PR 1 — documented in `SKILL.md` as "if one RPC fails, the whole balance call fails; retry or reduce chain set in config." Splitting to `Promise.allSettled` is a nice-to-have but belongs with the SDK, not the CLI.

### State lifecycle risks

None in PR 1 — every command is read-only or pure-derivation. `wallet address` and `wallet balance` make no on-chain writes. The smart-wallet deploy-on-first-UserOp flow (brainstorm Decision 6) doesn't trigger for read-only reads, so the wallet may remain undeployed indefinitely; that's by design. PR 2/3 will trigger deploy-with-initCode on their first `open`/`execute` UserOp on a given chain.

### API surface parity

- **The demo backend exposes analogous HTTP endpoints** (`GET /lend/markets`, `POST /swap/execute`, etc.). The CLI and backend both wrap the same SDK method, independently. No coupling; each can evolve on its own schedule. If the SDK changes a method signature, both update; there's no CLI-specific wrapper in the SDK.
- **`serializeBigInt`** is duplicated in PR 1. #419 extracts it to an SDK util; CLI and backend both import from there once that lands. PR 1 does **not** block on #419 — the local copy is two lines.

### Integration test scenarios (for later — flagged for #418)

These scenarios cannot be covered by unit tests with mocks. They belong to the CI-smoke-test follow-up (#418) but are listed here so the implementer plans for them when writing handlers:

1. **Full cold-start: `PRIVATE_KEY` set, no cached state, `actions wallet balance` on a wallet that has never transacted.** Expect: array of zero balances per configured chain/asset, exit 0.
2. **`PRIVATE_KEY` missing, `actions wallet address`.** Expect: stderr JSON `{error, code: "config"}`, exit 3. stdout empty.
3. **Malformed `PRIVATE_KEY` (not 0x-prefixed).** Expect: stderr JSON, exit 3.
4. **RPC blackhole: point `BASE_SEPOLIA_RPC_URL` at an unreachable host, run `actions wallet balance`.** Expect: stderr JSON `code: "network"`, exit 4. (Will fail today because `getBalance()` uses `Promise.all`; document as expected behavior.)
5. **Happy path: `actions assets` with no env.** Expect: JSON array on stdout, exit 0.

## Acceptance Criteria

### Functional requirements

- [ ] `packages/cli/` exists with `name: "actions-cli"`, bin `actions`, and is picked up by the pnpm workspace root.
- [ ] `actions --help` prints the top-level command tree (from commander) and exits 0, with no env vars set.
- [ ] `actions assets` returns `config.assets.allow` as a JSON array.
- [ ] `actions chains` returns an array of `{shortname, chainId, rpcUrls}` from `config.chains`.
- [ ] `actions wallet address` returns `{address}` — the deterministically-derived smart-wallet address for the given `PRIVATE_KEY`. No RPC needed.
- [ ] `actions wallet balance` returns per-chain balances via `smartWallet.getBalance()`, bigints serialized as strings.
- [ ] Unknown commands (including `actions lend …` and `actions swap …`) exit non-zero with commander's default error on stderr.
- [ ] Missing `PRIVATE_KEY` on any wallet-scoped command produces stderr JSON with `code: "config"` and exit 3.
- [ ] `src/demo/` is the only directory referencing demo-specific constants. `src/core/` and `src/commands/` contain no demo string literals.
- [ ] `SKILL.md` documents invocation, command tree (with lend/swap marked as "not yet available"), resolution rules, output format, and exit codes.

### Non-functional requirements

- [ ] Bin entry has `#!/usr/bin/env node` shebang preserved through `tsc` build.
- [ ] No module top-level `cleanEnv` call — `actions --help` works without any env vars.
- [ ] JSON output never contains un-stringified `bigint` (would throw at `JSON.stringify` time — guard via `stringifyWithBigInt`).
- [ ] `actions wallet address` completes in < 100 ms (pure derivation; assertion in unit test).
- [ ] No `any` types; no `@ts-ignore`; `strict: true` enforced by `tsconfig.base.json`.
- [ ] EPIPE on stdout/stderr is caught and exits 0 (parent closed its read pipe before we finished writing).
- [ ] No ANSI escape codes in stdout or stderr under subprocess spawn (no TTY). Verified by the spawn integration test.

### Output contract (agent-consumable)

- [ ] Success output is a bare JSON doc on stdout — no envelope like `{data: ...}`. Matches `gh` / AWS CLI conventions; lets the agent pipe directly into `jq`.
- [ ] Error output is `{error, code, retryable, retry_after_ms?, details?}` on stderr. `retryable` is always present; `retry_after_ms` is present when a specific back-off is recommended.
- [ ] stdout is exclusively the API contract — no progress bars, warnings, or log lines leak there.
- [ ] `SKILL.md` includes Agent Skills spec frontmatter (`name: actions-cli`, `description: ...`).

### Quality gates

- [ ] Unit tests for `stringifyWithBigInt`, `writeError`, `requireEnv`, asset resolver, chain resolver. Target >= 90% line coverage on `src/core/`.
- [ ] One spawn-based integration test per command (5 total: `assets`, `chains`, `wallet address`, `wallet balance`, unknown command) — runs against the built binary. `wallet balance` uses a test private key with no funds; expects zero balances.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all green at repo root.
- [ ] Changeset entry present.
- [ ] `SKILL.md` reviewed by the person who will wire the agent (Kevin).
- [ ] Manual end-to-end: spawn the binary from a throwaway script mimicking opie's subprocess pattern; verify JSON parse succeeds.

## Success Metrics

- **Time to run PR 2 (lend):** the scaffolding's job is to make PR 2 a pure addition. If the PR 2 diff touches anything outside `src/commands/lend/` + `src/commands/wallet/lend/` + `src/demo/` + `SKILL.md`, that's a sign PR 1 got the split wrong.
- **Agent integration effort:** opie should be able to wire this in one evening. If the agent needs additional parsing or formatting glue beyond `spawn(binary, args)` + `JSON.parse(stdout)`, the output format was wrong.
- **Cold-start reliability:** 100 `actions wallet address` invocations in a row must all produce the same address and exit 0 (no flaky derivation).

## Dependencies & Prerequisites

### Hard prerequisites (blocking)

1. **#356 available on the working branch.** Merged to `main` at `58fc354d` (2026-04-21). Current branch `kevin/actions-cli` was cut from `ff3378db` (pre-#356). **Action: rebase or fresh-branch `feat/cli-scaffolding` from latest `main` before opening PR 1.** Verified:
   - `WalletConfig.hostedWalletConfig` is `?:` optional at `origin/main:packages/sdk/src/types/actions.ts:151`.
   - `WalletNamespace.toActionsWallet`'s adaptive `ToActionsWalletParam<never>` branch exists at `origin/main:packages/sdk/src/wallet/core/namespace/WalletNamespace.ts`.

### Soft prerequisites (nice-to-have, not blocking)

- **#419 serializeBigInt extraction.** PR 1 ships a local copy; if #419 lands first, PR 1 imports from the SDK instead. No rebase pain either way.

### Downstream

- **#409 (lend PR 2)** and **#410 (swap PR 3)** both depend on PR 1's `src/core/` infrastructure. They add siblings under `src/commands/{lend,swap,wallet/lend,wallet/swap}/` and extend `SKILL.md`. No retrofit to PR 1 should be needed.

## Risk Analysis & Mitigation

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | Post-#356 `createActions(config)` without an explicit generic fails type inference when `hostedWalletConfig` is omitted | Medium | Medium | Fall back to explicit `createActions<never>(config)`. If even that fails, open a small SDK follow-up to add a factory helper for the "no hosted provider" shape. Covered in Phase 2 success criteria. |
| 2 | Duplicating demo constants (`USDC_DEMO`, `OP_DEMO`, `GauntletUSDCDemo`, etc.) into `packages/cli/src/demo/` drifts from the demo backend | Low (short-lived demo) | Low | Drift is accepted — they're demo values, not production config. Coupling the CLI to the backend package to avoid drift violates the demo-isolation rule (brainstorm Decision 13). If drift causes confusion during hackathon, open a follow-up to extract shared constants into the SDK. |
| 3 | Shebang lost during TSC emit | Low | Medium | Shebang goes in `src/index.ts` as the first line. TSC preserves it when it's the very first token. Verified against backend build (backend does not use a shebang, so test this specifically during Phase 1). If TSC strips it, add a 3-line post-build script. |
| 4 | `getBalance()`'s `Promise.all` fails fast on a single bad RPC, producing a `network` error even when most chains would have worked | Low for demo (3 chains, testnet RPCs generally reliable) | Medium | Documented in `SKILL.md`. Long-term fix is `Promise.allSettled` + per-chain error shape, which is an SDK change. Out of scope for PR 1; track as nice-to-have. |
| 5 | Chain shortname collisions (`op-sepolia` vs `optimism-sepolia` vs `optimism_sepolia`) cause agent confusion | Medium | Low | Single canonical map in `src/core/resolvers/chains.ts`. `actions chains` output includes the exact accepted shortname per chain — `SKILL.md` tells the agent to run that command for the current list. |
| 6 | `bigint` value appears in an unserialized path (e.g. inside an `Error`'s `details`) and throws at write time | Low | Medium | `writeError` uses the same `stringifyWithBigInt`. Test: `writeError(new CliError('onchain', 'revert', { amount: 1n }))` succeeds. |
| 7 | The CLI's baked demo config drifts from the demo backend's, causing confusion when someone tries both | Medium | Low | Document in `packages/cli/README.md` that the CLI's demo is intentionally self-contained. If the demo-backend faucet adds a new asset, the CLI maintainer copies it manually. |
| 8 | Running `pnpm dev` (tsx) vs the built binary produces different behavior (path resolution, ESM loader, etc.) | Low | Medium | Integration test spawns the **built** binary specifically. Dev mode via `tsx` is for local iteration only. CI runs the built binary. |
| 9 | `envalid` validates once and caches — if the agent changes its env between CLI calls, the cache is per-process so no issue (each CLI invocation is fresh). But if anyone tests the module inside a long-lived process, the cache could hide changes | Very Low | Low | Not an issue for the agent (subprocess model). Documented as a comment on `requireEnv`. |
| 10 | First-time `getSmartWallet` path hits a bug in `DefaultSmartWalletProvider.getWalletAddress` we haven't exercised | Low | High | Phase 3 smoke test — verify the derived address matches what the demo backend computes for the same signer + nonce. If it doesn't, file an SDK bug before merging PR 1. |

## Resource Requirements

- **Effort:** ~1 engineer-day for a developer already familiar with the SDK and commander. Mostly config/tsconfig/workspace wiring + writing the five command handlers (each < 20 lines).
- **Review:** one reviewer familiar with the SDK's WalletNamespace (to sanity-check the `getSmartWallet` bootstrap) and one familiar with the monorepo scripts (workspace, changeset, resolve-tspaths).
- **Infra:** no new CI config. Existing CircleCI `check` job runs `pnpm -r {typecheck,lint,test}` — the new package is picked up automatically. No Docker changes.

## Future Considerations

- **PR 2 (lend, #409)** adds `src/commands/lend/` + `src/commands/wallet/lend/` + `src/core/resolvers/markets.ts` + lend section in `SKILL.md`. Reuses PR 1's contexts, output helpers, error taxonomy.
- **PR 3 (swap, #410)** adds `src/commands/swap/` + `src/commands/wallet/swap/` + swap section in `SKILL.md`. Adds `--in/--out/--chain` parsing; reuses asset + chain resolvers.
- **#411 interactive config onboarding:** `loadConfig()` grows a second code path that reads from a user file (e.g. `~/.actions/config.json`). Demo config becomes a fallback or is deleted.
- **#419 shared `serializeBigInt`:** CLI drops its local copy, imports from the SDK.
- **#418 CI smoke tests:** the integration-test scenarios listed under "Integration test scenarios" are formalized in a CI job.
- **#412 1-of-2 signer onboarding:** `walletContext` grows to accept `signers` + `nonce` from config (not hardcoded `[signer.address], 0n`). `actions wallet create --cosigner <addr>` adds a new command.
- **JSON help introspection.** Once the command surface passes ~15 subcommands (post-PR 3), add `actions describe [command]` or `actions --help --json` that emits the full tree — name, description, flags with types, required/optional, example invocations. Parsing commander's ANSI-formatted help text gets error-prone at scale; agents hallucinate flags and miss required args. Implementable in ~30 lines by walking `program.commands`. Not a PR 1 blocker; flagged for the PR that takes command count past ~15.

## Documentation Plan

- `packages/cli/README.md` — one-pager: what the package is, how to dev (`pnpm -C packages/cli dev assets`), pointers to `SKILL.md` and the brainstorm doc. Keep it short; `SKILL.md` is the actual reference.
- `packages/cli/SKILL.md` — the agent skill. See "SKILL.md skeleton" above for PR 1 content. Updated by PR 2/3.
- Changeset entry — a single `.changeset/*.md` describing the new package in one or two sentences.
- No CLAUDE.md updates needed — brainstorm + this plan + SKILL.md capture the conventions.

## Sources & References

### Origin

- **Brainstorm:** [`docs/brainstorms/2026-04-21-actions-cli-brainstorm.md`](../brainstorms/2026-04-21-actions-cli-brainstorm.md) — carried forward: 1:1 method-to-command mapping, baked demo config with `demo/` + `core/` split (Decision 13), `getSmartWallet` bootstrap with lazy initCode (Decision 5/6), JSON-only output with five-code error taxonomy (Decision 9/10), PR-per-namespace cadence (Decision 12).

### GitHub issues

- Root: [#407 Actions CLI](https://github.com/ethereum-optimism/actions/issues/407)
- This plan implements: [#408 CLI: scaffolding, --help, smoke tests](https://github.com/ethereum-optimism/actions/issues/408)
- Follows this: [#409 CLI: lend namespace](https://github.com/ethereum-optimism/actions/issues/409), [#410 CLI: swap namespace](https://github.com/ethereum-optimism/actions/issues/410)
- Related follow-ups: [#411](https://github.com/ethereum-optimism/actions/issues/411), [#418](https://github.com/ethereum-optimism/actions/issues/418), [#419](https://github.com/ethereum-optimism/actions/issues/419)

### SDK references (post-#356 — origin/main)

- `packages/sdk/src/types/actions.ts` — `ActionsConfig`, `WalletConfig` (optional `hostedWalletConfig`), `NodeActionsConfig`.
- `packages/sdk/src/wallet/core/namespace/WalletNamespace.ts` — `getSmartWallet`, `toActionsWallet`, `ToActionsWalletParam<never>` branch.
- `packages/sdk/src/wallet/core/providers/WalletProvider.ts:86-122` — `getSmartWallet` returns a wallet from deterministic address derivation (no RPC).
- `packages/sdk/src/wallet/core/wallets/smart/abstract/SmartWallet.ts` — `send`, `sendBatch`, `sendTokens`, `addSigner`, `removeSigner`.
- `packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts` — `getBalance` (iterates supported assets + ETH).
- `packages/sdk/src/nodeActionsFactory.ts` — `createActions<T extends NodeProviderTypes>`.

### Patterns mirrored from the demo backend

- Package scripts: `packages/demo/backend/package.json`.
- tsconfig shape: `packages/demo/backend/tsconfig.json`.
- envalid usage: `packages/demo/backend/src/config/env.ts`.
- `serializeBigInt`: `packages/demo/backend/src/utils/serializers.ts` (duplicated locally; #419 extracts).
- Demo config: `packages/demo/backend/src/config/{actions,assets,chains,markets}.ts`.
- vitest config: `packages/demo/backend/vitest.config.ts`.
- commander usage: `packages/demo/backend/src/app.ts` (backend uses it for the `App` subclass; CLI uses `Command` directly).

### External references

- [Commander.js docs](https://github.com/tj/commander.js) — subcommand registration, `parseAsync`, `configureOutput`, `NO_COLOR` handling.
- [viem `privateKeyToAccount`](https://viem.sh/docs/accounts/local/privateKeyToAccount.html).
- [ERC-4337 initCode pattern](https://eips.ethereum.org/EIPS/eip-4337) — smart wallet deploy on first UserOp.

**Agent-consumable CLI design (2026 conventions, folded into this plan):**

- [Agent Skills specification](https://agentskills.io/specification) — `SKILL.md` format, YAML frontmatter requirements, directory layout, progressive disclosure.
- [GitHub CLI — Manage agent skills](https://github.blog/changelog/2026-04-16-manage-agent-skills-with-github-cli/) — ecosystem adoption.
- [Anthropic — Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview).
- [Designing CLIs for AI Agents (2026)](https://medium.com/@dminhk/designing-clis-for-ai-agents-patterns-that-work-in-2026-29ac725850de) — stdout-is-API-contract, error body over exit code, subprocess model.
- [Justin Poehnelt — Rewrite your CLI for AI agents](https://justin.poehnelt.com/posts/rewrite-your-cli-for-ai-agents/) — help-as-JSON argument.
- [Building a CLI for Humans and Machines — openstatus](https://www.openstatus.dev/blog/building-cli-for-human-and-agents).
- [AWS CLI v2 structured error format](https://docs.aws.amazon.com/cli/v1/userguide/cli-usage-error-format.html) — bare payload on success, error envelope on failure.
- [Stripe CLI JSON envelope bug (#1353)](https://github.com/stripe/stripe-cli/issues/1353) — cautionary tale on wrapping success payloads.
- [Cloudflare `Retry-After` for retryable errors (2026-03)](https://developers.cloudflare.com/changelog/post/2026-03-12-retry-after-header-for-1xxx-errors/) — precedent for `retry_after_ms` in error bodies.
- [Node.js ESM shell scripts — 2ality](https://2ality.com/2022/07/nodejs-esm-shell-scripts.html) — shebang + ESM specifics.
- [nodejs/node#13662 — EPIPE handling](https://github.com/nodejs/node/issues/13662) — rationale for the EPIPE guard in `writeError` + top-level.
