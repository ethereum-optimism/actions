# Make the CLI error redactor value-aware (drop hex/secrets, depth/cycle caps)

| Field | Value |
| --- | --- |
| **Severity** | medium |
| **Complexity** | 3 / 5 |
| **Domain** | cli |
| **Surface** | `packages/cli/src/output/errors.ts` (`safeDetails`/`redactRecord`/`redactValue`/`SENSITIVE_KEYS`/`SCALAR_ALLOWLIST`); `packages/cli/src/context/walletContext.ts` (`parseSigner` `reason`); `packages/cli/src/commands/actions/chains.ts` + `packages/cli/src/output/printOutput.ts` (`rpcUrls`) |
| **Resolves findings** | F338, F328, F339, F341, F331 |
| **Candidate existing issue** | none |
| **Blocked by** | (none) |

## Problem

The CLI error redactor is the last gate before a thrown value lands in stderr and the `--json` error envelope that an agent or CI run captures to a log, file, or chat. That envelope is meant to be safe to share, so anything that survives redaction is effectively published. The redactor decides what to drop purely by FIELD NAME (`SENSITIVE_KEYS`), and its string branch is a global passthrough that only strips http(s) URLs. As a result the redactor does not defend the one thing it exists to defend: a secret-shaped *value* (a raw signed transaction, calldata, a private-key fragment, a seed phrase, a bearer token) carried under any key the denylist does not happen to enumerate flows through verbatim.

Concretely, three fund-safety / secret-exposure gaps:

- **A secret-shaped string value escapes redaction whenever its key is not on the name denylist.** `toCliError` stashes the raw caught error as `details: { cause: err }` on the onchain and network-fallback paths, and `wallet/balance.ts` does the same. When that error is not a viem `BaseError`, the redactor recurses through every enumerable property; any string-valued property whose key is not in `SENSITIVE_KEYS` (which omits `transaction`/`data`/`value`/`to`/`mnemonic`/`seed`/`params`/`body`/`args`) is kept after only the URL strip. A wrapped or non-viem signing-path error carrying a raw signed tx or seed phrase therefore lands in the published envelope.

- **A malformed `PRIVATE_KEY` value can be echoed back.** `parseSigner` attaches viem's `cause.message` as `details.reason`; for a malformed-but-partially-valid key, viem may echo the offending input bytes in that message, and `reason` survives the redactor (string branch, URL-strip only). This is the only secret the CLI touches that crosses into formatted output.

- **Read-path `actions chains` prints `rpcUrls` in cleartext.** The error pipeline strips every http(s) URL precisely because RPC/bundler URLs embed API keys, but the happy-path `chains` command prints the full `BASE_SEPOLIA_RPC_URL`/`OP_SEPOLIA_RPC_URL` (Alchemy/Infura key in the path) to stdout and JSON. The read-only command output is the single most likely thing an agent pipes to a log — directly inconsistent with the error-path policy.

A fourth, availability-flavored gap: the redactor recurses with no depth cap and no cycle guard, so a circular thrown value crashes the last-resort reporter and masks the real failure (details below).

## Findings

- **F338** (medium, info) — `packages/cli/src/output/errors.ts:181-191,219-252`: `redactRecord` drops by field name only; `SENSITIVE_KEYS` omits `transaction`/`rawTransaction`/`serializedTransaction`/`data`/`value`/`to`/`params`/`body`/`args`/`mnemonic`/`seed`, so a thrown non-`BaseError` carrying any of those as a string (via `details:{cause:err}` from `errors.ts:130`/`:133` or `wallet/balance.ts:27`) survives verbatim. The existing test at `packages/cli/src/output/__tests__/errors.test.ts:131` proves it by preserving `unknownScalar: 'drop-me'` (and the test comment claiming it is "stripped" is wrong). General form of F328.

- **F328** (medium, malicious-sign) — `packages/cli/src/context/walletContext.ts:22` throws `CliError('config', ..., { reason: cause.message })` on a malformed `PRIVATE_KEY`; viem may echo the offending value, and `reason` passes the redactor (`errors.ts:234-237`, string branch, URL-strip only). The only secret the CLI handles crossing into captured output. Defense-in-depth against current viem (which describes shape, not bytes) but the redactor structurally does not defend the value across viem/third-party versions.

