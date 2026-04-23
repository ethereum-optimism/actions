---
name: actions-cli
description: Invoke the Actions SDK from the shell - query assets/chains, derive an EOA address from a PRIVATE_KEY env var, read balances. Use when an agent needs to interact with the Actions SDK without embedding TypeScript.
compatibility: Requires Node.js >=18 and the PRIVATE_KEY env var for wallet-scoped commands.
---

# Actions CLI - Agent Skill

## Invocation

Spawn the `actions` binary as a subprocess. **Always pass `--json`** (as
the first flag) - the default output is human-readable and not intended
for parsing. With `--json`, stdout is a bare JSON document on success
and stderr is the error envelope on failure.

```sh
actions --json assets
actions --json wallet balance --chain base-sepolia
```

## Command tree

- `actions assets` - configured asset allowlist.
- `actions chains` - configured chain shortnames + IDs.
- `actions wallet address` - EOA address derived from `PRIVATE_KEY`.
- `actions wallet balance [--chain <name> | --chain-id <id>]` - balances
  per chain + asset; the chain flags are mutually exclusive.

## Wallet model

The CLI derives a viem `LocalAccount` from `PRIVATE_KEY` and wraps it in
an EOA-backed Actions wallet via
`actions.wallet.toActionsWallet(localAccount)`. No smart wallet, no
bundler, no ERC-4337 UserOps - the signer pays gas directly. For the
demo, fund the EOA with testnet ETH on Base Sepolia.

## Resolution rules

- **Assets** - pass the `metadata.symbol` value from the allowlist
  (e.g. `USDC_DEMO`, `OP_DEMO`, `ETH`). Case-insensitive. Run
  `actions --json assets` for the current list.
- **Chains** - pass a shortname (`base-sepolia`, `op-sepolia`,
  `unichain`) via `--chain`, or a numeric id via `--chain-id`
  (mutually exclusive). Run `actions --json chains` for the current
  list.

## Output

With `--json`:

- Success: bare JSON document on stdout, exit 0. No envelope (matches
  `gh` and AWS CLI conventions).
- Error: JSON `{error, code, retryable, retry_after_ms?, details?}` on
  stderr, non-zero exit. `retryable: true` means the caller may retry
  (typically network failures). `retry_after_ms` is present when a
  specific back-off is recommended. `details` is redacted - bundler
  URLs with API keys, signer metadata, and raw viem request bodies are
  scrubbed.

Without `--json` (default):

- Success: plain text on stdout intended for human reading. Not stable
  across versions.
- Error: `Error (<code>): <message>` on stderr, exit code per the table
  below.

## Balance semantics

`actions wallet balance` is all-or-nothing: internally the SDK uses
nested `Promise.all` over (asset x chain), so any single failing RPC
rejects the whole call with a `network` error. Retries may succeed on a
different call - do not assume per-chain isolation.

## RPC trust

`*_RPC_URL` env vars must point to operator-trusted endpoints. A
malicious RPC can return fake balance data, which will confuse the
caller.

## Exit codes

| Code | Meaning                                | Retryable |
| ---- | -------------------------------------- | --------- |
| 0    | Success                                | -         |
| 1    | Unknown error                          | false     |
| 2    | Validation (bad input)                 | false     |
| 3    | Config error (missing env, malformed)  | false     |
| 4    | Network error (RPC, timeout)           | true      |
| 5    | Onchain error (revert, UserOp failure) | false (†) |

(†) Specific onchain sub-classes (nonce conflicts, gas underpricing)
may set `retryable: true` via the `retryableOverride` mechanism. Treat
`retryable` as the source of truth; the table row shows the default.

## Unknown commands

Typos (`actions nonsense`) exit 1 with commander's default plain-text
error on stderr - **not** the JSON error envelope. This distinction is
deliberate: the JSON envelope is only emitted for errors thrown from
within a registered handler.
