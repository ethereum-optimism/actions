# Review Pass 09 — Senior-QA + Testing-Coverage + e2e-Anvil Spec

**Pass:** 9
**Skill / lens:** senior-qa + ethskills:testing (DeFi-testing coverage lens) + consolidated e2e-Anvil feature-test spec. Each surface was reviewed for *test-coverage blind spots* (where does the suite assert the encoder against itself, where are assertions directional/non-load-bearing, where is the signing/dispatch path never executed on-chain) and for the *harness defects* that block a real e2e. Findings are coverage-framings of the already-ledgered F001–F176 logic bugs — each carries `relatesToPriorFinding` and is filed against the **test file / harness / spec** locus (a distinct fix from the logic bug). One consolidated e2e-Anvil spec finding per surface aggregates the deliverable.
**Surfaces:** swap, lend, borrow, wallet-core, wallet-hosted, wallet-smart, core-services

## Summary

This pass is the QA/testing companion to the logic-bug passes (1–6) and the dependency pass (8). It does not re-discover the fund-loss/malicious-sign mechanics already in the ledger; it documents that **the test suite cannot fail when those mechanics are present**, and it consolidates the single Anvil end-to-end feature-test spec that would close the gap. Five themes dominate:

1. **The signing/dispatch path of every surface is essentially un-executed on-chain.** The whole repo has exactly two `*.network.test.ts` files (Velodrome swap, Morpho borrow), both of which fork a chain and call only read/quote paths (`getQuote`/`getMarket`/`getPosition`). Nothing in the SDK ever funds a wallet, signs, broadcasts, and reads back a balance. The lend surface has **zero** fork tests of any kind. So `EOAWallet.send/sendBatch`, `DefaultSmartWallet.send/sendBatch`, `executeTransactionBatch`, and every namespace `dispatch` are asserted entirely against viem mocks — the F021/F034/F054/F082/F084 malicious-sign + fund-loss cluster is structurally uncatchable.

2. **Encoders are validated against themselves with no independent oracle.** `sdk.test.ts` (swap), `marketParams.spec.ts`/`marketId.test.ts` (borrow), the attribution-suffix assertions (`concatHex` on both sides, wallet-smart/core), the Aave `pool.test.ts` round-trip (encode and decode with the same local ABI), and the Morpho lend tests (`MetaMorphoAction` mocked to a literal hex) all assert the code under test against itself. A field-order, recipient-routing, or amount regression changes both sides identically and ships green.

3. **Directional non-assertions masquerade as coverage.** `toBeGreaterThan(0)` on amountOut/apy, `maxLtv in (0,1)` bands wide enough to hide unit-confusion, `toMatch(/^0x/)` on calldata, `apy > 0` on a fixture-derived number, zeros-on-a-fresh-wallet (trivially true for any address). None recompute an expected value independently of the quote, so a wrong-pool/wrong-decimals/wrong-recipient encoding passes by sign.

4. **The recipient-in-bytes / residual-allowance / quote-aging adversarial cases are tested at the metadata layer only.** Guards (`requireQuoteForThisWallet`, `validateQuoteForThisWallet`, the hosted signer-identity seam) compare `quote.recipient` / caller `.address` metadata, never decode the recipient out of `execution.swapCalldata`/transactions, and never recover a signer from a real signature. The validators carrying the heaviest prior findings (validateSlippage NaN/>1, validateRecipient, validateNotZeroAddress) have **zero** direct unit tests.

