# Honor or reject caller recipient in swap calldata (V4 TAKE_ALL + Velodrome universal/CL)

> **AUGMENT existing issue #444 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
|-------|-------|
| **Severity** | high |
| **Complexity** | 4 / 5 |
| **Domain** | swap |
| **Surface** | `uniswap/encoding.ts` V4 TAKE_ALL, Velodrome universal/CL routers, `WalletSwapNamespace` recipient guard |
| **Resolves findings** | F046, F003, F047, F052, F079 |
| **Candidate existing issue** | #444 (augment) |
| **Blocked by** | _(none)_ |

## Problem

The SDK advertises a `recipient` on every swap quote and even guards it (`requireQuoteForThisWallet`, `validateRecipient`), but on the two dominant router paths the value is silently dropped: Uniswap V4 and Velodrome universal/CL always deliver output to `msg.sender` (the executing wallet) regardless of the `recipient` the caller passed. Velodrome v2/leaf, by contrast, bakes the caller's `recipient` straight into signed calldata.

This is a fund-safety and intent-integrity gap with two faces:

1. **Accept-display-then-ignore (V4 + universal/CL).** A caller who sets `recipient = someOtherAddress` gets a quote and an exit-0 success envelope that claim the output goes there, while on-chain it lands in the signer wallet. The output is not lost (it goes to the user's own wallet), but the SDK's stated contract is false, and the guard meant to protect it (`requireQuoteForThisWallet`) is a no-op on exactly these paths — a tampered quote can carry `recipient = wallet.address` to pass the guard while the calldata determines the real destination.

2. **Trust-the-bytes (v2/leaf).** Here the recipient *is* the on-chain destination, but it is encoded with no `isAddress`/EIP-55 reconciliation at the encoder seam, and the only upstream guard (`validateRecipient`) is a no-op for any value that is not a valid 20-byte address. A malformed-but-non-zero, typo'd-checksum, or address-poisoned recipient is signed verbatim and sends output to an unintended (possibly attacker) address.

The net inconsistency: for the *same* SDK call, output routing depends on which chain / router-type / pool-type is selected, and the SDK's recipient guarantee is provider-specific while presenting as uniform.

## Findings

- **F046** (high, fund-loss) — `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:224-294`: `encodeUniversalRouterSwap` builds the V4 action list `[SWAP_*_SINGLE, SETTLE_ALL, TAKE_ALL]`; `TAKE_ALL` (0x0f) credits `msg.sender` with no recipient argument and there is no `TAKE` (0x0e). The `recipient` field of `EncodeSwapParams` is destructured-but-unused — output always returns to the signer regardless of the advertised recipient.
- **F003** (medium, correctness) — `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/v2.ts:225` (`encodeUniversalV2Swap`) and `.../routers/cl.ts:152` (`encodeCLSwap`): both hard-code the calldata recipient to `UNIVERSAL_ROUTER_MSG_SENDER` (the msg.sender sentinel), discarding the caller's `recipient`, while the v2/leaf path honors it.
- **F047** (medium, correctness) — `packages/sdk/src/actions/swap/providers/velodrome/VelodromeSwapProvider.ts:194` sets `value = isNativeAsset(assetIn) ? amountInRaw : 0n` uniformly, but the universal (`v2.ts:214-237`) and CL (`cl.ts:135-164`) encoders have no native-ETH branch (`payerIsUser=true`, WETH `transferFrom`, no `WRAP_ETH`). Native-in on those paths attaches msg.value to a call expecting an ERC-20 pull (with no approval), so it reverts-with-refund / strands ETH. Testnet-only (universal/CL hubs are Base Sepolia); mainnet hubs are v2 and handle native.
- **F052** (low, correctness) — `packages/sdk/src/actions/swap/namespaces/WalletSwapNamespace.ts:93-101`: `requireQuoteForThisWallet` enforces `quote.recipient === wallet.address`, but since V4 (msg.sender) and Velodrome universal/CL (sentinel) ignore the recipient in calldata, the guard neither protects nor reflects actual behavior on those paths; a refinement also notes the input-token *payer* (msg.sender) is never asserted to be this wallet (`WalletSwapNamespace.ts:69-101`).
- **F079** (low, malicious-sign) — `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/v2.ts:253-273`: `encodeRouterSwap` writes the caller `recipient` directly into `swapExactETHForTokens` / `swapExactTokensForETH` / `swapExactTokensForTokens` calldata with no `isAddress`/`getAddress` checksum check at the encoder boundary (diverges from the universal/CL sentinel and trusts the bytes).

## Root cause

The `recipient` is plumbed through the quote, validation, and the cross-wallet guard as if it were authoritative everywhere, but each router encoder was written independently and made a different local choice: V4 uses `TAKE_ALL` (no recipient param), Velodrome universal/CL hard-code the msg.sender sentinel, and Velodrome v2/leaf bake the raw bytes in. There is no single seam that either (a) encodes a real recipient on every path or (b) asserts that a non-self recipient cannot be honored and fails closed. The result is one advertised field with three different on-chain meanings, and a guard (`requireQuoteForThisWallet`) that is a no-op on two of the three.

## Recommended approach

This is an SDK refactor and is in scope (signing-path calldata + sibling-consistency). Pick a single, consistent recipient contract and enforce it at the encoder boundary for every provider/router:

1. **Decide the contract per router path.** Two acceptable shapes, applied uniformly:
   - **Honor the recipient.** Uniswap V4: replace `TAKE_ALL` with the `TAKE` action (0x0e) encoding `(currency, recipient, minAmount)`. Velodrome universal/CL: pass the real recipient instead of `UNIVERSAL_ROUTER_MSG_SENDER` (and add a trailing `UNWRAP_WETH` to the recipient for native-out, tracked separately under the native-output family). This makes the advertised field real everywhere.
   - **Fail closed where it cannot be honored.** If a given path only supports msg.sender delivery, reject any `recipient` that is not the executing wallet at quote/encode time with a clear, named error (mirroring how Velodrome exact-output already throws) — do not accept-display-then-ignore.
   - Either choice is acceptable per path; the hard requirement is that no path silently ignores a non-self recipient.

2. **Validate the recipient at the encoder seam on the v2/leaf path (F079).** Before `encodeFunctionData`, run `recipient` through viem `isAddress` / `getAddress` (checksum) and throw on failure, as defense-in-depth even after the upstream `validateRecipient`/ENS-checksum gap is fixed.

3. **Make `requireQuoteForThisWallet` non-no-op (F052).** Once recipients are honored uniformly, fold the guard into a calldata-integrity check: re-derive (or re-encode) the recipient actually present in `swapCalldata` for the executing wallet rather than trusting the metadata `quote.recipient`. Also assert the input-token *payer* is the executing wallet, so the guard binds the account whose approvals were built and whose tokens are spent — not only the metadata recipient.

4. **Native-in on universal/CL (F047).** On those encoders, either reject native-ETH input explicitly or emit `WRAP_ETH` + set the route input to WETH; gate `execution.value` so native msg.value is only attached on a path that actually consumes it. Testnet-only today, so this is consistency/fail-closed hardening rather than a mainnet fund-loss fix, but it belongs with the same encoder-seam pass.

5. **Update docs/types to match.** `SwapQuote.recipient` is documented as "baked into `execution.swapCalldata` at quote time"; that doc must be true for every provider after the fix, or explicitly state the per-path limitation until honored.

CLI note: the CLI recipient passthrough (F327, `wallet swap execute --recipient`) is **review-only / no architectural refactor** — it is tracked separately; the low-risk fund-safety asks there are a CLI-side `isAddress` precheck and echoing the resolved recipient before/after signing. Do not refactor the CLI in this ticket; this ticket is the SDK-side root fix that makes that passthrough safe.

## Affected files

- `packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:224-294` (V4 `TAKE_ALL`, recipient destructured-but-unused)
- `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/v2.ts:214-237` (universal: `UNIVERSAL_ROUTER_MSG_SENDER` sentinel, no native branch)
- `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/v2.ts:253-273` (v2/leaf: caller recipient baked in, no `isAddress`/checksum)
- `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/cl.ts:135-164` (CL: sentinel recipient, no native branch)
- `packages/sdk/src/actions/swap/providers/velodrome/VelodromeSwapProvider.ts:194` (`value` set for native-in on all router types)
- `packages/sdk/src/actions/swap/namespaces/WalletSwapNamespace.ts:69-101, 93-101` (`requireQuoteForThisWallet` recipient-only guard; payer never asserted)

## Acceptance criteria / tests

- A swap with `recipient != executing wallet` on Uniswap V4 either delivers output to that recipient (if honoring) or throws a clear, named error at quote/encode time — never silently delivers to msg.sender.
- The same holds on Velodrome universal and CL paths: a non-self recipient is honored in calldata or rejected, not dropped to the sentinel.
- Decoding the encoded calldata (not asserting it against itself) recovers the intended recipient on every honoring path: add tests that decode the V4 `TAKE`/`TAKE_ALL` params and the Velodrome universal/CL/v2/leaf recipient field, asserting it equals the requested recipient (closes the F180/F181 test-gaps where encoders are only checked by prefix/length or against themselves).
- v2/leaf encoder rejects a malformed-but-non-zero / non-checksummed `recipient` with a named error before `encodeFunctionData` (F079).
- `requireQuoteForThisWallet` (or its replacement) fails a tampered quote whose metadata `recipient == wallet.address` but whose `swapCalldata` routes elsewhere, and asserts the payer is the executing wallet (F052).
- Native-ETH input on a Velodrome universal/CL path is either correctly wrapped/settled or rejected with a clear error; `execution.value` is only non-zero on a path that consumes it (F047).
- `SwapQuote.recipient` documentation matches actual on-chain behavior for every provider after the change.

## Notes

- F046 carried one dissenting reviewer view (medium/correctness, since the V4 misdelivery is to the user's *own* wallet); it was verified at high because the SDK makes a broken promise on a signed, no-error path reachable via raw-params `execute()` with no `recipient == wallet` guard. The v2/leaf path (F079) is where a poisoned recipient can actually reach a third party.
- F047 was refined high/fund-loss → medium/correctness: the universal/CL native-in hubs are testnet (Base Sepolia) and the dominant outcome is revert-with-refund, not mainnet fund-loss. It is included here because the fix lives in the same encoder seam, not because it is an independent mainnet fund-loss item.
- Test-coverage siblings (not separate code fixes, but the reason this shipped green): F177/F178 (only fork test asserts the encoder against itself, never broadcasts; universal/CL/V4 have zero on-chain coverage), F180 (V4 tests assert only calldata prefix/length, never decode recipient/`TAKE_ALL`), F181 (universal-router encoder test never asserts the encoded recipient while v2/leaf siblings do). The end-to-end recipient-balance assertions belong to the single consolidated Anvil feature-test ticket; the unit-level decode assertions above belong here.
- The CLI half (F327) and the upstream `validateRecipient` / ENS-checksum gaps (F043, F066) are tracked separately; this ticket is the SDK encoder/guard root fix that they depend on.
