# Bound borrow quote expiry window (quotedAt<=now<expiresAt) on dispatch

| | |
|---|---|
| **Severity** | medium |
| **Complexity** | 2 / 5 |
| **Domain** | borrow |
| **Surface** | `WalletBorrowNamespace.validateQuoteForThisWallet` -> `validateQuoteNotExpired` (`utils/validation.ts:87-92`) |
| **Resolves findings** | F054 (expiry slice) |
| **Candidate existing issue** | #373 |
| **Blocked by** | prebuilt-quote-calldata-integrity |

>  AUGMENT existing issue #373 - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.

## Problem

A pre-built `BorrowQuote` is a plain, caller-supplied object. The only freshness guard on the dispatch path is `validateQuoteNotExpired(quote.expiresAt)`, which checks just `now >= expiresAt`. Both `quotedAt` and `expiresAt` are untrusted fields on that object, fully self-described by whoever produced the quote, and neither is bound to or signed against the calldata that actually moves funds.

Because only the upper edge is checked, a relayed, cached, or less-trusted-preview-service quote can carry an arbitrarily far-future `expiresAt` (or a `quotedAt` in the future, or `expiresAt - quotedAt` far beyond the provider's configured `quoteExpirationSeconds`) and stay dispatchable indefinitely. The SDK advertises that quotes expire on a fixed window (the producers stamp `expiresAt = quotedAt + quoteExpirationSeconds`, borrow `core/quote.ts:60-61`), but that guarantee is not enforceable on an externally supplied quote: the consumer never re-checks the window it claims to honor.

On its own this is not a fund-redirect: the `recipient == wallet.address` guard (`WalletBorrowNamespace.ts:211`) keeps a quote built for another wallet from routing funds away. The fund-safety impact compounds with the F054 calldata-binding gap that this ticket augments under #373: an unexpired-forever quote is the time dimension of the same untrusted-bytes dispatch. A malicious or stale calldata leg that would otherwise age out can be re-dispatched against the victim's wallet long after the SDK's intended window, defeating the "quotes are short-lived" assumption that bounds the blast radius of a tampered quote. It also lets a genuinely stale borrow (priced against an old position / interest accrual) sign against on-chain state the quote no longer reflects.

This is the same shape on swap (`SwapProvider.executeFromQuote` -> `validateQuoteNotExpired(quote.expiresAt)`, `SwapProvider.ts:435`), which calls the identical helper and ignores `quotedAt`. Tightening the shared helper fixes both siblings at once; sibling-consistency across the borrow and swap quote paths is in scope.

## Findings

- **F054 (expiry slice)** (medium, borrow) `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:218` -> `packages/sdk/src/utils/validation.ts:87-92` - `validateQuoteForThisWallet` calls `validateQuoteNotExpired(quote.expiresAt)`, which only tests `now >= expiresAt`. It never checks `quotedAt <= now`, never checks `expiresAt > quotedAt`, and never bounds `expiresAt - quotedAt` against the provider's `quoteExpirationSeconds`, so a caller-supplied quote can self-extend its validity window beyond SDK policy. (`refines:F054`, the expiry dimension of the verbatim pre-built-quote dispatch; the calldata-bytes dimension is the parent ticket.)

## Root cause

`validateQuoteNotExpired(expiresAt: number)` takes only the upper edge of the window and trusts it as an absolute claim. `quotedAt` (which both `BorrowQuote` and `SwapQuote` already carry, `types/borrow/quote.ts:87-89`, `types/swap/base.ts:245-247`) is never passed in, and the provider's `quoteExpirationSeconds` (the policy that the SDK's own producers use to derive `expiresAt`) is never consulted at validation time. The consumer therefore cannot tell a fresh in-policy quote from a self-extended one. The helper validates *that the quote claims not to have expired*; it never validates *that the claimed window is one the SDK would have issued*.

## Recommended approach

Fail-closed using inputs the SDK already has. This is window sanity on values the SDK already produces, not intent-guessing and not refuse-to-sign.

1. **Pass `quotedAt` and the policy bound to the validator.** Extend `validateQuoteNotExpired` to accept the full window and the provider's max window, e.g. `validateQuoteNotExpired(quote.quotedAt, quote.expiresAt, provider.quoteExpirationSeconds)`. The borrow namespace already resolves providers in `validateQuoteForThisWallet` (`getAllProviders()` / the allowlist check at `WalletBorrowNamespace.ts:220`), so `quoteExpirationSeconds` is reachable there; thread the same value through on the swap call site (`SwapProvider.ts:435`, where `this.quoteExpirationSeconds` is already in scope).

