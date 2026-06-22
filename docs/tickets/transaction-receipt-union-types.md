# Tag wallet receipt/return-type unions and fix lying JSDoc/return contracts

>  AUGMENT existing issue #337 - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.

| Field | Value |
| --- | --- |
| Severity | medium |
| **Complexity** | 3 / 5 |
| Domain | wallet |
| Surface | `TransactionReturnType`/`BatchTransactionReturnType` (abstract/types), `extractReceiptHashes`, `Wallet.send`/`sendBatch` JSDoc, `ChainManager.getBundlerUrl`, `LendProviderMethods._closePosition`, `BorrowReceipt.positionAfter` |
| Resolves findings | F132, F134, F133, F221, F271, F123, F131 |
| Candidate existing issue | #337 |
| Blocked by | (none) |

Issue #337 already owns the receipt-envelope / type-precision cluster (it is the candidate issue on F132 and F127, and the any-typed reward ingestion). This ticket is the type-and-contract honesty layer of that work: the wallet receipt unions are untagged so every consumer shape-sniffs at runtime, and four nearby return-type contracts (two JSDoc, one exported interface, one optional field) describe a shape the code does not deliver. Fold this into #337 and treat the tagged-union work as load-bearing, because the receipt-status fail-closed ticket (`receipt-status-as-success.md`, #474) and the demo backend URL builder both consume these same unions.

## Problem

Every action the SDK signs (lend, swap, borrow) ends at `Wallet.send`/`sendBatch`, whose return type is an **untagged union** of an EOA viem receipt, an array of EOA receipts, and a 4337 UserOp receipt. There is no discriminant, so the one helper that turns a receipt into the user-facing identifier hash (`extractReceiptHashes`) decides which branch it is in by structural sniffing: `Array.isArray(receipt)`, then `'userOpHash' in receipt`. `EOATransactionReceipt` (a viem `TransactionReceipt`) and `UserOperationTransactionReceipt` share many fields, so the branch selection is a structural coincidence, not a typed guarantee.

The fund-safety framing is the hash the user is handed back to look up their transaction:

- If a future viem field rename (or a malformed receipt) shifts which branch `'userOpHash' in receipt` selects, `extractReceiptHashes` mis-attributes the identifier and the action receipt reports the wrong hash kind on a real, fund-moving transaction.
- `extractReceiptHashes` over an empty EOA batch returns `{ transactionHashes: [] }`, and over a receipt with an undefined `transactionHash` returns `{ transactionHashes: [undefined] }`, with no error and no signal. That `[undefined]` flows up into the action receipt envelope and then into the demo backend block-explorer URL builder, which interpolates it into `/tx/${hash}` and returns a broken link while the action reports success. The user is told "done" with a hash they cannot resolve on chain.

Around those unions sit three more contracts that lie about their own shape. A consumer who trusts the published type (the whole point of an exported type) is misled:

- The abstract `Wallet.send`/`sendBatch` JSDoc (and the SmartWallet sibling) say they resolve to "the transaction hash", but every implementation returns a full receipt object/array.
- `ChainManager.getBundlerUrl` is typed `string | undefined` and its JSDoc says it returns undefined "if not configured", but the body throws on the unconfigured case and otherwise returns a non-empty string. It can never return undefined, so a downstream `if (!bundlerUrl) throw` guard is unreachable dead code, and a future refactor trusting the "soft undefined" contract would mis-handle the throwing one.
- The exported `LendProviderMethods._closePosition` interface declares `Promise<TransactionData>`, but the abstract base and both providers return `Promise<LendTransaction>` (a richer envelope where the calldata is nested under `.transactionData`). A consumer typing against the interface reads the wrong shape.
- `BorrowReceipt.positionAfter` is typed optional, but dispatch always populates it, forcing every consumer to branch on an `undefined` that never occurs while papering over the fact that the value is a quote-time projection, not a post-execution read.

None of these is an active fund loss today (the single live `extractReceiptHashes` caller always passes a non-empty receipt). They are the obvious type/contract honesty fixes that stop downstream consumers from guessing, and they remove the silent-`[undefined]`-hash path before a future caller hits it.

## Findings

