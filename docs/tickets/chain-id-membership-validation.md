# Validate chainId membership against SUPPORTED_CHAIN_IDS at every cast site

> **AUGMENT existing issue #334 - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | low |
| **Complexity** | 2 / 5 |
| **Domain** | core |
| **Surface** | `ChainManager.getChain` (unguarded `chainById[chainId]`), `DefaultSmartWallet` chainId selection (no up-front membership gate; derivation-vs-broadcast chain unreconciled), backend `ChainIdSchema` / `ChainIdStringSchema` and lend controller inline `marketId.chainId` (`as SupportedChainId` cast without membership refine) |
| **Resolves findings** | F095, F109, F299, F284 |
| **Candidate existing issue** | #334 (Lend provider blocklist and abstraction gaps) |
| **Blocked by** | (none) |

## Problem

A `chainId` selects the network the SDK builds clients for and, on the EOA path, the EIP-155 chain bound into a signature. Across the codebase that value is threaded purely as the `SupportedChainId` TS type, which is a compile-time brand only: a JS integrator, a quote value, a user selection, or any `as SupportedChainId` cast can put an arbitrary positive integer into it at runtime. Several "cast sites" accept that value and act on it without ever checking membership in the SDK's declared `SUPPORTED_CHAIN_IDS` (or the manager's configured set), even though the SDK holds exactly the state needed to check.