2. **Reject when any of the following hold** (in addition to the existing `now >= expiresAt`):
   - `quotedAt > now` (quote stamped in the future / clock-skew abuse),
   - `expiresAt <= quotedAt` (degenerate or inverted window),
   - `expiresAt - quotedAt > quoteExpirationSeconds` (window wider than SDK policy; a relayed quote cannot self-extend).
   Allow a small fixed clock-skew tolerance on the `quotedAt > now` and window-width checks so honestly-issued quotes near the boundary are not spuriously rejected; pick one tolerance constant and apply it identically on borrow and swap.

3. **Reuse the existing `QuoteExpiredError`** (or a sibling `QuoteWindowInvalidError` if the distinction is worth surfacing) so consumers keep a single catch path; do not invent per-edge error types unless product wants them.

4. **Keep the fix in the shared helper so borrow and swap stay consistent.** Both call sites change identically; this is the cheapest place to close the sibling gap.

This ticket is the expiry-window slice only. The calldata-vs-metadata binding (decode/re-derive `execution.transactions` bytes, recipient-in-bytes, router binding, blocklist symmetry) is the parent `prebuilt-quote-calldata-integrity` ticket under the same #373; do not duplicate that binding here. Sequence this after the parent so the window check layers onto the bound-calldata path rather than guarding bytes that are still trusted verbatim.

**Demo / CLI:** review-only, no refactor. No demo/CLI change is required by this ticket; the SDK helper is the single enforcement point. If a CLI flow surfaces a quote's window to the user, it can cross-reference the new error once the SDK lands, but do not re-implement the window check at that layer.

## Affected files

- `packages/sdk/src/utils/validation.ts:87-92` - `validateQuoteNotExpired`; extend to take `quotedAt` + policy bound and add the window-sanity checks.
- `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:218` (provider resolution context at `220`) - borrow call site; pass `quote.quotedAt` and the provider's `quoteExpirationSeconds`.
- `packages/sdk/src/actions/swap/core/SwapProvider.ts:435` - swap sibling call site; pass `quote.quotedAt` and `this.quoteExpirationSeconds` for consistency.
- `packages/sdk/src/types/borrow/quote.ts:87-89` - `BorrowQuote.quotedAt` / `expiresAt` (fields the validator will read).
- `packages/sdk/src/types/swap/base.ts:245-247` - `SwapQuote.quotedAt` / `expiresAt` (sibling fields).
- `packages/sdk/src/actions/borrow/core/quote.ts:60-61` - producer that stamps `expiresAt = quotedAt + quoteExpirationSeconds` (the policy the validator must mirror).
- `packages/sdk/src/actions/borrow/core/BorrowProvider.ts:75-79` - `quoteExpirationSeconds` resolution (config -> settings -> default).

## Acceptance criteria / tests

- A `BorrowQuote` with valid `recipient`/`action`/`marketId`/`chainId` metadata but `expiresAt - quotedAt` greater than the provider's `quoteExpirationSeconds` is **rejected** before dispatch. [F054 expiry slice]
- A `BorrowQuote` with `quotedAt` set in the future (beyond the clock-skew tolerance) is **rejected**. [F054 expiry slice]
- A `BorrowQuote` with `expiresAt <= quotedAt` (degenerate/inverted window) is **rejected**.
- A `BorrowQuote` produced normally (`expiresAt = quotedAt + quoteExpirationSeconds`, `quotedAt <= now < expiresAt`) still **passes** unchanged, including near the boundary within the tolerance.
- The already-expired case (`now >= expiresAt`) continues to throw `QuoteExpiredError` (no regression to the existing guard).
- The swap sibling path (`SwapProvider.executeFromQuote`) enforces the identical window checks via the same helper; a self-extended `SwapQuote` is rejected with the same error type.
- New tests fail against current `main` (they encode the window invariant, not just current `now >= expiresAt` behavior); all existing borrow/swap execute tests pass.

## Notes

- Fund-safety framing: medium, not high, on its own - the `recipient == wallet.address` guard prevents fund-redirect, so the standalone impact is a stale/self-extended quote signing against drifted on-chain state. It is filed under #373 because the time dimension and the calldata-bytes dimension of the verbatim pre-built-quote dispatch should be hardened together.
- Permit2 signature payloads are in signing-path scope generally, but this ticket touches only the quote's expiry-window fields, not a Permit2 deadline; the Permit2 owner/expiry concerns are tracked in `permit2-approval-owner-and-expiry`.
- Clock-skew tolerance is the one judgment call: pick a single small constant (seconds), name it, and apply it identically on borrow and swap so the siblings cannot drift. Do not make it configurable unless an integrator asks.
- RPC trust is out of scope: the window check uses only `Date.now()`, the quote's own `quotedAt`/`expiresAt`, and static provider config (`quoteExpirationSeconds`); no RPC round-trip is introduced.
- The full sign-and-broadcast quote-aging coverage (advance Anvil time past `expiresAt`, assert `execute()` throws) belongs to the consolidated Anvil feature-test ticket, not here; this ticket's tests are unit-level against the helper and the two call sites.