- **F132** (`packages/sdk/src/wallet/core/wallets/abstract/types/index.ts:30-42`): `TransactionReturnType` and `BatchTransactionReturnType` are untagged unions with no discriminant, so consumers cannot statically narrow EOA-vs-4337 and must shape-sniff (`Array.isArray`, then `'userOpHash' in receipt`). API-design root of the receipt-envelope cluster; medium.
- **F134** (`packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts:176-198`, sibling `packages/sdk/src/wallet/core/wallets/smart/abstract/SmartWallet.ts:21` and `.../smart/default/DefaultSmartWallet.ts:215`): the abstract `send`/`sendBatch` JSDoc says "@returns Promise resolving to the transaction hash", but the implementations return `EOATransactionReceipt` / `EOATransactionReceipt[]` / `WaitForUserOperationReceiptReturnType`.
- **F133** (`packages/sdk/src/wallet/core/utils/extractReceiptHashes.ts:24-30`): an empty EOA batch maps to `{ transactionHashes: [] }` with no "no hash produced" signal, and a receipt with `undefined` `transactionHash` surfaces `[undefined]`, an unusable identifier, with no validation.
- **F221** (`packages/sdk/src/wallet/core/utils/extractReceiptHashes.ts:24-30`): the F133 degenerate outputs have no test; a regression producing `transactionHashes: [undefined]` ships green, and on a fund-moving action the user is told "success" with an unlookupable hash.
- **F271** (`packages/sdk/src/services/ChainManager.ts:146-155` and `:109-115`): `getBundlerUrl` is typed `string | undefined` with JSDoc claiming it returns undefined "if not configured", but the body throws `ChainNotSupportedError` on the unconfigured case and otherwise returns a non-empty `chainConfig.bundler.url`, so it can never return undefined and the downstream `if (!bundlerUrl) throw` guard in `getBundlerClient` is dead code.
- **F123** (`packages/sdk/src/types/lend/base.ts:373`): the exported `LendProviderMethods._closePosition` interface declares `Promise<TransactionData>` while the abstract base (`packages/sdk/src/actions/lend/core/LendProvider.ts:353-355`) and both providers return `Promise<LendTransaction>`; the published type lies about the close-path shape.
- **F131** (`packages/sdk/src/types/borrow/quote.ts:112-113`): `BorrowReceipt.positionAfter` is typed optional, but `WalletBorrowNamespace.dispatch` (`packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:244`) unconditionally sets it from `quote.positionAfter`, advertising a weaker (and post-state-claiming) contract than delivered.

## Root cause

The wallet send boundary returns three structurally-overlapping receipt shapes through one union with no tag, so the SDK already knows which shape it produced (the EOA vs smart implementation is a compile-time fact at the call site) but throws that knowledge away at the type boundary and re-derives it by sniffing. Every downstream consumer (`extractReceiptHashes`, `LendTransactionReceipt`, the backend URL builder) then either guesses or trusts a JSDoc/type that drifted from the implementation. The four contract-lie findings are the same root in miniature: a documented or declared shape that nobody re-checked against the code it describes.

## Recommended approach

Tag the unions and make the contracts tell the truth. No behavior change beyond rejecting the genuinely-degenerate inputs; this is type-and-contract honesty plus one fail-closed validation on data the SDK already holds.

