# Reconcile native msg.value and dispatch chainId against encoded quote on pre-built dispatch

> **AUGMENT existing issue #373 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| | |
|---|---|
| **Severity** | medium |
| **Complexity** | 4 / 5 |
| **Domain** | core (SDK) |
| **Surface** | `packages/sdk/src/actions/swap/core/SwapProvider.ts:434-451` (value + chain), `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:232-237` (dispatch chainId), `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:33-73` (chain pinning) |
| **Resolves findings** | F084, F089 (with sibling color from refines:F070 swap value/chain rows) |
| **Candidate existing issue** | #373 (*Add calldata integrity validation to SwapProvider quote execution*) |
| **Blocked by** | `prebuilt-quote-calldata-integrity` |

This ticket is the **value + chain reconciliation** half of the pre-built-quote hardening. Its sibling, `prebuilt-quote-calldata-integrity` (router/calldata re-derivation, F070), owns the address/bytes half. This ticket is sequenced **after** that one: the calldata-integrity work establishes the "re-derive the expected quote for this wallet on this chain" seam, and the value/chain checks here attach to the same seam rather than introducing a parallel one.

## Problem

When a caller hands a pre-built quote to `wallet.swap.execute(quote)` or `wallet.borrow.<action>(quote)`, the SDK ships two quote-derived fields straight onto the signing/broadcast path with **no reconciliation against what the SDK can independently compute**:

1. **Native `msg.value`.** `buildSwapTransactions` copies `quote.execution.value` verbatim into the outgoing tx's `value` (the native ETH attached to the call). Nothing checks that `value` is consistent with the quote's own `amountInRaw` and native-in flag: for a native-in swap `value` should equal the input amount the user reviewed; for an ERC20-in swap `value` should be zero. A quote whose `execution.value` was inflated relative to the reviewed `amountIn` (or set non-zero on an ERC20-in swap) signs away more native ETH than the user reviewed. The SDK already knows the expected value from the encoded amount, so this is a fail-closed-where-the-SDK-already-knows gap, not intent-guessing.

2. **Dispatch chainId.** The chain the bundle is signed and broadcast on is taken from caller-influenced quote metadata — `quote.marketId.chainId` (borrow) / `quote.chainId` via `params.chainId` (swap) — and passed straight to the wallet, which builds an EIP-155 signing client for exactly that chain. The existing guards (`validateChainSupported`, allowlist membership) only prove the chain is *somewhere* in the supported/allowlisted set; **neither pins the chain the user actually intends to transact on**. A quote whose chainId is swapped to another supported chain (whose allowlist also contains a matching market) routes a chain-A-built, chain-A-reviewed bundle onto chain B. This is the classic sign-for-A / broadcast-on-B shape, and the chain-specific calldata (pool/router/token addresses resolved at build time from the original chain) was never re-derived for the new chain.

Fund-safety framing: both gaps let a tampered or mis-threaded pre-built quote move more native value, or execute on a different chain, than the value/chain the user reviewed — while every existing guard reports the quote as valid.

## Findings

- **F084** — `WalletBorrowNamespace.dispatch` (`WalletBorrowNamespace.ts:232-237`) passes `quote.marketId.chainId` straight to `executeTransactionBatch(this.wallet, [...], chainId)`; `validateQuoteForThisWallet` (`:219`) only runs `validateChainSupported` + allowlist membership, so a tampered `marketId.chainId` re-targets the signed bundle onto a different supported chain with no chain-intent reconciliation.
- **F089** — `EOAWallet.walletClient` (`EOAWallet.ts:47-51`) sets `chain: getChain(chainId)` on the viem client, which makes viem **skip** the `eth_chainId` round-trip; the EIP-155 chainId is stamped from the client chain and broadcast, so the node identity behind the configured transport is never reconciled against the chain bound into the signature (sign-for-chainA / broadcast-on-chainB if an RPC URL is misrouted).
- **(sibling color, refines:F070)** — `buildSwapTransactions` (`SwapProvider.ts:411-414`) copies `quote.execution.value` verbatim into the swap tx `value`, and `executeFromQuote` (`:434-438`) validates only expiry + non-zero router; the swap dispatch chain comes from `params.chainId` in `WalletSwapNamespace.execute` (`:79,83`) with the same "supported, not intended" gap as borrow.

## Root cause

Two distinct seams trust caller-influenced metadata where the SDK could reconcile:

- **Value seam (swap):** the pre-built path has no equivalent of the raw path's `resolveParams` value derivation; `execution.value` is treated as opaque signed bytes rather than reconciled against the encoded `amountIn` / native-in flag the SDK can recompute.
- **Chain seam (swap + borrow + EOA):** "supported chain" and "intended chain" are conflated. `validateChainSupported` / allowlist membership answer *is this a chain we know?* but nothing answers *is this the chain bound into the quote I reviewed, and is the wallet/node actually on it?* The dispatch chainId is whatever the quote says, and `EOAWallet` pre-sets `chain` so viem never verifies the node behind the transport matches.

## Recommended approach

Attach to the calldata-integrity seam from the blocking ticket rather than building a parallel one. All work is SDK-side (core domain); no demo/CLI changes here.

