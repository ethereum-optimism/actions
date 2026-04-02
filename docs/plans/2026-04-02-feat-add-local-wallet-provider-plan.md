---
title: "feat: Add type: 'local' Provider to SDK"
type: feat
status: active
date: 2026-04-02
origin: docs/brainstorms/2026-04-01-eoa-and-agent-wallet-support-brainstorm.md
---

# Add `type: 'local'` Provider to SDK

## Overview

Add local EOA wallet support to the Actions SDK via two complementary features:

1. **`actions.wallet.fromLocalAccount(account)`** — a provider-agnostic method that wraps any viem `LocalAccount` into an Actions `Wallet`. Works alongside any configured provider (Privy, Turnkey, or local).

2. **`type: 'local'` provider** — a no-config provider option for developers who don't need an embedded wallet provider. Pairs with `fromLocalAccount()` for the full flow.

The SDK never handles raw private key material. Developers use viem's `privateKeyToAccount()` themselves and pass the resulting `LocalAccount` to the SDK.

See brainstorm: `docs/brainstorms/2026-04-01-eoa-and-agent-wallet-support-brainstorm.md`, Issue 1.

## Problem Statement / Motivation

The SDK currently only supports hosted wallet providers (Privy, Turnkey) that rely on external services. There is no way to use a local private key directly. This blocks:

- Agent workflows that need a local signer for UserOperation submission
- Dev/testing scenarios where spinning up Privy/Turnkey is unnecessary
- The entire smart wallet + session key architecture planned in subsequent issues

## Proposed Solution

### Usage — With Embedded Provider (Privy + Local Account)

```typescript
import { createActions } from '@eth-optimism/actions-sdk/node'
import { privateKeyToAccount } from 'viem/accounts'

// Privy as primary hosted provider
const actions = createActions({
  chains: { ... },
  wallet: {
    hostedWalletConfig: {
      provider: { type: 'privy', config: { privyClient } },
    },
    smartWalletConfig: { provider: { type: 'default' } },
  },
})

// Use Privy wallet
const privyWallet = await actions.wallet.toActionsWallet({ walletId: '...', address: '0x...' })

// Also use a local account at any time — no provider change needed
const agentAccount = privateKeyToAccount(process.env.AGENT_KEY as `0x${string}`)
const agentWallet = await actions.wallet.fromLocalAccount(agentAccount)
```

### Usage — Local Only

```typescript
import { createActions } from '@eth-optimism/actions-sdk/node'
import { privateKeyToAccount } from 'viem/accounts'

// No embedded provider needed
const actions = createActions({
  chains: { ... },
  wallet: {
    hostedWalletConfig: { provider: { type: 'local' } },
    smartWalletConfig: { provider: { type: 'default' } },
  },
})

// Developer manages key material, passes account to SDK
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`)
const wallet = await actions.wallet.fromLocalAccount(account)

// Also available via toActionsWallet for local provider
const wallet2 = await actions.wallet.toActionsWallet({ account })
```

## Technical Considerations

### Key Design Decisions

**1. SDK never touches key material.**
The developer calls `privateKeyToAccount()` themselves using viem. The SDK only receives a `LocalAccount` — no raw hex keys, no key scrubbing, no `toJSON()` overrides needed. All security concerns from the prior plan revision are eliminated by design.

**2. `fromLocalAccount()` is provider-agnostic.**
It lives on `WalletNamespace` and works regardless of which hosted provider is configured. It creates a `LocalWallet` directly using the namespace's internal deps (chain manager, lend/swap providers, supported assets). This enables mixed usage (Privy for user wallets + local account for agent wallets).

**3. `type: 'local'` is a thin no-config provider.**
`NodeOptionsMap['local']` is `undefined`, so `ProviderSpec` resolves to just `{ type: 'local' }` — no `config` field needed. Its `toActionsWallet()` accepts `{ account: LocalAccount }`. Its `createSigner()` returns the same account passed in.

**4. `LocalWallet` uses params object constructor.**
Matches the Privy/Turnkey pattern of `static async create(params)` with a params object. No `performInitialization()` override needed — base class provides the no-op default.

### Architecture

```
Developer code:
  privateKeyToAccount('0x...') → LocalAccount
      │
      ├──→ actions.wallet.fromLocalAccount(account)     // provider-agnostic
      │       └── LocalWallet.create({ account, ...deps })
      │
      └──→ actions.wallet.toActionsWallet({ account })  // via local provider
              └── LocalHostedWalletProvider.toActionsWallet({ account })
                      └── LocalWallet.create({ account, ...deps })