The sibling accessors already fail closed: `ChainManager.getRpcUrls` / `getBundlerUrl` / `getChainConfig` / `getPublicClient` / `getBundlerClient` all throw `ChainNotSupportedError` for an unconfigured chain, and the swap controller refines `chainId` against `SUPPORTED_CHAIN_IDS`. The findings here are the spots that diverge from those siblings: `getChain` is the one `ChainManager` accessor that does a raw `chainById[chainId]` lookup with no membership check (and returns `undefined` for an id absent from viem's global registry); no smart-wallet entrypoint gates `chainId` up front or reconciles the address-derivation chain against the broadcast chain; and the backend's shared `ChainIdSchema` / the lend controller's inline schema cast a merely-positive integer to `SupportedChainId`, a cast that lies about a membership the schema never verified.

Fund-safety framing: this is fail-closed-where-the-SDK-already-knows and consistency-across-siblings, not intent-guessing. The SDK can always answer "is this chainId one I am configured/declared to support?" from local state. Today each gap fails closed in aggregate (a downstream throw, an asset-not-found, an allowlist miss), so none is a present fund-loss; the risk is the unhonest `as SupportedChainId` cast and the one unguarded primitive (`getChain`) that, reached directly by a future or sibling consumer that does not happen to route through the aggregate guard, would build clients or sign for a chain the SDK never agreed to support. Gate on the configured/declared chain set at each cast site so the brand is backed by a runtime check everywhere it is minted.

## Findings

- **F095** — `ChainManager.getChain` returns `chainById[chainId]` with no membership check (`packages/sdk/src/services/ChainManager.ts:162-164`), unlike `getRpcUrls` / `getBundlerUrl` / `getChainConfig` which throw `ChainNotSupportedError`; its result's `.id` directly determines the signed EIP-155 chainId on the EOA path, and for a chainId absent from `chainById` it returns `undefined` rather than throwing. Producer-side of F022.
- **F109** — No `DefaultSmartWallet` entrypoint validates the caller-supplied `chainId` against the configured set before selecting the signing client and the chain for address derivation/deploy/send (`packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:196-207,217-250,261-294,456-500,573-587`); `send`/`sendBatch`/`deploy` operate on the passed `chainId` while `getAddress` derives the counterfactual address from `getSupportedChains()[0]` (lines 577-579), so the derivation chain and the broadcast chain are never reconciled. Smart-wallet sibling of F022/F095.
- **F299** — `ChainIdSchema` / `ChainIdStringSchema` validate only positive-integer and `transform`/cast to `SupportedChainId` without membership in `SUPPORTED_CHAIN_IDS` (`packages/demo/backend/src/helpers/schemas.ts:28-42`), unlike `swap.ts` `chainIdFromNumber` / `chainIdFromString` which `.refine((v) => supportedChainIds.includes(v))`; mitigated for borrow by allowlist re-resolution (`m.chainId === chainId`), but the shared-schema cast claims a membership it never verified. Shared-schema locus of F284.
- **F284** — lend `OpenPositionRequestSchema` / `ClosePositionRequestSchema` validate `marketId.chainId` as `z.number().positive('chainId must be positive')` only (`packages/demo/backend/src/controllers/lend.ts:24-29,37-42`), then the controller forwards it as `resolveAsset(tokenAddress, marketId.chainId as SupportedChainId)` (`packages/demo/backend/src/services/lend.ts:42-44`); an unsupported-but-positive chainId (e.g. 1, 137) passes the schema and reaches `resolveAsset` / the SDK instead of a 400.

## Root cause

The `SupportedChainId` brand is minted at multiple boundaries without a corresponding runtime membership check, so the brand's promise ("this chain is one the SDK supports") is only as strong as call-site discipline:

- **SDK primitive (F095).** `getChain` is a raw `chainById[chainId]` registry lookup, the single `ChainManager` accessor that does not throw for an unconfigured chain, and it is exactly the one whose `.id` feeds the signed EIP-155 chainId.
- **SDK smart-wallet boundary (F109).** Entrypoints trust the typed `chainId` argument. `getPublicClient` / `getBundlerClient` do throw for an unconfigured chain, so the send path is defended in aggregate, but there is no single up-front gate and the address-derivation chain (`getSupportedChains()[0]`) is never reconciled against the passed chainId.
- **Backend schema cast (F299, F284).** `ChainIdSchema` / the lend inline schema check positivity only and then `as SupportedChainId`, asserting a membership the schema never verified; the swap controller already shows the correct refine, so this is a consistency gap, not a missing capability.

One defect at four cast sites: the configured/declared chain set is the authority, and these sites mint the `SupportedChainId` brand without consulting it.

## Recommended approach

The two SDK findings are an SDK refactor (in scope: runtime asserts on state the SDK already holds, no new public surface). The two backend findings are demo and therefore **review-only** (low-risk consistency fix, no architectural refactor).

SDK (in scope):

1. **Make `getChain` fail closed (F095).** Have `ChainManager.getChain` throw `ChainNotSupportedError` when `chainById[chainId]` is absent or the chainId is not in the configured set, mirroring `getRpcUrls` / `getChainConfig`. This removes the one unguarded primitive feeding the signed chainId so any consumer reaching `getChain` directly inherits the guard. **Dedup:** `getChain` (F095) is also listed in `eoa-chain-pinning.md`; land the `getChain` change once and have whichever ticket implements first own it, the other references it. The membership-guard helper that ticket introduces is the one this ticket reuses.

2. **Add a single chainId-membership gate at the smart-wallet entrypoints (F109).** At the top of `send` / `sendBatch` / `deploy` / `addSigner` / `removeSigner` (and `getCoinbaseSmartAccount`, the shared builder they funnel through), call the existing `validateChainSupported(chainId, this.chainManager.getSupportedChains())` helper (`packages/sdk/src/utils/validation.ts:117-124`) so an unconfigured chainId throws before any client is built, matching the EOA fix (F022) and `BaseActionProvider`. Reconcile the address-derivation chain: when `getAddress` derives from `getSupportedChains()[0]`, document/assert that the deployment address is chain-agnostic for the Coinbase smart-account (same counterfactual across configured chains) so derivation-vs-broadcast divergence is provably benign, or thread the operating chainId into derivation. Reuse the helper from finding 1.

Backend (demo — review-only, no refactor):

3. **F299 / F284 (review-only).** Recommended low-risk change: have `ChainIdSchema` / `ChainIdStringSchema` `.refine` against `SUPPORTED_CHAIN_IDS` (the `swap.ts` `chainIdFromNumber` pattern) so the `as SupportedChainId` cast is honest for every shared-schema consumer, and point the lend `marketId.chainId` fields at the shared `ChainIdSchema` instead of the inline `z.number().positive()`. This is the same `SUPPORTED_CHAIN_IDS` membership refine already present in the swap controller, applied to the shared schema and the one inline divergence. No architectural change, no new dependency; both gaps currently fail closed (borrow via allowlist re-resolution, lend via asset-not-found), so this is a consistency/boundary-error-quality fix, not a fund-safety fix. Mark as backlog/review-only on the demo surface.

## Affected files

- `packages/sdk/src/services/ChainManager.ts:162-164` (`getChain`; unguarded `chainById[chainId]` for F095 — shared with `eoa-chain-pinning.md`)
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:196-207` (`getCoinbaseSmartAccount`; shared builder for the entrypoints, F109)
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:217-250,261-294` (`sendBatch`/`send`; add up-front membership gate, F109)
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:456-500,573-587` (`deploy`; `getAddress` derivation from `getSupportedChains()[0]`, reconcile vs broadcast chain, F109)
- `packages/sdk/src/utils/validation.ts:117-124` (`validateChainSupported`; reused by the smart-wallet gate)
- `packages/demo/backend/src/helpers/schemas.ts:28-42` (`ChainIdSchema`/`ChainIdStringSchema`; add `SUPPORTED_CHAIN_IDS` refine, F299 — review-only)
- `packages/demo/backend/src/controllers/lend.ts:24-29,37-42` (lend inline `marketId.chainId`; point at shared schema, F284 — review-only)
- `packages/demo/backend/src/services/lend.ts:42-44` (the `resolveAsset(..., marketId.chainId as SupportedChainId)` cast site the schema fix makes honest)
- `packages/demo/backend/src/controllers/swap.ts:14-25` (`SUPPORTED_CHAIN_IDS` / `chainIdFromNumber` / `chainIdFromString`; the existing membership-refine pattern to mirror)

## Acceptance criteria / tests

- `getChain` fails closed (F095): `chainManager.getChain(<unconfigured id>)` throws `ChainNotSupportedError` rather than returning a `Chain` or `undefined`; `getChain(<configured id>)` still returns the expected chain. (If `eoa-chain-pinning.md` lands this first, this ticket asserts the smart-wallet entrypoints inherit it rather than re-implementing.)
- Smart-wallet gate (F109): `wallet.send(tx, <id not in chainConfigs>)`, `wallet.sendBatch([tx], <id not in chainConfigs>)`, and `wallet.deploy(<id not in chainConfigs>)` (each cast through `as SupportedChainId`) throw `ChainNotSupportedError` before any public/bundler client is built; a configured chainId still proceeds. A mutation that drops the up-front gate must fail this test.
- Derivation/broadcast reconciliation (F109): a test asserts the `getAddress` derivation chain (`getSupportedChains()[0]`) and the operating chainId yield the same counterfactual deployment address for the Coinbase smart-account, encoding *why* the divergence is benign (or, if threaded, that derivation uses the operating chainId).
- Backend schema refine (F299): `ChainIdSchema.safeParse(999999)` and `ChainIdStringSchema.safeParse('999999')` fail (`Unsupported chain ID`) after the refine; a supported id still parses to the typed value. (Review-only; assert if the demo fix is taken.)
- Lend controller (F284): `POST /lend/position/open` with `marketId.chainId = 1` returns 400 at the boundary rather than reaching `resolveAsset` / the SDK; a supported chainId still opens. (Review-only.)
- The on-chain end-to-end assertion (a smart-wallet send against an unconfigured chain under real signing) belongs to the consolidated Anvil feature-test ticket; this ticket covers the unit-level membership gates.

## Notes

- **Dedup with `eoa-chain-pinning.md`.** F095 (`getChain`) appears in both tickets. `eoa-chain-pinning.md` scopes the EOA path plus the shared `ChainManager` primitives (F022/F095/F112/F089) and explicitly says the membership-guard helper it introduces is the one the smart-wallet ticket should reuse, and that F109 is tracked separately. This ticket is that separate smart-wallet sibling plus the two backend cast sites. Implement `getChain` once; this ticket's smart-wallet and backend gates reuse the same helper / membership pattern so EOA, smart, and backend stay consistent.
- All four findings fail closed today (downstream `ChainNotSupportedError`, asset-not-found, or borrow allowlist miss), so none is a present fund-loss. The work is honesty of the `SupportedChainId` brand and consistency with the siblings that already gate, removing reliance on call-site discipline.
- Scope boundaries honored: all four are missing-obvious-validation / fail-closed-where-the-SDK-already-knows (membership checks against state the SDK holds), not intent-guessing, not broad refuse-to-sign, not RPC-content-trust hardening. The backend two are demo surface and kept review-only / no-refactor.
- This augments issue #334 (lend provider allowlist/blocklist and shared-abstraction gaps): the lend `marketId.chainId` membership gap (F284) and the shared backend `ChainIdSchema` refine (F299) are the chainId-validation slice of that same lend-controller / shared-utility family. Add this color to #334 and flag it as important to work during implementation.
