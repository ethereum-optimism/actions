# Clear poisoned init promise and reconcile WalletNamespace init retryability

| Field | Value |
| --- | --- |
| **Severity** | low |
| **Complexity** | 2 / 5 |
| **Domain** | wallet |
| **Surface** | `WalletNamespace.resolveProvider` (`_initPromise` lifecycle), `actions.ts` `createWalletProvider` optional-`smartWalletConfig` deref, `Wallet` base constructor address init |
| **Resolves findings** | F266, F077, F024 |
| **Candidate existing issue** | none |
| **Blocked by** | (none) |

## Problem

Three small init-path defects on the wallet-construction seam that every signed action flows through. None moves value on its own, but each either bricks a documented construction path or weakens the base-class guarantee that gates value-moving methods.

1. **One transient factory failure permanently poisons a namespace.** `WalletNamespace.resolveProvider` caches `this._initPromise` once and never clears it on rejection. If the lazy provider factory rejects once (a transient config/network hiccup loading a hosted-wallet vendor SDK), the rejected promise stays cached and every later `createSmartWallet` / `getSmartWallet` / `createSigner` / `hostedWalletProvider` / `smartWalletProvider` call re-returns the same rejection for the lifetime of the namespace. The condition can clear and the namespace still cannot recover without being rebuilt.

2. **The documented optional-`smartWalletConfig` path throws a `TypeError` at first wallet use.** `createWalletProvider` enters its default-provider branch when `!config.smartWalletConfig`, then inside that same branch reads `config.smartWalletConfig.provider.attributionSuffix`. When `smartWalletConfig` is omitted (the documented optional shape), the branch is taken and the body dereferences `undefined`, crashing wallet provider construction.

3. **The base `Wallet` constructor wires action namespaces before any address exists.** The abstract constructor attaches `lend`/`swap`/`borrow` namespaces (which capture `wallet`) but never initializes the wallet address; `_address` is only set by `performInitialization()`, invoked solely from the concrete `create()` factories. A `Wallet` obtained through any path that skips `initialize()` has live, value-moving namespaces wired against an uninitialized wallet, with the per-subclass `get address` throw as the only backstop.

Fund-safety framing: all three are availability/correctness defects rather than direct fund loss. Defect 1 and defect 2 fail closed today (a thrown error, no value moves) but defeat documented retry and optional-config contracts. Defect 3 is the weakest backstop: namespaces are reachable before the address invariant holds, so the failure surfaces deep in `dispatch`/`send` instead of at construction. The SDK already knows the answer in every case (the sibling `Wallet.initialize` clears its promise on failure; the optional read is a known-undefined deref; the base class can assert its own init invariant), so each is a fail-closed / cross-locus-consistency fix, not intent-guessing.

## Findings

- **F266** — `resolveProvider` sets `this._initPromise = this._providerFactory().then(...)` once with no rejection handler, so a single transient factory rejection is cached forever and poisons every later provider call for the namespace lifetime (`packages/sdk/src/wallet/core/namespace/WalletNamespace.ts:228-239`). The sibling init primitive `Wallet.initialize` deliberately clears its promise on failure to allow retry (`packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts:162-174`), so two init paths in the same module disagree on retryability.
- **F077** — `createWalletProvider`'s default-provider branch is entered when `!config.smartWalletConfig` (line 252) but its body reads `config.smartWalletConfig.provider.attributionSuffix` (line 260-261), throwing `TypeError` on the documented optional-config path (`packages/sdk/src/actions.ts:250-267`).
- **F024** — the base `Wallet` constructor attaches `lend`/`swap`/`borrow` namespaces but never initializes the wallet address; `_address` is set only by `performInitialization()` via the concrete `create()` factories, so a wallet built off the factory path has namespaces wired against an uninitialized address (`packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts:90-100`).

## Root cause

Two sibling init primitives in the wallet module disagree on retryability: `Wallet.initialize` clears its cached promise in the `catch` so callers may retry, while `WalletNamespace.resolveProvider` caches a rejected promise with no `catch` (F266). Separately, `createWalletProvider` collapses "no smart-wallet config" and "default provider" into one branch but reads a field that only exists in the latter case (F077), and the base `Wallet` constructor treats namespace attachment and address initialization as independent steps with nothing enforcing that the address invariant holds before namespaces are usable (F024). All three are construction-seam invariants the SDK can enforce locally without trusting any external input.

## Recommended approach

