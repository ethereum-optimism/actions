# Review Pass 07 — API-Design Reviewer (Surface, Errors, Types)

**Pass:** 7
**Skill / lens:** api-design-reviewer — public-export surface completeness/symmetry, error-taxonomy consistency (named `ActionsError` vs bare `Error`), discriminated-union / type precision, doc-vs-behavior method contracts, breaking-change / semver risk, and missing export-surface / safety-default guard tests
**Surfaces:** swap, lend, borrow, wallet-core, wallet-hosted, wallet-smart, core-services

## Summary

This pass reviewed the published SDK contract — the `index.ts` / `index.node.ts` / `index.react.ts` barrels, the `core/error/errors.ts` named-error taxonomy, every action/wallet error module, and the exported param/return types — looking specifically for API-design defects rather than new fund-loss mechanics (the fund-loss surface is already densely covered by the F001-F117 clusters, which were re-derived and not re-filed). Three themes dominate: (1) the named-error taxonomy is leaky — several public error classes extend bare `Error` instead of `ActionsError`, and several throw sites emit bare `Error` strings, so an integrator's `catch (e) { if (e instanceof ActionsError) ... }` silently misclassifies them (SDK side of #474); (2) the public-export surface is asymmetric and unguarded — providers/types exported on one side of a sibling pair and dropped on the other, two `export *` error wildcards, and `index.exports.spec.ts` pins only 4 of ~141 symbols, so refactors silently break the published API (the #483 / #131 export-and-build-surface gap); (3) several public param/return types lack precision — untagged receipt unions, an open-ended `ApyBreakdown` index signature, a wrong `_closePosition` return type, `signWith: string` covering three meanings, and a `number`-only amount contract on lend/swap where borrow exposes a precise `amountRaw` union (#337 / #379 / #475).

**Incoming findings:** 52 across 7 surfaces.
**Outcome:** 34 NEW (F118–F151), 11 REFINES, 7 DUP (deduped against existing ledger rows and consolidated across surfaces; the recurring "throws bare Error" and "export gap" patterns are filed once per distinct surface/locus, not collapsed, because the fix lands in a different module each time).

**Counts by severity (NEW + REFINES recorded — 45 rows):**
- high: 1 (`SmartWalletDeploymentError` is a named public return-type field that is never exported, so consumers cannot `instanceof`-narrow the error they are handed)
- medium: 9
- low: 35

**Notable highlights:**
- **`SmartWalletDeploymentError` is the load-bearing API-contract defect:** it is the declared type of `SmartWalletCreationResult.deployments[].error` (returned from the public `createSmartWallet()`), the provider branches on `instanceof SmartWalletDeploymentError` internally, yet the class is **never exported** from `src/index.ts` AND it **extends bare `Error`** not `ActionsError`. A consumer handed a failed deployment cannot name the type, cannot `instanceof`-narrow it, and cannot recover the structured `chainId`/`receipt` to retry the right chain (F142/F143).
- **The named-error taxonomy is split in four more places that reach the public surface:** the three ENS errors (`EnsNotConfiguredError`/`EnsResolutionError`/`EnsRpcError`) extend bare `Error` on the recipient-resolution path (F150); the two `velodrome v2.ts` router-type switches (F121), the borrow `requireOwnMarket` (F130), and the hosted Dynamic `createSigner` (F139) each throw bare `Error` outside the otherwise-uniform `ActionsError` tree.
- **The export surface is both asymmetric and unguarded:** `AaveLendProvider` is dropped from the root index while its lend siblings and the entire borrow provider pair are exported (F125); `MorphoBorrowMarketConfig` is dropped while `AaveBorrowMarketConfig` is exported (F128); hosted node exports only Privy classes, react only `DynamicWallet`, Turnkey classes are unexported (F140); and `index.exports.spec.ts` guards only 4 borrow symbols, so every one of these gaps shipped with green CI (F147, plus F122/F124).
- **`#131` was root-caused:** all 10 hosted-wallet vendor SDKs are hard `peerDependencies` with no `peerDependenciesMeta.optional`, and the published node/react barrels statically value-import Privy/Dynamic vendor code through class re-exports, defeating the registry's lazy `import()` — so a single-vendor install pulls (and under strict installers fails on) vendors it never uses (F149).
- **Receipt return types are untagged unions** forcing runtime shape-sniffing (`Array.isArray` + `'userOpHash' in receipt`), and the abstract `Wallet.send`/`sendBatch` JSDoc says "transaction hash" while every implementation returns a full receipt (F132/F134). The smart-wallet contract also leaks viem's `WaitForUserOperationReceiptReturnType` as a public return type, coupling the SDK API to a vendor internal (F146).

---

## Surface: swap

### F118 (NEW) — `permit2ExpirationSeconds` read off provider config via an `as` cast that is type-invisible on every provider except Uniswap
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/core/SwapProvider.ts:118-125
- **Severity:** medium
- **Class:** correctness
- **Title:** `permit2ExpirationSeconds` (a signing-path Permit2-expiry override) is read off `this._config` via an `as { permit2ExpirationSeconds?: number }` cast that bypasses the type system; the field is declared only on `UniswapSwapProviderConfig`, absent from the base `SwapProviderConfig` and `VelodromeSwapProviderConfig`, so the override is type-invisible / silently swallowed on every non-Uniswap provider
- **Detail:** `get permit2ExpirationSeconds()` resolves the Permit2 sub-approval window as `(this._config as { permit2ExpirationSeconds?: number }).permit2ExpirationSeconds ?? this._settings.permit2ExpirationSeconds ?? DEFAULTS.permit2ExpirationSeconds`. The cast defeats type checking: the field is declared ONLY on `UniswapSwapProviderConfig` (providers/uniswap/types.ts:24) and on the shared `SwapSettings` (types/actions.ts:117), but NOT on the base `SwapProviderConfig` (types/swap/base.ts:22-35). `VelodromeSwapProviderConfig` (providers/velodrome/types.ts:27-30) has no such member, so an integrator who tries to tighten the per-provider Permit2 expiry on any non-Uniswap provider gets no type error and no effect — the value is silently swallowed. This expiry governs how long a Permit2 allowance (max-mode = `maxUint160` standing spend) remains valid, so a config field that looks settable but is type-invisible / silently ignored is a fund-safety-relevant contract hole. The `as`-cast is the protocol-SDK-boundary erosion the #337 lens targets, here on a signing-path default.
- **Exploit/repro:** `new VelodromeSwapProvider({ ...allowlist, permit2ExpirationSeconds: 600 } as any, cm)` — no TS error because the field is not on `VelodromeSwapProviderConfig`; Velodrome does not consume it, and even on a future Permit2-using provider the cast would mask a missing declaration. The getter compiles against ANY `_config` shape.
- **Recommendation:** Declare `permit2ExpirationSeconds?: number` once on the base `SwapProviderConfig` and delete the local redeclaration in `UniswapSwapProviderConfig` and the `as`-cast in the getter, so the override is discoverable and type-checked on every provider. Add a guard test asserting a provider-config `permit2ExpirationSeconds` reaches `buildPermit2Approvals`' `expirySeconds`.
- **suggestRefactor:** true
- **Candidate issue:** #337
- **Dedup status:** new

