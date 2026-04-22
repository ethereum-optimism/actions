---
title: Actions CLI scaffolding + --help + smoke tests (PR 1)
type: feat
status: active
date: 2026-04-21
deepened: 2026-04-21
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

PR 1's job is only to land the foundation. It must be rich enough that PR 2 (lend) and PR 3 (swap) are mostly additive — the one known exception is `src/output/errors.ts`, whose classifier naturally grows with every namespace that surfaces new viem/bundler error shapes (see Success Metrics).

## Proposed Solution

A new `packages/cli/` package (npm `actions-cli`, bin `actions`) that:

1. **Boots an `Actions` SDK instance from a baked demo config.** Config lives under `src/demo/` so the non-demo follow-up (#411) can swap `loadConfig()`'s source without touching anything else (brainstorm Decision 13).
2. **Derives a smart wallet from `PRIVATE_KEY`** on any command that needs it, using `actions.wallet.getSmartWallet({ signer, deploymentSigners: [signer.address], nonce: 0n })` — no hosted wallet, no `toActionsWallet`, lazy deploy via UserOp initCode on first mutation (brainstorm Decision 5/6). Address derivation itself performs one RPC round-trip to the smart-wallet factory (see Interaction graph); it is *deterministic* but *not* network-free.
3. **Wires a full `commander` tree** matching the brainstorm's naming heuristic (`getX()` → bare noun `x`). PR 1 only implements the four smoke commands; lend/swap subtrees are deliberately absent so unknown-command errors are clear. They are added in PR 2/3.
4. **Standardises output and error handling.** JSON-on-stdout (bigint-aware), JSON-on-stderr, five exit codes keyed to an error taxonomy, redaction of sensitive fields (bundler API keys, signer metadata) on the error path.
5. **Ships `SKILL.md`**, a minimal agent skill describing the command tree, resolution rules, and error codes — enough for opie on day one, filled in per-namespace in PR 2/3.

## Technical Approach

### Architecture

Flat top-level directories under `src/`, matching the demo backend's shape. The CLI deliberately **avoids a `core/` directory name** because the SDK already uses `core/` at four levels (`packages/sdk/src/{,wallet/,swap/,lend/}core/`) to mean "provider-agnostic base classes" — reusing the name for "config-agnostic CLI infra" would force a mental context-switch on every reviewer.

```
src/
  index.ts                    # bin entrypoint — commander tree + EPIPE + top-level error handler
  commands/                   # handlers: thin glue, zero business logic
    assets.ts
    chains.ts
    wallet/
      index.ts                # registers the wallet subcommand + adds children
      address.ts
      balance.ts
  config/
    loadConfig.ts             # returns a resolved NodeActionsConfig
    env.ts                    # lazy envalid accessor (see "Env handling" below)
  context/
    baseContext.ts            # { config, actions } — for read-only/no-wallet commands
    walletContext.ts          # { config, actions, signer, smartWallet } — for wallet commands
  output/
    json.ts                   # writeJson(doc) — stdout writer
    errors.ts                 # CliError, ErrorCode, safeDetails, writeError(err) → stderr + exit
  resolvers/
    assets.ts                 # symbol → Asset (from config.assets.allow)
    chains.ts                 # shortname → SupportedChainId (from config.chains); also inverse
    # markets.ts intentionally absent — added in PR 2
  utils/
    serializers.ts            # serializeBigInt (matches backend signature; #419 extracts later)
  services/                   # empty in PR 1; exists so PR 2/3 have a home for logic >15 LOC
  demo/                       # everything demo-specific; deleted/replaced by #411
    config.ts                 # the baked NodeActionsConfig
    chains.ts                 # BASE_SEPOLIA, OP_SEPOLIA, UNICHAIN (NO bundler config in PR 1)
    markets.ts                # GauntletUSDCDemo, AaveETH (allowlist — used by PR 2)
SKILL.md                      # agent skill — command tree + resolution rules + error codes
README.md                     # brief; point at SKILL.md and brainstorm; dev env-handling guidance
package.json
tsconfig.json                 # extends root tsconfig.base.json, mirrors backend's shape
vitest.config.ts              # @ alias; NO singleThread (backend needs it for ports; CLI doesn't)
```

**Deliberate non-existent files:**
- `src/demo/assets.ts` — the SDK already exports `USDC_DEMO`, `OP_DEMO`, and `ETH` from `packages/sdk/src/constants/assets.ts`. The CLI imports them directly. (The demo backend has a stale duplicate at `packages/demo/backend/src/config/assets.ts`; deleting it is a follow-up, not this PR's work.)
- `eslint.config.js` at the package level — the CLI inherits the root `eslint.config.js`, matching the backend's pattern (only the frontend has a package-local eslint config).

**Key architectural rules (brainstorm Decision 13 plus post-deepening additions):**

- **Command handlers live in `src/commands/` and know nothing about demo data.** They take a context (from `src/context/`) and produce a JSON document. Any demo-specific reference is a bug.
- **Resolvers live in `src/resolvers/` and operate against the resolved config.** They don't know whether the config is demo or user-owned.
- **Everything under `src/demo/` is the only thing the interactive-onboarding follow-up will need to replace.** No `if (demo)` branches anywhere else.
- **No module-level `actionsInstance` singleton.** The backend's `getActions()` pattern at `packages/demo/backend/src/config/actions.ts` is correct for a long-lived Hono server; it is an anti-pattern for a short-lived CLI subprocess. The CLI constructs a fresh `Actions` per invocation via `baseContext()` / `walletContext()`. No module-level `actions` variable anywhere.
- **Nested `commands/wallet/` intentionally diverges from the backend's flat `controllers/*.ts`.** Commander subtrees compose cleaner when each group owns a directory and registers its children from `index.ts` — and PR 2/3 will add `commands/wallet/lend/` and `commands/wallet/swap/` children under this structure.
- **Grow `src/services/` when handler logic exceeds ~15 LOC.** This mirrors the backend's `src/services/{wallet,lend,swap}.ts`. Keeping the directory name identical makes a future shared-services extraction a name-for-name move (follow-up, not PR 1).

### Command tree (PR 1)

```
actions                       — prints top-level --help
├── assets                    — actions.getSupportedAssets()
├── chains                    — enumerate config.chains (CLI-local — no SDK method)
└── wallet
    ├── address               — derive smart-wallet address (1 RPC to factory)
    └── balance               — wallet.getBalance() across configured chains/assets
```

Lend/swap branches are not registered in PR 1. Commander's unknown-command error (exit 1, "error: unknown command 'lend'") is acceptable; PR 2/3 replace those errors with real handlers.

### Context / bootstrap

Commands declare their needs by importing the right context helper. Two tiers:

**Tier 0 — `baseContext` (no wallet):**

```ts
// src/context/baseContext.ts
export async function baseContext() {
  const config = loadConfig()
  const actions = createActions(config)
  return { config, actions }
}
```

Used by `assets`, `chains`. Does not read `PRIVATE_KEY`. Note: `createActions(config)` eagerly constructs `ChainManager`, every configured lend/swap provider, and the new `EnsNamespace` (added by #356 on `origin/main`). None of those make RPC calls at construction, but they allocate. Track as a potential follow-up (SDK: lazy provider construction) if the eager work ever blocks hot-path targets.

**Tier 1 — `walletContext` (smart wallet derived):**

```ts
// src/context/walletContext.ts
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

`getSmartWallet` is deterministic in its result but **performs one `eth_call`** against the smart-wallet factory on the first configured chain to derive the address (`DefaultSmartWalletProvider.getWalletAddress` calls `publicClient.readContract({ functionName: 'getAddress', args: [signerBytes, nonce] })`). Implications:

- `wallet address` is RPC-bound, not pure. Typical cost on a public testnet RPC is tens of ms; cold paths with DNS + TLS can reach hundreds.
- A misconfigured or unreachable RPC surfaces as a `network` error, not a `config` error (see Error propagation).
- The "determinism" guarantee — same `{signer, nonce}` across invocations → same address — still holds; it's just network-backed determinism.

`wallet balance` then makes one RPC call per (chain, asset) tuple via the SDK's existing `fetchERC20Balance`/`fetchETHBalance` path.

### Env handling

envalid is lazy — called inside `requireEnv()`, not at module top-level — so `actions --help` works in an environment with no `PRIVATE_KEY` set (critical: the agent runs `--help` to discover commands before it has any wallet context). This is a new pattern in the monorepo; the backend's `src/config/env.ts` calls `cleanEnv` at module top level.

```ts
// src/config/env.ts
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

### Output — JSON writer and serializer

The serializer signature matches the backend's `packages/demo/backend/src/utils/serializers.ts` (`serializeBigInt(obj) → re-parsed object`), so the eventual shared-extraction follow-up (#419) is a name-for-name move.

```ts
// src/utils/serializers.ts — PR 1 local copy; #419 extracts to SDK util
export function serializeBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_key, v) => (typeof v === 'bigint' ? v.toString() : v)),
  )
}

// src/output/json.ts
export function writeJson(doc: unknown): void {
  process.stdout.write(JSON.stringify(serializeBigInt(doc), null, 2) + '\n')
}
```

### Error taxonomy + exit codes

Error shape includes `retryable: boolean` and optional `retry_after_ms` so the agent can decide whether to retry without parsing free-form messages. **`details` is redacted** — viem errors routinely pack raw request payloads, bundler URLs (which contain Pimlico/Alchemy API keys in the path), and signer metadata into `.details` / `.metaMessages`. A naive `JSON.stringify(details)` leaks operational state and credentials. Redaction happens via a small `safeDetails()` helper that allowlists fields and pattern-strips API-key-shaped URL segments.

```ts
// src/output/errors.ts
export type ErrorCode =
  | 'validation' // bad flag, unknown asset/market/chain symbol
  | 'config'     // missing env, malformed config, malformed PRIVATE_KEY
  | 'network'    // RPC failure mid-operation (includes wallet-address factory read)
  | 'onchain'    // reverted tx, UserOp failure
  | 'unknown'    // uncaught

const EXIT: Record<ErrorCode, number> = {
  unknown: 1, validation: 2, config: 3, network: 4, onchain: 5,
}

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

// Redacts potentially-sensitive fields before stderr emission.
// - Bundler/RPC URLs containing API keys are pattern-stripped.
// - viem Error objects are reduced to { errorName, shortMessage }.
// - Only an allowlist of scalar fields from known shapes is passed through.
export function safeDetails(details: unknown): unknown {
  // Directional guidance: allowlist by shape-detection; strip
  // /v[0-9]+/[^/]+/rpc(\?.*)? API-key segments; never pass viem Account objects.
  // Actual implementation is a small switch on err.name / shape recognition.
  return /* redacted shape */ details
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
  const details =
    err instanceof CliError ? safeDetails(err.details) : undefined
  const retryable =
    err instanceof CliError ? err.retryable : RETRYABLE_DEFAULT[code]
  const retry_after_ms = err instanceof CliError ? err.retryAfterMs : undefined
  try {
    const body = JSON.stringify(
      serializeBigInt({ error: message, code, retryable, retry_after_ms, details }),
      null,
      2,
    )
    process.stderr.write(body + '\n')
  } catch (writeErr) {
    if (!isEpipe(writeErr)) throw writeErr
  }
  process.exit(EXIT[code])
}
```

The classifier that maps untyped SDK/viem/bundler errors into `ErrorCode` lives alongside `writeError`. It will grow with every PR that surfaces a new error shape — this is accepted (see Success Metrics; the "PR 2/3 is a pure addition" metric explicitly excludes `src/output/errors.ts`). PR 1 ships a minimal classifier handling known shapes from the Phase-1 smoke commands; PR 2/3 extend it.

Top-level entrypoint wraps the commander invocation and installs EPIPE guards so a prematurely-closed parent pipe doesn't leave Node throwing `Unhandled 'error' event`:

```ts
// src/index.ts
#!/usr/bin/env node
// ... imports
import { Command } from 'commander'

process.stdout.on('error', (err) => { if (isEpipe(err)) process.exit(0) })
process.stderr.on('error', (err) => { if (isEpipe(err)) process.exit(0) })
process.on('uncaughtException', (err) => {
  if (isEpipe(err)) process.exit(0)
  writeError(err)
})

const program = new Command()
  .configureOutput({
    writeOut: (s) => process.stdout.write(s),
    writeErr: (s) => process.stderr.write(s),
  })
  .name('actions')
  // ... subcommands registered here

program.parseAsync(process.argv).catch(writeError)
```

### Resolvers

**Asset resolver** — maps `USDC` / `ETH` / etc. to `Asset` objects from `config.assets.allow`. Case-insensitive match on `metadata.symbol`. The demo config uses `USDC_DEMO` / `OP_DEMO` as symbols to distinguish from mainnet; `SKILL.md` tells the agent to run `actions assets` for the current list.

**Chain resolver** — maps shortnames (`base`, `optimism`, `unichain`, `base-sepolia`, `op-sepolia`, `unichain-sepolia`) to `SupportedChainId`. Implemented as an explicit `Record<string, SupportedChainId>` in `src/resolvers/chains.ts`, restricted to chain IDs present in `config.chains`. We do **not** rely on viem's `chain.name` (which returns "OP Mainnet", "Base", etc. — poor fit for shell args). The resolver also exposes an inverse (chainId → shortname) used by `actions chains` output; the round-trip property `inverse(forward(shortname)) === shortname` is enforced by unit test.

### Demo config

Mirrors the demo backend's structure minus Privy. `hostedWalletConfig` omitted (post-#356 optional). `swap` is **omitted entirely** rather than sketched as `swap: {}` — `SwapConfig` is typed as `RequireAtLeastOne<{uniswap?, velodrome?}>`, so an empty object is a type error; omitting it makes `actions.swap` throw a clean "not configured" message on access. PR 3 adds the real swap provider config. Demo markets are duplicated into `src/demo/markets.ts`; demo assets are imported directly from the SDK.

```ts
// src/demo/config.ts — sketch
import {
  ETH,
  USDC_DEMO,
  OP_DEMO,
  type NodeActionsConfig,
} from '@eth-optimism/actions-sdk'
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
    // swap: intentionally omitted in PR 1 — see Demo config note above
    assets: { allow: [USDC_DEMO, OP_DEMO, ETH] },
    chains: [BASE_SEPOLIA, OPTIMISM_SEPOLIA, UNICHAIN],
  }
}

// src/config/loadConfig.ts
import { getDemoConfig } from '@/demo/config.js'

export function loadConfig() {
  return getDemoConfig()
}
```

`src/demo/chains.ts` defines `BASE_SEPOLIA` / `OPTIMISM_SEPOLIA` / `UNICHAIN` with optional RPC URLs wired from env. It **omits bundler config in PR 1** — PR 1 commands are read-only, so bundler wiring is dead weight until PR 2's first UserOp-sending command. PR 2 adds bundler fields.

The `<never>` generic parameter is the concrete claim that no hosted provider is configured (confirmed by reading `WalletNamespace.toActionsWallet`'s `ToActionsWalletParam<never>` branch on `origin/main`). For PR 1's surface the generic is cosmetic — none of the smoke commands call `toActionsWallet`. If inference breaks in practice, fall back to explicit `createActions<never>(config)`.

### `SKILL.md` skeleton (PR 1 scope)

The file conforms to the [Agent Skills specification](https://agentskills.io/specification) (standardized in 2026, recognized by GitHub CLI, Claude Code, Cursor, Codex, Gemini CLI, VS Code, and OpenCode). Required YAML frontmatter: `name` (lowercase, hyphens, ≤64 chars, matching the containing directory's name) and `description` (≤1024 chars, explains what the skill does and when to use it). Body is free-form markdown but should stay under ~500 lines / ~5000 tokens for progressive disclosure — per-namespace detail for PR 2/3 should move into `packages/cli/references/{lend,swap}.md` rather than bloat the main file.

**Placement:** there is already a `/SKILL.md` at repo root; `packages/cli/SKILL.md` joins it as the second. Both are partial-conformance (strict spec wants `skills/<name>/SKILL.md`). If the repo later adopts strict placement, both files relocate together — note this in a one-line comment inside each `SKILL.md`.

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
- `actions wallet address` — derived smart-wallet address (one RPC to factory; deterministic result).
- `actions wallet balance` — balances per chain+asset.
- `actions wallet lend …` — [PR 2 — not yet available]
- `actions wallet swap …` — [PR 3 — not yet available]

## Resolution rules
- Assets: pass the `metadata.symbol` value from the allowlist (e.g. `USDC_DEMO`). Case-insensitive.
- Chains: pass a shortname from the configured chains (`base`, `op-sepolia`, etc.). Run `actions chains` for the current list.

## Output
- Success: JSON document on stdout, exit 0.
- Error: JSON `{error, code, retryable, retry_after_ms?, details?}` on stderr, non-zero exit. `retryable: true` means the agent may retry (typically network failures); `retry_after_ms` is present when a specific back-off is recommended. `details` is redacted — bundler URLs and signer metadata are scrubbed.

## Balance semantics
`actions wallet balance` is all-or-nothing: internally the SDK uses nested `Promise.all` over (asset × chain), so any single failing RPC rejects the whole call with a `network` error. Retries may succeed on a different chain — do not assume per-chain isolation.

## RPC trust
`*_RPC_URL` env vars must point to operator-trusted endpoints. A malicious RPC can return fake balance or (in PR 2/3) fake quote/market data. PR 1 is low-severity (fake zero balances confuse the agent); PR 2/3 escalates to high-severity (agent authorizes mutations against fake state).

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
- `packages/cli/package.json`:
  - Deps: `@eth-optimism/actions-sdk` (workspace), `commander`, `envalid`, `viem`.
  - Dev deps: `tsx`, `typescript`, `vitest`, `eslint`, `prettier`.
  - Scripts mirror backend verbatim: `build`, `clean`, `dev`, `lint`, `lint:fix`, `start`, `test`, `typecheck` (plan previously omitted `start` and `clean`).
  - `"type": "module"`, `"bin": { "actions": "./dist/index.js" }` as a top-level field (not nested in `exports`).
  - `"private": true` (matches backend; private packages still get versioned per `.changeset/config.json`).
- `packages/cli/tsconfig.json` extending `tsconfig.base.json`, identical shape to `packages/demo/backend/tsconfig.json`: `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `target: "es2021"`, `composite: true`, `paths: {"@/*": ["./src/*"]}`, `rootDir: "src"`.
- `packages/cli/vitest.config.ts` with `@` alias and `testTimeout: 30_000` (SDK's value, not backend's 60_000 which exists for port-conflict reasons). **Do not** copy the backend's `singleThread: true` / `fileParallelism: false`.
- `packages/cli/src/index.ts` with shebang + empty commander program + `writeError` wrapper.
- **No package-local eslint config.** Inherit root `eslint.config.js` (matches backend; only the frontend has a local eslint config).
- Changeset entry: `.changeset/add-actions-cli-package.md` (intentional-name style preferred by recent monorepo history), frontmatter `'actions-cli': minor`.

Success criteria:
- `pnpm install` at repo root picks up the new workspace.
- `pnpm -C packages/cli build` produces `dist/index.js`.
- **From a fresh clone**, `node packages/cli/dist/index.js --help` resolves all `@/` imports (proves `resolve-tspaths` is wired correctly — this is the real canary, not just "produces dist/index.js").
- `./packages/cli/dist/index.js --help` works as an executable (proves the shebang interpreter line — separate from the ESM resolution check).
- `pnpm -C packages/cli dev` via tsx shows the top-level help (note: tsx strips the shebang, so this does NOT validate finding above — it's a separate smoke).
- `pnpm typecheck` / `pnpm lint` pass at repo root.

#### Phase 2 — Core infrastructure

Deliverables:
- `src/output/json.ts` + `src/utils/serializers.ts` — `writeJson`, `serializeBigInt`.
- `src/output/errors.ts` — `CliError`, `ErrorCode`, `safeDetails`, `writeError`, exit-code mapping. Unit tests per error code, plus redaction tests (see below).
- `src/config/env.ts` — lazy `requireEnv()`; unit test that missing `PRIVATE_KEY` produces a `CliError` with code `config`.
- `src/config/loadConfig.ts` — single export returning the demo config.
- `src/context/baseContext.ts` + `src/context/walletContext.ts` — factory functions; `walletContext` calls `getSmartWallet` with `deploymentSigners`.
- `src/resolvers/assets.ts` + `src/resolvers/chains.ts` — unit-tested against a synthetic config (not the demo config; resolvers are config-agnostic). Chain resolver exposes an inverse (chainId → shortname).
- `src/demo/config.ts` + `src/demo/chains.ts` + `src/demo/markets.ts` — demo constants owned by the CLI package. `src/demo/assets.ts` is deliberately NOT created (import from SDK).
- Add `no-console` ESLint rule scoped to `src/` (override the root config for this package). A stray `console.log(signer)` in a handler would route through Node's default serializer and leak the signer's address + publicKey metadata.

Success criteria:
- Unit test: `serializeBigInt({a: 1n})` returns `{a: "1"}`.
- Unit test: `writeError(new CliError('config', 'x'))` exits 3 and emits valid JSON on stderr.
- **Unit test (redaction):** `writeError(new CliError('onchain', 'x', { bundlerUrl: 'https://api.pimlico.io/v2/8453/rpc?apikey=SECRET', signer: fakeAccount }))` produces stderr JSON containing neither `SECRET`, nor the signer's `publicKey` or `address` metadata.
- **Unit test (lazy env contract):** `vi.spyOn(envalid, 'cleanEnv')`; importing `./env.js` does not call it; first `requireEnv()` does. Locks the "`actions --help` works with no env" contract structurally.
- Unit test: asset resolver returns the right `Asset` for `USDC_DEMO` and errors on `UNKNOWN`.
- Unit test: chain resolver returns `baseSepolia.id` for `base-sepolia` and errors on `mars`. Round-trip: `inverse(forward(shortname)) === shortname` for every entry.
- Unit test: `walletContext` with a fixed test `PRIVATE_KEY` returns a `smartWallet` whose address is the expected deterministic value. The test mocks the smart-wallet factory `readContract` call (not a pure computation; see Interaction graph) — alternatively this can become an integration test against Anvil. Decide during implementation.

#### Phase 3 — Smoke commands + SKILL.md + integration tests

Deliverables:
- `src/commands/assets.ts` — calls `baseContext`, returns `actions.getSupportedAssets()`.
- `src/commands/chains.ts` — calls `baseContext`, returns `config.chains.map({chainId, shortname})` (via the chain resolver's inverse).
- `src/commands/wallet/address.ts` — calls `walletContext`, returns `{address: smartWallet.address}`.
- `src/commands/wallet/balance.ts` — calls `walletContext`, returns `await smartWallet.getBalance()` serialized with bigint coercion.
- `src/commands/wallet/index.ts` — builds the `wallet` commander subcommand and registers `address` and `balance` children.
- `SKILL.md` at package root with the sections above.
- `README.md` pointing at `SKILL.md` and the parent brainstorm, plus a short "dev env handling" note: prefer `direnv` or a `.env` file over inline `PRIVATE_KEY=0x... actions ...` (which lands in `~/.bash_history`).
- Integration tests that spawn the **built** binary via Node's `execFile` (not `spawn` — `execFile` returns stdout/stderr/code in a single buffer, matching test assertion shape cleanly). `beforeAll` runs `pnpm build`, or the test explicitly requires CI has built (document the choice).

**Per-handler unit test scenarios:**

- `actions assets` (no wallet):
  - Happy: mock `actions.getSupportedAssets()` → `[USDC_DEMO, ETH]`. Assert stdout is JSON array, length 2, exit 0.
  - bigint round-trip: include an asset with a bigint field (e.g., synthetic `decimals: 18n`); assert stringification.
  - SDK throws: mock `actions.getSupportedAssets()` to throw. Assert stderr `code: "unknown"`, exit 1.
- `actions chains` (no wallet, no SDK call):
  - Happy: synthetic `config.chains = [BASE_SEPOLIA, OP_SEPOLIA]`; stdout contains both shortnames and chainIds.
  - Round-trip: for every entry, `inverse(forward(shortname)) === shortname`.
  - Empty: `config.chains = []` → stdout `[]`, exit 0.
- `actions wallet address` (wallet context, one RPC):
  - Happy: fixed `PRIVATE_KEY=0xac09...ff80` (ANVIL_ACCOUNTS.ACCOUNT_0 from `packages/sdk/src/utils/test.ts`); assert stdout JSON `{address}` matches the expected deterministic value. Hardcode the expected address.
  - Determinism: 3 invocations with the same key → same address.
  - Missing env: `PRIVATE_KEY` unset → stderr `code: "config"`, exit 3; stdout empty.
  - Malformed env: `PRIVATE_KEY=not-hex` → stderr `code: "config"`, exit 3.
  - RPC unreachable (factory read): point RPC at a blackhole → stderr `code: "network"`, `retryable: true`, exit 4.
- `actions wallet balance` (wallet context, multi-RPC):
  - Happy with mock: mock `smartWallet.getBalance()` → `[{chainId: 84532, asset: USDC_DEMO, balance: 0n}]`. Assert `0n` serializes as `"0"`.
  - Partial failure (nested `Promise.all` fast-fails): mock one chain's balance to throw `HttpRequestError` → stderr `code: "network"`, `retryable: true`, exit 4. Locks Risk 4 behavior.
  - Missing env: `code: "config"`, exit 3.
  - bigint precision: balance `1234567890123456789n` → stringifies as `"1234567890123456789"` (no precision loss, no scientific notation).
- Unknown command (integration test):
  - `actions lend nonsense` → non-zero exit; stderr is **commander's default text format**, not `writeError` JSON. Lock this distinction: `writeError` JSON is only for errors thrown from within registered handlers.

**Spawn-based integration test set (4 tests, one per exit-code path):**
- `actions assets` with no env → stdout parses as JSON, exit 0.
- `actions <unknown>` → commander's default error on stderr (plain text), exit 1.
- `actions wallet address` with no `PRIVATE_KEY` → stderr JSON `code: "config"`, exit 3.
- `actions wallet balance` with `BASE_SEPOLIA_RPC_URL=http://127.0.0.1:1` (blackhole) → stderr JSON `code: "network"`, `retryable: true`, exit 4.

## Alternative Approaches Considered

**Task-level NL commands (`actions "swap 100 USDC for ETH"`)** — rejected in brainstorm. Duplicates the LLM's job in the CLI. Agent would still need to translate responses back to structured data.

**Single `actions exec <json>` dispatcher** — rejected in brainstorm. No `--help` per method, no shell ergonomics, makes SKILL.md a prose document rather than a command reference.

**User-supplied `./actions.config.ts` from cwd (no baked config)** — rejected in brainstorm. Extra onboarding step that doesn't pay off for hackathon timelines. Interactive agent onboarding (#411) is the better long-term path and it slots cleanly into `loadConfig()` via Decision 13.

**Explicit `actions wallet init` that calls `createSmartWallet`** — rejected in brainstorm. Adds a bootstrap step the agent has to remember. Lazy initCode via first UserOp is the standard ERC-4337 pattern and costs nothing.

**Bundle commands via oclif** — rejected. The backend already uses `commander` and the SDK lists it as a peer dep; consistency wins. oclif's plugin system is overkill for a ≤20-command surface.

**Import demo constants from `@eth-optimism/actions-service`** (the backend package) — rejected. Demo isolation (brainstorm Decision 13) requires the CLI to own its demo data. Instead, the CLI imports shared assets from the SDK (`ETH`, `USDC_DEMO`, `OP_DEMO`) and owns only the truly-demo-specific market and chain constants.

**Flat `src/commands/*.ts` layout** (matching backend `controllers/*.ts`) — rejected for the CLI. Commander subtrees compose cleaner when each group (wallet, lend, swap) owns a directory with an `index.ts` that registers children. PR 2/3 add nested children under `commands/wallet/{lend,swap}/` that would become awkward under a flat layout.

**`core/` directory name** — rejected. The SDK reserves `core/` at four levels for provider-agnostic base classes. Using it for CLI infra forces a mental context-switch on every reviewer.

## System-Wide Impact

### Interaction graph

When the agent invokes `actions wallet balance`:

1. Commander parses argv, routes to `src/commands/wallet/balance.ts`.
2. Handler calls `walletContext()`:
   1. `loadConfig()` returns the demo config (synchronous, no I/O).
   2. `createActions(config)` constructs `Actions`. This **eagerly** instantiates `ChainManager`, `MorphoLendProvider`, `AaveLendProvider`, any configured swap providers (none in PR 1), the new `EnsNamespace` (post-#356), and runs `validateConfigAddresses(config)`. None of these make RPC calls at construction, but they allocate. For `actions assets` / `actions chains` this is strictly wasted work; a follow-up could make provider construction lazy inside the SDK.
   3. `requireEnv('PRIVATE_KEY')` runs envalid once; cached for the process.
   4. `privateKeyToAccount(...)` creates a viem `LocalAccount` (pure).
   5. `actions.wallet.getSmartWallet(...)` → `WalletNamespace.resolveProvider()` builds a `WalletProvider` (lazy factory) → `smartWalletProvider.getWallet(...)`. `getWalletAddress` performs **one `eth_call`** to the smart-wallet factory contract on the first configured chain. Not a pure computation — RPC-bound.
3. Handler calls `smartWallet.getBalance()`:
   1. Wallet iterates `supportedAssets` + ETH via a **nested `Promise.all`** (outer: assets, inner: chains). 3 assets × 3 chains = 9 RPCs. A single failing RPC fails the inner `Promise.all`, which fails the outer — all 9 reads fail.
   2. For each (chain, asset), `fetchERC20Balance` / `fetchETHBalance` issues a single `eth_call` / `eth_getBalance`.
   3. Returns an array of `TokenBalance` objects with `bigint` fields.
4. Handler coerces bigints via `writeJson(balances)`, writes to stdout, exits 0.

### Error & failure propagation

| Origin                                              | Surface as                 | Code       | Retryable | Exit |
| --------------------------------------------------- | -------------------------- | ---------- | --------- | ---- |
| Missing `PRIVATE_KEY`                               | `CliError('config')`       | config     | false     | 3    |
| Malformed `PRIVATE_KEY` (not hex)                   | viem error → classifier    | config     | false     | 3    |
| Unknown asset symbol (resolver)                     | `CliError('validation')`   | validation | false     | 2    |
| Unknown chain shortname (resolver)                  | `CliError('validation')`   | validation | false     | 2    |
| **RPC failure during `wallet address` factory read**| SDK throws → classifier    | network    | **true**  | 4    |
| RPC failure during `getBalance()` (any of 9 calls)  | SDK throws → classifier    | network    | **true**  | 4    |
| On-chain reversion (N/A for PR 1 reads)             | —                          | onchain    | false (†) | 5    |
| Unknown command                                     | commander default (text)   | —          | —         | 1    |
| Everything else                                     | `Error` fallthrough        | unknown    | false     | 1    |

(†) PR 2/3 onchain errors may flip `retryable: true` for specific sub-classes (nonce conflict, gas underpricing) via `retryableOverride`. Default stays false until we have evidence.

The classifier inside `writeError` maps untyped SDK/viem errors to `ErrorCode`. It grows with every PR that surfaces a new error shape — this coupling is explicit in Success Metrics.

### State lifecycle risks

None in PR 1 — every command is read-only. `wallet address` and `wallet balance` make no on-chain writes. The smart-wallet deploy-on-first-UserOp flow (brainstorm Decision 6) doesn't trigger for read-only reads, so the wallet may remain undeployed indefinitely; that's by design. PR 2/3 will trigger deploy-with-initCode on their first `open`/`execute` UserOp on a given chain.

### API surface parity

- **The demo backend exposes analogous HTTP endpoints.** The CLI and backend both wrap the same SDK method, independently. No coupling; each can evolve on its own schedule.
- **`serializeBigInt`** is duplicated in PR 1 using the backend's signature. #419 extracts it to an SDK util; CLI and backend both import from there once that lands. PR 1 does not block on #419.
- **Demo asset constants** (`USDC_DEMO`, `OP_DEMO`, `ETH`) are imported from the SDK directly by both the CLI and (ideally) the backend. The backend currently has a stale duplicate at `packages/demo/backend/src/config/assets.ts` that should be deleted in a follow-up.

## Acceptance Criteria

### Functional requirements

- [ ] `packages/cli/` exists with `name: "actions-cli"`, bin `actions`, and is picked up by the pnpm workspace root.
- [ ] `actions --help` prints the top-level command tree and exits 0 with no env vars set.
- [ ] `actions assets` returns `config.assets.allow` as a JSON array.
- [ ] `actions chains` returns an array of `{shortname, chainId, rpcUrls}` from `config.chains`.
- [ ] `actions wallet address` returns `{address}` — the deterministically-derived smart-wallet address for the given `PRIVATE_KEY`, sourced via one `eth_call` to the smart-wallet factory.
- [ ] `actions wallet balance` returns per-chain balances via `smartWallet.getBalance()`, bigints serialized as strings.
- [ ] Unknown commands exit non-zero with commander's default error (plain text) on stderr — not `writeError` JSON.
- [ ] Missing `PRIVATE_KEY` on any wallet-scoped command produces stderr JSON with `code: "config"` and exit 3.
- [ ] `src/demo/` is the only directory referencing demo-specific constants. Command handlers and resolvers contain no demo string literals.
- [ ] `SKILL.md` documents invocation, command tree (with lend/swap marked "not yet available"), resolution rules, balance semantics, RPC trust model, output format, and exit codes.
- [ ] `src/demo/assets.ts` does NOT exist; `USDC_DEMO`/`OP_DEMO`/`ETH` are imported directly from `@eth-optimism/actions-sdk`.

### Non-functional requirements

- [ ] Bin entry has `#!/usr/bin/env node` shebang preserved through `tsc` build.
- [ ] No module top-level `cleanEnv` call — `actions --help` works without any env vars. Enforced structurally by unit test (vi.spyOn on `envalid.cleanEnv` across import).
- [ ] JSON output never contains un-stringified `bigint`.
- [ ] No `any` types; no `@ts-ignore`; `strict: true` enforced by `tsconfig.base.json`.
- [ ] EPIPE on stdout/stderr is caught and exits 0.
- [ ] No ANSI escape codes in stdout or stderr under subprocess spawn (no TTY). Verified by integration test.
- [ ] `no-console` ESLint rule enforced on `src/` (override root config for this package).
- [ ] No module-level `actionsInstance` singleton. Every command path constructs `Actions` fresh via `baseContext()` / `walletContext()`.

### Output contract (agent-consumable)

- [ ] Success output is a bare JSON doc on stdout — no envelope like `{data: ...}`. Matches `gh` / AWS CLI conventions.
- [ ] Error output is `{error, code, retryable, retry_after_ms?, details?}` on stderr. `retryable` always present.
- [ ] `details` is redacted via `safeDetails()` — bundler URLs with API keys, signer metadata, and raw viem error objects never pass through.
- [ ] stdout is exclusively the API contract — no progress bars, warnings, or log lines leak there.
- [ ] `SKILL.md` includes Agent Skills spec frontmatter (`name: actions-cli`, `description: ...`, `compatibility`).

### Quality gates

- [ ] Unit tests for `serializeBigInt`, `writeError` (incl. redaction), `requireEnv` (incl. lazy-contract test), asset resolver, chain resolver (incl. round-trip). Target >= 90% line coverage on `src/output/` + `src/config/` + `src/resolvers/` + `src/utils/`.
- [ ] Per-handler unit tests covering: happy, SDK-throws, env-missing (wallet commands only), bigint serialization round-trip, partial-failure for `wallet balance`.
- [ ] Four spawn-based integration tests, one per exit-code path (0 / 1 / 3 / 4), running against the built `dist/index.js` via `execFile`.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all green at repo root.
- [ ] Changeset entry present at `.changeset/add-actions-cli-package.md` with frontmatter `'actions-cli': minor`.
- [ ] `SKILL.md` reviewed by the person who will wire the agent (Kevin).
- [ ] Manual end-to-end: spawn the binary from a throwaway script mimicking opie's subprocess pattern; verify JSON parse succeeds.

## Success Metrics

- **Time to run PR 2 (lend):** scaffolding's job is to make PR 2 mostly additive. **One known exception:** PR 2 is expected to touch `src/output/errors.ts` to extend the classifier (new viem/bundler error shapes surface with every namespace). If PR 2's diff touches anything **else** outside `src/commands/lend/`, `src/commands/wallet/lend/`, `src/services/` (new), `src/demo/`, and `SKILL.md`, that's a sign PR 1 got the split wrong.
- **Agent integration effort:** opie should be able to wire this in one evening. If the agent needs parsing or formatting glue beyond `spawn(binary, args)` + `JSON.parse(stdout)`, the output format was wrong.
- **Wallet address determinism:** 100 `actions wallet address` invocations in a row against the same RPC must all produce the same address and exit 0. (This is a determinism + RPC-reliability check, not a pure-derivation check — the address derivation is RPC-backed. Flakiness at this scale indicates either SDK or RPC issues.)

## Dependencies & Prerequisites

### Hard prerequisites (blocking)

1. **#356 available on the working branch.** Merged to `main` at `58fc354d` (2026-04-21). Current branch `kevin/actions-cli` was cut from `ff3378db` (pre-#356). **Action: rebase or fresh-branch `feat/cli-scaffolding` from latest `main` before opening PR 1.** Verified:
   - `WalletConfig.hostedWalletConfig` is `?:` optional on `origin/main`.
   - `WalletNamespace.toActionsWallet`'s adaptive `ToActionsWalletParam<never>` branch exists.
   - SDK directory restructure: post-rebase, lend/swap code lives at `packages/sdk/src/actions/lend/` and `packages/sdk/src/actions/swap/` (previously `packages/sdk/src/lend/` and `packages/sdk/src/swap/`). Update any source references touched during PR 1 implementation.

### Soft prerequisites (nice-to-have, not blocking)

- **#419 serializeBigInt extraction.** PR 1 ships a local copy with matching signature; if #419 lands first, PR 1 imports from the SDK instead.

### Downstream / blocking for subsequent PRs

- **PR 2 (#409) is blocked on an offchain spending-cap guard.** See Risks. Without a `ACTIONS_SPEND_CAP_*` env check enforced before UserOp construction, PR 2's `wallet lend open` handler grants full wallet-drain authority to any code path that reaches argv. The full #414 onchain guardrails (Call Policies, spending caps via ZeroDev Kernel) remain follow-ups; a minimum offchain cap in PR 2 is ~20 LOC and does not depend on ZeroDev.

## Risk Analysis & Mitigation

Risks are re-numbered from the pre-deepening plan; #2 and #7 merged, security rows added (#A–#D), calibrations applied.

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | Post-#356 `createActions(config)` without an explicit generic fails type inference when `hostedWalletConfig` is omitted | Low | Low (cosmetic for PR 1 surface) | Fall back to explicit `createActions<never>(config)`. PR 1 never calls `toActionsWallet`, so the generic doesn't reach any callsite. |
| 2 | CLI demo config drifts from the demo backend's; faucet funds a set the CLI doesn't reflect | Medium | Medium | Document in `packages/cli/README.md` that the CLI's demo is intentionally self-contained. Maintain a periodic audit-checklist ("diff `packages/cli/src/demo/` against `packages/demo/backend/src/config/`") until the shared-constants extraction lands. The existing SDK imports (`USDC_DEMO`, `OP_DEMO`, `ETH`) eliminate asset drift; market addresses and chain configs are the remaining vectors. |
| 3 | Shebang lost during TSC emit | Low | Medium | Shebang goes in `src/index.ts` as the first line. TSC preserves it when it's the very first token. Verified during Phase 1 via the `./dist/index.js --help` success criterion. |
| 4 | `getBalance()`'s nested `Promise.all` (asset × chain) fails fast — one flaky RPC fails all 9 reads | Low for demo testnets | Medium | Documented in `SKILL.md` balance semantics. Long-term fix is `Promise.allSettled` + per-chain error shape in the SDK. Out of scope for PR 1. Retry on `network` errors may succeed by virtue of fallback RPCs in viem's chain clients. |
| 5 | Chain shortname collisions (`op-sepolia` vs `optimism-sepolia`) cause agent confusion | Medium | Low | Single canonical map in `src/resolvers/chains.ts`. `actions chains` output includes the exact accepted shortname per chain. Round-trip property unit-tested. |
| 6 | `bigint` in an unredacted `details` path throws at write time | Low | Low | `writeError` uses `serializeBigInt` before stringify. Regression-tested via `writeError(new CliError('onchain', 'revert', { amount: 1n }))`. |
| 7 | `pnpm dev` (tsx) vs built binary produces different behavior (path resolution, ESM loader) | Low | Medium | Integration tests spawn the **built** binary via `execFile`. Dev mode via tsx is for local iteration only. CI runs the built binary. |
| 8 | `envalid` caches across calls — hidden when tested in a long-lived process | Very Low | Low | Not an issue for the agent (subprocess model). Documented as a comment on `requireEnv`. |
| 9 | First-time `getSmartWallet` path hits a bug in `DefaultSmartWalletProvider.getWalletAddress` we haven't exercised | Low | High | Phase 3 smoke test verifies the derived address matches what the demo backend computes for the same signer + nonce. If it doesn't, file an SDK bug before merging PR 1. |
| **A** | **Agent-compromise blast radius under PR 2/3 full-owner authority.** The in-process signer is the sole owner of the smart wallet. Prompt injection, a compromised opie dependency, or a malicious user crafting a Slack payload the LLM faithfully translates to CLI args → full wallet drain. LLMs are not an authorization boundary. | **Medium** (large LLM-driven attack surface) | **High** (funds loss on testnet; catastrophic on mainnet) | **Block PR 2 on an offchain spending cap** enforced in the CLI handler before UserOp construction: `ACTIONS_SPEND_CAP_USD` / `ACTIONS_SPEND_CAP_WEI` env vars, reject any `open`/`execute` whose notional exceeds it. Hard-fail if any configured chain is non-testnet until #414 (onchain Call Policies / Spending Cap Policy via ZeroDev) lands. |
| **B** | **PRIVATE_KEY process-lifecycle exposure.** Lives in subprocess env + process memory during invocation. | Low–Medium (depends on opie env hygiene) | High if leaked | opie must pass **minimal env**, not `{...process.env, PRIVATE_KEY}`; anyone with `/proc/<pid>/environ` read on the same UID can otherwise observe the key. No crash reporter (Sentry) wired into the CLI — memory snapshots would contain the hex-decoded key bytes captured inside viem's signing closures. `no-console` ESLint rule prevents accidental `console.log(signer)` leaks. README guides devs away from inline `PRIVATE_KEY=0x... actions ...` (shell history). Closure bytes themselves are not at risk — `JSON.stringify(function)` returns `undefined`. |
| **C** | **`writeError` leaks signer state and bundler credentials via `err.details`.** viem errors pack raw request payloads, bundler URLs (containing Pimlico/Alchemy API keys), and signer metadata into `.details` / `.metaMessages`. A naive stringify leaks operational state and credentials to stderr (which may be captured by CI logs, Sentry-style sinks, Slack transcripts). | Medium (PR 2/3 authors will naturally pass rich details) | Medium–High (credential leak) | `safeDetails()` helper redacts before serialization: allowlist scalar fields only, pattern-strip API-key URL segments, never pass raw viem errors. Unit tests assert redaction of `SECRET` substrings and `publicKey`/`address` from mock viem errors. Land redaction in PR 1 — retroactive redaction means auditing every PR 2/3 callsite. |
| **D** | **RPC trust model.** An attacker who controls an `*_RPC_URL` can return fake balance/quote/market data. | Low (operator-controlled RPCs) | Low for PR 1 (fake balances only confuse the agent); **High for PR 2/3** (agent authorizes mutations against false state). | PR 1 mitigation is documentation in `SKILL.md` (`*_RPC_URL` must point to operator-trusted endpoints). PR 2/3 follow-up: second-endpoint sanity check on quote/market reads before authorizing mutations. |

## Resource Requirements

- **Effort:** ~1–1.5 engineer-days for a developer already familiar with the SDK and commander. The `safeDetails` redaction + per-handler tests add maybe half a day over the original estimate; everything else scales roughly linearly with the extra success criteria.
- **Review:** one reviewer familiar with the SDK's `WalletNamespace` + `DefaultSmartWalletProvider` (to sanity-check the `getSmartWallet` bootstrap and the RPC-backed address derivation) and one familiar with the monorepo scripts (workspace, changeset, resolve-tspaths).
- **Infra:** no new CI config. Existing CircleCI `check` job runs `pnpm -r {typecheck,lint,test}`. The new package is picked up automatically.

## Future Considerations

- **PR 2 (lend, #409)** adds `src/commands/lend/` + `src/commands/wallet/lend/` + `src/resolvers/markets.ts` + lend section in `SKILL.md`. Reuses PR 1's contexts, output helpers, error taxonomy. **Blocked on the offchain spending-cap guard** (Risk A); must also add amount parsing via `BigInt()` at the CLI boundary (`--amount NaN` / `-1` / `1e999` → `CliError('validation')`).
- **PR 3 (swap, #410)** adds `src/commands/swap/` + `src/commands/wallet/swap/` + swap section in `SKILL.md`. Adds `--in/--out/--chain` parsing; reuses asset + chain resolvers. Same amount-parsing requirement as PR 2.
- **#411 interactive config onboarding:** `loadConfig()` grows a second code path that reads from a user file (e.g. `~/.actions/config.json`). Demo config becomes a fallback or is deleted.
- **#419 shared `serializeBigInt`:** CLI drops its local copy, imports from the SDK.
- **#418 CI smoke tests:** the integration-test scenarios are formalized in a CI job.
- **#412 1-of-2 signer onboarding — OPEN PRODUCT QUESTION.** The plan's brainstorm specifies 1-of-2 (agent signer + user signer, either can authorize). **This is strictly weaker than the current 1-of-1 model** — more keys that can independently drain the wallet. If the product intent is "user recovery / fallback authority," 1-of-2 is correct but should be explicitly reframed as recovery, not security. If the intent is "user must co-sign high-value actions," #412 must become k-of-n with k>1, which requires a kernel that supports it (ZeroDev). Resolve before #412 is implemented.
- **SDK follow-up: lazy provider construction.** `Actions` eagerly instantiates every configured lend/swap provider + `EnsNamespace` at construction time. For `actions assets` / `actions chains` this is wasted work. Not blocking; open when the eager cost starts mattering.
- **JSON help introspection.** Once the command surface passes ~15 subcommands (post-PR 3), add `actions describe [command]` or `actions --help --json` that emits the full tree — name, description, flags with types, required/optional, example invocations. Parsing commander's ANSI-formatted help text gets error-prone at scale; agents hallucinate flags and miss required args. Implementable in ~30 lines by walking `program.commands`.
- **`safeDetails` richer redaction.** PR 1's redaction is allowlist-based and intentionally coarse. PR 2/3 may want pattern-based redaction for specific error shapes (revert reasons with embedded addresses, etc.). Extend incrementally as error shapes are observed.

## Documentation Plan

- `packages/cli/README.md` — one-pager: what the package is, how to dev (`pnpm -C packages/cli dev assets`), pointers to `SKILL.md` and the brainstorm doc. Plus a short "dev env handling" note: prefer `direnv` / `.env` over inline shell env prefix (which lands in shell history).
- `packages/cli/SKILL.md` — the agent skill. Includes balance-semantics and RPC-trust sections (both agent-consumed). Updated by PR 2/3 with lend/swap sections.
- Changeset entry at `.changeset/add-actions-cli-package.md` — intentional-name style, frontmatter `'actions-cli': minor`.
- No CLAUDE.md updates needed — brainstorm + this plan + SKILL.md capture the conventions.

## Sources & References

### Origin

- **Brainstorm:** [`docs/brainstorms/2026-04-21-actions-cli-brainstorm.md`](../brainstorms/2026-04-21-actions-cli-brainstorm.md) — carried forward: 1:1 method-to-command mapping, baked demo config with `demo/` split (Decision 13), `getSmartWallet` bootstrap with lazy initCode (Decision 5/6), JSON-only output with five-code error taxonomy (Decision 9/10), PR-per-namespace cadence (Decision 12).

### GitHub issues

- Root: [#407 Actions CLI](https://github.com/ethereum-optimism/actions/issues/407)
- This plan implements: [#408 CLI: scaffolding, --help, smoke tests](https://github.com/ethereum-optimism/actions/issues/408)
- Follows this: [#409 CLI: lend namespace](https://github.com/ethereum-optimism/actions/issues/409), [#410 CLI: swap namespace](https://github.com/ethereum-optimism/actions/issues/410)
- Related follow-ups: [#411](https://github.com/ethereum-optimism/actions/issues/411), [#412](https://github.com/ethereum-optimism/actions/issues/412), [#414](https://github.com/ethereum-optimism/actions/issues/414), [#418](https://github.com/ethereum-optimism/actions/issues/418), [#419](https://github.com/ethereum-optimism/actions/issues/419)

### SDK references (post-#356 — paths valid after rebase onto `origin/main`)

- `packages/sdk/src/types/actions.ts` — `ActionsConfig`, `WalletConfig` (optional `hostedWalletConfig`), `NodeActionsConfig`, `SwapConfig` (`RequireAtLeastOne`).
- `packages/sdk/src/wallet/core/namespace/WalletNamespace.ts` — `getSmartWallet`, `toActionsWallet`, `ToActionsWalletParam<never>` branch.
- `packages/sdk/src/wallet/core/providers/WalletProvider.ts` — `getSmartWallet` wraps `smartWalletProvider.getWallet`.
- `packages/sdk/src/wallet/core/providers/smart/default/DefaultSmartWalletProvider.ts` — `getWalletAddress` does a live `publicClient.readContract` call (not a pure computation).
- `packages/sdk/src/wallet/core/wallets/smart/abstract/SmartWallet.ts` — `send`, `sendBatch`, `sendTokens`, `addSigner`, `removeSigner`.
- `packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts` — `getBalance` with nested `Promise.all`.
- `packages/sdk/src/services/tokenBalance.ts` — `fetchERC20Balance` / `fetchETHBalance`.
- `packages/sdk/src/services/ChainManager.ts` — RPC + bundler client construction.
- `packages/sdk/src/nodeActionsFactory.ts` — `createActions<T extends NodeProviderTypes>`.
- `packages/sdk/src/constants/assets.ts` — `USDC_DEMO`, `OP_DEMO`, `ETH`, `WETH` canonical exports.
- `packages/sdk/src/actions/lend/` and `packages/sdk/src/actions/swap/` — post-rebase locations (previously `packages/sdk/src/lend/` and `packages/sdk/src/swap/`).
- `packages/sdk/src/utils/test.ts` — `ANVIL_ACCOUNTS` fixtures for deterministic-address unit tests.

### Patterns mirrored from the demo backend

- Package scripts: `packages/demo/backend/package.json`.
- tsconfig shape: `packages/demo/backend/tsconfig.json`.
- envalid usage (deliberately diverged — CLI is lazy): `packages/demo/backend/src/config/env.ts`.
- `serializeBigInt`: `packages/demo/backend/src/utils/serializers.ts` (signature matched; #419 extracts).
- Demo config: `packages/demo/backend/src/config/{actions,chains,markets}.ts` (CLI does NOT copy `assets.ts` — imports from SDK).
- vitest shape (with overrides): `packages/demo/backend/vitest.config.ts`.
- commander usage: `packages/demo/backend/src/app.ts` (backend uses `App` subclass; CLI uses `Command` directly).
- Anti-singleton intentional divergence: `packages/demo/backend/src/config/actions.ts` (backend has `let actionsInstance` + `getActions()`; CLI does not).

### External references

- [Commander.js docs](https://github.com/tj/commander.js) — subcommand registration, `parseAsync`, `configureOutput`, `NO_COLOR` handling.
- [viem `privateKeyToAccount`](https://viem.sh/docs/accounts/local/privateKeyToAccount.html).
- [ERC-4337 initCode pattern](https://eips.ethereum.org/EIPS/eip-4337) — smart wallet deploy on first UserOp.

**Agent-consumable CLI design (2026 conventions):**

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
- [nodejs/node#13662 — EPIPE handling](https://github.com/nodejs/node/issues/13662) — rationale for the EPIPE guard.

## Deepening Record

- **2026-04-21** (auto, interactive mode) — confidence-check pass via `ce-plan` deepening workflow. Four agents dispatched (ce-architecture-strategist, ce-repo-research-analyst, ce-pattern-recognition-specialist, ce-security-sentinel). All 26 findings across the four agents accepted; synthesized into this plan.
  - Factual corrections: `wallet address` is RPC-bound, not pure; `swap: {}` was a type error (fixed by omitting `swap`).
  - Structural: `core/` renamed to flat `src/{config,context,output,resolvers,utils}/`; `src/demo/assets.ts` deleted in favor of SDK imports; `src/services/` directory added for PR 2/3 growth.
  - Security: PR 2 blocked on offchain spending cap; `writeError` redaction via `safeDetails()` added to PR 1; `no-console` ESLint rule; PRIVATE_KEY exposure surface documented; #412 surfaced as open product question.
  - Test rigor: per-handler unit test scenarios enumerated; `execFile`-based integration tests per exit-code path; lazy-envalid contract enforced via spy-based unit test.
  - Reference fidelity: SDK source paths updated for post-rebase restructure (`packages/sdk/src/actions/{lend,swap}/`); `EnsNamespace` noted as new post-#356.
