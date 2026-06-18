# Tighten backend request-schema validation symmetry (positivity, chain, address casing)

| Field | Value |
| --- | --- |
| **Severity** | low |
| **Complexity** | 2 / 5 |
| **Domain** | backend |
| **Surface** | `controllers/swap.ts` PriceRequestSchema; `helpers/schemas.ts` AmountByHuman / AmountByRaw / ChainIdSchema / ChainIdStringSchema; `utils/assets.ts` resolveAsset casing; `controllers/lend.ts` asset/market reconcile |
| **Resolves findings** | F283, F285, F290, F297, F299, F281 |
| **Candidate existing issue** | none (per-finding: F285 → #475; F290/F297 → #303; F299/F281 → #334) |
| **Blocked by** | (none) |

## Problem

The demo backend has two address- and amount-handling contracts that disagree with each other across sibling routes, and the weaker side of each pair forwards a value the caller never sensibly passed into the SDK. None of these are fund-loss on their own (every gap fails closed: a revert, a silent-drop, an opaque 500, or an SDK chain error), but each is a missing-obvious-validation or sibling-asymmetry that lets a malformed request cross the request boundary instead of getting a clean 400.

Concretely, against fund-moving routes:

- The unauthenticated swap quote schema transforms `amountIn`/`amountOut` with bare `Number()` and no positivity/finiteness/exactly-one-of guard, so `NaN`, `-5`, and `1e400` (Infinity) all reach `actions.swap.getQuote`, while the sibling execute schema constrains the identical field with `z.number().positive()`.
- The human-amount validators reject `NaN` but not `Infinity` (`Infinity > 0` is true), so a non-finite amount reaches SDK `parseUnits`/`parseAssetAmount` as an opaque 500.
- The raw-amount branch has no positivity refine, so `amountRaw:"0"` (BigInt `0n`) is accepted into every borrow route and produces a guaranteed-revert zero-borrow (Aave) or a silently-dropped borrow leg (Morpho) while collateral is still deposited.
- `resolveAsset` matches the caller's token address against EIP-55 checksum-cased config with a case-sensitive `===`, while the borrow/wallet `AddressSchema` lowercases; a supported token sent in lowercase yields "Asset not found" and a 500.
- The shared chain-id schemas cast `as SupportedChainId` without ever checking membership in `SUPPORTED_CHAIN_IDS`, unlike the swap controller's `chainIdFromNumber`/`chainIdFromString`.
- The lend controller forwards `tokenAddress` and `marketId` independently with no server-side assertion that the resolved asset is the market's underlying, relying entirely on the SDK guard (the lend-asset-market work under #334).

The unifying theme: validators that already exist on one route are absent on its sibling, and a typed cast (`as SupportedChainId`, lowercase `Address`) claims a property the schema never verified.

## Findings

- **F283** (low, correctness) — `packages/demo/backend/src/controllers/swap.ts:36-43`: `PriceRequestSchema` transforms `amountIn`/`amountOut` via `.string().optional().transform((v) => (v ? Number(v) : undefined))` with no finiteness/positivity refine and no exactly-one-of refinement, so `NaN`/`-5`/`Infinity` and both-or-neither amounts pass into `swapService.getQuote → actions.swap.getQuote`; the sibling `ExecuteSwapRequestSchema` (`:48-61`) constrains the same field with `z.number().positive()`. The route is unauthenticated (`router.ts:103`).
- **F285** (low, correctness) — `packages/demo/backend/src/utils/assets.ts:15`: `resolveAsset` does `token.address[chainId] === tokenAddress`, a case-sensitive match against checksum-cased config addresses (`config/assets.ts`), while swap (`swap.ts:113-114`) and lend (`lend.ts:76,107`) cast the caller address with no normalization and the wallet/borrow `AddressSchema` (`helpers/schemas.ts:10-13`) lowercases; a supported token sent lowercase returns "Asset not found" → 500.
- **F290** (low, correctness) — `packages/demo/backend/src/helpers/schemas.ts:46`: `AmountByHuman = z.strictObject({ amount: z.number().positive() })` (plus inline `z.number().positive()` in `lend.ts:22,35` and `swap.ts:50`) rejects `NaN` but not `Infinity`, so a non-finite amount passes the boundary and reaches SDK `parseUnits`/`parseAssetAmount` as an opaque 500; the `AmountByRaw .max(78)` branch shows the intended bounding discipline.
- **F297** (low, correctness) — `packages/demo/backend/src/helpers/schemas.ts:47-49` (consumed via `AmountExactSchema`/`AmountWithMaxSchema` at `:57-75`): `AmountByRaw = z.string().regex(/^\d+$/).max(78)` has no positivity refine while the sibling `AmountByHuman` requires `.positive()`, so `amountRaw:"0"` (BigInt `0n`) flows into every fund-moving borrow route (`controllers/borrow.ts:28,34,40,45,50,91,111,131,152,173`); the SDK does not close the raw path (`validateAmountPositiveIfExists` checks only the number `amount`; Morpho drops `0n`).
- **F299** (low, info) — `packages/demo/backend/src/helpers/schemas.ts:28-42`: `ChainIdSchema`/`ChainIdStringSchema` validate only positive-integer and cast `as SupportedChainId` with no `SUPPORTED_CHAIN_IDS` membership check, unlike `swap.ts:17-25` `chainIdFromNumber`/`chainIdFromString`; mitigated today for borrow by the allowlist re-resolution (`services/borrow.ts:91` `m.chainId === chainId`), but the cast lies and a future shared-schema consumer without that re-check forwards an unsupported chain into SDK chain lookups. (`lend.ts:28,41` is the same gap inlined; ledger F284, sibling locus.)
- **F281** (low, info) — `packages/demo/backend/src/controllers/lend.ts:61-118` (`services/lend.ts:42-52`): `openPosition`/`closePosition` accept `tokenAddress` and `marketId.{address,chainId}` independently and forward both to `wallet.lend.openPosition` with no server-side assertion that the resolved asset is the market's underlying; unlike the borrow controller (re-resolves kind/market from an allowlist, `services/borrow.ts:85-106`), the lend controller has no asset/market reconciliation, so it relies entirely on the SDK guard filed as F008.

## Root cause

The backend grew two parallel conventions that were never reconciled:

- **Address casing:** the borrow/wallet path lowercases via `AddressSchema`; the swap/lend path passes the caller address through unnormalized and compares it `===` against checksum-cased config. Two contracts coexist in one backend (F285), and the chain-id casts (F299) similarly assert `SupportedChainId` without verifying it.
- **Amount positivity/finiteness:** `AmountByHuman` enforces `.positive()` but not `.finite()` (F290); its twin `AmountByRaw` enforces a width cap but not positivity (F297); and the swap quote schema enforces neither, unlike its execute sibling (F283). Each amount encoding gets a different subset of the same three checks (positive, finite, non-zero).
- **Cross-field reconciliation:** the borrow controller re-resolves market/asset from an allowlist server-side; the lend controller does not (F281), so the asset↔market binding is left entirely to the SDK.

In every case the SDK or a sibling route already encodes the correct discipline; the gap is that the weaker validator was never brought into line.

## Recommended approach

Demo backend ticket: **review-only, low-risk fund-safety/consistency fixes, no architectural refactor.** Each item is a schema/util-local change that brings a validator into line with its already-correct sibling. None require touching the SDK or restructuring controllers.

1. **Swap quote amount validation (F283):** mirror the execute schema on the quote schema. Validate each of `amountIn`/`amountOut` as a positive finite number after the `Number` transform (e.g. `.refine((v) => v === undefined || (Number.isFinite(v) && v > 0))`), and add a refinement requiring exactly one of `amountIn`/`amountOut`. Schema-only.

2. **Human-amount finiteness (F290):** add `.finite()` to the human-amount number validators so `Infinity` is a 400, not a downstream 500. Change `z.number().positive()` to `z.number().positive().finite()` in `helpers/schemas.ts` `AmountByHuman` and in the `lend.ts`/`swap.ts` inline amount schemas. (An optional sane upper `.lte()` bound is backlog, not required for parity.)

3. **Raw-amount positivity (F297):** add a positivity refine to `AmountByRaw` so the raw branch matches the human branch, e.g. `z.string().regex(/^\d+$/).max(78).refine((s) => BigInt(s) > 0n, 'amountRaw must be positive')`. One-line; gives positivity parity across both amount encodings without depending on the SDK closing the zero-borrow gap (F015).

4. **Address casing (F285):** normalize both sides of the `resolveAsset` comparison so a supported token is matched regardless of input casing. Compare via viem `getAddress()` (or both-lowercased) inside `resolveAsset`, and/or route the swap/lend caller addresses through the shared lowercasing `AddressSchema` like the borrow/wallet controllers already do. Util/schema-only.

5. **Chain-id membership (F299):** refine `ChainIdSchema`/`ChainIdStringSchema` against `SUPPORTED_CHAIN_IDS` (the swap controller's pattern) so the `as SupportedChainId` cast is honest and shared across all consumers. Mitigated today for borrow by the allowlist re-resolution, so this is the lowest-priority leg here; landing it makes the cast truthful for any future shared-schema consumer. (The inlined lend variant, ledger F284, is the same fix applied to `lend.ts:28,41`.)

6. **Lend asset/market reconciliation (F281):** **review-only, no backend change requested in this ticket.** The asset↔market binding is SDK-owned and is the subject of the lend-asset-market-validation work under #334 (`LendProvider.openPosition` will call `validateMarketAsset`). Once that SDK guard lands, the SDK is the enforcing layer and the demo backend inherits it. Recorded here only so the backend dependency is visible; optionally the lend controller could later mirror the borrow controller's allowlist re-resolution, but that is a backlog enhancement, not part of this hardening pass.

All six items stay inside the missing-obvious-validation / fail-closed-where-the-SDK-already-knows / sibling-consistency scope. No RPC-trust hardening, no intent-guessing, no broad refuse-to-sign: the fix is to run the positivity/finiteness/membership/casing checks a sibling route already runs.

## Affected files

- `packages/demo/backend/src/controllers/swap.ts:36-43` — `PriceRequestSchema` amountIn/amountOut bare `Number()`, no positivity/finiteness/exactly-one-of (F283)
- `packages/demo/backend/src/controllers/swap.ts:48-61` — `ExecuteSwapRequestSchema` positive-amount sibling to mirror (F283 reference)
- `packages/demo/backend/src/controllers/swap.ts:17-25` — `chainIdFromNumber`/`chainIdFromString` membership-refine reference pattern (F299 reference)
- `packages/demo/backend/src/helpers/schemas.ts:46` — `AmountByHuman` `.positive()` but no `.finite()` (F290)
- `packages/demo/backend/src/helpers/schemas.ts:47-49` — `AmountByRaw` no positivity refine (F297)
- `packages/demo/backend/src/helpers/schemas.ts:57-75` — `AmountExactSchema`/`AmountWithMaxSchema` consume both branches (F290/F297 consumers)
- `packages/demo/backend/src/helpers/schemas.ts:28-42` — `ChainIdSchema`/`ChainIdStringSchema` cast `as SupportedChainId` without membership check (F299)
- `packages/demo/backend/src/utils/assets.ts:15` — `resolveAsset` case-sensitive `===` against checksum-cased config (F285)
- `packages/demo/backend/src/controllers/lend.ts:22,35` — inline `z.number().positive()` amounts, no `.finite()` (F290)
- `packages/demo/backend/src/controllers/lend.ts:28,41` — inline `marketId.chainId` positivity-only, no membership (F299/F284 sibling)
- `packages/demo/backend/src/controllers/lend.ts:61-118` — open/close forward tokenAddress + marketId with no asset/market reconcile (F281, review-only)
- `packages/demo/backend/src/services/lend.ts:42-52` — service forwards asset/marketId to SDK unbound (F281 reference)
- `packages/demo/backend/src/controllers/borrow.ts:28,34,40,45,50,91,111,131,152,173` — fund-moving routes consuming the amount schemas (F297 impact)
- `packages/demo/backend/src/services/borrow.ts:85-106` — borrow allowlist re-resolution that mitigates F299 and is the reconciliation pattern F281 lacks (reference)

## Acceptance criteria / tests

Each test must fail when the validator is reverted to current behavior (encode why the asymmetry matters, not just that the schema runs).

- Swap quote (F283): `GET /swap/quote` with `amountIn=-1`, `amountIn=abc`, `amountIn=1e400`, and with both `amountIn`+`amountOut`, each returns 400 at the schema boundary instead of reaching `swapService.getQuote`; a single valid `amountIn` (and a single valid `amountOut`) still passes. Mirror the execute-path positive-amount assertion.
- Human amount (F290): a request with `amount: 1e309` (parses to `Infinity`) returns 400 from the schema, not a 500 from the SDK parse layer; a finite positive amount still passes. Assert on the human branch of `AmountExactSchema`/`AmountWithMaxSchema` and on the lend/swap inline schemas.
- Raw amount (F297): `AmountExactSchema.safeParse({ amountRaw: '0' })` fails, and `POST /borrow/position/open` with `borrowAmount: { amountRaw: '0' }` returns 400 (parity with `{amount:0}` already rejected by `AmountByHuman.positive()`); a positive `amountRaw` still parses to the expected `bigint`.
- Address casing (F285): `resolveAsset` returns the supported asset for the lowercase form of a checksum-cased config address (closes the case-sensitivity hole); an unsupported address still throws. Assert both checksum and lowercase representations resolve to the same asset.
- Chain-id membership (F299): `ChainIdSchema.safeParse(999999)` and `ChainIdStringSchema.safeParse('999999')` fail, while a value in `SUPPORTED_CHAIN_IDS` passes and is typed `SupportedChainId`; the borrow route that already re-resolves against the allowlist keeps its current 400/"not in allowlist" behavior.
- Lend reconciliation (F281): no new backend test required in this ticket; the asset↔market binding assertion lives with the SDK lend-asset-market-validation work under #334. Add a note-level reference test only if the optional backend allowlist re-resolution (item 6) is later implemented.

The request-schema validators currently have thin coverage; add the positivity/finiteness/membership/casing cases as unit tests on `helpers/schemas.ts`, `utils/assets.ts`, and the swap/lend controller schemas so the sibling asymmetries cannot silently regress.

## Notes

- This is a consolidated **review-only** backend hardening ticket. It carries no single existing issue: F285 maps to #475, F290/F297 to #303, and F299/F281 to #334, but the work here is the backend request-schema symmetry pass, not those issues' primary scope.
- **F281 overlaps #334.** The lend asset/market binding is the backend-locus shadow of SDK finding F008, which is the high-severity leg of the lend-asset-market-validation ticket (`docs/tickets/lend-asset-market-validation.md`, augmenting #334). That ticket's Notes already record this same backend dependency. F281 is included here only to make the backend gap visible alongside its sibling schema gaps; the enforcing fix is the SDK guard, not a backend refactor.
- **F299 vs F284.** F299 is the shared-schema locus (`helpers/schemas.ts` ChainIdSchema, used by borrow via `BorrowMarketIdSchema` and by the wallet borrow-position route). F284 (not in this ticket's resolves set) is the same gap inlined in `lend.ts:28,41`; fixing the shared schema (item 5) and reusing it for the lend `marketId.chainId` closes both at once and removes the inline duplicate.
- **F297 relates to F015.** F015 is the SDK-side zero-borrow open (Aave revert / Morpho silent-drop). The backend positivity refine (item 3) closes the raw path at the boundary regardless of whether the SDK eventually closes F015, so the two are independent and item 3 should not wait on the SDK fix.
- The amount finiteness/positivity work here is the request-boundary twin of the SDK amount-type findings (F041/F097/F151 family); this ticket only tightens the backend schema, it does not change SDK amount parsing.