- **F339** (low, correctness) — `packages/cli/src/output/errors.ts:197-252`: `redactValue`/`redactRecord` recurse with no depth cap and no `WeakSet` cycle guard. A non-`BaseError` thrown value with a circular reference (an error back-referencing an attached request/response/transaction) recurses to `RangeError: Maximum call stack size exceeded`, thrown from inside `safeDetails` during `writeError` (`errors.ts:309`) — which is the last-resort sink wired to `uncaughtException`/`unhandledRejection` (`packages/cli/src/index.ts:20-24,60`). The crash masks the original failure and the process exits on an unhandled stack overflow instead of emitting the structured envelope.

- **F341** (low, info) — `packages/cli/src/output/errors.ts:234-237`: the `typeof raw === 'string'` branch runs BEFORE the `SCALAR_ALLOWLIST` gate (`:238-241`), so the allowlist only ever gates non-string scalars and is a no-op for strings — every non-sensitive string key passes through with only the URL strip. This is the structural root of F328 (`reason` leaks because the string branch is a global passthrough, not because it is allowlisted). The docstring at `errors.ts:259-261` ("unknown scalars are preserved only when their key is in `SCALAR_ALLOWLIST`") is inaccurate for strings.

- **F331** (low, info) — `packages/cli/src/commands/actions/chains.ts:13-17` copies `chain.rpcUrls` into the row and `packages/cli/src/output/printOutput.ts:138` prints `rpc=${row.rpcUrls.join(',')}`; the JSON path emits `rpcUrls` unredacted. The same URLs the error redactor strips at `errors.ts:79-84` (`redactUrls`, "frequently embed API keys") are printed in cleartext on the read-only happy path.

## Root cause

The redactor is a name-keyed denylist with a value-blind string branch. Two structural choices combine into the leak:

1. **Drop-by-key-name only.** `SENSITIVE_KEYS` enumerates a fixed set of field names. Anything secret-shaped under a key not on that list is invisible to the redactor. The list cannot be exhaustive — a wrapped or future non-viem signing-path error can attach signed bytes under any key.

2. **The string branch is a global passthrough that precedes the allowlist.** Because `typeof raw === 'string'` is handled before the `SCALAR_ALLOWLIST` check, the allowlist never constrains strings; every non-sensitive string is emitted after only `redactUrls`, which strips http(s) but never high-entropy hex, BIP39 phrases, or bearer tokens. So the redactor has no value-shape defense at all.

F331 is the same policy applied inconsistently across surfaces: the error path treats RPC URLs as secret-bearing, the read path does not. F339 is the orthogonal robustness gap — unbounded recursion in the same code that runs inside the last-resort error reporter.

## Recommended approach

Review-only, no architectural refactor. This is a CLI-layer hardening of one module (`output/errors.ts`) plus two one-line call-site changes; it changes only how failures and read output are *surfaced*, never which transactions sign. Keep the existing name-denylist behavior and layer value-shape defense on top.

1. **Add value-shape redaction (F338, F328, F341).** In `redactUrls`'s string path, also mask string values matching obvious secret shapes regardless of key: a high-entropy / long hex run (`/0x[0-9a-fA-F]{40,}/` and bare `[0-9a-fA-F]{64,}`), a BIP39-looking mnemonic phrase, and bearer-token shapes. Move this so it applies in the `redactRecord` string branch *before* a non-sensitive string is emitted, closing the F341 ordering gap. Replace the matched span with a `[redacted]` marker rather than dropping the field, so non-secret context survives.

2. **Extend the name denylist as belt-and-suspenders (F338).** Add `transaction`, `rawTransaction`, `serializedTransaction`, `data`, `mnemonic`, `seed`, `body`, `params`, `args` to `SENSITIVE_KEYS`. (Value-shape redaction is the primary defense; the name additions catch structured/non-string payloads under these keys.)

3. **Stop echoing the parse cause for the key failure (F328).** In `parseSigner`, the static message `Malformed PRIVATE_KEY: expected a 0x-prefixed 32-byte hex string` is self-sufficient; drop the `{ reason: cause.message }` detail (or replace it with a non-echoing classifier such as `cause.name`). The value-shape redactor is the structural backstop; not propagating the cause is the cheap direct fix.

4. **Add a depth cap and `WeakSet` cycle guard (F339).** Thread a depth counter and a visited-`WeakSet` through `redactValue`/`redactRecord`; return a `[truncated]` / `[circular]` marker when exceeded so the last-resort reporter at `index.ts` always emits a structured envelope instead of crashing on a stack overflow.

5. **Redact `rpcUrls` in `chains` output (F331).** Either run `rpcUrls` through `redactUrls` in `runChains` / `formatChains`, or emit a `rpcOverride: boolean` plus the host-only origin (no path/query) instead of the full URL. Do not print the full RPC URL with embedded key on the happy path.