```

### Files to Create

| File | Purpose |
|------|---------|
| `packages/sdk/src/wallet/node/wallets/hosted/local/LocalWallet.ts` | Wallet class extending `EOAWallet` |
| `packages/sdk/src/wallet/node/providers/hosted/local/LocalHostedWalletProvider.ts` | Thin provider for `type: 'local'` registry entry |

### Files to Modify

| File | Change |
|------|--------|
| `packages/sdk/src/wallet/core/namespace/WalletNamespace.ts` | Add `fromLocalAccount(account: LocalAccount): Promise<Wallet>` method |
| `packages/sdk/src/wallet/node/providers/hosted/types/index.ts` | Add `local` to type maps; add `LocalHostedWalletToActionsWalletOptions` |
| `packages/sdk/src/wallet/node/providers/hosted/registry/NodeHostedWalletProviderRegistry.ts` | Register `'local'` provider |
| `packages/sdk/src/wallet/node/index.ts` | Export new classes and types |

### Tests to Create

| File | Coverage |
|------|----------|
| `packages/sdk/src/wallet/node/wallets/hosted/local/__tests__/LocalWallet.spec.ts` | Construction, signer assignment, address derivation, send/sendBatch |
| `packages/sdk/src/wallet/node/providers/hosted/local/__tests__/LocalHostedWalletProvider.spec.ts` | `toActionsWallet({ account })` returns `Wallet`, `createSigner({ account })` returns `LocalAccount` |
| `packages/sdk/src/wallet/core/namespace/__tests__/WalletNamespace.spec.ts` | `fromLocalAccount()` returns `Wallet` with correct address |
| Registry tests (existing file) | `'local'` factory: `getFactory`, `validateOptions`, `create` |
| Integration test | Full flow: `createActions({ type: 'local' })` → `fromLocalAccount(account)` → verify address |

## Type System Changes

```typescript
// packages/sdk/src/wallet/node/providers/hosted/types/index.ts

// Local provider takes a LocalAccount when creating wallets
export interface LocalHostedWalletToActionsWalletOptions {
  account: LocalAccount
}

// No config needed at createActions() time
interface NodeOptionsMap {
  privy: { privyClient: PrivyClient; authorizationContext?: AuthorizationContext }
  turnkey: { client: TurnkeyHttpClient | TurnkeyServerClient | TurnkeySDKClientBase }
  local: undefined  // ← no config
}

interface NodeHostedProviderInstanceMap {
  privy: PrivyHostedWalletProvider
  turnkey: TurnkeyHostedWalletProvider
  local: LocalHostedWalletProvider
}

interface NodeToActionsOptionsMap {
  privy: PrivyHostedWalletToActionsWalletOptions
  turnkey: TurnkeyHostedWalletToActionsWalletOptions
  local: LocalHostedWalletToActionsWalletOptions  // { account: LocalAccount }
}
```

With `NodeOptionsMap['local'] = undefined`, `ProviderSpec` resolves to `{ type: 'local' }` — no config needed.

## Acceptance Criteria

- [ ] `actions.wallet.fromLocalAccount(account)` returns a `Wallet` with correct address
- [ ] `fromLocalAccount()` works regardless of configured provider type (Privy, Turnkey, or local)
- [ ] `createActions({ ..., provider: { type: 'local' } })` works with no config
- [ ] `actions.wallet.toActionsWallet({ account })` works for local provider
- [ ] `actions.wallet.createSigner({ account })` returns the same `LocalAccount`
- [ ] SDK never receives or handles raw private key hex strings
- [ ] `LocalWallet` uses params object constructor matching Privy/Turnkey pattern
- [ ] No `performInitialization()` override (base class no-op is sufficient)
- [ ] Existing Privy and Turnkey providers are unaffected (no regressions)
- [ ] All new code has TypeDoc comments on public classes and methods
- [ ] Tests pass: unit + integration
- [ ] Exports available from `@eth-optimism/actions-sdk/node`
- [ ] `pnpm build && pnpm typecheck && pnpm lint` pass

## Dependencies & Risks

**Dependencies:** None — this is the starting point of the agent wallet work.

**Risks:**
- `fromLocalAccount()` needs access to chain manager and providers from the `WalletNamespace` internals. Need to verify these are accessible (they flow through the `WalletProvider` → `HostedWalletProvider` today). May need to store deps on the namespace or resolve them from the provider.
- `NodeOptionsMap['local'] = undefined` must be verified to work with `ProviderSpec` conditional (`undefined extends undefined` → `{ type: 'local' }` with no config).

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-01-eoa-and-agent-wallet-support-brainstorm.md](../brainstorms/2026-04-01-eoa-and-agent-wallet-support-brainstorm.md) — Key decisions carried forward: `type: 'local'` naming (#1), immediate `privateKeyToAccount()` conversion (#3), no rename of HostedWalletProvider (#6)

### Internal References

- WalletNamespace: `packages/sdk/src/wallet/core/namespace/WalletNamespace.ts`
- WalletProvider: `packages/sdk/src/wallet/core/providers/WalletProvider.ts`
- HostedWalletProvider (abstract): `packages/sdk/src/wallet/core/providers/hosted/abstract/HostedWalletProvider.ts`
- Existing provider pattern: `packages/sdk/src/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.ts`
- Registry: `packages/sdk/src/wallet/node/providers/hosted/registry/NodeHostedWalletProviderRegistry.ts`
- Type maps: `packages/sdk/src/wallet/node/providers/hosted/types/index.ts`
- ProviderSpec conditional: `packages/sdk/src/wallet/core/providers/hosted/types/index.ts:29-36`
- EOAWallet base: `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts`

### External References

- [viem privateKeyToAccount docs](https://viem.sh/docs/accounts/local/privateKeyToAccount)
- [viem LocalAccount type](https://viem.sh/docs/accounts/local)
