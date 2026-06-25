# Single consolidated end-to-end Anvil feature-test (real creds + simulated signing)

> **AUGMENT existing issue #335 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | high |
| **Complexity** | 5 / 5 |
| **Domain** | testing |
| **Surface** | single OP-fork feature-test driving swap / lend / borrow / wallet-core / wallet-hosted signing |
| **Resolves findings** | F188, F200, F210, F223, F230, F241, F254, F203, F209, F217, F233, F177, F178, F179, F191, F196, F197, F198, F199, F201, F206, F248 |
| **Candidate existing issue** | #335 |
| **Blocked by** | `network-fork-test-harness-consolidation`, `calldata-encoder-differential-oracles`, `validator-and-receipt-unit-coverage`, `hosted-wallet-signer-test-coverage` |

## Problem

Every fund-moving primitive in the SDK ships today with a test suite that **cannot fail when the underlying fund-loss or malicious-sign mechanic is present**. The suites assert the encoder against itself (`tx.data === quote.swapCalldata`, `decodeFunctionData(blueAbi, …)` against the same `blueAbi` that encoded it), use directional non-assertions (`amountOut > 0`, `toBeGreaterThan(0)`, `{ success: true }` returned by a mock), and never broadcast a signed transaction against real bytecode. Two fork tests exist repo-wide and both are read/quote-only; lend has no fork test at all; the entire 4337 signing path and every hosted-wallet signing path are self-mocked.

The fund-safety consequence: the whole cluster of already-ledgered logic bugs is **structurally un-falsifiable** by the current suite. A wrong swap recipient (V4 `TAKE_ALL` / universal sentinel), a residual infinite Permit2 allowance after a reverted batch, a stale quote that should reject but signs, a smart-wallet op signed against a stale owner set after rotation, a hosted wallet whose reported `.address` is not the key it actually signs with — every one of these passes green today. A green CI on this surface currently means "the encoder is self-consistent," not "the funds land at the right address in the right amount." This ticket is the single consolidated feature-test that makes those mechanics observable: real signed transactions, broadcast on an OP fork, with exact-amount recipient-balance deltas and the three adversarial bodies (recipient-in-bytes, residual-allowance, quote-aging) as required test code.

This stays one umbrella issue by design, but implementation now splits into small issue/PR slices under that umbrella. The seven `CONSOLIDATED E2E SPEC` rows (F188 swap, F200 lend, F210 borrow, F223 wallet-core, F230 wallet-hosted, F241 wallet-smart, F254 core-services) are the per-surface slices of one harness, not a reason to land one giant PR.

## Findings

Each finding's locus is a **test file / spec / harness defect**, distinct from the logic bug it relates to (the logic fixes are owned by their own tickets; this ticket makes the logic fixes verifiable).

**Swap slice**
- **F188** (medium, info) — `packages/sdk/src/actions/swap/providers/velodrome/__tests__/VelodromeSwapProvider.network.test.ts:1-293`: consolidated e2e spec (swap portion) — every router/direction (V4 exact-in/out, Velodrome v2/universal/leaf/CL, ERC20-in/native-in/native-out) must broadcast on a fork with exact-amount recipient-balance assertions recomputed independently of `quote.amountOut`.
- **F177** (high, correctness) — `…/VelodromeSwapProvider.network.test.ts:262-291`: the only on-chain `execute` fork test asserts the encoder against itself (`tx.data === quote.swapCalldata`) and never broadcasts; no swap test proves output lands at the recipient (F046/F003/F047 un-falsifiable).
- **F178** (medium, correctness) — `…/VelodromeSwapProvider.network.test.ts:107-260`: fork tests run only the two safe OP/Base `v2` paths; the two buggy router paths (universal recipient-ignored sentinel, V4 no-native-branch) have zero on-chain coverage.
- **F179** (medium, correctness) — `…/VelodromeSwapProvider.network.test.ts:131-167,224-259`: fork quote assertions are directional (`amountOut/price/min > 0`) with no exact-amount oracle recomputed independently of `quote.amountOut`; a wrong-pool / wrong-decimals / stale-price quote passes.

