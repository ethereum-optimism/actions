# Assert attribution-suffix inertness and EntryPoint-version guards on mutated UserOp bytes

> **AUGMENT existing issue #456 - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | medium |
| **Complexity** | 4 / 5 |
| **Domain** | wallet |
| **Surface** | `DefaultSmartWallet.appendAttributionSuffix` (callData/initCode mutation), `DefaultSmartWallet.send`/`sendBatch` double-prepare |
| **Resolves findings** | F063, F059, F065, F037 |
| **Candidate existing issue** | #456 |
| **Blocked by** | (none) |

## Problem

`DefaultSmartWallet.send` and `sendBatch` prepare a UserOperation, then append a 16-byte attribution suffix to the prepared `callData` and `initCode` immediately before signing and submitting. Three things compound on this single path, all inside the signed UserOperation bytes (signing-path scope):

1. **The suffix mutates security-critical, signed bytes with no inert-suffix assertion.** `appendAttributionSuffix` concatenates 16 raw bytes onto the ABI-encoded `execute`/`executeBatch` callData and onto the deployment `initCode`. The suffixed bytes are hashed into the `userOpHash` the wallet signs and the EntryPoint executes. Correct operation relies entirely on the on-chain decoder silently ignoring trailing bytes. Nothing in the SDK asserts that property: there is no decode-back check that the suffixed callData still resolves to the same `(to, value, data)` tuples, and no check that the suffixed `initCode` still ABI-decodes to the same `createAccount(owners, nonce)` args. If a future account implementation or non-Coinbase wrapper strict-decodes calldata length, the suffix turns a valid, signed call into a revert; any sponsored value sits stuck pending.

2. **The `initCode` branch is gated on an unasserted EntryPoint version.** The wallet is built as Coinbase Smart Account `version: '1.1'`, which viem hardcodes to **EntryPoint v0.6**, so `prepareUserOperation` populates `initCode = factory ++ createAccount(owners, nonce)` on the undeployed path. The suffix therefore mutates the *live factory deployment calldata* the EntryPoint executes on every first send. There is no assertion that the negotiated EntryPoint is the v0.6 shape the `uo.initCode` branch assumes: if viem ever returns the v0.7 `factory`/`factoryData` split, `uo.initCode` becomes `undefined`, the ternary silently no-ops, and deploy-op attribution is dropped with zero error rather than failing loud.

3. **The suffix length is validated in only one of two construction paths.** The 16-byte/hex check (`isValidAttributionSuffix`) runs only when the suffix is passed to the constructor. The provider path (`computeAttributionSuffix`) sets the suffix from `slice(keccak256(...), 0, 16)` and never flows through the validator. The single point of use, `appendAttributionSuffix`, asserts nothing, so a future provider sourcing the suffix differently could concatenate an arbitrary-length blob onto every signed UserOperation.

4. **`send`/`sendBatch` prepare the UserOperation twice.** Both forward only `{ account, callData, initCode, paymaster: true }` into `sendUserOperation`, dropping every other prepared field (nonce, gas limits, fee fields, paymaster data). With `account` present, viem re-runs the entire prepare pipeline a second time over the suffixed bytes, including a second `pm_sponsorUserOperation`. The explicit prepare is wasted, the first sponsorship result is discarded, and sponsorship-policy counters / per-quote paymaster charges are consumed at 2x. The second prepare re-estimates gas against the *suffixed* (actually-executed) bytes, so the signed op is internally self-consistent on gas (this is why F037 reduces to a wasted-prepare/double-sponsorship operational hazard, not a fund-loss under-gas defect).

Fund-safety framing: the suffix-on-signed-bytes mutation (1, 2) is the load-bearing risk. The SDK already knows the suffix it appended and the args it prepared, so it can assert the mutation is inert before signing instead of trusting the decoder blindly. The double-prepare (4) is an operational hazard (2x sponsorship), not a signing defect.

## Findings

