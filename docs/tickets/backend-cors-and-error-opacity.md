# Harden backend CORS null-origin/LOCAL_DEV and error-message opacity

| Field | Value |
| --- | --- |
| **Severity** | low |
| **Complexity** | 2 / 5 |
| **Domain** | backend |
| **Surface** | `app.ts` CORS resolver (null-origin TypeError, LOCAL_DEV reflects any localhost), `controllers/assets.ts` raw `error.message`, `middleware/actions.ts` empty catch, `config/actions.ts` `getPrivyClient` memoization |
| **Resolves findings** | F277, F278, F282, F293, F291 |
| **Candidate existing issue** | none |
| **Blocked by** | (none) |

> Demo backend, review-only. The fixes below are low-risk robustness / error-hygiene / information-disclosure hardening of the demo service (null-guard the CORS resolver, narrow a misconfig-widened CORS branch, route one error through the opaque helper, scope one try/catch, memoize one client). No architectural refactor of the demo backend is in scope.

## Problem

None of these is a fund-loss path, but together they degrade the demo backend's two carefully-built defensive contracts (opaque client errors, a tight CORS allowlist) and its observability:

- A request with no `Origin` header can 500 the CORS layer because the resolver calls string methods on the origin before null-checking it. An Origin-less request that should be a non-event (no `Allow-Origin` granted) instead throws inside the cors middleware (availability/robustness, the allowlist is not weakened).
- The CORS resolver reflects ANY `http://localhost:*` origin (arbitrary ports) with `Authorization` and `privy-id-token` allowed whenever `LOCAL_DEV` is true. A single stray `LOCAL_DEV=true` on a hosted/preview deploy lets any page a victim visits fire credentialed XHRs at the API and ride the user's tokens. Exploitation requires the deploy-time misconfig; the production allowlist itself is tight.
- `getAssets` returns the raw `error.message` in its 500 body, the one handler that breaks the opaque-error contract every sibling enforces through `errorResponse`. SDK-internal error text (internal addresses, RPC URLs, stack fragments) can surface to any caller. Read-only endpoint, no funds, but an information-disclosure inconsistency in an otherwise opaque surface.
- `actionsMiddleware` wraps `getActions(); await next()` in one try with an unbound empty `catch {}` that returns `'Actions SDK not initialized'` 500 for ANY downstream error, so real SDK/routing failures thrown before a handler's own try/catch are mislabeled as init failures and never reach the global `onError` structured logger (no stderr line). This can mask real production failures.
- `getPrivyClient()` constructs a fresh `PrivyClient` on every call, including on the hot auth path of every authenticated request (auth middleware + `getWallet`), instead of reusing a singleton. Throughput/robustness, compounds the no-rate-limit gap.

## Findings

- **F277** (low, info) — `packages/demo/backend/src/app.ts:96-117` (`:98`, `:109`): the CORS `origin` resolver calls `origin.startsWith('http://localhost:')` (`:98`) and `origin.match(/.../)` (`:109`) before any null-check; Hono sources `origin` from the request `Origin` header, and on the `undefined` path (older Hono versions for Origin-less requests) these string calls throw a `TypeError` that surfaces as a 500 from the cors layer. Does not weaken the allowlist.
- **F278** (low, info) — `packages/demo/backend/src/app.ts:96-117` (`:98-99`, `:119`): when `env.LOCAL_DEV` is true the resolver reflects back any origin matching `http://localhost:` (arbitrary ports) with `Authorization` and `privy-id-token` in `allowHeaders` (`:119`); a stray `LOCAL_DEV=true` on a hosted/preview deploy widens CORS to all of localhost, letting any page fire credentialed XHRs at the API. Production branch (`:103-114`) is correctly restrictive.
- **F282** (low, info) — `packages/demo/backend/src/controllers/assets.ts:16-23` (`:19`): `getAssets` returns `message: error instanceof Error ? error.message : 'Unknown error'` in its 500 body, breaking the opaque-error contract every sibling routes through `errorResponse` (`helpers/errors.ts:45-56`), which keeps the client message opaque and logs detail to stderr only so internal addresses / RPC URLs / stack fragments do not leak.
- **F293** (low, info) — `packages/demo/backend/src/middleware/actions.ts:5-12` (`:9`): `actionsMiddleware` wraps `getActions(); await next()` in a single try with an unbound empty `catch {}` that returns `'Actions SDK not initialized'` 500 for ANY error; the real error is never bound, never logged, and never reaches the global `onError` mapper, so every downstream error thrown before a handler's own try/catch is mislabeled and silently dropped from stderr.
- **F291** (low, info) — `packages/demo/backend/src/config/actions.ts:86-91`: `getPrivyClient()` does `return new PrivyClient(...)` with no memoization and is called per authenticated request at three sites (`middleware/auth.ts:24`, `services/wallet.ts:36`, plus init `config/actions.ts:24`), so each authenticated mutation constructs >=2 throwaway Privy clients on the hot auth path. Perf/throughput; compounds the no-rate-limit gap (F276).

## Root cause

The CORS resolver and the assets controller were written without conforming to the backend's two existing defensive contracts: the resolver assumes `origin` is always a non-empty string and trusts a single `LOCAL_DEV` bool for the most permissive branch, and `getAssets` predates (or simply diverged from) the `errorResponse` opaque-error helper that `helpers/errors.ts:45-56` standardizes. `actionsMiddleware` over-scopes its try (it should guard only the init check, not all of `await next()`) and discards the error binding, so it both mislabels and silences downstream failures. `getPrivyClient()` was written as a plain constructor rather than the lazy-singleton pattern `getActions()` already uses (`config/actions.ts:78-84`), so the hot auth path re-instantiates the client.

