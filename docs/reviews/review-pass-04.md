# Review Pass 04 — `ethskills:wallets` Signing Conformance

**Pass:** 4
**Skill / lens:** `ethskills:wallets` — per-wallet-kind (EOA, smart/ERC-4337, hosted) signing conformance. EIP-155 chain binding, userOpHash chainId+EntryPoint binding, signer-to-owner reconciliation, Permit2 payload integrity, recipient/onBehalf binding, owner-rotation lifecycle.
**Surfaces:** swap, lend, borrow, wallet-core, wallet-hosted, wallet-smart, core-services.

The verbatim-signing / calldata-integrity seam (F054 / F070–F075) and the bulk of the EOA/smart/hosted clusters (F020–F065 and pass-03 refinements) were treated as known and intentionally NOT re-flagged. This pass hunts for per-wallet-kind conformance gaps *beyond* the verbatim seam: assertions each wallet kind must satisfy on the signing path that the SDK enforces only by call-site discipline (or not at all).

## Summary

**Incoming:** 37 per-surface findings across 6 surface groups (swap, lend, borrow, wallet-core, wallet-hosted, wallet-smart, core-services).
**Outcome:** 19 NEW (F078–F096), 12 REFINES, 7 DUP. NEXT_ID advances F078 → F097.

**NEW by severity:** 1 high, 8 medium, 10 low.
**REFINES by severity:** 1 high, 4 medium, 7 low.

### Counts by class (NEW only)
- malicious-sign: 8
- correctness: 9
- info: 2

### Notable highlights
- **F082 (HIGH, borrow):** the borrow recipient/onBehalf guard compares a single cached `wallet.address` while a `DefaultSmartWallet` derives its account per `chainId`; a quote built referencing the construction-chain address can be dispatched on a different `chainId` where that counterfactual address is a different (or undeployed) account, and the recipient guard still passes. No chain-to-address reconciliation for smart wallets.
- **F087 (HIGH, wallet-smart/core):** `addSigner`/`removeSigner` mutate the on-chain owner set via UserOp but never refresh the in-memory `this.signers` / `this.signerIndex` / counterfactual `_address`; every subsequent `send()` rebuilds the Coinbase account from a stale owner array → signature rejected or attributed to the wrong owner slot.
- **F081 (MEDIUM, lend):** an empty/undefined `marketAllowlist` makes `validateMarketAllowed` a no-op (fail-open), so the directly-exported `LendProvider`/`MorphoLendProvider` builds an unbounded `approve` + deposit to an **arbitrary caller-supplied `marketId.address`** — the unvalidated value is the call TARGET / approval spender.
- **F080 (MEDIUM, lend):** the lend wallet-dispatch namespace lacks the last-line chain-supported + recipient-equals-signer reconciliation its borrow sibling enforces in `validateQuoteForThisWallet`; the two siblings give unequal protection at the signing boundary.
- **refines:F039 (HIGH, wallet-smart):** `removeSigner` has no `ownerCount>1` guard and no not-self guard — can brick the account (on-chain `LastOwner` revert after a consumed UserOp) or silently remove the only key this client can sign with.

## Conformance assertions this pass tested (per wallet kind)
- **EOA:** the signed EIP-155 `chainId` derives only from a configured chain AND is reconciled against the connected node's `eth_chainId` (F089); the address encoded as recipient/onBehalf/owner is canonical and equals the signer.
- **Smart / 4337:** after any owner mutation, in-memory `{owners, ownerIndex, address}` == on-chain layout before the next sign (F087); the address used for onBehalf/recipient is the same account that is `msg.sender` on the dispatch chain (F082); `userOpHash` chainId+EntryPoint == bundler submission chain (F094, refines:F045); removal never drops ownerCount below 1 and never removes the active key (refines:F039).
- **Hosted:** reported `.address` == the address the signer actually signs for (refines:F074, refines:F031); signing-identity inputs validated at a choke point (refines:F033).
- **All kinds:** approval allowance owner == the token *payer* / signing wallet, not the output recipient (F078); the approve+call target is allowlist-validated before any value-moving calldata is built (F081).

---

## Surface: swap

### F078 — Velodrome `_buildApprovals` keys the allowance check to `quote.recipient`, not the signing wallet (Velodrome sibling of F002)
- **Status:** NEW
- **File:** `packages/sdk/src/actions/swap/providers/velodrome/VelodromeSwapProvider.ts:218-223`
- **Severity:** medium · **Class:** correctness
- **Detail:** `_buildApprovals` reads `owner: quote.recipient` when calling `checkTokenAllowance`, and the early-return at line 225 (`allowance >= required`) decides whether to emit an approval tx based on that owner's allowance. But the wallet that signs the swap and from which the router pulls input tokens (v2/leaf encoders pass `recipient`; universal/CL encoders set `payerIsUser=true` ⇒ msg.sender = the signing wallet) is `walletAddress`, NOT `quote.recipient`. On the raw-params path (`_execute`) `recipient` can be an arbitrary third party (`params.recipient ?? walletAddress`), so the allowance pre-check runs against the wrong account: it can skip a needed approval (recipient has an allowance, signer does not ⇒ swap reverts on transferFrom) or emit a redundant approval. This is the exact class of F002, which the ledger pins only to `UniswapSwapProvider.ts:92`; Velodrome has the identical owner/signer confusion at a distinct, unrecorded file:line.
- **Repro:** `wallet.swap.execute({ assetIn: USDC, assetOut: WETH, amountIn: 100, recipient: thirdParty, provider: 'velodrome' })` on the raw path where `thirdParty` already has a router allowance but the signing wallet does not. `checkTokenAllowance(owner=thirdParty)` returns `>= required`, no tokenApproval is built, the dispatched `swapExactTokensForTokens` reverts when the router transferFroms the signing wallet with zero allowance.
- **Recommendation:** Pass `walletAddress` (the signing wallet / token payer) as the allowance `owner`, decoupled from `quote.recipient`. Mirror Uniswap's F002 fix.
- **suggestRefactor:** true · **Candidate issue:** #436 · **Relates to:** F002 (Velodrome sibling at distinct file:line)

### F079 — v2/leaf router encoders bake caller recipient into signed calldata with no `isAddress`/checksum validation
- **Status:** NEW
- **File:** `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/v2.ts:253-273`
- **Severity:** low · **Class:** malicious-sign
- **Detail:** `encodeRouterSwap` writes `recipient` directly into `swapExactETHForTokens` / `swapExactTokensForETH` / `swapExactTokensForTokens` calldata (the real on-chain output destination on v2/leaf routers), while the universal (line 225) and CL encoders hardcode the `UNIVERSAL_ROUTER_MSG_SENDER` sentinel. The recipient reaching this encoder is whatever flowed through `resolveQuoteDefaults`/`resolveRawParams`; the SDK's sole recipient guard (`validateRecipient`, F066) only zero-checks, and the ENS resolver returns un-checksummed hex (refines:F043). So a malformed-but-non-zero or address-poisoned recipient is encoded verbatim into the signed v2/leaf swap with no `isAddress`/EIP-55 reconciliation at the encoder boundary. The recipient-integrity guarantee differs per Velodrome router type, and v2/leaf is the path that actually trusts the bytes.
- **Recommendation:** Validate `recipient` with viem `isAddress`/`getAddress` (checksum) at the v2/leaf encoder boundary before `encodeFunctionData`. Fix the upstream `validateRecipient`/ENS-checksum gap (F066/F043) as the root; add the encoder-level assertion as defense-in-depth.
- **suggestRefactor:** false · **Candidate issue:** #437 · **Relates to:** F066

### refines:F070 — Pre-built quote dispatch signs `execution.value` (native msg.value) verbatim with no reconciliation to the encoded amountIn or native-in flag
- **Status:** refines:F070
- **File:** `packages/sdk/src/actions/swap/core/SwapProvider.ts:434-438`
- **Severity:** medium · **Class:** malicious-sign
- **Detail:** `executeFromQuote` validates only `quote.expiresAt` and `quote.execution.routerAddress` (non-zero), then `buildSwapTransactions` copies `value: quote.execution.value` straight into the signed `TransactionData`. Nothing reconciles `value` against the quote's own `amountInRaw`/`assetIn`: an ERC-20-in quote whose `execution.value` is non-zero signs a tx forwarding native ETH to the router with no native-settlement in the calldata, stranding/burning that ETH; a native-in quote whose `value` is understated underfunds SETTLE and reverts. The conformance assertion: `execution.value` MUST equal the native amount the calldata settles (`amountInRaw` when `isNativeAsset(assetIn)`, else 0). This plugs the native-value leg of the F070 verbatim seam specifically.
- **Repro:** Hand-craft a USDC→WETH `SwapQuote` (assetIn ERC-20) with `execution.value = 1 ETH` and `recipient = wallet.address`. `requireQuoteForThisWallet` passes (recipient matches), `executeFromQuote` passes (router non-zero, not expired), and dispatch signs a tx sending 1 ETH to the router whose calldata only settles USDC; the ETH is lost to the router.
- **Recommendation:** Assert `quote.execution.value === (isNativeAsset(quote.assetIn) ? quote.amountInRaw : 0n)` and throw a named error on mismatch.
- **suggestRefactor:** false · **Candidate issue:** #373 · **Relates to:** F070