6. **Correct the docstring (F341).** Fix `errors.ts:259-261` to state that strings are URL-stripped and value-shape-redacted (and that `SCALAR_ALLOWLIST` gates non-string scalars only), and fix the misleading "stripped" comment in `errors.test.ts:131`.

Scope guard: this is missing-obvious-validation plus a fail-closed output-hygiene gap the CLI already has the information to close (it constructs the envelope and knows which fields are externally sourced). It is not intent-guessing, not refuse-to-sign, and not RPC-trust hardening. No SDK change is required; the SDK-side error-string sanitization is tracked separately under `sdk-error-string-sanitization` and is not a dependency here.

## Affected files

- `packages/cli/src/output/errors.ts:79-84` — `redactUrls` / `URL_PATTERN` (extend with value-shape masking).
- `packages/cli/src/output/errors.ts:181-191` — `SENSITIVE_KEYS` (add the missing keys).
- `packages/cli/src/output/errors.ts:197-207` — `redactValue` (depth/cycle guard threading).
- `packages/cli/src/output/errors.ts:219-252` — `redactRecord` (string branch ordering, value-shape redaction, depth/cycle guard).
- `packages/cli/src/output/errors.ts:259-261` — docstring correction.
- `packages/cli/src/output/errors.ts:309` — `safeDetails` call inside `writeError` (the crash site for F339).
- `packages/cli/src/context/walletContext.ts:15-25` — `parseSigner` (drop / declassify `reason`).
- `packages/cli/src/commands/actions/chains.ts:13-18` — `runChains` (`rpcUrls` source).
- `packages/cli/src/output/printOutput.ts:132-141` — `formatChains` (`rpc=` print).
- `packages/cli/src/index.ts:20-24,60` — process-level last-resort handlers that must keep emitting a structured envelope (verify, not edit).
- `packages/cli/src/output/__tests__/errors.test.ts:125-135` — fix the inverted `unknownScalar` assertion/comment; add new cases.

## Acceptance criteria / tests

- A thrown non-`BaseError` carrying `{ transaction: '0x02f8...<raw-signed-tx>' }` (or `data`/`mnemonic`/`seed`) under `details.cause` produces a `--json` envelope where the secret value is `[redacted]` — asserted regardless of which key it sits under.
- A string value matching the long-hex / BIP39 / bearer shapes is masked even when its key is not in `SENSITIVE_KEYS`; a benign string (e.g. a market name) still passes through with only URL stripping.
- The reversed test at `errors.test.ts:131` is corrected: a secret-shaped `unknownScalar` is now redacted, and the comment matches behavior.
- `parseSigner` on a malformed `PRIVATE_KEY` produces an envelope whose `details` does not contain viem's echoed input value (no `reason` cause string, or a non-echoing classifier only).
- A circular thrown value (`const e:any = new Error('x'); e.self = e`) routed through `toCliError` → `writeError` emits a structured envelope containing a `[circular]`/`[truncated]` marker and exits with the mapped code — it does NOT throw `RangeError` or crash the last-resort handler. A deeply nested (non-cyclic) value is capped at the depth limit with `[truncated]`.
- `actions chains --json` with an `*_RPC_URL` containing an embedded API key does not print the key: the env emits a redacted URL or `rpcOverride` + host-only origin. A matching assertion covers the text (`formatChains`) path.
- Existing redactor tests for viem `BaseError` reduction (`{ errorName, shortMessage }`), `SCALAR_ALLOWLIST` numeric/boolean/bigint gating, and URL stripping still pass.

## Notes

- F341 is the structural root and F328 the concrete instance of the same string-passthrough defect; fixing the string-branch ordering plus value-shape redaction resolves both, and the `parseSigner` `reason` change is the targeted belt-and-suspenders for the one known live echo path.
- Per `refines:F332` in review-pass-17, address-typed `to`/`recipient`/`spender` are STRING values and are already preserved by the redactor today (they pass the string branch), so the value-shape change must mask secret-shaped strings without dropping these non-secret destination fields — they aid post-mortem diagnosis and should survive. Keep `from`/`account`/`signer`/`address` dropped via `SENSITIVE_KEYS`.
- F340 (PRIVATE_KEY cached in module memory for the subprocess lifetime) was filed info-only and is out of scope here; it is the same raw string this redactor must never echo, but requires no code change under the subprocess model.
- The value-shape regexes are heuristics, not a guarantee; they are defense-in-depth layered on top of the name denylist and the "don't echo the cause" fix, not a replacement for either.
