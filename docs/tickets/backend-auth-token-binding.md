# Bind the verified access token to the wallet-selecting id token

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Complexity** | 2 / 5 |
| **Domain** | backend |
| **Surface** | `middleware/auth.ts` `authMiddleware` (verified access token vs unverified `privy-id-token`), `parseAuthorizationHeader` Bearer strip, controller-level `validateRequest` vs `requireAuth` gate ordering |
| **Resolves findings** | F274, F294, F286, F288 |
| **Candidate existing issue** | none |
| **Blocked by** | (none) |

## Problem

The demo backend authenticates with two independent tokens and never proves they describe the same Privy user. `authMiddleware` verifies the `Authorization: Bearer ...` access token (`privy.utils().auth().verifyAuthToken`), but the wallet that actually signs every lend / borrow / swap / mint UserOperation is selected from a *separate*, *unverified* `privy-id-token` header (`walletService.getWallet(idToken)` → `privyClient.users().get({ id_token })`). The verified subject (identity A) and the wallet-selecting subject (identity B) are two unrelated strings, and the backend performs no binding or verification of its own.

In a DeFi context this is the fund-relevant failure mode: a caller holding *any one* valid access token (enough to clear the verify gate) plus *some other user's* id token derives the victim's embedded wallet, and the smart wallet for that victim then signs the attacker-initiated transactions. The signing wallet is chosen by the header the backend never checks. The whole security of the wallet-selection path rests on an undocumented assumption that Privy's `users().get({ id_token })` itself cryptographically validates the id token's signature and audience; the backend adds no compensating control, so if that assumption is wrong (or weakens in an SDK upgrade) the access-token gate protects nothing about *which* wallet signs.

Two smaller, related gaps sit on the same auth path:

- The Bearer strip is an unanchored, first-occurrence `String.replace`, so it does not match its stated only-strip-the-scheme intent for any token containing the substring `Bearer`.
- Several mutation/read handlers run schema validation (and, in one case, market-allowlist resolution) *before* the auth check, contradicting the convention the same file documents and leaking signal to unauthenticated callers.

## Findings