### refines:F070 — Pre-built quote path trusts `quote.chainId` metadata for both validation and dispatch chain, never re-deriving the expected router/token addresses
- **Status:** refines:F070
- **File:** `packages/sdk/src/actions/swap/core/SwapProvider.ts:434-451`
- **Severity:** low · **Class:** malicious-sign
- **Detail:** On the pre-built quote branch, `validateSwapExecute` calls `assertChainSupported(quote.chainId)` and dispatch goes through `executeTransactionBatch(wallet, txs, params.chainId)` where `params.chainId === quote.chainId`. The router address, the token addresses in `swapCalldata`, and the dispatch chain are all taken from the SAME caller-supplied `quote.chainId`, but nothing re-derives the canonical router for `quote.chainId` from the provider address book and compares it to `quote.execution.routerAddress`. A quote whose `chainId` disagrees with its embedded router/token bytes (stale quote replayed after a redeploy, or a tampered quote) is signed and broadcast against a router that may not be the configured one. EOA EIP-155 binding keeps the signature chain-correct, so this is not a cross-chain-replay break; it is a missing router-address reconciliation, a narrower instance of F070's "no router allowlist / calldata re-derive" gap viewed through the chain-binding lens.
- **Repro:** Replay a `SwapQuote` captured before a router redeploy: `chainId` still resolves as supported, `routerAddress` points at the old/attacker router, expiry not yet hit. `executeFromQuote` signs and broadcasts to the stale router with the wallet's tokens approved to it.
- **Recommendation:** Re-derive the expected router for `quote.chainId` from the provider's address book and assert it equals `quote.execution.routerAddress`; use `quote.chainId` as the single source for both the address lookup and the dispatch chain.
- **suggestRefactor:** true · **Candidate issue:** #373 · **Relates to:** F070

### refines:F052 — `requireQuoteForThisWallet` binds a pre-built quote to the wallet by recipient only; the input-token payer (msg.sender) is never asserted to be this wallet
- **Status:** refines:F052
- **File:** `packages/sdk/src/actions/swap/namespaces/WalletSwapNamespace.ts:69-101`
- **Severity:** low · **Class:** correctness
- **Detail:** For a pre-built quote the only wallet binding is `isAddressEqual(quote.recipient, wallet.address)`. The router pulls input tokens from msg.sender (`payerIsUser=true` on universal/CL; v2/leaf transferFrom the caller). The recipient check coincides with the payer only because recipient defaults to the wallet. The conformance assertion that SHOULD hold: the *payer* (msg.sender, == the executing wallet for both EOAs and smart-wallet UserOps) is the account whose approvals were built and whose tokens are spent. A quote whose recipient equals this wallet but whose approvals were sized for a different payer (e.g. produced for a smart wallet but executed by its EOA owner, where allowances live on different addresses) passes `requireQuoteForThisWallet` yet the swap can revert on transferFrom. No per-wallet-kind assertion that approvals/allowances and the signing payer agree.
- **Recommendation:** On the pre-built quote path, verify the approvals in the SwapTransaction were built for `wallet.address` as payer (not merely that recipient matches), making the EOA/smart-wallet conformance requirement testable rather than incidental.
- **suggestRefactor:** true · **Candidate issue:** #437 · **Relates to:** F052

### dup:F021 — Swap dispatch routes approvals+swap through `executeTransactionBatch`, inheriting EOA `sendBatch` mid-batch-revert behavior
- **Status:** dup:F021
- **File:** `packages/sdk/src/actions/swap/namespaces/WalletSwapNamespace.ts:142-154`
- **Severity:** low · **Class:** correctness
- **Detail:** `dispatch` pushes tokenApproval, permit2Approval, and swap into one array handed to `executeTransactionBatch`, which for an EOA maps to `EOAWallet.sendBatch` (sequential) and for a smart wallet to one atomic UserOp. On the EOA path approve and swap are independent signed txs; per F021 a failed/late approval still proceeds to sign and broadcast the swap, which reverts on transferFrom after the user already paid gas. The swap layer relies on a wallet-layer atomicity property (F021/F034) it never asserts. Recorded as a cross-reference; no net-new code location beyond what F021 already covers.
- **Recommendation:** Fix F021 (EOA `sendBatch` should abort the batch on a reverted prior tx) so the approve→swap invariant the swap layer relies on actually holds; no swap-layer change needed beyond documenting the assumption.
- **suggestRefactor:** false · **Candidate issue:** none · **Relates to / dup of:** F021

---

## Surface: lend

### F080 — Lend wallet-dispatch has no last-line chain/recipient reconciliation that its borrow sibling enforces before signing
- **Status:** NEW
- **File:** `packages/sdk/src/actions/lend/namespaces/WalletLendNamespace.ts:89-98`
- **Severity:** medium · **Class:** malicious-sign
- **Detail:** The borrow sibling re-checks `isAddressEqual(quote.recipient, this.wallet.address)` AND `validateChainSupported(quote.marketId.chainId, ...)` right before dispatch (`WalletBorrowNamespace.validateQuoteForThisWallet`, lines 207-237). `WalletLendNamespace.dispatch` (89-98) signs with ZERO pre-dispatch assertions; it relies solely on `openPosition`/`closePosition` having spread `walletAddress: this.wallet.address` into the provider call. The chain-supported check in lend only happens inside `provider.openPosition → validateMarketAllowed → assertChainSupported` and is absent from `closePosition`'s pre-build path beyond `validateMarketAllowed`; there is no defense-in-depth at the signing boundary. A future refactor or overriding subclass (e.g. a pre-built-tx overload like borrow's quote path) would leave the lend signing seam with no guard. A structural sibling-conformance gap (lend is the weaker of the two), distinct from F071 (lower-trust exported provider).
- **Repro:** Not directly exploitable today (walletAddress is forced), but the lend signing boundary lacks the chain-supported and recipient-equals-signer assertions borrow performs, so the two siblings give unequal protection against an integrator subclass or future pre-built-tx overload.
- **Recommendation:** Add a defensive guard in `WalletLendNamespace.dispatch` mirroring borrow's `validateQuoteForThisWallet`: `validateChainSupported(chainId, this.supportedChainIds())` before `executeTransactionBatch`, and (when `LendTransaction` carries the encoded recipient) assert it equals `this.wallet.address`. Factor the shared pre-sign reconciliation into a helper used by all three wallet namespaces.
- **suggestRefactor:** true · **Candidate issue:** #477 · **Relates to:** F071

### F081 — Empty/undefined `marketAllowlist` makes `validateMarketAllowed` a no-op, so open/closePosition build approve+deposit calldata to an arbitrary caller-supplied `marketId.address` (fail-open)
- **Status:** NEW
- **File:** `packages/sdk/src/actions/lend/core/LendProvider.ts:234-257`
- **Severity:** medium · **Class:** malicious-sign
- **Detail:** `validateMarketAllowed` returns early when `marketAllowlist` is undefined or length 0 (lines 237-242), allowing ANY marketId through. For Morpho, `_openPosition` encodes the call target verbatim from the caller's `marketId.address` (`to`/`spender`, MorphoLendProvider.ts:70-73), and the base emits `buildLendApproval → approve(callerAsset → params.marketId.address, amount)` with `approvalMode='max'` granting `maxUint256`. So with no allowlist configured, the exported `LendProvider`/`MorphoLendProvider` builds an unbounded ERC-20 approval to — and a deposit call against — an address the caller fully controls. The `WalletLendNamespace` path is gated by `getProviderForMarket` (requires `findMarketInAllowlist` to MATCH, so an empty allowlist throws `ProviderNotConfiguredError`), but the directly-exported provider has no such routing gate. The unvalidated value here is the call TARGET / approval spender, distinct from F010 (blocklist field inert) and F071 (recipient verbatim).
- **Repro:** `const p = new MorphoLendProvider({ marketAllowlist: [] }, cm); p.openPosition({ asset: USDC, amount: 1000, marketId: { address: ATTACKER_CONTRACT, chainId }, approvalMode: 'max', walletAddress: signer })` → returns `approve(USDC → ATTACKER_CONTRACT, maxUint256)` + deposit calldata to `ATTACKER_CONTRACT`; signing grants the attacker contract an unbounded USDC allowance.
- **Recommendation:** Make an empty/undefined `marketAllowlist` fail CLOSED on the write paths (open/closePosition): require a non-empty allowlist and reject any marketId not present (`MarketNotAllowedError`). If a permissive read-only default is desired, scope it to reads only, never to approve+deposit/withdraw. Add a test asserting `openPosition` against an unlisted market with an empty allowlist throws before any calldata/approval is produced.
- **suggestRefactor:** true · **Candidate issue:** #334 · **Relates to:** F010

