# Review Pass 13 — backend `ce-code-review` (review-only)

**Pass:** 13
**Skill:** `compound-engineering:ce-code-review`
**Mode:** review-only (demo backend surface; no code changes proposed beyond schema/util fixes)
**Surfaces reviewed:** backend (controllers, routes, services, helpers, middleware, config/env, utils) — `packages/demo/backend/src/**` — beyond the F272–F282 senior-backend fund-safety pass.

## Summary

This pass swept the demo backend end-to-end through a broad code-review lens (correctness, error handling, request lifecycle, response shaping, idempotency of fund-moving endpoints, secret handling, controllers→services→SDK integration). The headline fund-safety holes on this surface are already filed (F272–F282: unauth faucet drip, committed Anvil admin key, two-token auth binding, faucet TOCTOU, no rate-limit/body-size, CORS null/LOCAL_DEV, assets raw-error leak, swap/lend market-asset reconciliation). No new high/critical controller-layer fund-loss or malicious-sign hole was found beyond the existing ledger.

The 20 incoming findings reduced to **19 unique findings** (1 internal duplicate: `getPrivyClient()` was reported by two surfaces). All 19 are **NEW** (no refines, no ledger dups). All are **low** or **info** severity, fail closed, and are low-risk schema/util/config fixes appropriate for a review-only demo surface.

**Counts by severity (unique):**
- critical: 0
- high: 0
- low: 12
- info (low-severity, `info` class): 7

**Counts by class (unique):** correctness 9 · info 10

**Counts by dedup status:** new 19 · refines 0 · dup 1 (internal)

**ID range assigned:** F283–F301. `NEXT_ID` advances 283 → 302.

**Notable highlights:**
- The strongest item (F297) is a sibling-validation asymmetry inside the backend's own schema file: `AmountByRaw` lacks the positivity refine its twin `AmountByHuman` enforces, so `amountRaw:"0"` flows into every fund-moving borrow route and the SDK does not close the gap on the raw path (relates to F015). One-line backend fix.
- A recurring theme is **input-validation symmetry**: validation present in one action/branch but absent in a sibling (swap getQuote vs execute, lend chainId vs swap chainId, raw vs human amount, human-amount `.finite()` gap, env-var format validation vs the carefully-validated FAUCET_ADDRESS).
- A second theme is **auth/validation gate ordering**: mutation handlers and position-reads validate (and partly resolve the market allowlist) before checking auth, contradicting borrow `getQuote`'s stated auth-first convention and leaking allowlist membership to unauthenticated callers.
- `mintDemoUsdcToWallet` hardcodes `success:true` and discards the UserOp receipt success flag that the sibling faucet path checks (F287) — a backend-boundary response-shaping inconsistency distinct from the SDK-internal F212.

---

## Findings

### Surface: backend — controllers & routes

#### F283 — swap `getQuote` accepts NaN / Infinity / negative amounts and both-or-neither amountIn/amountOut
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/controllers/swap.ts:36-43`
- **Severity:** low
- **Class:** correctness
- **Dedup status:** new (relates to F280; distinct — F280 is quote-not-bound-to-price with no compensating control, this is input-validation symmetry on the quote schema)
- **Detail:** `PriceRequestSchema` transforms `amountIn`/`amountOut` with `.string().optional().transform((v) => (v ? Number(v) : undefined))` and nothing else. `Number('abc') → NaN`, `Number('-5') → -5`, `Number('1e400') → Infinity` all pass validation and flow into `swapService.getQuote → actions.swap.getQuote({ amountIn, amountOut })`. The sibling `ExecuteSwapRequestSchema` (line 48-61) correctly constrains the same field with `z.number().positive()`, so the quote path is the weak twin of the execute path. Both `amountIn` and `amountOut` are optional with no mutual-exclusivity / at-least-one refinement, so a quote can be requested with neither amount or with both (exact-in and exact-out simultaneously), pushing a malformed shape into the SDK quote/route logic. The endpoint is unauthenticated (router.ts:103). Not fund-loss (quote moves no funds and execute re-validates), but it forwards malformed numbers the caller never sensibly passed into the SDK getQuote/calldata-prebuild path.
- **Exploit/repro:** `GET /swap/quote?...&amountIn=-1` (or `amountIn=abc`, or `amountIn=1e400`) returns a 200-path into `actions.swap.getQuote` with `amountIn = -1 / NaN / Infinity` instead of a 400.
- **Recommendation:** Mirror the execute schema on the quote schema: validate each amount as a positive finite number (e.g. `.transform(Number).refine((v) => v === undefined || (Number.isFinite(v) && v > 0))`) and add a refinement requiring exactly one of amountIn/amountOut. Low-risk, schema-only.
- **suggestRefactor:** false
- **Candidate issue:** none

#### F284 — lend open/close `marketId.chainId` checked only for positivity, not membership in SUPPORTED_CHAIN_IDS
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/controllers/lend.ts:24-29,37-42`
- **Severity:** low
- **Class:** correctness
- **Dedup status:** new (relates to F281; distinct — F281 is asset/market reconciliation, this is chainId membership validation)
- **Detail:** `OpenPositionRequestSchema` / `ClosePositionRequestSchema` validate `marketId.chainId` as `z.number().positive('chainId must be positive')` only. The swap controller (swap.ts:22-25 `chainIdFromNumber`) refines the same field with `supportedChainIds.includes(v)`, and the borrow controller derives chain from an allowlisted market. The lend controller forwards the unchecked chainId straight into `resolveAsset(tokenAddress, marketId.chainId as SupportedChainId)` (lend service) and into `wallet.lend.openPosition/closePosition` with a chainId cast that lies about the value being supported. An unsupported-but-positive chainId (e.g. 1, 137) reaches `resolveAsset` which looks up `token.address[chainId]` (undefined) and the SDK. Combined with F281 this is the same lend-controller validation-gap family. Fails closed (asset-not-found / SDK chain error) so not fund-loss, but it is a missing obvious sibling validation.
- **Exploit/repro:** `POST /lend/position/open` with `marketId.chainId=1` passes schema validation (1 is positive) and reaches `resolveAsset(...,1)`/SDK instead of being rejected as unsupported at the boundary.
- **Recommendation:** Reuse `helpers/schemas.ts` ChainIdSchema (or swap.ts `chainIdFromNumber` refinement) for `marketId.chainId` in both lend schemas so an unsupported chain is a 400 instead of an opaque downstream throw.
- **suggestRefactor:** false
- **Candidate issue:** #334