SDK refactor, scoped to the three loci. Make the namespace init path match its already-correct sibling, fix the two construction bugs, and add the missing tests.

1. **Clear the poisoned promise on rejection (F266).** Mirror `Wallet.initialize`: attach a rejection handler that nulls `this._initPromise` before rethrowing, so a later call re-runs the factory once the transient condition clears. For example `this._initPromise = this._providerFactory().then((p) => { this._provider = p; return p }).catch((err) => { this._initPromise = null; throw err })`. Only `_provider` (set inside `.then`) remains the success cache; on rejection both `_initPromise` and `_provider` are cleared so the `if (this._provider)` short-circuit and the `if (!this._initPromise)` re-init guard both behave. This makes the two init primitives consistent on retryability.

2. **Guard the optional-config read (F077).** Use optional chaining on the dereference: `attributionSuffix: config.smartWalletConfig?.provider.attributionSuffix`. The default `DefaultSmartWalletProvider` already accepts an undefined `attributionSuffix`, so the omitted-config path constructs cleanly instead of throwing.

3. **Enforce the address invariant in the base class (F024).** Gate the value-moving entrypoints on initialization rather than relying on the per-subclass `get address` throw: either set an `initialized` flag in `initialize()` and assert it (or assert `_address` is set) at the start of `send`/`sendBatch`, or assert `_address` before building the UserOp in `DefaultSmartWallet.send`/`sendBatch`. Prefer the base-class assertion so every concrete wallet inherits a single, consistent backstop instead of each subclass re-implementing it. This keeps the namespace-attachment loop untouched (adding a future action stays a registry entry) and only adds the missing guard.

## Affected files

- `packages/sdk/src/wallet/core/namespace/WalletNamespace.ts:228-239` — `resolveProvider` caches `_initPromise` with no rejection handler (F266).
- `packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts:162-174` — `Wallet.initialize`, the sibling primitive that already clears its promise on failure; the retryability reference shape for F266.
- `packages/sdk/src/actions.ts:250-267` — `createWalletProvider` default-provider branch dereferences `config.smartWalletConfig.provider.attributionSuffix` when `smartWalletConfig` is undefined (F077).
- `packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts:90-100` — base constructor attaches namespaces but never initializes the wallet address (F024).
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts` (`send`/`sendBatch`, `get address`) — the concrete seam where an uninitialized `_address` currently throws as the only backstop; candidate locus for the F024 assertion if not added to the base class.

## Acceptance criteria / tests

- A `WalletNamespace` constructed with a factory that rejects on its first call and resolves on the second: `await ns.smartWalletProvider()` (or any provider entrypoint) rejects the first time, then a later call re-runs the factory and resolves. A test that asserts the second call still rejects (today's behavior) must now fail.
- `resolveProvider` leaves `_initPromise` null after a rejection (so the re-init guard fires) and leaves `_provider` set only on success.
- Constructing `Actions` with a wallet config that omits `smartWalletConfig`, then triggering wallet provider creation, builds a `DefaultSmartWalletProvider` (with `attributionSuffix` undefined) instead of throwing `TypeError`.
- A `Wallet` obtained without running `initialize()` (the off-factory path) fails closed with a typed/clear error when a value-moving method (`send`/`sendBatch`, or a namespace dispatch) is invoked, rather than surfacing the failure deep inside `dispatch`. A test that drives `swap.swap()` (or `send`) on an uninitialized wallet asserts the init guard throws before any UserOp/transaction is built.

## Notes

- F266 is a whole-flow lifecycle inconsistency, not an isolated bug: the fix is explicitly "make `resolveProvider` behave like `Wallet.initialize`," so the two init primitives stop disagreeing. The recommendation pairs the change with a reject-once-then-succeed retry test so the cached-rejection regression can't return.
- F266 is not reachable when a concrete provider instance is passed to the constructor (synchronous resolve, `_provider` set directly); the defect is specific to the lazy `_providerFactory` path.
- F024 carries a per-finding candidate issue (#396) in the review ledger; this ticket is filed as net-new at the bundle level (no augment) because F266 and F077 have no existing issue and the three share the construction-seam init theme. If implementation prefers to land the F024 assertion against #396, link it there; the fix itself is unchanged.
- The end-to-end exercise of these paths under real vendor creds + Anvil-simulated signing belongs to the single consolidated Anvil feature-test ticket, not here. The acceptance tests above are unit-level and need no live bundler/paymaster.
