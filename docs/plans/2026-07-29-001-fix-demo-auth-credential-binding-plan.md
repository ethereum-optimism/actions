---
date: 2026-07-29
type: fix
status: active
origin: docs/brainstorms/demo-auth-credential-binding-requirements.md
---

# fix: Bind demo auth credentials and parse Bearer case-insensitively

## Summary

Harden the demo backend's auth boundary in `packages/demo/backend/src/middleware/auth.ts`: match the `Authorization` scheme case-insensitively, and reject any request whose identity token resolves to a different Privy user than the access token was issued to. No production file outside the middleware changes.

## Problem Frame

An audit of `ecosystem-private` PR 530 confirmed the demo does not share that PR's two real defects (no session cache to poison, no session cookie, exact-match CORS, no credentialed CORS). It did surface two smaller issues in the auth middleware: a case-sensitive scheme check that rejects RFC 9110-conformant lowercase schemes, and two separately-verified credentials whose subjects are never compared against each other. See origin: `docs/brainstorms/demo-auth-credential-binding-requirements.md`.

## Research Findings

Verified against the installed `@privy-io/node` 0.3.0 rather than assumed:

- Access-token verification derives its user id as `throwIfNotString(verifiedToken.payload.sub)`. Identity-token parsing derives its user id as `payload.sub`. **Both are the `sub` claim of their respective Privy JWT, so they are the same Privy DID and a direct string comparison is the correct binding check.** This was the main correctness risk in the change and it is resolved.
- The users-by-identity-token call is a thin wrapper over identity-token verification (signature checked against the app JWKS), not a REST fetch. The app JWKS is a `jose` remote JWKS, which caches. **The boundary check therefore adds no network request per call**, resolving the latency question the origin doc deferred to planning.
- Access-token verification's response type declares `user_id` as always present, so a missing one indicates something is wrong rather than a supported state.

Blast radius on tests, which is the only non-obvious part of this change:

- Four route specs send auth headers: `swap.routes.spec.ts`, `lend.routes.spec.ts`, `wallet.routes.spec.ts`, `borrow.routes.spec.ts`.
- `wallet` and `borrow` use the shared `mockVerifiedUser` helper in `packages/demo/backend/src/controllers/routeTestUtils.ts`. `swap` and `lend` each carry their own inline Privy client mock that resolves access-token verification to `undefined`.
- **No existing mock stubs the users resource.** The moment the middleware resolves the identity token, every one of these specs would fail on a missing method. Test infrastructure has to be extended before the production check lands, which drives the unit ordering below.

## Requirements Traceability

| Unit | Requirements | Acceptance Examples |
|---|---|---|
| U1 | R1, R2, R3 | AE1 |
| U2 | R8, R9 (enabling) | AE4 |
| U3 | R4, R5, R6, R7, R9 | AE2, AE3, AE4 |

## Implementation Units

### U1. Case-insensitive scheme parsing

**Goal:** Accept a lowercase auth scheme, and strip only the leading scheme rather than an occurrence of the scheme's characters anywhere in the header value.

**Requirements:** R1, R2, R3. Covers AE1.

**Dependencies:** none.

**Files:**
- `packages/demo/backend/src/middleware/auth.ts`
- `packages/demo/backend/src/middleware/auth.spec.ts` (new)

**Approach:** Replace the case-sensitive prefix check plus substring removal with a single case-insensitive anchored match that captures the token. Reject when the header is absent, uses a different scheme, or yields an empty token. This collapses the two current steps (the prefix guard and the separate parse helper) into one decision, so the guard and the extraction can no longer disagree about what counts as a valid header.

**Patterns to follow:** existing guard-clause style in the middleware, early `return` of a JSON error rather than throwing.

**Test scenarios:**
- Covers AE1. A lowercase scheme with an otherwise valid token authenticates instead of returning 401.
- A capitalized scheme continues to authenticate, proving no regression.
- Mixed-case scheme authenticates.
- A missing `Authorization` header returns 401.
- A non-Bearer scheme returns 401.
- A scheme with no token, and a scheme with only whitespace after it, both return 401.
- A token whose own characters contain the scheme name is extracted intact, proving only the leading scheme is stripped.

**Verification:** the new spec passes, and every existing route spec that sends a capitalized scheme still passes.

### U2. Extend test helper to stub identity resolution

**Goal:** Make the shared auth test helper cover identity-token resolution, and move the two specs carrying inline Privy mocks onto it, so U3's production change does not break existing coverage.

**Requirements:** R8, and enables R9. Covers AE4.

**Dependencies:** none. Must land before U3.

**Files:**
- `packages/demo/backend/src/controllers/routeTestUtils.ts`
- `packages/demo/backend/src/controllers/swap.routes.spec.ts`
- `packages/demo/backend/src/controllers/lend.routes.spec.ts`

