# Actions CLI — Brainstorm

**Date:** 2026-04-21
**Author:** kevin
**Status:** Brainstorm

## What We're Building

A minimal, agent-first command-line interface for the Actions SDK, shipped as a new monorepo package (`packages/cli/`). The CLI maps 1:1 onto SDK method signatures — every `actions.<ns>.<method>(args)` call has a corresponding `actions <ns> <method> <args>` shell command. It is consumed by an AI agent (an extension of the `opie` Hono + Slack bot) that spawns CLI subprocesses and parses stdout as JSON.

**In scope for the overall initiative (may span several PRs):**

- `actions assets`, `actions chains` — config introspection.
- Read-only root namespaces: `actions lend …`, `actions swap …`.
- Wallet-scoped namespaces: `actions wallet lend …`, `actions wallet swap …`, `actions wallet balance`, `actions wallet address`.
- Stateless smart-wallet bootstrap from a `PRIVATE_KEY` env var on every invocation (no state files, no interactive prompts).
- A `skill.md` that teaches the Slack agent how to translate user intent → CLI commands.

**Explicitly deferred (follow-up issues):**

- `wallet.send`, `wallet.sendBatch`, `wallet.transfer` (not needed for demo).
- `actions wallet create` / 1-of-2 signer onboarding (ask user for their address, re-deploy as 2-signer smart wallet).
- Interactive agent-driven config onboarding (agent asks "which assets/markets/chains?" and writes a local `actions.config.ts`).
- Onchain guardrails (spending caps, session keys, Call Policies).
- Wallet persistence (e.g. multi-wallet nonce indexing).
- Non-default smart-wallet providers (ZeroDev, once #403 lands).
- Human-readable TTY output (everything stays JSON; all text is read by the agent).

## Why This Approach

### Map SDK method signatures 1:1 to shell commands

The user explicitly chose the direct-mapping approach over task-level NL commands or a single `actions exec` JSON dispatch. Reasons:

- **Mental model:** Anyone who knows the SDK knows the CLI. One layer of translation instead of two.
- **Agent-friendly:** `--help` on any subcommand describes the underlying SDK method. The agent doesn't need to reason about intent-to-method translation — the `skill.md` is just a lookup table.
- **Thin glue:** Each command is a handler that parses flags, looks up assets/markets/chains from config, and invokes the exact SDK method. No business logic.

**Naming heuristic (locked in):**

| SDK method                         | CLI command                                     |
| ---------------------------------- | ----------------------------------------------- |
| `actions.getSupportedAssets()`     | `actions assets`                                |
| `actions.lend.getMarkets()`        | `actions lend markets`                          |
| `actions.lend.getMarket(id)`       | `actions lend market --market <name>`           |
| `actions.swap.getQuote(params)`    | `actions swap quote --in USDC --out ETH ...`    |
| `actions.swap.getQuotes(params)`   | `actions swap quotes ...`                       |
| `wallet.getBalance()`              | `actions wallet balance`                        |
| `wallet.lend.openPosition(p)`      | `actions wallet lend open --market <n> --amount N` |
| `wallet.lend.closePosition(p)`     | `actions wallet lend close --market <n> --amount N` |
| `wallet.lend.getPosition(p)`       | `actions wallet lend position --market <name>`  |
| `wallet.swap.execute(p)`           | `actions wallet swap execute --in USDC --out ETH ...` |

Rule: `getX()` → bare noun `x`. Verb methods keep the verb, with `Position` / `Wallet` suffixes dropped where they're redundant (`openPosition` → `open` within the `lend` namespace).

### Bake a demo config into the CLI package

User chose baked config over loading `./actions.config.ts` from cwd. The CLI ships `packages/cli/src/demo/config.ts` (see Decision 13 for why it lives under `demo/`), mirroring the shape of `packages/demo/backend/src/config/actions.ts`. Secrets come from env: `PRIVATE_KEY`, plus whatever RPC urls the chains need.

**Trade-off accepted:** the CLI isn't reusable as a general tool — it's a demo CLI with a fixed config. This is fine for the hackathon. The "interactive onboarding" follow-up lets the agent generate a per-user config file later.

`WalletConfig.hostedWalletConfig` is omitted. PR #356 has landed, making `hostedWalletConfig` optional, so the CLI goes straight from `PRIVATE_KEY` → `privateKeyToAccount` → signer. The signer is passed into `actions.wallet.getSmartWallet(...)` (see Decision 6) — we do **not** use `toActionsWallet(LocalAccount)`; the agent operates against the smart wallet, not the raw EOA.

### Isolate demo-specific code from core CLI

The CLI will eventually have a non-demo mode where the agent writes a per-user config locally (see interactive-onboarding follow-up). To make that swap painless, everything demo-specific lives under `packages/cli/src/demo/` — the baked `ActionsConfig`, any demo-only asset/market/chain constants, hackathon-only defaults. Core CLI code under `packages/cli/src/core/` (command handlers, config loader, output helpers, wallet bootstrap, resolvers) is config-agnostic and consumes a resolved `NodeActionsConfig` via a thin `loadConfig()` abstraction.

In PR 1, `loadConfig()` just returns the demo config from `src/demo/`. When interactive onboarding lands, `loadConfig()` gains a second code path that reads from a user-owned file — no changes required to command handlers, resolvers, or anything else. The demo folder is the only thing that gets omitted or replaced.

This rules out scattering demo values across the codebase — no inline demo market names in command files, no hardcoded asset allowlists in resolvers, no `if (demo)` branches. If it's demo-specific, it goes in `src/demo/`.

### Resolve lend markets by name (from config allowlist)

User chose name-based addressing over compound `address:chainId`. CLI resolves `--market GauntletUSDCDemo` against `config.lend.<provider>.marketAllowlist[].name`.

- Names already exist in `LendMarketConfig` (no new registry needed).
- Allowlist enforcement is structural — you literally cannot reference a market the config doesn't permit.
- Agent output is short and memorable.

Swap markets are addressed by `--in <symbol> --out <symbol> --chain <shortname>` (pair-based, matching `WalletSwapParams`). `SwapMarketId.poolId` is only surfaced in listings, not as an input.

Asset symbols resolve against `config.assets.allow[].metadata.symbol`. Chain shortnames (`base`, `optimism`, `unichain`) resolve against viem's chain exports filtered by `config.chains[].chainId`.

### Stateless smart-wallet bootstrap via `getSmartWallet`

User chose lazy-deploy over explicit init:

```ts
const signer = privateKeyToAccount(env.PRIVATE_KEY)
const wallet = await actions.wallet.getSmartWallet({
  signer,
  deploymentSigners: [signer.address],
  nonce: 0n,
})
```

- Every command runs this on startup. Deterministic — no network calls for address derivation.
- Read operations (`balance`, `position`, etc.) complete without touching the chain for deploy.
- First mutation on a given chain includes `initCode` in the UserOp; the wallet deploys atomically with the action. Standard ERC-4337 / Coinbase Smart Wallet pattern.
- No state files, no `actions wallet init` step, no idempotency concerns.

### JSON-only output; all text is agent-consumed

User confirmed: the agent is the only consumer. No pretty/TTY rendering anywhere.

- stdout = one JSON document per command, bigints serialized as strings via the existing `serializeBigInt` helper from the demo backend (port into the CLI package or factor into a shared `@eth-optimism/actions-sdk/utils` module).
- stderr = JSON error document (`{ error: string, code: string, details?: … }`) on failure.
- Exit codes: `0` success, non-zero on error (distinct codes per category: validation, config, network, on-chain revert, unknown).
- `--help` output stays in commander's default format. It's read by the agent; keep it accurate and concrete but don't waste effort on prettiness.

### Ship as a sequence of small PRs, one namespace per PR

User explicitly asked for smallish PRs. Proposed split:

- **PR 1 — CLI scaffolding + `--help`.** Package init, commander tree, config-loading, signer bootstrap from `PRIVATE_KEY`, JSON output + error helpers, skill.md skeleton. Ships `actions assets`, `actions chains`, `actions wallet address`, `actions wallet balance` as smoke tests (prove the signer → smart-wallet → getBalance pipeline end-to-end without touching lend/swap).
- **PR 2 — Lend namespace.** `actions lend markets/market`; `actions wallet lend markets/market/position/open/close`. skill.md gets a lend section.
- **PR 3 — Swap namespace.** `actions swap markets/market/quote/quotes`; `actions wallet swap markets/market/quote/quotes/execute`. skill.md gets a swap section.
- **PR 4 (optional) — polish.** Any deferred error-code cleanup, skill.md iteration after live use, fix issues surfaced during hackathon.

Each subsequent PR is independent — if swap lands before lend, no blocker.

## Key Decisions

1. **Package location & name:** directory `packages/cli/`, npm package `actions-cli`, bin name `actions`.
2. **CLI framework:** `commander` (already used by the demo backend and SDK peer deps; familiar, minimal).
3. **Command shape:** 1:1 mapping to SDK method signatures. `getX` → bare noun; verb methods keep verb (often shortened within namespace).
4. **Config source:** baked demo config at `packages/cli/src/demo/config.ts` (isolated per Decision 13). Secrets via env (`PRIVATE_KEY`, RPC urls).
5. **Hosted wallet config:** omitted (enabled by #356, which has landed). Agent uses `privateKeyToAccount` directly as the smart wallet signer. `toActionsWallet(LocalAccount)` is not used — the CLI always operates against the smart wallet via `getSmartWallet`.
6. **Smart wallet bootstrap:** `getSmartWallet({ signer, deploymentSigners: [signer.address], nonce: 0n })` every command; deploy lazily via initCode on first mutation per chain.
7. **Lend market addressing:** `--market <name>` resolved against `config.lend.<provider>.marketAllowlist[].name`.
8. **Swap market addressing:** pair-based — `--in <symbol> --out <symbol> --chain <shortname>`. Asset symbols resolved against `config.assets.allow`; chain shortnames against `viem/chains`.
9. **Output format:** JSON-only on stdout; JSON errors on stderr; distinct exit codes per error category. bigints stringified via `serializeBigInt`.
10. **`--help` / error text:** accurate and helpful, but formatting-neutral. The agent reads all of it.
11. **skill.md location:** `packages/cli/skill.md` (ships with the package so it's versioned alongside the command surface). Skeleton in PR 1, filled per namespace in PRs 2/3.
12. **PR cadence:** one namespace per PR, starting with scaffolding (PR 1).
13. **Demo isolation:** all demo-specific values (baked `ActionsConfig`, demo asset/market constants, any hackathon-only defaults) live under `packages/cli/src/demo/`. Core CLI code lives under `packages/cli/src/core/` and is config-agnostic — it consumes a resolved `NodeActionsConfig` via a `loadConfig()` abstraction. The non-demo mode (interactive onboarding follow-up) swaps `loadConfig()`'s source without touching core or command handlers.

## Follow-up Issues (to create)

- [ ] Interactive agent-driven config onboarding: agent asks user "which assets/markets/chains?" and writes a local config file; `loadConfig()` gains a second code path that reads the user's file, leaving `src/demo/` as a fallback (or deleting it once non-demo is the only mode).
- [ ] 1-of-2 signer onboarding: `actions wallet create --cosigner 0xuser` invokes `createSmartWallet({ signer, signers: [signer.address, userAddress], nonce: … })`; follow with `add-signer` / `remove-signer` commands.
- [ ] `wallet.send`, `wallet.sendBatch`, `wallet.transfer` CLI commands (for when the demo needs raw transaction dispatch).
- [ ] Onchain guardrails surface (spending caps, Call Policies — blocked on ZeroDev / #403).
- [ ] Session-key flow (agent runs as delegated session key, not as raw EOA).
- [ ] Multi-wallet / nonce-indexed smart wallets (user has more than one wallet per private key).
- [ ] Human-readable `--pretty` rendering (only if a non-agent consumer materializes).
- [ ] CI smoke tests for the CLI (spawn the binary in a test, assert JSON shape).
- [ ] Port `serializeBigInt` from `packages/demo/backend/src/utils/serializers.ts` into a shared SDK util so both backend and CLI import it from one place.

## Resolved Questions

- **MVP scope:** lend + swap (read + wallet-scoped writes). `wallet.send` deferred. See Decision 6/7/8.
- **Config source:** baked demo config, secrets via env. See Decision 4.
- **Lend market addressing:** names from config allowlist. See Decision 7.
- **Smart wallet bootstrap:** `getSmartWallet` + lazy-deploy via initCode. See Decision 6.
- **Output format:** JSON-only; all text is agent-read; `--help` stays commander-default. See Decision 9/10.
- **PR split:** one namespace per PR, starting with scaffolding. See Decision 12.

## Open Questions

None — all decisions resolved during brainstorm.