**Lend slice**
- **F200** (low, info) — `docs/reviews/review-pass-09.md` (e2e-spec deliverable): consolidated e2e spec (lend slice) — real-signed Morpho+Aave supply/withdraw on an OP fork, exact-amount decode with an independent ABI, roundtrip, APY-parity, recipient-in-bytes / residual-allowance / divergent-harness cases.
- **F191** (medium, info) — `packages/sdk/src/actions/lend/providers/aave/__tests__/AaveLendProvider.test.ts:1-20,56-62`: the entire lend surface is mocked; no fork/network test exists for either Aave or Morpho lend (open or close), so no real on-chain lend behavior is ever exercised.
- **F196** (low, correctness) — `packages/sdk/src/actions/lend/providers/morpho/__tests__/MorphoLendProvider.test.ts:57-138`: no deposit→withdraw roundtrip invariant (open then close); open and close are tested in isolation against independent mocks, so the canonical vault invariant is unexpressed.
- **F197** (low, correctness) — `packages/sdk/src/actions/lend/providers/aave/sdk.ts:253-264`: `getATokenAddress`'s index-8 tuple destructure of `getReserveData` has no test pinning the index against the real Aave Pool struct (the aToken is the close-approval spender + position contract).
- **F198** (low, malicious-sign) — `packages/sdk/src/actions/lend/core/LendProvider.ts:84-118`; `morpho/MorphoLendProvider.ts:48-84`: no residual-allowance / `approvalMode='max'` adversarial test verifies the leftover allowance's spender is the correct vault/pool (a wrong spender is a fund-drain primitive).
- **F199** (low, correctness) — `packages/sdk/src/actions/lend/providers/morpho/sdk.ts:341-394`: `getVault`'s SDK→on-chain fallback is never tested in the divergent direction; no test asserts SDK-path and forced-fallback produce the same market shape (two-divergent-harness parity).
- **F201** (medium, correctness) — `packages/sdk/src/actions/lend/providers/aave/__tests__/AaveLendProvider.test.ts:150-151,239-240`: the Aave `getPosition` share/balance path (shares===balance 1:1, decimals-formatted) has no exact-balance test; combined with the APY/share-price gap it is fixture-bound only.

**Borrow slice**
- **F210** (medium, malicious-sign) — `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:207-247`: borrow must exercise recipient-in-bytes (`onBehalf`/`receiver`=attacker while `quote.recipient` is spoofed), residual `maxUint256` allowance, and quote-aging via Anvil time-travel on a real fork. `validateQuoteForThisWallet` (`:207-223`) compares `quote.recipient` metadata only and never decodes the recipient out of the calldata.
- **F203** (medium, malicious-sign) — `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:232-247`: the borrow signing/dispatch path has zero on-chain coverage; no test signs+broadcasts a borrow bundle, so the verbatim-calldata cluster is structurally uncatchable.
- **F206** (medium, correctness) — `packages/sdk/src/actions/borrow/providers/morpho/__tests__/MorphoBorrowProvider.network.test.ts:181-220`: the Morpho fork test uses non-assertions (`toBeGreaterThan(0)`, zeros-on-a-fresh-wallet, length+`functionName` only) and never funds/signs/broadcasts; "open emits a borrow" is proven only at ABI-selector level.
- **F209** (medium, correctness) — `packages/sdk/src/actions/borrow/providers/aave/__tests__/AaveBorrowProvider.write.spec.ts:102-149`: Aave write tests assert `positionAfter` against hand-coded mock oracle prices (projection verified against its own inputs); no Aave borrow fork test exists, so the projection + WETHGateway path is mock-only.
- **F248** (medium, correctness) — `packages/sdk/src/actions/borrow/providers/morpho/__tests__/MorphoBorrowProvider.network.test.ts:181-260` (core-services lens): the open bundle is never executed, is decoded with the same `blueAbi` it was encoded with, and never asserts the borrow leg's `amount === parseAssetAmount(borrowAmount)` nor `onBehalf/receiver === walletAddress` (F086).