- **F274** (medium, correctness) — `packages/demo/backend/src/middleware/auth.ts:9-36` (consumer `services/wallet.ts:34-67`): `authMiddleware` verifies the access token (auth.ts:21-25) but stores the raw, unverified `privy-id-token` into `AuthContext.idToken` (auth.ts:11,26-29); every downstream signing wallet is derived from that idToken via `getWallet(idToken)` → `users().get({ id_token })` (wallet.ts:34-38), with no check that the access token and id token belong to the same Privy user. A valid access token presented with a victim's id token transacts against the victim's wallet.
- **F294** (low, correctness) — `packages/demo/backend/src/middleware/auth.ts:38-40`: `parseAuthorizationHeader` returns `value.replace('Bearer', '').trim()` — an unanchored, first-occurrence string replace, not a prefix strip; it does not match its only-strip-the-scheme intent for tokens containing the substring `Bearer` (benign for today's JWT access tokens, which do not).
- **F286** (low, info) — `packages/demo/backend/src/controllers/borrow.ts:97-107,117-127,138-148,159-169,178-188`: every borrow mutation handler (and the lend/swap mutation siblings) runs `validateRequest` before `requireAuth`, inverting the auth-first order that `borrow.ts:68-73` `getQuote` documents and follows; an unauthenticated request that reached the handler would receive a schema 400 before a 401.
- **F288** (low, info) — `packages/demo/backend/src/controllers/wallet.ts:85-105,111-133`: `getLendPosition` runs `validateRequest` (wallet.ts:86) before `requireAuth` (wallet.ts:96), and `getBorrowPosition` runs `validateRequest` then `borrowService.resolveBorrowMarketId` (wallet.ts:112,118 — throws `MarketNotAllowedError` → 403 for non-allowlisted markets) before `requireAuth` (wallet.ts:120); an unauthenticated caller distinguishes allowlisted (401-after-resolve) from non-allowlisted (403) markets — an allowlist-membership oracle.

## Root cause

The auth path treats two unrelated tokens as one identity. `authMiddleware` proves the *access* token is valid, but the only fact it carries forward to wallet selection is the *id* token, which it copies verbatim from a header it never verifies and never binds to the access-token subject. There is no single place that asserts "the user I authenticated is the user whose wallet I am about to sign with." The Bearer-strip and gate-ordering issues are the same shape one altitude down: the parser does not anchor to the known scheme prefix, and the handlers decide *what to validate* before deciding *whether the caller is allowed at all*, so the auth decision is not the first gate it should be.

## Recommended approach

Treat the access token as the sole identity authority and make the id token prove it describes the same Privy user before any wallet is derived from it. This is the in-scope fix kind: an obvious binding the backend already holds both inputs for (a verified access-token subject and an id token), missing today, and inconsistent with the auth-first convention the code documents.

1. **Bind the two tokens to the same Privy subject (F274).** In `authMiddleware`, after `verifyAuthToken(accessToken)` resolves the verified claims, extract the verified user id / subject and assert it equals the user the id token resolves to before placing anything in `AuthContext`. Two acceptable shapes, pick the one that fits the Privy SDK surface:
   - Resolve the user from the verified access token and the user from `users().get({ id_token })` and assert the two user ids are equal (the binding lives at the same place the wallet is later derived); or
   - Verify the id token directly (signature + audience) and assert `accessTokenClaims.userId === idTokenClaims.userId`.
   On mismatch, fail closed with a 401 and do not set `auth`. Do not treat an unverified header as the wallet selector. This is a backend (demo) change and is review-only: a focused fund-safety binding insertion in the existing middleware, no architectural refactor of the auth model.
2. **Anchor the Bearer strip (F294).** Replace `value.replace('Bearer', '').trim()` with a prefix-anchored strip — `value.replace(/^Bearer\s+/i, '').trim()` or `value.slice('Bearer '.length).trim()` — so only the scheme prefix is removed regardless of token contents. One-line, behavior-preserving for today's tokens.
3. **Order auth first, uniformly (F286, F288).** Move `requireAuth` to the top of every mutation handler in `controllers/borrow.ts` (and the lend/swap mutation siblings) and to the top of `getLendPosition` / `getBorrowPosition` in `controllers/wallet.ts`, ahead of `validateRequest` and `resolveBorrowMarketId`, matching the auth-first order `borrowController.getQuote` already documents and follows. This removes the allowlist-membership oracle (F288) and the validation-before-auth signal (F286) and makes every route uniformly return 401 to unauthenticated callers before any market resolution or schema feedback. Route-level `authMiddleware` already gates these routes, so this is a consistency/defense-in-depth ordering fix with no behavior change for authenticated callers; review-only, no refactor.

Note on the linchpin: the F274 binding is worth shipping regardless of whether `users().get({ id_token })` is later confirmed to verify the id token, because the backend asserting same-subject is the control that does not depend on an undocumented Privy internal. If that internal verification is confirmed, the explicit binding is cheap defense-in-depth; if it is not, the binding is the actual fix.

## Affected files

- `packages/demo/backend/src/middleware/auth.ts:9-36` — bind verified access-token subject to the id-token user before setting `AuthContext` (F274).
- `packages/demo/backend/src/middleware/auth.ts:38-40` — prefix-anchored Bearer strip (F294).
- `packages/demo/backend/src/services/wallet.ts:34-38` — `getWallet(idToken)` is the consumer that derives the signing wallet from the id token; the binding in auth.ts is what protects this call.
- `packages/demo/backend/src/controllers/borrow.ts:97-107,117-127,138-148,159-169,178-188` — move `requireAuth` ahead of `validateRequest` in the mutation handlers (F286).
- `packages/demo/backend/src/controllers/wallet.ts:85-105,111-133` — move `requireAuth` ahead of `validateRequest` / `resolveBorrowMarketId` in `getLendPosition` / `getBorrowPosition` (F288).
- `packages/demo/backend/src/controllers/lend.ts`, `packages/demo/backend/src/controllers/swap.ts` — same auth-first reordering for the lend/swap mutation handlers that share the validate-then-auth pattern (F286).

## Acceptance criteria / tests

- A request with a valid access token (user A) and a *different* user's id token (user B) is rejected at the middleware with a 401 and never derives user B's wallet; a test asserts `getWallet`/`users().get` is not reached on the mismatch path.
- A request whose access token and id token resolve to the same Privy user passes and sets `AuthContext` as before (no regression for the legitimate path).
- `parseAuthorizationHeader('Bearer abcBearerdef')` returns `abcBearerdef` (only the leading scheme stripped), and a normal `Bearer <jwt>` still yields the bare jwt; a unit test encodes both, so a regression to first-occurrence/unanchored replace fails.
- An unauthenticated `GET /wallet/borrow/<chainId>/<marketId>/position` returns 401 for both an allowlisted and a non-allowlisted market (no 403-vs-401 oracle), and an unauthenticated mutation request returns 401 before any schema 400; tests assert the uniform 401 and that `resolveBorrowMarketId` / `validateRequest` are not reached pre-auth.
- The binding test asserts same-subject equivalence (recovered access-token user id equals id-token user id), so it fails if the binding is removed or weakened — intent, not a tautology against a single mocked user.

## Notes

- Severity is medium: F274 is a real wrong-wallet signing path whose worst case is transacting against a victim's wallet, but full exploitation hinges on an attacker obtaining a victim's id token and the precise verification behavior of Privy's `users().get({ id_token })`; the same-subject binding converts that dependency into an explicit backend-owned check. F294/F286/F288 are low-severity correctness/consistency items folded in because they live on the same auth path and share the "anchor the auth decision" root.
- Demo backend is review-only per scope: these are low-risk fund-safety/security fixes (token binding, prefix strip, auth-first ordering), not an architectural rework of the auth model. The route-level `authMiddleware` already gates the affected routes, so the in-handler `requireAuth` reorder is defense-in-depth/consistency.
- RPC trust is out of scope (integrators supply their own RPC, a documented assumption); nothing here depends on RPC hardening.
- The end-to-end coverage with real Privy creds plus Anvil-simulated signing (asserting the cross-user id-token attack is rejected against a live Privy auth surface) belongs to the single consolidated Anvil feature-test ticket, built later; the unit-level binding and ordering tests in this ticket stand on their own.