**1. Value-vs-amountIn reconciliation (swap, F070 sibling).** In the pre-built swap path (`executeFromQuote` / `buildSwapTransactions`), assert `quote.execution.value` is consistent with the quote's encoded input:
- ERC20-in (non-native `assetIn`): require `execution.value === 0n`.
- Native-in: require `execution.value` equals the expected native input the SDK derives from the quote (the same `amountInRaw` / native-in derivation the raw path uses), within the quote's own slippage band for exact-output where the input is `amountInMaximum`.
- Throw a named error (e.g. `QuoteValueMismatchError`) on mismatch. This is fail-closed where the SDK already knows the number; it does not guess caller intent.

**2. Chain-intent reconciliation (swap + borrow).** Make the dispatch chain an explicitly intended chain, not blindly `quote.*.chainId`:
- Pin the dispatch chainId to the wallet's intended chain (the chain the caller passed / the wallet is operating on) and assert it equals `quote.marketId.chainId` (borrow) / `quote.chainId` (swap) before dispatch; throw a named `QuoteChainMismatchError` on divergence.
- Keep the swap and borrow namespaces consistent: both pre-built paths should run the **same** chain-intent assertion (today only recipient + chain-supported is shared). This closes the sibling-consistency gap between `validateQuoteForThisWallet` (borrow) and `requireQuoteForThisWallet` (swap).

**3. EOA node-identity reconciliation (F089).** This is an SDK-side reconciliation gap adjacent to (but not) RPC-trust — integrators bring their own RPC, but the SDK can still verify the node it was handed serves the chain it is about to sign for:
- On first use of a chain's EOA wallet/public client, perform a one-time `eth_chainId` read and assert it equals `chainId` (cache the result), throwing a named `ChainMismatchError`; **or** stop pre-setting `chain` on the wallet client and let viem perform its own `eth_chainId` verification, mapping the resulting error to a named SDK error.
- This is explicitly **not** RPC-trust hardening: it is the one-time node-identity reconciliation the SDK already has the information to perform. Document that broader RPC content trust remains the integrator's assumption.

Note: F084's chainId reconciliation and the swap chain check are the **fail-closed** core of this ticket and need no product sign-off (a tampered/mismatched chain is unambiguously wrong). The F089 EOA `eth_chainId` round-trip adds one RPC call per chain on first use; default it on for server/API-key clients and allow opt-out, mirroring how the codebase gates other one-time self-tests.

## Affected files

- `packages/sdk/src/actions/swap/core/SwapProvider.ts:411-414` — verbatim `value: quote.execution.value`.
- `packages/sdk/src/actions/swap/core/SwapProvider.ts:434-451` — `executeFromQuote` / `validateSwapExecute` (value + chain validation seam for the pre-built path).
- `packages/sdk/src/actions/swap/namespaces/WalletSwapNamespace.ts:69-101,142-153` — `execute` dispatch chain (`params.chainId`) and `requireQuoteForThisWallet`.
- `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:207-237` — `validateQuoteForThisWallet` + `dispatch` (`quote.marketId.chainId`).
- `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:33-73` — `walletClient` / `send` chain pinning (F089 `eth_chainId` reconciliation).

## Acceptance criteria / tests

- A pre-built swap quote whose `execution.value` is non-zero on an **ERC20-in** swap is **rejected** (named error), not dispatched.
- A pre-built native-in swap quote whose `execution.value` does **not** match the SDK-derived expected native input (outside the quote's own slippage band) is **rejected**, not dispatched.
- A pre-built borrow quote with a tampered `quote.marketId.chainId` (pointing at another supported chain whose allowlist also matches) is **rejected** at the dispatch seam, not silently re-targeted; equivalent test for the swap pre-built path against `quote.chainId`.
- A pre-built quote whose chainId matches the wallet's intended chain dispatches unchanged (no false positives).
- `EOAWallet`: a configured chainId whose connected RPC node reports a **different** `eth_chainId` surfaces a named `ChainMismatchError` (one-time, cached) rather than silently signing an EIP-155 tx for chain A and broadcasting to chain B's node.
- Tests encode **why** (Rule 9): the assertion under test is "the native value and chain we sign + broadcast are the value and chain bound into the reviewed quote, and the node behind the transport is actually that chain" — a test that cannot fail when value/chain reconciliation is removed is insufficient.

## Notes

- **Augments #373**, which today is framed around calldata integrity for `SwapProvider` quote execution. The value-vs-amountIn and chain-intent reconciliation here are the same trust boundary (verbatim pre-built quote fields) seen from the value and chain angles; fold this color into #373 and treat it as important during that implementation.
- **Blocked by `prebuilt-quote-calldata-integrity`** (F070): that ticket builds the "re-derive the expected quote for this wallet on this chain" seam; the value and chain assertions here attach to it. Landing this first would duplicate the seam.
- **Scope boundaries honored:** these are missing-obvious-validation / fail-closed-where-the-SDK-already-knows / sibling-consistency (swap vs borrow) fixes. The F089 `eth_chainId` reconciliation is an SDK-side node-identity check, **not** RPC-content-trust hardening — integrators bringing their own RPC remains a documented assumption. No broad refuse-to-sign and no intent-guessing: every check compares a quote field against a value the SDK can independently derive.
- **On-chain verification of this cluster is owned by the consolidated Anvil feature-test ticket** (real Privy/Turnkey/Dynamic creds + Anvil-simulated signing); the borrow dispatch path in particular has no on-chain coverage today (F203), so the unit-level rejection tests above are the catchable surface until that lands.