### refines:F008 — Aave open/close branch native-vs-ERC20 on different inputs (open uses caller `params.asset`, close uses market-driven `marketInfo.asset`)
- **Status:** refines:F008
- **File:** `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts:56-84, 92-120`
- **Severity:** low · **Class:** correctness
- **Detail:** Conformance assertion: the deposit/withdraw calldata shape (native WETHGateway path vs ERC-20 Pool path) must be selected from the SAME authoritative source on open and close so a caller cannot steer one direction into the wrong leg. `_openPosition` selects via `isNativeAsset(params.asset)` (caller-controlled) then `_buildETHOpenPosition` sends `value: params.amountWei` to `WETHGateway.depositETH`. `_closePosition` selects via `isNativeAsset(marketInfo.asset)` (market-driven). Because open never calls `validateMarketAsset` (only close does), a caller passing `asset: ETH` against a non-native (e.g. USDC) allowlisted market routes into the native deposit leg: it sends real ETH as msg.value and credits aWETH, decoupled from the USDC market named, while the returned `LendTransaction.assetAddress` reports WETH. Same root as the F008 family (missing `validateMarketAsset` on open), sharpened with the inconsistent leg-selection-source angle.
- **Repro:** `openPosition({ asset: ETH, amount: 1, marketId: <allowlisted USDC Aave market> })` → `_buildETHOpenPosition` sends 1 ETH msg.value to WETHGateway, credits aWETH onBehalfOf signer; no `validateMarketAsset` rejects it, and the `LendTransaction` claims `assetAddress=WETH` while the caller targeted USDC.
- **Recommendation:** Select the native-vs-ERC20 leg from the routed market's underlying on BOTH open and close (use `marketInfo.asset` after asserting `params.asset` matches via `validateMarketAsset`). Fold into the F008 `validateMarketAsset`-on-open fix.
- **suggestRefactor:** false · **Candidate issue:** #334 · **Relates to:** F008

### dup:F014 — Aave `getReserve` constructs a fresh ethers `JsonRpcProvider` from the viem chain's default RPC rather than the ChainManager transport
- **Status:** dup:F014
- **File:** `packages/sdk/src/actions/lend/providers/aave/sdk.ts:108-125`
- **Severity:** low · **Class:** info
- **Detail:** `getReserve` reads `rpcUrl` from `publicClient.chain?.rpcUrls.default.http[0]` and builds `new providers.JsonRpcProvider(rpcUrl)`, bypassing the integrator's configured ChainManager transport and silently falling back to viem's baked-in default/public RPC. The APY/market metadata read feeds `openPosition`'s returned `LendTransaction.apy`; a divergent RPC produces wrong market data but does not alter the signed calldata (addresses come from the static `AAVE_ADDRESSES` map keyed by chainId). This is F014 (and relates to F045); recorded as a duplicate. RPC trust is out of scope as a fix.
- **Recommendation:** Document that Aave market reads use a separate ethers provider derived from the viem chain's default RPC, not the configured transport; if a single source of truth is desired, derive the ethers provider from the same transport. No signing-path change required.
- **suggestRefactor:** false · **Candidate issue:** #255 · **Relates to / dup of:** F014 (also F045)

---

## Surface: borrow

### F082 — Borrow recipient/onBehalf guard compares `quote.recipient` to a single cached `wallet.address` but dispatches on `quote.marketId.chainId` — no chain-to-address reconciliation for smart wallets
- **Status:** NEW
- **File:** `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:211-237`
- **Severity:** high · **Class:** malicious-sign
- **Detail:** `validateQuoteForThisWallet` asserts `isAddressEqual(quote.recipient, this.wallet.address)`, then `dispatch()` sends the bundle to `executeTransactionBatch(..., quote.marketId.chainId)`. For a `DefaultSmartWallet`, `this.wallet.address` is a single `_address` cached at construction, while the account that signs/executes is derived per-chain via `getCoinbaseSmartAccount(chainId)`. The borrow calldata bakes `onBehalf=receiver=walletAddress` (Morpho open.ts:60-66, withdraw MorphoBorrowProvider.ts:252-257; Aave calldata.ts:19-39,79-93). If a counterfactual smart-account address is not identical across chains (different owners array / deploy nonce / factory per chain), a quote built referencing the construction-chain address can be dispatched on a different chainId where that address is a different (or undeployed, attacker-frontrunnable) account — yet the recipient guard still passes because it only checks the cached address. The assertion "the address used for onBehalf/recipient is the same account that will be msg.sender on `quote.marketId.chainId`" is never checked. EOA wallets are safe (one address all chains); smart wallets are not guaranteed to be.
- **Repro:** Construct a smart wallet whose counterfactual address on chain A differs from chain B. Build a borrow quote on chain A (recipient = chain-A address = cached `_address`), then call `wallet.borrow.openPosition(quote)` with `quote.marketId.chainId = B`. The guard passes (recipient == cached `_address`), but the borrow executes on B against a different account; collateral/onBehalf semantics diverge.
- **Recommendation:** Bind the recipient/onBehalf check to the dispatch chain: resolve the wallet's address FOR `quote.marketId.chainId` before comparing to `quote.recipient`, and reject when the wallet cannot prove the same account controls that chain. At minimum document and test that `DefaultSmartWallet.address` is chain-invariant.
- **suggestRefactor:** true · **Candidate issue:** #163 · **Relates to:** F058 (intersects but distinct)

### F083 — Aave borrow encodes `onBehalfOf=user` but never establishes credit delegation; signer ≠ onBehalfOf reverts or silently mis-attributes debt with no SDK-side conformance check
- **Status:** NEW
- **File:** `packages/sdk/src/actions/borrow/providers/aave/calldata.ts:19-39`
- **Severity:** medium · **Class:** correctness
- **Detail:** `encodeAaveBorrow` sets `onBehalfOf=walletAddress`. Aave V3 `Pool.borrow` requires that, when `onBehalfOf != msg.sender`, the borrower has granted the msg.sender variable-debt credit delegation (`approveDelegation`). The flow injects `walletAddress = this.wallet.address`, so the direct-send EOA case holds `onBehalfOf == msg.sender`, but nothing asserts "the signer that executes this calldata == onBehalfOf." For any wallet kind where the executing msg.sender can differ from the baked `onBehalfOf` (smart-wallet inner-call edge cases, a tampered pre-built quote — the F054 seam, excluded — or a future delegated/session-key sender), the borrow either reverts or, with delegation present, opens debt against a different account. grep confirms the borrow surface never references `approveDelegation`/`isAuthorized`/credit. The assertion "executing signer == debt owner (onBehalfOf)" is unstated and untested.
- **Repro:** Not directly exploitable on the EOA happy path; surfaces as a revert or mis-attributed debt when msg.sender diverges from onBehalfOf, which the SDK does not guard against.
- **Recommendation:** Add an explicit invariant comment + test that the executing wallet equals the `onBehalfOf` encoded in every borrow leg. If `onBehalfOf != signer` is ever supported, require and verify the corresponding Aave `approveDelegation` / Morpho `setAuthorization` leg is present in the bundle.
- **suggestRefactor:** true · **Candidate issue:** #334 · **Relates to:** F054

### F084 — Dispatch chainId is taken from caller-influenced `quote.marketId.chainId` and passed straight to `wallet.send` with no reconciliation against the wallet's intended chain (EIP-155 sign-for-A/broadcast-on-B)
- **Status:** NEW
- **File:** `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:232-237`
- **Severity:** medium · **Class:** correctness
- **Detail:** `dispatch()` calls `executeTransactionBatch(this.wallet, [...quote.execution.transactions], quote.marketId.chainId)`. The wallet then builds a client/account for exactly that chainId. For a pre-built quote, `marketId.chainId` is attacker-influenceable metadata; `validateBorrowMarketIdInAnyAllowlist` only proves the marketId is allowlisted somewhere, and `validateChainSupported` only proves the chain is in the supported set — neither pins the chain the user intends to transact on. Combined with chain-specific calldata (pool/morpho addresses resolved from `config.chainId` at build time), a quote whose `marketId.chainId` is swapped to another supported chain (whose allowlist also contains a matching marketId) routes a signed bundle onto a different chain than the user reviewed. The assertion "the chain we sign+broadcast on is the chain bound into the reviewed quote, and the wallet is on that chain" is implicit only.
- **Repro:** Take a valid borrow quote, mutate `quote.marketId.chainId` to another supported chain whose allowlist also contains a matching marketId; dispatch routes the (chain-A-built) bundle onto chain B without any chain-intent check.
- **Recommendation:** Have the wallet (or namespace) assert that the executing chain equals an explicitly intended chain (e.g. `wallet.chainId` / a chainId the caller passed), rather than blindly trusting `quote.marketId.chainId`. Add a test that a quote with a tampered `marketId.chainId` is rejected, not silently re-targeted.
- **suggestRefactor:** true · **Candidate issue:** none · **Relates to:** F054

