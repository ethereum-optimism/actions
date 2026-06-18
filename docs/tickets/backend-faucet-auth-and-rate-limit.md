# Authenticate the ETH faucet and add per-recipient accounting + rate limiting

| Field | Value |
| --- | --- |
| **Severity** | high |
| **Complexity** | 3 / 5 |
| **Domain** | backend |
| **Surface** | `router.ts` POST `/wallet/eth` (no `authMiddleware`), `faucet.ts` racy `balance == 0` eligibility, no rate-limit / body-size middleware in `createApp` |
| **Resolves findings** | F272, F275, F276, F279 |
| **Candidate existing issue** | none |
| **Blocked by** | (none) |

> Demo backend, review-only. The fixes below are low-risk fund-safety / availability hardening of the demo service (auth-gate one route, add an accounting gate, add throttle middleware). No architectural refactor of the demo backend is in scope.

## Problem

The demo backend signs an admin faucet drip and several gas-sponsored UserOperations on behalf of the demo. Three compounding gaps let an unauthenticated (or single authenticated) caller drain faucet ETH and burn bundler sponsorship budget without bound:

- **`POST /wallet/eth` is the only `/wallet/*` mutation registered without `authMiddleware`** (`router.ts:57`). Every sibling state-changing route — `/wallet/usdc`, `/wallet/balance`, the lend/borrow/swap mutations — is auth-gated. The faucet handler reads `walletAddress` straight from the request body and signs a `drip(...)` proof with the faucet auth-module admin key, so a request with no `Authorization` / `privy-id-token` header still returns a `userOpHash` and moves admin-wallet ETH to a caller-chosen address.

- **The only abuse gate is a racy, bypassable on-chain `balance == 0` read** (`faucet.ts:38-46`) with no per-recipient accounting. The read and the drip are not atomic (N concurrent requests for one fresh address all observe `balance == 0` and all drip — TOCTOU), and any address swept back to zero re-qualifies indefinitely. The intended second guard is an unimplemented TODO (`faucet.ts:42-43`). Even with auth restored, the race lets one user multiply drips, and fresh addresses re-qualify forever.

- **No rate-limit or request-body-size middleware exists anywhere** (`grep` for `rateLimit`/`limiter`/`throttle`/`bodyLimit` over `packages/demo/backend/src/` returns nothing; `createApp` wires only CORS + actions middleware + router, `app.ts:89-125`). The fund-touching endpoints — `/wallet/eth`, `/wallet/usdc` (mints 100 USDC_DEMO/call), `/swap/execute`, `/borrow/position/*`, `/lend/position/*` — can be hammered as fast as the bundler accepts.

Net fund-safety framing: an unauthenticated caller fans out across unlimited fresh addresses to drain the faucet admin wallet's ETH and exhaust the paymaster sponsorship budget. The on-chain Faucet's per-id (`keccak256(walletAddress)`) cooldown caps per-address velocity but not the cross-address drain, because every fresh address is a fresh id. The off-chain rate gate must live in the backend.

## Findings

- **F272** (high, fund-loss) — `packages/demo/backend/src/router.ts:57`: `router.post('/wallet/eth', walletController.dripEthToWallet)` is the lone `/wallet/*` mutation registered without `authMiddleware`; the handler (`controllers/wallet.ts:158-180`) reads `walletAddress` from the body and `faucetService.dripEthToWallet` (`services/faucet.ts:48-95`) signs the `drip` proof with `FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY` and submits via the admin smart wallet's `sendBatch`, so an unauthenticated caller drips faucet ETH to any address.
- **F275** (medium, fund-loss) — `packages/demo/backend/src/services/faucet.ts:31-46,48-95`: `isWalletEligibleForFaucet` returns `true` for any address with on-chain `balance == 0` (`faucet.ts:38-46`) with no atomicity between the read and the drip (TOCTOU) and no per-recipient/per-user accounting; a swept address re-qualifies indefinitely, and the position-check second guard is an unimplemented TODO (`faucet.ts:42-43`).
- **F276** (medium, infra) — `packages/demo/backend/src/router.ts:44-104` (app wiring `app.ts:89-125`): neither `createApp` nor the router applies rate-limiting or body-size middleware, so `/wallet/eth`, `/wallet/usdc`, `/swap/execute`, and the borrow/lend position routes can be called at bundler speed; `AmountByRaw.max(78)` (`schemas.ts:48`) caps one amount string but nothing caps request rate or volume.
- **F279** (low, info) — `packages/demo/backend/src/services/wallet.ts:117-129` (`:127`): `POST /wallet/usdc` is auth-gated and server-fixes 100 USDC_DEMO bound to the caller's own resolved wallet (no fund-loss; USDC_DEMO is a permissionless mock), but the amount is built via `BigInt(Math.floor(parseFloat('100') * 1000000))` (the float-truncation foot-gun pattern, harmless on the exact literal) and a gas-sponsored mint has no per-user rate limit, so a user loops it to burn sponsorship budget (overlaps F276).

## Root cause

The faucet route was wired before `authMiddleware` was applied uniformly to `/wallet/*`, and its abuse control was deferred to a live on-chain `balance == 0` read plus a never-implemented TODO second guard rather than to server-side accounting. The backend never gained a rate-limit / body-size layer, so the only velocity control anywhere is the on-chain per-id faucet cooldown, which is per-address and therefore defeated by fanning out across fresh addresses. F279 is the same missing-throttle gap on the already-auth-gated demo USDC mint.

