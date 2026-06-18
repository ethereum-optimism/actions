# Use signer as Permit2/allowance owner and bound Permit2 expiration to the swap deadline

> **AUGMENT existing issue #436 - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | medium |
| **Complexity** | 3 (of 5) |
| **Domain** | swap |
| **Surface** | `SwapProvider.buildPermit2Approvals` (owner read + expiration), `UniswapSwapProvider._buildApprovals` (`walletAddress: quote.recipient`), `VelodromeSwapProvider._buildApprovals` (`owner: quote.recipient`), `utils/approve.ts buildPermit2ApprovalTx` (expiration encoding) |
| **Resolves findings** | F002, F078, F050, F067, F187 |
| **Candidate existing issue** | #436 |
| **Blocked by** | (none) |

## Problem

Two independent defects in the swap approval path, both inside the Permit2 signing payload that the integrator's wallet signs.

1. **Wrong allowance owner.** The SDK checks (and therefore decides whether to build) ERC20->Permit2 and Permit2->router approvals against `quote.recipient`, not the wallet that actually signs the swap and from which the router pulls input tokens. On the raw-params path `recipient` defaults to `params.recipient ?? walletAddress`, so a caller passing a distinct `recipient` makes the pre-check query the wrong account. The router then `transferFrom`s the signing wallet, which may have no allowance: the swap reverts, or a redundant approval is emitted. The token payer is always the signer; the SDK already has that address (`walletAddress`) and simply hands the wrong one to the allowance check. This is a fail-closed-where-the-SDK-already-knows gap, not intent-guessing.

2. **Standing spend authorization decoupled from the trade.** The inner Permit2 approval expiration is `now + permit2ExpirationSeconds` (default 30 days) with no tie to the swap's own `deadline`, even though `deadline` is already threaded into the same params object. In `max` approval mode the amount is `maxUint160`. The result is a 30-day, effectively-unlimited spend grant to the Universal Router that outlives the trade it was created for, and `buildPermit2Approvals` will skip re-approval entirely while that standing grant is live. The expiration is also encoded into a `uint48` with no positive/integer/overflow bound, so a misconfigured `permit2ExpirationSeconds` silently produces a dead-on-arrival (past-dated) or malformed approval.

Fund-safety framing: an approval whose owner is the wrong account is a correctness/availability bug (reverts, redundant approvals); an over-broad, long-lived `maxUint160` Permit2 grant to the router is standing spend authority that should be no wider in time than the trade requires. Both live in the signed Permit2 payload, which is in signing-path scope.

## Findings

- **F002** — `UniswapSwapProvider._buildApprovals` passes `walletAddress: quote.recipient` (`packages/sdk/src/actions/swap/providers/uniswap/UniswapSwapProvider.ts:92`), so `buildPermit2Approvals` uses the recipient as the allowance owner for both the ERC20->Permit2 and Permit2->spender checks instead of the executing signer.
- **F078** — Velodrome sibling of F002: `_buildApprovals` reads `owner: quote.recipient` for `checkTokenAllowance` and gates the approval tx on that owner's allowance (`packages/sdk/src/actions/swap/providers/velodrome/VelodromeSwapProvider.ts:218-223`), the identical owner/signer confusion at a distinct, previously unrecorded line.
- **F050** — `buildPermit2Approvals` sets the Permit2 inner-approval expiration from `permit2ExpirationSeconds` (30-day default) with no reconciliation against the swap `deadline`, and reuses a live `maxUint160` grant without rebuilding (`packages/sdk/src/actions/swap/core/SwapProvider.ts:333-392`, specifically the `permit2Expired`/`permit2Allowance.amount < requiredAmount` gate at 375-389).
- **F067** — `buildPermit2ApprovalTx` computes `expiration = floor(Date.now()/1000) + (expirySeconds ?? DEFAULT)` and encodes it straight into the `uint48` approve arg with no positive/integer/`<= maxUint48` bound (`packages/sdk/src/utils/approve.ts:115-117`); a negative/fractional/overflowing `permit2ExpirationSeconds` yields a dead or malformed approval.
- **F187** — Test gap: the Uniswap unit test only asserts `tokenApproval`/`permit2Approval` are defined, never decoding the Permit2 amount or expiration, so it cannot distinguish exact-mode from max-mode, catch an expiry that outlives the swap, or verify the residual standing allowance (`packages/sdk/src/actions/swap/core/SwapProvider.ts:333-392`, asserted by truthiness in `packages/sdk/src/actions/swap/providers/uniswap/__tests__/UniswapSwapProvider.test.ts`).

## Root cause

Two conflated concerns, threaded through the same `ResolvedSwapParams`:

- **Owner vs recipient.** `_buildApprovals` (both providers) treats `recipient` as if it were the token payer. `buildPermit2Approvals` faithfully uses `params.walletAddress` as the allowance owner (`SwapProvider.ts:351,357`), but Uniswap populates `walletAddress` with `quote.recipient`, and Velodrome bypasses `walletAddress` and reads `quote.recipient` directly. The signer/payer (`walletAddress`) is already available; the recipient should only affect output routing.
- **Expiration vs deadline.** The Permit2 expiration is derived solely from a config knob, never from the trade's `deadline` (which is present on the same params), and `buildPermit2ApprovalTx` applies no `uint48`/positivity bound to the encoded value.