### F119 (NEW) — `SwapPriceParams` is exported public surface with zero references and no backing method (dead public API)
- **Surface:** swap
- **File:** packages/sdk/src/types/swap/base.ts:136-149
- **Severity:** low
- **Class:** info
- **Title:** `SwapPriceParams` is an exported public type with zero references and no backing method; an integrator can import and build against a contract the SDK never honors
- **Detail:** `SwapPriceParams` is exported transitively (base.ts → types/swap/index.ts → types/index.ts) and is part of the published type surface, yet a repo-wide grep finds zero references to it — there is no `getPrice`/price-only public method that takes it. Compounding this, the sibling `SwapPrice` shape (the internal provider-quote return type) is ALSO exported and overlaps `SwapQuote` (amountIn/amountInRaw/route/priceImpact) while carrying string `price`/`priceInverse` fields that differ from `SwapQuote`'s number fields — two near-duplicate public price types invite caller confusion about which is the real quote contract. Per the breaking-change lens, exporting a type with no producer/consumer is surface bloat that later cannot be changed without a semver bump even though nothing uses it.
- **Exploit/repro:** `grep -rn 'SwapPriceParams' packages/sdk/src` returns only its own definition; no constructor, method param, or call site references it.
- **Recommendation:** Either wire `SwapPriceParams` to a real read-only price method (`actions.swap.getPrice(params): Promise<SwapPrice>`) if a price-only API is intended, or stop exporting it (and `SwapPrice` if it is meant to be an internal provider shape). Add an export-surface snapshot test (the #483 generalization) that fails when a type is exported with no internal producer.
- **suggestRefactor:** true
- **Candidate issue:** #483
- **Dedup status:** new

### F120 (NEW) — exact-output is a per-provider capability with no discriminated-union surfacing; the price-routing path silently drops Velodrome's `ExactOutputNotSupportedError` via `Promise.allSettled`
- **Surface:** swap
- **File:** packages/sdk/src/types/swap/base.ts:79-103,154-173
- **Severity:** low
- **Class:** correctness
- **Title:** `WalletSwapParams` / `SwapQuoteParams` model exact-input vs exact-output as two optional sibling fields with no discriminated union and no per-provider capability surfacing; exact-output is provider-specific (Velodrome throws at runtime) and the multi-provider price-routing path silently drops the rejected provider
- **Detail:** `WalletSwapParams` and `SwapQuoteParams` model exact-input vs exact-output purely as `amountIn?`/`amountOut?` optional siblings with no discriminated union and no capability surface. Uniswap supports exact-output; Velodrome throws `ExactOutputNotSupportedError` at runtime (VelodromeSwapProvider.ts:76-77,141-142). On the explicit-provider path a Velodrome exact-output request throws (acceptable). But on the first-class price-routing path (`settings.routing:'price'`), `fetchAllQuotes` (BaseSwapNamespace.ts:250-275) maps every eligible provider through `getQuote` inside `Promise.allSettled` and keeps only fulfilled results — so a Velodrome exact-output rejection is silently filtered out, and when no provider succeeds the caller gets the generic `MarketNotAllowedError('All providers failed')` (BaseSwapNamespace.ts:233-239) with no signal that the real cause was an unsupported swap direction. The public types give callers no compile-time or pre-execution way to know exact-output is unsupported for a given provider/pair.
- **Exploit/repro:** With `routing:'price'` and both providers configured, `actions.swap.getQuote({ assetIn, assetOut, amountOut: 1000, chainId })` runs `fetchAllQuotes`; Velodrome's `getQuote` throws `ExactOutputNotSupportedError` which `allSettled` marks `'rejected'` and the filter on BaseSwapNamespace.ts:271-273 discards with no diagnostic.
- **Recommendation:** Surface exact-output capability explicitly: model the params as a discriminated union (`{ kind:'exactIn'; amountIn } | { kind:'exactOut'; amountOut }`) and expose a per-provider `supportsExactOutput()` predicate the namespace consults before routing, or at minimum stop swallowing `ExactOutputNotSupportedError` in `fetchAllQuotes`. Add a routing test: exactOut request across {uniswap,velodrome} asserts the Velodrome rejection is reported, not silently dropped.
- **suggestRefactor:** true
- **Candidate issue:** #440
- **Dedup status:** new (the swallow mechanism overlaps F098, but the root here is the type-level absence of an exact-output capability discriminant)

### F121 (NEW) — Velodrome v2 router-type switch throws bare `throw new Error('Unknown router type')` (the SDK side of the #474 named-error gap on the swap surface)
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/v2.ts:101,203
- **Severity:** low
- **Class:** info
- **Title:** Velodrome v2 router-type switch throws bare `throw new Error('Unknown router type: ...')` at two sites — the only two non-`ActionsError` throws in the swap surface
- **Detail:** The swap surface otherwise consistently uses the named `ActionsError` taxonomy (MarketNotAllowedError, ExactOutputNotSupportedError, ProviderNotConfiguredError, QuoteRecipientMismatchError, etc.). The two exceptions are `throw new Error(\`Unknown router type: ${routerType as string}\`)` at v2.ts:101 and v2.ts:203. These bare Errors are not `instanceof`-narrowable by integrators using the documented `ActionsError` catch pattern, carry no structured metaMessages, and collapse into whatever generic handler the integrator wired. While the branch is an internal invariant (an unrecognized `routerType` discriminant), it is reachable if config/markets yield a `routerType` outside the known set, and the `as string` cast hints the discriminant is not exhaustively typed here.
- **Exploit/repro:** `grep -rn 'throw new Error(' packages/sdk/src/actions/swap` returns exactly v2.ts:101 and v2.ts:203; all other swap throws are `ActionsError` subclasses.
- **Recommendation:** Replace both bare throws with a named error (e.g. `UnsupportedRouterTypeError extends ActionsError` carrying `routerType`/`chainId`, or reuse `ProviderNotConfiguredError`). Tighten `routerType` to a closed union and use an exhaustive `never` check. Fold into the #474 retrofit.
- **suggestRefactor:** true
- **Candidate issue:** #474
- **Dedup status:** new

### F122 (NEW) — No export-surface snapshot / safety-defaults guard test for the swap public API; a refactor can silently drop an export (and partially weaken safety defaults)
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/index.ts:1-20
- **Severity:** low
- **Class:** info
- **Title:** No snapshot/guard test pins the swap public export set; the safety-relevant `SwapProvider.DEFAULTS` are partially pinned by `SwapProvider.test.ts` (see dedup note) but the export-set guard is absent
- **Detail:** The swap package exports five value symbols and four config types (actions/swap/index.ts) plus the type surface threaded through the top-level index.ts (SwapQuote, SwapQuoteParams, WalletSwapParams, SwapMarket, etc., index.ts:135-156). There is no snapshot/guard test asserting the exact set of public exports. The safety-relevant hardcoded defaults in `SwapProvider.DEFAULTS` (slippage 0.005, maxSlippage 0.5, quoteExpirationSeconds 30, permit2ExpirationSeconds 2_592_000, SwapProvider.ts:62-67) gate the F001/F110 negative-min-out hazard; the core-services reviewer verified `SwapProvider.test.ts` ALREADY asserts these literals, so a refactor weakening them would fail CI — that portion of the directive is covered. This row is filed for the genuinely-absent export-set snapshot.
- **Exploit/repro:** No test asserts the index.ts swap export set; dropping a config-type export from actions/swap/index.ts leaves the suite green.
- **Recommendation:** Add a swap export-surface snapshot test (generalize per #483) pinning exported symbol/type names. Wire alongside the missing build-without-all-deps test (#131).
- **suggestRefactor:** true
- **Candidate issue:** #483
- **Dedup status:** new (defaults-guard portion already covered by `SwapProvider.test.ts`; export-set guard is absent)

### (refines:F114) — `getQuotes` public-method return contract (sort objective, possibly-empty array, validation skipped vs execute) is under-specified relative to its safety implications
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/namespaces/BaseSwapNamespace.ts:81-111,244-275
- **Severity:** low
- **Class:** info
- **Title:** `getQuotes` public-method contract is under-specified: its JSDoc promises "sorted by amountOut descending (best first)" but the sort is direction-blind (F114 locus), and returned quotes are full pre-built-calldata quotes produced WITHOUT the execute()-path validations
- **Detail:** `getQuotes` is public API with two contract gaps: (1) its docstring promises results "sorted by amountOut descending (best first)", but the sort maximizes `amountOutRaw` regardless of swap direction — for exact-output every provider returns the same target and ordering is arbitrary (this is the public docstring face of F114); (2) like provider-level `getQuote` (F001 cluster), the quotes are full pre-built-calldata produced WITHOUT `validateSwapExecute` (same-asset, allowlist, slippage<=maxSlippage, recipient), and the method contract does not warn a returned quote may encode calldata `execute()` would reject. Documentation/contract-precision gaps, info-level since the underlying mechanics are already filed.
- **Exploit/repro:** For an exactOut request to two providers the "best first" order is whichever yields the larger `amountOutRaw` — undefined for equal exact-output targets.
- **Recommendation:** Tighten the `getQuotes` JSDoc to state ordering is `amountOutRaw`-descending (only meaningful for exact-input) and that returned quotes are price/preview quotes not yet validated for execution; once F114's direction-aware comparator lands, make "best first" truthful. Add a contract test on the documented ordering.
- **suggestRefactor:** false
- **Candidate issue:** #435
- **Dedup status:** refines:F114

---

## Surface: lend

### F123 (NEW) — `LendProviderMethods._closePosition` return-type contract is wrong (`Promise<TransactionData>`) vs every implementation's `Promise<LendTransaction>`
- **Surface:** lend
- **File:** packages/sdk/src/types/lend/base.ts:373
- **Severity:** low
- **Class:** correctness
- **Title:** The published `LendProviderMethods._closePosition` interface declares `Promise<TransactionData>` but the abstract base and both providers return a full `Promise<LendTransaction>`; the exported type contract materially lies about the close-path shape
- **Detail:** `LendProviderMethods` (types/lend/base.ts:373) declares `_closePosition(params): Promise<TransactionData>`. But the abstract base `LendProvider._closePosition` (LendProvider.ts:353-355) and both concrete providers return `Promise<LendTransaction>` (with `amount`, `assetAddress`, `marketId`, `apy`, `transactionData`), not a bare `TransactionData`. A consumer typing against `LendProviderMethods` would mis-handle the return (e.g. read `.position` off a `TransactionData` that is actually nested under `.transactionData`). It is also out of sync with the abstract signature, so the interface is dead/unenforced documentation that has already drifted.
- **Exploit/repro:** Read base.ts:373 (`Promise<TransactionData>`) against `AaveLendProvider._closePosition`/`MorphoLendProvider._closePosition` (both `Promise<LendTransaction>`).
- **Recommendation:** Change `LendProviderMethods._closePosition` to `Promise<LendTransaction>`, or delete the unused interface if the abstract class is the single source of truth. Add an `expectTypeOf` binding the interface to the abstract method signatures so future drift fails CI.
- **suggestRefactor:** true
- **Candidate issue:** #209
- **Dedup status:** new

### F124 (NEW) — Public export-surface guard test covers only borrow providers, leaving the lend re-exports (and the `AaveLendProvider` gap) unguarded
- **Surface:** lend
- **File:** packages/sdk/src/__tests__/index.exports.spec.ts:16-26
- **Severity:** low
- **Class:** info
- **Title:** `index.exports.spec.ts` asserts only the borrow providers + Morpho market-id helpers are re-exported; it never asserts anything about the lend surface, so the `AaveLendProvider` omission (F125) shipped undetected
- **Detail:** `index.exports.spec.ts` asserts `BorrowProvider`/`MorphoBorrowProvider` and the Morpho market-id helpers are re-exported from `@/index.js`, but never asserts the lend surface (`LendProvider`, `AaveLendProvider`, `MorphoLendProvider`). This is exactly the #483 scenario; the missing assertion is load-bearing — had a lend analogue existed, the F125 `AaveLendProvider` omission would have been caught. The asymmetry also means a future refactor dropping `MorphoLendProvider` from the root index would pass CI.
- **Exploit/repro:** Drop `AaveLendProvider`/`MorphoLendProvider` from the root index re-export; the suite stays green.
- **Recommendation:** Extend `index.exports.spec.ts` with a lend block mirroring the borrow block. Generalizing to a single snapshot/guard over the entire root export set (the #483 direction, captured as F147) would catch every future drop in one test.
- **suggestRefactor:** true
- **Candidate issue:** #483
- **Dedup status:** new

### F125 (NEW) — Asymmetric public export: `AaveLendProvider` is dropped from the package root index while `LendProvider`/`MorphoLendProvider` (and the whole borrow provider pair) are re-exported
- **Surface:** lend
- **File:** packages/sdk/src/index.ts:13
- **Severity:** medium
- **Class:** info
- **Title:** `AaveLendProvider` is silently absent from the published SDK root surface; an integrator importing it from the package root (the way they import `AaveBorrowProvider`) gets `undefined`, with no compile error
- **Detail:** The lend barrel `actions/lend/index.ts` exports all three classes (`LendProvider`, `AaveLendProvider`, `MorphoLendProvider`), and the borrow sibling re-exports both `AaveBorrowProvider` and `MorphoBorrowProvider` from the root (index.ts:3-6). But the root `@/index.ts:13` only re-exports `{ LendProvider, MorphoLendProvider }` — `AaveLendProvider` is absent. The two providers in a sibling pair should be exported symmetrically, and the lend pair diverges from the borrow pair's convention. Almost certainly an accidental gap.
- **Exploit/repro:** In a consumer: `import { AaveLendProvider } from '@op/actions-sdk'` resolves to `undefined`; `import { AaveBorrowProvider }` works.
- **Recommendation:** Add `AaveLendProvider` to the root `@/index.ts` lend re-export line so the lend provider pair matches the borrow pair and the lend barrel.
- **suggestRefactor:** false
- **Candidate issue:** #483
- **Dedup status:** new

### F126 (NEW) — `isMarketAsset`/`validateMarketAsset` compares possibly-undefined per-chain addresses with raw `===`, so two assets neither configured on the market chain validate as equal (and the comparison is case-sensitive)
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/utils/markets.ts:70-76
- **Severity:** low
- **Class:** correctness
- **Title:** `isMarketAsset` returns `marketAssetAddress === providedAssetAddress`; if neither asset has an entry for `chainId` both are `undefined` and `undefined === undefined` is `true`, so an asset not even configured on the market's chain passes the close-path asset guard
- **Detail:** `isMarketAsset` computes `marketAssetAddress = market.asset.address[chainId]` and `providedAssetAddress = asset.address[chainId]` and returns `marketAssetAddress === providedAssetAddress`. If neither has an entry for that `chainId`, both yield `undefined`, and `undefined === undefined` is `true` — so a caller-supplied asset not configured on the market's chain passes the asset guard (`closePosition` calls `validateMarketAsset` at LendProvider.ts:206). The comparison is also case-sensitive (no `.toLowerCase()`) unlike the sibling `lendMarketIdMatches` (markets.ts:20), so a checksummed-vs-lowercase mismatch would falsely reject. This is the validator-internal weakness behind the F008 asset-mismatch family.
- **Exploit/repro:** Supply an asset whose `address` map has no entry for the market's `chainId`; both lookups are `undefined`, the guard returns `true`, and the wrong asset passes.
- **Recommendation:** Reject when either resolved address is `undefined`, and compare case-insensitively via `isAddressEqual`/`.toLowerCase()` to match `lendMarketIdMatches`. Closes the `undefined===undefined` hole and the checksum divergence in one place.
- **suggestRefactor:** false
- **Candidate issue:** #334
- **Dedup status:** new (validator-internal root distinct from the F008 caller-side asset-mismatch family)

### F127 (NEW) — `ApyBreakdown` open-ended `[key: string]: number | undefined` index signature erases type precision on a public return type and lets `undefined` leak as a numeric field
- **Surface:** lend
- **File:** packages/sdk/src/types/lend/base.ts:146-157
- **Severity:** low
- **Class:** info
- **Title:** `ApyBreakdown` (on `LendMarket.apy` / `LendTransaction.apy`) declares four named numeric fields plus `[key: string]: number | undefined`, so even the named fields widen to `number | undefined` for computed-key access and arbitrary reward keys are indistinguishable from typos
- **Detail:** Because the index signature includes `undefined`, the named fields widen to `number | undefined` for any property accessed via a computed key, and arbitrary reward-token keys are indistinguishable from typos at the type level. The Morpho path spreads `...rewardTokens` (sdk.ts:483-491) of unvalidated GraphQL-derived numbers into this object while the Aave path supplies a fixed shape — so the same public type carries two structurally different payloads with no discriminant. Consumers cannot statically tell which reward keys exist, and `apy.total` is nominally `number` but the index signature undermines that guarantee. Pairs with the F101/#337 any-typed reward ingestion (the finiteness side); this is the type-precision side.
- **Exploit/repro:** `apy['someComputedKey']` is typed `number | undefined`; a reward-key typo compiles cleanly and reads `undefined`.
- **Recommendation:** Split the per-token reward map into a dedicated nested field (e.g. `rewardsByToken: Record<Address, number>`) so the four headline fields stay precisely `number`, drop `undefined` from the value union (all keys are initialized to 0), and consider a provider discriminant if Aave vs Morpho payloads diverge.
- **suggestRefactor:** true
- **Candidate issue:** #337
- **Dedup status:** new (relates to F101 finiteness; type-precision root is distinct)

### (refines:F011) — Lend providers throw bare `Error` from catch-alls and base `buildLendApproval`, collapsing the named `ActionsError` taxonomy on the signing path (SDK side of #474)
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts:79-83,117-118,206-208
- **Severity:** low
- **Class:** info
- **Title:** Both lend providers wrap open/close/getPosition bodies in `try { ... } catch { throw new Error('Failed to ...') }` and the base `LendProvider.buildLendApproval` throws a bare `Error`, discarding named `ActionsError` instances and the original cause on the signing path
- **Detail:** Both providers (AaveLendProvider 79-83/117-118/206-208, MorphoLendProvider 80-83/130/214-216) and `LendProvider.buildLendApproval` (LendProvider.ts:282) throw bare `Error`. A `MarketNotAllowedError`/`ChainNotSupportedError` raised inside the try surfaces as the opaque string `'Failed to close position'` with the cause dropped (no `{ cause }`). The API-contract framing of the F011 family: the lend action namespace has no named-error contract (unlike core/wallet/smart/ens), so integrators cannot `instanceof`-discriminate a config/validation rejection from a transient RPC failure.
- **Exploit/repro:** Trigger `MarketNotAllowedError` inside `closePosition`'s try; the caller receives `Error('Failed to close position')` with no cause.
- **Recommendation:** Rethrow named `ActionsError` instances unchanged (`if (error instanceof ActionsError) throw error`), and when wrapping, preserve the cause. Make the `buildLendApproval` missing-spender throw a named error. Align with #474.
- **suggestRefactor:** true
- **Candidate issue:** #474
- **Dedup status:** refines:F011

### (refines:F102) — `openPosition` exposes no approvalMode/asset-precision contract symmetry with `closePosition` and `getMarkets` accepts a caller `markets[]` override that bypasses the allowlist prefilter
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/core/LendProvider.ts:141-154,84-118
- **Severity:** low
- **Class:** correctness
- **Title:** Two API-contract asymmetries on `LendProvider`: `getMarkets` forwards a caller `params.markets` verbatim (bypassing `filterMarketConfigs`/allowlist, the read-path twin of F081/F102), and `openPosition` never validates `params.asset` against the resolved market underlying the way `closePosition` does
- **Detail:** (a) `getMarkets` accepts `params.markets` and forwards `params.markets || filteredMarkets`, so a caller array bypasses allowlist prefiltering and `_getMarkets` trusts it — the read-path twin of the F081/F102 write-path fail-open. (b) `openPosition` validates `walletAddress` and allowlist but, unlike `closePosition` (which calls `validateMarketAsset` at line 206), never validates `params.asset` against the resolved underlying — the open/close asymmetry of the F008 family, framed as an inconsistent method contract within one class.
- **Exploit/repro:** `getMarkets({ markets: [arbitraryConfig] })` returns the caller array unfiltered; `openPosition` accepts a `params.asset` that does not match the market underlying with no asset guard.
- **Recommendation:** Constrain the `getMarkets({ markets })` override so a caller array is intersected with the allowlist (or mark it an allowlist-bypassing power-user path), and run the same asset-vs-market check in `openPosition` that `closePosition` runs. Capture both as a single "lend method-contract symmetry" refactor.
- **suggestRefactor:** true
- **Candidate issue:** #334
- **Dedup status:** refines:F102

### (refines:F101) — Morpho GraphQL fetch returns `any`/`Promise<any>` at the protocol-SDK boundary with no response schema validation
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/providers/morpho/api.ts:17-20,82-83
- **Severity:** low
- **Class:** info
- **Title:** `fetchRewards` is typed `Promise<any | null>` and casts `response.json()` to `any`; downstream `calculateRewardsBreakdown`/`calculateBaseApy` also take `any`, so external GraphQL numbers flow into the public `LendMarket.apy` with no runtime guard (the #337/API-design framing of F101)
- **Detail:** `fetchRewards` reads `vaultData.data?.vaultByAddress` with no shape validation; the downstream consumers in sdk.ts (80,467,515) also take `any`. External GraphQL numbers (`supplyApr`, `supplyAssetsUsd`) flow into displayed APY with only `|| 0` coalescing. The financial-correctness consequence is already F101/F337; this records the API-design framing — the public `LendMarket.apy` is computed from an untyped boundary so the type system provides no protection against the upstream schema changing.
- **Exploit/repro:** Upstream Morpho GraphQL renames/retypes a field; nothing in the SDK type-checks against it.
- **Recommendation:** Define a narrow response type (or zod schema per #475) for the Morpho GraphQL payload, validate at the boundary, and replace the `any` parameters with the concrete Morpho SDK vault type.
- **suggestRefactor:** true
- **Candidate issue:** #337
- **Dedup status:** refines:F101

### (refines:F014) — Aave `getReserve` rebuilds a fresh ethers `JsonRpcProvider` from the chain's default/public RPC, bypassing the integrator-supplied client (RPC-trust, info only)
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/providers/aave/sdk.ts:108-118
- **Severity:** low
- **Class:** info
- **Title:** `getReserve` constructs `new providers.JsonRpcProvider(rpcUrl)` from `publicClient.chain?.rpcUrls.default.http[0]`, so market data (APY, supply metrics on the public `LendMarket`) is read from a potentially different RPC than the integrator vetted
- **Detail:** The viem `publicClient` is used only to read the URL, then discarded for the Aave SDK calls. Per the pass rules RPC-trust is out of scope for a fix; recording the API-design framing of the already-logged F014.
- **Exploit/repro:** Configure a custom transport on the viem client; `getReserve` still reads from the chain's default public RPC URL.
- **Recommendation:** Info only. If revisited, thread the integrator's transport into the ethers provider (or move Aave reads onto viem); tracked broadly by #211.
- **suggestRefactor:** false
- **Candidate issue:** #211
- **Dedup status:** refines:F014

---

## Surface: borrow

### F128 (NEW) — Public-export asymmetry: `AaveBorrowMarketConfig` is exported but `MorphoBorrowMarketConfig` is not, so Morpho-allowlist integrators have no narrowed public type
- **Surface:** borrow
- **File:** packages/sdk/src/index.ts:92-93,134
- **Severity:** low
- **Class:** info
- **Title:** The root barrel exports `AaveBorrowMarketConfig`/`AaveBorrowMarketParams` and the Morpho `MorphoMarketParams` struct, but never the narrowed Morpho config variant `MorphoBorrowMarketConfig`, so a Morpho borrow allowlist entry must be hand-rolled or fall back to the broad union
- **Detail:** `MorphoBorrowMarketConfig` (types/borrow/market.ts:109-112, `Extract<BorrowMarketConfig,{kind:'morpho-blue'}>`) is unexported while the Aave sibling alias is first-class. `BorrowProviderConfig.marketAllowlist` is typed `BorrowMarketConfig[]` (types/borrow/internal.ts:62), so an integrator wiring a Morpho allowlist with a properly-narrowed entry (carrying `marketParams`) must hand-roll the discriminated shape. Since `BorrowMarketConfig` itself is exported, this is ergonomics/symmetry (the #483 export-symmetry + #493 kind/variant audit), hence info severity.
- **Exploit/repro:** `import { AaveBorrowMarketConfig } from '<sdk>'` works; `import { MorphoBorrowMarketConfig }` fails (not exported), though both variants of `BorrowMarketConfig` exist.
- **Recommendation:** Add `MorphoBorrowMarketConfig` to the public `export type { ... }` block in index.ts for symmetry with the Aave variant. Pair with the export-surface snapshot test (F147).
- **suggestRefactor:** true
- **Candidate issue:** #483
- **Dedup status:** new

### F129 (NEW) — `BaseBorrowNamespace.getMarkets` documents `@throws ChainNotSupportedError` but `Promise.allSettled`+`flatMap` swallows it, contradicting the provider-level `getMarkets` which DOES throw
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/namespaces/BaseBorrowNamespace.ts:38,40-49
- **Severity:** low
- **Class:** correctness
- **Title:** `BaseBorrowNamespace.getMarkets` wraps every provider read in `allSettled`+`flatMap`, silently dropping the `ChainNotSupportedError` its own JSDoc promises; the provider-level `BorrowProvider.getMarkets` runs `assertChainSupported` up front and throws — two public entry points to the same operation with opposite contracts
- **Detail:** `BaseBorrowNamespace.getMarkets` (40-49) `flatMap`s only fulfilled results, so any rejection — including the documented `ChainNotSupportedError` (JSDoc line 38) — is dropped and the caller gets a shorter/empty array. Meanwhile `BorrowProvider.getMarkets` (core/BorrowProvider.ts:215-220) runs `assertChainSupported(params.chainId)` and DOES throw. So `provider.getMarkets({chainId})` throws while `namespace.getMarkets({chainId})` returns `[]`; a frontend filtering by an unsupported chain gets a false "no markets" and the documented throw is a lie. The borrow analogue of the swap getMarket/fetchAllQuotes swallow (F098) but here it directly contradicts the method's own JSDoc.
- **Exploit/repro:** Call `namespace.getMarkets({ chainId: <unsupported> })` → returns `[]`; `provider.getMarkets({ chainId: <unsupported> })` → throws `ChainNotSupportedError`.
- **Recommendation:** Hoist an explicit `validateChainSupported(params.chainId, this.supportedChainIds())` before the `allSettled` so the documented `@throws` fires (matching the provider-level behavior); or drop the `@throws` from the JSDoc and document `getMarkets` as fail-soft. Prefer the former for parity.
- **suggestRefactor:** true
- **Candidate issue:** none
- **Dedup status:** new (relates to F098; distinct because it contradicts the method's own JSDoc and diverges from the provider sibling)

### F130 (NEW) — `requireOwnMarket` throws a bare `Error`, the only borrow throw outside the named-error taxonomy used everywhere else in the surface
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/core/BorrowProvider.ts:277-286
- **Severity:** low
- **Class:** info
- **Title:** `requireOwnMarket` throws `new Error(\`${this.constructor.name} received a ${market.kind} market config\`)` — the single borrow throw outside the named `ActionsError` taxonomy; collapses a cross-provider routing/misconfiguration path into an uncatchable-by-class Error
- **Detail:** Every other borrow failure path throws a named error (InvalidParamsError, MarketNotAllowedError, ProviderNotConfiguredError, ChainNotSupportedError, EmptyPositionError, BorrowMarketParamsMismatchError, QuoteRecipientMismatchError). The exception is `requireOwnMarket` (BorrowProvider.ts:281). This is a cross-provider routing/misconfiguration path (a market of the wrong kind reaching a provider); the unnamed Error means integrators cannot `instanceof`-discriminate it and a top-level `mapSdkError`/`onError` cannot classify it. The borrow side of the #474 named-errors retrofit; borrow is otherwise compliant.
- **Exploit/repro:** Route a `morpho-blue` market config into the Aave provider; `requireOwnMarket` throws a bare Error indistinguishable by type from a runtime fault.
- **Recommendation:** Throw a named error (a new `MarketKindMismatchError`, or reuse `InvalidParamsError({param:'market.kind', expected:this.marketKind, received:market.kind})`) so the borrow surface has a uniform, catchable taxonomy.
- **suggestRefactor:** true
- **Candidate issue:** #474
- **Dedup status:** new (relates to F011 family; distinct locus named here for the borrow surface)

### F131 (NEW) — `BorrowReceipt.positionAfter` is typed optional but dispatch always populates it from `quote.positionAfter`, advertising a weaker (and post-state-claiming) contract than delivered
- **Surface:** borrow
- **File:** packages/sdk/src/types/borrow/quote.ts:112-113
- **Severity:** low
- **Class:** info
- **Title:** `BorrowReceipt.positionAfter` is declared `positionAfter?: BorrowMarketPosition` but `WalletBorrowNamespace.dispatch` unconditionally sets it from `quote.positionAfter`; the optional type forces an impossible-undefined branch and papers over the F054 semantics that `positionAfter` is a quote-time projection, not a post-execution read
- **Detail:** `dispatch` (WalletBorrowNamespace.ts:244) always sets `positionAfter` from `quote.positionAfter`, so the optional type is imprecise: (1) it forces every consumer to handle an `undefined` that never occurs, and (2) it papers over the real semantic problem (F054) — `positionAfter` is the quote-time projection, not a post-exec on-chain read, so the receipt advertises a settled post-state that may never have materialized (including on a reverted EOA tx). The type-design sharpening of F054; filed info.
- **Exploit/repro:** A reverted EOA borrow tx still returns a `BorrowReceipt` whose `positionAfter.healthFactor` advertises a post-state that never materialized; the `?` makes consumers branch on an `undefined` that dispatch never produces.
- **Recommendation:** Decide the contract: if `dispatch` always sets it, make `positionAfter` required and document/rename it as the quote-time projection (e.g. `projectedPositionAfter`); if it should reflect realized state, gate population on a post-exec read and keep it optional.
- **suggestRefactor:** true
- **Candidate issue:** none
- **Dedup status:** new (relates to F054; this is the exported-type-precision sharpening)

### (dup:F147) — No public-export snapshot/guard test for the borrow surface, so the Aave/Morpho export asymmetry shipped undetected
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/index.ts:1-5
- **Severity:** low
- **Class:** info
- **Title:** The borrow module's public export surface has no snapshot/guard test asserting the exported values and types
- **Detail:** Same root cause as the lend (F124) and core-services umbrella (F147) export-guard findings: `index.exports.spec.ts` pins only 4 borrow symbols and there is no snapshot over the whole export set, so the missing `MorphoBorrowMarketConfig` (F128) and any safety-relevant default/named-error drop is a silent breaking change. Recorded here as a duplicate so the borrow-locus reference is preserved without a separate ledger row.
- **Recommendation:** Covered by F147 (generalized root export snapshot per #483). Add the borrow value/type set to that snapshot.
- **suggestRefactor:** true
- **Candidate issue:** #483
- **Dedup status:** dup:F147

---

## Surface: wallet-core

### F132 (NEW) — `TransactionReturnType` / `BatchTransactionReturnType` are untagged unions, forcing every receipt consumer into fragile runtime shape-sniffing
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/wallets/abstract/types/index.ts:30-42
- **Severity:** medium
- **Class:** correctness
- **Title:** `TransactionReturnType = EOATransactionReceipt | UserOperationTransactionReceipt` and `BatchTransactionReturnType = EOATransactionReceipt[] | UserOperationTransactionReceipt` have no discriminant, so consumers cannot statically narrow EOA-vs-4337 and must shape-sniff (`Array.isArray` then `'userOpHash' in receipt`)
- **Detail:** `extractReceiptHashes.ts:24-30` shape-sniffs exactly this way, and `WalletLendNamespace.dispatch` (WalletLendNamespace.ts:89-98) hands the bare union back as `LendTransactionReceipt` (types/lend/base.ts:93-95). Because `EOATransactionReceipt` (a viem `TransactionReceipt`) and `UserOperationTransactionReceipt` share many fields, a future viem field rename could silently shift which branch `'userOpHash' in receipt` selects, mis-attributing the hash on a receipt the caller uses to look up an onchain tx. This is the API-design root under the F072/F054 receipt-envelope findings: the union shape itself.
- **Exploit/repro:** `extractReceiptHashes` branches purely on structural presence of `userOpHash`; no compile-time guarantee the receipt is a UserOp receipt.
- **Recommendation:** Introduce an explicit discriminant (`{ kind: 'eoa' | 'eoaBatch' | 'userOp'; receipt(s) }`) at the wallet send/sendBatch boundary, or expose a typed accessor as the only sanctioned way to read identifier hashes. Add a type-level test pinning the union members.
- **suggestRefactor:** true
- **Candidate issue:** #337
- **Dedup status:** new

### F133 (NEW) — `extractReceiptHashes` maps an empty EOA batch to `{transactionHashes: []}` with no signal the batch produced no hashes
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/utils/extractReceiptHashes.ts:24-30
- **Severity:** low
- **Class:** correctness
- **Title:** For `Array.isArray(receipt)` the function returns `{ transactionHashes: receipt.map(r => r.transactionHash) }`; an empty array yields `{ transactionHashes: [] }`, indistinguishable from "a batch that produced no identifier", and a malformed receipt with undefined `transactionHash` surfaces `[undefined]`
- **Detail:** The sole current caller (WalletBorrowNamespace.ts:245) always passes a non-empty dispatch result (executeTransactionBatch rejects empty input, executeTransactionBatch.ts:30-32), so this is latent. But the helper is exported-by-path with a documented contract ("EOA batches expose transactionHashes"), and a future caller passing a directly-built `EOATransactionReceipt[]` could hit it. There is also no handling for a `transactionHash` that is `undefined`.
- **Exploit/repro:** `extractReceiptHashes([])` returns `{ transactionHashes: [] }` with no error.
- **Recommendation:** Either reject an empty array explicitly (mirror `executeTransactionBatch`'s empty-list throw) or document that empty input is a programming error; optionally validate each `transactionHash` is hex before emitting it.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Dedup status:** new

### F134 (NEW) — Abstract `Wallet.send`/`sendBatch` JSDoc says "resolving to the transaction hash" but every implementation returns a full receipt
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts:176-198
- **Severity:** low
- **Class:** info
- **Title:** The abstract `send`/`sendBatch` docblocks (and `SmartWallet.ts:21,38`) state "@returns Promise resolving to the transaction hash", but `EOAWallet.send` returns `EOATransactionReceipt`, `sendBatch` returns `EOATransactionReceipt[]`, and `DefaultSmartWallet.send/sendBatch` return `WaitForUserOperationReceiptReturnType` (a receipt object)
- **Detail:** The public-facing contract (the doc an integrator reads) is wrong about the return shape on the SDK's core signing methods; the doc tells callers to expect a hash, the type says receipt-or-receipt[]-or-userOpReceipt. Compounds the untagged-union problem (F132).
- **Exploit/repro:** Compare Wallet.ts:186 ("the transaction hash") against `EOAWallet.ts:65` return type `Promise<EOATransactionReceipt>`.
- **Recommendation:** Update the abstract JSDoc to describe the actual receipt union (and that batch may be a per-tx array for EOA vs a single UserOp receipt for smart wallets). Pair with a doc/test that the documented `@returns` matches the declared type.
- **suggestRefactor:** false
- **Candidate issue:** #367
- **Dedup status:** new

### F135 (NEW) — `retryOnStaleRead` final-read may throw rather than return the stale value its doc implies; only the happy paths are tested
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/utils/retryOnStaleRead.ts:21-38
- **Severity:** low
- **Class:** info
- **Title:** `retryOnStaleRead` control-flow is correct (verified NOT an off-by-one against retryOnStaleRead.spec.ts) but the final unconditional `await read()` is not wrapped in try/catch, so if every prior attempt was stale and the final read throws, the throw propagates rather than returning the last stale value the doc implies; no test covers the all-stale-then-final-throw path
- **Detail:** The `for (attempt = 0; attempt <= retries; attempt++)` loop `break`s when `attempt === retries`, so the body runs exactly `retries` times then a final unconditional `await read()` runs (line 38). For `retries:1` this is 2 total reads, matching the addSigner caller (DefaultSmartWallet.ts:359-368). Behavior is correct. The API-design concern is readability plus a contract hole: the final `read()` is not wrapped, so the doc's "return whatever it is to the caller" is violated when the final read throws.
- **Exploit/repro:** With `retries=1` and both the in-loop read and the final read throwing, the thrown error propagates despite the docstring promising to return the (stale) value.
- **Recommendation:** Document that the final read may throw (or wrap it and return the last stale value to honor the stated contract). Add a test for the final-read-throws case. Optionally restate the loop as `retries` iterations + a final read for clarity. Info; not a fund-safety issue.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Dedup status:** new

### F136 (NEW) — `Signer` union mixes a non-signing `Address` with signing accounts under one type, with no type-level guard that a signing context actually got a signer
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/wallets/smart/abstract/types/index.ts:19
- **Severity:** low
- **Class:** info
- **Title:** `Signer = Address | OneOf<LocalAccount | WebAuthnAccount>` conflates an owner identifier (`Address`, "cannot sign") with signing accounts; there is no type-level distinction between contexts that only need an owner identifier and contexts that must have a real signing account
- **Detail:** The union is used uniformly across addSigner/removeSigner/getWalletAddress and on-chain index lookups. `DefaultSmartWallet.create` defaults `signers = [params.signer.address]` (DefaultSmartWallet.ts:122) collapsing the LocalAccount to a bare Address, then `ensureLocalAccountSigner` re-substitutes it — a round-trip that only works because the two representations are conflated. A precision split (`OwnerIdentifier` vs `SigningSigner`) would let the compiler reject a non-signing Address where a signer is required. Relates to the F037/owner-set staleness family as a type-precision sibling.
- **Exploit/repro:** The type system permits an `Address`-only signers array in any signing path; the failure only surfaces at runtime in `ensureLocalAccountSigner`.
- **Recommendation:** Consider splitting the type: `OwnerIdentifier` (Address | publicKey) for ownership/derivation and `SigningSigner` (OneOf<LocalAccount | WebAuthnAccount>) for must-sign contexts. Lower priority than the error-taxonomy items.
- **suggestRefactor:** true
- **Candidate issue:** #337
- **Dedup status:** new

### (dup:F142/F143) — `SmartWalletDeploymentError` extends bare `Error`, breaking the `ActionsError` named-error taxonomy (wallet-core deploy slice)
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/wallets/smart/error/errors.ts:5-18
- **Severity:** medium
- **Class:** infra
- **Title:** `SmartWalletDeploymentError extends Error` not `ActionsError`; the entire smart-wallet deploy failure path (surfaced via `createSmartWallet`'s `deployments[].error`) is outside the named-error tree
- **Detail:** Same class and root cause as the wallet-smart findings F142 (unexported) and F143 (extends bare Error). It is the error in `DefaultSmartWalletProvider.ts:119-123` / re-wrapped at `DefaultSmartWallet.deploy:494-499`. Recorded here as a duplicate of F142/F143 to preserve the wallet-core locus reference without a second ledger row.
- **Exploit/repro:** `deployments[0].error instanceof ActionsError` is `false` while every other SDK error returns `true`.
- **Recommendation:** Covered by F143 (make `SmartWalletDeploymentError extends ActionsError`) and F142 (export it).
- **suggestRefactor:** true
- **Candidate issue:** #474
- **Dedup status:** dup:F143

### (refines:F021) — EOA `send`/`sendBatch` never inspect `receipt.status`, so the success/failure contract diverges from the smart-wallet sibling which throws on revert
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:62-100
- **Severity:** medium
- **Class:** correctness
- **Title:** `DefaultSmartWallet` throws `TransactionConfirmedButRevertedError` on a confirmed-but-reverted UserOp, but `EOAWallet.send` returns a `status:'reverted'` receipt verbatim and `sendBatch` continues to the next tx — the same abstract `Wallet.send` contract means revert-as-error on one implementation and revert-as-success on the other
- **Detail:** `DefaultSmartWallet` throws `TransactionConfirmedButRevertedError` (DefaultSmartWallet.ts:352-357,414-419). `EOAWallet.send` (62-73) returns the receipt regardless of `receipt.status === 'reverted'`, and `sendBatch` (90-100) pushes it and keeps signing subsequent txs after an earlier on-chain revert. F021 framed this as the residual-allowance fund-loss exploit; this is the API-design framing — the unenforced cross-implementation success contract and the missing shared revert-to-named-error mapping.
- **Exploit/repro:** A reverted EOA tx resolves to a receipt with `status:'reverted'` and no throw; the identical operation on a smart wallet throws `TransactionConfirmedButRevertedError`.
- **Recommendation:** Have `EOAWallet.send`/`sendBatch` check `receipt.status` and throw `TransactionConfirmedButRevertedError` on `'reverted'`, matching the smart sibling. Add a test asserting both wallet types throw the same named error on a reverted confirmed receipt.
- **suggestRefactor:** true
- **Candidate issue:** #474
- **Dedup status:** refines:F021

### (refines:F106) — `getSmartWallet` uses a throw-inside-try / `console.error` / rethrow anti-pattern that emits SDK-level logs and throws a bare (non-named) Error
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/providers/WalletProvider.ts:106-117
- **Severity:** low
- **Class:** info
- **Title:** The "neither walletAddress nor deploymentSigners" validation builds an `Error`, throws it into an adjacent catch purely to `console.error(error)` it, then throws a second identical bare `Error`; the thrown error is not a named SDK error so callers cannot discriminate this bad-params case from a deploy/RPC failure
- **Detail:** The only `console.*` on this provider path; a library should not log to the integrator's console from a pure validation failure, and the duplicated message string is a maintenance trap. F106 flagged the logging construct; this sharpens it — the thrown error being a bare `Error` is the SDK side of the named-error gap (#474) for the wallet-provider surface.
- **Exploit/repro:** Call `getSmartWallet({signer})` with neither `walletAddress` nor `deploymentSigners`: it `console.error`s then throws a bare Error indistinguishable by type from RPC/deploy failures.
- **Recommendation:** Throw a single named SDK error (an `InvalidParamsError`/`ActionsError` subclass) without the try/catch/console.error. Remove the `console.error`.
- **suggestRefactor:** true
- **Candidate issue:** #474
- **Dedup status:** refines:F106

### (dup:F147) — No public-export guard test pins the wallet-core error/type surface; `export *` is a semver hazard
- **Surface:** wallet-core
- **File:** packages/sdk/src/index.ts:167-169
- **Severity:** low
- **Class:** info
- **Title:** `index.ts` re-exports the wallet-core error module via `export * from '@/wallet/core/error/errors.js'` and the `Wallet`/`SmartWallet` classes plus receipt types, with no snapshot/guard test; the wildcard silently widens/narrows the public API on any edit to the error module
- **Detail:** Same root cause as the core-services export-surface finding (F147) and the `export *` wildcard finding (F148): no test asserts which symbols the barrel exposes, and renaming `TransactionConfirmedButRevertedError` or a receipt type is a silent breaking change. Recorded as a duplicate of F147/F148 to preserve the wallet-core locus.
- **Recommendation:** Covered by F147 (export-surface snapshot) and F148 (replace `export *` with explicit named re-exports).
- **suggestRefactor:** true
- **Candidate issue:** #483
- **Dedup status:** dup:F147

---

## Surface: wallet-hosted

### (dup:F028) — Node Privy provider applies `getAddress()` on `toActionsWallet` but NOT on `createSigner`: divergent validation of the same signing-address input
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.ts:60-73,87-95
- **Severity:** medium
- **Class:** malicious-sign
- **Title:** `PrivyHostedWalletProvider.toActionsWallet` normalizes `getAddress(params.address)` before it becomes the reported address, but the sibling `createSigner` forwards `params.address` verbatim into the node createSigner util with NO normalization
- **Detail:** Same caller field (the Ethereum address the Privy signer is bound to) is checksummed/validated on `toActionsWallet` (line 67) and accepted raw on `createSigner` (87-95). An un-checksummed/malformed address that `toActionsWallet` would normalize flows unmodified into the `LocalAccount` on the `createSigner` path, where it becomes the reported `.address` used downstream as `onBehalfOf`/approval owner/`from`. This is exactly F028 ("Node Privy createSigner skips the getAddress validation its sibling toActionsWallet applies") at the same locus; the incoming report relates it to F074 but the ledgered root is F028. Recorded as a duplicate.
- **Exploit/repro:** `provider.createSigner({walletId, address: lowercasedOrMalformedAddr})` → returned `LocalAccount.address` is the un-normalized input, whereas `provider.toActionsWallet` checksums it.
- **Recommendation:** Apply `getAddress(params.address)` (or `validateWalletAddress`) inside `createSigner` exactly as `toActionsWallet` does, or push normalization into the node createSigner util so both entry points share one validation. (Covered by F028.)
- **suggestRefactor:** true
- **Candidate issue:** none
- **Dedup status:** dup:F028

### F137 (NEW) — Turnkey `toActionsWallet` options type diverges between node and react (`client` present in react, absent in node)
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/react/providers/hosted/types/index.ts:60-65
- **Severity:** medium
- **Class:** correctness
- **Title:** For the same logical provider `turnkey`, the React `ToActionsOptions` includes `client: TurnkeySDKClientBase` (supplied per-call) while the Node `ToActionsOptions` omits `client` (captured at provider construction); the public API shape for the same operation is environment-dependent with no shared contract test
- **Detail:** React `TurnkeyHostedWalletToActionsWalletOptions` (react types 60-65) carries `client` alongside organizationId/signWith/ethereumAddress; the Node variant (node types 60-64) omits it (client lives at `NodeOptionsMap.turnkey.client`). Two consequences: (1) the public API shape is environment-dependent in a non-obvious way (breaking-change/DX hazard if unified), and (2) react never binds the construction-time client (`ReactOptionsMap.turnkey = undefined`), so the security-relevant Turnkey client is a per-call argument in react but a per-provider argument in node, with no test pinning the difference.
- **Exploit/repro:** Compare `NodeToActionsOptionsMap['turnkey']` (no `client`) vs `ReactToActionsOptionsMap['turnkey']` (has `client`); identical provider key, different required fields, no test asserting the intended shape.
- **Recommendation:** Document the intentional node-vs-react split in the schema JSDoc, or unify the two `ToActionsOptions` shapes. Add a type-level/snapshot guard over both maps' `turnkey` entries so the divergence is intentional and cannot silently drift.
- **suggestRefactor:** true
- **Candidate issue:** #330
- **Dedup status:** new

### F138 (NEW) — Turnkey `signWith` is typed `string` (no discriminated union for its three distinct meanings); a private-key-ID without `ethereumAddress` is a silently under-specified call
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/node/providers/hosted/types/index.ts:60-64
- **Severity:** low
- **Class:** correctness
- **Title:** `signWith` is documented as one of three semantically distinct things (wallet account address, private key address, or private key ID) yet typed as a bare `string` in both node and react; the type cannot express "if signWith is a private-key-ID then ethereumAddress is required", so a caller passing a private-key-ID with no ethereumAddress compiles and silently takes the slower/prompting path
- **Detail:** Because `signWith` is an unbranded string, the type system cannot encode the `ethereumAddress` dependency the JSDoc describes; combined with the unvalidated `ethereumAddress` override (F031), a private-key-ID call reports a caller-asserted address. A type-precision gap on signing-path inputs: a discriminated union (or branded types per #475) would make the three modes and their `ethereumAddress` dependency explicit. Relates to F031 (the runtime no-validation locus); this is the type-precision root.
- **Exploit/repro:** `toActionsWallet({organizationId, signWith: privateKeyId})` with no `ethereumAddress` type-checks fine; the reported address then depends on an opaque Turnkey API round-trip with no SDK-side reconciliation.
- **Recommendation:** Model `signWith` as a discriminated union (account-address | private-key-address | private-key-id) or adopt branded zod schemas (#475) so the `ethereumAddress` dependency is expressible; at minimum validate `ethereumAddress` with `isAddress` when supplied.
- **suggestRefactor:** true
- **Candidate issue:** #475
- **Dedup status:** new (relates to F031; type-precision root distinct from F031's runtime no-validation)

### F139 (NEW) — Hosted Dynamic `createSigner` throws a bare `Error` while the rest of the SDK uses a named-error taxonomy (SDK side of #474)
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/react/wallets/hosted/dynamic/utils/createSigner.ts:22
- **Severity:** low
- **Class:** info
- **Title:** The only thrown error in the entire wallet-hosted surface is `throw new Error('Wallet not connected or not EVM compatible')` in the Dynamic createSigner; there is no `WalletNotConnectedError`/`UnsupportedWalletError`/`SignerCreationError` in the named module, so this is uncatchable-by-class and inconsistent with the documented error contract
- **Detail:** Every sibling createSigner/provider throws nothing of its own (letting the vendor SDK throw). An integrator catching errors from the hosted-wallet construction path cannot programmatically distinguish "wrong wallet type" from a transport/signing failure. The wallet-hosted instance of the broader bare-Error gap (#474).
- **Exploit/repro:** Pass a non-EVM Dynamic wallet to `createActions` hostedWalletConfig; the caller receives a plain `Error` whose `.name` is `'Error'`, indistinguishable by class from any other failure.
- **Recommendation:** Add a named error (e.g. `UnsupportedWalletError`/`SignerCreationError`) to `wallet/core/error/errors.ts` and throw it from the Dynamic createSigner; add a `@throws` contract to the abstract `HostedWalletProvider.createSigner`/`toActionsWallet` JSDoc. Add a guard test asserting the thrown error is `instanceof` the named class.
- **suggestRefactor:** true
- **Candidate issue:** #474
- **Dedup status:** new

### F140 (NEW) — Hosted public-export surface is inconsistent across providers/environments: node exports only Privy classes, react only `DynamicWallet`, Turnkey classes unexported
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/node/index.ts:1-8
- **Severity:** low
- **Class:** info
- **Title:** The node barrel exports `PrivyHostedWalletProvider`/`PrivyWallet` but NOT `TurnkeyHostedWalletProvider`/`TurnkeyWallet` (both exist and are registered); the react barrel exports only `DynamicWallet`, no react wallet or provider classes; which concrete hosted classes are importable is asymmetric per-provider and per-environment with no stated rule and no guard test
- **Detail:** Consumers who want to construct a Turnkey provider directly (the documented lower-level createSigner use case) cannot import the class in node; react consumers cannot import any provider class. The borrow-only public-export-test gap (#483) and the build-without-all-deps gap (#131) applied to the hosted surface — a refactor could silently add or drop an export with nothing failing.
- **Exploit/repro:** `import { TurnkeyHostedWalletProvider } from '<sdk>/node'` fails (not exported) while `import { PrivyHostedWalletProvider }` succeeds; react has no provider-class export at all.
- **Recommendation:** Decide and document the intended public hosted-export set, make node/react barrels symmetric, and add an export-snapshot guard test (generalize per #483) pinning the hosted exports for both entrypoints.
- **suggestRefactor:** true
- **Candidate issue:** #483
- **Dedup status:** new

### F141 (NEW) — Abstract `createSigner`/`toActionsWallet` share one `TOptionsMap[TType]` param type, but node providers feed `createSigner` construction-time deps merged with caller params via `{...params}` spread, so the abstract signature understates the real contract
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/core/providers/hosted/abstract/HostedWalletProvider.ts:45-56
- **Severity:** low
- **Class:** info
- **Title:** The abstract base types BOTH `toActionsWallet` and `createSigner` with the identical `params: TOptionsMap[TType]`, but the node Privy/Turnkey impls do `createSigner({...params, privyClient})` / `createSigner({...params, client})`, merging the construction-time client into the caller options object; the util-level signature then requires `ToActionsWalletOptions & NodeOptionsMap[type]`
- **Detail:** The public abstract contract advertises that `createSigner` takes only the ToActions options, while the real data dependency (the client) is injected by spread and only the util sees the full shape; there is no compile-time assertion that the spread supplies exactly the util's required fields. Makes the documented lower-level `createSigner` entry point harder to reason about for integrators reading the abstract type.
- **Exploit/repro:** Read `HostedWalletProvider.createSigner` type (`TOptionsMap[TType]`) then `PrivyHostedWalletProvider.createSigner` body (spreads in `privyClient`): the public type does not reflect the construction-dep merge.
- **Recommendation:** Either type `createSigner` with its own param type (the caller-facing subset) and document that the provider injects the client, or factor the client-injection into a protected helper so the public `createSigner` contract matches what the caller passes. Add a type-level test that the spread satisfies the util signature exactly.
- **suggestRefactor:** true
- **Candidate issue:** #337
- **Dedup status:** new

### (refines:F033) — Registry `validateOptions` is the only validation choke point on the hosted construction path and only checks one field's truthiness; signing-key selectors bypass it entirely
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/node/providers/hosted/registry/NodeHostedWalletProviderRegistry.ts:24-26,43-45
- **Severity:** medium
- **Class:** malicious-sign
- **Title:** Node `validateOptions` returns `Boolean(options?.privyClient)` / `Boolean(o?.client)` (the SOLE programmatic validations in `createHostedWalletProvider`), and React `validateOptions` returns `true` unconditionally for all three providers; the fields deciding WHICH key signs and WHAT address is reported are never validated here, so the factory's `options is TOptions` contract advertises validation it does not deliver
- **Detail:** For privy, walletId/address are toActionsWallet-time inputs unseen by validateOptions; for turnkey, organizationId/signWith/ethereumAddress likewise. React (ReactHostedWalletProviderRegistry 24,41,58) returns `true` for all three. So the registry's type-narrowing guard provides zero defense over signing-identity selectors on either environment. Sharpens F033 by adding the react-returns-true and the factory-contract-implies-validation framing (the medium-severity malicious-sign reframing of the prior low-severity F033 row).
- **Exploit/repro:** `factory.validateOptions({privyClient})` returns true regardless of any later malformed walletId/address; react `factory.validateOptions(anything)` returns true unconditionally.
- **Recommendation:** Either narrow the `validateOptions` contract docs to state it only confirms the construction-time client is present (NOT a signing-identity guard), or move signing-key-selector validation (`isAddress` on address/ethereumAddress, non-empty organizationId/signWith/walletId) into `toActionsWallet`/`createSigner` with named errors at a single documented choke point.
- **suggestRefactor:** true
- **Candidate issue:** none
- **Dedup status:** refines:F033

### (refines:F073) — React Privy `createSigner` casts the vendor `signTypedData` to `CustomSource['signTypedData']` with no recovering-signer test (residual any-style boundary cast, #337)
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/react/wallets/hosted/privy/utils/createSigner.ts:27-28
- **Severity:** low
- **Class:** info
- **Title:** React Privy createSigner force-casts `signTypedData: privyViemAccount.signTypedData as CustomSource['signTypedData']` on the EIP-712/Permit2 signing seam, suppressing any structural mismatch, with no test that signs a known EIP-712 payload and recovers the expected signer
- **Detail:** The cast bypasses the structural check at the type boundary, and there is no recovering-signer test proving the wired method produces a valid signature. The sibling node Privy and react Turnkey paths return the vendor account directly (no such cast), so this is also an inconsistency. The #337/residual-any-at-protocol-boundary item on a signing-path method; F073 already records this locus.
- **Exploit/repro:** Inspect lines 27-28: the as-cast bypasses any structural check between Privy and viem `CustomSource`; no test recovers a signer from a typed-data signature produced by this path.
- **Recommendation:** Replace the cast with a typed adapter (or narrow `CustomSource` generic) so a signature mismatch is a compile error, and add a recovering-signer test that signs an EIP-712/Permit2-shaped payload and asserts `recoverTypedDataAddress` equals `account.address`.
- **suggestRefactor:** true
- **Candidate issue:** #337
- **Dedup status:** refines:F073

---

## Surface: wallet-smart

### F142 (NEW) — `SmartWalletDeploymentError` is part of the public return-type contract but is never exported, so consumers cannot `instanceof`-narrow the error they are handed
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/error/errors.ts:5-18
- **Severity:** high
- **Class:** correctness
- **Title:** `SmartWalletCreationResult.deployments[].error` is typed `SmartWalletDeploymentError` and returned by the public `createSmartWallet()` path, and the provider branches on `instanceof SmartWalletDeploymentError` internally, yet `src/index.ts` never exports the class — a consumer can read `.message` but cannot `instanceof`-narrow to recover the structured `chainId`/`receipt`, cannot retry the right chain, and cannot even name the type
- **Detail:** `SmartWalletCreationResult.deployments[].error` is typed `SmartWalletDeploymentError` (wallet/core/providers/smart/abstract/types/index.ts:11), returned via `WalletNamespace.createSmartWallet → SmartWalletProvider.createWallet → DefaultSmartWalletProvider.createWallet:82,125-128`, and `DefaultSmartWalletProvider.ts:119` branches on `r.reason instanceof SmartWalletDeploymentError`. But `src/index.ts` re-exports `@/core/error/errors.js` and `@/wallet/core/error/errors.js` via `export *` (index.ts:77,167) and never exports `@/wallet/core/wallets/smart/error/errors.js`. The smart-wallet half of the #474 named-error reconciliation: the lend/swap bare-Error gap is mirrored here by an unexported-named-error gap. Relates to F025 (which logged deploy() wrapping/dropping the receipt) but the API-contract root is the unexported public-return-type class.
- **Exploit/repro:** `const { deployments } = await actions.wallet.createSmartWallet({signer}); const failed = deployments.find(d => !d.success); failed?.error instanceof SmartWalletDeploymentError` — the class is not importable from the SDK entrypoint, so the narrowing is impossible and `.chainId`/`.receipt` are untyped.
- **Recommendation:** Export `SmartWalletDeploymentError` (and the `SmartWalletCreationResult`/`SmartWalletDeployment` result types and `Signer`) from `src/index.ts` alongside the other named-error modules, and add it to the public-export snapshot test (F147) so the contract cannot silently regress.
- **suggestRefactor:** true
- **Candidate issue:** #474
- **Dedup status:** new (relates to F025)

### F143 (NEW) — `SmartWalletDeploymentError` extends bare `Error`, diverging from the `ActionsError`/`BaseError` taxonomy every other SDK error uses
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/error/errors.ts:5
- **Severity:** medium
- **Class:** correctness
- **Title:** `SmartWalletDeploymentError extends Error`, so it has no `shortMessage`/`metaMessages`, does not satisfy `instanceof ActionsError`, and a consumer's catch-all `if (e instanceof ActionsError)` silently misclassifies a deploy failure as a foreign error — the one error that breaks the otherwise-uniform taxonomy on the deploy path
- **Detail:** Every other SDK error extends `ActionsError` (which extends viem `BaseError`); the `ActionsError` comment states the contract ("callers can use instanceof narrowing and structured metaMessages alongside the shortMessage"). `SmartWalletDeploymentError extends Error` (errors.ts:5). Pairs with F142 (the unexported issue): even after exporting, the base-class divergence breaks uniform `instanceof` handling. The wallet-core reviewer flagged the identical class; that row is folded here (dup:F143).
- **Exploit/repro:** A consumer wrapping all SDK calls in `catch (e) { if (e instanceof ActionsError) handleKnown(e); else rethrow(e); }` rethrows/mis-handles every deploy failure because `SmartWalletDeploymentError` is not an `ActionsError`.
- **Recommendation:** Make `SmartWalletDeploymentError extends ActionsError`, passing chainId/receipt via `metaMessages`. Confirm `DefaultSmartWalletProvider.ts:119` `instanceof` still holds after the base change. Add a guard test asserting every wallet-core error is `instanceof ActionsError`.
- **suggestRefactor:** true
- **Candidate issue:** #474
- **Dedup status:** new

### F144 (NEW) — `SmartWalletDeployment` result models success as an untyped `boolean` rather than a discriminated union, so receipt/error presence is not type-enforced
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/providers/smart/abstract/types/index.ts:7-12
- **Severity:** low
- **Class:** correctness
- **Title:** `SmartWalletDeployment` is `{ chainId; success: boolean; receipt?; error? }`; the real invariants (success⇒receipt present/error absent; failure⇒error present/receipt absent) are not encoded, so the type permits impossible states and gives a consumer no way to narrow to the error branch without a manual `!d.success && d.error` dance
- **Detail:** The actual invariants are at DefaultSmartWalletProvider.ts:108-123. Because `success` is a bare boolean and both `receipt` and `error` are optional, the type permits `success:true` with `error:set` and `success:false` with no `error`. A discriminated union on `success` would let `if (!d.success)` narrow `d.error` to non-optional. Compounds F142: even after exporting the error class, the result shape does not guide the consumer to it.
- **Exploit/repro:** `if (d.success) { use(d.receipt) } else { report(d.error) }` gets no compile-time guarantee `d.error` is non-undefined in the else branch.
- **Recommendation:** Model as `{ chainId; success: true; receipt?: ... } | { chainId; success: false; error: SmartWalletDeploymentError }`.
- **suggestRefactor:** true
- **Candidate issue:** #474
- **Dedup status:** new

### F145 (NEW) — `createWallet` re-wraps any non-`SmartWalletDeploymentError` rejection as a bare `Error` and throws it out of the `allSettled` aggregation, breaking the per-chain partial-success contract
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/providers/smart/default/DefaultSmartWalletProvider.ts:116-123
- **Severity:** low
- **Class:** correctness
- **Title:** `createWallet` collects per-chain results with `Promise.allSettled`, but the rejected-branch mapper only handles `r.reason instanceof SmartWalletDeploymentError`; for any other rejection it `throw new Error('Unknown error: ' + r.reason)` from inside `.map`, rejecting the whole call and discarding every other chain's already-settled result
- **Detail:** A non-typed rejection on one chain collapses the entire multi-chain creation into one opaque bare Error, losing the partial-success deployments array the API otherwise guarantees. In practice deploy() wraps everything (DefaultSmartWallet.ts:494-499), but the abstract contract does not enforce that, so this is a latent contract break for any second `SmartWallet` impl.
- **Exploit/repro:** Inject a non-`SmartWalletDeploymentError` throw on one chain's deploy() while other chains succeed; `createWallet` rejects with `Unknown error: ...` and the caller loses the successful deployments on other chains.
- **Recommendation:** In the rejected branch, fold unknown rejections into the deployments array as a failed entry instead of throwing; or document/assert that deploy() must only ever reject with `SmartWalletDeploymentError`.
- **suggestRefactor:** true
- **Candidate issue:** #474
- **Dedup status:** new

### F146 (NEW) — Abstract `SmartWallet` contract leaks viem's `WaitForUserOperationReceiptReturnType` as its public return type, coupling the SDK API to a vendor internal and obscuring the success/revert contract
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/abstract/SmartWallet.ts:23-92
- **Severity:** low
- **Class:** info
- **Title:** The abstract base and `DefaultSmartWallet` declare `send/sendBatch/removeSigner/deploy` returning viem's `WaitForUserOperationReceiptReturnType` directly (and into `SmartWalletCreationResult`); a viem minor that reshapes this type is a silent breaking change to the Actions API, and it hides the load-bearing `receipt.success` field behind an opaque vendor alias
- **Detail:** This transitive viem account-abstraction type is exported into the SDK's public method signatures. Consumers must depend on viem's exact version to name the return; the SDK already wraps EOA receipts as the named `EOATransactionReceipt`/`UserOperationTransactionReceipt` types (exported from index.ts:153,119) but smart send/sendBatch do not use them. Relates to F034 (send/sendBatch never check `receipt.success`).
- **Exploit/repro:** A viem upgrade restructuring `WaitForUserOperationReceiptReturnType` changes the SDK's public `send/sendBatch/createSmartWallet` return types with no Actions code change and no semver signal.
- **Recommendation:** Define and return an SDK-owned UserOperation result type (reuse the exported `UserOperationTransactionReceipt`) for `send/sendBatch/deploy/removeSigner`, decoupling the public contract from viem internals.
- **suggestRefactor:** true
- **Candidate issue:** #476
- **Dedup status:** new

### (refines:F011) — Hot-path invariant violations in `DefaultSmartWallet`/`getSignerPublicKey` throw bare `Error` strings instead of the named `ActionsError` taxonomy
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:89-94
- **Severity:** low
- **Class:** info
- **Title:** Several caller-reachable invariant failures throw `new Error(string)`: the `address` getter ("Smart wallet not initialized", line 91), `ensureLocalAccountSigner` ("Signer does not match...", line 164), addSigner's else branch ("invalid signer type", line 347), and `getSignerPublicKey` ("invalid signer type", getSignerPublicKey.ts:17)
- **Detail:** These are exactly the input-validation failures `InvalidParamsError`/`AddressRequiredError` were created for (core/error/errors.ts:218,307). A consumer cannot `instanceof`-narrow them, they carry no structured context, and they are indistinguishable from internal bugs. The SDK-side-of-#474 bare-Error pattern in the wallet-smart construction/owner-management path; F026 already covers a sibling locus.
- **Exploit/repro:** Constructing a `DefaultSmartWallet` with a signer whose address is absent from the signers array throws `Error('Signer does not match any signer in the signers array')`; a consumer cannot distinguish this from an internal bug via `instanceof`.
- **Recommendation:** Replace these bare throws with the named taxonomy (`InvalidParamsError` for malformed/unmatched signer, a wallet-not-initialized named error or `AddressRequiredError` for the address getter). Pair with F142.
- **suggestRefactor:** true
- **Candidate issue:** #474
- **Dedup status:** refines:F011 (relates to F026)

### (dup:F147) — Public-export snapshot test only guards the borrow surface; smart-wallet exports are unguarded against a refactor
- **Surface:** wallet-smart
- **File:** packages/sdk/src/__tests__/index.exports.spec.ts:16-26
- **Severity:** medium
- **Class:** correctness
- **Title:** `index.exports.spec.ts` asserts only borrow providers + Morpho helpers; the smart-wallet surface `src/index.ts` does export (`SmartWallet`) and the surface it should export but does not (`SmartWalletDeploymentError`, `Signer`, `SmartWalletCreationResult`) have no snapshot/guard test
- **Detail:** Same root cause as F124 (lend) and F147 (core-services umbrella): a refactor renaming/dropping `export { SmartWallet }`, or moving the error module, fails no test. Recorded as a duplicate of the F147 export-guard finding so the wallet-smart locus is preserved.
- **Exploit/repro:** Delete `export { SmartWallet }` from index.ts; the suite still passes, silently removing a public class.
- **Recommendation:** Covered by F147 (generalized root export snapshot) — extend it to include `SmartWallet` and the smart-wallet error/types once exported.
- **suggestRefactor:** true
- **Candidate issue:** #483
- **Dedup status:** dup:F147

---

## Surface: core-services

### F147 (NEW) — Public-export surface has no snapshot/guard test: only 4 of ~141 exported symbols are pinned, so a refactor can silently drop or rename public API with green CI
- **Surface:** core-services
- **File:** packages/sdk/src/__tests__/index.exports.spec.ts:1-27
- **Severity:** medium
- **Class:** infra
- **Title:** `index.ts` re-exports ~141 symbols (asset constants, error classes via `export *`, `Wallet`/`SmartWallet`, `serializeBigInt`, ENS helpers, provider classes, ~70 types), and the only export test pins just 4 borrow symbols; removing/renaming any other ~137 export is a breaking semver change no test catches
- **Detail:** There is no `Object.keys`/`toMatchSnapshot` guard over the module's export set. Per the breaking-change lens, removing/renaming `serializeBigInt`, `Wallet`, `SmartWallet`, `QuoteRecipientMismatchError`, or an asset constant goes uncaught. The two `export *` error wildcards (index.ts:77,167) compound this. The SDK-side of #483 and the umbrella over the lend (F124), borrow (dup), hosted (F140), wallet-core (dup), and wallet-smart (dup) export-guard findings.
- **Exploit/repro:** Rename `serializeBigInt` to `serializeBigInts` and update its import in index.ts; the suite passes (it never references the symbol) yet every downstream `import { serializeBigInt }` breaks at publish.
- **Recommendation:** Add an export-surface snapshot/guard test asserting the sorted set of exported keys of `index.node.ts`/`index.react.ts` via `toMatchSnapshot` (or an explicit allow-list). Replace the two `export *` error wildcards with explicit named re-exports (F148). Gate in CI.
- **suggestRefactor:** true
- **Candidate issue:** #483
- **Dedup status:** new (umbrella; the per-surface export-guard findings dedup into this row)

### F148 (NEW) — Two wildcard `export *` re-exports of the error modules make the public error taxonomy uncurated
- **Surface:** core-services
- **File:** packages/sdk/src/index.ts:77,167
- **Severity:** low
- **Class:** infra
- **Title:** `export * from '@/core/error/errors.js'` and `export * from '@/wallet/core/error/errors.js'` splat whole modules into the public surface; every symbol added to those modules silently becomes public and semver-locked, and a rename/removal is a breaking change with no diff in index.ts to flag it in review
- **Detail:** By contrast the ENS module is re-exported by explicit name (index.ts:78-90). Wildcard re-exports are an anti-pattern for a published library. Combined with the absent export-surface snapshot test (F147), the error taxonomy can drift in either direction undetected.
- **Exploit/repro:** Add an internal helper to `errors.ts`; it silently becomes part of the public API with no review gate.
- **Recommendation:** Replace the two `export *` error wildcards with explicit named re-exports listing exactly the public error classes, mirroring the ENS module. Pair with F147.
- **suggestRefactor:** true
- **Candidate issue:** #474
- **Dedup status:** new

### F149 (NEW) — All 10 hosted-wallet vendor SDKs are hard `peerDependencies` with no `peerDependenciesMeta.optional`, and the published node/react entries eagerly value-import them (#131 root cause)
- **Surface:** core-services
- **File:** packages/sdk/package.json (peerDependencies / peerDependenciesMeta)
- **Severity:** medium
- **Class:** infra
- **Title:** `package.json` declares 10 vendor peerDependencies (@privy-io/*, @turnkey/*, @dynamic-labs/*) with no `peerDependenciesMeta` marking any optional, and the static barrels value-import vendor code regardless of which provider the integrator configured, defeating the registry's lazy `import()`
- **Detail:** The registry (NodeHostedWalletProviderRegistry.ts:29,49) loads impls via lazy `import()`, but that laziness is defeated by static class re-exports in the top-level barrels: `index.node.ts → @/wallet/node/index.js` statically exports `PrivyWallet → createSigner → @privy-io/node/viem`; react → `DynamicWallet → createSigner → @dynamic-labs/ethereum` + `@dynamic-labs/waas-evm`. So importing the package's main entry eagerly pulls vendor packages, and strict installers (pnpm/npm with strict-peer-deps) error/warn for every uninstalled peer. The concrete, fileable root cause of #131; there is no test exercising a single-vendor install.
- **Exploit/repro:** In a fresh project install the SDK and only `@privy-io/node`, then `import { createActions } from '@actions/sdk/node'`. Resolution of `@dynamic-labs/*`/`@turnkey/*` is still attempted transitively via the barrel/value-import chain; under a strict installer the install fails, and a bundler that tree-walks the barrel eagerly resolves the missing vendor modules.
- **Recommendation:** Add `peerDependenciesMeta` marking every vendor SDK `optional: true`. Break the eager chain so the published entries do not statically value-import vendor code (keep vendor value-imports behind the lazy registry `import()` boundary, or expose concrete wallet classes only via subpath/registry). Add a build/install smoke test that installs with exactly one vendor present and imports the main entry without a resolution error.
- **suggestRefactor:** true
- **Candidate issue:** #131
- **Dedup status:** new

### F150 (NEW) — Publicly-exported ENS errors extend bare `Error`, not `ActionsError`, breaking the documented `instanceof ActionsError` discriminator on the recipient-resolution path
- **Surface:** core-services
- **File:** packages/sdk/src/services/nameservices/ens/errors.ts:7,24,37
- **Severity:** low
- **Class:** correctness
- **Title:** `EnsNotConfiguredError`/`EnsResolutionError`/`EnsRpcError` (exported from index.ts:81-83) extend bare `Error` and hand-set `.name`, so an integrator's `catch (e) { if (e instanceof ActionsError) ... }` silently misses every ENS failure, they carry no `shortMessage`/`metaMessages`, and since ENS resolution produces signed recipient addresses an `EnsResolutionError` slipping past an `ActionsError`-typed handler is a recipient-correctness hazard
- **Detail:** core/error/errors.ts:3-8 documents that all SDK errors extend `ActionsError` (a viem `BaseError` subclass) so callers can `instanceof`-narrow and read structured fields; every error in core/wallet/swap-named/lend-named follows this. The three ENS errors do not. This inconsistency is not previously in the ledger.
- **Exploit/repro:** Wrap `actions.swap.execute(...)` (which resolves an ENS recipient) in `try/catch (e) { if (e instanceof ActionsError) renderSdkError(e); else throw e }`. A bad ENS name throws `EnsResolutionError`, which is not an `ActionsError`, so it bypasses the SDK-error branch and rethrows as an opaque generic error.
- **Recommendation:** Make the three ENS errors extend `ActionsError`, moving `input`/`chainId` to typed fields and the human text to `super(shortMessage, { metaMessages })`, preserving `cause` via `ErrorOptions`. Add an assertion test that each public SDK error class is `instanceof ActionsError`.
- **suggestRefactor:** true
- **Candidate issue:** #474
- **Dedup status:** new

### F151 (NEW) — Public amount-type contract is inconsistent across sibling actions: borrow exposes the precise `Amount = { amount: number } | { amountRaw: bigint }` union, but lend and swap are `number`-only with no `amountRaw` escape hatch
- **Surface:** core-services
- **File:** packages/sdk/src/types/borrow/params.ts:12,20
- **Severity:** low
- **Class:** correctness
- **Title:** borrow/params.ts:12 defines `Amount` as a discriminated union giving callers a lossless `amountRaw: bigint` path (the #379 convention), while lend (`amount: number`) and swap (`amountIn?/amountOut?: number`) force every amount through JS `number` — the type-level root of the F041 precision/scientific-notation corruption on the lend and swap paths
- **Detail:** A `number > 2^53` base units silently loses wei, and `< 1e-6` either loses precision or throws `InvalidDecimalNumberError` inside `parseUnits`. A caller cannot express an exact high-magnitude lend/swap amount at all. Promoting lend/swap to the same `Amount` union closes the hole at the API boundary rather than patching each parse site. The type-contract half of #379; the parse-site fixes (F041 refinements) become unnecessary once callers can pass bigint.
- **Exploit/repro:** To supply 1e24 wei to a lend supply, the only public field is `amount: number`; `(1e24).toString()` is `"1e+24"`, which `parseUnits` rejects — unrepresentable through the lend API, unlike borrow where `{ amountRaw: 1_000_000_000_000_000_000_000_000n }` works.
- **Recommendation:** Adopt the borrow `Amount` discriminated union (or an `amountRaw?: bigint` companion) across lend openPosition/closePosition and swap exact-in/exact-out public params, so all three actions share one precise amount contract.
- **suggestRefactor:** true
- **Candidate issue:** #379
- **Dedup status:** new (relates to F041; type-contract root distinct from the per-site parse findings)

### (refines:F011) — `DefaultSmartWallet.send`/`sendBatch` collapse the underlying error class AND cause into a flat string, discarding the only structured signal (bundler/paymaster/nonce/revert)
- **Surface:** core-services
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:244-248,288-292
- **Severity:** low
- **Class:** info
- **Title:** `send`/`sendBatch` catch every failure and `throw new Error('Failed to send transaction: ' + error.message)`, downgrading a viem/bundler `BaseError` to a bare Error, dropping the `cause` chain, and interpolating an unredacted external message on the main smart-wallet signing path
- **Detail:** A paymaster-rejection vs nonce-conflict vs on-chain revert all become one opaque string; an integrator cannot programmatically distinguish a retryable bundler outage from a permanent validation failure. The same flatten pattern recurs in lend/swap providers (the body of #474). F011 already records this locus; recording the API-contract framing on the core-services dispatch path.
- **Exploit/repro:** A bundler 500 and a permanent paymaster rejection both surface as `Error('Failed to send transaction: ...')` with no `cause` and no class.
- **Recommendation:** Wrap caught failures in a named `ActionsError` subclass (e.g. `SmartWalletSendError`) constructed with `{ cause: error }`, keeping the external message out of the top-level shortMessage.
- **suggestRefactor:** true
- **Candidate issue:** #474
- **Dedup status:** refines:F011

---

## Dedup notes (incoming findings folded into existing rows)

- **swap F122 (defaults guard):** the core-services reviewer verified `SwapProvider.test.ts` ALREADY asserts the four safety-relevant swap defaults (slippage 0.005, maxSlippage 0.5, quote expiry 30s, permit2 expiry 2_592_000s), so the defaults-guard portion is covered; F122 is filed only for the genuinely-absent export-set snapshot.
- **wallet-hosted Node Privy `createSigner` getAddress asymmetry** → **dup:F028** (F028 already records this exact createSigner-vs-toActionsWallet getAddress divergence at PrivyHostedWalletProvider.ts:87-95; the incoming report relates it to F074 but the ledgered root is F028).
- **wallet-core `SmartWalletDeploymentError extends bare Error`** → **dup:F143** (same class flagged by both the wallet-core and wallet-smart reviewers; one ledger row F142/F143).
- **wallet-core / borrow / wallet-smart export-guard** → **dup:F147** (the core-services umbrella row; per-surface loci preserved in this report).
