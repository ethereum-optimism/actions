# Make hosted registry validateOptions actually validate signing-key selectors

> **AUGMENT existing issue #330 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | medium |
| **Complexity** | 3 / 5 |
| **Domain** | wallet |
| **Surface** | `NodeHostedWalletProviderRegistry` / `ReactHostedWalletProviderRegistry` `validateOptions`, `WalletNamespace.isLocalAccount`, Turnkey `signWith`/`ToActionsWalletOptions` types (node + react), `SwapProvider.permit2ExpirationSeconds` getter |
| **Resolves findings** | F033, F092, F138, F137, F118 |
| **Candidate existing issue** | #330 |
| **Blocked by** | `hosted-signer-address-reconcile` |

## Problem

`validateOptions` is the registry factory's `options is TOptions` type-narrowing guard and the *only* programmatic validation choke point on the hosted-wallet construction path. The factory contract advertises that it validates the options before they become a signing backend. It does not. In node it checks one field's truthiness (`Boolean(options?.privyClient)` / `Boolean(o?.client)`); in react all three providers `return true` unconditionally. The fields that decide *which key signs* and *what address is reported* — Turnkey `organizationId`/`signWith`/`ethereumAddress`, Privy `walletId`/`address` — are supplied later per-call via `toActionsWallet`/`createSigner` and are never validated at any choke point. An empty-string or malformed `signWith`/`organizationId` flows straight into the vendor signing SDK with no shape check, deferring failure to remote-signing time or producing a wallet whose resolved signing address is a surprise.

The fund-safety framing: the SDK already knows, at construction time, that these are signing-identity selectors, yet it accepts a `signWith: ''` or a non-`isAddress` `ethereumAddress` and proceeds to build a signing wallet around it. This is a fail-closed-where-the-SDK-already-knows gap, not intent-guessing.

Two adjacent inconsistencies compound it:

- **Client lifecycle divergence.** Node pins the Turnkey `client` at provider construction (`NodeOptionsMap.turnkey = { client }`, validated once by the registry). React supplies the `client` fresh on every `toActionsWallet` call and never pins or validates it — so two wallets created from the same react provider can sign with two different Turnkey clients, and react has no truthiness guard on `client` at all (node at least checks `Boolean(o?.client)`). Same provider key, environment-dependent trust model, no shared contract test.
- **`as`-cast off an undeclared field.** `SwapProvider.permit2ExpirationSeconds` (the Permit2 sub-approval window — a signing-path expiry that governs how long a `maxUint160` standing-spend allowance stays valid) is read off `this._config` via `as { permit2ExpirationSeconds?: number }`. The field is declared only on `UniswapSwapProviderConfig`, so on every non-Uniswap provider the override is type-invisible and silently swallowed.

## Findings

- **F033** (medium, malicious-sign) — `packages/sdk/src/wallet/node/providers/hosted/registry/NodeHostedWalletProviderRegistry.ts:24-26,43-45`: `validateOptions` returns only `Boolean(options?.privyClient)` / `Boolean(o?.client)`; `packages/sdk/src/wallet/react/providers/registry/ReactHostedWalletProviderRegistry.ts:24,41,58`: all three react `validateOptions` `return true` unconditionally. The signing-key selectors bypass the only validation choke point on both environments.
- **F137** (medium, correctness) — `packages/sdk/src/wallet/react/providers/hosted/types/index.ts:60-65`: react `TurnkeyHostedWalletToActionsWalletOptions` carries `client` (per-call) while node `packages/sdk/src/wallet/node/providers/hosted/types/index.ts:60-64` omits it (client lives at `NodeOptionsMap.turnkey.client`, per-provider). A lifecycle/trust divergence for the same provider key, with no shared contract test.
- **F138** (low, correctness) — `packages/sdk/src/wallet/node/providers/hosted/types/index.ts:60-64`: `signWith` is typed bare `string` for three semantically distinct meanings (wallet-account address, private-key address, private-key ID); the type cannot encode "private-key-ID requires `ethereumAddress`", so an under-specified call type-checks and silently takes the slower/prompting resolution path.
- **F118** (medium, correctness) — `packages/sdk/src/actions/swap/core/SwapProvider.ts:118-125`: `permit2ExpirationSeconds` is read via `(this._config as { permit2ExpirationSeconds?: number })`; the field is declared only on `UniswapSwapProviderConfig` and absent from base `SwapProviderConfig` and `VelodromeSwapProviderConfig`, so the signing-path Permit2-expiry override is type-invisible and silently swallowed on every non-Uniswap provider.
- **F092** (low, correctness) — `packages/sdk/src/wallet/core/namespace/WalletNamespace.ts:22-34`: `isLocalAccount` admits any `{ type: 'local' }` object with `signMessage`/`signTransaction` functions; it never `isAddress`-validates `account.address`, and line 32 makes `signTypedData` *optional*, so a typedData-less account becomes a signing wallet and EIP-712 / Permit2 / credit-delegation signing fails at sign time instead of at wallet construction.