### F085 — Raw-params (re-quote) borrow path injects `wallet.address` but never runs the recipient/onBehalf conformance check the pre-built path runs
- **Status:** NEW
- **File:** `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:178-195`
- **Severity:** low · **Class:** malicious-sign
- **Detail:** `resolveQuote()` routes pre-built quotes through `validateQuoteForThisWallet` (recipient == wallet.address, action, expiry, chain, allowlist) but raw params go straight to `requote()` which spreads `{ ...raw, walletAddress: this.wallet.address }` and returns the freshly built quote with NO post-build assertion. The freshly built quote's onBehalf/receiver legs are encoded from `params.walletAddress`, so they *should* equal `wallet.address` — but this is assumed, never asserted. A provider hook bug, a market config that swaps the encoded recipient, or any future provider that fails to thread `walletAddress` into every leg would silently sign a borrow whose funds route elsewhere, and the namespace would not catch it because the recipient guard is skipped on this path. The two paths assert different invariants on the same outgoing calldata.
- **Repro:** A provider that mis-threads `walletAddress` into one leg (or a config-level recipient override) produces a quote routing funds off-account; the raw path dispatches it with no recipient reconciliation, unlike the pre-built path.
- **Recommendation:** Run `validateQuoteForThisWallet` (at least the recipient == wallet.address check) on the re-quoted result too, so both paths enforce the identical "this borrow is bound to my account" assertion before dispatch.
- **suggestRefactor:** true · **Candidate issue:** #477 · **Relates to:** F071

### F086 — Morpho borrow/withdraw encode `receiver=onBehalf=walletAddress` with no `isAuthorized`/`setAuthorization` conformance leg; signer-must-equal-onBehalf invariant is unstated and untested
- **Status:** NEW
- **File:** `packages/sdk/src/actions/borrow/providers/morpho/blue.ts:81-97`
- **Severity:** low · **Class:** correctness
- **Detail:** `encodeMorphoBorrow(...)` and `encodeMorphoWithdrawCollateral` set both `onBehalf` and `receiver` to `walletAddress`. Morpho Blue's borrow/withdrawCollateral require `msg.sender == onBehalf` OR `Morpho.isAuthorized(onBehalf, msg.sender)`. The SDK relies entirely on `walletAddress == this.wallet.address == msg.sender` holding for the executing wallet, but never asserts the signer equals onBehalf, and never emits/verifies a `setAuthorization` leg for any delegated-sender case. The Morpho mirror of the Aave credit-delegation gap (F083): for a direct EOA send it is fine, but the assertion "the account that signs the userOp/tx is exactly the onBehalf encoded in every Morpho leg" is implicit. Any wallet kind whose effective msg.sender can diverge from the cached `wallet.address` (see F082) breaks this silently.
- **Repro:** Same class as F083: reverts or mis-attributed position when msg.sender != onBehalf; not guarded.
- **Recommendation:** State and test the invariant that, for every Morpho leg, the executing wallet's on-chain address (on the dispatch chain) equals the encoded `onBehalf`/`receiver`. If delegated senders are ever supported, require a verified Morpho `setAuthorization` leg in the bundle.
- **suggestRefactor:** true · **Candidate issue:** #334 · **Relates to:** F054

---

## Surface: wallet-core

### F087 — `addSigner`/`removeSigner` never refresh in-memory `signers`/`signerIndex`/`_address` after a successful owner rotation; subsequent signs use the stale owner set
- **Status:** NEW
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:310-375, 390-422, 78-80, 196-207`
- **Severity:** high · **Class:** correctness
- **Detail:** `this.signers` and `this.signerIndex` are assigned only in the constructor. `addSigner` and `removeSigner` submit `addOwnerAddress`/`addOwnerPublicKey`/`removeOwnerAtIndex` UserOps that mutate the ON-CHAIN owner array, return the resolved index, but NEVER mutate the in-memory `this.signers`/`this.signerIndex` (nor the counterfactual `_address`). `getCoinbaseSmartAccount` (196-207) reconstructs the viem Coinbase account from `this.signers` + `ownerIndex: this.signerIndex` on EVERY subsequent `send()`/`sendBatch()`. Failure modes after a rotation the wallet itself performed: (1) `removeSigner` removing an owner at index ≤ `this.signerIndex` shifts on-chain slots while `this.signerIndex` is unchanged → the next op is signed against the wrong ownerIndex slot and `validateUserOp` reverts; (2) for a counterfactual (undeployed) wallet, `getAddress()` derives the CREATE2 address from `_signerBytes` (stale signers), so after a rotation the instance keeps operating on the OLD counterfactual address; (3) `_signerBytes` also feeds `deploy()`'s factory `createAccount(owners, nonce)`, so a deploy after an in-memory-stale rotation deploys the wrong owner set. Broader than F039 (which is about deriving the removal index / "remove the only signer"): those concern the rotation call itself, this concerns every `send()` AFTER it. Untested (the addSigner spec asserts only the returned index and the calldata).
- **Repro:** `const w = await actions.wallet.getSmartWallet({signer, walletAddress}); await w.addSigner(coSigner, base); await w.send(tx, base);` — `send()` rebuilds the account from the pre-add `this.signers`; ownerIndex/owner-array no longer match on-chain layout → signature wrapper rejected or attributed to the wrong slot. For a counterfactual wallet, `getAddress` keeps returning the old CREATE2 address after rotation.
- **Recommendation:** After a successful `addSigner`, append the new signer and recompute `this.signerIndex`; after `removeSigner`, splice the removed entry and re-resolve `this.signerIndex` (higher indices shift down) and invalidate/recompute `_address` for counterfactual wallets. Alternatively re-derive from an on-chain read at the start of each `send()`, or document that rotation invalidates the instance and a fresh `getSmartWallet()` is required. Add a test asserting the local owner model matches on-chain after rotation.
- **suggestRefactor:** true · **Candidate issue:** #163 · **Relates to:** F039
- **Note:** The `wallet-smart` surface group reported this same root cause at `DefaultSmartWallet.ts:310-375,390-422,78-80,196-207` (also F039-related); recorded once here, deduped as dup:F087.

### F088 — Owner rotation is applied to a single chainId but the wallet is CREATE2-deterministic across all chains; owner sets silently diverge
- **Status:** NEW
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:310-375, 390-422, 196-207`
- **Severity:** medium · **Class:** correctness
- **Detail:** `addSigner(signer, chainId)` and `removeSigner(signer, chainId, ...)` each take ONE chainId and submit the owner-mutation UserOp on that chain only. The wallet address is CREATE2-deterministic from signers+nonce, so the SAME address exists on every supported chain, but its on-chain owner array is now per-chain divergent: an owner added on Base is absent on Optimism for the identical address. `getCoinbaseSmartAccount` uses one shared `this.signers` for ALL chains, and `findSignerIndexOnChain` resolves indices per-chain, so a `send()` on a chain where the rotation did NOT happen computes an ownerIndex/owner-array that does not match that chain's layout. No per-chain owner bookkeeping and no warning that rotation is chain-local. A recovery/owner-rotation-safety gap: a user who rotates out a compromised key on one chain still has it live on the others.
- **Repro:** `removeSigner(compromisedKey, optimism)` removes it on Optimism only; the same key remains a live owner of the identical wallet address on Base/Unichain and can still authorize UserOps there.
- **Recommendation:** Either accept `chainIds[]` in addSigner/removeSigner and apply the rotation across all deployed chains (per-chain success reporting like `createWallet`), or document loudly that rotation is chain-scoped and require callers to rotate on each chain. At minimum, after rotation track owner state per chain.
- **suggestRefactor:** true · **Candidate issue:** #163 · **Relates to:** F039