#### F285 — `resolveAsset` does case-sensitive (`===`) address match against checksum-cased config while sibling AddressSchema lowercases
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/utils/assets.ts:15`
- **Severity:** low
- **Class:** correctness
- **Dedup status:** new
- **Detail:** `resolveAsset` matches via strict `token.address[chainId] === tokenAddress`. The config addresses are stored EIP-55 checksum-cased (config/assets.ts:6 `0xb1b0FE886cE376F28987Ad24b1759a8f0A7dd839`, line 18 `0xD6169405013E92387b78457Fa77d377cE8cD3EE8`). The swap (swap.ts:113-114) and lend (lend.ts:76,107) controllers cast the caller's `tokenAddress` to Address with NO normalization, while the wallet/borrow AddressSchema (helpers/schemas.ts:10-13) and Bytes32Schema lowercase before use. So a caller who sends a lowercase (or differently-cased) token address that is on the supported list still gets 'Asset not found for token address' and an opaque 500 from a perfectly valid token. Two address-handling contracts coexist in the same backend (lowercasing for borrow/wallet, exact-match for swap/lend). Not fund-loss (fails closed), but a robustness/consistency defect on the swap/lend execute path where the address is the asset selector.
- **Exploit/repro:** `POST /lend/position/open` or `GET /swap/quote` with `tokenAddress` = lowercase form of `0xb1b0FE886cE376F28987Ad24b1759a8f0A7dd839` → `resolveAsset` returns undefined → throws 'Asset not found' → 500, despite the token being supported.
- **Recommendation:** Normalize both sides: compare via viem `getAddress()` (or both-lowercased) inside `resolveAsset`, and/or have the swap/lend controllers run addresses through the shared lowercasing AddressSchema like the borrow/wallet controllers do. Schema/util-only change.
- **suggestRefactor:** false
- **Candidate issue:** #475

#### F286 — Borrow/lend/swap mutation handlers run schema validation BEFORE auth, while borrow getQuote runs auth first
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/controllers/borrow.ts:97-107,117-127,138-148,159-169,178-188`
- **Severity:** low
- **Class:** info
- **Dedup status:** new (relates to F274; distinct — F274 is access/id-token binding, this is in-handler gate ordering)
- **Detail:** borrow.ts `getQuote` (line 68-85) runs `requireAuth(c)` first, then `validateRequest`, with an explicit comment 'Auth runs before schema so unauthenticated calls always 401.' Every mutation handler in the same file (openPosition, closePosition, depositCollateral, withdrawCollateral, repay) inverts this: `validateRequest` runs first and `requireAuth` second. lend.ts (openPosition/closePosition) and swap.ts (executeSwap) follow the validate-then-auth order too. The order is not itself a fund-loss bug (route-level authMiddleware already 401s before the handler body for all these routes, so the in-handler `requireAuth` is a redundant guard), but the file contradicts its own stated convention, and an unauthenticated request that somehow reached the handler would get schema feedback (400) before a 401.
- **Exploit/repro:** Compare borrow.ts:69-72 (auth then validate) with borrow.ts:98-102 (validate then auth) — same file, opposite order on the comment-documented convention.
- **Recommendation:** Pick one order for all mutation handlers (auth-first matches the stated convention and the borrow getQuote sibling) so a request never receives validation detail before an auth decision. Review-only; no behavior change needed since route-level authMiddleware already gates these.
- **suggestRefactor:** false
- **Candidate issue:** none