## Recommended approach

Review-only, demo backend — three low-risk additions, no architectural refactor:

1. **Auth-gate `/wallet/eth` and bind the recipient to the session (F272).** Add `authMiddleware` to the route so it matches every sibling `/wallet/*` mutation, and derive the drip recipient from the authenticated wallet (`walletService.getWallet(idToken).address`) instead of trusting the body `walletAddress`. A request can then only fund the authenticated user's own wallet. This is the surgical, one-line-middleware fund-safety fix; the body `walletAddress` becomes redundant on this path.

2. **Add per-recipient (and per-user) drip accounting checked-and-recorded atomically before signing (F275).** Replace sole reliance on the live `balance == 0` read with a server-side drip cooldown / lifetime cap recorded before the admin signer is invoked, so concurrent requests for one address cannot all pass (closes the TOCTOU) and a swept address cannot re-qualify forever. Keep the on-chain `balance` read as a cheap pre-check; it is not the accounting boundary. Replace the TODO at `faucet.ts:42-43` with the real position/accounting check rather than leaving it inert.

3. **Add a lightweight per-IP / per-authenticated-user rate limiter and a small JSON body-size cap in `createApp` (F276, F279).** Apply at least to the faucet / mint / execute routes. This is a middleware addition in the existing `app.use(...)` stack (`app.ts:93-125`), not a restructuring. For F279, optionally replace the `parseFloat('100')` round-trip in `mintDemoUsdcToWallet` with an integer constant (`100_000_000n`) to remove the float path, and keep the amount server-derived; the rate limiter covers the sponsorship-burn angle.

Sequencing note: items 1-3 are independent and additive. Item 1 is the highest-leverage single change (it removes the unauthenticated drain); items 2 and 3 close the residual single-user / cross-address multiplication.

## Affected files

- `packages/demo/backend/src/router.ts:57` — `/wallet/eth` registered without `authMiddleware` (auth-gated siblings at `:44-56`, `:61-104`).
- `packages/demo/backend/src/controllers/wallet.ts:158-180` — `dripEthToWallet` handler reads `walletAddress` from the body (`DripEthToWalletRequestSchema`, `:34-38`).
- `packages/demo/backend/src/services/faucet.ts:31-46` — `isWalletEligibleForFaucet` racy `balance == 0` eligibility; TODO second guard at `:42-43`.
- `packages/demo/backend/src/services/faucet.ts:48-95` — `dripEthToWallet` signs the admin drip proof and submits via `sendBatch`.
- `packages/demo/backend/src/app.ts:89-125` — `createApp` wires CORS + actions middleware + router with no rate-limit / body-size layer.
- `packages/demo/backend/src/services/wallet.ts:117-129` (`:127`) — `mintDemoUsdcToWallet` `parseFloat` amount path, no per-user rate limit on the sponsored mint.

## Acceptance criteria / tests

- A `POST /wallet/eth` request with no `Authorization` / `privy-id-token` header is rejected (401/403) and signs no drip; an authenticated request drips only to the session-resolved wallet address, ignoring any body `walletAddress`.
- The route appears in the same auth-gated set as `/wallet/usdc` and the lend/borrow/swap mutations (a test asserting every `/wallet/*` mutation route carries `authMiddleware` passes).
- Concurrent `POST /wallet/eth` requests for the same fresh address yield at most one drip (the per-recipient gate is checked-and-recorded atomically before signing); a TOCTOU test fires N concurrent requests and asserts a single drip.
- An address swept back to zero balance does not re-qualify within the configured cooldown / under the lifetime cap.
- Rate-limit middleware is present in `createApp`: a burst on `/wallet/eth`, `/wallet/usdc`, and `/swap/execute` past the configured limit returns 429 without invoking the signer/bundler; a JSON body over the cap is rejected before handler execution.
- (F279) `mintDemoUsdcToWallet` still mints exactly 100 USDC_DEMO to the auth-resolved wallet; if the integer-constant change is taken, a test pins the minted amount to `100_000_000n`.

## Notes

- Review-only, demo backend: keep changes to auth-gating, an accounting gate, and throttle middleware. Do not restructure the demo backend.
- The on-chain Faucet's per-id (`keccak256(walletAddress)`) cooldown (`abis/ethFaucet.ts`) caps per-address velocity only; the cross-address drain must be gated off-chain in the backend, which is why item 2 lives here and not on-chain.
- F272's standalone recommendation called auth-gating the surgical fix with rate limiting as backlog; this consolidated ticket promotes the accounting (F275) and rate-limit/body-size (F276) work into the same effort because they share the faucet/mint surface and the auth fix alone still leaves the single-user multiplication and the sponsorship-burn angle open.
- F279 is fund-safe today (server-fixed amount, permissionless mock token); it is bundled only for the shared missing-throttle gap and the optional `parseFloat` cleanup, not as a fund-loss item.
- Frontend asymmetry F319 (the frontend `dripEthToWallet` sends no auth headers and a caller-supplied `walletAddress`) is the client-side twin of F272; auth-gating the route per item 1 is the backend fix and is what makes session-keyed rate limiting possible on this path. Tracked separately on the frontend surface.
- Out of scope here: the faucet admin-key / env hardening (F273, the Anvil-key default) and the auth-token binding gap (F274) are separate backend findings with their own loci.
