# Recreate smart wallet on signer/account switch

| Field | Value |
| --- | --- |
| **Severity** | low |
| **Complexity** | 2 (of 5) |
| **Domain** | frontend |
| **Surface** | `hooks/useDynamicWallet` and `hooks/useTurnkeyWallet` smart-wallet create-effect: the `if (isCreating || smartWallet) return` short-circuit that only resets on a null signer, and `useTurnkeyWallet`'s create-effect dep array that omits `httpClient`/`session`/the first-match `embeddedWallet.accounts[0].address` it reads |
| **Resolves findings** | F322 |
| **Candidate existing issue** | none |
| **Blocked by** | none |

## Problem

The smart wallet that signs every lend/borrow/swap is created exactly once and is never recreated when the underlying signer/account changes to a *different* account. Both frontend hooks guard creation with `if (isCreating || smartWallet) return` and only clear `smartWallet` when the signer goes fully null (logout). A non-null to different-non-null transition (the user switches accounts without a logout that nulls the signer) keeps the stale `SmartWallet` instance, and because `EarnWithFrontendWallet` memoizes both `operations` and `borrowOperations` on that `wallet`, subsequent lend/borrow/swap transactions are signed and submitted from the *previous* account's smart wallet.

This is a fund-safety hazard despite being demo-surface: the smart wallet is the signing-path identity that determines whose funds move. After an account switch, a deposit/borrow/repay the user believes they are making from account B is actually signed by account A's smart wallet. The downstream Earn cache reset is keyed on `walletAddress` (`Earn.tsx:430`), so if the address never updates, the cache clear also never fires and the UI keeps showing account A's balances and positions while the user operates as B. Display state and signing identity stay pinned to the prior account in lockstep, which makes the divergence hard to notice before a transaction confirms.

## Findings

- **F322** — Smart wallet is created once and never recreated on a signer/account switch (Dynamic and Turnkey). `useDynamicWallet` guards with `if (isCreating || smartWallet) return` and only resets `smartWallet` when `primaryWallet` becomes null, so a non-null to different-non-null signer transition retains the stale wallet; `useTurnkeyWallet` has the same guard and its create-effect deps omit `httpClient`/`session`/the first-match embedded address it reads, so a session/org or first-match change does not re-derive the signer. Post-switch lend/borrow/swap txs then sign from the prior account (`packages/demo/frontend/src/hooks/useDynamicWallet.ts:25,52`; `packages/demo/frontend/src/hooks/useTurnkeyWallet.ts:64,101`).

## Root cause

The create-effect treats "a smart wallet already exists" as a terminal state rather than "a smart wallet for *this* signer identity exists." The `smartWallet`-present branch of the guard short-circuits unconditionally, so the only path that clears the wallet is the explicit null check for a fully-disconnected signer.

- **Dynamic** (`useDynamicWallet.ts`): the effect resets only on `!primaryWallet` (line 19-23) and otherwise bails when `smartWallet` is set (line 25). `primaryWallet` is in the dep array (line 52), so the effect re-runs on an account switch, but the guard then returns early because `smartWallet` is non-null. The signer identity that changed (`primaryWallet`) is never compared against the identity the existing `smartWallet` was built from.
- **Turnkey** (`useTurnkeyWallet.ts`): same short-circuit (line 64), plus the create-effect dep array `[embeddedWallet, actions, isCreating, smartWallet]` (line 101) omits `httpClient`, `session`, and the concrete `embeddedWallet.accounts[0].address` the effect body reads (lines 73-75). A change in the resolved first-match embedded wallet, the Turnkey session, or the organization id therefore does not re-trigger creation, and even if it did the `smartWallet`-present guard would bail.

The downstream Earn cache reset (`Earn.tsx:429-434`) keys on `walletAddress`, which is derived from `wallet?.address` (`EarnWithFrontendWallet.tsx:61`). Because the stale wallet's address never changes, the cache clear that would otherwise surface the switch never fires either.

## Recommended approach

Review-only, low-risk fund-safety fix; no architectural refactor. The two hooks already hold the signer identity that should gate recreation, so this is the missing-obvious-consistency case: recreate the smart wallet (and let the existing address-keyed cache reset fire) when the signer identity changes, not only when it goes null. Keep both hooks symmetric so the Dynamic and Turnkey create-effects share the same recreate-on-identity-change shape.