## Recommended approach

Review-only, demo backend — five surgical changes, no architectural refactor. All five are independent and additive.

1. **Null-guard the CORS resolver before any string call (F277).** Add `if (!origin) return null` (or `const o = origin ?? ''`) at the top of the `origin` callback before `startsWith`/`match`. One-line robustness fix; a missing/unknown origin still gets no `Allow-Origin` header, so the allowlist is unchanged. Backlog-tier if the pinned Hono version already coerces the absent header to `''`, but the guard is cheap and version-independent.

2. **Fail-closed the LOCAL_DEV localhost reflection against misconfig (F278).** Keep the production allowlist as-is. Assert at startup that `LOCAL_DEV` is false for any non-local `NODE_ENV` (refuse to boot, or hard-disable the localhost branch, when a hosted env has `LOCAL_DEV=true`), and/or scope the localhost reflection to an explicit dev port rather than any `http://localhost:*`. This makes a stray `LOCAL_DEV=true` on a hosted deploy unable to widen CORS to all of localhost. The startup assertion is the higher-leverage half (it turns a silent credential-exposure into a boot failure).

3. **Route the assets catch through `errorResponse` (F282).** Replace the inline `c.json({ error, message: error.message }, 500)` with `errorResponse(c, 'Failed to get supported assets', 500, error)` (already imported elsewhere from `helpers/errors.ts`), so the client gets the opaque message and the detail is logged to stderr only, matching every sibling controller.

4. **Scope the actions middleware try and bind the error (F293).** Call `getActions()` (the init check) inside a try that binds the error and logs it; move `await next()` outside that try so downstream errors propagate to the global `onError` handler and get the same `mapSdkError` + `errorResponse` structured logging as every other 500. The init-failure case then logs its real cause instead of silently returning a mislabeled 500.

5. **Memoize the PrivyClient (F291).** Return a lazy singleton from `getPrivyClient()` using the same pattern `getActions()` already uses (`config/actions.ts:78-84`), so auth verification and wallet lookup reuse one client instead of constructing a fresh one per request. Pure perf/robustness; no behavior change for callers.

## Affected files

- `packages/demo/backend/src/app.ts:96-117` — CORS `origin` resolver: unguarded `origin.startsWith` (`:98`) / `origin.match` (`:109`) and the `LOCAL_DEV` localhost-reflection branch (`:98-99`); `allowHeaders` includes `Authorization` / `privy-id-token` (`:119`).
- `packages/demo/backend/src/controllers/assets.ts:16-23` (`:19`) — `getAssets` returns raw `error.message` in the 500 body.
- `packages/demo/backend/src/middleware/actions.ts:5-12` (`:9`) — `actionsMiddleware` over-scoped try with unbound empty `catch {}`.
- `packages/demo/backend/src/config/actions.ts:86-91` — `getPrivyClient()` constructs a fresh `PrivyClient` per call (singleton pattern available at `:78-84`).
- `packages/demo/backend/src/helpers/errors.ts:45-56` — `errorResponse` opaque-error helper that F282 should conform to (reference, not edited beyond what item 3 needs).

## Acceptance criteria / tests

- A request with no `Origin` header does not 500 the CORS layer: the resolver returns null (no `Allow-Origin` header) without throwing. A test invokes the `origin` callback with `undefined` and asserts it returns null rather than throwing.
- With a hosted/non-local `NODE_ENV` and `LOCAL_DEV=true`, the app either refuses to boot or the `http://localhost:*` branch is disabled; a test asserts a `localhost` origin is NOT reflected in that configuration. With `LOCAL_DEV=true` and a local `NODE_ENV`, an allowed dev origin is still reflected.
- The production allowlist is unchanged: the three exact production origins and the deploy-preview regex still resolve; an unknown origin still returns null.
- `GET /supported-assets` on the error path returns only the opaque `{ error: 'Failed to get supported assets' }` body (no `message` / raw `error.message`), and the detail is logged to stderr. A test forcing `getSupportedAssets` to throw asserts no `error.message` text appears in the response body.
- A downstream error thrown by a handler (after `getActions()` succeeds) reaches the global `onError` mapper and is logged to stderr, rather than being collapsed into `'Actions SDK not initialized'`. A test throwing from a route asserts the mapped error (not the init message) and a stderr log line. A genuine init failure still returns its message and now logs its bound cause.
- `getPrivyClient()` returns the same instance across calls: a test calling it twice asserts referential equality, and the three call sites (`auth.ts:24`, `wallet.ts:36`, `actions.ts:24`) share one client.

## Notes

- Review-only, demo backend: keep changes to a null-guard, a misconfig assertion, an error-helper reroute, a try-scope fix, and a memoization. Do not restructure the demo backend.
- F278 is the only one of the five with a (deploy-time) security angle; it is fail-closed against a `LOCAL_DEV` misconfig rather than a code-path exploit. The production CORS allowlist is already correct, so the fix hardens the misconfig blast radius, not a live hole.
- F282 should conform to the `errorResponse` contract in `helpers/errors.ts:45-56`; that helper is the canonical opaque-error pattern (recorded separately as F300, whose maintainability note on `SDK_ERROR_MAPPINGS` instanceof-order is out of scope here).
- F291 compounds F276 (no rate limit): per-request `PrivyClient` construction is a throughput cost on the same unbounded auth path. Memoizing it is independent of the rate-limit work but reduces the per-request cost on that surface.
- Out of scope: RPC-trust hardening (integrators bring their own RPC, a documented assumption), and any change to the production CORS allowlist contents.
