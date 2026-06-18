# Review Pass 12 — Backend Fund-Safety (senior-backend, review-only)

**Pass:** 12
**Skill / lens:** senior-backend, fund-safety
**Surfaces:** backend (`packages/demo/backend/src`: router, middleware/auth, config/env, controllers, services, app/CORS, helpers/errors)
**Mode:** review-only (demo backend; no code changes)

## Summary

This is the first pass to cover the demo backend surface. The existing ledger (F001–F271) is entirely SDK and test-harness findings, so every finding here is net-new (no dedup against prior rows; several incoming reviewer reports describe the *same* backend issue and were consolidated).

Four independent reviewer reports converged on the same backend picture: the borrow/lend/swap controllers are well-validated (market kind/marketId re-resolved server-side from an allowlist rather than trusted from the path, `walletAddress` derived from the idToken not the body on the mint path, zod strictObject schemas with amount-width caps, SDK errors mapped to opaque client messages). The dominant gaps are auth/fund-safety, not param-shape.

**Counts by severity (consolidated, 11 findings):**
- high: 1 (F272 — unauthenticated faucet drip)
- medium: 4 (F273 env Anvil-key default, F274 auth-token binding, F275 faucet eligibility TOCTOU/no-rate-limit, F276 no rate/body-size limit on fund endpoints)
- low: 6 (F277 CORS throws on undefined origin, F278 CORS localhost reflection under LOCAL_DEV, F279 demo USDC mint no rate-limit/float path, F280 swap inherits SDK gaps, F281 lend inherits SDK F008, F282 assets.ts leaks error.message)

**Notable highlights:**
- **F272 (high, fund-loss):** `POST /wallet/eth` is the only `/wallet/*` mutation route registered WITHOUT `authMiddleware`; it drips ETH from the faucet admin signer to a caller-supplied address, gated only by a trivially-bypassable on-chain `balance == 0` check. Unauthenticated, unbounded faucet/sponsorship drain.
- **F273 (medium, malicious-sign):** `FAUCET_ADMIN_PRIVATE_KEY` hard-defaults (via `default`, applies in production — unlike sibling `devDefault` secrets) to the well-known Anvil account-0 key, and is also committed in `.env.example`. Currently dead/unused, so a latent foot-gun rather than live exposure.
- **F274 (medium, correctness):** `authMiddleware` verifies the Bearer access token but selects the signing wallet from a separate, **unverified** `privy-id-token` header; the two tokens are never bound to the same Privy user.

