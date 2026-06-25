# Make the Aave USDC_DEMO mirror reconcile UserOp success and add idempotency

| Field | Value |
| --- | --- |
| Severity | low |
| **Complexity** | 2 / 5 |
| Domain | backend |
| Surface | `services/mirror.ts` `void mintMirrorUsdc/removeMirrorUsdc` |
| Resolves findings | F292 |
| Candidate existing issue | none |
| Blocked by | (none) |

This is a demo/backend ticket and is **review-only**: a low-risk reconciliation/idempotency fix on a permissionless mock token, no architectural refactor. The hazard is demo-balance drift and a doubled mirror on retry, not protocol fund loss; the fix branches on the UserOp `success` flag the mirror already resolves and keys mirror ops by the real-tx hash the call sites already pass.

## Problem

After each real Aave borrow/repay on OP Sepolia, the backend mirrors an equivalent USDC_DEMO mint/removal on Base Sepolia so the demo UI shows a matching balance. That mirror is fire-and-forget and silent, which lets the displayed demo balance drift from the real on-chain position in two ways.

- **A reverted or failed mirror is reported as settled.** `mintMirrorUsdc`/`removeMirrorUsdc` await a second sponsored `sendBatch` inside a try/catch that only `console.error`s on a thrown failure and never inspects the returned UserOp receipt's `success` flag. A mined-but-reverted mirror UserOp resolves with `success: false` (it does not throw), so it is logged `'ok'` (`[mirror] settled`). The borrow/repay response has already returned the real receipt, so the action reports success while the mirrored USDC_DEMO balance never updates. A failed mint after a real borrow leaves a real debt with zero USDC_DEMO; the repay leg then sees no demo balance to spend.

- **A client retry double-mirrors.** There is no idempotency key tying a mirror op to the real-tx hash that triggered it. The mint endpoints have no rate limit (F276), so retrying the same `POST /borrow/position/open` fires a fresh permissionless USDC_DEMO mint of the borrow amount each time, inflating the demo balance beyond the real position. The only repair path is a deferred reconciliation that is currently an unimplemented TODO (`borrow.ts:285`).

Fund-safety framing: USDC_DEMO is a permissionless mock ERC-20 minted to the user's own wallet and removed to a dead sink, on a testnet. There is no protocol fund loss. The hazard is honesty and drift: the demo tells the user the mirror settled when it reverted, and a retry silently doubles the mirrored balance, both of which desync the demo display from the real Aave position.

## Findings

- **F292** (`packages/demo/backend/src/services/mirror.ts:41-84`): `mintMirrorUsdc`/`removeMirrorUsdc` await `mintUsdcDemo`/`transferUsdcDemo` (`:47,:70`, each a sponsored `wallet.sendBatch`) inside a try/catch that swallows thrown failures to `console.error` (`logMirror(..., 'failed')`, `:53-59,:76-82`) and never reads the resolved UserOp receipt's `success` flag, so a mined-but-reverted mirror UserOp is logged `'ok'`. Call sites fire-and-forget via `void` (`borrow.ts:210,232,288`) and pass `receipt.transactionHash`, but no idempotency key is derived from it, so a retry double-mirrors; the deferred-reconciliation repair is an unimplemented TODO (`borrow.ts:285`). User-visible frontend twin tracked as F308 (`aaveDemoMagic.ts`).

## Root cause

The mirror was written as best-effort and silent by design (`mirror.ts:8-11`), which conflates two separable things: not blocking the borrow/repay response (correct, the real action already succeeded) and not reconciling the mirror outcome (the drift bug). Two concrete gaps follow:

- `mintUsdcDemo`/`transferUsdcDemo` return the `sendBatch` result, whose receipt already carries a `success` boolean (the same flag the sibling mint path reads in `backend-mint-receipt-success-gate.md`). The mirror discards it and treats "did not throw" as success, so a reverted UserOp logs `'settled'`.
- The real-tx hash is threaded all the way to `logMirror` (`mirror.ts:31`) purely as a log field; nothing uses it to dedupe, so the mirror has no notion of "already mirrored this tx" and a retried borrow mints again.

## Recommended approach

Review-only, no refactor. Keep the fire-and-forget dispatch at the call sites (the borrow/repay response must not block on the mirror); the change is entirely inside `mirror.ts` plus a small dedupe guard.

1. **Reconcile the UserOp `success` flag (`mirror.ts`).** Capture the `sendBatch` result from `mintUsdcDemo`/`transferUsdcDemo` and branch on its receipt `success` flag (mirroring the gate in `backend-mint-receipt-success-gate.md`). When the mirror UserOp resolved `success: false`, log it as `'failed'` (`logMirror(..., 'failed')`) rather than `'ok'`, so a mined-but-reverted mirror is no longer recorded as settled. The functions stay `void`-dispatched and still never throw into the borrow/repay response; this only fixes the success classification of the log so observability reflects reality.