## Recommended approach

SDK refactor (in scope). Augment issue #436.

1. **Thread the true token owner separately from recipient.**
   - Add an explicit signer/owner field to the params passed into `buildPermit2Approvals` and use it as the allowance `owner` for both the ERC20->Permit2 and Permit2->spender checks. Stop overloading `walletAddress` with `quote.recipient`.
   - Uniswap: stop setting `walletAddress: quote.recipient` at `UniswapSwapProvider.ts:92`; pass the executing wallet.
   - Velodrome: replace `owner: quote.recipient` at `VelodromeSwapProvider.ts:221` with the executing wallet, mirroring the Uniswap fix so the siblings stay consistent.
   - `recipient` continues to drive output routing only.

2. **Bound the Permit2 expiration to the swap deadline.**
   - Pass the swap `deadline` into `buildPermit2ApprovalTx` and clamp the computed expiration to `min(now + permit2ExpirationSeconds, deadline)` (or the deadline directly). The grant should not outlive the trade it authorizes. `deadline` is already on the resolved params, so this is fail-closed using state the SDK already holds, not new policy.

3. **Validate the expiration encoding (F067).**
   - In `buildPermit2ApprovalTx` (or at the `permit2ExpirationSeconds` config seam), assert `expirySeconds` is a positive finite integer and that the resulting `expiration <= maxUint48`, throwing `InvalidParamsError` (mirroring the existing slippage validation) rather than emitting a past-dated or malformed approval.

4. **Keep `max`-mode behavior, but make it observable and time-bounded.** This ticket does not remove `maxUint160` max-mode (that is an integrator-selected approval mode). It bounds the *time window* of the grant to the deadline and surfaces the granted amount/expiration in tests (F187). Whether to change the default approval mode is out of scope here.

Consistency note: F002 (Uniswap) and F078 (Velodrome) must be fixed together so the two sibling providers compute approvals against the same owner. Fixing only one leaves the inconsistency that motivated splitting F078 out.

## Affected files

- `packages/sdk/src/actions/swap/providers/uniswap/UniswapSwapProvider.ts:82-104` (`_buildApprovals`; `walletAddress: quote.recipient` at line 92)
- `packages/sdk/src/actions/swap/providers/velodrome/VelodromeSwapProvider.ts:218-228` (`_buildApprovals`; `owner: quote.recipient` at line 221)
- `packages/sdk/src/actions/swap/core/SwapProvider.ts:333-392` (`buildPermit2Approvals`; owner reads at 351/357, expiration/amount gate at 375-389)
- `packages/sdk/src/utils/approve.ts:107-130` (`buildPermit2ApprovalTx`; expiration computation at 115-117, `DEFAULT_PERMIT2_EXPIRY_SECONDS` at line 9)
- `packages/sdk/src/actions/swap/providers/uniswap/__tests__/UniswapSwapProvider.test.ts` (truthiness-only approval assertions; F187)
- `packages/sdk/src/utils/__tests__/approve.test.ts` (expiration bound + clamp assertions)

## Acceptance criteria / tests

- Owner correctness (F002/F078): for a swap with `walletAddress: A`, `recipient: B` on both Uniswap and Velodrome, the allowance pre-check queries `A`'s allowance, not `B`'s. A test where `A` lacks an allowance and `B` has one asserts an approval tx is still built (no skipped approval), and the inverse asserts no redundant approval is emitted.
- Expiration binding (F050): decode the emitted `buildPermit2ApprovalTx` calldata and assert the encoded expiration is `<= deadline` (and equals the clamp of `now + permit2ExpirationSeconds` and `deadline`).
- Expiration validation (F067): a negative, fractional, or `uint48`-overflowing `permit2ExpirationSeconds` throws `InvalidParamsError` (or the SDK's existing param-validation error) before any calldata is encoded; the default value continues to encode cleanly.
- Amount/mode observability (F187): decode the Permit2 approve args and assert exact-mode approves exactly `requiredAmount` (no over-grant) and max-mode approves `maxUint160` with `expiration == clamp(now + permit2ExpirationSeconds, deadline)`. A mutation that forces `resolvePermit2ApprovalAmount` to always return `maxUint160` must fail the exact-mode test (currently passes because assertions are truthiness-only).
- The residual-allowance and recipient adversarial assertions belong to the consolidated Anvil feature-test ticket (F188 references these as the on-chain check for F050/F002); this ticket covers the unit-level decode assertions.

## Notes

- Permit2 approve payloads are signing-path surface, so the expiration/amount bounds here are in scope per the signing-path rule.
- RPC values consumed by `checkTokenAllowance`/`checkPermit2Allowance` are trusted per the documented integrator-RPC assumption; this ticket does not harden those reads. The fix is purely about which owner the SDK passes and which expiration it encodes, both of which the SDK already knows.
- This is a single augmentation of #436. The owner fix (F002/F078) and the expiration fix (F050/F067/F187) are tightly coupled in `buildPermit2Approvals` and should land together to keep the two sibling providers consistent.
- Out of scope: changing the default approval mode, removing `maxUint160` max-mode, and any recipient-routing changes (tracked separately as F003/F046).
