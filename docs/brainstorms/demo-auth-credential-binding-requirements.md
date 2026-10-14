---
date: 2026-07-29
topic: demo-auth-credential-binding
---

# Demo Backend Auth: Credential Binding and Scheme Parsing

## Summary

Two hardening changes at the demo backend's auth boundary: accept the `Bearer` scheme case-insensitively, and reject any request whose identity token resolves to a different user than the access token was issued for. Both are enforced in one place so every authenticated route is covered.

## Problem Frame

An audit of `ecosystem-private` PR 530 (an unauthenticated cross-tenant auth bypass in the Superchain Dev Console API) checked whether the Actions demo shares the same defects. It does not: the demo has no session cache to poison, no session cookie to ride, matches CORS origins exactly rather than by substring, and never sends credentialed CORS. The two real defects from that PR do not reach this codebase.

The audit did surface two smaller issues in `packages/demo/backend/src/middleware/auth.ts`.

The first is the same conformance nit PR 530 fixed. The middleware matches the auth scheme with a case-sensitive prefix check, so a client sending a lowercase scheme is rejected even though RFC 9110 defines the scheme as case-insensitive. It fails closed, so it is a correctness and interoperability problem rather than a security one.

The second is structural. Every authenticated request carries two separate credentials: an access token, and an identity token that determines which wallet the request operates on. Both are cryptographically verified, the access token at the boundary and the identity token during wallet resolution, so neither is forgeable. But nothing checks that they describe the same user. Anyone holding their own valid access token plus some other user's identity token would operate on that other user's wallet. Both are bearer secrets held in the victim's browser, so obtaining the identity token is roughly as hard as obtaining the access token, which is why this is defense in depth rather than a live bypass. The cost of the gap is that the demo's authorization story depends on an unstated coupling between two credentials that the code never enforces.

## Requirements

**Auth scheme parsing**
- R1. The `Authorization` header's scheme is matched case-insensitively, so a lowercase scheme is accepted exactly like a capitalized one.
- R2. Token extraction strips only the leading scheme and its separating whitespace, not an occurrence of the scheme's characters elsewhere in the header value.
- R3. A request with a missing `Authorization` header, a different scheme, or an empty token is still rejected as unauthenticated.

**Credential binding**
- R4. The identity token is verified at the auth boundary, and the user it resolves to is compared against the user the access token was issued to.
- R5. When the two identities differ, the request is rejected as unauthenticated before any route handler runs.
- R6. When the identity token cannot be verified at all, the request is rejected as unauthenticated at the same boundary rather than surfacing later during wallet resolution.
- R7. The rejection response discloses neither the expected nor the observed identity.

**Coverage and blast radius**
- R8. Every route already behind the auth boundary inherits the binding check with no per-route change. The wallet service and all controller call sites keep their current signatures.

**Tests**
- R9. Each defect ships a regression test that fails against the current code and passes after the fix.

## Acceptance Examples

- AE1. **Covers R1, R2.** Given a valid access token and identity token for the same user, sent with a lowercase scheme, when the request hits an authenticated route, it is authenticated normally instead of rejected.
- AE2. **Covers R4, R5, R7.** Given a valid access token issued to user A paired with a valid identity token for user B, when the request hits an authenticated route, it is rejected as unauthenticated, no wallet is resolved, and the response names neither user.
- AE3. **Covers R6.** Given a valid access token and an identity token that fails verification, when the request hits an authenticated route, it is rejected as unauthenticated at the boundary.
- AE4. **Covers R4, R8.** Given a valid access token and identity token for the same user, when the request hits an authenticated route, it proceeds exactly as it does today.

## Success Criteria

- A caller holding a valid access token of their own cannot operate on another user's wallet by supplying that user's identity token.
- Clients sending a lowercase auth scheme stop receiving a spurious rejection.
- Both regression tests fail on the current code and pass after the change, the existing route specs still pass, and `pnpm typecheck && pnpm lint && pnpm test` is clean.

## Scope Boundaries

- No CORS work. The demo matches origins exactly and sends no credentialed CORS, so PR 530's second defect and its origin length cap have nothing to fix here.
- The dual-token protocol stays. Collapsing the two credentials into one was considered and rejected: it would add a Privy API call per request and require a frontend change.
- No change to the wallet service or controller signatures. Threading a verified user object through the auth context was considered and rejected as too wide for the finding.
- The unauthenticated faucet route's proxy-blind rate-limit key and the unused Privy cookie-key export are both real, both noted in the audit, and both out of scope here.

## Key Decisions

- Enforce at the auth middleware rather than inside wallet resolution: `AGENTS.md` calls for validating at boundaries rather than at every internal hop, and one boundary check covers every authenticated route without touching a single call site.
- Accept verifying the identity token twice per request, once at the boundary and once during wallet resolution: both are local verifications against a cached JWKS with no network call, which is a smaller cost than changing the wallet service signature and its eleven call sites.
- Leave the identity token in the auth context as-is, so no controller and no service changes.

## Dependencies / Assumptions

- Access-token verification returns the authoritative user id for that token, and identity-token resolution verifies the token against the app JWKS before yielding a user with a stable id. Both confirmed against the installed Privy Node SDK (`@privy-io/node` 0.3.0), where the users-by-identity-token call is a thin wrapper over identity-token verification rather than a REST fetch.
- Identity-token verification reuses a cached JWKS, so the added boundary check issues no network request. Worth confirming during planning if request latency is a concern.
- The existing route specs mock only access-token verification, so they will need identity resolution mocked once the boundary starts using it.