### F089 — `EOAWallet.send` sets `chain` on the wallet client, which makes viem SKIP `eth_chainId` verification of the connected RPC node (sign-for-chainA / broadcast-on-chainB)
- **Status:** NEW
- **File:** `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:33-73`
- **Severity:** medium · **Class:** malicious-sign
- **Detail:** `walletClient()` builds the client with `chain: getChain(chainId)` and `transport: getTransportForChain(chainId)`. When `chain` is set, viem's `sendTransaction` does NOT call `eth_chainId` to confirm the node behind the transport actually serves that chain; it stamps the EIP-155 chainId from the client chain and broadcasts. If an integrator's chain config maps chainId 10 to an RPC URL that actually serves chain 8453 (copy-paste / load-balancer misroute), the signed tx is EIP-155-bound to chain 10 but submitted to a chain-8453 node. Best case the node rejects (DoS); worst case, on a node that does not strictly enforce the tx chainId on intake, the same signed payload is broadcastable on the OTHER chain where the calldata was never intended to execute. Distinct from refines:F022 (chainId not a member of configured chains) and the EIP-155-pinning note: here the chainId IS configured and pinned, but the node identity behind the transport is never verified. RPC trust itself is out of scope, but the missing one-time `eth_chainId` reconciliation is an SDK-side guard, not RPC trust.
- **Repro:** Config: `chains:[{chainId:10, rpcUrls:['https://base-mainnet....']}]`. `wallet.send(approveUSDC, 10)` signs an EIP-155 chain-10 tx and submits it to a Base node; no `eth_chainId` check ever runs.
- **Recommendation:** On first use of a chain's wallet/public client, perform a one-time `eth_chainId` read and assert it equals chainId (cache the result), or do NOT pre-set `chain` and let viem verify, throwing a named `ChainMismatchError`. Mirror this guard for the smart-wallet bundler path.
- **suggestRefactor:** false · **Candidate issue:** none · **Relates to:** F022

### F090 — `findSignerInArray` calls `getAddress()` inside `findIndex`, throwing `InvalidAddressError` on a malformed `signers[]` entry instead of returning -1
- **Status:** NEW
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/utils/findSignerInArray.ts:17-29`
- **Severity:** low · **Class:** correctness
- **Detail:** `findSignerInArray` maps each string entry through `getAddress(signerEntry)`. viem's `getAddress()` THROWS `InvalidAddressError` on any non-address string (or a bad checksum). Because this runs inside `findIndex` over the caller-supplied signers array, a single malformed entry (typo, truncated address, ENS name accidentally passed) aborts the whole search with an opaque viem throw rather than producing the documented -1 "signer not found." The caller (`ensureLocalAccountSigner`) wraps a -1 into a clear "Signer does not match any signer in the signers array" error, but a throw from `getAddress` bypasses that and surfaces as a low-level address-validation error during construction, obscuring the real problem (bad signer config). Adjacent to F064 (WebAuthn-only arrays) but the malformed-address branch.
- **Repro:** `getSmartWallet({signer, signers:['0xnot_an_address', signer.address]})` throws `InvalidAddressError` from `getAddress` before the intended "signer not found / does not match" path runs.
- **Recommendation:** Validate each entry with `isAddress()` before `getAddress()`, and either skip invalid entries (return false so the search yields -1 and `ensureLocalAccountSigner` throws the clear message) or throw a named `InvalidSignerError` naming the offending index. Add a test with a malformed `signers[]` entry.
- **suggestRefactor:** false · **Candidate issue:** #163 · **Relates to:** F064

### F091 — `addSigner` does not `isAddress`-validate an EOA string signer before encoding `addOwnerAddress`; a malformed owner becomes a permanent on-chain owner slot
- **Status:** NEW
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:310-348`
- **Severity:** low · **Class:** correctness
- **Detail:** In `addSigner`, the `typeof signer === 'string'` branch (312-321) and the `signer.type === 'local'` branch (336-345) feed `signer`/`signer.address` straight into `encodeFunctionData(addOwnerAddress, [signer])` with NO `isAddress()` check. `encodeFunctionData` with the address-typed ABI param accepts any 0x-hex of the right length and will not catch a checksum-corrupted or wrong-length-but-hex value the way `getAddress` would; a malformed/poisoned address can be encoded and committed as a permanent owner. Unlike a one-off transfer (`sendTokens`, refines:F035, same falsy-only weakness), `addOwnerAddress` is irreversible governance state: a wrong owner cannot sign, dilutes the owner set, and shifts indices for every later `removeOwnerAtIndex`. The assertion: any value destined to become a persistent on-chain OWNER MUST pass strict address validation before it is encoded.
- **Repro:** `wallet.addSigner('0x1234' /* short/poisoned */, base)` encodes `addOwnerAddress` with the malformed value and submits it; the bad owner is committed and cannot be cleanly governed afterward.
- **Recommendation:** In `addSigner`, run `isAddress()` (or `getAddress()` for normalization) on the EOA string and local.address before `encodeFunctionData`, throwing a named `InvalidSignerError` on failure. Mirror the WebAuthn length check F038 already calls for.
- **suggestRefactor:** false · **Candidate issue:** none · **Relates to:** F035

### F092 — `isLocalAccount` type-guard in `toActionsWallet` accepts any object with `type:'local'` + function fields; no address/checksum or signer-capability validation before wrapping into a signing wallet
- **Status:** NEW
- **File:** `packages/sdk/src/wallet/core/namespace/WalletNamespace.ts:22-34, 190-206`
- **Severity:** low · **Class:** info
- **Detail:** `toActionsWallet` branches on `isLocalAccount(params)`, which only checks `type==='local'`, `typeof address==='string'`, and that `signMessage`/`signTransaction` are functions. It does not validate that `address` is a real checksummed Ethereum address (`isAddress`), nor that `signTypedData` exists (treated as optional, yet the EIP-712 / Permit2 path downstream requires it). A caller passing a hand-rolled object that satisfies the structural shape but carries a malformed address, or lacks `signTypedData`, is wrapped into a `LocalWallet` and used for signing; the missing `signTypedData` only surfaces as a deep runtime throw when an action reaches a typed-data leg. This is the entry seam for EOA-shaped signers into the whole SDK, so the broadest place to enforce: a value accepted as a signing account MUST have a valid checksummed address and the signing capabilities the action surface depends on.
- **Repro:** `actions.wallet.toActionsWallet({type:'local', address:'0xshort', signMessage:fn, signTransaction:fn})` is accepted and wrapped; the bad address (or absent `signTypedData`) only blows up later inside a swap/lend Permit2 signature.
- **Recommendation:** Strengthen `isLocalAccount` to require `isAddress(record.address)` and (since lend/swap/borrow rely on EIP-712/Permit2) `typeof record.signTypedData==='function'`; throw a clear `InvalidSignerError` on the `toActionsWallet` path rather than deferring to a deep typed-data throw later.
- **suggestRefactor:** false · **Candidate issue:** none · **Relates to:** F074

---

## Surface: wallet-smart

### dup:F087 — `addSigner`/`removeSigner` never refresh in-memory signers/signerIndex/`_address` after a successful owner rotation
- **Status:** dup:F087
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:310-375, 390-422, 78-80, 196-207`
- **Severity:** high · **Class:** correctness
- **Detail:** Same root cause as F087 (recorded under wallet-core), reported independently by the wallet-smart surface with the added counterfactual `_address`/`deploy()` angle (a deploy after an in-memory-stale rotation deploys the wrong owner set; `getAddress` keeps returning the old CREATE2 address). Folded into F087's detail and recommendation. No separate ledger row.
- **Recommendation:** See F087.
- **suggestRefactor:** true · **Candidate issue:** #163 · **Relates to / dup of:** F087 (and F039)

### refines:F039 — `removeSigner` uses `removeOwnerAtIndex` with no `ownerCount>1` guard and no not-self guard; can brick the account or remove the only key this client can sign with
- **Status:** refines:F039
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:390-411`
- **Severity:** high · **Class:** fund-loss
- **Detail:** `removeSigner` always encodes `removeOwnerAtIndex(index, ownerBytes)` with no precheck. Two unguarded hazards: (1) removing the wallet's last remaining owner reverts `LastOwner` on-chain (surfaced only as an opaque `TransactionConfirmedButRevertedError` after a sponsored UserOp is consumed), and any path that drops to a single owner leaves no margin for recovery; (2) nothing prevents removing `this.signer` itself, the only `LocalAccount` this SDK instance can sign with — the removal op is signed by `this.signer`, succeeds, and afterwards this client can never sign for the wallet again while the in-memory `signerIndex` still claims that owner exists. For a funded smart wallet this is a self-inflicted lockout / loss-of-access. Sharpens refines:F039 (pass 2, "removeSigner can remove the only LocalAccount this client can sign with, locking the wallet") with the on-chain `LastOwner` brick + not-self angle and the use of `removeOwnerAtIndex` rather than `removeLastOwner`.
- **Repro:** Single-owner wallet: `removeSigner(theOnlyOwner)` reverts `LastOwner` after consuming a sponsored UserOp, reported only as a generic revert. Multi-owner: `removeSigner(this.signer)` succeeds and the instance can never sign further ops.
- **Recommendation:** Before sending the removal, read `ownerCount()` and reject if it would drop to 0; reject (or require an explicit force flag) when the resolved owner equals `this.signer`/`this.signerIndex`; surface a typed `LastOwner`/`SelfRemoval` error rather than relying on an opaque on-chain revert.
- **suggestRefactor:** false · **Candidate issue:** #163 · **Relates to:** F039

