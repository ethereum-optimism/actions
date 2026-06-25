# Type external API boundaries and tighten lying public type contracts

> **AUGMENT existing issue #337** - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.

| Field | Value |
| --- | --- |
| **Severity** | low |
| **Complexity** | 3 / 5 |
| **Domain** | core |
| **Surface** | Morpho GraphQL `any` boundary; `ApyBreakdown` open index signature; smart-wallet `Signer` union; `HostedWalletProvider` shared param type; `Wallet.send`/`sendBatch` JSDoc; sibling action amount-type contract; react Privy `signTypedData` cast |
| **Resolves findings** | F101, F127, F136, F141, F151, F367, F134, F073-cast |
| **Candidate existing issue** | #337 |
| **Blocked by** | (none) |

## Problem

These are public type contracts on the SDK surface that an integrator or agent reads to decide what a value *is* before acting on it. None is exploitable on its own, but each is a place where the type lies about runtime reality on a path that ultimately feeds a displayed amount, a signing decision, or a fund-moving leg:

- **Untyped external boundary feeding displayed APY.** The Morpho GraphQL fetch returns `any`/`Promise<any | null>` with no response schema, and the consuming code reads `vault.fee`, `reward.supplyApr`, and `alloc.supplyAssetsUsd` straight off that `any` with only `|| 0` coalescing. There is no shape that says which fields exist or that they are finite numbers; a missing/`null`/`NaN`/string field flows into `calculateApyBreakdown` and surfaces as `apy.total` and `LendTransaction.apy`. The user makes a deposit decision on a number computed from an unvalidated external response. (This is the type-contract root; the *value* finiteness guard is its own ticket, `apy-finiteness-and-aave-share-price.md`.)
- **An index signature that admits `undefined` as a numeric field.** `ApyBreakdown` declares `[key: string]: number | undefined`. That open signature means `breakdown.total` and every named field type-widen to `number | undefined`, so a consumer reading `apy.total` gets a value the compiler says might be `undefined` even though it is always set, and conversely any string key returns `number | undefined` with no signal whether the reward token exists. The display layer either non-null-asserts (defeating the type) or silently renders `undefined`.
- **A signer union that mixes a non-signing identifier with signing accounts.** The smart-wallet `Signer = Address | OneOf<LocalAccount | WebAuthnAccount>` puts a plain `Address` (which cannot sign) in the same type as accounts that can. There is no type-level guard that a context which must produce a signature actually received a signing account rather than a bare address; the mismatch is only caught at runtime, on the signing path.
- **An abstract param type that understates the real construction-time contract.** `HostedWalletProvider.createSigner(params: TOptionsMap[TType])` shares one param type with `toActionsWallet`, but the node Privy provider feeds `createSigner` construction-time deps (`privyClient`, `authorizationContext`) merged in via `{ ...params, privyClient, authorizationContext }`. The abstract signature claims the call-site params are sufficient when the real contract also depends on instance state, so the public type understates what produces the signer.
- **JSDoc that contradicts the return type.** `Wallet.send`/`sendBatch` JSDoc says "resolving to the transaction hash," but every implementation returns a full receipt object (`EOATransactionReceipt`, `receipt[]`, `WaitForUserOperationReceiptReturnType`). A caller who trusts the prose and treats the result as a hash string mis-reads a receipt object.
- **A vendor-signature cast on the Permit2/EIP-712 seam.** React Privy `createSigner` casts the vendor `signTypedData` to `CustomSource['signTypedData']` to satisfy `toAccount`. This is a signing-path boundary cast (Permit2 signature payloads cross here) with no recovering-signer test pinning that the re-wrapped account actually produces a signature recoverable to the expected address.

## Findings