## Root cause

The hosted construction path advertises a validation choke point it does not staff. `validateOptions` is a type-narrowing predicate whose body only confirms the construction-time *connection handle* is present, never the *signing-identity selectors* — and react does not even do that. The selectors arrive per-call and are forwarded raw. `isLocalAccount` has the same shape: a structural duck-type with no `isAddress` and an optional sign-capability clause, run before provider dispatch, so a malformed account skips the hosted guard entirely. The `permit2ExpirationSeconds` `as`-cast is the same erosion expressed in the type system: a signing-path default read off a config shape the type does not declare. Across all five, the SDK has the information to fail closed at construction and instead defers to remote-signing time or swallows the value.

## Recommended approach

All changes are inside the SDK (SDK refactor allowed). This stays inside the missing-obvious-validation / fail-closed-where-the-SDK-already-knows / sibling-consistency scope — no intent-guessing, no broad refuse-to-sign, no RPC-trust hardening.

1. **Decide the choke-point contract, then enforce it once.** Either (a) narrow the `validateOptions` JSDoc to state explicitly that it only confirms the construction-time client is present (NOT a signing-identity guard), and move signing-key-selector validation into `toActionsWallet`/`createSigner`; or (b) keep `validateOptions` as the choke point but extend it to the selectors it can see. Given the selectors are per-call inputs (not construction-time), (a) is the cleaner seam: add the selector validation at the single `toActionsWallet`/`createSigner` entry point with a named error so node and react share one validate-before-sign guarantee. React must gain the `client` truthiness check node already has.

2. **Validate the Turnkey selectors (F033, F138).** At the `toActionsWallet`/`createSigner` boundary: reject empty/whitespace `organizationId` and `signWith`; when `ethereumAddress` is supplied, require `isAddress(ethereumAddress)`. The *reconciliation* of a caller `ethereumAddress` against the resolved `signWith` key (and what counts as a canonical resolved address) is the `hosted-signer-address-reconcile` ticket's job — this ticket adds the shape/presence guards and consumes that ticket's definition of "valid resolved address". F138's discriminated-union / branded-type modeling of `signWith` (per #475) is the type-precision half; at minimum land the runtime `isAddress` guard here.

3. **Validate the Privy selectors (F033).** Same pattern: non-empty `walletId`, `isAddress(address)` before the address becomes the reported signing identity.

4. **Pin the react Turnkey client (F137).** Make the node-vs-react `ToActionsOptions` split intentional and tested: either unify the two shapes, or document the split in schema JSDoc and add a type-level / snapshot guard over both maps' `turnkey` entries so the divergence cannot silently drift. React should validate the per-call `client` is present before it becomes the signing backend; if the provider is meant to pin one client, capture it at construction like node does.

5. **Tighten `isLocalAccount` (F092).** Require `isAddress(record.address)` (and ideally `getAddress` equality) before returning true, and drop the optional clause so `signTypedData` is required for a wallet that will be asked to sign EIP-712 / Permit2 payloads — fail at construction, not mid-flow. Normalize via `getAddress(account.address)` in `LocalWallet`'s constructor.