- **F063** — `appendAttributionSuffix` is applied to `uo.initCode` (deployment calldata) in both `send` and `sendBatch`, mutating the factory `createAccount(owners, nonce)` bytes with no version/shape assertion (`packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:232-234,277-279`, with the helper at `:594-598`). The suffixed callData/initCode is what gets signed; correctness relies on the decoder tolerating trailing bytes, which is never asserted.
- **F059** — premise refuted, but it confirms F063 is live. The `uo.initCode` branch was assumed dead because EntryPoint v0.7 returns `factory`/`factoryData` not `initCode`; in fact `toCoinbaseSmartAccount` pins EntryPoint to **v0.6** regardless of account `version: '1.1'` (`DefaultSmartWallet.ts:205`), so `uo.initCode` IS populated on the undeployed path (`:232-234,277-279`) and the suffix mutates live deployment bytes. The fix must add an EntryPoint-version-aware guard so a future viem bump to the v0.7 split fails loud instead of silently dropping deploy attribution.
- **F065** — `appendAttributionSuffix` has no length assertion at the single point of use (`packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:594-598`); the 16-byte/hex check (`isValidAttributionSuffix`, `:178-188`) runs only on the constructor path (`:83-85`), while the provider path (`computeAttributionSuffix`, `packages/sdk/src/wallet/core/providers/smart/default/DefaultSmartWalletProvider.ts:58-60`) bypasses it.
- **F037** — `send`/`sendBatch` prepare the UserOperation, then forward only suffixed `callData`/`initCode`/`paymaster` into `sendUserOperation` (`packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:224-236,268-281`); with `account` present viem re-prepares the full op (incl. a second `pm_sponsorUserOperation`), so every sponsored send fires sponsorship twice and discards the first prepare. The signed op is self-consistent over the suffixed bytes, so this is wasted-prepare + double-sponsorship, not under-gas.

## Root cause

A raw byte concatenation (`concatHex([bytes, suffix])`) is performed on already-prepared, about-to-be-signed UserOperation fields with no surrounding contract about what those bytes are:

- The mutation assumes the on-chain decoder ignores trailing bytes, but that assumption is never asserted at the seam where the SDK still holds both the pre-suffix args and the suffix.
- The `initCode` branch assumes the v0.6 EntryPoint shape (where `uo.initCode` exists) but reads it conditionally and silently no-ops on any other shape instead of asserting the negotiated version.
- The 16-byte invariant lives in a constructor-only static helper, not at the single choke point (`appendAttributionSuffix`) every construction route passes through.
- `send`/`sendBatch` use `sendUserOperation` as if it accepts a fully prepared op, but pass only callData/initCode, so the explicit `prepareUserOperation` is structurally wasted and triggers a second prepare+sponsorship.

## Recommended approach

SDK refactor (in scope). Augment issue #456. This is the smart-wallet signing path, not demo/CLI, so the asserts below belong in the SDK.

1. **Assert the suffix is inert before signing (F063, primary).** In `appendAttributionSuffix` (or at the call site immediately before `sendUserOperation`), after building the suffixed bytes, decode them back and assert equivalence to the pre-suffix op:
   - For `callData`: decode the suffixed bytes through the `execute`/`executeBatch` ABI and assert the recovered `(to, value, data)` (or calls array) equals what `prepareUserOperation` produced. Fail loud (throw) if the trailing 16 bytes are not tolerated as inert.
   - For `initCode`: decode the suffixed bytes as `factory ++ createAccount(owners, nonce)` and assert the recovered `owners`/`nonce` are unchanged. The factory prefix and decoded args must be identical to the unsuffixed initCode.
   - Asserting against the same `owners`/`nonce`/calls the SDK already prepared is fail-closed-where-the-SDK-already-knows, not intent-guessing.

2. **Guard the EntryPoint version on the initCode branch (F059).** Before appending to `uo.initCode`, assert the negotiated EntryPoint is the v0.6 shape this branch assumes (the shape where `initCode` is the factory-prefixed field). If a future viem version returns the v0.7 `factory`/`factoryData` split (so `uo.initCode` is `undefined`), throw rather than silently dropping deploy attribution. The current "silent no-op on undefined" must become "fail loud, attribution could not be placed."

3. **Hoist the 16-byte assertion to the single choke point (F065).** Assert `isHex(this.attributionSuffix) && size(this.attributionSuffix) === 16` inside `appendAttributionSuffix` (or a shared setter) so every construction route is covered, and route `DefaultSmartWalletProvider.computeAttributionSuffix` output through the same validator. Keep the constructor check; the point is no value reaches `concatHex` unvalidated.

4. **Collapse the double prepare (F037).** Stop forwarding only callData/initCode. Either (a) spread the prepared op and override just the suffixed fields, `sendUserOperation({ ...uo, callData: appendAttributionSuffix(uo.callData), initCode: uo.initCode ? appendAttributionSuffix(uo.initCode) : uo.initCode, paymaster: true })`, so no second prepare runs; or (b) drop the explicit `prepareUserOperation` and inject the suffix via viem's `callData`/prepare-override path so a single prepare (and single `pm_sponsorUserOperation`) produces the suffixed signed op. Either way the goal is exactly one prepare and one sponsorship request per send, and the signed op is the prepared+suffixed op. Note the gas re-estimate is already against the suffixed bytes, so this is correctness-neutral on gas and purely removes the wasted second sponsorship.