### F093 — `addSigner` has no duplicate/idempotency guard and never reconciles the returned on-chain index with the owner it actually encoded
- **Status:** NEW
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:310-375`
- **Severity:** medium · **Class:** correctness
- **Detail:** `addSigner` encodes `addOwnerAddress(signer)` (or `addOwnerPublicKey`) and then calls `findSignerIndexOnChain(getSignerPublicKey(signer))` to return an index. Gaps: (1) No `isOwnerAddress`/`isOwnerBytes` precheck, so re-adding an existing owner reverts `AlreadyOwner` on-chain, surfaced only as a generic `TransactionConfirmedButRevertedError` after a UserOp is consumed; an owner-management API should be idempotent or fail fast. (2) The returned index is resolved by a SEPARATE on-chain scan keyed on the signer public key, not asserted to be the owner the op encoded; `findSignerIndexOnChain` returns the first high-to-low match and `retryOnStaleRead` retries only on -1 (not on an inconsistent positive), so a concurrent owner mutation between the add op and the index scan can return an index for a different owner undetected. The assertion: an add must be idempotent and the returned index must provably point at the owner just added.
- **Repro:** `addSigner(existingOwner)` consumes a sponsored UserOp then throws a generic `AlreadyOwner` revert. A concurrent rotation from a co-owner between the add op and the index scan can make the returned index point at a different owner slot.
- **Recommendation:** Precheck `isOwnerAddress`/`isOwnerBytes` and short-circuit (return existing index) or throw a typed `AlreadyOwner` before sending; after the op, verify `ownerAtIndex(returnedIndex)` equals the formatted owner bytes that were encoded, not merely that some matching owner exists.
- **suggestRefactor:** false · **Candidate issue:** #163 · **Relates to:** F038

### refines:F038 — WebAuthn owner add vs lookup/remove derive owner bytes two different ways with no assertion they yield the same on-chain representation
- **Status:** refines:F038
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:322-335, 400-407`
- **Severity:** medium · **Class:** correctness
- **Detail:** For WebAuthn signers the add path (322-335) decodes `signer.publicKey` into `[x,y]` via `decodeAbiParameters([bytes32,bytes32])` and calls `addOwnerPublicKey(x,y)` (contract stores `abi.encode(x,y)`, 64 bytes). The remove path (400-407) and `findSignerIndexOnChain` instead format the owner via `formatPublicKey(getSignerPublicKey(signer))`, which for a non-address Hex is a raw pass-through of `publicKey`, then compare case-insensitively to `ownerAtIndex()`. These derivations are equal only if `signer.publicKey` is exactly the 64-byte x‖y with no extra prefix/encoding. No length/shape validation reconciles the two paths. A 65-byte uncompressed or DER-wrapped key would be stored one way and searched for another, so the just-added passkey owner cannot be found or removed and `removeSigner` could resolve -1 or a wrong slot. refines:F038 (pass 2/3, the 65-byte mis-split on add) is the add-side; this is the add-vs-lookup/remove representation divergence. The assertion: the bytes used to add, look up, and remove an owner must be the identical canonical representation.
- **Repro:** Pass a WebAuthn signer whose `publicKey` is not exactly the 64-byte x‖y the contract stores: `addSigner` encodes `addOwnerPublicKey` from a mis-split while `findSignerIndexOnChain`/`removeSigner` compare the raw `publicKey` bytes, leaving the owner unfindable/unremovable (permanent unmanaged owner).
- **Recommendation:** Centralize WebAuthn owner-bytes derivation in one helper (assert `publicKey` is exactly 64 bytes, then both `addOwnerPublicKey` args and the lookup/remove bytes come from that single source) so add, find, and remove cannot diverge.
- **suggestRefactor:** true · **Candidate issue:** #163 · **Relates to:** F038

### F094 — `getCoinbaseSmartAccount` omits `entryPoint` and relies on viem's default while the constants ABI declares the v0.6 UserOperation struct; no assert that the userOpHash chain equals the broadcast chain
- **Status:** NEW
- **File:** `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:196-207`
- **Severity:** low · **Class:** info
- **Detail:** `getCoinbaseSmartAccount` constructs `toCoinbaseSmartAccount` with version `'1.1'` but no explicit `entryPoint`, so the EntryPoint address+version (which binds chainId and EntryPoint into the signed userOpHash) is whatever viem defaults to. `smartWalletAbi` declares the legacy v0.6 UserOperation struct (`paymasterAndData`/`initCode` fields), so the shipped ABI and the EntryPoint version viem uses are not co-asserted anywhere in SDK code. Combined with `getBundlerClient` (ChainManager) building bundler/public clients from the same chainId with no `eth_chainId` reconciliation (RPC-trust, out of scope as a fix), nothing in the SDK pins the chain that derives/signs userOpHash to the broadcast chain. They align today because one chainId flows through both, but an EntryPoint/version drift on a viem upgrade or a bundler whose configured chain differs would silently sign for one chain context and broadcast under another. The assertion: the EntryPoint address+version and chainId that enter userOpHash must be explicit and equal to the broadcast chain.
- **Repro:** No live exploit with current viem; a pin-the-invariant gap. A viem default-EntryPoint change or a bundler configured for a different chain than chainId would shift the userOpHash chain binding with no SDK-side detection.
- **Recommendation:** Pass an explicit `entryPoint {address, version}` into `toCoinbaseSmartAccount` (matching the ABI the package ships) instead of relying on viem's default, and assert account client chain == bundler chain before `sendUserOperation`.
- **suggestRefactor:** false · **Candidate issue:** #82 · **Relates to:** F045

---

## Surface: wallet-hosted

### refines:F031 — Turnkey caller-supplied `ethereumAddress` becomes the wallet's reported signing address with no reconciliation against the resolved `signWith` key (node + react)
- **Status:** refines:F031
- **File:** `packages/sdk/src/wallet/node/wallets/hosted/turnkey/utils/createSigner.ts:25-31`
- **Severity:** medium · **Class:** malicious-sign
- **Detail:** When `ethereumAddress` is supplied, `@turnkey/viem` `createAccount` uses it directly as the `LocalAccount`'s `.address` and skips the API fetch. `TurnkeyWallet.performInitialization` then sets `this.address = this.signer.address`. That `.address` is consumed downstream as the user's identity (lend `onBehalfOf`/receiver, smart-wallet owner). Nothing verifies the supplied `ethereumAddress` is actually the address controlled by the key `signWith` resolves to. A caller (or a field-copy bug) passing a private-key-ID `signWith` together with an unrelated `ethereumAddress` produces a wallet that REPORTS one address but SIGNS as another: positions/approvals get attributed to an address the signer cannot move funds from. Same passthrough in react. Sharper than refines:F031 (format validation of `signWith`/`ethereumAddress`): the issue is that the `ethereumAddress` shortcut deliberately bypasses the one API round-trip that would reconcile address-to-key, and the SDK adds no compensating check.
- **Repro:** Construct `TurnkeyWallet` with `signWith='pk_id_A'` (controls address A) and `ethereumAddress=B` (an address the org does not control). `Wallet.address` resolves to B. `wallet.lend.openPosition` encodes `onBehalfOf=B`; aToken/debt accrues to B while only A's key can sign, so funds are deposited under an address this signer can never withdraw from.
- **Recommendation:** Either (a) when `ethereumAddress` is supplied alongside a `signWith` that is not itself that address, fetch the key's actual address from Turnkey once and assert `getAddress(fetched) === getAddress(ethereumAddress)`; or (b) at minimum a one-time `signMessage` + `recoverMessageAddress` self-test in `performInitialization` asserting it equals `this.address`.
- **suggestRefactor:** true · **Candidate issue:** none · **Relates to:** F031

### refines:F074 — No hosted wallet performs a signer-address self-test; reported `.address` vs actual signing key is never verified for any provider
- **Status:** refines:F074
- **File:** `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:44-52`
- **Severity:** medium · **Class:** malicious-sign
- **Detail:** Every hosted wallet (Privy node/react, Turnkey node/react, Dynamic) sets `this.signer` from a vendor-backed `createSigner` and exposes `this.address` either from caller input (node Privy) or `signer.address`, then sends via `EOAWallet.walletClient/send` which trusts `this.signer` to sign for `this.address`. There is no point where the SDK asserts the signer can actually produce a signature recoverable to `.address`. This is the generic conformance assertion that would catch F028 (node Privy createSigner skips getAddress), F029 (node Privy caller address not reconciled with walletId), and the Turnkey `ethereumAddress` gap in one place. Because hosted signing is delegated to a remote service keyed by an opaque handle (walletId / signWith / connectedWallet), a wrong handle does not fail loudly at construction; it silently produces a wallet whose `.address` is attributed to one party while signatures come from another. Generalizes F074 ("no shared signer-identity reconciliation seam") into a concrete one-time self-test.
- **Repro:** Pass a node Privy `walletId` for wallet X but `address` of wallet Y. `getAddress(Y)` is checksummed but never compared to `walletId` X. Wallet reports Y, signs as X; no error until an onchain attribution mismatch surfaces.
- **Recommendation:** Add a one-time, opt-out-able verification in `performInitialization` for hosted `EOAWallet` subclasses: sign a fixed deterministic message via `this.signer.signMessage` and assert `recoverMessageAddress(...) === getAddress(this.address)`, throwing a named `WalletIdentityMismatch` on failure. Gate behind a flag for passkey clients if an extra prompt is undesirable, but make the reconciliation the documented default for API-key/server clients.
- **suggestRefactor:** true · **Candidate issue:** none · **Relates to:** F074