**Wallet-core slice**
- **F223** (medium, info) — `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:261-294`: consolidated e2e spec (wallet-core) — drive real signed `send`/`sendBatch` through `EOAWallet` AND `DefaultSmartWallet` with exact-amount deltas and the recipient-in-bytes / residual-allowance / quote-aging cases.
- **F217** (medium, correctness) — `packages/sdk/src/actions/swap/providers/velodrome/__tests__/VelodromeSwapProvider.network.test.ts:108-167`: the only two network tests are read/quote-only with directional assertions and no independent oracle; there is zero network coverage of any wallet-core signing/dispatch path.

**Wallet-smart slice**
- **F241** (high, correctness) — `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:196-294,310-422,456-500`: smart-wallet leg — 4337 counterfactual deploy + execute + owner-rotation (sign-with-new-key, the only catch for F087) + attribution suffix on a real bundler/Anvil, with exact-amount and only-owner / wrong-ownerIndex / recipient-in-bytes / residual-allowance adversarial cases.
- **F233** (medium, correctness) — `packages/sdk/src/wallet/core/wallets/smart/default/__tests__/DefaultSmartWallet.spec.ts:27-36,128-263`: the entire 4337 signing/dispatch path is self-mocked (`toCoinbaseSmartAccount` + bundler + `findSignerIndexOnChain` stubbed); `send`/`sendBatch` assert the encoder against itself with no independent oracle and the mocked receipt is `{ success: true }` regardless.

**Wallet-hosted slice**
- **F230** (low, info) — `packages/sdk/src/wallet/node/wallets/hosted/privy/PrivyWallet.ts:22,36,48-50`: consolidated e2e spec (wallet-hosted slice) — real Privy/Turnkey/Dynamic creds + Anvil signing must assert `recoverMessageAddress === wallet.address === signer.address`, exact-amount on-chain, Permit2 `verifyTypedData`, and an adversarial wrong-address case. `PrivyWallet` reports `address = params.address` (caller input, `:24`) and never reconciles it with the key the `walletId` signs with; `grep -rE 'recoverAddress|recoverMessageAddress|verifyMessage|verifyTypedData' packages/sdk/src/wallet` returns **0 matches** today, so every hosted-wallet identity assertion is a tautology.

**Core-services synthesis**
- **F254** (low, infra) — `packages/sdk/src/utils/test.ts:1-438`: single OP-mainnet fork feature-test with real-cred signing, a signer self-test (recover==address before any signing), exact-amount oracles, ephemeral ports + chainId-validated readiness, and the three adversarial cases. The current harness (`startAnvilFork` at `:74-104`, `fundWallet` at `:286`) hand-picks fixed ports, hard-codes a single Unichain USDC whale, accepts any HTTP 200 as readiness, and swallows funding failures via `console.log`-and-continue.

## Root cause

Across every fund-moving surface the test suite verifies **self-consistency of the encoder**, never **on-chain effect**. Three structural reasons:

1. **No broadcast.** The two fork tests that exist (swap, borrow-Morpho) read/quote only or assert `tx.data === quote.swapCalldata`. Nothing signs and submits a transaction against real bytecode and reads the resulting balances, so any bug that lives in what the encoded bytes *do* (wrong recipient, wrong amount, dangling allowance, stale owner set) is invisible.
2. **The oracle is the SDK itself.** Assertions compare the SDK's output to the SDK's own quote (`quote.amountOut`) or decode the SDK's calldata with the same ABI that encoded it. A wrong-pool / wrong-decimals / wrong-`onBehalf` value round-trips cleanly because both sides of the assertion came from the same code path.
3. **The signing primitives are mocked.** The 4337 path mocks `toCoinbaseSmartAccount` + bundler + `findSignerIndexOnChain` and returns `{ success: true }` unconditionally; every hosted wallet mocks its vendor signing primitive and asserts `signer.address === <the address fed into the mock>`. No test ever recovers a signer from a real signature, so the reported-address-vs-actual-key class of bug (F029/F074, F031, F073) cannot be expressed. The shared harness (`test.ts`) compounds this: fixed ports, a chain-mismatched single whale, a permissive readiness probe, and a swallowed funding failure make a real e2e dead-on-arrival or false-green even if one were written.

