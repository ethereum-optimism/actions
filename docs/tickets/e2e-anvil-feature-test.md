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

This is **one** ticket by design. Each per-surface finding below recommends folding into this single Anvil feature-test rather than filing separate per-case e2e tickets; the seven `CONSOLIDATED E2E SPEC` rows (F188 swap, F200 lend, F210 borrow, F223 wallet-core, F230 wallet-hosted, F241 wallet-smart, F254 core-services) are the per-surface slices of this one harness.

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

Build **one** consolidated Anvil feature-test on the shared harness — do not split into per-case e2e tickets. This is the consolidated end-to-end deliverable referenced throughout the ledger; it lands later, on top of the four blocking prerequisites below. All work is in test/harness code plus the SDK test utilities (`packages/sdk/src/utils/test.ts`); no production-path refactor is required by this ticket. The demo and CLI are out of scope here (this ticket is SDK testing only).

**Prerequisites (blockers — must land first):**

1. **`network-fork-test-harness-consolidation`** — `startAnvilFork` allocates an ephemeral OS-assigned port and returns the bound port (no fixed-port registry, no 18545/18547 collisions); the readiness probe validates the JSON-RPC `eth_chainId` equals the expected fork chain (not any HTTP 200); `fundWallet` **throws** on a requested-but-failed transfer (no `console.log`-and-continue) and looks the USDC address + whale up **per-chain** (not the single Unichain whale); the two divergent inline `createForkChainManager` stubs are unified into one. This is the PR #348 harness-fix set.
2. **`calldata-encoder-differential-oracles`** — interim, no-bundler unit decode of the produced swap / `executeBatch` / borrow-bundle calldata using the **real** independent ABI (`coinbaseSmartWalletAbi`, `blueAbi`, router ABI) as an oracle, asserting the inner `(to, value, data)` / recipient / amount / `onBehalf` tuples. Anchors the encode step before the multi-day bundler work and gives the e2e its independent oracles (F242/F248).
3. **`validator-and-receipt-unit-coverage`** — direct unit tests for `validateSlippage` (NaN / >1), `validateRecipient`, `validateNotZeroAddress`, `validateQuoteNotExpired`, and the receipt success-gate, which currently have zero direct coverage; the e2e asserts these fire **before** signing.
4. **`hosted-wallet-signer-test-coverage`** — the un-mocked unit seam: a shared construction-time signer self-test (`recoverMessageAddress(signer.signMessage(probe)) === wallet.address`) wired with a known local key, plus the Dynamic `createSigner` raw-digest closure recovery and the Privy/Turnkey `signTypedData` CustomSource cast recovery. The full real-credential recovery lands in this e2e.

**The consolidated feature-test (OP-mainnet fork only, USDC-as-input via a per-chain pinned whale):**

