# Review Pass 10 — Adversarial Verification + Completeness

**Pass:** 10
**Skill / lens:** adversarial re-verification of the high/critical findings (each load-bearing claim re-checked against source; severity recalibrated against the standing scope rules) plus a fresh completeness sweep for gaps the prior passes missed.
**Surfaces:** swap, lend, borrow, wallet-core, wallet-hosted, wallet-smart, core-services

## Summary

This pass took the high/critical findings the prior passes filed and tried to break each one: re-tracing every cited line, confirming reachability through the documented public API, and testing whether the assigned severity survives the standing scope rules (DeFi codebase; the bar is *user loses funds* or *signs a malicious/unintended tx*; test-coverage/spec items inherit but do not double-count the severity of the logic bug they mask). The dominant correction is **severity deflation on test-coverage / e2e-spec rows**: several Pass-9 coverage findings were filed at the severity of the fund-loss bug they fail to catch, but a missing test cannot itself move funds, so they refine down to medium/low while the underlying logic bug keeps its own (separately-tracked) high. Two findings were demoted outright as false positives.

The live logic bugs largely held. The pre-built-quote verbatim-signing cluster (F054 borrow, F070 swap) is confirmed high/malicious-sign on re-trace; the receipt-status silent-success cluster (F020 EOA, F034 smart, plus the new systemic F212) is confirmed; the recipient-misrouting cluster (F046 Uniswap V4 TAKE_ALL, F247 swap-test gap) is confirmed. Several high/fund-loss rows were re-classed to medium/low correctness once the on-chain reality was traced: F046's misdelivery is to the user's own wallet (kept high on broken-promise grounds, with a recorded dissent), F047's native-in defect is testnet-only and revert-with-refund, and the lend/borrow amount-finiteness umbrella throws before signing rather than corrupting calldata.

**Incoming:** 49 verdicts on high/critical findings (covering 25 distinct finding IDs, several verified by multiple reviewers).
**Outcome:** 12 confirmed, 2 demoted, 35 refined (severity adjusted, row kept). 5 novel completeness findings appended (F257–F261). NEXT_ID advanced to F262.

**Verdict counts:**
- confirmed (verified): 12 row-verdicts
- demoted (false positive): 2 (F082, F071) plus F225 (completeness-pass demotion)
- refined (severity/class changed): 35 row-verdicts

---

## Verification verdicts

Every verdict, the corrected severity, and one-line reasoning. "Confirmed" = `verified` in the ledger; "Refined" = `refines:self` with the Severity cell updated; "Demoted" = `demoted`.

