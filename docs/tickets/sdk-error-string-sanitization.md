# Stop interpolating caller amount/asset and unredacted bundler errors into thrown SDK strings

> **AUGMENT existing issue #474 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | low |
| **Complexity** | 2 / 5 |
| **Domain** | core |
| **Surface** | Aave `_openPosition`/`_closePosition`/`_getPosition` catch-alls (amount + `asset.metadata.symbol` interpolation); `DefaultSmartWallet.send`/`sendBatch`/`deploy` catch blocks (unredacted bundler/paymaster `error.message`) |
| **Resolves findings** | F011 |
| **Candidate existing issue** | #474 |
| **Blocked by** | named-error-taxonomy-signing-path |

## Problem

Two catch-all sites on the SDK rebuild thrown `Error` strings by concatenating values the SDK does not control, and surface them verbatim to the integrator (who routinely forwards them to a logger or a UI).

- **Caller-controlled free text as a log-injection / output-spoofing sink.** The Aave lend provider's `_openPosition` catch rethrows `Failed to open position with ${params.amountWei} of ${params.asset.metadata.symbol}`, and `_getPosition` rethrows `Failed to get market balance for ${params.walletAddress} in market ${params.marketId.address}`. `asset.metadata.symbol` is fully caller/integrator-controlled free text on the public boundary. A crafted symbol carrying newlines or ANSI/markup (e.g. `USDC\n[ALERT] forged line`) reaches the thrown message and, if logged line-oriented or rendered without encoding, forges a second log entry or spoofs UI output. No key material leaks (good), but the symbol passthrough is unsanitized.

- **Unredacted external error string that may echo signed bytes.** `DefaultSmartWallet.send`/`sendBatch`/`deploy` each build `Failed to send transaction: ${error.message}` (and the deploy equivalent), passing through whatever string the bundler RPC, paymaster, or viem returns. This is the one place on the smart-wallet surface where an externally-sourced string is concatenated into a thrown error that propagates to integrators and their logs. Bundler/viem error strings routinely embed the full UserOperation `callData`/`initCode` hex — which, after `appendAttributionSuffix`, are the bytes that were signed — so surfacing the raw message verbatim is an information-exposure footgun in addition to collapsing paymaster/nonce/signature/revert failures into one opaque class.

Fund-safety framing: this is not a direct fund-loss bug. It is a fail-closed-on-output-hygiene gap. The SDK already constructs these messages itself, so it already knows which fields are untrusted free text and which are externally-sourced; it should not relay them unredacted to a sink that integrators treat as trusted.

## Findings

- **F011** (low, correctness/info) — `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts:79-83` interpolates caller-controlled `params.amountWei` and `params.asset.metadata.symbol` into the thrown `Failed to open position with ...` string; `:205-209` interpolates `params.walletAddress` and `params.marketId.address` into the `Failed to get market balance ...` string. `DefaultSmartWallet.ts:243-249` (`sendBatch`), `:287-293` (`send`), and `:494-499` (`deploy`) interpolate an unredacted bundler/paymaster `error.message` (potentially echoing signed `callData`/`initCode`) into the thrown string. Sibling `MorphoLendProvider.ts:81,215` carries the identical interpolation pattern and must be fixed in lockstep for consistency.

## Root cause

The blanket catch-alls rebuild a fresh `Error` message by string-concatenating fields that are either caller-controlled free text (`asset.metadata.symbol`) or externally-sourced (`error.message` from the bundler). The rebuilt message is treated as a safe diagnostic, but it is an injection/exposure sink: caller free text is relayed without encoding, and the bundler string is relayed without redaction. The SDK has the structural information to avoid this — it knows these fields are untrusted — but the current catch shape flattens that knowledge into one opaque interpolated string. This is the appsec companion to the broader F011/#474 error-flattening work: the named-error retrofit fixes the masking, and this ticket adds the sanitization requirement on top.

## Recommended approach

This is an SDK fix (core domain, signing-path-adjacent), so a refactor is in scope. Fold it into the #474 named-error retrofit rather than shipping a parallel string-patch:

- **Aave/Morpho lend catch-alls:** stop interpolating caller free text. Drop `asset.metadata.symbol` (and the amount/address fields) from the human-readable message and instead carry them as structured properties on a named error (the `ActionsError`/lend-error taxonomy that #474 introduces), so the message string is a fixed constant and the untrusted values are fields an integrator can inspect deliberately rather than free text spliced into a log line. Preserve the original as `cause`. Apply the same change to the `MorphoLendProvider` twins so the two providers stay consistent.
- **`send`/`sendBatch`/`deploy`:** wrap bundler/paymaster failures in a named error (e.g. `SmartWalletSendError`) that preserves the original as `cause` rather than string-interpolating `error.message` into the thrown message. Keep the constant prefix (`Failed to send transaction`) but do not splice the raw bundler string into it. Document that the raw `cause` may contain full signed `callData`/`initCode` and must not be logged at info level.

Scope guard: this is a sanitization/consistency fix, not intent-guessing or refuse-to-sign. It does not change which transactions sign; it only changes how failures are surfaced. The fix is naturally blocked by the named-error taxonomy work (`named-error-taxonomy-signing-path` / the body of #474) because the structured-field destination is the named error class that retrofit introduces — sequence this after it lands so both providers and the smart wallet emit the same error shape.

## Affected files

- `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts:79-83` — `_openPosition` catch interpolates `amountWei` + `asset.metadata.symbol`.
- `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts:117-119` — `_closePosition` catch (bare wrap, drops `cause`; fix in the same pass).
- `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts:205-209` — `_getPosition` catch interpolates `walletAddress` + `marketId.address`.
- `packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts:81,130,215` — sibling twins of the three Aave catch-alls; fix for consistency.
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:243-249` — `sendBatch` catch interpolates raw `error.message`.
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:287-293` — `send` catch interpolates raw `error.message`.
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:494-499` — `deploy` catch interpolates raw `error.message`.

## Acceptance criteria / tests

- No thrown SDK error message on these paths interpolates `asset.metadata.symbol` (or any caller-supplied free-text field) verbatim; the values are carried as structured properties on a named error instead.
- A test passes an `Asset` whose `metadata.symbol` contains a newline / control sequence (e.g. `USDC\n[ALERT] forged`), triggers the Aave open catch path, and asserts the thrown error's `message` does not contain the injected substring (the symbol is on a structured field, not in the message).
- `send`/`sendBatch`/`deploy` throw a named error whose `message` is a fixed constant and whose `cause` is the original bundler/paymaster error; a test asserts the thrown `message` does not contain raw `callData`/`initCode` hex echoed from a simulated bundler rejection string.
- Aave and Morpho lend providers emit the same error shape for the same failure (consistency assertion across the sibling twins).
- Existing tests that lock in the old interpolated strings are updated; none silently skipped.

## Notes

- Severity is low: no fund loss and no key/signature material is constructed or logged at these sites. The fix value is output hygiene (no log forging via `asset.metadata.symbol`) plus not relaying potentially-signed-callData bundler strings unredacted.
- This is the sanitization lens on F011; the masking/error-flattening lens of the same finding is the core of #474. Both should land together so the named error is both the structured-field destination (this ticket) and the `instanceof`-discriminable contract (#474 body).
- RPC-trust is out of scope: integrators bring their own bundler/RPC. The concern here is solely that the SDK relays the resulting string unredacted to its own thrown error, not the trustworthiness of the bundler itself.
- The `_closePosition` catch (`:117-119`) does not interpolate free text today, but it drops `cause`; include it in the same pass so all three Aave catch-alls (and their Morpho twins) converge on the named-error-with-`cause` shape.