The fix is not more mocks. It is **one** real OP-fork feature-test on a consolidated harness that broadcasts real-signed transactions and asserts exact-amount on-chain deltas against independently computed oracles.

## Recommended approach

Build **one** consolidated Anvil e2e program on the shared harness, but land it as small, dependency-ordered issue/PR slices. This is the consolidated end-to-end deliverable referenced throughout the ledger; the umbrella stays on issue #335, while the implementation tickets below keep each PR concise. All work is in test/harness code plus SDK test utilities; no production-path refactor is required by this ticket. The demo and CLI are out of scope here (this ticket is SDK testing only).

Before starting any follow-up Anvil e2e slice, read the current wave handoff in [`anvil-e2e-wave-findings.md`](./anvil-e2e-wave-findings.md). Keep that file updated after each review/fix cycle so future provider and wallet tickets inherit the same implementation and review guidance.

## Split phase plan

This phase overlay supersedes the earlier dependency-gated capstone shape. The first Anvil wave should exercise standard SDK usage and catch real bugs as normal user flows fail. Bug-specific and adversarial cases move to a later phase; test-improvement-only tickets are not blockers for this e2e work.

### Phase 1 - existing work continues

In-flight bug-fix PRs stay in Phase 1 and can continue independently. They are no longer blockers for starting standard-usage Anvil e2e, except where a test genuinely cannot run without infrastructure.

| ID | Title |
| --- | --- |
| P1-D1 | Shared fork harness |

### Phase 2 - standard e2e foundation

| ID | Title |
| --- | --- |
| P2-E0 | Anvil e2e helpers |
| P2-W1 | EOA wallet standard e2e |
| P2-P1 | Uniswap swap standard e2e |

### Phase 3 - remaining standard e2e

| ID | Title |
| --- | --- |
| P3-I1 | 4337 local lane |
| P3-W2 | Hosted wallets standard e2e |
| P3-W3 | Smart wallet standard e2e |
| P3-P2 | Velodrome swap standard e2e |
| P3-P3L | Aave lend standard e2e |
| P3-P4L | Morpho lend standard e2e |
| P3-P3B | Aave borrow standard e2e |
| P3-P4B | Morpho borrow standard e2e |

### Later bug-focused phases

These are real bug-fix or bug-regression tracks, not prerequisites for standard-usage Anvil e2e.

| ID | Title |
| --- | --- |
| P4-B1 | Reverted receipt bug |
| P4-B2 | EOA batch-revert bug |
| P4-B3 | Hosted signer-mismatch bug |
| P4-B4 | Swap recipient-encoding bug |
| P4-B5 | Recipient symmetry bug |
| P4-B6 | Slippage bounds bug |
| P4-B7 | Lend asset-validation bug |
| P4-B8 | Market binding bug |
| P4-B9 | Owner reconcile bug |
| P4-X1 | Bug-specific adversarial e2e |

**Hard prerequisites (status and blockers):**

1. **`network-fork-test-harness-consolidation`** is done via upstream PR #518. This is the true prerequisite for all Anvil e2e work.
2. **4337 local lane** is required only for the smart-wallet standard e2e slice. It should not block EOA, hosted-wallet, swap, lend, or borrow e2e.

**The consolidated feature-test (OP-mainnet fork only, USDC-as-input via a per-chain pinned whale):**

