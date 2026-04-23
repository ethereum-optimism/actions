# actions-cli

Agent-first command-line interface for the Actions SDK. Emits JSON on
stdout, JSON error envelopes on stderr, distinct exit codes per failure
category. Consumed as a subprocess by agent runtimes (e.g. the `opie`
Slack bot).

## Audience

`actions-cli` is designed for programmatic callers (LLM agents,
automations, CI jobs) that need to invoke SDK operations without
embedding TypeScript. For the full agent contract see
[`SKILL.md`](./SKILL.md).

## Environment

| Var                         | Required     | Description                                              |
| --------------------------- | ------------ | -------------------------------------------------------- |
| `PRIVATE_KEY`               | wallet cmds  | 0x-prefixed 32-byte hex. Signer for all wallet commands. |
| `BASE_SEPOLIA_RPC_URL`      | optional     | RPC override for Base Sepolia (falls back to viem).      |
| `OP_SEPOLIA_RPC_URL`        | optional     | RPC override for Optimism Sepolia.                       |
| `UNICHAIN_RPC_URL`          | optional     | RPC override for Unichain.                               |

`actions --help` and the read-only commands (`assets`, `chains`) work
with no env set - `PRIVATE_KEY` is read lazily inside wallet-scoped
commands.

### Env hygiene

Prefer [`direnv`](https://direnv.net/) or a `.env` file over prefixing
commands with `PRIVATE_KEY=0x... actions ...` - the latter lands in
`~/.bash_history`.

## Local development

```sh
pnpm install
pnpm -C packages/cli build
pnpm -C packages/cli dev assets   # tsx-based, no build step
```

Smoke-test the built binary:

```sh
./packages/cli/dist/index.js --help
./packages/cli/dist/index.js chains
```

## Demo configuration

PR 1 ships a baked demo `NodeActionsConfig` under `src/demo/`. The
allowlisted assets and markets mirror
`packages/demo/backend/src/config/` so the CLI and backend operate
against the same demo set. Chains: Base Sepolia, Optimism Sepolia,
Unichain. Bundlers are intentionally omitted - the EOA signer pays gas
directly.

The interactive agent-onboarding flow (#411) will swap `loadConfig()`'s
source for per-user state without touching callers. Keep every `Actions`
construction site behind `loadConfig()` so the follow-up remains a
drop-in replacement.

## References

- Agent skill: [`SKILL.md`](./SKILL.md)
- Brainstorm (on `kevin/actions-cli`):
  [`docs/brainstorms/2026-04-21-actions-cli-brainstorm.md`](https://github.com/ethereum-optimism/actions/blob/kevin/actions-cli/docs/brainstorms/2026-04-21-actions-cli-brainstorm.md)
- Plan (on `kevin/actions-cli`):
  [`docs/plans/2026-04-21-feat-actions-cli-scaffolding-plan.md`](https://github.com/ethereum-optimism/actions/blob/kevin/actions-cli/docs/plans/2026-04-21-feat-actions-cli-scaffolding-plan.md)
- Parent issue: [#407](https://github.com/ethereum-optimism/actions/issues/407)
- This PR: [#408](https://github.com/ethereum-optimism/actions/issues/408)