| ID | Verdict | Corrected sev | One-line reasoning |
|----|---------|---------------|--------------------|
| F177 | confirmed | high | Execute fork test asserts `tx.data === quote.swapCalldata` (tautology) and never broadcasts/reads recipient balance; the one execute() case is pure self-comparison masking confirmed fund-loss F046. |
| F178 | refined | medium | Fork tests run only OP/Base (v2); universal/V4 buggy paths uncovered — real coverage gap, but fund-loss is owned by F003/F046/F047, so the test-gap is medium not high. |
| F180 | confirmed | high | encodeUniversalRouterSwap V4 tests check only action-code bytes, never decode TAKE_ALL recipient; the F046 misrouting bug provably regresses green. |
| F181 | refined | low | Universal-router encoder test omits the recipient assertion its v2 sibling has, but the masked bug (F003) is medium/correctness with funds going to the wallet — a pure test-gap inherits low. |
| F188 | refined | medium | Consolidated-e2e swap spec (Class:info); real and important, but fund-loss is wholly owned by F046/F047/F004 — rating the spec artifact high double-counts. |
| F189 | refined | medium | Morpho deposit/withdraw calldata never decoded (MetaMorphoAction mocked to literal hex); production path is correct, so it is a test-coverage + caret-dep regression gap, not a live malicious-sign. |
| F190 | confirmed | high | No decode of signed lend calldata anywhere; the onBehalfOf/to native-ETH recipient args are the highest-blast-radius fields with zero coverage and a proven sibling convention (borrow write.spec decodes). |
| F191 | refined | medium | Info-class "no lend fork test exists" umbrella; the concrete risks are pinned by medium/low siblings (F192/F193/F196/F197), so the parent should not outrank them. |
| F200 | refined | low | Class:info lend e2e-spec deliverable, n/a exploit; teeth are in independently-filed F189–F199; structurally identical wallet-core spec F223 is medium, so high is internally inconsistent. |
| F203 | refined | medium | Borrow dispatch is a correct thin send-wrapper; this is test-coverage of already-correct code (signing vulns owned by F054/F082/F084), so medium not standalone-high. |
| F210 | refined | medium | E2E-test-spec slice for the borrow surface; the actual validation gap is already filed high as F054 — "add an e2e that proves F054" is medium. |
| F211 | refined | low | EOA sendBatch has no real-execution coverage of the F021 residual-allowance hazard; a missing test cannot move funds, so fund-loss is mislabeled — it is low test-debt. |
| F212 | refined | medium | Smart send/sendBatch never assert receipt.success (siblings do); real silent-revert bug reachable via all 3 namespaces, but harm is mislabeled-correctness not fund-loss; systemic with EOA F020. |
| F225 | demoted | — | False positive: DynamicWallet.spec.ts:81 already invokes the sign() closure and asserts the 0x-trim + cross-backend routing; the "never executed" premise is wrong. |
| F230 | refined | low | Wallet-hosted e2e-spec; signing routes by walletId not caller address (a wrong address only misreports, never wrong-key-signs), so no reachable malicious-sign; aligns with unit companion F231 (low). |
| F233 | refined | medium | 4337 path self-mocked is real, but the headline repro (ownerIndex:0 regression) IS caught by an existing test; umbrella whose remediation is owned by F241/F242. |
| F241 | confirmed | high | E2E-spec for the smart-wallet leg; the ONLY on-chain coverage of the sole SDK fund-moving surface with zero execution coverage, and the only gate on confirmed-high F087/F023/F063. |
| F243 | refined | medium | Signing-path validators have zero unit tests, but the bypass impact is owned by F110/F111/F066/F076; a pure test-coverage row is medium/correctness, not high/malicious-sign. |
| F244 | refined | medium | Structural twin of F243 (same file/line); strongest concrete bug (negative min-out) is config-gated and other bypasses are weak/vacuous, so medium. |
| F247 | confirmed | high | Only swap network test is directional-only, never executes, never decodes recipient out of swapCalldata; load-bearing against the reachable F046/F003/#444 misrouting class. |
| F249 | refined | low | fundWallet/setupSupersimTest are dead code (zero callers, not exported); the documented "e2e passes vacuously" harm cannot occur today — dead-code hygiene, not high infra. |
| F254 | refined | low | Consolidated-e2e infra spec on test-only `utils/test.ts` (not exported, no production reach); validators already present and partly tested; high overstates a harness improvement. |
| F142 | refined | medium | SmartWalletDeploymentError genuinely unexported (real public-API gap) but runtime data is still readable via plain property access — type-level/DX limitation; aligns sibling F143 (medium). |
| F082 | demoted | — | False positive: DefaultSmartWallet address is provably chain-invariant (single factory/owners/nonce/version); the recipient guard already compares the exact per-chain executing account. |
| F087 | refined | low | Real in-memory owner-set staleness, but the index-shift / owner-array-affects-signature premise is wrong (monotonic indices; deployed path signs correctly) — narrow counterfactual/hygiene. |
| F103 | refined | medium | Aave marketId↔reserve bind genuinely missing (Morpho sibling enforces it), but the malformed data is trusted developer allowlist config, not an attacker runtime arg; sibling F104 is low. |
| F029 | confirmed (verified) | medium | Node Privy address never reconciled with walletId (sibling React derives from signer) — real missing-invariant, but reachable only via integrator misconfig, so medium stands. |
| F020 | confirmed | high | EOAWallet.send returns a reverted receipt as success; viem resolves (not throws) for mined-but-reverted; smart sibling already throws — missing obvious status check across lend/swap/borrow. |
| F021 | confirmed | high | sendBatch continues after a mid-batch revert; residual allowance + false-success, reversible/conditional but broad blast radius keeps high. (dissent: a second reviewer argued medium/correctness given the exact-mode default.) |
| F034 | confirmed | high | Smart send/sendBatch ignore receipt.success while addSigner/removeSigner/deploy check it; silent-success across all 3 namespaces with a one-line precedented fix (two reviewers concur). |
| F008 | confirmed | high | openPosition skips validateMarketAsset that closePosition runs; residual max-allowance to vault on the unintended token + Aave native-leg ETH misdirection sustains high; Morpho deposit-revert keeps short of critical. |
| F046 | confirmed | high | V4 recipient param dropped, TAKE_ALL credits msg.sender, reachable via raw-params execute() with no recipient==wallet guard; kept high on broken-promise + signed + no-error. (dissent: medium since misdelivery is to user's own wallet.) |
| F047 | refined | medium | Universal/CL native-in has no native branch but quote sets msg.value=amountIn; real, but reachable only on Base Sepolia (mainnet hubs are v2) and the dominant outcome is revert-with-refund. |
| F054 | confirmed | high | Pre-built BorrowQuote dispatch validates only metadata, signs execution.transactions verbatim; a malicious approve(attacker,max) leg passes all four guards (three reviewers concur). |
| F039 | confirmed | high | removeSigner has no ownerCount>1 / not-self guard; the load-bearing harm is remove-only-key lockout (loss-of-access); LastOwner brick is contract-prevented; self-inflicted single call so high not critical. |
| F070 | confirmed | high | Pre-built SwapQuote dispatch signs routerAddress/swapCalldata/value verbatim; requireQuoteForThisWallet checks only recipient (a different field); full wallet drain via public wallet.swap.execute(quote). |
| F071 | demoted | — | False positive / out-of-scope: exported lend provider methods hold no signer (return unsigned calldata) and WalletLendNamespace forces walletAddress after params (no override); reconcile-vs-signer is the F074 seam. |
| F072 | refined | medium | executeTransactionBatch is the shared choke point, but only the borrow leg has a verbatim-quote dispatch (owned high by F054); swap re-derives, lend has no caller calldata; fix-here is infeasible (no context). |
| F074 | refined | medium | Node PrivyWallet sets address from caller input while 3 siblings derive from signer; real, but trigger is a self-inflicted inconsistent (walletId,address) pair, no external-attacker primitive. |
| F075 | refined | low | Underlying gap real but filed at the error-CLASS definition (not defective code); the exploitable consumers are already filed high as F070 + F054 — counting it independently triple-counts. |
| F001 | refined | medium | getQuote skips blocklist/slippage validation, but execute() re-runs validateSwapExecute on a passed-back quote so bad quotes cannot reach signing via execute(); residual is manual-calldata-extraction defense-in-depth. |
| F023 | confirmed/refined | medium | getCoinbaseSmartAccount signs with the in-memory ownerIndex never reconciled on-chain (send path, unlike addSigner/removeSigner); a wrong slot only fails validation (recoverable UserOp rejection), so medium. |
| refines:F008 (positivity umbrella) | refined | low | NaN/Infinity throw in parseUnits and negative bigint throws in encodeAbiParameters before signing; worst reachable is an opaque throw or a no-op zero tx — no fund-loss. |
| refines:F041 | refined | medium | parseDecimalAmount IEEE-754 loss is real and the lend path is number-only, but it is bounded to low-order sig digits (sub-ppm), no sign flip, no attacker amplification. |
| refines:F037 (×2) | refined | low | viem re-prepares over the SUFFIXED callData, so the signed op is internally self-consistent and the first uo is never surfaced/signed; reduces to the original wasted-double-prepare (low). |
| refines:F061 (smart umbrella) | refined | medium | In-scope defense-in-depth floor (isAddress/zero/neg) but that floor does not stop the headline poisoned-look-alike exploit; raw escape hatch whose `to` is caller-chosen; aligns EOA/sendTokens siblings (medium). |
| refines:F046 | confirmed | high | V4 TAKE_ALL no-recipient verified alongside base F046. |
| refines:F047 | refined | medium | Velodrome native-in value=amountIn verified, refined to medium alongside base F047 (testnet-only, revert-with-refund). |
| refines:F054 | confirmed | high | Verbatim borrow-quote dispatch concrete exploit verified alongside base F054. |
| refines:F074 | refined | medium | Node-PrivyWallet caller-address divergence verified, refined to medium (self-inflicted integration error). |
| refines:F039 | confirmed | high | removeSigner remove-only-key lockout verified at high. |

---

## Summary of demotions and severity changes

### Demotions (false positives, row kept and marked `demoted` so ticket synthesis can drop them)

- **F082** (borrow recipient-vs-chain reconciliation, was high/malicious-sign). The central premise — that a smart wallet's address can diverge per chain so the recipient guard checks the wrong account — is structurally impossible. DefaultSmartWallet's CREATE2 address is `f(factory, salt(owners,nonce), initCodeHash(version))` and every input is a single chain-independent in-memory field (one hardcoded factory, one `signers` array, one nonce, version literal `'1.1'`); the code comment at DefaultSmartWallet.ts:576 states the factory is the same across chains. `getAddress()` and `getCoinbaseSmartAccount(chainId)` consume identical inputs, so the guard already compares against the exact account that is msg.sender on any chain. The only residual is an RPC-trust concern (the cached address is read from one chain), which is explicitly out of scope.

- **F071** (exported lend provider verbatim recipient encoding, was high/malicious-sign). Out of scope for a high malicious-sign finding: the exported `LendProvider.openPosition/closePosition` hold no signer and only RETURN unsigned calldata — there is no dispatch and no signer to reconcile against. On the only SDK-owned signing path, `WalletLendNamespace` forces `walletAddress: this.wallet.address` spread AFTER `...params`, so a caller cannot override it. The reconcile-vs-signer demand is the F074 seam (a generic hardening note), not the borrow F054 opaque-quote-dispatch case. Demoted to a low/info residue.

- **F225** (Dynamic createSigner sign() closure "never executed by any test", was high/malicious-sign). Demoted during the completeness/verification sweep: the load-bearing claim is false. `DynamicWallet.spec.ts:81` extracts the `sign` closure from the captured `toAccount` args, invokes it with `{hash:'0xdeadbeef'}` and `{hash:'cafebabe'}`, and asserts the routed `signRawMessage` message is `'deadbeef'` / `'cafebabe'` (both the strip and no-strip branches) plus cross-backend routing. The mutation repro was falsified statically. The only genuinely-uncovered aspect (full signature recovery) is already owned by F230.

### Severity refinements (row kept, Severity cell + class adjusted, marked `refines:self`)

The dominant pattern is **test-coverage / e2e-spec rows inheriting the severity of the logic bug they mask**. A missing test cannot itself move funds, so these refine down while the underlying bug keeps its own high:

- **High → medium (test-coverage / e2e-spec / config-integrity):** F178, F188, F189, F191, F203, F210, F212, F233, F243, F244, F142, F103, F072.
- **High → low (info-class spec / dead-code harness / error-class locus / hygiene):** F181, F200, F211, F230, F249, F254, F087, F075.
- **High/fund-loss → medium/correctness (live bug, impact over-stated):** F047 + refines:F047 (testnet-only, revert-with-refund), refines:F041 (sub-ppm bounded loss), refines:F074 (self-inflicted).
- **High/fund-loss → low/correctness (live bug, no reachable fund-loss):** refines:F008 positivity umbrella (throws before signing), refines:F008 Aave native-branch (routes to user's own aWETH).
- **High → medium (recoverable / no value moved):** F023 cluster (UserOp rejected at validation), refines:F061 smart umbrella (defense-in-depth floor), F029/F074 (integrator misconfig).
- **High → low (no fund/sign impact):** refines:F037 ×2 (signed op self-consistent; original wasted-prepare).
- **High → medium (live execute-gated public API):** F001 (execute() re-gates passed-back quotes).

### Confirmed at high (held on re-trace)

F177, F180, F190, F241, F247 (test/spec rows whose load-bearing assertion masks a confirmed fund-loss on the fund-moving path and which carry the consistent calibration of the cohort), and the live logic bugs F008, F020, F021, F034, F039, F046, F054, F070 (with the F046/F021 dissents recorded inline in the ledger). F029 confirmed at its existing medium.

---

## Novel completeness findings (full detail)

Five gaps surfaced by the completeness sweep that no prior pass captured. All were deduped against the ledger and assigned the next free IDs (F257–F261).

### F257 — swap — medium / correctness
**Exact-output Uniswap approval/Permit2 allowance keyed to amountInRaw, not the amountInMaximum the SETTLE_ALL action is authorized to spend.**
`packages/sdk/src/actions/swap/providers/uniswap/UniswapSwapProvider.ts:101` (approval); `encoding.ts:271-273,288` (maxAmountIn).

For an exact-output Uniswap swap, `_buildApprovals` passes `quote.amountInRaw` as the `requiredAmount` to `buildPermit2Approvals` (line 101). For exact-output, `quote.amountInRaw` is the un-slipped quoted input (`finalAmountInRaw = amountOutRaw ? quote.amountInRaw : amountInRaw`, line 147). In the default `exact` approval mode, `resolveErc20ApprovalAmount` / `resolvePermit2ApprovalAmount` therefore set BOTH the ERC20→Permit2 allowance and the inner Permit2→UniversalRouter allowance to exactly `quote.amountInRaw` (SwapProvider.ts:365-389). But the encoded V4 `SWAP_EXACT_OUT_SINGLE` + `SETTLE_ALL` action authorizes the router to pull up to `maxAmountIn = quote.amountInRaw + quote.amountInRaw * slippage` (encoding.ts:271-273, encoded as the SETTLE_ALL currency amount at line 288). Any adverse price move between quote time and execution that pushes the true required input above the un-slipped `amountInRaw` (exactly the band the slippage tolerance exists to absorb) makes the Permit2/ERC20 allowance insufficient and the `transferFrom` inside settle reverts. Input-side slippage protection is thus structurally unusable in the default exact mode. This is the ERC20/Permit2-allowance leg, distinct from refines:F004 (native msg.value placeholder) and F048/F182 (amountInMaximum not surfaced/asserted). Velodrome is unaffected (throws `ExactOutputNotSupportedError`).

**Recommendation:** Key the exact-output approval to the same `maxAmountIn` (amountInMaximum) the encoder authorizes, not the un-slipped `quote.amountInRaw`. Compute `maxAmountIn` once (shared between encoder and approval) and pass it as `requiredAmount` to `buildPermit2Approvals` for exact-output swaps.

**Repro:** Configure a Uniswap exact-output swap (set amountOut) with default approvalMode `'exact'`. At quote time amountInRaw = Q; encoder sets amountInMaximum = Q*(1+slippage); approval grants only Q. If the pool moves so the actual input needed is in (Q, Q*(1+slippage)], the SETTLE_ALL transferFrom pulls > Q against a Q allowance and the swap reverts despite being within tolerance.

### F258 — swap — medium / correctness
**Velodrome universal/CL native-ETH OUTPUT silently delivers WETH (no UNWRAP_WETH command), unlike the v2/leaf swapExactTokensForETH path.**
`packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/cl.ts:135-164` (CL); `v2.ts:214-237` (universal); `helpers.ts:30-33` (native→WETH).

When `assetOut` is native ETH, `resolveTokens` maps it to the WETH predeploy address (helpers.ts:30-33). On the v2/leaf path this is correct because `encodeRouterSwap` branches on `isNativeAsset(assetOut)` and emits `swapExactTokensForETH`, which unwraps and sends native ETH to the recipient (v2.ts:261-267). But the Universal Router path (`encodeUniversalV2Swap`, v2.ts:214-237) and the CL/Slipstream path (`encodeCLSwap`, cl.ts:135-164) emit only a single V2_SWAP_EXACT_IN / V3_SWAP_EXACT_IN command with no trailing `UNWRAP_WETH` command and recipient = the msg.sender sentinel. The swap therefore delivers WETH (the resolved tokenOut) to msg.sender, not the native ETH the caller requested via `assetOut = ETH`. `quote.amountOut` / `amountOutMinRaw` are reported in ETH decimals (= WETH, both 18) so the amounts look correct, masking the substitution. Funds are recoverable (WETH ≈ ETH) so this is correctness, not fund-loss, but it is a silent loss-of-intent asymmetric with the v2/leaf path and is the output-side mirror of F047/refines:F047 (native-IN only).

**Recommendation:** On the universal and CL encoders, when `isNativeAsset(assetOut)`, append an `UNWRAP_WETH` command (recipient = msg.sender sentinel, amountMin = amountOutMin) after the swap, matching the v2/leaf behavior. Until then, reject native-ETH output on the universal/CL router types with an explicit error rather than silently delivering WETH.

**Repro:** Configure a Velodrome CL or Universal-Router market with `assetOut = ETH` (native) and call `swap.execute`. The encoded calldata trades to WETH and takes it to msg.sender with no UNWRAP_WETH; the wallet receives WETH while the SDK reports an ETH amountOut.

### F259 — borrow / cross-cutting config-validation — medium / correctness
**validateConfigAddresses (the single config-time address-format choke point) silently skips the entire config.borrow surface, leaving every borrow marketParams/reserve/asset address unvalidated.**
`packages/sdk/src/utils/validateAddresses.ts:121-153`.

`validateConfigAddresses(config)` is the one config-time guard that rejects malformed developer-supplied addresses; it is called once in the Actions constructor (`actions.ts:86`). Its body only walks `config.lend` (lendProviderAddresses), `config.swap` (swapProviderAddresses), and `config.assets` (allow/block). It NEVER iterates `config.borrow`, and its parameter type (`{ lend?; swap?; assets? }`) does not even accept a borrow field — yet its JSDoc claims "Iterates all lend and swap providers generically, so new providers are covered automatically." As a result the borrow-path addresses that become signed-calldata targets are never format-checked: Morpho `marketParams.loanToken / collateralToken / oracle / irm` (used verbatim in encodeMorphoSupplyCollateral/Borrow/Repay and as the approve() token in buildMorphoCollateralApproval — `providers/morpho/blue.ts:75,93,143,159`), Aave `aave.debtReserve / collateralReserve` (encodeAaveBorrow/Supply args — `providers/aave/calldata.ts:31,72`), and the collateralAsset/borrowAsset address maps. grep confirms no `isAddress`/`getAddress` runs on any of these in `actions/borrow/` (only the recipient `isAddressEqual` in WalletBorrowNamespace). For Morpho, verifyMorphoMarketId is no tripwire: developers normally derive marketId via `computeMorphoMarketId(marketParams)`, so a typo'd/truncated token address produces a self-consistent marketId that passes construction and ships into a signed ERC-20 approve and supplyCollateral/borrow calldata. Distinct from F099 (lend marketId.address), F103 (Aave marketId↔reserve value bind), F104 (checksum normalization).

**Recommendation:** Extend `validateConfigAddresses` to accept and walk `config.borrow`: validate each BorrowMarketConfig's protocol addresses (Morpho marketParams.loanToken/collateralToken/oracle/irm, Aave aave.debtReserve/collateralReserve) plus the collateralAsset/borrowAsset maps, mirroring lend/swap. Update the parameter type and the JSDoc that claims generic coverage.

**Repro:** Configure borrow with a Morpho market whose `marketParams.collateralToken` has a one-char typo and `marketId = computeMorphoMarketId(thatParams)`. The Actions constructor passes (validateConfigAddresses never inspects borrow; verifyMorphoMarketId passes because marketId was derived from the same params). `wallet.borrow.openPosition` then emits an approve()/supplyCollateral() to the malformed token address with no error.

### F260 — borrow / multi-chain membership & asset reconciliation (Morpho) — medium / correctness
**Morpho borrow never binds marketParams.loanToken/collateralToken to the configured borrowAsset/collateralAsset (or to the market's chainId), so the decimals used to scale signed amounts can diverge from the token actually approved/transferred.**
`packages/sdk/src/actions/borrow/providers/morpho/MorphoBorrowProvider.ts:79-88`.

A Morpho BorrowMarketConfig carries two independent things: (a) collateralAsset/borrowAsset (Asset objects whose `metadata.decimals` scale every human amount into wei — see internalParams.ts `buildOpenPositionInternalParams`), and (b) `marketParams.collateralToken/loanToken` (the addresses actually approved and passed to Morpho Blue calldata — blue.ts:75,93,143,159). The constructor only runs `verifyMorphoMarketId(marketId, marketParams)` (i.e. marketId == keccak256(abi.encode(marketParams))). It NEVER asserts `marketParams.collateralToken === collateralAsset.address[chainId]` or `marketParams.loanToken === borrowAsset.address[chainId]`, and the Morpho marketId/marketParams do NOT include chainId while Morpho Blue lives at the same CREATE2 address on every chain. So a config that pairs collateralAsset=WETH(18-dec) with a marketParams.collateralToken that is actually a 6-dec token (or a token from a different chain) passes verification; the open path then approves and supplies `collateralAmountWei` scaled by 18 decimals against a 6-dec token — over-approving/over-supplying by 1e12. This is asymmetric with the Aave borrow provider's reserve↔synthetic-id bind (F103 framing) and with the lend asset-reconciliation family (F008). Distinct from F017 (marketId hash integrity, allowlist-vs-blocklist coverage).

**Recommendation:** In the constructor (alongside verifyMorphoMarketId), assert per allowlist entry that `marketParams.collateralToken === getAssetAddress(collateralAsset, chainId)` and `marketParams.loanToken === getAssetAddress(borrowAsset, chainId)` (case-insensitive), so the decimals that scale signed amounts provably belong to the token being approved/transferred on the configured chain. Mirrors the Aave reserve↔asset bind.

**Repro:** Allowlist a morpho-blue market with collateralAsset=WETH (decimals 18) but `marketParams.collateralToken` set to a 6-decimal token's address, `marketId=computeMorphoMarketId(marketParams)`. Construction passes. `wallet.borrow.openPosition({ collateralAmount: 1 })` scales to 1e18 wei and emits `approve(collateralToken6dec, 1e18)` + `supplyCollateral(1e18)` — 1e12× the intended collateral.

### F261 — borrow — medium / malicious-sign
**Pre-built borrow quote dispatch enforces only the allowlist, silently bypassing the marketBlocklist that every re-quote path enforces.**
`packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:220` → `core/validations.ts:83-102` (validateBorrowMarketIdInAnyAllowlist).

When a developer hands a pre-built `BorrowQuote` to `wallet.borrow.openPosition/close/repay/deposit/withdrawCollateral`, the only market gate that runs is `validateBorrowMarketIdInAnyAllowlist(quote.marketId, providers)` (WalletBorrowNamespace.ts:220). That helper (validations.ts:83-102) returns as soon as the marketId is found in ANY provider's `marketAllowlist` — it never consults `marketBlocklist`. Every other code path that resolves a market goes through `requireAllowlistedBorrowMarketConfig` (validations.ts:42-76, called by `BorrowProvider.requireAllowlistedMarketConfig`), which explicitly rejects a marketId on `marketBlocklist`. The result is an asymmetric guard: a market a developer has deliberately disabled by adding it to `marketBlocklist` (the documented "temporarily disable a still-allowlisted market" pattern, and the only borrow-side use of the field) is still fully dispatchable if the caller supplies a pre-built quote for it. An integrator who caches/persists quotes (the documented getQuote-then-execute flow) or accepts quotes from a less-trusted preview service will sign and broadcast borrow/withdraw calldata against a market they explicitly blocked, because the wallet namespace — the last line before signing — does not apply the blocklist. This is the borrow analog of lend F010, but specifically on the pre-built-quote completeness vector (a guard present on the re-quote path is absent on the quote-dispatch path); F010 is lend-only and borrow's re-quote path DOES enforce the blocklist, F017 is about Morpho marketId integrity, and the F054 cluster is about calldata-vs-metadata binding, not allowlist/blocklist asymmetry.

**Recommendation:** Make the pre-built-quote dispatch guard symmetric with the re-quote path: in `validateQuoteForThisWallet`, resolve the quote's marketId through `requireAllowlistedBorrowMarketConfig` (which enforces both allow- and blocklist) instead of the allowlist-only `validateBorrowMarketIdInAnyAllowlist`, or add an explicit blocklist check there. Add a regression test that allowlists AND blocklists the same marketId, builds a quote, and asserts `wallet.borrow.openPosition(quote)` throws MarketNotAllowedError just like the re-quote path.

**Repro:** Configure one borrow provider with marketId M in both `marketAllowlist` and `marketBlocklist`. `wallet.borrow.openPosition({ market: M, ... })` (raw params) throws "Market is on the marketBlocklist". But `const q = await actions.borrow.getQuote({ action:'open', market:M, walletAddress:wallet.address, ... })` followed by `wallet.borrow.openPosition(q)` passes `validateBorrowMarketIdInAnyAllowlist` (allowlist hit) and dispatches the borrow bundle for the blocked market.

**Candidate existing issue:** #334.