### refines:F033 — Node Turnkey registry `validateOptions` only checks client truthiness; the actual signing-key selectors bypass every validation choke point
- **Status:** refines:F033
- **File:** `packages/sdk/src/wallet/node/providers/hosted/registry/NodeHostedWalletProviderRegistry.ts:41-58`
- **Severity:** low · **Class:** malicious-sign
- **Detail:** `validateOptions` for turnkey returns `Boolean(o?.client)` and `NodeOptionsMap['turnkey']` is just `{ client }`. The fields that actually select which key signs — `organizationId`, `signWith`, `ethereumAddress` — are supplied later via `toActionsWallet` and are never validated anywhere: not at registry registration, not in the provider, not in `createSigner` (which destructures and forwards them raw). So the registry's "validation choke point" covers the connection handle but not the signing identity. An empty-string or malformed `signWith`/`organizationId` flows straight into `@turnkey/viem` with no shape check, deferring failure to remote signing time (or producing a wallet with a surprising resolved address). Same structural gap as F033 but specifically on the signing-identity inputs.
- **Repro:** `create('turnkey', { client })` passes, then `toActionsWallet({ organizationId: '', signWith: '' })`. No SDK-level error; the empty selectors reach `@turnkey/viem` and fail opaquely or resolve to an unintended key.
- **Recommendation:** Validate `organizationId`/`signWith` as non-empty strings (and `ethereumAddress`, when present, via `getAddress`) at the entry of `TurnkeyHostedWalletProvider.toActionsWallet`/`createSigner`. Prefer a shared `validateTurnkeyIdentity` helper reused by node and react.
- **suggestRefactor:** true · **Candidate issue:** none · **Relates to:** F033

### dup:F033 — React registry `validateOptions` returns true unconditionally for dynamic, privy AND turnkey; no validation choke point on the entire react signing path
- **Status:** dup:F033
- **File:** `packages/sdk/src/wallet/react/providers/registry/ReactHostedWalletProviderRegistry.ts:22-71`
- **Severity:** low · **Class:** info
- **Detail:** All three react factories' `validateOptions` return literal `true`. Because `ReactOptionsMap` is all-`undefined` by design, config-time validation is a true no-op, and per-wallet signing inputs arrive only via `toActionsWallet`. None are validated at any choke point. This is already recorded as refines:F033 (pass 3) at `ReactHostedWalletProviderRegistry.ts:24-60`; the net-new framing (spans all three providers including Turnkey) is folded into refines:F033 above. No separate row.
- **Recommendation:** Move per-provider input validation into `toActionsWallet`/`createSigner` entry points so the react path has the same validate-before-sign guarantee the node path partially has. (See refines:F033.)
- **suggestRefactor:** true · **Candidate issue:** none · **Relates to / dup of:** F033

### refines:F062 — Dynamic signer mixes two backends (raw-hash `sign()` via connector, `signTransaction`/`signMessage`/`signTypedData` via walletClient) with no address reconciliation and no connector capability guard
- **Status:** refines:F062
- **File:** `packages/sdk/src/wallet/react/wallets/hosted/dynamic/utils/createSigner.ts:24-37`
- **Severity:** low · **Class:** malicious-sign
- **Detail:** `createSigner` reads `address` from `walletClient.account.address` but routes `sign({hash})` to `connector.signRawMessage` (a different backend object, cast unchecked to `DynamicWaasEVMConnector`), while `signTransaction`/`signMessage`/`signTypedData` are bound to walletClient methods. Two issues compound: (1) the connector is force-cast with no `instanceof`/capability check (F062), so a non-WaaS connector throws only when `sign()` is first invoked, mid-flow; (2) nothing asserts `connector` account space equals `walletClient.account.address` — `sign()` passes `accountAddress: walletClient.account.address` into the connector, so if the connector is bound to a different account the raw signature is produced by an unexpected key with no error. Because the message hash is passed with `0x` stripped into a `signRawMessage` that may itself expect/re-add a prefix, the seam is also the one F030 flagged for signature-shape divergence. For Permit2/EIP-712 the `signTypedData` path (walletClient) and the `sign` path (connector) could be backed by different keys. Sharpens F062 with the connector-vs-walletClient address-divergence angle.
- **Repro:** Provide a Dynamic wallet whose connector is bound to account A but whose `walletClient.account` is B. `createSigner` reports address B; `sign()` calls `connector.signRawMessage({accountAddress: B})` — if the connector ignores `accountAddress` and signs with its own A, the recovered signer is A, mismatching the reported B used downstream as identity.
- **Recommendation:** Guard the connector with a capability check (`typeof connector?.signRawMessage === 'function'`) before casting and throw a clear error if absent; assert the connector signs for `walletClient.account.address` (or derive both from one source). Add a recovery test. Prefer wiring all `sign*` methods to a single backend.
- **suggestRefactor:** true · **Candidate issue:** none · **Relates to:** F062

### dup:F073 — React Privy `createSigner` re-wraps the vendor account with a casted `signTypedData` and no recovery self-test, copying address verbatim from `toViemAccount`
- **Status:** dup:F073
- **File:** `packages/sdk/src/wallet/react/wallets/hosted/privy/utils/createSigner.ts:22-29`
- **Severity:** low · **Class:** malicious-sign
- **Detail:** `createSigner` calls `toViemAccount({ wallet: connectedWallet })` then rebuilds a fresh `LocalAccount` via `toAccount`, copying address/sign/signMessage/signTransaction and casting `signTypedData` to `CustomSource['signTypedData']`. The cast bridges a signature-shape mismatch on the EIP-712/Permit2 seam, and the rewrap re-asserts identity purely from `privyViemAccount.address` with no normalization and no `signMessage→recover` self-test. This is F073 (recorded pass 3 at `privy/utils/createSigner.ts:22-29`); recorded here as a duplicate. The Permit2-approval-misattribution risk is the same as F073's.
- **Recommendation:** Drop the unnecessary `toAccount` rewrap and return the Privy viem account directly if it satisfies `LocalAccount`, or normalize address via `getAddress` and add a typed-data recovery test. (See F073.)
- **suggestRefactor:** true · **Candidate issue:** none · **Relates to / dup of:** F073

### dup:F028 — Node Privy `createSigner` forwards caller address to `createViemAccount` with no `getAddress` checksum, diverging from its sibling `toActionsWallet`
- **Status:** dup:F028
- **File:** `packages/sdk/src/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.ts:87-95`
- **Severity:** low · **Class:** malicious-sign
- **Detail:** `toActionsWallet` checksums `params.address` via `getAddress` (line 67) before constructing `PrivyWallet`, but `createSigner` (87-95) spreads `...params` (including a raw address) straight into the node `createSigner → createViemAccount` with no `getAddress` and no comparison to `walletId`. The two sibling entrypoints apply different normalization to the same field, and `createSigner` produces a viem account reporting a non-normalized, unreconciled address. This is F028 / refines:F028 confirmed still-present; recorded as a duplicate. Because `createSigner` seeds smart-wallet owners, an un-checksummed/mismatched address can mis-order against the on-chain owner layout (cf. F023).
- **Recommendation:** Apply `getAddress(params.address)` in node `createSigner` exactly as `toActionsWallet` does, routing both through one shared helper. Ideally also reconcile address vs walletId once (see refines:F074).
- **suggestRefactor:** true · **Candidate issue:** none · **Relates to / dup of:** F028

---

## Surface: core-services