---

### Surface: backend — services & controllers (lifecycle/response-shaping)

#### F287 — `mintDemoUsdcToWallet` hardcodes `success:true` and ignores the UserOp receipt success flag, unlike the sibling faucet path
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/services/wallet.ts:117-158`
- **Severity:** low
- **Class:** correctness
- **Dedup status:** new (relates to F212; distinct — F212 is the SDK not asserting receipt.success, this is the backend service discarding a success flag it already holds)
- **Detail:** `mintDemoUsdcToWallet` awaits `mintUsdcDemo → wallet.sendBatch`, which returns a viem `WaitForUserOperationReceiptReturnType` carrying a boolean `success` field (a mined-but-reverted UserOp resolves with `success:false` rather than throwing; see `DefaultSmartWallet.sendBatch` at packages/sdk/.../DefaultSmartWallet.ts:217-250). The service never reads `result.success`: it extracts only transactionHashes/userOpHash (lines 131-142) and returns `{ success: true, ... }` (line 151) unconditionally. So a reverted demo-USDC mint is reported to the client as a successful 100-USDC mint with a real userOpHash and block-explorer URL. The sibling faucet path DOES guard this: the wallet controller checks `if (!result.success)` and returns a 500 (controllers/wallet.ts:172). Demo-only token, no protocol fund loss, but the UI is told a mint that reverted succeeded.
- **Exploit/repro:** Force the demo-USDC mint UserOp to revert (e.g. mintable token paused or gas-sponsorship rejects mid-flight after inclusion). `POST /wallet/usdc` returns HTTP 200 with `{ success: true, amount: '100', userOpHash }` even though no USDC was minted. The faucet path under the same revert returns 500.
- **Recommendation:** In `mintDemoUsdcToWallet`, branch on the UserOp receipt's `success` (for the userOpHash path) before returning, mirroring the faucet controller's `if (!result.success)` check, and surface a 500 / success:false when the mint UserOp reverted. Keep the EOATransactionReceipt branch as-is.
- **suggestRefactor:** false
- **Candidate issue:** none

#### F288 — `getLendPosition` / `getBorrowPosition` run validateRequest (and borrow market-allowlist resolution) BEFORE requireAuth, leaking allowlist membership to unauthenticated callers
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/controllers/wallet.ts:85-105,111-133`
- **Severity:** low
- **Class:** info
- **Dedup status:** new
- **Detail:** The position-read handlers validate and partly process the request before checking auth. `getBorrowPosition` calls `validateRequest` (line 112) then `borrowService.resolveBorrowMarketId` (line 118) — which throws `MarketNotAllowedError` (mapped to 403 by helpers/errors.ts) for any non-allowlisted chain/marketId — and only THEN calls `requireAuth` (line 120). `getLendPosition` similarly runs `validateRequest` (line 86) before `requireAuth` (line 96). An unauthenticated caller can therefore distinguish allowlisted vs non-allowlisted markets (403 vs the 401 a fully-auth-first handler would return) and observe schema-validation 400s — a probing oracle on backend market configuration. Every mutating sibling runs requireAuth first or returns 401 uniformly. Read-only, no funds, info-class.
- **Exploit/repro:** `GET /wallet/borrow/<chainId>/<marketId>/position` with no Authorization header: an allowlisted marketId returns 401 only after passing resolution, while a non-allowlisted marketId returns 403 (MarketNotAllowedError) — the differing status reveals allowlist membership without auth.
- **Recommendation:** Move `requireAuth` to the top of `getLendPosition` and `getBorrowPosition` (before validateRequest / resolveBorrowMarketId), matching the auth-first ordering already used in borrowController.getQuote (controllers/borrow.ts:69-72), so unauthenticated callers get a uniform 401 with no market-allowlist signal.
- **suggestRefactor:** false
- **Candidate issue:** none

