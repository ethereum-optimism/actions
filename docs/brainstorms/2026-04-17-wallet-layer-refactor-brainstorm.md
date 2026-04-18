# Brainstorm: Wallet Layer Refactor — Align with Lend/Borrow Provider Pattern

**Date:** 2026-04-17
**Status:** Brainstorm complete, ready for planning
**Related:** #330 (hosted→embedded rename), #370 (send/sendTokens rename), #354 (agent wallet research)

---

## What We're Building

A refactor of the Actions SDK's wallet layer to reduce duplication, hoist shared behavior, and align with the lend/borrow provider pattern. The public API surface (`ActionsConfig`) stays functionally the same; internals collapse from ~35 files to ~20 and gain the structural shape needed for connected-wallet support and a second smart-wallet implementation.

Scope is structural + renames only. Ships as a series of sub-issues after the current Local Wallet PR (#356) merges.

---

## Current State

### Problems

1. **Node/react duplication.** `PrivyWallet`, `TurnkeyWallet`, and their providers exist twice — once in `wallet/node/`, once in `wallet/react/`. They differ only in which `createSigner` utility they import (10–30 lines of SDK adapter code). Everything else duplicates.

2. **Thin wallet subclasses.** `LocalWallet`, `PrivyWallet`, `TurnkeyWallet`, `DynamicWallet` all reduce to "produce a `LocalAccount`, then behave as an EOA." They add no behavior beyond assigning `signer` and `address`.

3. **Duplicate registries.** `NodeHostedWalletProviderRegistry` and `ReactHostedWalletProviderRegistry` are parallel type→provider maps.

4. **Overstuffed provider layer.** Four layers of indirection (`HostedWalletProvider` → `WalletProvider` unifier → `WalletNamespace` → concrete provider) for what the lend/borrow pattern does in two.

5. **`EOAWallet` is a misnomer.** The class doesn't require EOAs — it wraps any viem `Account`. Privy and others can issue embedded smart wallets; the class still works. The real distinction vs `SmartWallet` is "signer IS the wallet" vs "signer is an OWNER of a separate contract account."

6. **`send`/`sendTokens` naming is confusing.** `send()` takes raw `TransactionData` (low-level); `sendTokens()` takes amount/asset/recipient (high-level). And `sendTokens()` only exists on `SmartWallet` — the logic should be shared. (See #370.)

7. **`hosted` is imprecise.** Privy/Turnkey/Dynamic are hosted; `LocalWallet` is not. Local accounts aren't hosted in any service. (See #330: rename to `embedded`.)

8. **`DefaultSmartWallet` is a misnomer post-ZeroDev.** Once a second concrete smart wallet lands (`ZeroDevSmartWallet`, needed for session keys — see #354), "default" stops meaning anything. It's really `CoinbaseSmartWallet` (wraps Coinbase Smart Wallet contracts).

### Why the current structure exists

- The node/react split is load-bearing: the SDK is consumed in both environments, and provider SDKs differ per env (`@privy-io/node` vs `@privy-io/react-auth`). We keep the split; we just stop duplicating the non-SDK code across it.
- The `EOAWallet`/`SmartWallet` distinction is real — they have different tx submission paths (`WalletClient.sendTransaction` vs `BundlerClient.sendUserOperation`) and different return types. We keep the branching; we just rename.

---

## Why This Approach

### Mirror the `LendProvider<TConfig>` pattern

The lend/borrow side of the SDK is the canonical provider pattern:

```
LendProvider<TConfig> (abstract)
  • public methods (openPosition, getMarket, ...) do cross-provider work:
    validation, amount conversion, approval building, chain intersection
  • protected _methods (_openPosition, _getMarket, ...) are the extension points
  • TConfig allows provider-specific config shapes
  • intersects protocolSupportedChainIds() with SDK + user chains

Concrete: AaveLendProvider extends LendProvider<LendProviderConfig>
           MorphoLendProvider extends LendProvider<LendProviderConfig>
```

Adopting this on the wallet side gives us one `WalletProvider<TConfig>` base with protected `_methods`, and concrete providers per protocol that stay thin.

### Keep the node/react split, minimize per-env code

Each protocol directory gets a three-file shape:

```
wallet/providers/privy/
  PrivyWalletProviderBase.ts    # shared — all non-SDK logic
  node/PrivyWalletProvider.ts   # thin: imports @privy-io/node, implements _createSigner
  react/PrivyWalletProvider.ts  # thin: imports @privy-io/react-auth, implements _createSigner
```

Package entry points (`index.node.ts`, `index.react.ts`) re-export the right per-env class. Consumers still import from `@eth-optimism/actions-sdk/node` or `/react` as before.

### Collapse thin wallet subclasses to one concrete class

`LocalWallet`, `PrivyWallet`, `TurnkeyWallet`, `DynamicWallet` all become a single concrete `ExternalWallet`. Each provider's `_createSigner` returns a `LocalAccount`; the provider constructs `ExternalWallet.create({ account, ... })`. Zero behavioral loss, four fewer files per env, four fewer test files.

### Rename for accuracy

- `EOAWallet` → **`ExternalWallet`** (signer IS the wallet; contrast with SmartWallet where signer is an owner)
- `HostedWalletProvider` → **`EmbeddedWalletProvider`** (#330)
- `DefaultSmartWallet` → **`CoinbaseSmartWallet`** (makes room for `ZeroDevSmartWallet`)
- `wallet.send()` (raw tx) → **`wallet.submit()`** (#370)
- `wallet.sendTokens()` (high-level) → **`wallet.send()`** (#370)

### Hoist shared behavior to `Wallet` base (#370 expanded)

The following are not wallet-type-specific and belong on the base:
- **`send(amount, asset, chainId, recipient)`** — token transfer with ENS support (currently only on `SmartWallet`)
- **`signMessage(message)`** — viem message signing
- **`signTypedData(data)`** — EIP-712 typed data signing

Subclasses implement abstract `submit()`/`submitBatch()` — these differ in return type and path.

### Shape for connected wallets

Generalize the signer type on `ExternalWallet` from `LocalAccount` to viem's `Account` union (`LocalAccount | JsonRpcAccount`). WalletConnect / injected providers produce `JsonRpcAccount`-compatible accounts. When `ConnectedWalletProvider` lands, it slots in without base changes.

### Room for a second smart wallet

The `SmartWallet` / `SmartWalletProvider` abstract bases already resemble the `LendProvider` shape — one abstract parent, one concrete child. Verify they don't encode Coinbase-specific assumptions, then add `ZeroDevSmartWallet` as a sibling. This directly unblocks the agent-wallet work (which needs ERC-7579 session keys that Coinbase Smart Wallet doesn't support).

---

## Proposed Architecture

### Class hierarchy

```
Wallet (abstract)                                  wallet/core/wallets/Wallet.ts
│   • getBalance()
│   • send(amount, asset, chainId, recipient)      ← HOISTED (#370)
│   • signMessage(message)                         ← HOISTED (#370 expanded)
│   • signTypedData(data)                          ← HOISTED (#370 expanded)
│   • submit(tx, chainId)           *abstract      ← RENAMED from send() (#370)
│   • submitBatch(txs, chainId)     *abstract      ← RENAMED from sendBatch() (#370)
│   • lend, swap namespaces
│
├── ExternalWallet (concrete)                     ← RENAMED from EOAWallet
│     • no subclasses — LocalWallet, PrivyWallet, TurnkeyWallet, DynamicWallet all gone
│     • submit() via viem WalletClient (standard tx)
│     • signer: Account (LocalAccount | JsonRpcAccount)
│
└── SmartWallet (abstract)
    │   • submit() via BundlerClient (ERC-4337 UserOp)
    │   • addSigner / removeSigner / findSignerIndexOnChain / deploy
    │
    ├── CoinbaseSmartWallet (concrete)             ← RENAMED from DefaultSmartWallet
    └── ZeroDevSmartWallet (concrete)              ← NEW, enables session keys
```

### Provider hierarchy (mirrors `LendProvider<TConfig>`)

```
WalletProvider<TConfig> (abstract)
│   • public: toActionsWallet(params), createSigner(params)
│   • protected abstract: _toActionsWallet(params), _createSigner(params)
│   • holds chainManager, lendProviders, swapProviders, supportedAssets
│
├── PrivyWalletProviderBase (abstract)
│   ├── [node]  PrivyWalletProvider
│   └── [react] PrivyWalletProvider
│
├── TurnkeyWalletProviderBase (abstract)
│   ├── [node]  TurnkeyWalletProvider
│   └── [react] TurnkeyWalletProvider
│
├── DynamicWalletProvider (concrete, react-only)
├── LocalWalletProvider (concrete, env-agnostic)
└── ConnectedWalletProvider (future, post-refactor)


SmartWalletProvider (abstract)
├── CoinbaseSmartWalletProvider (concrete)
└── ZeroDevSmartWalletProvider (concrete)         ← NEW
```

### Directory layout

```
packages/sdk/src/wallet/
  core/
    wallets/
      Wallet.ts
      ExternalWallet.ts
      smart/
        SmartWallet.ts
        coinbase/CoinbaseSmartWallet.ts
        zerodev/ZeroDevSmartWallet.ts
    providers/
      WalletProvider.ts
      smart/
        SmartWalletProvider.ts
        coinbase/CoinbaseSmartWalletProvider.ts
        zerodev/ZeroDevSmartWalletProvider.ts
    namespace/
      WalletNamespace.ts

  providers/
    privy/    { Base.ts + node/ + react/ }
    turnkey/  { Base.ts + node/ + react/ }
    dynamic/  { react/ }
    local/    { LocalWalletProvider.ts }

  index.node.ts    # re-exports node-side providers + common
  index.react.ts   # re-exports react-side providers + common
```

### Public API (ActionsConfig)

Shape unchanged; keys renamed via #330:

```typescript
createActions({
  chains: [...],
  wallet: {
    embeddedWalletConfig: {                         // was: hostedWalletConfig (#330)
      provider: { type: 'privy', config: { privyClient } },
    },
    smartWalletConfig: { provider: { type: 'coinbase' } },  // was: 'default'
  },
})

const w = await actions.wallet.toActionsWallet({ walletId, address })
await w.send(10, USDC, base.id, 'alice.eth')         // ENS-aware (#370)
await w.submit({ to, value, data }, base.id)         // raw tx (#370)
await w.signMessage('hello')                         // hoisted
```

Deprecation aliases recommended for one release cycle on #330 and #370.

### File-count impact

~35 wallet files → ~20. Bulk of reduction comes from (a) collapsing 4 wallet subclasses per env, (b) single-sourcing per-protocol base classes, (c) merging registries.

---

## Sub-Issue Decomposition

Each sub-issue is a self-contained PR with its own tests. Blocking flag refers to whether the issue gates the agent-wallet work tracked in #354.

| # | Issue | Blocks agent work? |
|---|---|---|
| 1 | **#330** — Rename `hosted` → `embedded` | No |
| 2 | **#370** — Rename `send`/`sendTokens`, hoist `send`/`signMessage`/`signTypedData` to `Wallet` base | No |
| 3 | **NEW** — Rename `EOAWallet` → `ExternalWallet` | No |
| 4 | **NEW** — Collapse thin wallet subclasses into concrete `ExternalWallet` | No |
| 5 | **NEW** — Introduce `WalletProvider<TConfig>` base + protected `_methods` pattern | No |
| 6 | **NEW** — Per-protocol restructure: `Base.ts` + `node/` + `react/` | No |
| 7 | **NEW** — `ConnectedWalletProvider` (full implementation, post-refactor) | No |
| 8 | **NEW** — Rename `DefaultSmartWallet*` → `CoinbaseSmartWallet*`; verify `SmartWallet` base supports second impl | Yes (prerequisite for #9) |
| 9 | **NEW** — Implement `ZeroDevSmartWallet` + `ZeroDevSmartWalletProvider` (ERC-7579, enables session keys) | **Yes (directly required by agent work)** |

### Dependency graph

```
#330 (ship first — pure rename)
  │
  ├── External path:  #3 ─► #4 ─► #5 ─► #6 ─► #7
  │
  ├── Smart path:     #8 ─► #9  ← unblocks agent work
  │
  └── Methods:        #370 (standalone, can land any time)
```

### Relationship to agent wallet work (#354)

The agent brainstorm in #354 defined 10 issues. Two overlap with this refactor:

- **Agent Issue 1 (`type: 'local'` provider)** — shipping in PR #356.
- **Agent Issue 3 (Coinbase → ZeroDev migration)** — becomes issues #8 + #9 in this refactor. This is the ONLY agent-gating piece; agent work can proceed independently of everything else in this list.

This brainstorm supersedes #354 on the `hosted`→`embedded` rename (they deferred; we're doing it).

---

## Key Decisions

1. **Preserve node/react split.** Load-bearing: different provider SDKs per env. We reduce per-env code to the SDK adapter only (~30 lines), not eliminate the split.
2. **Preserve `ActionsConfig` shape.** Keys rename (#330), nesting doesn't change. Deprecation aliases for one release cycle.
3. **Rename `EOAWallet` → `ExternalWallet`.** Accurate for the "signer IS the wallet" case; doesn't falsely claim EOA-ness.
4. **Rename `DefaultSmartWallet` → `CoinbaseSmartWallet`.** "Default" stops meaning anything once `ZeroDevSmartWallet` lands.
5. **Hoist `send`, `signMessage`, `signTypedData` to `Wallet` base.** Not wallet-type-specific. (Extends #370's original scope.)
6. **Generalize `ExternalWallet.signer` to `Account` union.** Enables `ConnectedWalletProvider` later without base changes.
7. **Mirror `LendProvider<TConfig>`.** One abstract base, protected `_methods`, concrete providers stay thin.
8. **Per-protocol `Base.ts` + `node/` + `react/` layout.** Shared base holds non-SDK logic; per-env files contain only SDK imports + `createSigner` + thin subclass.
9. **Split refactor across sub-issues, not one mega-PR.** Each sub-issue stands alone, lands independently, gets its own review.
10. **#9 (`ZeroDevSmartWallet` impl) lands as part of this refactor, not agent work.** It's wallet-layer infrastructure; agent work consumes it.

---

## Resolved Questions

1. **Should connected-wallet support land in this refactor?** No — design for it (#7 tracks full implementation; `Account` union goes in #5 so the shape is ready).
2. **Should the node/react split be eliminated?** No — it's load-bearing for per-env provider SDK imports. Reduce duplication within the split.
3. **Should the wallet refactor land as one PR?** No — series of sub-issues, each self-contained.
4. **What to name `EOAWallet`?** `ExternalWallet`.
5. **Should `hosted` stay or rename?** Rename to `embedded` (#330 already open; sub-issue of this refactor).

## Open Questions

1. **Deprecation alias strategy for `hosted`→`embedded` (#330)** — maintain both exports for one release cycle, or break cleanly? Leaning toward one-release alias.
2. **Order of #370 relative to the structural issues** — land it standalone first for a smaller diff, or bundle with #3 for one atomic rename pass? Leaning toward standalone.
3. **Should `EOAWallet`→`ExternalWallet` ship deprecation aliases?** It's an internal-facing class name; likely not worth the churn. Confirm during planning.

---

## Sources & References

- **Issue #330** — Rename hosted wallet provider to embedded wallet provider
- **Issue #370** — Refactor: rename send/sendTokens and DRY up token transfer logic
- **PR #354** — Agent wallet support research brainstorm (superseded by this doc on the `hosted`→`embedded` question)
- **PR #356** — Add `type: 'local'` provider (currently in review; ships first)
- **Engineering principles #380** — Abstraction hierarchy guidance that motivated this refactor
- **Internal reference** — `packages/sdk/src/lend/core/LendProvider.ts` (canonical provider pattern)