5. **The shared Anvil harness has its own blockers.** `startAnvilFork` takes hand-picked fixed ports (18545/18546/18547 — borrow and one swap fork both use 18547) with no collision guard; `fundWallet` hard-codes a single Unichain USDC address + whale and swallows transfer failures via `console.log`-and-continue (dead-on-arrival, false-green); the readiness probe accepts any HTTP 200; and the two network suites each redefine a divergent inline `createForkChainManager`. These must be fixed before the consolidated e2e (building on PR #348) can land.

**Incoming findings:** 80 across 7 surfaces.
**Outcome:** 80 NEW (F177–F256), 0 REFINES, 0 DUP. Every incoming finding is a coverage/harness/spec locus distinct from the logic-bug rows it relates to (the fix lands in a test file, the harness, or the e2e spec — not in the same source line as the bug). Each carries `relatesToPriorFinding` to the underlying ledger entry so the connection is explicit; none re-files a logic bug.

**Counts by severity (80 NEW rows):**
- high: 22
- medium: 31
- low: 27

**Notable highlights:**
- **Zero on-chain coverage of any signing path.** Two fork tests exist repo-wide; both are read-only. `EOAWallet.send/sendBatch`, `DefaultSmartWallet.send/sendBatch`, `executeTransactionBatch`, and every namespace dispatch have never run against real bytecode. Lend has no fork test at all. The single largest execution-coverage hole in the fund-moving surface (F177, F189, F203, F216, F223, F243, F249).
- **The one swap "execute" fork test asserts `tx.data === quote.swapCalldata` and never broadcasts.** It even passes a `0x..dEaD` recipient into `getQuote` but never decodes the calldata to confirm dEaD is the encoded recipient, so the F046 V4 TAKE_ALL / F003 universal-router sentinel "output silently goes to msg.sender" defects ship green (F177, F180, F216).
- **Morpho lend deposit/withdraw calldata is built by `MetaMorphoAction`, which the tests mock to a literal hex string** — so receiver/owner/amount the user actually signs are never asserted; a swapped withdraw receiver/owner would pass the whole suite (F190).
- **`approve.test.ts` enshrines the F042 deficit-vs-set bug as intended behavior** — it asserts the approval tx exists but never decodes the amount, actively defending the under-approval against a fix (F245).
- **The fund-safety validators have no direct tests.** validateSlippage (NaN bypass, >1 → negative min-out), validateAmountPositiveIfExists (NaN/Infinity), validateRecipient, validateNotZeroAddress are referenced only where they are mocked; no regression test would fail when a bypass is reintroduced (F244).
- **The harness blocks the e2e.** Fixed-port collisions (18547 used twice), a Unichain-only hard-coded USDC whale with a swallowed funding failure (false-green), and divergent inline fork-ChainManager stubs must be fixed first (F185, F195, F196, F207, F222, F231, F250, F251).

---

## Surface: swap

### F177 (NEW) — the only on-chain "execute" fork test asserts the encoder against itself and never broadcasts
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/providers/velodrome/__tests__/VelodromeSwapProvider.network.test.ts:262-291
- **Severity:** high
- **Class:** correctness
- **Title:** The only on-chain 'execute' fork test asserts the encoder against itself (tx.data === quote.swapCalldata) and never broadcasts, so no test on the entire swap surface proves a swap actually executes or that output lands at the recipient
- **Detail:** The single execute() case forks Base, calls `provider.execute(quote)`, then asserts only `tx.transactionData.swap.data === quote.execution.swapCalldata`, `tx.amountIn === quote.amountIn`, `tx.price === quote.price`. Every assertion compares encoder output to encoder input (a tautology) or copies metadata across the quote→tx boundary; none submit the calldata to the forked router, none read a post-swap balance. The fork is a read RPC for getQuote only. Because the encoder is hand-rolled on viem with no official-SDK oracle (F153/#318), the F046 (V4 TAKE_ALL ignores recipient), F003/#444 (universal-router recipient sentinel), and F047 (native-in value set but no native branch) defects are un-falsifiable: each ships green because no test runs the calldata against the EVM and checks where funds went.
- **Exploit/repro:** Replace the real encoder with one that hard-codes recipient = msg.sender (the actual F046/F003 bug): the test still passes because tx.data still equals quote.swapCalldata. No assertion can distinguish correct from recipient-stripped calldata.
- **Recommendation:** Add a fork test that impersonates a USDC whale, funds the signer, submits the approval+swap calldata via walletClient.sendTransaction against the Anvil fork, waits for the receipt, and asserts the RECIPIENT's assetOut balance increased by exactly amountOut ± slippage (and that a non-signer recipient, not msg.sender, received it).
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** F153
- **Dedup status:** new

### F178 (NEW) — fork tests run only on the safe v2 router paths; the two buggy router paths have zero on-chain coverage
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/providers/velodrome/__tests__/VelodromeSwapProvider.network.test.ts:107-260
- **Severity:** high
- **Class:** correctness
- **Title:** Fork tests run only on OP/Base (router type 'v2', recipient honored); the two buggy router paths (universal = recipient-ignored sentinel + no native branch, and V4) have ZERO on-chain coverage
- **Detail:** addresses.ts maps optimism.id and base.id to routerType 'v2' and baseSepolia.id to 'universal'. The v2 encoder correctly bakes the caller recipient; the universal encoder (encodeUniversalV2Swap) hard-codes UNIVERSAL_ROUTER_MSG_SENDER and has NO native-asset branch while the provider still sets value=amountInRaw for native-in. The fork tests fork only OP and Base, i.e. only the v2 path. The matrix exercises exactly the SAFE router variant and never the one where recipient is silently dropped or native ETH is stranded. The buggy universal/CL/V4 paths are "covered" only by encoder-vs-encoder unit tests.
- **Exploit/repro:** VelodromeSwapProvider.routing.test.ts:161-180 asserts swap.value>0n for native-in on OP (passes on a mock); but on a universal-router chain the same path encodes a token-to-token V2_SWAP_EXACT_IN with msg.value attached and no WETH wrap, reverting/stranding ETH. No fork test exists for that chain to catch it.
- **Recommendation:** Extend the fork matrix to every router type that ships: a Base-Sepolia (universal) fork swap asserting a distinct third recipient actually receives output, and a native-in (ETH→USDC) universal swap asserting ETH is not stranded. "Which router types are on-chain verified" must equal "which router types ship".
- **suggestRefactor:** false
- **Candidate issue:** #444
- **Relates to prior finding:** F047
- **Dedup status:** new

### F179 (NEW) — fork quote assertions are directional with no exact-amount oracle
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/providers/velodrome/__tests__/VelodromeSwapProvider.network.test.ts:131-167,224-259
- **Severity:** medium
- **Class:** correctness
- **Title:** Fork quote assertions are directional (amountOut/price/amountOutMin > 0) with no exact-amount oracle recomputed independently of quote.amountOut, so a wrong-pool, wrong-decimals, or stale-price quote passes
- **Detail:** Every fork quote case asserts only `amountOut > 0`, `price > 0`, `amountOutRaw > 0n`, and at most `amountOutMin < amountOut`. None recompute the expected output independently (from pool reserves via getReserves, the router's getAmountsOut at a second block, or a golden vector for a pinned fork block). A quote that resolves the wrong pool (stable vs volatile, different fee tier), mis-applies decimals, or reads a stale sqrtPrice still yields a positive number and passes. The CL/Slipstream and Aerodrome cases are highest-value because their sqrtPriceX96/tick-spacing math is the most error-prone (F005/#318 surface).
- **Exploit/repro:** Change formatUnits(amountOut, assetOut.metadata.decimals) to a wrong decimals constant: amountOut becomes 10^N off but still > 0, and every directional assertion passes.
- **Recommendation:** Pin a fork block and assert quote.amountOutRaw against an independently computed expected value (pool reserves / router getAmountsOut at that block). Replace toBeGreaterThan(0) with toBe(expectedExact) (or a 1-bp band).
- **suggestRefactor:** false
- **Candidate issue:** #318
- **Relates to prior finding:** F049
- **Dedup status:** new

### F180 (NEW) — V4 encoder unit tests assert action-code bytes but never decode the recipient/TAKE_ALL params
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/providers/uniswap/__tests__/sdk.test.ts:261-431
- **Severity:** high
- **Class:** fund-loss
- **Title:** encodeUniversalRouterSwap (V4) unit tests assert only calldata prefix/length/inequality and the action-code bytes, never decode the recipient/TAKE_ALL params, so the F046 recipient-ignored fund-loss bug is invisible to the suite
- **Detail:** The describe block asserts calldata matches /^0x/, length>10, action codes 0x060c0f / 0x080c0f, exactIn != exactOut, noSlippage != withSlippage. It never decodes the SETTLE_ALL/TAKE_ALL params to assert WHERE output goes. encoding.ts emits TAKE_ALL (0x0f) which sends output to msg.sender and the destructured `recipient` is entirely unused (F046/#444). The test asserts the action-CODE bytes (correct) but never the recipient routing, so a swap where the caller passed recipient=B but funds go to msg.sender=A passes. The "tags V4 action bytes" test deepened the decode but stopped one level short of the recipient.
- **Exploit/repro:** All 8 encodeUniversalRouterSwap tests pass `recipient: '0xrecipient'` but none decode it back out; the recipient is provably ignored, yet no assertion fails.
- **Recommendation:** Decode the TAKE_ALL / CURRENCY_AMOUNT params and assert the take recipient. If the encoder cannot encode a non-msg.sender recipient (true today), assert it THROWS when recipient != msg.sender, surfacing #444 as a failing test.
- **suggestRefactor:** false
- **Candidate issue:** #444
- **Relates to prior finding:** F046
- **Dedup status:** new

### F181 (NEW) — universal-router encoder test never asserts the encoded recipient (asymmetric with v2/leaf)
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/providers/velodrome/__tests__/encoding.v2.test.ts:177-231
- **Severity:** high
- **Class:** fund-loss
- **Title:** The universal-router encoder test never asserts the encoded recipient, while the sibling v2/leaf tests do; this asymmetric omission is exactly why the F003/#444 recipient-sentinel bug ships green
- **Detail:** encoding.v2.test.ts asserts `args[3] === RECIPIENT` for the v2 path and the leaf path carries recipient, but the universal-router describe block decodes the input and asserts ONLY commands==0x08, inputs length, deadline, and payerIsUser==true. It never decodes V2_SWAP_EXACT_IN_INPUT_PARAMS index 0 (recipient). encodeUniversalV2Swap hard-codes UNIVERSAL_ROUTER_MSG_SENDER and ignores params.recipient, so the caller recipient is silently dropped (F003/F044). The asymmetry (assert recipient for v2/leaf, omit for universal) masks the one router where recipient handling is broken. encoding.cl.test.ts:21-98 has the same omission for the CL/Slipstream path.
- **Exploit/repro:** Pass recipient: RECIPIENT (0x...dEaD) to encodeSwap routerType 'universal'; decode V2_SWAP_EXACT_IN_INPUT_PARAMS[0] and it is the msg.sender sentinel, not 0x...dEaD. No existing assertion checks this index.
- **Recommendation:** Add a recipient-field decode to the universal-router and CL tests. Given the sentinel design, assert recipient === UNIVERSAL_ROUTER_MSG_SENDER AND add a test asserting a non-sentinel recipient is rejected/surfaced, turning #444 into a failing test.
- **suggestRefactor:** false
- **Candidate issue:** #444
- **Relates to prior finding:** F003
- **Dedup status:** new

### F182 (NEW) — exact-output slippage protection (amountInMaximum) never decoded/asserted
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/providers/uniswap/__tests__/sdk.test.ts:274-310,367-397
- **Severity:** medium
- **Class:** correctness
- **Title:** Exact-output slippage protection (amountInMaximum) is never decoded/asserted; the exact-out tests only check 0x-prefix and exactIn!=exactOut, so a broken maxAmountIn or the F004 native-in placeholder-value bug passes
- **Detail:** The exact-out encoder computes maxAmountIn from slippage and bakes amountInMaximum + a CURRENCY_AMOUNT settle leg (the swapper's spend ceiling). The tests decode nothing, asserting only /^0x/ and inequality. F048/#318 already flagged that exact-out surfaces a meaningless amountOutMin and hides amountInMaximum; the test gap is why it is unverifiable. F004 (native-in exact-output attaches a 1-unit placeholder msg.value instead of amountInMaximum) has no test decoding the settle amount vs the attached value.
- **Exploit/repro:** Set the exact-out maxAmountIn computation to a constant 0: the exact-out tests still pass (0x-prefixed, != exactIn), proving the enforced spend ceiling is untested.
- **Recommendation:** Decode EXACT_OUTPUT_SINGLE_PARAMS.amountInMaximum and the SETTLE_ALL CURRENCY_AMOUNT and assert both equal quote.amountInRaw*(1+slippage). Add a native-in exact-output case asserting the attached value equals the encoded amountInMaximum, turning F004 into a failing test.
- **suggestRefactor:** false
- **Candidate issue:** #318
- **Relates to prior finding:** F004
- **Dedup status:** new

### F183 (NEW) — requireQuoteForThisWallet tests assert only the quote.recipient metadata, never the calldata bytes
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/namespaces/__tests__/WalletSwapNamespace.spec.ts:236-327
- **Severity:** medium
- **Class:** malicious-sign
- **Title:** requireQuoteForThisWallet tests assert only the quote.recipient METADATA field, never that the recipient encoded inside execution.swapCalldata matches the wallet; the guard's known no-op on sentinel/msg.sender paths is therefore untested
- **Detail:** The recipient-mismatch suite asserts quote.recipient (metadata) equals/differs from wallet.address, exercising QuoteRecipientMismatchError on METADATA only. F052/F075/#437 established the guard compares quote.recipient metadata, never the calldata bytes, and is a strict no-op for Uniswap (calldata always msg.sender) and Velodrome universal/CL (sentinel). No test decodes execution.swapCalldata to confirm the encoded recipient matches wallet.address. A pre-built quote whose metadata.recipient = wallet but whose calldata routes to an attacker passes every guard assertion (#373 calldata-integrity).
- **Exploit/repro:** Mutate quote.execution.swapCalldata to encode a different recipient while leaving quote.recipient metadata = wallet.address: requireQuoteForThisWallet still passes (reads metadata, not bytes).
- **Recommendation:** Add a test decoding the recipient out of execution.swapCalldata (per router/version) and asserting it matches quote.recipient and wallet.address; for msg.sender-sentinel paths, assert the guard documents/handles that the executing wallet must be msg.sender (encodes the executor-vs-recipient invariant #437).
- **suggestRefactor:** false
- **Candidate issue:** #437
- **Relates to prior finding:** F052
- **Dedup status:** new

### F184 (NEW) — best-quote routing tested only for exact-IN; the F114 exact-OUT mis-objective is uncovered
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/namespaces/__tests__/BaseSwapNamespace.spec.ts:58-232
- **Severity:** medium
- **Class:** correctness
- **Title:** Best-quote routing is tested only for exact-IN (maximize amountOut); no test covers the F114 exact-OUT mis-objective where the comparator should minimize amountIn cost
- **Detail:** BaseSwapNamespace.spec.ts asserts best-price selection picks the higher amountOut and getQuotes sorts by best price. All cases are exact-input. F114 established the comparator always maximizes amountOutRaw, the WRONG objective for exact-output swaps where the goal is to minimize amountInRaw cost; the direction-blind comparator silently picks the costlier quote. There is no exact-output multi-provider test asserting the cheaper-input quote wins, so the over-spend ships unverified.
- **Exploit/repro:** No existing test passes amountOut to getQuotes with two providers; the exact-output branch of the comparator is entirely uncovered.
- **Recommendation:** Add a getQuote/getQuotes test with two providers returning the same fixed amountOut but different amountIn (exact-output) and assert the LOWER-amountIn quote is selected/sorted first, turning F114 into a failing test.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Relates to prior finding:** F114
- **Dedup status:** new

### F185 (NEW) — Anvil fork harness uses hardcoded fixed ports (18545/18546)
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/providers/velodrome/__tests__/VelodromeSwapProvider.network.test.ts:92-100
- **Severity:** low
- **Class:** infra
- **Title:** Anvil fork harness uses hardcoded fixed ports (18545/18546); parallel test runs or a leftover process collide and the suite fails or silently forks the wrong upstream
- **Detail:** beforeAll starts two Anvil forks on fixed ports 18545/18546, and startAnvilFork takes the port as a required positional with no fallback/retry on EADDRINUSE. Vitest's default parallelism and any orphaned anvil collide on these ports; the readiness probe (POST to the fixed URL) can connect to a STALE anvil forking a different upstream, producing wrong-chain results rather than a clean failure (PR #348 fixed-port item).
- **Exploit/repro:** Run pnpm test:network twice concurrently, or leave an anvil on 18545: the second run's startAnvilFork either throws 'did not start in time' or connects to the stale fork.
- **Recommendation:** Allocate ephemeral ports (port 0 / OS-assigned, or scan for a free port) in startAnvilFork and return the bound port; never reuse a fixed port. Add a pre-flight that fails loudly if the port is already bound.
- **suggestRefactor:** true
- **Candidate issue:** #332
- **Relates to prior finding:** (none)
- **Dedup status:** new

### F186 (NEW) — slippage>=1.0 / NaN / negative-min-out boundary uncovered via the getQuote path
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/core/SwapProvider.ts:286-298,440-451
- **Severity:** medium
- **Class:** fund-loss
- **Title:** No test exercises the slippage>=1.0 / NaN / negative-min-out boundary on computeSlippageBounds via the getQuote path (validateSwapExecute is skipped there), so the negative-amountOutMinRaw fund-loss path is uncovered
- **Detail:** validateSwapExecute runs validateSlippage only on execute(); getQuote skips it, so a slippage in (maxSlippage,1.0) or >=1.0 reaches computeSlippageBounds and produces a zero or NEGATIVE amountOutMinRaw baked into the returned quote's signed calldata (refines:F001 high fund-loss; refines:F110 NaN-admits). There is no unit test feeding slippage>=1.0 or NaN through getQuote and asserting a throw or non-negative amountOutMinRaw. computeSlippageBounds has no direct test. The most safety-critical arithmetic on the signing path (the min-out that protects from MEV) is verified only indirectly and never at its failure boundary.
- **Exploit/repro:** getQuote({slippage: 1.5,...}) → computeSlippageBounds: 10000 - 15000 = -5000 → amountOutMinRaw negative; no test asserts against this.
- **Recommendation:** Add direct computeSlippageBounds tests: slippage=0, 0.005, 0.5, 1.0, 1.5, NaN, -0.1; assert amountOutMinRaw is always in [0, amountOutRaw] and that getQuote rejects (or clamps) slippage>=1 and NaN.
- **suggestRefactor:** false
- **Candidate issue:** #373
- **Relates to prior finding:** F110
- **Dedup status:** new

### F187 (NEW) — buildPermit2Approvals max-mode residual allowance / expiry decoupling untested
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/core/SwapProvider.ts:333-392
- **Severity:** medium
- **Class:** malicious-sign
- **Title:** buildPermit2Approvals max-mode and expiration logic has no test asserting the residual allowance left after a swap (maxUint160 / 30-day standing spend) nor the decoupling of permit2 expiry from swap deadline
- **Detail:** buildPermit2Approvals in max mode grants maxUint160 to the Permit2 spender with a 30-day default expiry (F050/#436), a standing authorization decoupled from the swap deadline. The Uniswap unit test only asserts tokenApproval and permit2Approval are 'defined' when allowance is 0; it never decodes the approved AMOUNT or expiration, so it cannot distinguish exact-mode from max-mode, catch an expiry that outlives the swap, or verify a residual allowance remains. The Permit2 payload (spender/amount/expiration) is signing-path surface asserted only by truthiness.
- **Exploit/repro:** Flip resolvePermit2ApprovalAmount to always return maxUint160 regardless of mode: UniswapSwapProvider.test.ts still passes (only checks .toBeDefined()).
- **Recommendation:** Decode buildPermit2ApprovalTx calldata: assert exact-mode approves exactly requiredAmount with no over-grant, max-mode approves maxUint160, expiration == now + permit2ExpirationSeconds. Add an Anvil case asserting the residual Permit2 allowance after a max-mode swap is nonzero and bounded.
- **suggestRefactor:** false
- **Candidate issue:** #436
- **Relates to prior finding:** F050
- **Dedup status:** new

### F188 (NEW) — consolidated e2e spec (swap portion)
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/providers/velodrome/__tests__/VelodromeSwapProvider.network.test.ts:1-293
- **Severity:** high
- **Class:** info
- **Title:** CONSOLIDATED E2E SPEC (swap portion): the single Anvil feature-test must execute real swaps on every router/direction with exact-amount recipient-balance assertions and adversarial recipient/allowance/quote-aging cases
- **Detail:** Swap slice of the ONE consolidated Anvil e2e (building on PR #348 with its required fixes). (1) Capability-boundary matrix actually broadcasting on a forked chain: {Uniswap V4 exact-in, V4 exact-out} x {ERC20-in, native-in} on OP; {Velodrome v2, universal, leaf, CL} x {ERC20-in, native-in, native-out} each on the chain where that router type ships — every router variant that ships gets one real on-chain execution, not only the two safe v2 paths. (2) Exact-amount assertions: impersonate a USDC whale, anvil_setBalance the signer, broadcast approval+swap, assert the RECIPIENT balance delta equals an INDEPENDENTLY recomputed expected output (pool reserves / getAmountsOut at a pinned fork block), NOT quote.amountOut, and >= amountOutMin. (3) Adversarial cases: (a) recipient-in-bytes — distinct third recipient, assert that exact address received output (catches F046 V4 TAKE_ALL and F003 universal sentinel); (b) residual allowance — after max-mode swap assert leftover ERC20→Permit2 and Permit2→router allowances equal the expected standing amount (catches F050/F053) and exact-mode leaves zero; (c) quote-aging — advance Anvil time past expiresAt/deadline, broadcast, assert revert AND that validateQuoteNotExpired fires before signing. (4) Real-creds signing via Privy/Turnkey/Dynamic, broadcast against the Anvil fork, OP-only. Harness fixes carried from PR #348: ephemeral ports, remove dead-on-arrival lend tests / string-coercion no-op, single harness.
- **Exploit/repro:** The current network test (262-291) and routing test (161-180) both pass on a quote whose calldata routes output to the wrong recipient or strands native ETH; only execute-and-read-balance falsifies them.
- **Recommendation:** Author the swap section of the consolidated e2e spec as above; do NOT file separate per-case e2e tickets. The exact-amount + adversarial-recipient cases are load-bearing — they are the only constructions catching the F046/F047/F003/F004/F050 cluster.
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** F176
- **Dedup status:** new

---

## Surface: lend

### F189 (NEW) — Morpho deposit/withdraw signing path has zero calldata-arg verification (MetaMorphoAction mocked to literal hex)
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/providers/morpho/__tests__/MorphoLendProvider.test.ts:16-23,186-213,86-114
- **Severity:** high
- **Class:** malicious-sign
- **Title:** Morpho deposit/withdraw signing path has ZERO calldata-arg verification: MetaMorphoAction is mocked to a literal hex, so receiver/owner/amount in the signed tx are never asserted
- **Detail:** _openPosition and _closePosition build the EXACT bytes the user signs by calling MetaMorphoAction.deposit(amountWei, walletAddress) and MetaMorphoAction.withdraw(assets, receiver=wallet, owner=wallet). The unit test mocks that module so deposit returns '0x1234567890abcdef' and withdraw returns '0xabcdef1234567890'. Downstream assertions only check the wrapper envelope and `apy > 0`. NOTHING decodes the position calldata to confirm the receiver/owner is the caller's wallet, the amount equals amountWei, or the `to` target is the vault. A regression in the caret-floating @morpho-org dep (F162/F160) that swapped withdraw's receiver/owner, hard-coded a different recipient, or shifted the amount would route funds elsewhere and EVERY lend unit test would pass green.
- **Exploit/repro:** Patch _closePosition to call MetaMorphoAction.withdraw(assets, ATTACKER, ATTACKER); the suite stays green because withdraw is mocked to a constant and no test decodes receiver/owner.
- **Recommendation:** Add a unit test that does NOT mock MetaMorphoAction: call _openPosition/_closePosition, then decodeFunctionData against erc4626Abi (independent oracle) and assert functionName, args.assets===amountWei, args.receiver===wallet, args.owner===wallet, transaction.to===vaultAddress.
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** F160
- **Dedup status:** new

### F190 (NEW) — Aave supply/withdraw/depositETH/withdrawETH calldata never decoded in any test
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/providers/aave/__tests__/AaveLendProvider.test.ts:125-205,213-271,355-375
- **Severity:** high
- **Class:** malicious-sign
- **Title:** Aave supply/withdraw/depositETH/withdrawETH calldata is never decoded in any test; assertions stop at the wrapper, so onBehalfOf/to/pool/amount args in the signed tx are unverified
- **Detail:** AaveLendProvider hand-encodes the signed bytes with viem (supply [asset, amountWei, onBehalfOf=wallet, 0]; withdraw [asset, amount, to=wallet]; depositETH [pool, onBehalfOf, 0]; withdrawETH [pool, amount, to]). Across the suite position.data is NEVER decoded: tests assert only amount/assetAddress/marketId properties, approval presence, position.value, and `apy > 0`. A bug putting the pool address in onBehalfOf, swapping the WETHGateway `to`, or pointing withdraw at the wrong reserve would ship green. The native-ETH paths are most dangerous: depositETH embeds onBehalfOf (who receives aWETH), withdrawETH embeds `to` (who receives native ETH), and neither is asserted. LendProvider.test.ts only slices the last 32 bytes (amount) of the approval, never the spender.
- **Exploit/repro:** Change _closeETHPosition to pass poolAddress in place of params.walletAddress as withdrawETH's `to`; all tests pass because position.data is never decoded.
- **Recommendation:** Add decode-based assertions for each of supply/withdraw/depositETH/withdrawETH (functionName + every arg: asset, amount, onBehalfOf/to===wallet, pool===poolAddress, referralCode===0). Extend the approval assertion to decode and check the spender.
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** (none)
- **Dedup status:** new

### F191 (NEW) — entire lend surface is mocked: no fork/network test for Aave or Morpho lend
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/providers/aave/__tests__/AaveLendProvider.test.ts:1-20,56-62
- **Severity:** high
- **Class:** info
- **Title:** Entire lend surface is mocked: NO fork/network test exists for either Aave or Morpho lend (open or close), so no real on-chain behavior is ever exercised
- **Detail:** There is no *.network.test.ts under packages/sdk/src/actions/lend (find returns nothing). Both provider suites vi.mock the SDK read path (getReserve/getReserves/getATokenAddress; fetchAccrualVault + MetaMorphoAction). The Aave ETH market mock uses a deliberately wrong market address (the WETH predeploy 0x4200...0006) that no real Aave Pool would accept, encoding an unrealistic topology a fork would reject. Borrow and swap each have one network test; lend has none. getATokenAddress's index-8 destructure, the SDK-vs-on-chain fallback in getVault, the WETHGateway aWETH-approval flow, and the convertToAssets share→asset math have never run against real bytecode.
- **Exploit/repro:** find packages/sdk/src/actions/lend -name '*.network.test.ts' returns empty; grep for createSelectFork/startAnvilFork in the lend tree returns nothing.
- **Recommendation:** Lend is the highest-value gap for the consolidated Anvil feature-test. At minimum a fork test must exercise open (supply) + close (withdraw) against a real Morpho vault and a real Aave reserve, decoding the produced calldata then submitting it on the fork to confirm the aToken/share balance moves by the exact expected amount.
- **suggestRefactor:** false
- **Candidate issue:** #332
- **Relates to prior finding:** (none)
- **Dedup status:** new

### F192 (NEW) — Aave pool ABI round-trip test encodes and decodes with the same local ABI (no independent oracle)
- **Surface:** lend
- **File:** packages/sdk/src/actions/shared/aave/__tests__/pool.test.ts:11-31
- **Severity:** medium
- **Class:** correctness
- **Title:** Aave pool ABI round-trip test encodes and decodes with the SAME local ABI (encoder-vs-itself), giving no independent oracle that the local POOL_ABI matches the real Aave Pool signatures
- **Detail:** pool.test.ts round-trips borrow/repay/getUserAccountData/getReservesList by encoding with POOL_ABI and decoding with POOL_ABI. This only proves viem's encode/decode are inverses for whatever ABI is supplied; it cannot detect a wrong parameter order, type width, or typo'd function name because the same definition is on both sides. The supply/withdraw selectors the lend provider actually signs are not even round-tripped here (only borrow/repay). If the local POOL_ABI for supply drifted from on-chain Aave (e.g. arg order of (asset, amount, onBehalfOf, referralCode)), this test stays green and the provider signs a tx the real Pool reverts or misinterprets (F153 sibling).
- **Exploit/repro:** Reorder POOL_ABI.supply inputs to (amount, asset, onBehalfOf, referralCode); pool.test.ts and AaveLendProvider.test.ts both stay green.
- **Recommendation:** Anchor POOL_ABI/WETH_GATEWAY_ABI against an independent oracle: compare the 4-byte selectors of supply/withdraw/depositETH/withdrawETH to known canonical selectors, or decode provider-produced calldata using @aave's published ABI. Add supply/withdraw to the round-trip set.
- **suggestRefactor:** false
- **Candidate issue:** #318
- **Relates to prior finding:** F153
- **Dedup status:** new

### F193 (NEW) — directional APY non-assertions (apy > 0) and balance formatting masquerade as coverage
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/providers/aave/__tests__/AaveLendProvider.test.ts:150-151,239-240; packages/sdk/src/actions/lend/providers/morpho/__tests__/MorphoLendProvider.test.ts:113,211-212
- **Severity:** medium
- **Class:** correctness
- **Title:** Directional non-assertions on APY (`apy > 0`) and balance formatting masquerade as coverage of the value-presentation path
- **Detail:** Both lend suites assert `apy.toBeGreaterThan(0)`. The apy value is entirely derived from the mocked reserve/vault fixture, so this proves the fixture has a positive APY, not that calculateApyBreakdown/calculateBaseApy compute it correctly. The getPosition tests do better (Morpho asserts balanceFormatted==='1' exactly), but the Aave getPosition share/balance path — which hard-codes shares===balance (aTokens 1:1) and formats via market.asset.metadata.decimals — has NO test asserting the formatted balance. Combined with F116 (Aave getReserve fills supply.totalShares with borrow-side scaled debt), APY/share-price has only directional, fixture-bound coverage.
- **Exploit/repro:** Set the mock reserve apy to a wrong-but-positive number; `apy > 0` still passes.
- **Recommendation:** Replace `apy > 0` with exact expected values computed independently of the fixture's stored apy (recompute weighted-APY-minus-fee, assertCloseTo). Add an Aave getPosition test asserting balanceFormatted/sharesFormatted exactly for a known aToken balance and decimals.
- **suggestRefactor:** false
- **Candidate issue:** #209
- **Relates to prior finding:** F116
- **Dedup status:** new

### F194 (NEW) — startAnvilFork fixed ports race the existing network suites under parallel vitest
- **Surface:** lend
- **File:** packages/sdk/src/utils/test.ts:74-105; packages/sdk/src/actions/borrow/providers/morpho/__tests__/MorphoBorrowProvider.network.test.ts:161
- **Severity:** medium
- **Class:** infra
- **Title:** startAnvilFork uses caller-supplied FIXED ports (18545/18546/18547) with no collision avoidance; adding a lend fork test on a hand-picked port races the existing network suites under parallel vitest
- **Detail:** The network vitest project sets no fileParallelism:false, so network test files run concurrently. startAnvilFork takes a hard-coded port and spawns anvil there; the swap test grabs 18545+18546 and the borrow test grabs 18547. Disjoint today only by manual bookkeeping. A new lend network test (required by the e2e spec) must hand-pick yet another free port with zero guard against EADDRINUSE; a collision produces a flaky anvil-failed-to-start that looks like a network outage. PR #348 'fixed-port collisions' is a required fix.
- **Exploit/repro:** Run two network suites both passing 18547 to startAnvilFork under the default parallel pool; the second anvil fails to bind and throws 'did not start in time'.
- **Recommendation:** Make startAnvilFork allocate an ephemeral port (--port 0 / probe a free port, return the bound port), OR set the network project to fileParallelism:false. Either removes the manual-port-registry footgun before a third (lend) suite is added.
- **suggestRefactor:** true
- **Candidate issue:** #332
- **Relates to prior finding:** (none)
- **Dedup status:** new

### F195 (NEW) — fundWallet swallows USDC-funding failures (catch → console.log), proceeds with zero balance
- **Surface:** lend
- **File:** packages/sdk/src/utils/test.ts:324-392
- **Severity:** medium
- **Class:** infra
- **Title:** fundWallet's USDC whale-impersonation swallows transfer failures (catch -> console.log) so a lend fork test funded this way would proceed with a zero balance and produce a misleading directional pass instead of failing loud
- **Detail:** fundWallet wraps the whale-impersonation + USDC transfer in try/catch that on failure only console.log('Failed to fund USDC ... This may cause lending tests to fail') and returns normally. It also hard-codes a single Unichain whale (0x5752...C792) and a single Unichain USDC address (0x078d...7ad6), so on any other chain (OP, Base) the transfer reverts, is swallowed, and the test continues with 0 USDC. A subsequent supply of 0 (or a directional `balanceAfter <= balanceBefore` check) then passes for the wrong reason. Violates 'fail loud' for the funding precondition; the 'USDC-only whales' / hard-coded-whale fragility the PR directive flags.
- **Exploit/repro:** Call fundWallet({fundUsdc:true, chain: optimism, ...}) against an OP fork: the Unichain USDC address has no code on OP, writeContract reverts, the catch logs and returns, and the caller sees a 'funded' wallet with 0 USDC.
- **Recommendation:** fundWallet must throw (not console.log-and-continue) when fundUsdc is requested and the transfer fails, and must look the whale/USDC address up per-chain. The lend e2e should assert the wallet's USDC balance equals the funded amount BEFORE attempting supply.
- **suggestRefactor:** true
- **Candidate issue:** #332
- **Relates to prior finding:** (none)
- **Dedup status:** new

### F196 (NEW) — no deposit→withdraw roundtrip invariant test for either lend provider
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/providers/morpho/__tests__/MorphoLendProvider.test.ts:57-138
- **Severity:** low
- **Class:** correctness
- **Title:** No deposit->withdraw roundtrip invariant test (open then close) for either provider; open and close are tested in isolation against independent mocks
- **Detail:** The single most valuable economic invariant — 'a user who supplies X and then withdraws X gets their assets back, and the close calldata references the same vault/asset/wallet as open' — is never expressed. openPosition and closePosition are each tested standalone with separately-stubbed mocks (same split in the Aave suite). No test threads the open output (assetAddress, marketId, amount) into the close input and asserts consistency, and on a fork no test supplies then withdraws and asserts the net aToken/share delta is zero (minus rounding). This is the canonical vault invariant.
- **Exploit/repro:** n/a — coverage gap; no single test exercises open then close as a pair.
- **Recommendation:** Add an open→close roundtrip: assert close's assetAddress/marketId/amount match what open produced for the same params, and on the Anvil feature-test submit supply then withdraw and assert the underlying balance returns to within 1 wei of start (exact-amount).
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** (none)
- **Dedup status:** new

### F197 (NEW) — getATokenAddress index-8 tuple destructure has no test pinning it to the real struct layout
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/providers/aave/sdk.ts:253-264
- **Severity:** low
- **Class:** correctness
- **Title:** getATokenAddress's index-8 tuple destructure of getReserveData has no test pinning that index against the real Aave Pool struct layout
- **Detail:** getATokenAddress reads reserveData[8] as the aTokenAddress. The aToken address is the spender the WETH-close approval is built around and the contract whose balanceOf is the user's position. If the Aave ReserveData struct reorders (it has changed across V3 minor versions) or the local ABI's tuple order is wrong, index 8 silently returns a different address and the position read / approval target is wrong. The only test touching getATokenAddress mocks it entirely, so the magic index is unverified.
- **Exploit/repro:** n/a — magic-index assumption with mock-only coverage.
- **Recommendation:** In the lend Anvil feature-test, call getATokenAddress against a real Aave reserve and assert it equals the known aToken for that underlying; pins the index-8 contract assumption the close-approval and getPosition both depend on.
- **suggestRefactor:** false
- **Candidate issue:** #211
- **Relates to prior finding:** (none)
- **Dedup status:** new

### F198 (NEW) — no residual-allowance / approval-mode='max' adversarial test for lend
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/core/LendProvider.ts:84-118; packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts:48-84
- **Severity:** low
- **Class:** malicious-sign
- **Title:** No residual-allowance / approval-mode='max' adversarial test: after a max-approval supply, nothing verifies the leftover allowance to the vault/pool is the intended one
- **Detail:** openPosition with approvalMode 'max' builds approve(spender, maxUint256). LendProvider.test.ts confirms the approval DATA encodes maxUint256, but no test confirms the spender of that unlimited approval is the correct vault (Morpho) / pool (Aave) and not some other address, and no test exercises the residual-allowance case (a second supply when an allowance exists — is the redundant approval skipped or re-issued?). An unlimited approval to the wrong spender is a direct fund-drain primitive. The Aave close-ETH path issues an aWETH approval to the gateway sized to params.amount with no test asserting that spender either.
- **Exploit/repro:** n/a — the spender of the (max) approval is never asserted in any test.
- **Recommendation:** On the Anvil feature-test, after a max-approval supply read the ERC-20 allowance and assert it equals maxUint256 AND spender === vault/pool. Add a residual-allowance case: pre-set an allowance, run supply again, assert the approval is skipped or re-targets the same correct spender.
- **suggestRefactor:** false
- **Candidate issue:** #133
- **Relates to prior finding:** (none)
- **Dedup status:** new

### F199 (NEW) — getVault SDK→on-chain fallback divergence (cross-harness parity) is untested
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/providers/morpho/sdk.ts:341-394
- **Severity:** low
- **Class:** correctness
- **Title:** getVault SDK->on-chain fallback branch is never tested in the divergent direction: a forced SDK failure should produce the SAME market shape as the on-chain path, but no test asserts cross-harness parity
- **Detail:** getVault tries fetchAccrualVault (SDK) and on any throw falls back to fetchVaultDataOnChain. These two paths compute totalAssets/totalShares/apy/owner/curator independently. The unit test only mocks the SDK path; the on-chain fallback (fetchVaultInfo, calculateVaultApy, fetchMarketAllocation with its borrowRateView IRM call) has no test, and nothing asserts the two harnesses agree for the same vault. The PR directive calls out 'two divergent harnesses': an SDK-path number and a fallback-path number that silently disagree would surface a different APY/totalAssets depending on whether api.morpho.org was reachable.
- **Exploit/repro:** n/a — fallback path and SDK-vs-fallback parity are untested.
- **Recommendation:** On the Anvil feature-test (Morpho on a SDK-supported chain forked locally), run getVault once normally and once with the SDK path forced to throw, and assert both return the same totalAssets/totalShares and an APY within a tight tolerance.
- **suggestRefactor:** false
- **Candidate issue:** #211
- **Relates to prior finding:** (none)
- **Dedup status:** new

### F200 (NEW) — consolidated e2e spec (lend slice)
- **Surface:** lend
- **File:** docs/reviews/review-pass-09.md (e2e-spec deliverable)
- **Severity:** high
- **Class:** info
- **Title:** CONSOLIDATED E2E SPEC CONTRIBUTION (lend slice): what the single Anvil feature-test must cover for the lend surface
- **Detail:** Lend slice of the ONE consolidated Anvil feature-test (building on the PR #348 harness with its required fixes). CAPABILITY BOUNDARY: real Privy/Turnkey/Dynamic creds drive a SmartWallet/EOA that signs against an Anvil fork of a single OP-stack chain (OP-only); exercise BOTH providers — Morpho (real MetaMorpho vault) and Aave V3 (real Pool + WETHGateway). USDC-only whale funding via per-chain-corrected fundWallet (no Unichain hard-code; fail loud). EXACT-AMOUNT ASSERTIONS: (1) supply N USDC → decode the produced supply/deposit calldata with an INDEPENDENT ABI (erc4626Abi / @aave Pool ABI) and assert args.assets===parseUnits(N), receiver/onBehalfOf===wallet, to===vault/pool; submit; assert aToken balance increased by exactly N (Aave 1:1) and Morpho share balance equals vault.convertToShares(N) within 1 wei. (2) withdraw N → assert receiver===owner===wallet in decoded bytes, submit, assert underlying returns to start within 1 wei (roundtrip). (3) APY: recompute weighted-APY-minus-fee independently and assertCloseTo getMarket's value. (4) getATokenAddress: assert reserveData[8]===known aToken. (5) two-divergent-harnesses: getVault SDK path vs forced-fallback must agree. ADVERSARIAL: (a) recipient-in-bytes — assert the LAST decoded address arg of withdraw/withdrawETH/depositETH is the caller's wallet; (b) residual allowance — after max-mode supply, allowance===maxUint256 AND spender===vault/pool, then re-supply and assert the redundant approval is skipped; (c) quote-aging — getMarket APY snapshot at open must not change the signed calldata if re-fetched (assert deposit bytes independent of stale apy). INFRA FIXES: ephemeral anvil port, fail-loud fundWallet, no string-coercion no-op, real (non-DOA) supply assertion.
- **Exploit/repro:** n/a — this is the deliverable spec, grounded in the gaps proven by F189–F199.
- **Recommendation:** Fold this lend slice into the single consolidated Anvil feature-test ticket. Do NOT file a separate lend e2e ticket. Priority: Morpho+Aave supply/withdraw roundtrip with exact-amount + recipient-in-bytes first; APY-parity and divergent-harness second.
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** (none)
- **Dedup status:** new

### F201 (NEW) — Aave APY/share-price coverage is fixture-bound (companion to F193, distinct decode locus)
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/providers/aave/__tests__/AaveLendProvider.test.ts:150-151,239-240
- **Severity:** medium
- **Class:** correctness
- **Title:** Aave-side `apy > 0` non-assertion and missing exact getPosition balance assertion leave the Aave value-presentation path with directional-only coverage
- **Detail:** This is the Aave-locus companion to F193 (which spans both suites). The Aave getPosition share/balance path hard-codes shares===balance (aTokens 1:1) and formats via market.asset.metadata.decimals, with no test asserting the formatted balance at all; combined with F116 (Aave getReserve fills supply.totalShares with borrow-side scaled debt) the Aave APY/share-price presentation has only fixture-bound coverage. Filed as a distinct row because the fix touches the Aave provider's getPosition test specifically, separate from the shared `apy>0` replacement in F193.
- **Exploit/repro:** Set the mock Aave reserve apy to a wrong-but-positive number; `apy > 0` still passes; no exact getPosition balance test exists for a known aToken balance.
- **Recommendation:** Add an Aave getPosition test asserting balanceFormatted/sharesFormatted exactly for a known aToken balance and decimals, and recompute the Aave weighted-APY-minus-fee independently of the stored fixture apy.
- **suggestRefactor:** false
- **Candidate issue:** #209
- **Relates to prior finding:** F116
- **Dedup status:** new

### F202 (NEW) — lend e2e requires the shared-harness fixes before a third network suite can land
- **Surface:** lend
- **File:** packages/sdk/src/utils/test.ts:74-105,116-438
- **Severity:** medium
- **Class:** infra
- **Title:** The lend slice of the e2e cannot land until the shared harness gains ephemeral ports AND a per-chain fail-loud fundWallet (the two blockers compounded for a brand-new suite)
- **Detail:** Distinct from F194 (port collision) and F195 (funding swallow) which each name one harness defect: this row captures that adding the FIRST lend network test compounds both — a new suite needs a fourth free port AND working per-chain USDC funding simultaneously, and today neither exists. The lend e2e is the surface with no prior fork test, so it cannot reuse any of the manual-port bookkeeping or whale assumptions baked into the swap/borrow suites. The consolidated harness must therefore be built before, not alongside, the lend leg.
- **Exploit/repro:** n/a — precondition: the lend leg has no existing harness to extend and needs both fixes at once.
- **Recommendation:** Treat the harness consolidation (ephemeral ports + per-chain fail-loud fundWallet + single createForkChainManager) as a hard prerequisite of the lend e2e leg; sequence it first in the consolidated ticket.
- **suggestRefactor:** true
- **Candidate issue:** #332
- **Relates to prior finding:** (none)
- **Dedup status:** new

---

## Surface: borrow

### F203 (NEW) — borrow signing/dispatch path has zero on-chain coverage
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:232-247
- **Severity:** high
- **Class:** malicious-sign
- **Title:** Borrow signing/dispatch path has ZERO on-chain coverage — no test ever signs+broadcasts a borrow bundle
- **Detail:** WalletBorrowNamespace.dispatch (executeTransactionBatch → wallet.send/sendBatch) is exercised only by mocked unit tests with a fake wallet. The single borrow fork test only builds quotes and DECODES calldata; it never funds, signs, or broadcasts. So the highest-value behavior — does a borrow/supplyCollateral/repay/withdraw bundle actually execute against the real Aave Pool / Morpho Blue and move the expected funds — is completely unverified on-chain. Every prior malicious-sign finding on this file (F054, F082, F084) describes calldata that ships verbatim; none can be caught because nothing runs the bytes. The encoder agreeing with itself (decodeFunctionData round-trip) proves the ABI selector, not that Aave accepts the args or that funds land at this.wallet.address.
- **Exploit/repro:** Only 2 *.network.test.ts files in src/; neither borrow test calls wallet.send/sendBatch, writeContract, impersonate, or setBalance. WalletBorrowNamespace.spec.ts injects a mock wallet.
- **Recommendation:** The consolidated e2e MUST execute a full borrow lifecycle through wallet.borrow.* with a real signer on a fork: open (supplyCollateral + borrow) → assert collateral fell by EXACTLY collateralAmountRaw and the borrow-asset balance ROSE by EXACTLY borrowAmountRaw at the signer, then repay/close and assert debt→0 via an independent Aave Pool / Morpho position read.
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** F054
- **Dedup status:** new

### F204 (NEW) — Morpho marketId test asserts the encoder against itself
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/providers/morpho/__tests__/marketParams.spec.ts:20-39
- **Severity:** medium
- **Class:** correctness
- **Title:** Morpho marketId test asserts the encoder against itself (no independent on-chain oracle)
- **Detail:** The test 'produces the same hash as keccak256(abi.encode(MarketParams)) directly' reimplements the exact ABI encoding + keccak256 that computeMorphoMarketId performs, then asserts they match — a tautology: a bug in either the field ORDER or the encoder changes both sides identically and the test still passes. computeMorphoMarketId is the signing-path integrity anchor (BorrowMarketParamsMismatchError, verifyMorphoMarketId both depend on it). There is no fixture pinning a known-good (marketParams → marketId) pair from a deployed Morpho Blue market, so a silent field-order regression (or F162 floating bump) is not caught. fixtures.ts also sets market.marketId = computeMorphoMarketId(marketParams), making the happy-path constructor integrity check structurally untestable.
- **Exploit/repro:** marketParams.spec.ts:20-39 re-derives the hash with the same encodeAbiParameters tuple; fixtures.ts:46 sets marketId: computeMorphoMarketId(marketParams).
- **Recommendation:** Add a frozen fixture asserting computeMorphoMarketId(knownParams) === knownMarketId where knownMarketId is copied from a real deployed Morpho Blue market, independent of the SDK encoder. In the e2e, cross-check the SDK-computed marketId against blueAbi market(id) returning non-zero totals.
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** F162
- **Dedup status:** new

### F205 (NEW) — Aave computeAaveBorrowMarketId tested only for determinism/uniqueness, never a golden vector
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/providers/aave/__tests__/marketId.test.ts:12-27
- **Severity:** low
- **Class:** correctness
- **Title:** Aave computeAaveBorrowMarketId tested only for determinism/uniqueness, never against a stable golden vector
- **Detail:** All three cases assert determinism, uniqueness, and self-round-trip via marketIdMatches. None pins computeAaveBorrowMarketId(fixedInputs) to a frozen expected hex. Because the marketId is a pure local keccak over (chainId, collateral, debt) with no on-chain counterpart, a regression in the hashing scheme (encoding, field order, checksum — F104) keeps all three tests green while silently re-namespacing every allowlisted Aave market, invalidating the F103 constructor-binding check downstream.
- **Exploit/repro:** marketId.test.ts has no `.toBe('0x<64hex>')` literal assertion; all comparisons are relative.
- **Recommendation:** Add one golden-vector assertion: computeAaveBorrowMarketId({chainId, collateral, debt}) toBe a hard-coded 0x... hash, so any change to the hashing inputs/encoding fails loudly.
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** F104
- **Dedup status:** new

### F206 (NEW) — Morpho borrow fork test uses non-assertions and never funds/signs
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/providers/morpho/__tests__/MorphoBorrowProvider.network.test.ts:181-220
- **Severity:** medium
- **Class:** correctness
- **Title:** Morpho fork test uses non-assertions (toBeGreaterThan(0), directional-only) and never funds/signs
- **Detail:** The one real-RPC borrow test is read-only and weakly asserted: getMarket only checks maxLtv>0 && <1, borrowApy>=0, liquidationBonus>0 — bands so wide that a unit-confusion bug (WAD scaling, basis points, or an F117 LTV/threshold mixup ported to Morpho) passes. getPosition asserts a fresh wallet has 0 collateral/0 debt (trivially true for ANY address). openPosition asserts transactions.length===3 and functionName strings but NO exact amounts, no value field, and the wallet is never funded/signed/broadcast — so 'open emits a borrow' is proven only at the ABI-selector level, identical to the mocked spec.
- **Exploit/repro:** network.test.ts:193-195 (toBeGreaterThan/toBeLessThan bands), :216-219 (zeros on a fresh wallet), :238-259 (length + functionName only).
- **Recommendation:** Replace with the consolidated e2e flow: fund a real signer, supplyCollateral+borrow via wallet.borrow.openPosition, assert EXACT post-state from an independent blueAbi position(id, account) read (collateral === supplied wei, borrowAssets ~= borrowed wei within accrual tolerance recomputed independently of quote.positionAfter, healthFactor recomputed from the live oracle).
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** F117
- **Dedup status:** new

### F207 (NEW) — Morpho borrow fork test hardcodes fixed Anvil port (18547)
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/providers/morpho/__tests__/MorphoBorrowProvider.network.test.ts:161
- **Severity:** low
- **Class:** infra
- **Title:** Hardcoded fixed Anvil port (18547) — collides with the other fork tests under parallel/leaked runs
- **Detail:** startAnvilFork(rpc, 18547) hardcodes the port, as do the Velodrome tests (18545/18546). The three values are distinct today but are static hand-chosen constants: vitest's default parallel execution, a leaked anvil from a prior crash, or a fourth future fork test will collide on a fixed port and the suite fails with the opaque 'did not start in time'. Exactly the fixed-port-collision class PR #348 calls out as a required harness fix.
- **Exploit/repro:** network.test.ts:161 startAnvilFork(rpc, 18547); Velodrome test:97-98 uses 18545/18546 — all literals, no collision guard.
- **Recommendation:** Allocate an ephemeral port (port 0 / per-worker offset from VITEST_POOL_ID) in startAnvilFork; have the helper return the bound port. Fold all fork tests onto the shared PR #348 harness so port management lives in one place.
- **suggestRefactor:** true
- **Candidate issue:** #332
- **Relates to prior finding:** (none)
- **Dedup status:** new

### F208 (NEW) — borrow fork test silently self-skips when deployments.json is unpopulated
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/providers/morpho/__tests__/MorphoBorrowProvider.network.test.ts:50-102
- **Severity:** low
- **Class:** infra
- **Title:** Borrow fork test silently self-skips when deployments.json is unpopulated — coverage can be zero with a green CI
- **Detail:** readDeployedBorrowMarket returns null and the suite becomes describe.skip whenever the demo deploy hasn't run (any null field in morpho.borrow). In CI without the baseSepolia demo deploy, the ONLY borrow fork test silently disappears and the build is green with zero on-chain borrow coverage. A 'fail loud' posture wants the e2e gate present-and-asserting or explicitly xfail-tracked, not invisibly skipped. Combined with the read-only weakness (F206), practical on-chain borrow coverage in CI is effectively nil.
- **Exploit/repro:** network.test.ts:146 describeOrSkip = deployed ? describe : describe.skip; :148-152 only a stderr warn, no failure.
- **Recommendation:** In the consolidated e2e spec, source the borrow market from pinned public-mainnet/Base fixtures (as PR #348 does for Morpho vaults and Velodrome pools) rather than a demo deploy artifact, so the test runs deterministically and a missing fixture fails loudly.
- **suggestRefactor:** false
- **Candidate issue:** #332
- **Relates to prior finding:** (none)
- **Dedup status:** new

### F209 (NEW) — Aave write tests assert positionAfter against hand-coded mock oracle prices (no fork oracle)
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/providers/aave/__tests__/AaveBorrowProvider.write.spec.ts:102-149
- **Severity:** medium
- **Class:** correctness
- **Title:** Aave write tests assert positionAfter against hand-coded mock oracle prices — projection verified against its own inputs, no fork oracle
- **Detail:** makeProvider mocks getReserveData/getAssetPrice/getUserAccountData with literal values (ETH $3000, USDC $1, fixed config bitmap, healthFactor 1.5e18). The tests assert quote.positionAfter.borrowAmount === the borrow input and safeCeilingLtv>0. projectAavePositionState is thus validated against the same numbers the mock feeds it — a sign/scaling error in the projection (the F117 LTV-vs-threshold bug, or an 8-dp oracle vs 6-dp USDC decimals mismatch) is invisible because the expected value is the input echoed back. There is NO Aave borrow fork test anywhere (Morpho has one read-only; Aave has zero), so the entire Aave projection + WETHGateway native-ETH path is mock-only.
- **Exploit/repro:** write.spec.ts:123 hard-codes healthFactor 1.5e18 in the mock; :172 asserts positionAfter.borrowAmount === borrow input; :130-132 hard-codes oracle prices. No `.network.test.ts` exists for the Aave borrow provider.
- **Recommendation:** The e2e spec must add an Aave-on-OP leg: open a real position on a fork, recompute expected healthFactor/LTV from the live Aave oracle and reserve config INDEPENDENTLY of quote.positionAfter, then assert the SDK projection matches the post-execution getUserAccountData read within tolerance. Exercise the native-ETH depositETH/withdrawETH gateway path with real msg.value.
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** F117
- **Dedup status:** new

### F210 (NEW) — e2e spec: borrow recipient-in-bytes / residual-allowance / quote-aging adversarial cases on a real fork
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:207-247
- **Severity:** high
- **Class:** malicious-sign
- **Title:** E2E spec: borrow must exercise recipient-in-bytes, residual-allowance, and quote-aging adversarial cases on a real fork
- **Detail:** Borrow slice of the consolidated e2e (PR #348 chassis, OP-only, USDC whale funding, real Privy/Turnkey/Dynamic signer) must cover the borrow capability boundary and the three adversarial cases the metadata-only validateQuoteForThisWallet (F054/F082/F084) cannot catch without execution: (1) RECIPIENT-IN-BYTES — build a Morpho/Aave quote whose calldata bakes onBehalf/receiver = ATTACKER while quote.recipient is spoofed to the signer; dispatch through wallet.borrow and assert borrowed funds / withdrawn collateral land at the SIGNER. (2) RESIDUAL ALLOWANCE — after a max-mode repay/close granting maxUint256 to Morpho Blue (refines:F053), assert the leftover allowance is what the SDK intends and a second op does not silently reuse it. (3) QUOTE-AGING — accrue interest via Anvil time-travel between getQuote and dispatch, then assert exact-mode repay under-approval (F057) reverts cleanly rather than partially repaying. Exact-amount throughout: recompute expected borrowed/repaid/withdrawn wei and projected health INDEPENDENTLY of quote.positionAfter. Capability boundary: signer-must-equal-onBehalf (F084/F086) — execute a signer!=onBehalf quote and assert the on-chain revert is surfaced.
- **Exploit/repro:** validateQuoteForThisWallet (211-221) checks quote.recipient metadata only; dispatch (232-237) signs quote.execution.transactions verbatim with no per-leg bytes reconciliation — only on-chain execution can prove funds route to the signer.
- **Recommendation:** Add these three adversarial legs to the ONE consolidated borrow e2e flow (open → deposit → withdraw → repay → close), reusing the PR #348 TestEOAWallet + whale-impersonation harness, OP-only, USDC-only whales.
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** F082
- **Dedup status:** new

---

## Surface: wallet-core

### F211 (NEW) — EOA sendBatch mid-batch-revert residual-allowance hazard has zero real-execution coverage
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/wallets/eoa/__tests__/EOAWallet.spec.ts:90-321
- **Severity:** high
- **Class:** fund-loss
- **Title:** EOA sendBatch has ZERO real-execution coverage of the mid-batch-revert residual-allowance hazard (F021); the entire suite mocks sendTransaction+waitForTransactionReceipt so the documented fund-loss path can never fail a test
- **Detail:** Every EOAWallet test mocks createWalletClient.sendTransaction (always resolves a hash) and getPublicClient.waitForTransactionReceipt (always resolves status:'success'). The F021 fund-loss bug (EOA sendBatch never inspects receipt.status, so a mid-batch revert after a max-mode approval leaves an infinite residual allowance reported as success) is structurally unreachable: the mock receipt is hardcoded status:'success' and no test returns a 'reverted' receipt mid-batch, nor asserts that send/sendBatch surface a reverted leg. The sendBatch tests assert only call ordering, count, and receipt identity — never the success/revert semantics distinguishing the EOA path from the smart sibling.
- **Exploit/repro:** Set waitForTransactionReceipt.mockResolvedValueOnce({...mockReceipt, status:'reverted'}) for tx index 1 in sendBatch; current code returns the array with no error and no allowance reconciliation.
- **Recommendation:** Add a unit test injecting a status:'reverted' receipt for the 2nd of 3 batch txs and asserting the correct behavior (today: documents it wrongly resolves success; after the F021 fix: that sendBatch rejects). Separately, an Anvil e2e adversarial case: 2-leg approve+deposit where leg 2 reverts on-chain, asserting residual ERC20.allowance(owner,spender)==0.
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** F021
- **Dedup status:** new

### F212 (NEW) — smart-wallet send/sendBatch never assert receipt.success (only deploy does)
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:261-294
- **Severity:** high
- **Class:** correctness
- **Title:** Smart-wallet user-facing send/sendBatch never assert receipt.success; only the deploy path (createWallet) checks it, and NO test covers a success:false UserOp receipt on the send path
- **Detail:** send and sendBatch return bundlerClient.waitForUserOperationReceipt verbatim with no check of receipt.success. The only success:false assertion in the suite (DefaultSmartWallet.spec.ts:640) is on the deployment path. So a UserOp that lands on-chain but reverts internally (success:false) is reported by send()/sendBatch() as a successful send to every wallet-signing namespace dispatch. The namespaces then denormalize quote.positionAfter onto the receipt (refines:F054) on a reverted UserOp. No unit test returns a success:false receipt from send/sendBatch.
- **Exploit/repro:** Mock waitForUserOperationReceipt to resolve {success:false, receipt:{...}}; send() returns it with no throw, so lend/borrow/swap dispatch treats the reverted action as completed.
- **Recommendation:** Either (a) make send/sendBatch throw on receipt.success===false to match the deploy contract, or (b) document the asymmetry; either way add a unit test mocking a {success:false} receipt and asserting the chosen contract. The e2e must include a smart-wallet UserOp that reverts and assert the SDK does not report it as success.
- **suggestRefactor:** false
- **Candidate issue:** #474
- **Relates to prior finding:** F021
- **Dedup status:** new

### F213 (NEW) — attribution-suffix callData test asserts the encoder against itself
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/__tests__/DefaultSmartWallet.spec.ts:181,254-255
- **Severity:** medium
- **Class:** correctness
- **Title:** Attribution-suffix callData test asserts the encoder against itself (concatHex on both sides) with no independent decode of the resulting UserOp callData
- **Detail:** send/sendBatch append a 16-byte attribution suffix via appendAttributionSuffix. The test asserts sendUserOperation was called with callData: concatHex([data, attributionSuffix]) — it recomputes the expected value with the exact same concatHex the implementation uses, so it can never catch a mis-encoding. Nothing decodes the suffixed callData through the executeBatch ABI to confirm the calls array still decodes to the exact (to,value,data) tuples or that the trailing 16 bytes are inert to a strict-decoding bundler/account. Wallet-core analog of swap F153. Because the suffix is appended raw to ABI-encoded data, only a real bundler+account on Anvil proves it does not corrupt execution.
- **Exploit/repro:** The concatHex-on-both-sides assertion cannot distinguish a correct suffix from one that mutates the inner call.
- **Recommendation:** Add a differential assertion: decodeFunctionData(executeBatch ABI, callData-without-suffix) and assert the decoded calls equal the input transactionData exactly. In the e2e, submit a suffixed UserOp to a real bundler/Anvil and assert on-chain effects match the unsuffixed intent.
- **suggestRefactor:** true
- **Candidate issue:** #373
- **Relates to prior finding:** F153
- **Dedup status:** new

### F214 (NEW) — executeTransactionBatch routing tested only against a stubbed wallet
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/utils/__tests__/executeTransactionBatch.spec.ts:17-41
- **Severity:** medium
- **Class:** correctness
- **Title:** executeTransactionBatch dispatcher tested only against a fully-stubbed wallet ({send,sendBatch} vi.fn) - the single-vs-batch routing boundary is never verified against a real EOA/smart wallet, masking the receipt-shape divergence
- **Detail:** The dispatcher routes length===1 to wallet.send and length>1 to wallet.sendBatch. send returns a single receipt; sendBatch returns an array (EOA) or a single aggregated UserOp receipt (smart). The test stubs both as vi.fn returning sentinels, so the untagged union return type (F132) is never exercised with the divergent shapes a downstream namespace must shape-sniff (Array.isArray / 'userOpHash' in receipt). A regression where the EOA single-tx path is routed through sendBatch (or vice versa) — changing receipt shape from object to [object] — passes this test.
- **Exploit/repro:** Both send/sendBatch stubbed as vi.fn returning {kind:'single'}/{kind:'batch'} sentinels; the real divergent receipt shapes are never produced.
- **Recommendation:** Add a unit test using the real EOAWallet and DefaultSmartWallet mocks (already under __mocks__) asserting the concrete receipt shape for length 1 vs 2. In the e2e, run the same 2-tx batch through both an EOA and a smart wallet and assert the divergent receipt shapes.
- **suggestRefactor:** false
- **Candidate issue:** #337
- **Relates to prior finding:** F132
- **Dedup status:** new

### F215 (NEW) — isLocalAccount routing untested for the hosted-signer collision
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/namespace/WalletNamespace.ts:22-34,190-206
- **Severity:** medium
- **Class:** malicious-sign
- **Title:** isLocalAccount routing in toActionsWallet is untested for the hosted-signer collision: a Privy/Turnkey-derived signer is itself a type:'local' LocalAccount, so passing it routes to LocalWallet and silently bypasses the hosted provider
- **Detail:** toActionsWallet branches on isLocalAccount(params): if true it constructs LocalWallet; else it routes to the hosted provider. The guard returns true for anything with type==='local' + signMessage/signTransaction. But createSigner proves a hosted-wallet-backed signer has signer.type==='local'. So a caller who obtains a hosted signer via createSigner() and hands it to toActionsWallet() gets a LocalWallet wrapping the hosted signer rather than the hosted provider's wallet — a different wallet class and (for the F074 Privy address-divergence case) potentially a different reported address. No test covers passing a hosted-derived LocalAccount into toActionsWallet; all LocalAccount tests use privateKeyToAccount fixtures.
- **Exploit/repro:** Obtain a signer via createSigner(privyParams), pass it to toActionsWallet → LocalWallet-wrapped, not the hosted provider's wallet; no test exercises this.
- **Recommendation:** Add a unit test obtaining a signer via createSigner and passing it to toActionsWallet, asserting the resulting wallet.address/signer match the intended hosted account (and document whether LocalWallet-wrapping is intended). If hosted-signer-as-LocalAccount is misuse, isLocalAccount should reject hosted-backed signers.
- **suggestRefactor:** true
- **Candidate issue:** none
- **Relates to prior finding:** F074
- **Dedup status:** new

### F216 (NEW) — e2e harness blockers in shared test utils (fixed ports + Unichain-only USDC funding)
- **Surface:** wallet-core
- **File:** packages/sdk/src/utils/test.ts:74-105,116-438
- **Severity:** medium
- **Class:** infra
- **Title:** E2E harness blockers in shared test utils: startAnvilFork uses caller-passed FIXED ports (collide on parallel/CI reruns), and fundWallet hardcodes Unichain-only USDC + a single whale, so any non-Unichain signing e2e silently no-ops USDC funding
- **Detail:** startAnvilFork(forkUrl, port) takes a hardcoded port; the three network tests pass 18545/18546/18547 literally. Two suites on the same port (or a leftover anvil) collide with no retry/ephemeral fallback. fundWallet hardcodes usdcAddress='0x078d782b...' (Unichain USDC) and usdcWhale='0x5752e...'; the USDC funding path is wrapped in try/catch that only console.logs on failure, so a signing e2e on OP/Base that needs real USDC runs with ZERO USDC and produces false-green directional assertions. PR #348 'fixed-port collisions' + 'USDC-only whales' blocker.
- **Exploit/repro:** Run two network suites both passing 18547; the second anvil fails to bind. fundWallet on an OP fork: Unichain USDC has no code on OP → transfer reverts → caught → returns with 0 USDC.
- **Recommendation:** (1) make startAnvilFork allocate an ephemeral port and return it; (2) parameterize fundWallet USDC by chainId with a per-chain {usdc,whale} table and make funding failure THROW; (3) assert post-funding balanceOf == expected before exercising the signing path.
- **suggestRefactor:** true
- **Candidate issue:** #332
- **Relates to prior finding:** (none)
- **Dedup status:** new

### F217 (NEW) — the two network tests are read/quote-only with directional assertions; zero signing-path network coverage
- **Surface:** wallet-core
- **File:** packages/sdk/src/actions/swap/providers/velodrome/__tests__/VelodromeSwapProvider.network.test.ts:108-167
- **Severity:** medium
- **Class:** correctness
- **Title:** The only two network tests are read/quote-path only with directional-only assertions (amountOut > 0) and no independent output oracle; ZERO network coverage exists for any wallet-core signing/dispatch path
- **Detail:** The entire 'real-chain' coverage is two .network.test.ts files (Velodrome swap, Morpho borrow), both of which fork a chain and call getQuote/getMarket/getPosition — never send/sendBatch. Velodrome asserts amountOut.toBeGreaterThan(0) and amountOutMin < amountOut: directional sanity, no recomputation of expected output independent of the provider's own quote, no signed-execute step. Morpho's getMarket asserts maxLtv>0 && <1. Consequently the wallet-core hot paths (EOAWallet.send/sendBatch, DefaultSmartWallet.send/sendBatch, executeTransactionBatch, nonceManager sequencing) have no on-chain test of any kind; their correctness is asserted entirely against viem mocks. The central QA blind spot for the surface.
- **Exploit/repro:** No wallet-core method is invoked in either network test; correctness rests on viem mocks.
- **Recommendation:** The consolidated Anvil e2e MUST cover the wallet-core signing path end-to-end (build calldata → EOAWallet/DefaultSmartWallet sign → submit to Anvil → assert on-chain effect), with EXACT-amount assertions (recompute expected ERC20 balance delta independently of any quote.amountOut). Promote a shared fork harness so the divergent inline harnesses converge.
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** (none)
- **Dedup status:** new

### F218 (NEW) — two divergent inline fork-harness shapes; no shared harness for the e2e to build on
- **Surface:** wallet-core
- **File:** packages/sdk/src/actions/borrow/providers/morpho/__tests__/MorphoBorrowProvider.network.test.ts:104-117
- **Severity:** low
- **Class:** infra
- **Title:** Two divergent inline fork-harness shapes (createForkChainManager differs per file: 1-arg baseSepolia-hardcoded vs 2-arg chain-param), each redefining its own ChainManager stub - no shared harness for the e2e to build on
- **Detail:** MorphoBorrowProvider.network.test.ts defines createForkChainManager(rpcUrl) returning a stub with only getPublicClient+getSupportedChains, hardcoded to baseSepolia. VelodromeSwapProvider.network.test.ts defines a DIFFERENT createForkChainManager(rpcUrl, chain) taking the chain as a param. Neither uses a shared harness; each is a bespoke partial ChainManager cast via `as unknown as ChainManager`. A signing e2e needs getWalletClient/getBundlerClient/getTransportForChain too (none provided), so building on either harness means a third divergent stub. PR #348's 'two divergent harnesses' fix should consolidate these.
- **Exploit/repro:** The two createForkChainManager definitions have different signatures and method coverage; neither supports a signing client.
- **Recommendation:** Extract a single shared createForkChainManager(rpcUrl, chain, {bundler?}) into utils/test.ts wiring publicClient, walletClient, transport, and (for smart-wallet e2e) bundlerClient, and retrofit both existing network tests onto it.
- **suggestRefactor:** true
- **Candidate issue:** #332
- **Relates to prior finding:** (none)
- **Dedup status:** new

### F219 (NEW) — retryOnStaleRead final unconditional re-read path (F135) has no test
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/utils/__tests__/retryOnStaleRead.spec.ts:1-39
- **Severity:** low
- **Class:** correctness
- **Title:** retryOnStaleRead final unconditional re-read path (F135) has no test: an all-attempts-stale run does an extra read whose throw propagates instead of returning the stale value the doc implies
- **Detail:** retryOnStaleRead performs a final unwrapped `return await read()` after the retry loop. Per F135, if every attempt is stale and the final read throws, the throw propagates rather than returning the last stale value the JSDoc ('return whatever it is, stale or not') implies. The spec does not cover the all-stale-then-final-throw path. On the wallet hot path this is used for post-write onchain reads (findSignerIndexOnChain after addSigner); a flaky final read converts a recoverable stale-read into a hard throw with no test pinning the contract.
- **Exploit/repro:** No test makes read() return stale on every guarded attempt then throw on the final unguarded read.
- **Recommendation:** Add a test where read() returns stale on every guarded attempt and throws on the final unguarded read, pinning the intended contract (return last stale value vs propagate). Wrap the final read in the same try/catch if the doc'd behavior is to return stale.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Relates to prior finding:** F135
- **Dedup status:** new

### F220 (NEW) — nonceManager sequencing asserted only structurally, never against a real node
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:33-52
- **Severity:** low
- **Class:** correctness
- **Title:** nonceManager sequencing is asserted only structurally (mock checks createWalletClient args), never that back-to-back sends actually receive sequential nonces against a real node
- **Detail:** walletClient() attaches viem's nonceManager so back-to-back sends get sequential nonces without re-fetching pending count (the load-balanced-RPC race the JSDoc calls out). The test asserts only that the account passed to createWalletClient HAS a nonceManager with consume/increment/get/reset methods — never drives two real sends and asserts the on-chain nonces are n and n+1. sendBatch's correctness premise ('the wait does not need extra confirmations to guarantee nonce monotonicity') is unverified against any node. A regression that drops the nonceManager (or mis-shares one signer's manager across chains) passes the structural test but produces nonce collisions on a real RPC.
- **Exploit/repro:** EOAWallet.spec.ts:134-164 asserts only the nonceManager method shape, not on-chain nonce monotonicity.
- **Recommendation:** In the e2e, run EOAWallet.sendBatch of >=2 txs against Anvil and assert both land with consecutive nonces (no replacement) and both receipts are status:success.
- **suggestRefactor:** false
- **Candidate issue:** #456
- **Relates to prior finding:** (none)
- **Dedup status:** new

### F221 (NEW) — extractReceiptHashes degenerate [undefined]/empty-batch outputs (F133) untested
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/utils/extractReceiptHashes.ts:24-30
- **Severity:** low
- **Class:** correctness
- **Title:** extractReceiptHashes [undefined]/empty-batch degenerate outputs (F133) are surfaced to callers with no test asserting the malformed-receipt behavior
- **Detail:** extractReceiptHashes maps an empty EOA batch to {transactionHashes:[]} and a malformed receipt to [undefined] (F133). This helper feeds the user-facing receipt hashes that namespaces report back (swap/lend/borrow). No test pins the [undefined] / empty-array degenerate outputs, so a regression producing transactionHashes:[undefined] (a hash the user cannot look up) ships green. On a fund-moving action the user is told 'success' with an unusable hash.
- **Exploit/repro:** No test feeds an empty-batch or malformed receipt and asserts the output.
- **Recommendation:** Add unit tests for the empty-batch and malformed-receipt inputs asserting the intended contract (throw vs documented empty), and ensure the e2e's receipt-shape assertions confirm every reported transactionHash is a real, on-chain-resolvable hash.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Relates to prior finding:** F133
- **Dedup status:** new

### F222 (NEW) — deterministic CREATE2 address mocked on the send path (sharpens F171)
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/__tests__/DefaultSmartWallet.spec.ts:81-124
- **Severity:** low
- **Class:** correctness
- **Title:** Deterministic CREATE2 address and getCoinbaseSmartAccount are mocked (toCoinbaseSmartAccount vi.fn), so the funds-receiving undeployed address is never pinned to a real viem-derived golden vector (sharpens F171 for the send path)
- **Detail:** DefaultSmartWallet.spec.ts mocks viem/account-abstraction's toCoinbaseSmartAccount entirely and findSignerIndexOnChain. F171 already flags the missing golden-vector for the address; the send-path angle is that send/sendBatch call getCoinbaseSmartAccount(chainId) to derive the account whose address is the deterministic counterfactual deposit target, and that derivation is mocked away in every send test. So no test confirms the address the SDK tells a user to fund equals the address viem's real toCoinbaseSmartAccount('1.1') derives for the same owners+nonce. An in-range viem bump (F170) relocating the address ships green.
- **Exploit/repro:** toCoinbaseSmartAccount is a vi.fn; the real CREATE2 derivation never runs in any send test.
- **Recommendation:** Add a golden-vector unit test (real toCoinbaseSmartAccount, fixed owners+nonce, hardcoded expected address) and, in the e2e, fund the SDK-reported counterfactual address and assert the first UserOp deploys+executes at exactly that address.
- **suggestRefactor:** false
- **Candidate issue:** #131
- **Relates to prior finding:** F171
- **Dedup status:** new

### F223 (NEW) — consolidated e2e spec (wallet-core contribution)
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:261-294
- **Severity:** medium
- **Class:** info
- **Title:** CONSOLIDATED E2E SPEC (wallet-core contribution): the single Anvil feature-test must drive a real signed send/sendBatch through EOAWallet AND DefaultSmartWallet with exact-amount on-chain assertions and three adversarial cases
- **Detail:** Wallet-core slice of the ONE consolidated e2e (PR #348 + required fixes). CAPABILITY BOUNDARIES: (1) EOAWallet.send (single) and sendBatch (multi, sequential nonceManager) on OP mainnet fork with a real Privy/Turnkey/Dynamic signer; (2) DefaultSmartWallet.send/sendBatch via a real bundler against the funded counterfactual address; (3) executeTransactionBatch routing length 1→send vs 2→sendBatch, asserting the divergent receipt shapes. EXACT-AMOUNT ASSERTIONS: pre/post ERC20.balanceOf(recipient) delta == the exact amount, recomputed INDEPENDENTLY of any quote.amountOut; reverted UserOp asserted success:false-not-reported-as-success; EOA batch tx nonces == n, n+1. ADVERSARIAL: (a) recipient-in-bytes — 2-leg approve+transfer with the recipient encoded in calldata; decode the on-chain log and assert funds went to the intended recipient (ties to swap #444/#436); (b) residual allowance — mid-batch revert after a max-mode approval, assert allowance(owner,spender)==0 (F021); (c) quote-aging — sign calldata from a stale quote/deadline and assert the on-chain revert is surfaced (F097). The attribution-suffixed UserOp callData must be submitted to a real account/bundler to prove the 16-byte suffix is inert (independent oracle for the F153-style self-assertion).
- **Exploit/repro:** Directional/mocked tests cannot catch a reverted UserOp reported as success, a recipient-in-bytes leak, a residual max allowance, or a stale-quote revert; only real signed execution falsifies them.
- **Recommendation:** Author ONE network/e2e test (gated by EXTERNAL_TEST + real creds) on the shared consolidated fork harness, OP-only, USDC-as-the-only-token, covering the boundaries/assertions/adversarial cases. Prereqs: ephemeral ports, per-chain USDC/whale table with loud funding failure, single shared createForkChainManager wiring walletClient+bundlerClient.
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** (none)
- **Dedup status:** new

### F224 (NEW) — DefaultSmartWallet.spec attribution-suffix initCode assertion also self-referential (suffix on initCode leg)
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/__tests__/DefaultSmartWallet.spec.ts:254-255
- **Severity:** low
- **Class:** correctness
- **Title:** The sendBatch initCode+suffix assertion (callData/initCode concatHex(...)) is the second self-referential locus of F213, covering the deployment-op suffix leg with no decode
- **Detail:** Distinct locus from F213 (the send-path callData suffix). At spec lines 254-255 the sendBatch deployment case asserts both callData and initCode equal concatHex(...) recomputed with the implementation's own concatHex, so the F063/F059 concern (suffix appended to initCode, absent on EntryPoint v0.7) is never decoded or proven inert on the deployment leg. Filed separately because the fix adds an initCode-specific decode/inert assertion the send-path fix (F213) does not cover.
- **Exploit/repro:** The initCode concatHex-on-both-sides assertion cannot distinguish a correct deployment-leg suffix from one corrupting the factory createAccount bytes.
- **Recommendation:** Decode the pre-suffix initCode independently and assert the factory call is unchanged; in the e2e, deploy via a suffixed initCode and assert the deployed account is at the expected counterfactual address with the suffix strictly trailing.
- **suggestRefactor:** false
- **Candidate issue:** #373
- **Relates to prior finding:** F153
- **Dedup status:** new

---

## Surface: wallet-hosted

### F225 (NEW) — Dynamic createSigner raw-digest sign() closure never executed by any test (toAccount mocked)
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/react/wallets/hosted/dynamic/utils/__tests__/createSigner.spec.ts:52,60-67
- **Severity:** high
- **Class:** malicious-sign
- **Title:** Dynamic createSigner test mocks toAccount, so the hand-rolled raw-digest sign() closure (the most adversarial code in the surface) is never executed by any test
- **Detail:** createSigner.ts builds a viem account whose `sign` field is a hand-rolled closure that strips an optional '0x' prefix from the 32-byte digest and routes it to connector.signRawMessage — a DIFFERENT backend than signMessage/signTransaction/signTypedData (which use walletClient). This is the exact code that signs EIP-712 / Permit2 digests, the highest-risk path in the hosted surface (F030, F062). The spec mocks toAccount, so the closure passed into toAccount is captured-but-never-invoked, and the assertion deliberately checks signMessage/signTransaction/signTypedData and pointedly omits the `sign` field. The hex-stripping branch, the cross-backend divergence, and whether signRawMessage returns a valid recoverable signature for walletClient.account.address have NO behavioral coverage.
- **Exploit/repro:** Comment out the `.slice(2)` in createSigner.ts line 31 and run the dynamic createSigner spec — it still passes because the closure is never called.
- **Recommendation:** Add a unit test that does NOT mock toAccount: stub connector.signRawMessage with a deterministic local key, call signer.sign({hash}), and assert recoverAddress({hash, signature}) === walletClient.account.address. Add a case with and without the '0x' prefix. Full recovery coverage belongs in the consolidated Anvil e2e using a real Dynamic WaaS credential.
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** F030
- **Dedup status:** new

### F226 (NEW) — Privy createSigner/toActionsWallet address tests assert the mock against itself (F029/F074 divergence)
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/node/providers/hosted/privy/__tests__/PrivyHostedWalletProvider.spec.ts:120-141
- **Severity:** medium
- **Class:** malicious-sign
- **Title:** Privy createSigner/toActionsWallet address tests assert the mock against itself; structurally cannot catch the caller-address vs walletId-signing-key divergence (F029/F074)
- **Detail:** PrivyWallet reports this.address = params.address (caller input) and never reconciles it with the key the Privy walletId actually signs with (F029, F074-refines). The tests that should catch this run against createMockPrivyClient, an empty stub holding only appId/appSecret with NO ability to resolve a walletId to a real key. The real createViemAccount just echoes back whatever address was passed, so the assertion `signer.address === hostedWallet.address` is a tautology. The test named 'correct address' can never fail when address and walletId disagree — precisely the F029/F074 fund-safety bug.
- **Exploit/repro:** Pass address: getRandomAddress() while keeping walletId: hostedWallet.id; the createSigner test still passes — proving it asserts nothing about signer identity.
- **Recommendation:** Closable only with a real Privy credential. Route to the consolidated Anvil e2e: construct PrivyWallet with the correct walletId but a DELIBERATELY WRONG address, then assert construction rejects or recoverMessageAddress(signer.signMessage(...)) !== the wrong address. Until then, mark the unit assertion as non-load-bearing in a comment.
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** F029
- **Dedup status:** new

### F227 (NEW) — Turnkey ethereumAddress shortcut asserted only as forwarded-to-mock (F031)
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/node/wallets/hosted/turnkey/utils/__tests__/createSigner.spec.ts:53-76
- **Severity:** medium
- **Class:** malicious-sign
- **Title:** Turnkey ethereumAddress shortcut is asserted only as forwarded-to-mock; no test that a caller-supplied ethereumAddress is reconciled against the signWith key (F031, F031-refines)
- **Detail:** createSigner.ts forwards a caller-supplied ethereumAddress straight into createAccount; the docstring states the address is used directly without the API round-trip that would confirm it matches signWith (F031, F031-refines). The spec mocks @turnkey/viem's createAccount entirely and the 'should pass ethereumAddress when provided' test only asserts createAccount was called with that ethereumAddress and signer === mockLocalAccount. It never signs, never derives an address from signWith, so it cannot detect an ethereumAddress that does not belong to the signing key. The shortcut that bypasses the address-fetch is exactly the unverified path; the only test of it confirms the bypass works rather than that it is safe.
- **Exploit/repro:** The 'should pass ethereumAddress' test would still pass if ethereumAddress were the attacker's address, because createAccount is a mock returning a fixed mockLocalAccount.
- **Recommendation:** Cover in the consolidated Anvil e2e with a real Turnkey org/key: pass a WRONG ethereumAddress alongside the correct signWith, sign a message, assert recoverMessageAddress(sig) equals the key's real address. Add a no-ethereumAddress case confirming the API-fetched address round-trips. The unit spec should also exercise the signWith-only path.
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** F031
- **Dedup status:** new

### F228 (NEW) — registry validateOptions tests pin only client-truthiness, locking in the no-op-guard contract (F033)
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/node/providers/hosted/registry/__tests__/NodeHostedWalletProviderRegistry.spec.ts:76-88
- **Severity:** low
- **Class:** malicious-sign
- **Title:** Registry validateOptions tests pin only the client-truthiness check; the signing-key selectors (organizationId/signWith/ethereumAddress) are never asserted as validated, locking in the no-op-guard contract (F033, F033-refines)
- **Detail:** NodeHostedWalletProviderRegistry validates Turnkey options by Boolean(o?.client) only — organizationId/signWith/ethereumAddress bypass the only validation choke point (F033, F033-refines). The registry spec asserts {client} passes and {} fails, codifying the no-op: a test asserting an empty signWith with a present client STILL passes would document the hole, but no such test exists. Privy is the same shape (only privyClient truthiness). Because the positive case is satisfied by client-presence alone, any future tightening is not required by the tests, so the gap is permanently green.
- **Exploit/repro:** factory.validateOptions({client: mockTurnkeyClient, signWith: ''}) returns true; no test covers it.
- **Recommendation:** Add explicit registry tests asserting current behavior with a TODO comment: validateOptions({client, signWith: ''}) currently returns true (documents the F033 hole). When the guard is tightened, flip these to expect false.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Relates to prior finding:** F033
- **Dedup status:** new

### F229 (NEW) — React Privy createSigner never recovers a signer from a Permit2/EIP-712 signature through the CustomSource cast (F073)
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/react/wallets/hosted/privy/utils/__tests__/createSigner.spec.ts:16-20,57-63
- **Severity:** low
- **Class:** malicious-sign
- **Title:** React Privy createSigner mocks toAccount and asserts signTypedData was forwarded, but never recovers a signer from a Permit2/EIP-712 signature through the CustomSource cast (F073)
- **Detail:** createSigner.ts casts the Privy vendor signTypedData to CustomSource['signTypedData'] on the EIP-712/Permit2 seam (F073, F073-refines). The spec mocks toAccount and toViemAccount, so the cast is never exercised against a real typed-data payload — the test only asserts the four sign* fields were passed through. There is no assertion that a signature produced by the cast signTypedData recovers to address for a real Permit2 EIP-712 struct, the only thing proving the structural mismatch the cast papers over is benign.
- **Exploit/repro:** All four sign* fields in the react Privy spec are vi.fn() stubs; signTypedData is never invoked, so the cast is untested.
- **Recommendation:** Cover in the consolidated Anvil e2e: with a real Privy embedded wallet, sign a real Permit2 PermitTransferFrom typed-data struct and assert verifyTypedData({address: signer.address, ...domain/types/message, signature}) is true.
- **suggestRefactor:** false
- **Candidate issue:** #337
- **Relates to prior finding:** F073
- **Dedup status:** new

### F230 (NEW) — e2e spec (wallet-hosted slice): real-credential signer-identity + EIP-712/Permit2 recovery
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/node/wallets/hosted/privy/PrivyWallet.ts:22,36,48-50
- **Severity:** high
- **Class:** malicious-sign
- **Title:** CONSOLIDATED E2E SPEC — wallet-hosted slice: real-credential signer-identity + EIP-712/Permit2 recovery the mocked unit suite structurally cannot cover
- **Detail:** Every hosted-wallet test mocks the vendor signing primitive (createViemAccount, @turnkey/viem createAccount, toViemAccount, viem toAccount) and asserts either signer === mockSigner or signer.address === <the address fed into the mock>. There is ZERO recoverAddress/verifyMessage/verifyTypedData assertion anywhere in packages/sdk/src/wallet (grep-confirmed). PR #348 explicitly scopes out hosted-wallet conformance. This slice (built on #348's harness) must, with REAL Privy/Turnkey/Dynamic creds + Anvil-simulated signing on OP only / USDC-only whales: (1) SIGNER-IDENTITY BOUNDARY — for each provider assert recoverMessageAddress(wallet.signer.signMessage({message})) === wallet.address === wallet.signer.address (catches F029/F074, F031, F030/F062; TurnkeyWallet sets address-from-signer while PrivyWallet sets address-from-caller, so the two harnesses MUST diverge per #348). (2) ADVERSARIAL caller-address: construct Privy with correct walletId but a WRONG address and assert reject or never-report-wrong-address. (3) EXACT-AMOUNT on-chain leg: drive one real lend openPosition (USDC on OP, Aave) through each hosted signer and assert the post-state balance delta EQUALS the requested amount. (4) PERMIT2/EIP-712 recovery: sign a real Permit2 PermitTransferFrom struct through each provider's signTypedData and assert verifyTypedData (validates F073 + Dynamic raw-digest sign closure). (5) RESIDUAL-ALLOWANCE: after a max-mode approval whose action leg reverts, assert no infinite allowance is left dangling (inherited EOA-base sendBatch revert path, F021).
- **Exploit/repro:** grep -rE 'recoverAddress|verifyMessage|verifyTypedData' packages/sdk/src/wallet returns nothing; no hosted-wallet test recovers a signer from a real signature, so F029/F031/F030/F073/F074 all ship green.
- **Recommendation:** Add a hosted/ block to the consolidated Anvil e2e spec (#335 follow-up to #348). OP-only execution, USDC-only whales, one provider-parameterized describe with three real-cred fixtures gated on env vars (skip-with-warn locally, fail-fast in CI). Exact-amount assertions everywhere. Adversarial: wrong-caller-address (Privy), wrong-ethereumAddress (Turnkey), '0x'-prefixed-vs-bare digest (Dynamic), Permit2 recipient-in-witness, residual-allowance-after-revert. Do NOT file additional e2e tickets.
- **suggestRefactor:** true
- **Candidate issue:** #335
- **Relates to prior finding:** F074
- **Dedup status:** new

### F231 (NEW) — no hosted wallet has a signer-address self-test at construction (generic reconciliation seam, F074-refines)
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/node/wallets/hosted/privy/__tests__/PrivyWallet.spec.ts:1
- **Severity:** low
- **Class:** info
- **Title:** No hosted wallet has a signer-address self-test at construction; the generic reconciliation seam (F074-refines) is untested for every provider
- **Detail:** F074-refines notes EOAWallet.ts:44-52 — no hosted wallet performs a signer-address self-test, so reported .address vs actual signing key is never verified for any provider. This single shared seam, if tested, would catch F028/F029/Turnkey-gap at once. The PrivyWallet/TurnkeyWallet/DynamicWallet spec files contain no construction-time test that signs a probe and confirms recovery against the constructed .address. Because PrivyWallet uniquely sets address from caller input while the others derive it from signer.address, the absence of this seam test is what lets the F029 divergence persist. Unit-level companion to F230.
- **Exploit/repro:** No spec under packages/sdk/src/wallet/*/wallets/hosted/** signs a probe and recovers it against the constructed wallet address.
- **Recommendation:** Add a shared performInitialization invariant (or a test helper) that, given a mock signer wired to a known private key, asserts recoverMessageAddress(signer.signMessage({message: probe})) === this.address. For PrivyWallet, feed a mock createViemAccount that signs with key K but is handed address(K2) and assert construction fails. Full validation still requires the e2e.
- **suggestRefactor:** true
- **Candidate issue:** none
- **Relates to prior finding:** F074
- **Dedup status:** new

### F232 (NEW) — Privy createSigner address tautology against an empty mock client (locus-specific companion to F226)
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/node/providers/hosted/privy/__tests__/PrivyHostedWalletProvider.spec.ts:43-44
- **Severity:** low
- **Class:** malicious-sign
- **Title:** The toActionsWallet Privy address assertion is a second tautology locus: the empty MockPrivyClient cannot model walletId→key resolution so address-in equals address-out by construction
- **Detail:** Distinct locus from F226 (the createSigner test): at spec lines 43-44 the toActionsWallet test also asserts an address that the empty MockPrivyClient (holding only appId/appSecret) cannot have resolved from a walletId, so it is the same address-in-equals-address-out tautology applied to the toActionsWallet construction path. Filed separately because the fix (or the non-load-bearing annotation) lands on the toActionsWallet assertion, not the createSigner one.
- **Exploit/repro:** The toActionsWallet test passes regardless of whether the supplied address belongs to the walletId, because MockPrivyClient never resolves the key.
- **Recommendation:** Annotate the toActionsWallet address assertion as non-load-bearing and route real coverage to the e2e (F230) where a real Privy credential can model the walletId→key resolution.
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** F029
- **Dedup status:** new

---

## Surface: wallet-smart

### F233 (NEW) — entire 4337 signing/dispatch path is self-mocked (encoder-vs-itself, no oracle)
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/__tests__/DefaultSmartWallet.spec.ts:27-36,128-263
- **Severity:** high
- **Class:** correctness
- **Title:** Entire 4337 signing/dispatch path is self-mocked: toCoinbaseSmartAccount + bundler + findSignerIndexOnChain all stubbed, so send/sendBatch tests assert the encoder against itself with no independent oracle
- **Detail:** The spec vi.mocks viem/account-abstraction (toCoinbaseSmartAccount stub), uses MockChainManager's fake getBundlerClient whose prepare/send/waitForUserOperationReceipt are vi.fn() returning hand-rolled values, AND mocks findSignerIndexOnChain. The send/sendBatch tests only verify that whatever callData the mocked prepareUserOperation returned, after concatHex([data, suffix]), is passed back into the mocked sendUserOperation. Nothing verifies the signed bytes are a valid execute/executeBatch calldata, that the owner set/index handed to toCoinbaseSmartAccount authorizes that op on-chain, or that the userOp lands and the inner call succeeds. The mocked receipt is {success:true} regardless. A regression that mis-encodes owner bytes, picks the wrong ownerIndex, or corrupts the signed calldata passes green. The funds-moving primitive has no execution coverage.
- **Exploit/repro:** Change getCoinbaseSmartAccount to pass ownerIndex: 0 unconditionally (an F023-class regression). Every test still passes because the index only flows into the mocked toCoinbaseSmartAccount.
- **Recommendation:** Covered by the consolidated e2e (F242). Interim independent-oracle check without a bundler: a unit test that does NOT mock toCoinbaseSmartAccount asserting account.encodeCalls([tx]) (real viem) produces a calldata whose decodeFunctionData(...).functionName === 'execute' and whose decoded args equal the to/value/data the caller passed.
- **suggestRefactor:** true
- **Candidate issue:** #335
- **Relates to prior finding:** F171
- **Dedup status:** new

### F234 (NEW) — addSigner/removeSigner tests cannot fail on the stale owner-set bug (F087) or only-owner brick (F039)
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/__tests__/DefaultSmartWallet.spec.ts:265-354,435-511
- **Severity:** medium
- **Class:** correctness
- **Title:** addSigner/removeSigner tests cannot fail on the stale in-memory owner-set bug (F087) or the only-owner-removal brick (F039): both sendBatch and findSignerIndexOnChain are spied/mocked, so post-rotation signing state is never asserted
- **Detail:** Every owner-rotation test spies wallet.sendBatch to return {success:true} and mocks findSignerIndexOnChain, asserting only the encoded calldata and the returned index. They never assert what F087 is about: after a successful addSigner/removeSigner, this.signers/this.signerIndex/this._address are NOT refreshed, so the next getCoinbaseSmartAccount signs against a stale owner set. A test that, after addSigner, called getCoinbaseSmartAccount and asserted the new owner appears in the owners/ownerIndex passed to toCoinbaseSmartAccount would fail today. No test exercises the only-owner removeSigner path (F039) — removeOwnerAtIndex is always encoded with no ownerCount>1 guard, and the LastOwner-revert path is unreachable because sendBatch is stubbed to succeed.
- **Exploit/repro:** F087: addSigner succeeds onchain, then the same wallet object signs the next userOp with the pre-rotation owner array and is bundler-rejected. No test observes the post-rotation signing state.
- **Recommendation:** Add tests that (a) after a mocked-successful addSigner/removeSigner, assert the subsequent getCoinbaseSmartAccount reflects the rotated owner set/index (red test or xit referencing the issue until F087 is fixed), and (b) cover removeSigner when the wallet has a single owner. Drive real rotation end-to-end in the e2e against a deployed wallet.
- **suggestRefactor:** true
- **Candidate issue:** #163
- **Relates to prior finding:** F087
- **Dedup status:** new

### F235 (NEW) — findSignerIndexOnChain test comments mislabel nextOwnerIndex as ownerCount
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/utils/__tests__/findSignerIndexOnChain.spec.ts:20-22,45-48
- **Severity:** low
- **Class:** correctness
- **Title:** findSignerIndexOnChain test comments mislabel nextOwnerIndex as 'ownerCount'; a regression to ownerCount-based iteration (which skips live owners in high slots after a removal) would still pass the suite
- **Detail:** The production code reads nextOwnerIndex (monotonic, never decremented on removal) and iterates high→low. The test labels the first mocked return '// ownerCount' and mixes '// ownerCount' and '// nextOwnerIndex' comments. None construct the load-bearing scenario distinguishing the two: an owner removed from a LOW slot leaving a live owner in a HIGH slot, where ownerCount < nextOwnerIndex. With the current mocks ownerCount === nextOwnerIndex always, so a future 'cleanup' refactor swapping nextOwnerIndex for ownerCount would skip the live high-slot owner and return -1 — and every test still passes. Returning the wrong/-1 index drives removeSigner to revert or remove the wrong live owner (F039/F107).
- **Exploit/repro:** Replace functionName: 'nextOwnerIndex' with 'ownerCount' in findSignerIndexOnChain.ts; the whole spec stays green because every fixture sets ownerCount==nextOwnerIndex with no removal-induced gap.
- **Recommendation:** Add a test where nextOwnerIndex (e.g. 5) exceeds the count of non-empty slots, with the target owner in a high slot above several deleted slots; assert it is found at its absolute slot. Fix the misleading '// ownerCount' comments.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Relates to prior finding:** F107
- **Dedup status:** new

### F236 (NEW) — attribution-suffix tests assert concatHex against concatHex; F063/F065 left invisible (smart-wallet locus)
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/__tests__/DefaultSmartWallet.spec.ts:178-185,251-258,533-554
- **Severity:** medium
- **Class:** correctness
- **Title:** Attribution-suffix tests assert concatHex against concatHex (no independent decode); no test proves the suffixed callData/initCode is still a tolerable trailing-bytes form for the EntryPoint, leaving F063/F065 invisible
- **Detail:** The send/sendBatch tests assert callData === concatHex([data, suffix]) — recomputing the production expression, not an independent oracle. The suffix-validation tests (533-554) correctly cover the constructor's 16-byte check, but nothing covers F063: the suffix is appended to the SIGNED execute/executeBatch calldata and (for sendBatch) to initCode, with no test that the resulting bytes still decode as a valid call the EntryPoint/account accepts as trailing data, nor that a v1.1 (EntryPoint v0.7) op even has the initCode field the code conditionally suffixes (F059). Because the bundler is mocked, the suffixed bytes are never submitted, so a suffix that breaks decoding ships green. This is the smart-wallet-locus framing (distinct from the wallet-core send-path F213/F224 framings, which sit in the wallet-core surface block).
- **Exploit/repro:** A suffix chosen to be a valid ABI tail (extending an execute(...) arg) would not be caught: the mocked sendUserOperation accepts any bytes and the receipt is hard-coded success.
- **Recommendation:** In the e2e, dispatch a real userOp WITH a 16-byte suffix and assert (1) acceptance + inner execution (exact-amount delta), and (2) the on-chain tx input ends with the exact suffix bytes (a non-inert suffix decoding to extra calldata must be rejected). At the unit layer, decode the pre-suffix callData independently to assert the base call is unchanged.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Relates to prior finding:** F063
- **Dedup status:** new

### F237 (NEW) — no test recomputes the deterministic CREATE2 wallet address from an independent oracle (funds-receiving address)
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/__tests__/DefaultSmartWallet.spec.ts:68-96,98-126
- **Severity:** medium
- **Class:** fund-loss
- **Title:** No test recomputes the deterministic CREATE2 wallet address from an independent oracle; the suite compares the address to a mocked readContract return and to viem-internal output, so an owner-bytes/recipient mis-derivation that relocates the funds-receiving counterfactual address ships green
- **Detail:** The undeployed smart wallet address is the address users send funds to BEFORE deployment. getAddress derives it via the factory's getAddress(signerBytes, nonce) and the deployed instance via viem's toCoinbaseSmartAccount. The tests mock readContract to return a random address then assert the wallet returns that same mock (a tautology), and only assert the args passed to the mocked toCoinbaseSmartAccount. Neither pins the real CREATE2 output for a fixed (owners, nonce) to a known constant (F171's golden-vector gap), and neither asserts that the factory-path getAddress and the viem-path address AGREE. If _signerBytes/formatPublicKey (F108) mis-formats an owner, the two derivation paths can diverge and the counterfactual address users funded differs from the address the wallet later deploys/operates at — a direct fund-loss vector with no coverage.
- **Exploit/repro:** A formatPublicKey change padding a 64-byte WebAuthn key differently relocates the address; current tests only compare to the same path's own mocked output.
- **Recommendation:** Add a golden-vector test pinning getAddress output to a known constant for fixed owners+nonce (F171), AND a cross-check asserting factory-getAddress equals the real toCoinbaseSmartAccount(...).address for the same inputs. In the e2e, deploy at the counterfactual address and assert the deployed code lives exactly there.
- **suggestRefactor:** true
- **Candidate issue:** #131
- **Relates to prior finding:** F171
- **Dedup status:** new

### F238 (NEW) — send/sendBatch have no negative test for a reverted-but-mined userOp (F034 contract unverified)
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/__tests__/DefaultSmartWallet.spec.ts:162-169,236-242
- **Severity:** medium
- **Class:** correctness
- **Title:** send/sendBatch success-path tests hard-code receipt.success=true; there is no negative test for a reverted-but-mined userOp (receipt.success=false), so the F034 'revert reported as success' contract is unverified for the main dispatch methods
- **Detail:** The deploy() suite correctly tests receipt.success === false → throws (640-668). But send/sendBatch — the primary value-moving methods — only have happy-path tests with mockWaitForUserOperationReceipt = {success:true}. There is no test asserting what send/sendBatch do when the inner call reverts but the userOp mines. F034 says send/sendBatch do NOT inspect receipt.success at all; the asymmetry with deploy (which does) is exactly the cross-method contract gap a test should pin. Today a caller of send for a token approval+action that reverts mid-way gets a returned receipt and no thrown error — and no test encodes whether that is intended.
- **Exploit/repro:** A reverted lend/borrow userOp mined by the bundler returns receipt.success=false; send() returns it as a normal result and no existing assertion notices.
- **Recommendation:** Add send/sendBatch tests with a mocked receipt {success:false} asserting the current behavior (returns receipt vs throws). Makes the F034 decision explicit and regression-proof; if the fix is to throw like deploy, the test flips.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Relates to prior finding:** F034
- **Dedup status:** new

### F239 (NEW) — findSignerInArray has no test for malformed/non-address owner (F090) or WebAuthn-only set (F064)
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/utils/__tests__/findSignerInArray.spec.ts:9-68
- **Severity:** low
- **Class:** correctness
- **Title:** findSignerInArray suite has no test for a malformed/non-address owner entry (F090: getAddress throws inside findIndex) nor for a WebAuthn-only owner set (F064: returns -1, constructor throws); both un-handled paths are untested
- **Detail:** findSignerInArray calls getAddress() inside findIndex, which throws InvalidAddressError on a malformed signers[] entry instead of returning -1 (F090), and silently returns -1 for WebAuthn-only owner arrays so legitimate passkey wallets cannot be constructed (F064). The spec covers only well-formed EOA arrays and a single mixed EOA+WebAuthn case. There is no test feeding a malformed string owner or constructing a passkey-only wallet. These are the exact inputs that break wallet construction, and the absence of tests is why F064/F090 persist unflagged.
- **Exploit/repro:** Pass signers: ['0xnot-an-address', validLocal.address]; findSignerInArray throws InvalidAddressError from inside findIndex before the -1 path — no test covers it.
- **Recommendation:** Add tests: (1) a signers array with a non-address string → pin whether it throws (current) or returns -1 (desired per F090); (2) a WebAuthn-only signers array with the matching local signer absent → document that construction fails today (F064).
- **suggestRefactor:** false
- **Candidate issue:** #163
- **Relates to prior finding:** F090
- **Dedup status:** new

### F240 (NEW) — sendTokens has no unit test at all in the smart-wallet suite (F035/F036/F041)
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/__tests__/DefaultSmartWallet.spec.ts:512-561
- **Severity:** low
- **Class:** fund-loss
- **Title:** sendTokens has no unit test at all in the smart-wallet suite (recipient validation + amount precision, F035/F036/F041): the poisoned-recipient and NaN/scientific-notation amount paths are entirely uncovered
- **Detail:** DefaultSmartWallet.sendTokens builds a signed ERC20 transfer / native value transfer, validates recipient only for falsiness (not isAddress, F035) and amount only for <=0 (not NaN/non-finite, F036), and takes a JS number that parseUnits can render as scientific notation (F041). The spec has NO test exercising sendTokens — it is the one fund-moving builder on this class with zero coverage. A poisoned recipient or a float-precision amount flows straight into signed transfer calldata with nothing in the suite to catch a regression that weakens (or a fix that should strengthen) the guards.
- **Exploit/repro:** sendTokens(0.0000001, usdc, chain, recipient) with an 18-decimal asset: number.toString() can emit '1e-7', and there is no test asserting parseAssetAmount handles it; an address-poisoning recipient passes the falsy-only check.
- **Recommendation:** Add sendTokens tests: (1) native + ERC20 happy path asserting decoded transfer args equal the parsed amount and recipient; (2) recipient that is valid-length-but-not-isAddress → pin the reject behavior (F035); (3) amount = NaN / 1e-7 / a scientific-notation value → assert reject / correct parseUnits output (F036/F041).
- **suggestRefactor:** false
- **Candidate issue:** #379
- **Relates to prior finding:** F035
- **Dedup status:** new

### F241 (NEW) — e2e spec (smart-wallet leg): 4337 deploy + execute + owner-rotation + suffix with adversarial cases
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:196-294,310-422,456-500
- **Severity:** high
- **Class:** correctness
- **Title:** E2E-SPEC CONTRIBUTION: smart-wallet capability boundary for the single consolidated Anvil feature-test (4337 deploy + execute + owner-rotation + suffix), with exact-amount and adversarial cases
- **Detail:** Smart-wallet leg of the ONE consolidated e2e (#335 / PR #348 chassis). The smart-wallet path is the ONLY SDK surface with zero on-chain coverage and requires bundler+paymaster infra (open question 23), so it is a distinct capability boundary inside the single spec. COVER ONCE (not the full wallet x chain x fn product): (1) counterfactual deploy — derive address from real factory getAddress, fund it, call deploy() via a real bundler on an Anvil-forked OP chain, assert deployed code lives at exactly the pre-derived address; (2) execute one funded action via send() through a real bundler+paymaster and assert receipt.success AND an EXACT-AMOUNT balance delta recomputed independently of any quote; (3) executeBatch via sendBatch with two calls, assert both inner effects atomically; (4) one full owner-rotation: addSigner(newEOA) → reload owners on-chain via findSignerIndexOnChain → sign a subsequent op WITH THE NEW SIGNER (the only way to catch F087's stale in-memory owner set) → removeSigner(oldEOA) and assert the removed key can no longer sign. ADVERSARIAL: (a) recipient-in-bytes — dispatch with a 16-byte attribution suffix and assert it is strictly trailing/inert; (b) residual-allowance — a max-mode approval+action batch where the action reverts must NOT leave an infinite allowance reported as success (smart sibling of EOA F021); (c) only-owner removeSigner must revert/guard (F039) not brick the wallet; (d) wrong-ownerIndex op must be bundler-rejected (F023). INFRA: OP-only execution, USDC-only whale funding plus ETH+token funding of the counterfactual address before deploy, fixed-port collisions, bundler+paymaster sandbox (multi-day build) gates this leg.
- **Exploit/repro:** Without this leg, every smart-wallet fund-loss vector (F023 wrong-index, F034 revert-as-success, F063 suffix-on-signed-bytes, F087 stale owners, F108 owner-bytes mis-format) is only covered by mocked tests that assert the encoder against itself.
- **Recommendation:** Author as the smart-wallet section of the single consolidated e2e ticket (do not split). Prerequisite: a local/sandbox ERC-4337 bundler + paymaster against the Anvil fork. Exact-amount assertions must derive expected deltas independently. The owner-rotation case is load-bearing — it is the ONLY test catching F087 and must sign-with-the-new-key after rotation.
- **suggestRefactor:** true
- **Candidate issue:** #335
- **Relates to prior finding:** F171
- **Dedup status:** new

### F242 (NEW) — interim independent-oracle decode for the 4337 execute callData (companion to F233)
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/__tests__/DefaultSmartWallet.spec.ts:128-263
- **Severity:** low
- **Class:** correctness
- **Title:** No interim (no-bundler) test decodes the executeBatch callData with the real Coinbase smart-account ABI to assert the inner (to,value,data) tuples, leaving F023/F108 owner-index/bytes derivation unanchored until the full e2e lands
- **Detail:** Distinct locus from F233 (which names the whole self-mocked path): this row captures the specific *interim unit-level* gap — there is no test using the real coinbaseSmartWalletAbi as an independent oracle to decodeFunctionData the suffixed callData back to the caller's (to,value,data) tuples. Such a test needs no bundler and would anchor the encode step (catching an executeBatch arg-order or owner-bytes regression) before the multi-day bundler+paymaster e2e (F241) is available. Filed separately because the fix is a cheap unit test, not the full e2e.
- **Exploit/repro:** n/a — coverage gap; no unit test decodes the executeBatch callData against an independent ABI.
- **Recommendation:** Add a unit test that does NOT mock toCoinbaseSmartAccount, encodes a 2-call batch, strips the 16-byte suffix, and decodeFunctionData(coinbaseSmartWalletAbi)s the result asserting the decoded calls equal the input tuples exactly.
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to prior finding:** F171
- **Dedup status:** new

---

## Surface: core-services

### F243 (NEW) — signing-path validators have zero unit tests; every known bypass ships green
- **Surface:** core-services
- **File:** packages/sdk/src/utils/__tests__/validation.test.ts:1-51
- **Severity:** high
- **Class:** malicious-sign
- **Title:** Signing-path validators (validateSlippage / validateRecipient / validateNotZeroAddress / validateAmountPositiveIfExists / validateQuoteNotExpired) have ZERO unit tests — every known bypass bug ships green
- **Detail:** validation.test.ts covers only resolveSupportedChainIds and validateWalletAddress. The validators carrying the heaviest prior fund-safety findings are completely untested: validateSlippage (F110 NaN bypass; refines:F110 no <=1 ceiling → NEGATIVE amountOutMinRaw), validateAmountPositiveIfExists (F111 NaN/+Infinity bypass), validateRecipient (F066 silent no-op on ENS/non-hex), validateNotZeroAddress (F076 lowercase-literal === ZERO_ADDRESS bypass), validateQuoteNotExpired and validateNotSameAsset (F006 symbol-only compare). grep confirms validateSlippage is referenced only by SwapProvider.ts (where it is mocked) — not one of these bypasses has a test that fails when the bug is present. The largest correctness blind spot on the surface: these are the last line before calldata is signed.
- **Exploit/repro:** Set maxSlippage=2, call validateSlippage(1.5, 2): passes today; downstream computeSlippageBounds returns a negative amountOutMinRaw, signing a swap with no min-out floor.
- **Recommendation:** Add a validation.test.ts block per validator: validateSlippage throws on NaN, negative, slippage>1; validateAmountPositiveIfExists throws on NaN and Infinity; validateNotZeroAddress rejects a mixed/upper-case zero via isAddressEqual; validateRecipient is documented/tested as a zero-only guard. Boundary-fuzz (fast-check) slippage and amount. Pure functions — no fork needed.
- **suggestRefactor:** false
- **Candidate issue:** #303
- **Relates to prior finding:** F110
- **Dedup status:** new

### F244 (NEW) — validation.test.ts has no coverage of the slippage/recipient/zero-address/amount validators (locus row for the test file)
- **Surface:** core-services
- **File:** packages/sdk/src/utils/__tests__/validation.test.ts:1-51
- **Severity:** high
- **Class:** correctness
- **Title:** The validation.test.ts file itself is the missing-coverage locus: it must grow per-validator blocks encoding the WHY each is a pre-sign guard (Rule 9)
- **Detail:** Companion locus to F243 (which frames the malicious-sign impact). This row pins the test FILE as the deliverable: validation.test.ts must gain explicit describe blocks for validateSlippage, validateAmountPositiveIfExists, validateRecipient, validateNotZeroAddress, validateQuoteNotExpired, validateNotSameAsset, each encoding intent (a test that cannot fail when the guard widens is wrong). Filed separately from F243 because F243 is the malicious-sign framing of the bypass mechanics and this is the correctness framing of the test-file structure; both fixes land in the same file but address different review axes (impact vs intent-encoding).
- **Exploit/repro:** validation.test.ts currently has exactly two describe blocks (resolveSupportedChainIds, validateWalletAddress); the six fund-safety validators have none.
- **Recommendation:** Structure validation.test.ts with one intent-encoding describe per validator; assert each invariant (range, finiteness, canonical-zero, expiry, same-asset by address) so a future widening fails CI.
- **suggestRefactor:** false
- **Candidate issue:** #373
- **Relates to prior finding:** F111
- **Dedup status:** new

### F245 (NEW) — approve.test.ts enshrines the F042 deficit-vs-set bug as intended behavior
- **Surface:** core-services
- **File:** packages/sdk/src/utils/__tests__/approve.test.ts:261-294
- **Severity:** medium
- **Class:** correctness
- **Title:** approve.test.ts enshrines the F042 deficit-vs-set ERC20 bug: asserts the approval tx exists but never its amount, locking in an under-approval
- **Detail:** buildApprovalTxIfNeeded approves the DEFICIT (amount-current) but ERC-20 approve() SETS the allowance rather than incrementing it. When a partial allowance pre-exists, the resulting tx sets the allowance to the deficit — LESS than required — so the subsequent transfer/swap reverts. The test ('returns approval tx for the deficit only') mocks allowance=300000n, required=500000n, and only asserts tx is defined and tx.to===TOKEN. It never decodes the calldata to assert the approved amount, so it cannot detect that 200000n (deficit) is set instead of 500000n (required). The test name treats the bug as intended behavior — worse than no test: it actively defends the broken path against fixes.
- **Exploit/repro:** Mock allowance=300000n, required=500000n; decode tx.data → approved amount is 200000n. A real ERC20.approve sets allowance to 200000n, then transferFrom(500000n) reverts.
- **Recommendation:** Decode the approval calldata and assert the encoded amount equals the REQUIRED amount (500000n), not the deficit. That assertion fails today and forces the F042 fix. Add a sibling test where a stale non-zero allowance must be overwritten.
- **suggestRefactor:** false
- **Candidate issue:** #133
- **Relates to prior finding:** F042
- **Dedup status:** new

### F246 (NEW) — assets.test.ts never exercises precision-loss / scientific-notation paths nor a formatAssetAmount round-trip
- **Surface:** core-services
- **File:** packages/sdk/src/utils/__tests__/assets.test.ts:33-54
- **Severity:** medium
- **Class:** correctness
- **Title:** assets.test.ts never exercises the precision-loss / scientific-notation paths (F041) nor a formatAssetAmount round-trip (refines:F041)
- **Detail:** parseAssetAmount/parseDecimalAmount tests only use clean small values (100, 1, 0.5). The danger paths are untested: (a) parseDecimalAmount feeds number.toString() to parseUnits, so a large amount (>=1e21) or tiny amount (<1e-6) produces scientific notation that throws InvalidDecimalNumberError (F041); (b) high-magnitude numbers lose precision before toString() corrupts the signed bigint (refines:F041, high/fund-loss on the lend path which lacks an amountRaw escape hatch); (c) formatAssetAmount round-trips a bigint through parseFloat (lossy for >2^53 base units, breaks on negative via padStart) with NO test. There is no parse→format→parse identity test anywhere.
- **Exploit/repro:** parseDecimalAmount(1e21, 18) → (1e21).toString() === '1e+21' → parseUnits throws InvalidDecimalNumberError. No test exercises this.
- **Recommendation:** Add tests feeding parseDecimalAmount a 1e21 and a 1e-7 value (assert the current throw, documenting F041, then flip to correctness once fixed); a formatAssetAmount round-trip for a 30-digit base-unit amount and a negative amount; a fast-check property asserting formatAssetAmount(parseDecimalAmount(x,d),d) is a faithful inverse.
- **suggestRefactor:** false
- **Candidate issue:** #379
- **Relates to prior finding:** F041
- **Dedup status:** new

### F247 (NEW) — the only swap network test is directional-only and never decodes the recipient (core-services lens)
- **Surface:** core-services
- **File:** packages/sdk/src/actions/swap/providers/velodrome/__tests__/VelodromeSwapProvider.network.test.ts:131-167,262-291
- **Severity:** high
- **Class:** correctness
- **Title:** The only swap network test is directional-only: it never EXECUTES the swap on-chain, never recomputes expected amountOut independently, and never decodes calldata to verify the recipient
- **Detail:** Every assertion is non-load-bearing: amountOut/amountOutRaw/price use toBeGreaterThan(0); swapCalldata uses toMatch(/^0x/). The 'execute(quote)' test only checks tx.transactionData.swap.data === quote.execution.swapCalldata (encoder against itself) and copies amountIn/price back — it never sends the tx, never asserts a balance delta, and never independently recomputes the pool output. It passes recipient 0x..dEaD into getQuote but never decodes the calldata to confirm dEaD is the encoded recipient — exactly the F075/F054/#444 recipient-in-bytes class (Velodrome universal router silently ignoring the user recipient). amountOutMin is only asserted toBeLessThan(amountOut), never equal to a recomputed (1-slippage)*amountOut. This test cannot distinguish a correct encoder from one routing funds to the wrong recipient. (Core-services lens framing; the swap-surface framing is F177/F179/F183.)
- **Exploit/repro:** Pass recipient 0x..dEaD to getQuote; the test asserts swapCalldata matches /^0x/ but never decodes it, so a build dropping/overwriting the recipient (#444) ships green.
- **Recommendation:** Promote to exact-amount executing assertions in the consolidated e2e: recompute expected amountOut independently of quote.amountOut (pool getAmountsOut), execute the swap through TestEOAWallet and assert the recipient's assetOut balance increased by >= amountOutMinRaw and the wallet's assetIn decreased by exactly amountInRaw, decodeFunctionData and assert the encoded recipient === the recipient passed to getQuote, assert amountOutMinRaw === recomputed floor.
- **suggestRefactor:** false
- **Candidate issue:** #444
- **Relates to prior finding:** F075
- **Dedup status:** new

### F248 (NEW) — Morpho borrow network test self-consistent decode, never executes (core-services lens)
- **Surface:** core-services
- **File:** packages/sdk/src/actions/borrow/providers/morpho/__tests__/MorphoBorrowProvider.network.test.ts:181-260
- **Severity:** medium
- **Class:** correctness
- **Title:** Morpho borrow network test asserts ranges/encoder-self-consistency, never executes the open bundle, and decodes the borrow calldata against the same SDK abi it was encoded with
- **Detail:** getMarket assertions are directional (maxLtv toBeGreaterThan(0)/toBeLessThan(1), borrowApy>=0). openPosition asserts the bundle has 3 txs and decodes each with blueAbi to check functionName, but never asserts the borrow leg's encoded amount equals parseAssetAmount(borrowAmount), never asserts onBehalf/receiver === walletAddress (F086 signer-must-equal-onBehalf), and never executes the bundle to verify the wallet receives borrowAmount and collateral is debited. decodeFunctionData against blueAbi is the same abi used to encode, so the round-trip proves nothing about arg correctness. The test runs against baseSepolia and self-skips when deployments.json is unpopulated. (Core-services lens; borrow-surface framing is F206/F208.)
- **Exploit/repro:** openPosition encodes borrow with the SDK's blue.ts, then the test decodes with the same blueAbi and checks only functionName — an amount/onBehalf encoding error is invisible.
- **Recommendation:** In the e2e, execute the open bundle on an OP-mainnet fork against a real Morpho market, fund collateral via whale impersonation, and assert: borrow leg decoded amount === borrowAmountRaw; onBehalf===receiver===wallet; post-execution loan-token balance += exactly borrowAmountRaw and collateral -= collateralAmountRaw; getPosition returns a healthFactor consistent with the supplied LTV.
- **suggestRefactor:** false
- **Candidate issue:** #334
- **Relates to prior finding:** F086
- **Dedup status:** new

### F249 (NEW) — shared Anvil funding helper silently swallows USDC-funding failure (dead-on-arrival)
- **Surface:** core-services
- **File:** packages/sdk/src/utils/test.ts:323-392
- **Severity:** high
- **Class:** infra
- **Title:** Shared Anvil funding helper silently swallows USDC-funding failure (dead-on-arrival), so a lend/swap e2e that depends on funded USDC passes vacuously
- **Detail:** fundWallet wraps the whole USDC whale-impersonation transfer in try/catch and on failure only console.log('Failed to fund USDC ... This may cause lending tests to fail') and RETURNS NORMALLY. Any downstream test asserting a balance increase either fails with a confusing 'expected 1000 got 0' or, with directional/optional assertions, passes with zero funded — dead-on-arrival. The exact silent-no-op pattern PR #348 must fix. Compounding bugs: (a) the whale 0x5752e57Dcf... is a mainnet-shaped address but usdcAddress 0x078d782b... is a Unichain token — a chain mismatch guaranteeing the transfer reverts off-mainnet; (b) BigInt(parseFloat(usdcAmount)*1e6) truncates via JS float and breaks for large/high-precision amounts (should be parseUnits(usdcAmount,6)); (c) funderClient is cast `as any`, defeating type-checking on the signing client.
- **Exploit/repro:** fundWallet({fundUsdc:true}) on an OP fork: whale holds no balance for the Unichain-USDC contract → transfer reverts → caught → returns; wallet has 0 USDC; a lend-open e2e then errors opaquely or, with directional assertions, passes.
- **Recommendation:** In the consolidated harness: make funding failures THROW not log; assert post-funding balance equals the requested amount before any test body runs; pin whale addresses per-chain (a USDC whale map keyed by chainId, OP-first); replace parseFloat(...)*1e6 with parseUnits(amount,6); drop the `as any`.
- **suggestRefactor:** true
- **Candidate issue:** #335
- **Relates to prior finding:** (none)
- **Dedup status:** new

### F250 (NEW) — fixed Anvil ports collide and the readiness probe accepts any HTTP 200
- **Surface:** core-services
- **File:** packages/sdk/src/utils/test.ts:74-105
- **Severity:** medium
- **Class:** infra
- **Title:** Hardcoded fixed Anvil ports (18545/18546/18547) collide across parallel network suites, and the readiness probe accepts any HTTP 200 (including JSON-RPC error bodies) as 'ready'
- **Detail:** startAnvilFork takes a caller-supplied fixed port; the network tests hardcode 18545/18546 (Velodrome) and 18547 (Morpho) — and the swap suite also touches 18547 in one path, so running the network project with any parallelism produces a port collision and one fork silently attaches to the other's chain (or fails to bind). Separately the readiness loop returns ready as soon as res.ok (HTTP 200) — Anvil/proxies can return 200 with a JSON-RPC error or an unforked node, so the probe can declare a misconfigured fork ready, after which tests run against wrong/empty state. It never validates the forked chainId matches the test client's configured chain (a wrong-chain signing hazard).
- **Exploit/repro:** Morpho and Velodrome both call startAnvilFork(rpc, 18547); run pnpm test:network and the second bind fails or attaches to the first fork's process, cross-contaminating chain state.
- **Recommendation:** Allocate an ephemeral free port per fork (port 0 / get-port) and return it; never hardcode. Strengthen readiness to parse the JSON-RPC response and require a numeric result, then assert eth_chainId === the expected fork chainId. Add a harness-level assertion that the fork's chainId matches the ChainManager chain the wallet uses.
- **suggestRefactor:** true
- **Candidate issue:** #332
- **Relates to prior finding:** F095
- **Dedup status:** new

### F251 (NEW) — ChainManager.spec fully mocked; duplicate-chain test name lies; bundler chain binding unverified
- **Surface:** core-services
- **File:** packages/sdk/src/services/__tests__/ChainManager.spec.ts:97-105,190-296
- **Severity:** low
- **Class:** infra
- **Title:** ChainManager.spec is fully viem-mocked; the duplicate-chain test name lies about the assertion, and the bundler client is never verified to bind the requested chainId/EntryPoint
- **Detail:** createPublicClient, fallback, http, createBundlerClient, createPimlicoClient, createSmartAccountClient are all mocked, so no test verifies a real client resolves the right chain/transport. Two defects: (1) 'should throw error if multiple chains configured with the same chain ID' asserts the message 'is not supported' — but the duplicate-detection path throws ChainNotSupportedError with the duplicate's keys; the test passes for the wrong reason and would still pass if duplicate detection were removed (violates Rule 9). (2) getBundlerClient tests assert the mock return and the args object, but never that the returned client is bound to a chainId/EntryPoint matching the request (refines:F045) — the userOp-signing client's chain binding is unverified.
- **Exploit/repro:** Delete the duplicate-detection branch in createPublicClients: the test still passes (the second config just isn't 'supported').
- **Recommendation:** Split the duplicate-chain test from the unsupported-chain test and assert a distinct duplicate-specific signal so removing duplicate detection fails. For bundler binding, add a fork/integration test asserting the returned client's chain.id === requested chainId and its EntryPoint matches the account's.
- **suggestRefactor:** false
- **Candidate issue:** #82
- **Relates to prior finding:** F045
- **Dedup status:** new

### F252 (NEW) — serializeBigInt tests miss the documented data-loss cases and the type-signature lie
- **Surface:** core-services
- **File:** packages/sdk/src/utils/__tests__/serializers.test.ts:1-53
- **Severity:** low
- **Class:** correctness
- **Title:** serializeBigInt tests do not cover the documented data-loss cases (Map/Set/Date/undefined drop) nor the type-signature lie on the serialization boundary
- **Detail:** serializeBigInt's JSDoc claims it 'preserves the input type signature' but at runtime bigint fields become strings (F044) — the return type T lies, and a CLI/HTTP caller treating the result as still-bigint mis-handles amounts. The suite only covers bigint→string and nested recursion; it never asserts the JSON.stringify-semantics losses (Date→ISO string, Map/Set→{} silently, undefined dropped) that can erase amount-bearing fields on the boundary used for CLI stdout and HTTP responses. No test pins that a balance object with an undefined optional amount survives, nor that a Map of per-chain balances is not flattened to {}.
- **Exploit/repro:** serializeBigInt({when:new Date(), perChain:new Map([[10,1n]])}) → {when:'2026-...', perChain:{}} — the per-chain balances vanish; no test catches this.
- **Recommendation:** Add tests asserting the actual lossy behavior (Date→string, Map/Set→{}, undefined dropped) so it is intentional, and add a guard/throw if Map/Set loss is unacceptable for amount-bearing payloads. If the type-lie matters, change the return type to a DeepReplace<T,bigint,string> mapped type.
- **suggestRefactor:** true
- **Candidate issue:** #419
- **Relates to prior finding:** F044
- **Dedup status:** new

### F253 (NEW) — tokenBalance suite fully MockChainManager-driven; no fork test verifies real ERC20 decimals/aggregation
- **Surface:** core-services
- **File:** packages/sdk/src/services/__tests__/tokenBalance.spec.ts:29-143
- **Severity:** low
- **Class:** info
- **Title:** tokenBalance suite is fully MockChainManager-driven with a constant defaultBalance; no fork test verifies real ERC20 decimals/aggregation, so a wrong-decimals or multicall-shape bug is invisible
- **Detail:** Every assertion uses MockChainManager's fixed defaultBalance (1000000n), so totalBalance/balanceRaw are tautological with the mock. The human-readable derivation (totalBalance:1 for 1e6 USDC) is asserted against the mock's own decimals, never against a real token where a decimals mismatch (treating 18-dec as 6-dec) would mis-scale a displayed balance and mislead amount entry. There is no fork test reading a real USDC balance for a known whale and asserting the exact human amount, and no test for cross-chain aggregation summing correctly when chains return different raw balances.
- **Exploit/repro:** Mock returns 1000000n for both USDC(6) and a mislabeled 18-dec token; the test passes with wrong decimals because the human amount is computed from the same mocked metadata.
- **Recommendation:** Add one fork-backed test (folded into the e2e spec) that funds a wallet with an exact known USDC amount via whale impersonation and asserts fetchERC20Balance returns exactly that human amount AND raw amount, with decimals read from the real token. Add a multi-chain case asserting totalBalanceRaw equals the sum of per-chain raw balances.
- **suggestRefactor:** false
- **Candidate issue:** #452
- **Relates to prior finding:** (none)
- **Dedup status:** new

### F254 (NEW) — consolidated e2e Anvil spec (core-services synthesis)
- **Surface:** core-services
- **File:** packages/sdk/src/utils/test.ts:1-438
- **Severity:** high
- **Class:** infra
- **Title:** CONSOLIDATED E2E ANVIL SPEC: single OP-mainnet fork feature-test exercising real-cred signing with exact-amount + adversarial assertions, replacing the directional network tests
- **Detail:** Core-services synthesis of the ONE e2e spec (building on PR #348 with required fixes). CAPABILITY BOUNDARIES: (1) real Privy/Turnkey/Dynamic creds drive an EOAWallet/hosted wallet whose .address is self-tested against an Anvil-recovered signer before any signing (closes refines:F074); (2) OP-mainnet-only execution, USDC-as-input via a per-chain pinned USDC whale (not the current chain-mismatched single whale); (3) fork harness uses ephemeral ports, JSON-RPC-validated readiness, and a fork-chainId===wallet-chain assertion. EXACT-AMOUNT ASSERTIONS: swap recomputes expected amountOut INDEPENDENTLY of quote.amountOut (pool getAmountsOut) and asserts amountOutRaw matches; executes and asserts recipient assetOut balance += >=amountOutMinRaw and wallet assetIn -= exactly amountInRaw; asserts amountOutMinRaw === recomputed floor. Lend/borrow: execute open, assert wallet loan-token += exactly borrowAmountRaw, collateral -= collateralAmountRaw, getPosition healthFactor non-null. ADVERSARIAL: (a) recipient-in-bytes — decode the signed swap calldata and assert the encoded recipient === the recipient passed to getQuote (#444/F054); (b) residual allowance — pre-set a partial Permit2/ERC20 allowance, run open, assert the final allowance >= required (F042/F053); (c) quote-aging — advance Anvil time past expiresAt and assert execute() throws QuoteExpiredError (the only validateQuoteNotExpired coverage). DIVERGENT HARNESSES: keep provider-read and namespace-execution as two harnesses with minimal overlap, but BOTH assert exact amounts.
- **Exploit/repro:** The quote-aging case alone: use anvil evm_increaseTime past quote.expiresAt then call wallet.swap(quote) — must throw QuoteExpiredError; today no test exercises validateQuoteNotExpired.
- **Recommendation:** Author as the single consolidated #335 e2e ticket spec, not many tickets. Mandate: every on-chain assertion is exact-amount with an oracle computed independently of the SDK's own quote/encoder; the three adversarial cases are required test bodies; the harness fixes (throw-on-funding-failure, per-chain whale map, ephemeral ports, chainId-validated readiness, no `as any`) are preconditions; hosted-wallet conformance runs a signer self-test before signing; CI fails fast when RPC creds are missing.
- **suggestRefactor:** true
- **Candidate issue:** #335
- **Relates to prior finding:** F075
- **Dedup status:** new

### F255 (NEW) — no snapshot guard on the public export surface (safety-bearing symbols can drop with green CI)
- **Surface:** core-services
- **File:** packages/sdk/src/__tests__/index.exports.spec.ts:1-27
- **Severity:** low
- **Class:** infra
- **Title:** No snapshot guard on the public export surface means a refactor can silently drop a safety-bearing error/validator symbol with green CI
- **Detail:** index.ts re-exports ~141 symbols (two wildcard export * of the error modules, F148) but the export-surface guard pins only ~4 (F147). Combined with the validator/error coverage gaps (F243/F244), a rename or accidental removal of a signing-path symbol (an error class consumers instanceof-check, or a validator) ships green. The ENS errors already drift outside ActionsError (F150) with no guard catching it. The meta-gap: even when the validators get unit tests, nothing pins that they remain exported under their documented names.
- **Exploit/repro:** Remove a wildcard-exported error class from core/error/errors.ts: typecheck passes, the 4-symbol guard passes, consumers' instanceof checks break at runtime with no CI signal.
- **Recommendation:** Add a snapshot test over Object.keys of the node and react barrels (sorted) so any add/remove/rename forces an explicit review diff. Pair it with an assertion that every exported *Error extends ActionsError (catches F150).
- **suggestRefactor:** false
- **Candidate issue:** #483
- **Relates to prior finding:** F147
- **Dedup status:** new

### F256 (NEW) — assets formatAssetAmount has no test at all (round-trip-inverse locus, companion to F246)
- **Surface:** core-services
- **File:** packages/sdk/src/utils/assets.ts:44-55
- **Severity:** low
- **Class:** correctness
- **Title:** formatAssetAmount (the human-readable inverse of parseDecimalAmount) has zero direct test coverage, so its parseFloat lossiness and negative-input padStart break ship green
- **Detail:** Distinct locus from F246 (which frames the parse-side scientific-notation gap): formatAssetAmount itself — the function that turns a signed bigint back into a human amount via parseFloat (lossy for >2^53 base units) and padStart (breaks on a negative/fractional signed string) — has NO direct test. It is the display inverse every action's receipt/balance presentation relies on, and refines:F041 already flags it is not a faithful inverse of parseDecimalAmount. Filed separately because the fix is a formatAssetAmount-specific test (and possible reimplementation), not the parse-side test in F246.
- **Exploit/repro:** formatAssetAmount(-1n, 18) hits padStart on a signed fractional string; formatAssetAmount of a >2^53 base-unit balance loses precision via parseFloat — no test exercises either.
- **Recommendation:** Add direct formatAssetAmount tests: a >2^53 base-unit amount (assert exact human string, not a parseFloat-rounded one), a negative amount (pin the intended behavior), and a parse→format→parse identity property via fast-check.
- **suggestRefactor:** false
- **Candidate issue:** #379
- **Relates to prior finding:** F041
- **Dedup status:** new

---

## Dedup notes

All 80 incoming findings are filed as NEW. None duplicates or refines an existing ledger row, by the dedup rule (file + nearby line + same root cause):

- **The prior rows F001–F176 are logic-bug loci** (the bug lives at a *source* line). Pass-9 findings are **test-coverage / harness / spec loci** (the gap lives at a *test-file*, the shared *harness*, or the *e2e spec*). The fix for a pass-9 finding lands in a different file from the bug it relates to, so it is a distinct root cause even when it shares a `relatesToPriorFinding`.
- Where two pass-9 findings touch the same source line from different review lenses (e.g. the swap network test framed for the swap surface in F177/F179/F183 and for the core-services lens in F247; the Morpho borrow network test in F206/F208 vs F248; the harness in F194/F195/F216/F249/F250), each is kept as a separate row because it names a distinct test-file assertion to add or a distinct harness defect to fix; they are cross-referenced in their details rather than merged.
- The seven consolidated-e2e-spec contributions (F188 swap, F200 lend, F210 borrow, F223 wallet-core, F230 wallet-hosted, F241 wallet-smart, F254 core-services) are the per-surface slices of the ONE consolidated Anvil feature-test. They are filed as findings (not merged) so each surface's capability boundary, exact-amount assertions, and adversarial cases are recorded, but all recommend folding into the single #335 ticket — not separate per-case e2e tickets.