2. **Add an idempotency key on the real-tx hash (`mirror.ts`).** Key each mirror op by `realTxHash` and skip the `sendBatch` if that hash has already been mirrored, so a client retry of the same borrow/repay does not mint/remove twice. A process-local in-memory set keyed by `(action, realTxHash)` is sufficient for the demo (single backend instance); persistence and the deferred-reconciliation repair (`borrow.ts:285` TODO) are explicitly out of scope for this review-only ticket. Guard against the `realTxHash === undefined` case (the parameter is optional) by only deduping when a hash is present.

Scope notes:
- No RPC-trust hardening, no intent-guessing, no broad refuse-to-sign. Both changes act only on values the backend already holds: the receipt `success` flag the mirror's own `sendBatch` resolves, and the `realTxHash` the call sites already pass in.
- This is the demo-backend response to F292 only. The user-visible frontend twin (F308, `aaveDemoMagic.ts`) is tracked separately and not fixed here.
- Rate-limiting the mint endpoints (F276) is a complementary defense tracked in `backend-faucet-auth-and-rate-limit.md`; the idempotency key here closes the double-mirror even without it.

## Affected files

- `packages/demo/backend/src/services/mirror.ts:41-61` (`mintMirrorUsdc` — read the `sendBatch` receipt `success` flag; add `realTxHash` idempotency guard)
- `packages/demo/backend/src/services/mirror.ts:64-84` (`removeMirrorUsdc` — same success-flag read and idempotency guard)
- `packages/demo/backend/src/services/mirror.ts:19-38` (`logMirror` — already takes `realTxHash`; classify `success: false` as `'failed'`)
- `packages/demo/backend/src/services/usdcDemo.ts:20-50` (`mintUsdcDemo`/`transferUsdcDemo` — return the `sendBatch` result carrying `success`; no change)
- `packages/demo/backend/src/services/borrow.ts:210,232,288` (`void mintMirrorUsdc/removeMirrorUsdc` call sites — keep fire-and-forget; pass `receipt.transactionHash` as today; no change)
- `packages/demo/backend/src/services/borrow.ts:285` (deferred-reconciliation TODO — referenced as out of scope; no change)

## Acceptance criteria / tests

- A mirror `sendBatch` whose UserOp resolves `{ success: false }` is logged as `'failed'` (`[mirror] failed`), not `'ok'` / `'settled'`. A unit test that stubs `mintUsdcDemo`/`transferUsdcDemo` to return a `{ success: false }` receipt asserts the failure log.
- A mirror `sendBatch` that resolves `{ success: true }` is logged as `'ok'` / `'settled'` unchanged (no behavior change to the happy path).
- Two `mintMirrorUsdc` calls with the same non-undefined `realTxHash` fire `mintUsdcDemo` only once; the second call is skipped as already-mirrored. Same for `removeMirrorUsdc`/`transferUsdcDemo`.
- A `mintMirrorUsdc`/`removeMirrorUsdc` call with `realTxHash === undefined` still dispatches (no dedupe applied) and does not throw, preserving today's optional-hash behavior.
- The borrow/repay response is still returned without awaiting the mirror (the call sites remain `void`-dispatched); a mirror failure or skip never throws into or delays the borrow/repay response.

## Notes

- Sibling of `backend-mint-receipt-success-gate.md` (F287/F289): both fix the same fail-open of treating a UserOp that did not throw as a success without reading the receipt `success` flag. That ticket gates the faucet/demo mint response; this one fixes the mirror's success classification and adds idempotency. They are complementary, not duplicates.
- F308 is the user-visible frontend twin of F292 (`packages/demo/frontend/src/demoMagic/aaveDemoMagic.ts:35-89`): `mirrorBorrowReceipt` is invoked as `void` and `sendMirrorTx` swallows failures to `console.error` with no success read and no idempotency key, so the same drift is visible in the UI (a failed mirror shows Confirmed while USDC_DEMO never updates; the repay gate then claims no balance). Tracked separately; not fixed by this backend ticket.
- F276 (no rate-limiting on the mint endpoints, `backend-faucet-auth-and-rate-limit.md`) is what makes the double-mirror cheap to trigger on retry; the idempotency key here closes the duplication independent of that defense.
- Real on-chain proof of the reverted-mirror and retry-dedupe paths (forced revert, read-back, replayed retry) belongs to the single consolidated Anvil feature-test ticket; the unit tests above stubbing the `sendBatch` receipt and call count are sufficient to lock the F292 contract here.