#### F289 — `getLendPosition` throws bare `Error('Wallet not found')` (→ generic 500) while sibling handlers return a 404
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/controllers/wallet.ts:99-102,123-126`
- **Severity:** low
- **Class:** correctness
- **Dedup status:** new
- **Detail:** `getLendPosition` resolves the wallet and, when absent, does `throw new Error('Wallet not found')` (lines 100-102) inside a handler with no try/catch, so it propagates to `app.onError`; `mapSdkError` does not recognize a plain Error, so it falls through to a generic 'Internal server error' 500 (app.ts:127-132). The directly adjacent `getBorrowPosition` handles the identical 'wallet not found' condition with `return errorResponse(c, 'Wallet not found', 404)` (lines 124-126), and `getWallet` returns 404 too (line 52). A missing wallet is a client-state 404, not a server 500; the inconsistency mislabels the error class and can mask real 500s in monitoring. No funds.
- **Exploit/repro:** Authenticated request to `GET /wallet/lend/:chainId/:marketAddress/position` with a valid token whose Privy user has no embedded wallet: `getLendPosition` returns 500 'Internal server error', whereas `GET /wallet/borrow/...` under the same condition returns 404 'Wallet not found'.
- **Recommendation:** In `getLendPosition`, return `errorResponse(c, 'Wallet not found', 404)` for the null-wallet case to match getBorrowPosition/getWallet, instead of throwing a bare Error that surfaces as a 500.
- **suggestRefactor:** false
- **Candidate issue:** none

#### F290 — Human-amount schemas (lend/swap/borrow) accept non-finite floats (Infinity) — no `.finite()` guard before the value reaches SDK amount parsing
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/helpers/schemas.ts:46`
- **Severity:** low
- **Class:** correctness
- **Dedup status:** new (relates to F151/F041 family; distinct — F151 is the SDK public amount-type contract, this is the backend request-boundary schema)
- **Detail:** All three action surfaces forward a caller-supplied JS number amount into SDK amount parsing without rejecting non-finite values. `AmountByHuman = z.strictObject({ amount: z.number().positive() })` (schemas.ts:46) backs both borrow human-amount branches; lend uses `z.number().positive()` directly (controllers/lend.ts:21,23,35,37) and swap uses `z.number().positive()` for amountIn (controllers/swap.ts:50). zod's `z.number()` rejects NaN but `z.number().positive()` does NOT reject Infinity (`Infinity > 0` is true and Infinity is a valid number), nor does it bound magnitude. An `amount`/`amountIn` of Infinity (or values like 1e30 / 1e-30) passes validation and reaches the SDK's parseUnits/parseAssetAmount layer, where the F041/F097 family of bugs (InvalidDecimalNumberError on scientific-notation, RangeError, precision loss) manifest as opaque 500s rather than a clean 400. The well-bounded `AmountByRaw` branch (`.regex(/^\d+$/).max(78)`) shows the intended discipline; the human branch lacks the analogous `.finite()` bound.
- **Exploit/repro:** `POST /lend/position/open` (or `/swap/execute`) with `amount: 1e309` (parses to Infinity in JS) or a tiny `1e-30`: validation passes, the SDK parseUnits path throws, and the client gets a generic 500 instead of a 400 naming the bad amount.
- **Recommendation:** Add `.finite()` (and optionally a sane upper `.lte()` bound) to the human-amount number validators: change `z.number().positive()` to `z.number().positive().finite()` in schemas.ts AmountByHuman and in the lend/swap inline amount schemas.
- **suggestRefactor:** false
- **Candidate issue:** #303

#### F291 — `getPrivyClient()` constructs a fresh PrivyClient on every call (per request and per getWallet), including inside the per-request auth middleware
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/config/actions.ts:86-91`
- **Severity:** low
- **Class:** info
- **Dedup status:** new (relates to F276; reported by two surfaces this pass — internal duplicate consolidated here)
- **Detail:** `getPrivyClient()` does `return new PrivyClient({ appId, appSecret })` with no memoization (config/actions.ts:86-91). It is invoked on the hot path of every authenticated request: `authMiddleware` calls `getPrivyClient().utils().auth().verifyAuthToken` (middleware/auth.ts:24-25), `services/wallet.getWallet` calls `getPrivyClient()` again (wallet.ts:36), and `createActionsConfig` calls it at init (actions.ts:24). Each authenticated mutation thus instantiates one or more new Privy SDK clients (and the implied HTTP-agent/connection setup) rather than reusing a singleton — an availability/throughput concern under load that compounds the no-rate-limit gap (F276). The SDK's wallet provider was wired with the init-time client, but per-request verifyAuthToken/users().get calls use throwaway clients — divergent instances that could drift if the client carries connection pools/caches/rate-limit state. Not a fund-safety issue.
- **Exploit/repro:** Each request to any auth-gated route constructs ≥2 new PrivyClient instances (auth middleware + getWallet); 3 distinct call sites confirmed via grep (auth.ts:24, wallet.ts:36, actions.ts:24).
- **Recommendation:** Memoize a single PrivyClient instance (lazy singleton, the pattern getActions() already uses for actionsInstance) and return it from getPrivyClient(), so auth verification and wallet lookup reuse one client. Backlog (perf/robustness), not a security fix.
- **suggestRefactor:** false
- **Candidate issue:** none

#### F292 — Aave borrow/repay USDC_DEMO mirror is fire-and-forget with no idempotency and no success check
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/services/mirror.ts:41-84`
- **Severity:** low
- **Class:** info
- **Dedup status:** new
- **Detail:** On every Aave borrow, `borrowService.openPosition` does `void mintMirrorUsdc(wallet, minted, receipt.transactionHash)` (services/borrow.ts:210) and repay/close do `void removeMirrorUsdc(...)` (borrow.ts:232,288). `mintMirrorUsdc`/`removeMirrorUsdc` call `wallet.sendBatch` (a second sponsored UserOp on Base Sepolia) inside a try/catch that swallows and logs failures (mirror.ts:46-60,69-83) and never inspects the returned UserOp receipt's success flag, so a mined-but-reverted mirror UserOp is logged 'ok'. There is no idempotency key tying a mirror op to its real-tx hash, so a client retry of the same borrow (no rate limit, F276) double-mirrors, and a borrow whose mirror permanently fails under-credits the demo balance with only deferred-reconciliation (an unimplemented TODO, borrow.ts:285) to repair it. Because USDC_DEMO is a permissionless mock token minted to the user's own wallet and removed to a dead sink, there is no protocol fund loss; recorded as info per the demo/review-only scope.
- **Exploit/repro:** Retry `POST /borrow/position/open` with the same body (no idempotency, no rate limit): each call fires a fresh permissionless USDC_DEMO mint of the borrow amount to the caller's wallet on Base Sepolia, inflating the demo balance beyond the real OP-Sepolia borrow.
- **Recommendation:** Backlog: when the mirror is hardened, (a) read the mirror UserOp receipt's `success` flag in mintMirrorUsdc/removeMirrorUsdc and log 'failed' on success:false rather than swallowing it as 'ok', and (b) key mirror operations by the real-tx hash so client retries don't double-mirror. No change needed for the demo as shipped beyond the success-flag log fix.
- **suggestRefactor:** false
- **Candidate issue:** none