**Approach:** Extend the shared helper so a mocked verified user also stubs the users resource, returning a user whose id matches the access token's user id by default. Give the helper a way to express a deliberate mismatch, since U3 needs to drive that case. Then delete the inline Privy client mocks in the swap and lend specs in favor of the shared helper, which is what the wallet and borrow specs already do.

This unit is pure test infrastructure: it changes no production file and every spec passes before and after, which keeps the commit independently green.

**Patterns to follow:** `mockVerifiedUser` in `packages/demo/backend/src/controllers/routeTestUtils.ts`, and its existing call sites in the wallet and borrow route specs. Per AGENTS.md "reuse before invention", extend the shared helper rather than adding a parallel one.

**Test scenarios:** `Test expectation: none -- test infrastructure only.` The existing route specs are the coverage: all four auth-sending specs must stay green with no assertion changes.

**Verification:** the full backend suite passes with no production file modified in this unit.

### U3. Bind identity token to access token at the boundary

**Goal:** Reject any request where the identity token's subject differs from the access token's subject, or where the identity token cannot be verified at all.

**Requirements:** R4, R5, R6, R7, R9. Covers AE2, AE3, AE4.

**Dependencies:** U2.

**Files:**
- `packages/demo/backend/src/middleware/auth.ts`
- `packages/demo/backend/src/middleware/auth.spec.ts`

**Approach:** After verifying the access token, resolve the identity token through the same Privy client and compare the resolved user's id against the access token's user id. On mismatch, reject as unauthenticated before calling the next handler. Resolve the identity token inside the existing failure-handling path so an unverifiable identity token produces the same unauthenticated response as an invalid access token, satisfying R6 without a second error branch.

Fail closed when the access token verification yields no user id. The SDK types it as always present, so absence is a fault rather than a supported state, and treating it as authenticated would leave exactly the hole this unit closes.

Keep the auth context shape unchanged so the wallet service and all controller call sites are untouched (R8). The identity token is consequently verified twice per request, once here and once during wallet resolution; both are local JWKS checks with no network call, which is the accepted cost recorded in the origin's key decisions.

The response body must not name either identity (R7). Server-side logging of the mismatch is fine and useful, but must not include either token, per AGENTS.md "never log or persist secrets".

**Test scenarios:**
- Covers AE2. A valid access token for user A with a valid identity token for user B returns 401, the next handler never runs, and the response body names neither user.
- Covers AE4. A valid access token and identity token for the same user passes through and the next handler runs.
- Covers AE3. An identity token that fails verification returns 401.
- An access token that fails verification still returns 401, proving no regression.
- A verified access token carrying no user id returns 401 rather than passing through.
- A missing identity-token header returns 401, preserving current behavior.
- The response body for a mismatch is byte-identical to the one for an invalid token, so the failure mode is not distinguishable by an attacker.
- The rate-limit key derived for a successful request is unchanged from current behavior.

**Verification:** the mismatch and scheme tests both fail when the production change is reverted; the full backend suite passes with it applied.

## Key Technical Decisions

- **Bind at the middleware, not in wallet resolution.** AGENTS.md calls for validating at boundaries rather than at every internal hop, and one check covers every authenticated route without touching a call site (see origin key decisions).
- **Compare the two `sub` claims directly.** Verified in research that both sides derive their id from the JWT `sub`, so no normalization or prefix handling is needed.
- **Fail closed on a missing access-token user id.** The SDK guarantees the field; absence is a fault. Failing open would preserve the gap.
- **Accept double verification of the identity token.** Both are local and cached, so the cost is negligible against changing the wallet service signature and its call sites.
- **Extend the shared test helper rather than patching four specs inline.** Also removes an existing inconsistency where two specs hand-rolled what a shared helper already provided.

## Scope Boundaries

- No CORS work. The demo matches origins exactly and sends no credentialed CORS, so PR 530's second defect has nothing to fix here.
- The dual-token protocol stays; no frontend change.
- No change to `packages/demo/backend/src/services/wallet.ts` or any controller signature.

### Deferred to Follow-Up Work

- The unauthenticated faucet route's rate-limit key uses the socket address, which collapses to one global bucket behind a proxy.
- The unused Privy cookie-key export in the middleware is dead code.

## Deferred to Implementation

- Exact naming of the new helper parameter and the middleware's comparison helper.
- Whether the mismatch rejection reads more clearly as an early return or as a thrown error caught by the existing handler. Both satisfy R5 and R7; pick whichever keeps the function within the repo's 20-line logic guidance.

## Risks

- **Every authenticated route now depends on identity-token resolution succeeding at the boundary.** If resolution were to make a network call, this would add latency to every request. Research confirmed it does not, but this is the assumption to re-check if the Privy SDK major version changes.
- **A binding check that compared mismatched id formats would reject all traffic.** Mitigated by confirming both sides read the JWT `sub`, and by the AE4 pass-through test which would fail loudly if the formats ever diverge.