Severity note on F273: incoming reports ranged from low/info to medium/malicious-sign. Two of four reviewers rated it medium and articulated the production-applicable `default` (vs `devDefault`) as the sharp edge; per Rule 7 (pick the more-tested/sharper framing, don't average) the consolidated severity is **medium**, with the no-live-consumer caveat recorded in the detail.

---

## Findings (grouped by surface)

### Surface: backend — auth / fund endpoints

#### F272 — `/wallet/eth` faucet drip has no auth; faucet admin signer drainable by anyone
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/router.ts:57` (handler `controllers/wallet.ts:158-180`; signer `services/faucet.ts:31-95`)
- **Severity:** high
- **Class:** fund-loss
- **Dedup status:** new (consolidates 4 incoming reports of the same issue)
- **Detail:** Every other state-changing `/wallet/*` route is registered with `authMiddleware` (router.ts:44-56, 61-104) — `getBalance`, `lend-position`, `getWallet`, and the sibling `/wallet/usdc` mint. `router.post('/wallet/eth', walletController.dripEthToWallet)` (router.ts:57) is the lone exception with NO auth. The handler reads `walletAddress` straight from the request body (`DripEthToWalletRequestSchema`, wallet.ts:34-38) and passes it to `faucetService.dripEthToWallet`, which signs a `drip(...)` EIP-712 proof with the faucet admin / auth-module key (`FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY`, faucet.ts:82-95) and submits it via the admin smart wallet's `sendBatch`. The only abuse gate is `isWalletEligibleForFaucet` (faucet.ts:31-46), which returns true for any address whose on-chain balance is 0 (the intended second guard is an unimplemented TODO at faucet.ts:42). The on-chain Faucet enforces a per-id `keccak256(walletAddress)` cooldown (abis/ethFaucet.ts:132-151), which caps per-address velocity but not the cross-address drain (every fresh address is a fresh id). The frontend caller sends no auth headers either (frontend/src/api/actionsApi.ts:143-156), confirming the gap is real, not merely unenforced. By contrast `/wallet/usdc` is auth-gated and mints only to the caller's own derived wallet.
- **Exploit / repro:** `curl -X POST $BACKEND/wallet/eth -H 'content-type: application/json' -d '{"walletAddress":"<any fresh zero-balance addr>"}'` with no `Authorization` / `privy-id-token` header returns a `userOpHash` and drips faucet ETH. Sweep the ETH out (balance back to 0), wait out the on-chain faucet TTL, and re-drip; or fan out across unlimited fresh attacker-controlled addresses to drain the admin wallet's ETH and burn the paymaster sponsorship budget.
- **Recommendation:** Add `authMiddleware` to the `/wallet/eth` route (matching `/wallet/usdc` and the lend/borrow/swap mutation routes) and derive the drip recipient from the authenticated wallet (`walletService.getWallet(idToken).address`) instead of trusting the body `walletAddress`, so a request can only fund the authenticated user's own wallet. Leave broader per-IP/per-identity rate limiting and a daily cap as backlog (see F275/F276). One-line middleware insertion is the surgical fix.
- **suggestRefactor:** false
- **Candidate issue:** none

#### F274 — auth verifies access token but binds the signing wallet to a separate, unverified `privy-id-token`
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/middleware/auth.ts:9-36` (consumer `services/wallet.ts:34-67`)
- **Severity:** medium
- **Class:** correctness
- **Dedup status:** new (consolidates 3 incoming reports; severity medium per the two reviewers who rated it medium)
- **Detail:** `authMiddleware` calls `privy.utils().auth().verifyAuthToken(accessToken)` on the value parsed from `Authorization: Bearer ...` (auth.ts:21-25), but then stores the raw, UNVERIFIED `privy-id-token` header into `AuthContext.idToken` (auth.ts:11, 26-29). Every downstream wallet derivation uses that idToken via `walletService.getWallet(idToken)` → `privyClient.users().get({ id_token: idToken })` (wallet.ts:34-67), which selects the embedded wallet whose smart wallet then signs lend/borrow/swap/mint transactions. The verified access token (identity A) and the unverified id token (identity B) are independent strings and are never checked to belong to the same Privy user. A caller holding any one valid access token (to clear the verify gate) plus some other user's id token would transact against the second user's wallet. The linchpin is whether `users().get({ id_token })` itself cryptographically validates the id token's signature/audience; the backend performs no binding or verification of its own.
- **Exploit / repro:** Send `Authorization: Bearer <any valid access token>` together with `privy-id-token: <victim's id token>`. `verifyAuthToken` passes on the access token; `getWallet` derives the victim's wallet from the id token; subsequent `/lend`, `/borrow`, `/swap` mutations act on the victim's wallet. (Depends on Privy SDK internals for whether `get({id_token})` verifies the token — recorded as a deliberate same-subject binding gap pending that confirmation.)
- **Recommendation:** After `verifyAuthToken`, resolve the user/subject from the verified access token and assert it matches the user resolved from the id token (or verify the id token's signature/audience directly and assert `accessToken.userId === idToken.userId`). Do not treat an unverified header as the wallet selector.
- **suggestRefactor:** false
- **Candidate issue:** none

### Surface: backend — config / env / secrets

#### F273 — `FAUCET_ADMIN_PRIVATE_KEY` hard-defaults to the well-known Anvil key (production-applicable `default`), and is dead/unused
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/config/env.ts:50-53` (also `.env.example:12`, `app.spec.ts:10`)
- **Severity:** medium
- **Class:** malicious-sign
- **Dedup status:** new (consolidates 4 incoming reports; severity reconciled to medium per Rule 7 — see summary note)
- **Detail:** `FAUCET_ADMIN_PRIVATE_KEY` is declared with `str({ default: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' })` — the canonical Hardhat/Anvil account #0 private key, publicly known across the entire EVM tooling ecosystem, and the same value is committed in `.env.example:12`. Unlike sibling secrets which use `devDefault` (applied only in dev/test) — `FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY: str({ devDefault: 'dummy' })` (env.ts:66), `PRIVY_APP_SECRET: str({ devDefault: 'dummy' })` (env.ts:46) — this one uses a hard `default`, so in production (non-dev) an unset env var silently resolves to the compromised Anvil key instead of failing startup. The variable is currently dead: a grep of backend `src/` shows no runtime consumer (the active faucet signer is `FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY`, used in faucet.ts:82-83, 125-127). So there is no live signing exposure today; the risk is the foot-gun pattern — a globally-known signing key baked in as a production-applicable default in the admin-key slot, plus a committed key teaching the wrong convention, where any future code wiring this var to a signer would silently sign with a key every attacker already holds and the missing-env failsafe would never fire.
- **Exploit / repro:** Static. Start the service in a prod env with `FAUCET_ADMIN_PRIVATE_KEY` unset → `env.FAUCET_ADMIN_PRIVATE_KEY` resolves to the Anvil key, whose private key is public. No live consumer found, so info-bounded today.
- **Recommendation:** Either delete the unused `FAUCET_ADMIN_PRIVATE_KEY` declaration entirely (zero consumers), or change `default` to `devDefault` / required `str()` so production startup fails loudly when it is unset, matching every other secret in this file and the `SESSION_SIGNER_PK` pattern (env.ts:60). Remove the concrete key from `.env.example` (leave it blank like `SESSION_SIGNER_PK` / `FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY`). Never ship a known-compromised key as a value that can leak into a non-dev environment.
- **suggestRefactor:** false
- **Candidate issue:** none

### Surface: backend — faucet / mint services & rate limiting

#### F275 — faucet eligibility is a racy `balance == 0` check with no per-recipient accounting; drainable by sweep-and-re-request and by concurrent requests
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/services/faucet.ts:31-46,48-95`
- **Severity:** medium
- **Class:** fund-loss
- **Dedup status:** new (consolidates 2 incoming reports — low "sweep-and-re-request" + medium "TOCTOU"; medium adopted as it includes the race)
- **Detail:** `isWalletEligibleForFaucet` (faucet.ts:31-46) reads `getBalance` and returns true iff `balance == 0`; the intended second guard (don't fund wallets that already hold a position) is an unimplemented TODO at faucet.ts:42-43. Then `dripEthToWallet` (faucet.ts:48-95) signs and sends the drip. Two compounding gaps: (a) no atomicity between the balance read and the drip, so N concurrent requests for the same fresh address all observe balance 0 and all drip (TOCTOU); and (b) no per-address/per-user accounting beyond live balance, so a recipient can be drained back to 0 (or use many fresh addresses) and re-qualify indefinitely. Combined with the missing auth on the route (F272) and the absence of any rate limiting in the backend, the drain is unbounded; even with auth restored, the race lets a single user multiply drips. The faucet contract's own nonce/auth-module replay protection does not cap distinct nonces, so the off-chain rate gate must live here.
- **Exploit / repro:** Loop: `POST /wallet/eth {walletAddress: A}` → sweep A to B → A balance back to 0 → `POST /wallet/eth {walletAddress: A}` again; no cooldown blocks the repeat. Or fire several concurrent requests for the same brand-new address; each passes the `balance == 0` gate before any drip confirms, yielding multiple drips for one address.
- **Recommendation:** Add a server-side per-recipient (and per-user) drip cooldown / lifetime cap that is checked-and-recorded atomically before signing, rather than relying solely on a live on-chain balance read. Gate the route behind auth (F272) so drips are at least bound to authenticated demo users.
- **suggestRefactor:** false
- **Candidate issue:** none

#### F276 — no rate limiting or request-body-size limit on faucet / mint / execute endpoints
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/router.ts:44-104` (app wiring `app.ts:89-135`)
- **Severity:** medium
- **Class:** infra
- **Dedup status:** new
- **Detail:** Neither `createApp` (app.ts:89-135) nor the router applies any rate-limiting or body-size middleware (a grep for `rateLimit`/`limiter`/`throttle` returns nothing). The fund-touching endpoints — `/wallet/eth` (unauth faucet drip), `/wallet/usdc` (mints 100 USDC_DEMO per call, wallet.ts:127), `/swap/execute`, `/borrow/position/*`, `/lend/position/*` — can be hammered as fast as the bundler accepts. For `/wallet/eth` this directly compounds the unbounded faucet drain (F272/F275); for `/wallet/usdc` an authenticated user can mint unbounded demo USDC and burn bundler sponsorship; for the SDK-executing routes it permits spam that ties up the session signer and sponsorship budget. `AmountByRaw.max(78)` (schemas.ts:48) caps a single amount string but nothing caps request rate or volume.
- **Exploit / repro:** Loop `POST /wallet/usdc` with a valid token, or `POST /wallet/eth` with fresh addresses, with no server-side throttle.
- **Recommendation:** Add a lightweight per-IP / per-authenticated-user rate limiter (and a small JSON body-size cap) in `createApp`, at least on the faucet/mint/execute routes. Low-risk middleware addition, not an architectural change.
- **suggestRefactor:** false
- **Candidate issue:** none

#### F279 — demo USDC mint is auth-gated and server-fixed but has no rate limit, and builds the amount via a fragile `parseFloat` float path
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/services/wallet.ts:117-129` (`:127`); `services/usdcDemo.ts:20-50`; route `router.ts:52-56`, `controllers/wallet.ts:138-153`
- **Severity:** low
- **Class:** info
- **Dedup status:** new (consolidates 2 incoming reports — "no rate limit" + "fragile parseFloat")
- **Detail:** `POST /wallet/usdc` is correctly auth-gated and mints to the caller's own resolved wallet (`mintDemoUsdcToWallet` hardcodes 100 USDC to `wallet.address`), and USDC_DEMO is a permissionless mintable mock with no real value (usdcDemo.ts:8), so fund-loss exposure is essentially nil. Two notes: (1) the amount is computed as `BigInt(Math.floor(parseFloat('100') * 1000000))` (wallet.ts:127) — the same float-truncation pattern flagged elsewhere in the ledger for funding helpers; harmless here because the literal is exact, but a foot-gun if this constant is ever made request-driven; (2) there is no per-user rate limit on a mint that consumes gas-sponsored UserOperations, so an authenticated user can loop the endpoint to burn bundler sponsorship budget. The mint calls SDK `sendBatch` with raw encoded calldata (usdcDemo.ts:21-34), relying on the raw-send SDK surface already noted unsafe in prior passes (review-pass-03 send/sendBatch).
- **Exploit / repro:** n/a for fund-safety (amount is a server constant bound to the auth-resolved wallet). Sponsorship-budget angle: loop `POST /wallet/usdc` with a valid token.
- **Recommendation:** Backlog: add a per-session cooldown on the demo mint/faucet endpoints if bundler sponsorship cost becomes a concern (overlaps F276). Optionally replace the `parseFloat('100')` round-trip with an integer constant (`100_000_000n`) to remove the float path. Keep the amount server-derived; never accept a client amount here. No fund-safety change required.
- **suggestRefactor:** false
- **Candidate issue:** none

### Surface: backend — CORS / app wiring

#### F277 — CORS origin resolver calls string methods on a possibly-undefined origin; throws (500) on requests with no Origin header
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/app.ts:96-117`
- **Severity:** low
- **Class:** info
- **Dedup status:** new
- **Detail:** The CORS `origin` resolver unconditionally calls `origin.startsWith('http://localhost:')` (app.ts:98) and `origin.match(/.../)` (app.ts:109) on the `origin` argument. Hono sources this from the request `Origin` header, absent for same-origin and many non-browser requests; depending on Hono version the callback receives `undefined` (older) or `''` (newer). On the `undefined` path these calls throw a TypeError surfacing as a 500 from the cors layer for any request lacking an Origin header. This is an availability/robustness nuance, not fund-safety, and does not weaken the allowlist (a missing/unknown origin still cannot get an Allow-Origin header).
- **Exploit / repro:** Static: app.ts:98/109 call string methods before any null-check; a request with no Origin header on the `undefined` Hono path throws.
- **Recommendation:** Guard with `if (!origin) return null` (or `const o = origin ?? ''`) at the top of the resolver before any string method call. One-line hardening; treat as backlog if Hono's pinned version already coerces to `''`.
- **suggestRefactor:** false
- **Candidate issue:** none

#### F278 — CORS reflects any `localhost:*` origin (with Authorization / privy-id-token) whenever `LOCAL_DEV` is true
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/app.ts:96-117` (`:98-99`, `:119`)
- **Severity:** low
- **Class:** info
- **Dedup status:** new
- **Detail:** When `env.LOCAL_DEV` is true the CORS origin callback reflects back any origin matching `http://localhost:` (app.ts:98-99) — arbitrary ports — with `Authorization` and `privy-id-token` allowed (app.ts:119). For a local-only demo this is fine, but `LOCAL_DEV` is a single bool env var; if it is ever left true on a hosted/preview deploy, any page a victim visits that fires an XHR at localhost (or a malicious local app) can ride the user's Authorization/privy-id-token against the API. Production origins are a tight allowlist (good). Info because exploitation requires the `LOCAL_DEV` misconfiguration — a deploy-time concern rather than a code bug.
- **Exploit / repro:** With `LOCAL_DEV=true`, a request with `Origin: http://localhost:9999` is reflected and allowed; the production branch (app.ts:103-114) is correctly restrictive.
- **Recommendation:** Keep the production allowlist. Consider asserting `LOCAL_DEV` is false for any non-local `NODE_ENV` at startup, or scoping the localhost reflection to an explicit dev port, so a stray `LOCAL_DEV=true` on a hosted env cannot widen CORS to all of localhost.
- **suggestRefactor:** false
- **Candidate issue:** none

### Surface: backend — controllers (SDK-inherited & error hygiene)

#### F280 — swap controller forwards raw caller params into `wallet.swap.execute`, inheriting known-unsafe SDK getQuote-then-execute / per-provider-blocklist gaps
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/services/swap.ts:95-102`; `controllers/swap.ts:98-161`
- **Severity:** low
- **Class:** info
- **Dedup status:** new (relates to prior SDK findings F262 / F186; backend-locus, so new not refines)
- **Detail:** `controllers/swap.ts` validates shape (positive amountIn, address regex, supported chainId, slippage clamped to [0, 0.5]) and then `services/swap.ts:95-102` calls `wallet.swap.execute({ amountIn, assetIn, assetOut, chainId, slippage, provider })` with caller values resolved only through `resolveAsset` against the configured allowlist. `/swap/quote` (swap.ts:98-125) returns the SDK's pre-built quote/execution data and `/swap/execute` re-derives a fresh quote inside `wallet.swap.execute` from caller params, with no binding between the priced quote and the executed calldata, and no backend-side cross-check that the executed pair/provider matches what the user was quoted. The backend leans on the SDK's getQuote-then-execute and per-provider allowlist semantics — the same surfaces F262 (per-provider blocklist defeated via a sibling provider) and F186 / the raw send/sendBatch findings already record as unsafe. The slippage clamp blunts the slippage leg but the recipient-ignored V4 calldata and the slippage≥1.0 negative-min-out path live below this controller. Recorded as info per the review-only directive; the backend adds no compensating control.
- **Exploit / repro:** Inherits SDK behavior; see F262 / F186. Static: `services/swap.ts:95-102` re-quotes from raw params inside execute with no binding to the `/swap/quote` price.
- **Recommendation:** No backend code change in isolation; track against the SDK getQuote/execute and blocklist findings (F262, F186, and the raw send/sendBatch entries). If a defense-in-depth check is cheap, assert the resolved `(assetIn, assetOut, provider)` is in the swap allowlist before calling execute. When the SDK exposes a quote-binding/execute-from-quote API, have the backend pass the priced quote through rather than re-quoting on execute.
- **suggestRefactor:** false
- **Candidate issue:** #334 (also relates #373)

#### F281 — lend controller forwards caller `tokenAddress` + `marketId` to the SDK with no server-side token/market binding (relies on SDK F008)
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/controllers/lend.ts:61-118` (service `services/lend.ts:42-52`)
- **Severity:** low
- **Class:** info
- **Dedup status:** new (relates to prior SDK finding F008; backend-locus, so new not refines)
- **Detail:** `openPosition` / `closePosition` (lend.ts:61-118) accept `tokenAddress` and `marketId.{address,chainId}` independently from the request body (schema lines 20-44) and pass both into `lendService` → `wallet.lend.openPosition({ amount, asset, marketId })` (services/lend.ts:42-52). The backend does not assert that the resolved `asset` (from `resolveAsset`, utils/assets.ts:10-20) is the market's underlying; that binding is left to the SDK, where `openPosition` is the path filed as F008 (open does not validate caller asset vs market underlying, yielding a max-mode approval to the pool/vault on a mismatched token). Unlike the borrow controller, which re-resolves `kind`/market from an allowlist server-side (services/borrow.ts:85-106), the lend controller has no equivalent server-side market/asset reconciliation. Recorded as info because the missing validation is SDK-owned (F008) and the demo lend markets are allowlisted in config; flagged so the backend gap is visible.
- **Exploit / repro:** Static: lend.ts body schema accepts `tokenAddress` and `marketId` independently; no cross-check before the SDK call.
- **Recommendation:** When F008 is fixed in the SDK this resolves; optionally mirror the borrow controller's pattern and resolve the lend asset from the configured market allowlist server-side rather than trusting the body `tokenAddress` against an independent `marketId`.
- **suggestRefactor:** false
- **Candidate issue:** #334

#### F282 — `assets` controller leaks raw `error.message` to clients, breaking the opaque-error convention used everywhere else
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/controllers/assets.ts:16-23` (`:19`)
- **Severity:** low
- **Class:** info
- **Dedup status:** new
- **Detail:** `getAssets` (assets.ts:9-24) returns `message: error instanceof Error ? error.message : 'Unknown error'` in its 500 body. Every other handler routes 500s through `errorResponse` (helpers/errors.ts:45-56), which deliberately keeps the client message opaque and logs the raw error to stderr only, precisely so internal addresses / RPC URLs / stack fragments do not leak (see the `mapSdkError` comment, errors.ts:80-87). This one endpoint breaks that contract and can surface SDK-internal error text to any caller. Low severity (read-only endpoint, no funds), but an information-disclosure inconsistency in an otherwise carefully opaque error surface.
- **Exploit / repro:** Static: assets.ts:19 passes `error.message` into the JSON response body.
- **Recommendation:** Route this catch through `errorResponse(c, 'Failed to get supported assets', 500, error)` like the sibling controllers so the client gets an opaque message and the detail is logged server-side only.
- **suggestRefactor:** false
- **Candidate issue:** none

---

## Dedup ledger summary

11 NEW findings assigned F272–F282. No REFINES, no DUP (backend surface had zero prior ledger coverage). Several incoming per-reviewer findings were consolidated:
- F272 ← 4 reports (unauthenticated `/wallet/eth`)
- F273 ← 4 reports (`FAUCET_ADMIN_PRIVATE_KEY` Anvil default)
- F274 ← 3 reports (access-token vs unverified id-token binding)
- F275 ← 2 reports (faucet eligibility race / sweep-and-re-request)
- F279 ← 2 reports (demo USDC mint: no rate-limit + parseFloat path)
- F276, F277, F278, F280, F281, F282 ← 1 report each