---

### Surface: backend — middleware, config & env

#### F293 — `actionsMiddleware` collapses every thrown error into a misleading 'Actions SDK not initialized' 500 via an unbound `catch {}`
- **Surface:** backend — middleware
- **File:line:** `packages/demo/backend/src/middleware/actions.ts:5-12`
- **Severity:** low
- **Class:** info
- **Dedup status:** new
- **Detail:** `actionsMiddleware` wraps `getActions(); await next()` in a single try/catch with an empty `catch {}` that returns `{ error: 'Actions SDK not initialized' }, 500` for ANY error. The catch has no error binding, so the real error is never logged and never passed to the global onError mapper in app.ts (which runs mapSdkError + errorResponse, logging to stderr). Two consequences: (1) because `await next()` is inside the same try, every downstream error thrown synchronously up the stack (before a handler installs its own try/catch) is also caught here and mislabeled as an initialization failure instead of reaching the structured error mapper; (2) even the intended case swallows the underlying cause silently (no console.error), unlike every sibling 500 path which routes through errorResponse and logs `{ name, error }`. Error-handling/observability defect, not a fund-loss path, but it can mask real SDK or routing failures in production logs.
- **Exploit/repro:** Throw any error from a handler that runs before its own try/catch (e.g. a route calling into the SDK synchronously): the client receives 'Actions SDK not initialized' 500 with no stderr log, instead of the real mapped error.
- **Recommendation:** Scope the try to only the `getActions()` initialization check (call it, then `await next()` outside the try), and bind the caught error so it is logged. Better: let initialization failures propagate to the global onError handler so they get the same structured logging as every other 500.
- **suggestRefactor:** false
- **Candidate issue:** none

#### F294 — `parseAuthorizationHeader` uses `.replace('Bearer','')` (unanchored, first-occurrence) instead of stripping only the scheme prefix
- **Surface:** backend — auth middleware
- **File:line:** `packages/demo/backend/src/middleware/auth.ts:38-40`
- **Severity:** low
- **Class:** correctness
- **Dedup status:** new
- **Detail:** `parseAuthorizationHeader` does `value.replace('Bearer', '').trim()`. `String.replace` with a string (not a global regex) replaces only the FIRST occurrence and is not anchored to the start. The guard at auth.ts:13 (`authHeader?.startsWith('Bearer ')`) ensures the value begins with the scheme, so in the normal case the leading `Bearer ` is removed correctly. But if the access token itself contains the substring `Bearer` the first interior occurrence is what gets stripped, and a token like `BearerXYZ...` with no following space would mis-parse. The intention-revealing operation is to strip the known prefix length, e.g. `value.slice('Bearer '.length).trim()` or `value.replace(/^Bearer\s+/, '')`. In practice Privy access tokens are JWTs that do not contain the literal 'Bearer', so it is unlikely to mis-parse today, but the parser does not match its stated intent.
- **Exploit/repro:** `node: "Bearer abcBearerdef".replace('Bearer','').trim()` confirms first-occurrence, unanchored replace semantics; intended only-prefix-strip behavior is not guaranteed for tokens containing the substring.
- **Recommendation:** Replace with a prefix-anchored strip: `value.replace(/^Bearer\s+/i, '').trim()` or `value.slice('Bearer '.length).trim()`.
- **suggestRefactor:** false
- **Candidate issue:** none