- **Real-cred signing + signer self-test.** Construct an `EOAWallet` and each hosted wallet (Privy/Turnkey/Dynamic) from real credentials, and assert `recoverMessageAddress(signer.signMessage({ message })) === wallet.address === signer.address` **before** any action signs (closes the `refines:F074` reconciliation seam; the Privy address-from-caller vs Turnkey/Dynamic address-from-signer divergence means the per-provider harnesses must differ, per #348). Add the adversarial wrong-address case: construct Privy with the correct `walletId` but a deliberately wrong `address` and assert construction rejects or `recoverMessageAddress(sig) !== wrong-address`.
- **Swap (every router/direction).** Impersonate a USDC whale, `anvil_setBalance` the signer, broadcast approval+swap for each shipping router variant, and assert the **recipient's** `assetOut` balance delta equals an **independently** recomputed expected output (pool reserves / `getAmountsOut` at a pinned fork block), not `quote.amountOut`, and `>= amountOutMin`; assert the wallet's `assetIn` decreased by exactly `amountInRaw`.
- **Lend (Morpho + Aave supply/withdraw roundtrip).** Execute open (supply) then close (withdraw) against a real Morpho vault and a real Aave reserve; assert the aToken/share balance moves by the exact expected amount and the underlying returns to within 1 wei of start; call `getATokenAddress` against the real reserve and assert it equals the known aToken (pins the index-8 assumption); assert SDK-path and forced-fallback `getVault` produce the same market shape.
- **Borrow (open/close).** Execute open; assert the wallet's loan-token balance increased by exactly `borrowAmountRaw`, collateral decreased by `collateralAmountRaw`, the decoded borrow leg's `onBehalf/receiver === walletAddress` (F086), and `getPosition` returns a non-null health factor; then close.
- **Wallet-core send / sendBatch through EOA + DefaultSmartWallet.** Drive real signed `send`/`sendBatch` through both `EOAWallet` and `DefaultSmartWallet` with exact-amount recipient deltas. The smart-wallet leg additionally covers: counterfactual deploy (derive address from the real factory `getAddress`, fund it, `deploy()` via a real bundler, assert deployed code lives at exactly the pre-derived address); `executeBatch` with two calls asserting both inner effects atomically; and one full owner-rotation — `addSigner(newEOA)` → reload owners via `findSignerIndexOnChain` → **sign a subsequent op with the new signer** (the only construction that catches F087's stale in-memory owner set) → `removeSigner(oldEOA)` and assert the removed key can no longer sign. The owner-rotation case is load-bearing.
- **Permit2 / EIP-712 signature recovery.** Sign a real Permit2 `PermitTransferFrom` typed-data struct through each hosted provider's `signTypedData` and assert `verifyTypedData({ address: signer.address, … })` is true (validates the F073 CustomSource cast and the Dynamic raw-digest closure). Permit2 signature payloads are in signing-path scope.

**Required adversarial test bodies (these are the load-bearing constructions):**

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

- A single consolidated network/e2e test, OP-mainnet fork only, gated on real Privy/Turnkey/Dynamic credentials being present; CI **fails fast** (not silently skips) when the creds or RPC are missing.
- The four blockers have landed: ephemeral-port + chainId-validated harness, throw-on-funding-failure + per-chain whale map, calldata differential-oracle decoders, validator/receipt unit coverage, and the hosted-wallet signer self-test seam.
- Every on-chain assertion is **exact-amount** against an oracle computed **independently** of the SDK's own quote/encoder (pool `getAmountsOut`, real protocol ABIs); no assertion compares the SDK output to `quote.amountOut` or decodes with the same ABI used to encode.
- Swap: every shipping router variant executes once on-chain; recipient delta == independently-recomputed output and `>= amountOutMin`; wallet input == exactly `amountInRaw`.
- Lend: Morpho and Aave supply→withdraw roundtrip returns the underlying to within 1 wei of start; `getATokenAddress` == known aToken; `getVault` SDK-path == forced-fallback shape.
- Borrow: open credits loan-token by exactly `borrowAmountRaw`, debits collateral by `collateralAmountRaw`, decoded `onBehalf/receiver == walletAddress`, `getPosition().healthFactor` non-null; close executes.
- Wallet-core: real-signed `send`/`sendBatch` through both `EOAWallet` and `DefaultSmartWallet` with exact recipient deltas; smart-wallet counterfactual deploy lands code at the pre-derived address; `executeBatch` applies both inner effects atomically.
- Owner-rotation: after `addSigner`, an op **signed with the new signer** succeeds and the stale in-memory owner set is refreshed (test fails today, F087); only-owner `removeSigner` reverts/guards (F039); wrong-`ownerIndex` op is bundler-rejected (F023).
- Hosted signer-identity: for each provider `recoverMessageAddress(signer.signMessage(probe)) === wallet.address === signer.address`; the wrong-address Privy construction rejects or never reports the wrong address.
- Permit2/EIP-712: a real `PermitTransferFrom` struct signed through each provider passes `verifyTypedData`.
- The three adversarial bodies (recipient-in-bytes decode, residual `maxUint256` allowance + correct spender, quote-aging time-travel revert with validator-fired-before-signing) are present and asserting.

## Notes

- This is the **one** consolidated Anvil feature-test referenced across the ledger; the seven `CONSOLIDATED E2E SPEC` rows (F188/F200/F210/F223/F230/F241/F254) are its per-surface slices and explicitly recommend folding here rather than filing separate per-case tickets.
- This ticket makes the logic fixes **verifiable**; it does not own the logic fixes themselves. The fund-loss / malicious-sign mechanics are owned by their own tickets (swap recipient cluster F046/F047/F003/F004/F050, borrow verbatim-calldata F054/F082/F084/F086, smart-wallet F023/F039/F087, hosted-signer F029/F031/F073/F074). The relationship is intentionally explicit so the connection is traceable from either side.
- The smart-wallet leg's bundler+paymaster sandbox is a multi-day infra build (open question 23) and is the long pole; treat it as a capability boundary inside this ticket, not a reason to split.
- RPC trust is out of scope: integrators bring their own RPC (a documented assumption), so this test pins a fork block and validates `chainId`, but does not harden against a hostile RPC.
- Scope is SDK testing only. No demo/CLI work and no production-path refactor is requested by this ticket beyond the shared `test.ts` harness utilities.