- **F101** — `packages/sdk/src/actions/lend/providers/morpho/api.ts:17-20,82-83`: `fetchRewards` returns `Promise<any | null>` and parses the response as `(await response.json()) as any`; the GraphQL boundary has no response schema. Consumed downstream as displayed APY (`packages/sdk/src/actions/lend/providers/morpho/sdk.ts:538-579`).
- **F127** — `packages/sdk/src/types/lend/base.ts:146-157`: `ApyBreakdown` has an open `[key: string]: number | undefined` index signature that erases precision on a public return type and lets `undefined` leak into every named field's inferred type.
- **F136** — `packages/sdk/src/wallet/core/wallets/smart/abstract/types/index.ts:19`: `Signer = Address | OneOf<LocalAccount | WebAuthnAccount>` mixes a non-signing `Address` with signing accounts under one type, with no type-level guard separating an owner-identifier from a signing signer.
- **F141** — `packages/sdk/src/wallet/core/providers/hosted/abstract/HostedWalletProvider.ts:45-56`: abstract `createSigner`/`toActionsWallet` share one `TOptionsMap[TType]` param type, but `packages/sdk/src/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.ts:87-95` spreads `{ ...params, privyClient, authorizationContext }`, so the abstract signature understates the real construction-time contract.
- **F151** — `packages/sdk/src/types/borrow/params.ts:12,20`: borrow exposes a precise `Amount = { amount: number } | { amountRaw: bigint }`, but lend (`amount: number` at `packages/sdk/src/types/lend/base.ts:248,312`) and swap (`amountIn?`/`amountOut?: number` at `packages/sdk/src/types/swap/base.ts:80-83`) offer no `amountRaw` bigint escape hatch on the public sibling-action contract. Tracked under #379.
- **F367 → F134** — `packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts:176-198`: `send`/`sendBatch` JSDoc says "resolving to the transaction hash" but every implementation returns a full receipt (`TransactionReturnType` / `BatchTransactionReturnType`). Doc-vs-type mismatch tracked under #367.
- **F073-cast** — `packages/sdk/src/wallet/react/wallets/hosted/privy/utils/createSigner.ts:27-28`: casts vendor `signTypedData` to `CustomSource['signTypedData']` on the EIP-712/Permit2 seam with no recovering-signer test; only react Privy re-wraps and casts (residual boundary cast).

## Root cause

Public boundaries were typed for convenience rather than for what crosses them:

- **External responses were never schematized.** The Morpho GraphQL fetch was written to return `any` because the response was treated as throwaway display data; the typed shape was never declared, so the `any` propagates all the way to a public APY return type.
- **Index signatures and unions were widened to fit dynamic keys.** `ApyBreakdown`'s open signature exists to carry per-token reward keys, and `Signer` was widened to accept an owner address. In both cases the widening leaked into the named/required portion of the type, so the precise contract was lost.
- **JSDoc drifted from the implementation.** `send`/`sendBatch` originally returned a hash; the return type was changed to a receipt but the prose was not updated.
- **Vendor seams were cast rather than adapted.** The Privy `signTypedData` cast papers over a structural mismatch between the vendor account and viem's `CustomSource`; the cast is on a signing path but has no test asserting signature recoverability.

These are the per-boundary instances of #337 ("Replace all `any` types with specific types"), plus the two adjacent doc/contract inconsistencies (#367, #379) that share the same review pass.

## Recommended approach

Scope: SDK type refactors are in scope. Keep each change surgical to the named boundary; do not restructure the wallet or lend modules.

- **Morpho GraphQL boundary (F101) — add a response schema.** Declare an interface (or zod schema) for the `vaultByAddress` response shape `fetchRewards` requests, narrow the return type to that shape `| null`, and parse/validate against it instead of casting to `any`. This gives the downstream APY math a typed input. Do not fold in the *value* finiteness/sign checks here; those belong to `apy-finiteness-and-aave-share-price.md` (cross-reference, do not duplicate). This ticket is the type contract; that ticket is the runtime guard.
- **`ApyBreakdown` (F127) — split the named fields from the dynamic keys.** Keep `total`/`native`/`totalRewards`/`performanceFee` as required `number`, and express the per-token reward keys as a separate typed sub-shape (e.g. a `rewards: Record<string, number>` field or a branded mapped type) so the open `number | undefined` index signature no longer widens the named fields. Verify consumers no longer need non-null assertions.
- **`Signer` union (F136) — separate owner-identifier from signing-signer.** Introduce a type-level split so that a context requiring a signature is typed against the signing accounts only (`OneOf<LocalAccount | WebAuthnAccount>`), while owner-set/identifier contexts accept the `Address`. The goal is that "this code path will sign" is expressible in the type, not discovered at runtime. Keep the public alias if needed for back-compat but stop using the union where a signer is mandatory.
- **`HostedWalletProvider` param type (F141) — make the construction-time deps part of the contract.** Either widen the abstract `createSigner` signature to reflect the instance-supplied deps (so the spread is no longer hidden), or split the call-site params from the construction-time deps in the type so the abstract signature stops claiming the params alone are sufficient. Apply consistently across node Privy/Turnkey providers so siblings agree.
- **`Wallet.send`/`sendBatch` JSDoc (F367 → F134) — correct the prose.** Change "resolving to the transaction hash" to describe the actual receipt return type (`TransactionReturnType` / `BatchTransactionReturnType`). Doc-only change; tracked under #367.
- **Sibling amount-type contract (F151) — align lend/swap with borrow.** This is the public-type root of the F041 precision findings and is already tracked under #379 (accept optional `*Raw` bigint amounts). Recommend adopting borrow's `Amount = { amount: number } | { amountRaw: bigint }` convention (or the swap-shaped `amountInRaw?`/`amountOutRaw?` it already half-has) on lend so all three sibling actions offer the same raw bigint escape hatch. Coordinate with #379 rather than forking a parallel design.
- **React Privy `signTypedData` cast (F073-cast) — keep the cast, add the missing test.** The structural cast to `CustomSource['signTypedData']` is acceptable at the vendor seam, but because Permit2 signature payloads cross it, add a recovering-signer test: sign a representative EIP-712 / Permit2 typed-data payload through the wrapped account and assert the signature recovers to the expected address. This is the only re-wrap-and-cast site, so one test covers it. (Sibling test gap F229 is the same surface.)