#### F295 — `FAUCET_ADDRESS` default-resolver re-parses LOCAL_DEV via envalid's private `_parse` at module load and swallows deployment-file read errors into a hardcoded fallback
- **Surface:** backend — env / config
- **File:line:** `packages/demo/backend/src/config/env.ts:18-56`
- **Severity:** low
- **Class:** correctness
- **Dedup status:** new
- **Detail:** `getFaucetAddressDefault()` runs during cleanEnv's default evaluation (env.ts:55) and: (1) re-parses LOCAL_DEV directly from process.env using `bool()._parse(process.env.LOCAL_DEV || 'false')` — `_parse` is an envalid private/internal method, so this duplicates the LOCAL_DEV validation outside the single cleanEnv pass and couples to an undocumented API that can break on an envalid upgrade; (2) when LOCAL_DEV is true it reads `../../../latest-faucet-deployment.json`, and on ANY failure (missing file, bad JSON, schema mismatch) it `console.warn`s and silently returns the hardcoded `0xA8b0621be8F2feadEaFb3d2ff477daCf38bFC2a8`. So a local-dev run whose deployment file is stale or unreadable silently targets a baked-in faucet address instead of the freshly deployed one — a foot-gun where the faucet drips against the wrong contract with only a warn line. The faucet address feeds fund-moving drip logic, so a silently-wrong default is worth surfacing even though the exploit surface is local-dev/misconfig.
- **Exploit/repro:** Set `LOCAL_DEV=true` with a missing/corrupt `latest-faucet-deployment.json`: env resolves FAUCET_ADDRESS to the hardcoded constant with only a console.warn; downstream faucet drips target that address.
- **Recommendation:** Read LOCAL_DEV once through cleanEnv (or via the public envalid API) rather than `bool()._parse`. For the deployment-file fallback, fail loud in local dev when the file is expected but unreadable (throw or log at error level) instead of silently returning a hardcoded address.
- **suggestRefactor:** false
- **Candidate issue:** none

#### F296 — Private-key / address env vars (SESSION_SIGNER_PK, FAUCET_*_PRIVATE_KEY, *_FAUCET_ADDRESS, AUTH_MODULE_ADDRESS) are validated only as `str()` with no hex/length/address format check
- **Surface:** backend — env / secret handling
- **File:line:** `packages/demo/backend/src/config/env.ts:50-67`
- **Severity:** low
- **Class:** info
- **Dedup status:** new (relates to F273; distinct — F273 is the Anvil-key default value, this is the missing format validation across all signing-critical secrets)
- **Detail:** Every signing-critical secret and on-chain address in the env schema is typed as a bare `str()` (SESSION_SIGNER_PK at :60 has no default and no format validation; FAUCET_ADMIN_PRIVATE_KEY :50-53; FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY :66; OP_SEPOLIA_FAUCET_ADDRESS :67; AUTH_MODULE_ADDRESS :61-63). Only FAUCET_ADDRESS goes through a real validator (FaucetConfigSchema with isAddress/getAddress), and only along its default path. A malformed private key (wrong length, missing 0x, truncated) or a non-checksummed/invalid address therefore passes startup validation and only fails much deeper — inside viem signing or an RPC call mid-request — producing an opaque 500 rather than a clear boot-time config error. cleanEnv is exactly the layer where a `0x`-prefixed 64-hex-char regex (keys) and isAddress (addresses) belong. Config-hardening/fail-fast, not a live fund-loss path; the contrast with the carefully-validated FAUCET_ADDRESS makes it a sibling-validation gap.
- **Exploit/repro:** Set `SESSION_SIGNER_PK=notakey`: cleanEnv passes (non-empty string); failure surfaces later as an opaque error inside the signer rather than at boot.
- **Recommendation:** Add envalid custom validators: a `0x[0-9a-fA-F]{64}` check for the private-key vars and an isAddress/getAddress check for the address vars (reuse the FaucetConfigSchema pattern). Fail at startup on malformed values. Do NOT log the values.
- **suggestRefactor:** false
- **Candidate issue:** none

---

### Surface: backend — helpers & utils

