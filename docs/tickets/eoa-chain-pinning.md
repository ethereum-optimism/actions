# Pin and verify chainId in EOA send/sendBatch signatures

| Field | Value |
| --- | --- |
| **Severity** | medium |
| **Complexity** | 2 (of 5) |
| **Domain** | wallet |
| **Surface** | `EOAWallet.walletClient`/`send`/`sendBatch` (chain set on the wallet client skips `eth_chainId` node verification; chainId not gated on the configured set), `ChainManager.getChain` / `createPublicClients` (config chainIds validated against viem's global `chainById`, not `SUPPORTED_CHAIN_IDS`) |
| **Resolves findings** | F089, F022, F095, F112 |
| **Candidate existing issue** | none |
| **Blocked by** | (none) |

## Problem

The EOA signing path binds an EIP-155 chainId into every transaction it signs, but never reconciles that chainId against three things it can independently check: (1) the SDK's configured chain set, (2) the SDK's declared `SUPPORTED_CHAIN_IDS`, and (3) the chain actually served by the node behind the configured transport.

`EOAWallet.walletClient` builds a viem `WalletClient` with `chain: chainManager.getChain(chainId)`. Setting `chain` on the client makes viem's `sendTransaction` **skip** the `eth_chainId` round-trip it would otherwise use to confirm the connected node serves that chain; viem stamps the EIP-155 chainId from the client chain and broadcasts. So if an integrator's config maps chainId `10` to an RPC URL that actually serves chain `8453` (copy-paste, load-balancer misroute), the SDK signs a chain-10-bound transaction and submits it to a Base node. Best case the node rejects it (availability hit). Worst case, on a node that does not strictly enforce the intake chainId, the signed payload is broadcastable on a chain where the calldata was never intended to execute. The signer authorizes an approval/transfer/borrow against the wrong network without any signal.

Upstream of that, `ChainManager.getChain` returns `chainById[chainId]` with **no membership check**, and `createPublicClients` only rejects a config chain when it is absent from viem's *global* `chainById` registry, not when it is absent from the SDK's `SUPPORTED_CHAIN_IDS`. `chainById` is far larger than the SDK's supported tuple, so a viem-known-but-SDK-unsupported chainId (passed by a JS integrator or any `as SupportedChainId` cast) is silently accepted, a public client is built for it, and `getChain` hands back a real `Chain` whose `.id` becomes the signed EIP-155 chainId. The chain-scope invariant the SDK advertises rests on a compile-time-only TS brand that does not survive a cast.

Fund-safety framing: the chainId is the network the signer is authorizing spend on. Today the SDK can derive every value needed to confirm "the chain I am signing for is configured, supported, and actually behind this transport," but the EOA path asserts none of them. All three checks compare a value against state the SDK already holds; this is missing-obvious-validation and fail-closed-where-the-SDK-already-knows, not intent-guessing or RPC-content-trust hardening.

## Findings

- **F089** — `EOAWallet.walletClient` sets `chain: this.chainManager.getChain(chainId)` (`packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:47-51`), which makes viem skip the `eth_chainId` verification of the connected node, so a misrouted RPC URL yields sign-for-chainA / broadcast-on-chainB with no reconciliation against the node identity.
- **F022** — `EOAWallet.send`/`sendBatch` accept any `chainId` and route it through `walletClient` -> `getChain` with no membership check against `chainManager.getSupportedChains()` (`packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:62-100`); the smart-wallet path is defended in aggregate by `getPublicClient`/`getBundlerClient`, but the EOA path is not.
- **F095** — `ChainManager.getChain` returns `chainById[chainId]` with no membership check (`packages/sdk/src/services/ChainManager.ts:162-164`), unlike `getRpcUrls`/`getBundlerUrl`/`getChainConfig` which throw `ChainNotSupportedError`; its result directly determines the signed EIP-155 chainId, and for a chainId absent from `chainById` it returns `undefined` rather than throwing. Producer-side of F022.
- **F112** — `ChainManager.createPublicClients` only rejects a config chain when `chainById[chainConfig.chainId]` is falsy (`packages/sdk/src/services/ChainManager.ts:198-202`), never asserting membership in `SUPPORTED_CHAIN_IDS`, so a viem-known-but-SDK-unsupported chainId is accepted at the infrastructure layer. Producer-side sibling of F095.

## Root cause

The EOA signing chain is threaded purely as a `SupportedChainId` TS type, with no runtime gate at any point where it becomes a real signature input:

- **No configured-set gate at the wallet boundary (F022).** `send`/`sendBatch` trust the typed argument and pass it straight to `walletClient`.
- **No membership check in the chain primitive (F095).** `getChain` is a raw `chainById[chainId]` lookup, the one ChainManager accessor that does not throw for an unconfigured chain, and it is exactly the one feeding the signed chainId.
- **No support-set gate at construction (F112).** `createPublicClients` validates against viem's global registry instead of `SUPPORTED_CHAIN_IDS`, so the runtime chain set can exceed the SDK's declared support.
- **No node-identity reconciliation (F089).** Pre-setting `chain` on the wallet client opts out of viem's own `eth_chainId` confirmation, and the SDK adds no replacement, so the configured chainId and the node's actual chainId are never reconciled.

The four are one defect viewed at four layers: the chainId that gets signed is never proven to be a configured, supported chain that the connected node actually serves.

## Recommended approach

SDK refactor (in scope). No new public surface; these are runtime asserts on values the SDK already holds.

1. **Gate `send`/`sendBatch` on the configured chain set (F022).** At the top of `EOAWallet.send` (and therefore `sendBatch`, which delegates to `send`), call the existing `validateChainSupported(chainId, this.chainManager.getSupportedChains())` helper (`packages/sdk/src/utils/validation.ts:117`) so an unconfigured chainId throws `ChainNotSupportedError` before any client is built, mirroring how `BaseActionProvider` already guards action entrypoints.

2. **Make `getChain` fail closed (F095).** Have `ChainManager.getChain` throw `ChainNotSupportedError` when `chainById[chainId]` is absent or the chainId is not in the configured set, matching `getRpcUrls`/`getChainConfig`. This removes the one unguarded primitive that feeds the signed chainId, so any future consumer reaching `getChain` directly inherits the guard.

3. **Validate config chainIds against `SUPPORTED_CHAIN_IDS` at construction (F112).** In `createPublicClients`, in addition to the `chainById` existence check, assert each `chainConfig.chainId` is in `SUPPORTED_CHAIN_IDS` and throw `ChainNotSupportedError` otherwise, so the runtime chain set cannot exceed the SDK's declared support regardless of TS casts.

4. **Reconcile the node's `eth_chainId` against the configured chain (F089).** On first use of a chain's EOA wallet/public client, perform a one-time `eth_chainId` read and assert it equals `chainId`, caching the result (throw a named `ChainMismatchError` on mismatch). Equivalently, stop pre-setting `chain` and let viem run its own verification, surfacing the mismatch as the same named error. This adds at most one RPC call per chain on first use; gate it to default-on and cache the result, mirroring how the codebase handles other one-time self-tests. This is an SDK-side node-identity reconciliation, **not** RPC-content-trust hardening: the SDK only confirms the node it was handed serves the chain it is about to sign for. Integrators bringing their own RPC remains a documented assumption.

Consistency note: F095 and F112 are the producer-side complements of the F022 consumer-side gap and should land together so the chain bound into a signature is provably a configured, supported chain at every layer. The smart-wallet entrypoints have the sibling membership gap (F109, recorded separately); this ticket scopes the EOA path and the shared `ChainManager` primitives, and the membership-guard helper introduced here is the one the smart-wallet ticket should reuse.

## Affected files

- `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:33-52` (`walletClient`; `chain: getChain(chainId)` at 49, the `eth_chainId`-skip seam for F089)
- `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:62-100` (`send`/`sendBatch`; add the configured-set gate for F022)
- `packages/sdk/src/services/ChainManager.ts:162-164` (`getChain`; unguarded `chainById[chainId]` for F095)
- `packages/sdk/src/services/ChainManager.ts:198-202` (`createPublicClients`; `SUPPORTED_CHAIN_IDS` assertion for F112)
- `packages/sdk/src/utils/validation.ts:117-124` (`validateChainSupported`; reused by the `send`/`sendBatch` gate)
- `packages/sdk/src/core/error/errors.ts` (`ChainNotSupportedError` exists; add a named `ChainMismatchError` for the F089 node-identity mismatch)

## Acceptance criteria / tests

- Configured-set gate (F022): `wallet.send(tx, <id not in chainConfigs>)` and `wallet.sendBatch([tx], <id not in chainConfigs>)` throw `ChainNotSupportedError` before any wallet client is constructed; a configured chainId still sends.
- `getChain` fails closed (F095): `chainManager.getChain(<unconfigured id>)` throws `ChainNotSupportedError` rather than returning a `Chain` or `undefined`; `getChain(<configured id>)` still returns the expected chain.
- Support-set gate (F112): constructing a `ChainManager` with a `ChainConfig` whose `chainId` is viem-known but absent from `SUPPORTED_CHAIN_IDS` (cast through `as SupportedChainId`) throws `ChainNotSupportedError`; a config containing only supported chains constructs cleanly. A mutation that drops the `SUPPORTED_CHAIN_IDS` assertion must fail this test.
- Node-identity reconciliation (F089): with a mocked transport whose `eth_chainId` returns a chainId different from the configured chainId, `send` throws `ChainMismatchError` and never broadcasts; when `eth_chainId` matches, `send` proceeds and the reconciliation runs at most once per chain (cached on a second `send`).
- The on-chain end-to-end assertion (a chain-10-signed tx rejected by a chain-8453 node under real signing) belongs to the consolidated Anvil feature-test ticket; this ticket covers the unit-level gate and reconciliation assertions.

## Notes

- Overlap to deduplicate at implementation: `prebuilt-quote-value-chain-reconcile.md` also lists F089 (as the EOA `eth_chainId` reconciliation attached to its quote value/chain seam). The node-identity reconciliation belongs here, alongside its F022/F095/F112 siblings, because it is a wallet-layer/ChainManager concern independent of any quote object. The quote-value-chain ticket should keep only the quote-field chain assertion (F084) and reference this ticket for the EOA `eth_chainId` guard rather than re-implementing it. Land the shared `ChainMismatchError` once.
- EIP-155 signing itself is sound: viem binds the configured `chain.id` into the signature. The gap is that the configured chainId is never proven to be configured, supported, and served by the connected node, all of which the SDK can derive locally.
- Scope boundaries honored: F022/F095/F112 are missing-obvious-validation and fail-closed-where-the-SDK-already-knows (membership checks against state the SDK holds). F089 is an SDK-side node-identity reconciliation adjacent to, but not, RPC-content-trust hardening; integrators bringing their own RPC stays a documented assumption. No broad refuse-to-sign and no intent-guessing.
- The smart-wallet sibling membership gap (F109) is tracked separately; reuse the membership-guard helper and `ChainMismatchError` introduced here when that ticket lands, so the EOA and smart paths stay consistent.