## Affected files

- `packages/sdk/src/actions/lend/providers/morpho/api.ts:5-10,17-20,82-83` — add response schema; narrow `fetchRewards` return type.
- `packages/sdk/src/actions/lend/providers/morpho/sdk.ts:467-491,514-579` — consumes the boundary as `any` (reference; typed input flows here).
- `packages/sdk/src/types/lend/base.ts:146-157` — `ApyBreakdown` index-signature split.
- `packages/sdk/src/types/lend/base.ts:248,312` — lend `amount: number` sibling contract (F151).
- `packages/sdk/src/types/swap/base.ts:80-83,118-119` — swap `amountIn`/`amountOut` + existing `*Raw` fields (F151 reference).
- `packages/sdk/src/types/borrow/params.ts:12,20` — borrow `Amount` convention to mirror (F151 reference).
- `packages/sdk/src/wallet/core/wallets/smart/abstract/types/index.ts:19` — `Signer` union split.
- `packages/sdk/src/wallet/core/providers/hosted/abstract/HostedWalletProvider.ts:45-56` — abstract `createSigner` param contract.
- `packages/sdk/src/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.ts:87-95` — node spread that the abstract type understates.
- `packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts:176-198` — `send`/`sendBatch` JSDoc correction.
- `packages/sdk/src/wallet/react/wallets/hosted/privy/utils/createSigner.ts:22-29` — recovering-signer test on the `signTypedData` cast.
- `packages/sdk/src/wallet/react/wallets/hosted/privy/utils/__tests__/createSigner.spec.ts:16-20,57-63` — extend with the recovery assertion (F229 sibling surface).

## Acceptance criteria / tests

- `fetchRewards` no longer returns `any`; a typed response shape is declared and the consumed fields (`fee`, `supplyApr`, `supplyAssetsUsd`) are read off that type. A test passes a malformed/partial GraphQL response and asserts the typed boundary handles it (returns `null` or a defined fallback) rather than propagating an untyped value.
- `ApyBreakdown.total` / `native` / `totalRewards` / `performanceFee` infer as required `number` (not `number | undefined`) at consumer call sites; per-token reward keys remain accessible via the separated sub-shape. No new non-null assertions introduced.
- A signing-only context references a signer type that excludes plain `Address`; passing a bare `Address` where a signature is required is a compile error.
- The abstract `HostedWalletProvider.createSigner` signature reflects (or cleanly separates) the construction-time deps that node providers spread in; node Privy and Turnkey agree on the shape.
- `Wallet.send`/`sendBatch` JSDoc describes the receipt return type; no remaining "transaction hash" prose on methods returning receipts.
- Lend offers a raw bigint amount escape hatch consistent with borrow/swap (coordinated with #379); a test constructs a lend params object using the raw variant and it typechecks.
- A recovering-signer test signs a Permit2/EIP-712 payload through the react Privy wrapped account and asserts the signature recovers to the account address.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` pass across the SDK.

## Notes

- This ticket is type-contract surface only. The runtime *value* guards that share these paths live in separate tickets: APY finiteness/sign and the Aave share-price guard in `apy-finiteness-and-aave-share-price.md`, and the broader amount precision findings (F041 family) under #379. Cross-reference, do not duplicate the guard logic here.
- F151 and F134/F367 already have dedicated upstream issues (#379, #367). The value of folding them into #337's color is that they are the same "public type tells the caller the wrong thing" theme; flag them so they are not implemented in isolation with divergent conventions.
- RPC trust is out of scope by the standing assumption (integrators supply their own RPC); the Morpho GraphQL endpoint here is a distinct external service whose *response shape* the SDK already consumes into a public return type, which is why typing it is in scope.
- The Privy `signTypedData` cast finding overlaps the test-gap finding F229 on the same file; resolve both with the single recovering-signer test rather than two parallel tests.
