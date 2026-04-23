# actions-cli

Command-line interface for the Actions SDK. Emits JSON on stdout, JSON
error envelopes on stderr, distinct exit codes per failure category.
Designed to be consumed as a subprocess: spawn, read stdout, parse.

## Audience

`actions-cli` is for programmatic callers (automations, CI jobs, shell
scripts) that need to invoke SDK operations without embedding TypeScript.
For the skill contract see [`SKILL.md`](./SKILL.md).

## Environment

| Var                         | Required     | Description                                              |
| --------------------------- | ------------ | -------------------------------------------------------- |
| `PRIVATE_KEY`               | wallet cmds  | 0x-prefixed 32-byte hex. Signer for all wallet commands. |
| `BASE_SEPOLIA_RPC_URL`      | optional     | RPC override for Base Sepolia (falls back to viem).      |
| `OP_SEPOLIA_RPC_URL`        | optional     | RPC override for Optimism Sepolia.                       |
| `UNICHAIN_RPC_URL`          | optional     | RPC override for Unichain.                               |

`actions --help` and the read-only commands (`assets`, `chains`) work
with no env set. `PRIVATE_KEY` is read lazily inside wallet-scoped
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

The package ships a baked demo `NodeActionsConfig` under `src/demo/`.
The allowlisted assets and markets mirror
`packages/demo/backend/src/config/` so the CLI and backend operate
against the same demo set. Chains: Base Sepolia, Optimism Sepolia,
Unichain. Bundlers are omitted - the EOA signer pays gas directly.