Consistency note: `send` and `sendBatch` are siblings with identical suffix/prepare logic (`:224-236` vs `:268-281`); all four fixes must land on both so the two paths stay consistent.

## Affected files

- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:224-236` (`sendBatch`; double-prepare and suffix append on callData/initCode)
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:268-281` (`send`; sibling double-prepare and suffix append)
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:594-598` (`appendAttributionSuffix`; raw `concatHex` choke point, no length/inert/version assert)
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:178-188` (`isValidAttributionSuffix`; constructor-only validator to hoist)
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:205` (account `version: '1.1'` → EntryPoint v0.6, the basis for the version guard)
- `packages/sdk/src/wallet/core/providers/smart/default/DefaultSmartWalletProvider.ts:58-60` (`computeAttributionSuffix`; provider path that bypasses `isValidAttributionSuffix`)
- `packages/sdk/src/wallet/core/wallets/smart/default/__tests__/DefaultSmartWallet.spec.ts:178-185,251-258,533-554` (suffix tests that assert `concatHex` against `concatHex`; add independent decode assertions)

## Acceptance criteria / tests

- **Inert-suffix decode (F063):** a unit test decodes the suffixed `callData` through the `execute`/`executeBatch` ABI and asserts the recovered calls equal the pre-suffix calls; a mutation that appends a non-inert / wrong-length suffix must throw. For `sendBatch`'s deploy leg, decode the suffixed `initCode` and assert the recovered `createAccount(owners, nonce)` args are unchanged. These must be independent oracles, not `concatHex([data, suffix])` recomputed (the current `:181-182,254-255` assertions recompute the production expression and cannot fail on a mis-encoding).
- **EntryPoint-version guard (F059):** a test where `uo.initCode` is `undefined` (simulated v0.7 split) asserts the wallet throws "attribution could not be placed" rather than silently sending an unsuffixed deploy op. The current undeployed path (v0.6, populated `initCode`) continues to append and pass the inert-decode assertion.
- **Single-point length assert (F065):** a test sets the suffix via the provider path (`computeAttributionSuffix`) and via a forced non-16-byte value, and asserts `appendAttributionSuffix` rejects anything that is not exactly 16 hex bytes. The existing constructor-rejection tests (`:533-554`) continue to pass.
- **Single prepare / single sponsorship (F037):** a test asserts `prepareUserOperation` (and `pm_sponsorUserOperation`) is invoked exactly once per `send`/`sendBatch`, and that the op handed to `sendUserOperation` carries the prepared nonce/gas/fee fields (not just callData/initCode). A mutation reintroducing the bare `{ account, callData, initCode, paymaster }` forward must fail this test.

## Notes

- This is a single augmentation of #456 (which already tracks the double-prepare). The suffix-safety asserts (F063/F059/F065) and the double-prepare collapse (F037) are tightly coupled because the double-prepare is *why* the suffix is the only field passed explicitly, and fixing the forward without the asserts would still ship unguarded suffix mutation. Land them together.
- Permit2 / signed-bytes scope: the suffix is concatenated into the bytes covered by the UserOperation signature, so the inertness and version asserts are squarely in signing-path scope.
- RPC/bundler trust is out of scope: this ticket does not add bundler `eth_chainId` reconciliation or otherwise harden bundler-returned values; integrators bring their own bundler/RPC per the documented assumption. The fix only asserts properties of bytes the SDK itself mutated (the appended suffix) against args the SDK itself prepared.
- F059 also requires a ledger correction: its "deployment-op attribution silently dropped on v0.7" premise is inverted (EntryPoint is v0.6, initCode is present), so it should be re-scoped to "add the v0.6/v0.7 version guard" rather than closed as a no-op.
- On-chain proof (suffixed callData/initCode submitted to a real bundler+account that the EntryPoint accepts, with the trailing bytes proven inert) belongs to the single consolidated Anvil feature-test ticket; the mocked-bundler unit decode assertions above are the catchable surface here. F236/F213/F224 are the test-debt twins (suffix tests assert `concatHex` against itself) and are satisfied by the independent-decode tests added in this ticket.