1. **Tag the receipt unions (F132).** Introduce an explicit discriminant at the wallet `send`/`sendBatch` boundary so EOA-vs-batch-vs-userOp narrows statically (for example `{ kind: 'eoa' | 'eoaBatch' | 'userOp'; receipt }`), or expose `extractReceiptHashes` as the single sanctioned typed accessor and have it switch on the discriminant rather than on `Array.isArray` / `'userOpHash' in receipt`. Add a type-level test (`expectTypeOf`) pinning the union members so a future viem field rename or a dropped branch fails CI. This is the structural fix `LendTransactionReceipt` (`packages/sdk/src/types/lend/base.ts:93-95`, the bare union re-export) and the borrow/swap dispatch envelopes all sit on.
2. **Fix `extractReceiptHashes` degenerate outputs (F133/F221).** Reject an empty array explicitly (mirror `executeTransactionBatch`'s existing empty-list throw at `executeTransactionBatch.ts:30-32`) and validate each `transactionHash` is present/hex before emitting it, so `[undefined]` can never reach an action receipt or the backend URL builder. Add the unit tests F221 calls for: empty-batch input and malformed-receipt input asserting the chosen contract (throw vs documented empty).
3. **Correct the lying JSDoc/return contracts (F134, F271, F123, F131), each a one-line surgical fix:**
   - F134: rewrite the abstract `Wallet.send`/`sendBatch` and `SmartWallet` JSDoc to describe the actual receipt union (single receipt for EOA, per-tx array for EOA batch, single UserOp receipt for smart), matching the declared type.
   - F271: pick one contract. Either change `getBundlerUrl` to actually return `chainConfig.bundler?.url` (`string | undefined`) and let callers decide (keeping the JSDoc honest and the existing guard live), or keep the throw and fix the JSDoc/return type to `string`, then delete the now-dead `if (!bundlerUrl) throw` guard in `getBundlerClient`. Prefer the throw-and-clean option since every other missing-config path in `ChainManager` throws.
   - F123: change `LendProviderMethods._closePosition` to `Promise<LendTransaction>` (or delete the unused interface if the abstract class is the single source of truth), and add an `expectTypeOf` binding the interface to the abstract method so future drift fails CI.
   - F131: make `positionAfter` required (dispatch always sets it) and document/rename it as the quote-time projection (it is not a post-execution on-chain read); the deeper "is this realized state" question stays with F054.

Demo/backend boundary (F301, `packages/demo/backend/src/utils/explorers.ts:19-53`) is **review-only, no refactor**: `getTransactionUrl`/`getUserOperationUrl` interpolate the raw hash into `/tx/${hash}` with no `/^0x[0-9a-fA-F]{64}$/` shape check. The hashes are server-sourced and display-only (no injection, no fund impact), so this stays a low-risk note, not a backend refactor. Once the SDK fix in step 2 stops emitting `[undefined]`, the realistic source of a malformed hash reaching this helper is gone; if the backend wants belt-and-suspenders it can add a shape check, but that is its own low-risk follow-up.

Out of scope (per scope rules): no RPC-trust hardening (the receipt is taken at face value; integrators bring their own RPC), no intent-guessing, no broad refuse-to-sign. This is the obvious tagging-and-contract-honesty work on shapes the SDK already produces.

## Affected files

- `packages/sdk/src/wallet/core/wallets/abstract/types/index.ts:30-42` (F132 — tag `TransactionReturnType`/`BatchTransactionReturnType`)
- `packages/sdk/src/wallet/core/utils/extractReceiptHashes.ts:24-30` (F133/F221 — switch on discriminant, reject empty/malformed)
- `packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts:176-198` (F134 — JSDoc)
- `packages/sdk/src/wallet/core/wallets/smart/abstract/SmartWallet.ts:21` and `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:215` (F134 — sibling JSDoc)
- `packages/sdk/src/services/ChainManager.ts:146-155` and `:109-115` (F271 — `getBundlerUrl` return/JSDoc + dead guard in `getBundlerClient`)
- `packages/sdk/src/types/lend/base.ts:373` (F123 — `LendProviderMethods._closePosition` return type)
- `packages/sdk/src/types/lend/base.ts:93-95` (F132 — `LendTransactionReceipt` bare-union re-export rides on the tagged unions)
- `packages/sdk/src/actions/lend/core/LendProvider.ts:353-355` (F123 — abstract `_closePosition` is the correct `Promise<LendTransaction>` source of truth)
- `packages/sdk/src/types/borrow/quote.ts:112-113` (F131 — `BorrowReceipt.positionAfter` optionality)
- `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:244` (F131 — dispatch that always populates `positionAfter`)
- `packages/demo/backend/src/utils/explorers.ts:19-53` (F301 — review-only, no refactor; downstream consumer of `[undefined]`)

Test files to add/extend:

- `packages/sdk/src/wallet/core/utils/__tests__/extractReceiptHashes.spec.ts` (F221 — empty-batch and malformed-receipt inputs)
- a type-level test pinning the tagged union members (F132 — `expectTypeOf`)
- a type-level binding of `LendProviderMethods._closePosition` to the abstract method (F123)

## Acceptance criteria / tests

- `TransactionReturnType`/`BatchTransactionReturnType` carry a discriminant such that a consumer narrows EOA-single vs EOA-batch vs UserOp without `Array.isArray` or `'userOpHash' in receipt`; a type-level test fails if a union member is added or dropped.
- `extractReceiptHashes` over an empty array throws (or returns the documented contract) rather than `{ transactionHashes: [] }`, and over a receipt with `undefined`/non-hex `transactionHash` it throws or omits the value rather than emitting `[undefined]`. Unit tests assert both.
- The abstract `Wallet.send`/`sendBatch` and `SmartWallet` JSDoc describe the receipt union, not "the transaction hash".
- `getBundlerUrl`'s declared return type, JSDoc, and body agree: either it genuinely returns `string | undefined` (and the `getBundlerClient` guard is live), or it returns `string` / throws (and the dead guard is removed). No path can both throw and be typed undefined-returning.
- `LendProviderMethods._closePosition` resolves to `LendTransaction`, and a type-level test binds it to the abstract `LendProvider._closePosition` so drift fails CI.
- `BorrowReceipt.positionAfter` is required (matching dispatch) and documented as the quote-time projection; no consumer branches on an `undefined` dispatch never produces.
- Existing wallet/lend/borrow tests still pass (no runtime behavior change beyond the `extractReceiptHashes` rejection).

## Notes

- This is the type-honesty companion to `receipt-status-as-success.md` (#474), which fails closed on reverted-but-mined receipts. That ticket makes the receipt *trustworthy*; this one makes its *shape* statically knowable. They touch overlapping files (`abstract/types/index.ts`, the dispatch envelopes) and should be sequenced together under the #337/#474 work to avoid churn.
- F133/F221 are latent today: the sole live `extractReceiptHashes` caller (`WalletBorrowNamespace.ts:245`) always passes a non-empty dispatch result because `executeTransactionBatch` rejects empty input. The fix is pre-emptive hardening of an exported-by-path helper plus the test that pins the contract, not a live-bug patch.
- F301 (backend explorer URL builder) is recorded here only as the downstream consumer of the `[undefined]` hash. It is review-only and does not need a backend change once the SDK stops producing `[undefined]`; any backend shape check is a separate low-risk follow-up.
- The borrow `positionAfter` realized-vs-projected semantics (F054) are out of scope here; F131 only sharpens the exported-type precision (required vs optional, and naming it a projection). The decision to gate population on a post-exec on-chain read belongs with the F054 line of work.