1. **Key recreation on the signer identity, not just null (both hooks).** Track the identity the current `smartWallet` was built from and recreate when it differs. For Dynamic that identity is `primaryWallet` (or `primaryWallet.address`); for Turnkey it is the tuple of `embeddedWallet.accounts[0].address` and `session.organizationId`. The minimal change is to drop the unconditional `smartWallet`-present short-circuit in favor of a guard that bails only when the existing wallet already corresponds to the current signer identity, and to clear `smartWallet` to null first when the identity differs so the create path re-runs. Prefer a `useRef`/state that records the last-built identity over comparing the wallet's own address, since the goal is to detect the *signer* change that produced it.

2. **Add the read-but-missing deps to the Turnkey create-effect.** The effect body reads `httpClient`, `session.organizationId`, and `embeddedWallet.accounts[0].address`, but the dep array lists only `embeddedWallet`. Add the omitted values (or a stable derived identity key) so a session/org or first-match-embedded change re-runs the effect. This aligns Turnkey with Dynamic, whose `primaryWallet` is already a dep.

3. **Let the existing cache reset do its job.** Once the smart wallet recreates on an identity change, its `address` updates, `walletAddress` changes, and the `Earn.tsx:429-434` effect clears the query cache. No new cache-reset wiring is needed; the fix is upstream of it. Confirm the reset fires on the switch rather than adding a parallel reset path.

No SDK change is required: `actions.wallet.createSigner`/`createSmartWallet` already accept the new identity; this is entirely about when the demo hooks call them.

## Affected files

- `packages/demo/frontend/src/hooks/useDynamicWallet.ts:25` — `if (isCreating || smartWallet) return` short-circuits unconditionally when a wallet exists, so an account switch never recreates (F322).
- `packages/demo/frontend/src/hooks/useDynamicWallet.ts:19-23,52` — resets `smartWallet` only on `!primaryWallet`; the effect re-runs on `primaryWallet` change but the guard bails on the non-null branch (F322).
- `packages/demo/frontend/src/hooks/useTurnkeyWallet.ts:64` — same `if (isCreating || smartWallet) return` short-circuit (F322).
- `packages/demo/frontend/src/hooks/useTurnkeyWallet.ts:73-75,101` — effect reads `httpClient`, `session.organizationId`, and `embeddedWallet.accounts[0].address` but the dep array `[embeddedWallet, actions, isCreating, smartWallet]` omits them (F322).
- `packages/demo/frontend/src/components/earn/EarnWithFrontendWallet.tsx:47-54,61` — memoizes `operations`/`borrowOperations` on `wallet` and derives `walletAddress` from `wallet?.address`, so a stale wallet pins both the signing operations and the cache key (context for F322).
- `packages/demo/frontend/src/components/earn/Earn.tsx:429-434` — query-cache reset keyed on `walletAddress`; does not fire when the address never updates (context for F322).

## Acceptance criteria / tests

- Switching the underlying signer to a different non-null account (Dynamic: a new `primaryWallet`; Turnkey: a different first-match `embeddedWallet.accounts[0].address` or a new `session.organizationId`) recreates the smart wallet so that `smartWallet.address` reflects the new account. A test that flips the signer identity and asserts the returned wallet address changes must fail against the current short-circuit.
- After such a switch, `operations`/`borrowOperations` are rebuilt on the new wallet, so a lend/borrow/swap dispatched post-switch signs from the new account, not the prior one.
- The Turnkey create-effect re-runs when `httpClient`, `session.organizationId`, or the resolved first-match embedded address changes (dep-array coverage); a test that mutates one of those without changing `embeddedWallet` identity asserts the effect re-derives the signer.
- The `Earn.tsx` query-cache reset fires on the account switch because `walletAddress` changes; assert `queryClient.clear()` runs once per identity change.
- Logout (signer to null) still clears `smartWallet` as today; the recreate-on-identity-change path must not regress the existing null reset.

## Notes

- This is the demo frontend surface, so the change is review-only and scoped to the fund-safety/consistency fix: recreate on identity change and add the missing deps. No refactor of the hooks' structure or the Earn cache wiring beyond what the fix requires.
- The two hooks should land symmetric so a future reviewer reads one recreate-on-identity-change pattern, not two. Dynamic already has `primaryWallet` as a dep and only needs the guard change; Turnkey needs both the guard change and the dep-array additions.
- React's effect-dependency lint would have flagged the Turnkey omission (`httpClient`/`session`/`embeddedWallet.accounts[0].address` read but not depended on); confirm the project's exhaustive-deps configuration so the corrected deps do not get suppressed again.
- The repro that motivates the Turnkey half is a first-match change: if `wallets` resolves to a different first-match embedded wallet after `smartWallet` is already set, the create-effect keeps the old `SmartWallet` and the address-keyed cache clear never fires, so both the signing wallet and the displayed balances/positions stay bound to the prior account.