### F095 — `getChain` returns `chainById[chainId]` with no check that chainId is a configured/supported chain; it feeds the EIP-155 chain bound into EOA signatures
- **Status:** NEW
- **File:** `packages/sdk/src/services/ChainManager.ts:162-164`
- **Severity:** low · **Class:** correctness
- **Detail:** `getChain(chainId)` returns the global `chainById[chainId]` viem Chain object unguarded. That object's `.id` is the EIP-155 chainId baked into every EOA transaction signature (`EOAWallet.walletClient` passes `chainManager.getChain(chainId)` as the signing chain). Unlike `getRpcUrls`/`getBundlerUrl`/`getChainConfig` (all of which throw `ChainNotSupportedError` for an unconfigured chain), `getChain` performs no membership check against `getSupportedChains()`. Today every EOA call also routes through `getTransportForChain` (which throws via `getChainConfig`), so the signing path is defended in aggregate; but `getChain` is a public, unguarded primitive whose result directly determines the signed chainId. Any consumer using `getChain` without the transport/config guards would sign for an unconfigured chain, and for a chainId absent from `chainById` it silently returns `undefined` rather than throwing. The chain bound into the signature and the chain the transport broadcasts to must provably be the same configured chain; `getChain` makes that an unchecked assumption. Producer-side of F022.
- **Repro:** `new ChainManager([{chainId: 10}]).getChain(8453)` returns the Base Chain object without throwing, even though Base was never configured; that object would be used as the EIP-155 signing chain if reached.
- **Recommendation:** Make `getChain` validate chainId against `getSupportedChains()` (or look it up via `getChainConfig`) and throw `ChainNotSupportedError` when unconfigured, mirroring the other accessors.
- **suggestRefactor:** true · **Candidate issue:** none · **Relates to:** F022

### F096 — ENS recipient resolution silently falls back to a hardcoded third-party RPC (cloudflare-eth.com) when mainnet is not configured
- **Status:** NEW
- **File:** `packages/sdk/src/services/nameservices/ens/EnsNamespace.ts:19-20, 185-194`
- **Severity:** low · **Class:** info
- **Detail:** `getMainnetClient()` falls back to a hardcoded `createPublicClient` pointed at `FALLBACK_MAINNET_RPC = 'https://cloudflare-eth.com'` whenever chain 1 is absent from the integrator's config. `ens.getAddress` (which calls `resolveAddress`) is the resolver wired behind swap recipient resolution (`actions/swap/module.ts`), so a recipient name resolved through this fallback becomes the address encoded into the calldata the user signs. Distinct from F045 (viem's anonymous `http()` default in `getTransportForChain`): this is a specific named third-party endpoint the SDK chooses for the recipient-resolution path. Per the standing RPC-trust rule this is info, not a fix: the trust boundary for ENS→address resolution (whose output is signed) is silently delegated to a Cloudflare-hosted public endpoint without opt-in.
- **Repro:** If an integrator configures a private mainnet RPC but never registers chain 1, ENS resolution for a swap recipient name silently reads from `cloudflare-eth.com`; the resolved address is then encoded into the signed swap calldata.
- **Recommendation:** Document that ENS resolution falls back to a public Cloudflare endpoint when mainnet is unconfigured, and consider requiring an explicit mainnet chain config (throwing `EnsNotConfiguredError`) rather than silently using a hardcoded RPC for an address that will be signed into calldata. Info-only under RPC-trust scope.
- **suggestRefactor:** false · **Candidate issue:** none · **Relates to:** F045

### refines:F045 — `getBundlerClient`/`getPimlicoBundlerClient` never assert the supplied `SmartAccount`'s chain/EntryPoint match the requested chainId before it becomes the userOp-signing client
- **Status:** refines:F045
- **File:** `packages/sdk/src/services/ChainManager.ts:90-127, 244-273`
- **Severity:** low · **Class:** malicious-sign
- **Detail:** `getBundlerClient(chainId, account)` and `getPimlicoBundlerClient(chainId, account, ...)` build the exact client that `prepareUserOperation`/`sendUserOperation` use to sign and submit the ERC-4337 UserOperation. The bundler/smart-account client is chain-bound via `getChain(chainId)`, but the function accepts an arbitrary `account: SmartAccount` and never asserts `account.client.chain.id === chainId`, nor that `account.entryPoint` matches anything the SDK knows. In the current single call path the account is built by `getCoinbaseSmartAccount(chainId)` from the same chainId so they agree, but the seam offers no conformance guarantee: a future caller passing an account constructed for chainA into `getBundlerClient(chainB, account)` would produce a UserOperation whose userOpHash is bound to one chain/EntryPoint while the bundler transport targets another — the sign-for-A / submit-on-B replay shape. The assertion (userOpHash chainId+EntryPoint == submission chain) is enforced only by call-site discipline. Sharpens refines:F045 (pass 3, "getBundlerClient returns client without binding to verified chainId") with the explicit account-chain/EntryPoint reconciliation.
- **Repro:** Construct `DefaultSmartWallet`, call `getCoinbaseSmartAccount(8453)` then `chainManager.getBundlerClient(10, account)`; no error is raised even though the account is bound to Base while the bundler is bound to OP Mainnet.
- **Recommendation:** In `getBundlerClient`/`getPimlicoBundlerClient`, assert `account.client.chain.id === chainId` (and, if available, `account.entryPoint.address` against a known EntryPoint set) before constructing the client; throw on mismatch. Add a unit test that passing a chainA-bound account with chainB throws.
- **suggestRefactor:** true · **Candidate issue:** none · **Relates to:** F045 (also F059)

### refines:F076 — `validateWalletAddress` (the shared signer-address guard) inherits the lowercase-literal zero-address bypass and never confirms the address is canonical/checksummed
- **Status:** refines:F076
- **File:** `packages/sdk/src/utils/validation.ts:100-109, 60-64`
- **Severity:** low · **Class:** malicious-sign
- **Detail:** `validateWalletAddress` is the single shared guard that lend/swap/borrow providers call on `params.walletAddress` (LendProvider:85,196; SwapProvider:152; MockBorrowProvider:200,212) before that address is encoded verbatim as `onBehalfOf`/receiver/owner/recipient into the calldata the wallet signs (root of F071). It chains `validateAddress` (strict `isAddress`, good) and `validateNotZeroAddress`, but `validateNotZeroAddress` (60-64) compares with `address === ZERO_ADDRESS` against a lowercase literal — exactly the F076 bypass — so a checksummed/mixed-case zero representation passes and gets signed. More broadly, `validateWalletAddress` is the natural place to assert the caller-supplied wallet address equals the actual signer/owner address the SDK will sign with (the missing signer-to-owner reconciliation seam, cf. F074), yet it does neither: it never sees the signer. Every wallet kind that routes through these providers therefore has zero enforcement that the address baked into position/recipient calldata is canonically non-zero and the address that actually controls the signing key.
- **Repro:** A non-canonical (mixed-case) zero-address representation passes `validateNotZeroAddress` (lowercase `===`) and is encoded verbatim into the signed onBehalf/recipient calldata.
- **Recommendation:** Fix `validateNotZeroAddress` to use `isAddressEqual(address, zeroAddress)` (closes F076 on the shared path), and add an optional `expectedSigner` param to `validateWalletAddress` so providers can assert `params.walletAddress === the resolving wallet's signer/owner address` before calldata is built, giving every wallet kind one reconciliation choke point.
- **suggestRefactor:** true · **Candidate issue:** #477 · **Relates to:** F076

### dup:F067 — `buildPermit2ApprovalTx` encodes a uint48 expiration with no upper-bound/overflow guard and the resulting Permit2 allowance is never reconciled against the swap deadline
- **Status:** dup:F067
- **File:** `packages/sdk/src/utils/approve.ts:107-130`
- **Severity:** low · **Class:** correctness
- **Detail:** `buildPermit2ApprovalTx` computes `expiration = floor(Date.now()/1000) + (expirySeconds ?? 30 days)` and passes it straight into `encodeFunctionData` for the Permit2 `approve(token, spender, amount, uint48 expiration)`. No assertion that `expiration` fits in uint48 or is positive: a caller-supplied `expirySeconds` (from `SwapSettings.permit2ExpirationSeconds`, integrator-controlled) that is negative, NaN, fractional, or large enough to overflow uint48 produces malformed calldata that reverts or, on silent truncation, sets an already-expired/near-permanent allowance window. This is F067 / refines:F067 (buildPermit2ApprovalTx expiration with no positive/uint48 bound, at `approve.ts:115-117`/`107-130`); recorded as a duplicate. Inner-allowance sibling of F050.
- **Recommendation:** Validate `expirySeconds` is a positive finite integer and assert the computed `expiration <= 2**48-1` (and ideally <= the swap quote deadline), throwing `InvalidParamsError` otherwise. (See F067.)
- **suggestRefactor:** true · **Candidate issue:** none · **Relates to / dup of:** F067 (also F050)

---

## Out-of-scope / accepted-assumption notes (recorded, not findings)
- RPC chain-id trust (`getTransportForChain` falling back to `http()` with no `eth_chainId` reconciliation) is the integrator's RPC and out of scope per standing rules (F045 lineage). F089 and F096 are recorded as SDK-side reconciliation/disclosure gaps that sit *adjacent* to RPC trust, not RPC-trust violations.
- EOA EIP-155 signing is sound (viem binds the configured `chain.id` into the signature, and `quote.chainId` is internally consistent with the encoded calldata within a single quote object); sign-for-chainA/broadcast-on-chainB is not a live break at the swap/lend/borrow layer beyond the missing router-address reconciliation (refines:F070) and the node-identity gap (F089).