- **Real-cred signing + signer self-test.** Construct an `EOAWallet` and each hosted wallet (Privy/Turnkey/Dynamic) from real credentials, and assert `recoverMessageAddress(signer.signMessage({ message })) === wallet.address === signer.address` **before** any action signs (closes the `refines:F074` reconciliation seam; the Privy address-from-caller vs Turnkey/Dynamic address-from-signer divergence means the per-provider harnesses must differ, per #348). Add the adversarial wrong-address case: construct Privy with the correct `walletId` but a deliberately wrong `address` and assert construction rejects or `recoverMessageAddress(sig) !== wrong-address`.
- **Swap (every router/direction).** Impersonate a USDC whale, `anvil_setBalance` the signer, broadcast approval+swap for each shipping router variant, and assert the **recipient's** `assetOut` balance delta equals an **independently** recomputed expected output (pool reserves / `getAmountsOut` at a pinned fork block), not `quote.amountOut`, and `>= amountOutMin`; assert the wallet's `assetIn` decreased by exactly `amountInRaw`.
- **Lend (Morpho + Aave supply/withdraw roundtrip).** Execute open (supply) then close (withdraw) against a real Morpho vault and a real Aave reserve; assert the aToken/share balance moves by the exact expected amount and the underlying returns to within 1 wei of start; call `getATokenAddress` against the real reserve and assert it equals the known aToken (pins the index-8 assumption); assert SDK-path and forced-fallback `getVault` produce the same market shape.
- **Borrow (open/close).** Execute open; assert the wallet's loan-token balance increased by exactly `borrowAmountRaw`, collateral decreased by `collateralAmountRaw`, the decoded borrow leg's `onBehalf/receiver === walletAddress` (F086), and `getPosition` returns a non-null health factor; then close.
- **Wallet-core send / sendBatch through EOA + DefaultSmartWallet.** Drive real signed `send`/`sendBatch` through both `EOAWallet` and `DefaultSmartWallet` with exact-amount recipient deltas. The smart-wallet leg additionally covers: counterfactual deploy (derive address from the real factory `getAddress`, fund it, `deploy()` via a real bundler, assert deployed code lives at exactly the pre-derived address); `executeBatch` with two calls asserting both inner effects atomically; and one full owner-rotation — `addSigner(newEOA)` → reload owners via `findSignerIndexOnChain` → **sign a subsequent op with the new signer** (the only construction that catches F087's stale in-memory owner set) → `removeSigner(oldEOA)` and assert the removed key can no longer sign. The owner-rotation case is load-bearing.
- **Permit2 / EIP-712 signature recovery.** Sign a real Permit2 `PermitTransferFrom` typed-data struct through each hosted provider's `signTypedData` and assert `verifyTypedData({ address: signer.address, … })` is true (validates the F073 CustomSource cast and the Dynamic raw-digest closure). Permit2 signature payloads are in signing-path scope.

**Later bug-focused test bodies (not blockers for the standard-usage wave):**

- **(a) recipient-in-bytes** — use a distinct third recipient and decode the **signed** swap/borrow calldata, asserting the encoded recipient equals the recipient passed to `getQuote` and that exact address received the output (catches the V4 `TAKE_ALL` / universal sentinel cluster, #444/F054, and borrow `onBehalf`/`receiver` spoofing).
- **(b) residual-allowance** — after a max-mode approval whose action leg reverts, assert no infinite (`maxUint256`) allowance is left dangling and that any standing allowance's spender is the correct vault/pool/router (catches F021/F042/F050/F053/F198); exact-mode leaves zero.
- **(c) quote-aging** — advance Anvil time past `expiresAt`/`deadline`, broadcast, assert the tx reverts **and** that `validateQuoteNotExpired` fired before signing (the only coverage of that validator).

**Capability-boundary note (smart-wallet leg):** the 4337 deploy/execute/owner-rotation path requires a local/sandbox ERC-4337 bundler + paymaster against the Anvil fork (open question 23 — a multi-day build). It is a distinct capability boundary *inside* this one ticket, not a separate ticket; gate it behind the bundler-sandbox prerequisite and keep it in the same consolidated spec.

There is no health-factor advisory-vs-fail-closed decision in this ticket; the borrow leg here only **asserts** that `getPosition().healthFactor` is non-null after open (the LTV/health-factor product decision is owned by the safe-ceiling-LTV ticket).

## Affected files

Test / harness / spec loci (the fix lands here, not in the related logic-bug source lines):

- `packages/sdk/src/utils/test.ts:1-438` — shared harness: `startAnvilFork:74-104` (ephemeral port + chainId readiness), `fundWallet:286` (throw-on-failure + per-chain whale map).
- `packages/sdk/src/actions/swap/providers/velodrome/__tests__/VelodromeSwapProvider.network.test.ts:107-291` — swap fork coverage (F177, F178, F179, F188, F217).
- `packages/sdk/src/actions/lend/providers/aave/__tests__/AaveLendProvider.test.ts:1-20,56-62,150-151,239-240` — lend Aave (F191, F201).
- `packages/sdk/src/actions/lend/providers/morpho/__tests__/MorphoLendProvider.test.ts:57-138` — lend roundtrip (F196).
- `packages/sdk/src/actions/lend/providers/aave/sdk.ts:253-264` — aToken index-8 pin (F197).
- `packages/sdk/src/actions/lend/core/LendProvider.ts:84-118`; `packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts:48-84` — residual-allowance spender (F198).
- `packages/sdk/src/actions/lend/providers/morpho/sdk.ts:341-394` — getVault fallback parity (F199).
- `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:207-247` — borrow dispatch guards (F203, F210).
- `packages/sdk/src/actions/borrow/providers/morpho/__tests__/MorphoBorrowProvider.network.test.ts:181-260` — borrow Morpho fork (F206, F248).
- `packages/sdk/src/actions/borrow/providers/aave/__tests__/AaveBorrowProvider.write.spec.ts:102-149` — borrow Aave projection (F209).
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:196-294,310-422,456-500` and `…/__tests__/DefaultSmartWallet.spec.ts:27-36,128-263` — wallet-core + smart-wallet (F223, F233, F241).
- `packages/sdk/src/wallet/node/wallets/hosted/privy/PrivyWallet.ts:22,36,48-50` — hosted signer identity (F230).

## Acceptance criteria / tests

- Standard-usage Anvil e2e helpers exist for a funded wallet, ActionsConfig construction, token balance snapshots, receipt waits, and provider scenario setup.
- Standard wallet e2e covers creating/funding an EOA wallet and executing ordinary `send` / `sendBatch` success paths with exact recipient deltas.
- Standard swap e2e covers ordinary Uniswap and Velodrome swap flows through the public SDK API, asserting wallet input and output deltas from chain state.
- Standard lend e2e covers ordinary Aave and Morpho supply/withdraw flows through the public SDK API, asserting position and balance changes from chain state.
- Standard borrow e2e covers ordinary Aave and Morpho open/close flows through the public SDK API, asserting position and balance changes from chain state.
- Hosted-wallet e2e covers ordinary provider construction and signing flows when the required test credentials are present; missing credentials should make only that lane unavailable.
- Smart-wallet e2e is gated only on the 4337 local lane; it should not block EOA, hosted-wallet, swap, lend, or borrow e2e.
- Bug-specific checks for wrong recipients, stale quotes, residual allowances, stale owner sets, and reverted receipts live in the later bug-focused phase rather than blocking the standard-usage e2e wave.

## Notes

- This is the **one** consolidated Anvil feature-test referenced across the ledger; the seven `CONSOLIDATED E2E SPEC` rows (F188/F200/F210/F223/F230/F241/F254) are its per-surface slices and explicitly recommend folding here rather than filing separate per-case tickets.
- This ticket makes the logic fixes **verifiable**; it does not own the logic fixes themselves. The fund-loss / malicious-sign mechanics are owned by their own tickets (swap recipient cluster F046/F047/F003/F004/F050, borrow verbatim-calldata F054/F082/F084/F086, smart-wallet F023/F039/F087, hosted-signer F029/F031/F073/F074). The relationship is intentionally explicit so the connection is traceable from either side.
- The smart-wallet leg's bundler+paymaster sandbox is a multi-day infra build (open question 23) and is the long pole; treat it as a capability boundary inside this ticket, not a reason to split.
- RPC trust is out of scope: integrators bring their own RPC (a documented assumption), so this test pins a fork block and validates `chainId`, but does not harden against a hostile RPC.
- Scope is SDK testing only. No demo/CLI work and no production-path refactor is requested by this ticket beyond the shared `test.ts` harness utilities.