6. **Declare `permit2ExpirationSeconds` on the base config (F118).** Move `permit2ExpirationSeconds?: number` onto the base `SwapProviderConfig`, delete the local redeclaration on `UniswapSwapProviderConfig`, and remove the `as`-cast in the getter so the override is discoverable and type-checked on every provider.

## Affected files

- `packages/sdk/src/wallet/node/providers/hosted/registry/NodeHostedWalletProviderRegistry.ts:24-26,43-45` — node `validateOptions` truthiness-only on `privyClient` / `client` (F033)
- `packages/sdk/src/wallet/react/providers/registry/ReactHostedWalletProviderRegistry.ts:24,41,58` — react `validateOptions` unconditional `return true` for all three providers (F033)
- `packages/sdk/src/wallet/react/providers/hosted/types/index.ts:60-65` — react Turnkey `ToActionsWalletOptions` includes per-call `client` (F137); `signWith` bare `string` (F138)
- `packages/sdk/src/wallet/node/providers/hosted/types/index.ts:60-64` — node Turnkey `ToActionsWalletOptions` omits `client` (F137); `signWith` bare `string` (F138)
- `packages/sdk/src/wallet/core/namespace/WalletNamespace.ts:22-34` — `isLocalAccount` no `isAddress`, `signTypedData` optional clause (F092)
- `packages/sdk/src/actions/swap/core/SwapProvider.ts:118-125` — `permit2ExpirationSeconds` `as`-cast off an undeclared config field (F118)

## Acceptance criteria / tests

Each test must fail when the guard is reverted (encode why the selector validation matters, not just that the call runs). The existing registry spec (`NodeHostedWalletProviderRegistry.spec.ts`, F228) pins only client-truthiness — a positive case satisfied by client-presence alone — so the no-op contract is currently permanently green; these tests flip that.

- Node `validateOptions` (or the chosen choke point) rejects `{ client, signWith: '' }` / `{ client, organizationId: '' }` and a non-`isAddress` `ethereumAddress`; a well-formed selector set still passes. Same for Privy `walletId`/`address`.
- React Turnkey rejects a missing/falsy per-call `client` before it becomes the signing backend; a present client + well-formed selectors resolves.
- A type-level / snapshot guard asserts the node-vs-react `turnkey` `ToActionsOptions` shapes are the intended ones (so the `client`-present-in-react divergence cannot drift unnoticed).
- `isLocalAccount` rejects an account with a non-`isAddress` `address` and an account missing `signTypedData`; a fully-formed local account still wraps into a signing `LocalWallet`.
- A provider-config `permit2ExpirationSeconds` set on a non-Uniswap provider type-checks (no `as`-cast) and reaches the resolved getter / `buildPermit2Approvals` `expirySeconds`; the field resolves provider → global → 30-day default on every provider.

## Notes

- This augments **#330**. The Turnkey `signWith`/`ethereumAddress` *reconciliation* root (resolving the caller-asserted address against the actual signing key, F031/F074) is the `hosted-signer-address-reconcile` ticket and is the blocker: that work establishes what a "valid resolved signing address" is, which this ticket's `isAddress`/presence guards then enforce at the construction boundary. This ticket adds the cheap shape/presence guards; it does not reimplement the reconciliation.
- F138's full discriminated-union / branded-`signWith` modeling is tracked under #475; the runtime `isAddress`-on-`ethereumAddress` guard lands here regardless.
- F118 carries candidate issue #337 in the ledger (the protocol-SDK-boundary `as`-cast lens); it is folded into this hosted-validation ticket because it is the same fail-closed-where-the-SDK-already-knows pattern on a signing-path default, and the fix (declare-on-base, drop the cast) is small and self-contained.
- The registry-test no-op-guard lock-in (F228) is the test half of F033 and is satisfied by the acceptance criteria above; no separate ticket.