#### F297 — `AmountByRaw` branch lacks a positivity refine that the sibling `AmountByHuman` branch enforces, so `amountRaw:"0"` passes into fund-moving routes
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/helpers/schemas.ts:47-49,57-61,67-75`
- **Severity:** low
- **Class:** correctness
- **Dedup status:** new (relates to F015; distinct locus — F015 is the SDK borrow zero-borrow open, this is the backend request-schema asymmetry)
- **Detail:** `AmountByHuman` is `z.strictObject({ amount: z.number().positive() })` (rejects 0), but the sibling `AmountByRaw` is `z.strictObject({ amountRaw: z.string().regex(/^\d+$/).max(78) })` with NO lower-bound guard. The regex `/^\d+$/` matches "0", so `BigInt("0") = 0n` flows through AmountExactSchema / AmountWithMaxSchema as a valid amount. These schemas back every fund-moving borrow route (controllers/borrow.ts:28,34,40,45,50,91,111,131,152,173) and the human branch's `.positive()` guard is the only positivity check at the request boundary. Downstream the SDK does not close the gap on the raw path: `validateAmountPositiveIfExists` only checks the number `amount`, not `amountRaw`, and Morpho `blue.ts:139,155` treats `amountWei === 0n` as `undefined` (silently dropped). Net effect: a `borrowAmount:{amountRaw:"0"}` open is accepted at the boundary and produces either a guaranteed-revert zero-borrow (Aave, F015 analysis) or a silently-dropped borrow leg while collateral is still deposited (Morpho). Sibling-validation asymmetry inside the backend's own schema file.
- **Exploit/repro:** `POST /borrow/position/open` (auth-gated) with body `{ marketId: {kind:'aave-v3',marketId:'0x..',chainId:84532}, borrowAmount: { amountRaw: '0' } }` passes request validation (AmountExactSchema accepts {amountRaw:'0'}) and dispatches a zero-borrow open; the equivalent `borrowAmount:{amount:0}` is rejected with a 400 by AmountByHuman.positive().
- **Recommendation:** Add a positivity refine to AmountByRaw so the raw branch matches the human branch, e.g. `z.string().regex(/^\d+$/).max(78).refine((s) => BigInt(s) > 0n, 'amountRaw must be positive')`. One-line, low-risk backend change giving positivity parity across both amount encodings without relying on the SDK closing F015.
- **suggestRefactor:** false
- **Candidate issue:** #303

#### F298 — `validateRequest` only attaches params/query/body when the top-level schema exposes a `.shape`, so a future caller wrapping a schema in transform/refine/union silently validates against an empty object
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/helpers/validation.ts:66-76`
- **Severity:** low
- **Class:** info
- **Dedup status:** new
- **Detail:** `validateRequest` decides which request sections to populate by reading `schema.shape` and checking `'params'/'query'/'body' in schemaShape` (lines 67-74). When the top-level schema is not a plain ZodObject (e.g. a discriminatedUnion, a `.refine()`/`.transform()` wrapper, or `z.union([...])`), `'shape' in schema` is false, `schemaShape` falls back to `{}`, and NONE of params/query/body are attached. `schema.safeParse({})` then runs against an empty object. For a fund-moving POST this fails-closed today (a required-field union rejects `{}`), so it is not currently exploitable: every existing caller passes `z.object({ body: ... })`. But it is a latent footgun — the body-shape contract is silently coupled to the outermost wrapper being a ZodObject, and a maintainer who later validates a request with `SomeBodyUnion` (no `.body` wrapper) or wraps an object schema in `.refine()` at the top level would get a handler that validates against `{}` and may pass with all-optional fields, bypassing the request body entirely.
- **Exploit/repro:** Not exploitable with current callers (all use z.object). Construct `validateRequest(c, BodyUnionSchema)` where BodyUnionSchema is a discriminatedUnion with no `.body` wrapper: schema has no `.shape`, body is never read, safeParse({}) runs and the discriminator mismatch is the only failing check — any all-optional union member would pass with zero request data.
- **Recommendation:** Either document the hard requirement that the schema passed to validateRequest must be a top-level ZodObject with params/query/body keys, or detect a non-object schema and throw/return a 500 rather than silently validating `{}` (e.g. `if (!('shape' in schema)) return { success:false, response: c.json({error:'Invalid request schema'},500) }`).
- **suggestRefactor:** false
- **Candidate issue:** none

#### F299 — `ChainIdSchema` / `ChainIdStringSchema` accept any positive integer, not membership in SUPPORTED_CHAIN_IDS, diverging from the swap controller which does enforce membership
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/helpers/schemas.ts:28-42`
- **Severity:** low
- **Class:** info
- **Dedup status:** new (sibling of F284 at a different locus — F284 is the lend.ts inline schema, this is the shared schemas.ts ChainIdSchema)
- **Detail:** `ChainIdSchema` (numeric) and `ChainIdStringSchema` (path/string) validate only `positive integer` and cast to `SupportedChainId` (a lie — the value is never checked against the supported set). The swap controller defines `chainIdFromNumber`/`chainIdFromString` that add `.refine((v) => supportedChainIds.includes(v), 'Unsupported chain ID')` (controllers/swap.ts:17-25), but the shared schemas used by borrow (via BorrowMarketIdSchema → ChainIdSchema) and the wallet borrow-position route (controllers/wallet.ts:29 via ChainIdStringSchema) have no membership check at the schema layer. For borrow this is mitigated downstream: borrow service re-resolves marketId against a backend allowlist that matches on chainId (services/borrow.ts:71,91 `m.chainId === chainId`), so an unsupported chainId surfaces as 'Market not in backend allowlist'. The finding is the sibling asymmetry: the typed cast `as SupportedChainId` claims membership the schema never verified, and a future shared-schema consumer that does NOT re-resolve against an allowlist would forward an unsupported chainId straight into SDK chain lookups.
- **Exploit/repro:** `ChainIdSchema.safeParse(999999)` succeeds and yields 999999 typed as SupportedChainId; only the borrow allowlist re-resolution stops it from reaching an SDK chain lookup.
- **Recommendation:** Backlog: have ChainIdSchema/ChainIdStringSchema refine against SUPPORTED_CHAIN_IDS (the swap controller's pattern) so the `as SupportedChainId` cast is honest and shared across all consumers. Review-only / no immediate change required given the borrow allowlist re-resolution.
- **suggestRefactor:** false
- **Candidate issue:** #334

#### F300 — `mapSdkError` SDK_ERROR_MAPPINGS assumes 'classes never overlap so order is insignificant' — an unverified invariant; a future subclass would be shadowed by its base-class mapping
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/helpers/errors.ts:45-56,89-168`
- **Severity:** low
- **Class:** info
- **Dedup status:** new (relates to F282; distinct — F282 is the assets.ts raw error-message leak that violates this contract, this records errors.ts as the canonical pattern plus the subclass-ordering hazard)
- **Detail:** `errorResponse` logs detail to stderr only for ≥500 and returns a literal message, and SDK_ERROR_MAPPINGS deliberately uses literal messages (no error.message passthrough) so addresses/RPC URLs/stack fragments never reach clients — the contract is sound and well-commented. Two observations: (1) the comment at lines 84-88 asserts 'classes never overlap so the first instanceof match wins regardless of position' — unverified; if a future SDK introduces a subclass of an already-mapped error (e.g. a more specific InvalidAmount variant extending InvalidAmountError) the table-order would silently pick the base-class mapping (wrong status). A maintainability hazard, not a current bug. (2) The opaque-error contract enforced here is exactly the contract getAssets (controllers/assets.ts) breaks by returning raw error.message — already filed as F282; this row records helpers/errors.ts as the canonical pattern the violation should conform to.
- **Exploit/repro:** Not exploitable. Conceptual: add `class SpecificInvalidAmountError extends InvalidAmountError` to the SDK and map both — depending on array order, the base mapping can shadow the specific one's intended status.
- **Recommendation:** Backlog: order SDK_ERROR_MAPPINGS most-specific-subclass-first (or add an errors.spec.ts assertion that no mapped class is a subclass of another) so the 'order is insignificant' comment stays true as the SDK grows. No fund-safety impact today.
- **suggestRefactor:** false
- **Candidate issue:** none

#### F301 — Explorer URL builders interpolate transactionHash/userOpHash into the returned URL with no hex-shape validation
- **Surface:** backend
- **File:line:** `packages/demo/backend/src/utils/explorers.ts:19-53`
- **Severity:** low
- **Class:** info
- **Dedup status:** new (relates to F133; distinct — F133 is the SDK extractReceiptHashes degenerate output, this is the backend URL builder consuming it)
- **Detail:** `getTransactionUrl`/`getUserOperationUrl` interpolate the raw `transactionHash`/`userOpHash` string directly into `${baseUrl}/tx/${hash}` and return it in API responses (consumed by wallet.ts mint/drip flows and serialized to the client). These hashes originate from SDK transaction receipts (server-generated), not from user input, so there is no injection vector today and no fund impact — the URL is display-only. Recorded as info because the helper performs no `/^0x[0-9a-fA-F]{64}$/` shape check, so a malformed/empty hash from a future receipt shape would yield a broken `/tx/` URL silently rather than a clear error. The realistic source of a malformed hash reaching this helper is the receipt-shape divergence tracked elsewhere (extractReceiptHashes [undefined] outputs, F133/F221).
- **Exploit/repro:** n/a — hashes are server-generated; this is a robustness note, not an exploit.
- **Recommendation:** No action required (display-only, server-sourced input). Optional backlog: validate hash shape and omit a malformed entry rather than emitting a broken URL, mirroring the receipt-hash extraction path's defensiveness.
- **suggestRefactor:** false
- **Candidate issue:** none

---

## Dedup notes

- **Internal duplicate (1):** `getPrivyClient()` fresh-per-call was independently reported by the services/controllers surface and the middleware/config surface. Consolidated into **F291**; the second report is `dup:F291`.
- **No ledger dups / no refines:** all 19 unique findings are new loci on the demo backend (controllers/services/helpers/middleware/config/utils). They *relate to* prior SDK/backend findings (F015, F133, F151, F212, F273, F274, F276, F280, F281, F282) but each sits in a distinct backend file with a distinct root cause, so none refine an existing row.
- **Surface boundary:** F272–F282 (the senior-backend fund-safety pass) were explicitly NOT re-filed; all are already in the ledger.
