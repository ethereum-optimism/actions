---
title: "feat: Add type: 'local' Provider to SDK"
type: feat
status: active
date: 2026-04-02
origin: docs/brainstorms/2026-04-01-eoa-and-agent-wallet-support-brainstorm.md
---

# Add `type: 'local'` Provider to SDK

## Overview

Add local EOA wallet support to the Actions SDK:

1. **`toActionsWallet()` accepts a `LocalAccount` directly** — regardless of configured provider. A developer with Privy can also pass a local account at any time. Runtime detection branches between provider params and `LocalAccount`.

2. **`type: 'local'` provider** — a no-config provider option for developers who don't need an embedded wallet provider.

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

// Also use a local account at any time — same method, different param
const agentAccount = privateKeyToAccount(process.env.AGENT_KEY as `0x${string}`)
const agentWallet = await actions.wallet.toActionsWallet(agentAccount)
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
const wallet = await actions.wallet.toActionsWallet(account)
```

## Technical Considerations

### Key Design Decisions

**1. SDK never touches key material.**
The developer calls `privateKeyToAccount()` themselves using viem. The SDK only receives a `LocalAccount` — no raw hex keys, no key scrubbing, no `toJSON()` overrides needed.

**2. `toActionsWallet()` accepts a union: provider params OR `LocalAccount`.**
Runtime detection: if `params` has `type === 'local'` and `signMessage`/`signTransaction` methods, it's a `LocalAccount` — create a `LocalWallet` directly. Otherwise, delegate to the hosted provider as before. This works regardless of configured provider type.

```typescript
async toActionsWallet(
  params: TToActionsMap[THostedProviderType] | LocalAccount,
): Promise<Wallet> {
  if (isLocalAccount(params)) {
    return LocalWallet.create({ account: params, ...deps })
  }
  const provider = await this.resolveProvider()
  return provider.hostedWalletToActionsWallet(params)
}
```

The `isLocalAccount()` check can use viem's account shape: `typeof params === 'object' && 'type' in params && params.type === 'local' && 'signMessage' in params`.

**3. `type: 'local'` is a thin no-config provider.**
`NodeOptionsMap['local']` is `undefined`, so `ProviderSpec` resolves to just `{ type: 'local' }` — no `config` field needed. Its `toActionsWallet()` and `createSigner()` accept `{ account: LocalAccount }` for when called through the provider path directly.

**4. `LocalWallet` uses params object constructor.**
Matches the Privy/Turnkey pattern of `static async create(params)` with a params object. No `performInitialization()` override needed — base class provides the no-op default.

### Architecture

```
Developer code:
  privateKeyToAccount('0x...') → LocalAccount
      │
      └──→ actions.wallet.toActionsWallet(localAccount)
              │
              ├── isLocalAccount? YES → LocalWallet.create({ account, ...deps })
              │
              └── isLocalAccount? NO  → provider.hostedWalletToActionsWallet(params)
                                         (Privy/Turnkey/local provider path)
```

### `fromLocalAccount` deps problem

`WalletNamespace.toActionsWallet()` currently delegates entirely to the provider, which holds the chain manager and other deps. For the `LocalAccount` branch, we need those deps to create a `LocalWallet`. Two approaches:

**A. Resolve deps from the provider.** Call `resolveProvider()` to get the `WalletProvider`, then access `hostedWalletProvider.chainManager` etc. This works but requires the provider to be initialized even for local accounts.

**B. Store deps on the namespace directly.** Pass chain manager and providers to `WalletNamespace` at construction time. Cleaner separation but requires a constructor change.

Option A is simpler and doesn't change the constructor. The provider is lazy-initialized on first call anyway.

### Files to Create

| File | Purpose |
|------|---------|
| `packages/sdk/src/wallet/node/wallets/local/LocalWallet.ts` | Wallet class extending `EOAWallet` |
| `packages/sdk/src/wallet/node/providers/local/LocalWalletProvider.ts` | Thin provider for `type: 'local'` registry entry |

### Files to Modify

| File | Change |
|------|--------|
| `packages/sdk/src/wallet/core/namespace/WalletNamespace.ts` | Update `toActionsWallet()` to accept `params \| LocalAccount` union; add `isLocalAccount()` check |
| `packages/sdk/src/wallet/node/providers/hosted/types/index.ts` | Add `local` to type maps; add `LocalWalletToActionsWalletOptions` |
| `packages/sdk/src/wallet/node/providers/hosted/registry/NodeHostedWalletProviderRegistry.ts` | Register `'local'` provider |
| `packages/sdk/src/wallet/node/index.ts` | Export new classes and types |

### Tests to Create

| File | Coverage |
|------|----------|
| `packages/sdk/src/wallet/node/wallets/local/__tests__/LocalWallet.spec.ts` | Construction, signer assignment, address derivation, send/sendBatch |
| `packages/sdk/src/wallet/node/providers/local/__tests__/LocalWalletProvider.spec.ts` | `toActionsWallet({ account })` returns `Wallet`, `createSigner({ account })` returns `LocalAccount` |
| WalletNamespace tests (existing or new) | `toActionsWallet(localAccount)` with Privy configured returns `LocalWallet`; `toActionsWallet(privyParams)` still returns Privy wallet |
| Registry tests (existing file) | `'local'` factory: `getFactory`, `validateOptions`, `create` |
| Integration test | Full flow: `createActions({ type: 'local' })` → `toActionsWallet(account)` → verify address |

## Type System Changes

```typescript
// packages/sdk/src/wallet/node/providers/hosted/types/index.ts

// Local provider takes a LocalAccount when called through provider path
export interface LocalWalletToActionsWalletOptions {
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
  local: LocalWalletProvider
}

interface NodeToActionsOptionsMap {
  privy: PrivyHostedWalletToActionsWalletOptions
  turnkey: TurnkeyHostedWalletToActionsWalletOptions
  local: LocalWalletToActionsWalletOptions  // { account: LocalAccount }
}
```

```typescript
// packages/sdk/src/wallet/core/namespace/WalletNamespace.ts

// toActionsWallet signature change
async toActionsWallet(
  params: TToActionsMap[THostedProviderType] | LocalAccount,
): Promise<Wallet>
```

## Acceptance Criteria

- [ ] `actions.wallet.toActionsWallet(localAccount)` returns a `Wallet` with correct address
- [ ] `toActionsWallet(localAccount)` works regardless of configured provider (Privy, Turnkey, local)
- [ ] `toActionsWallet(privyParams)` still works for Privy (no regression)
- [ ] `createActions({ ..., provider: { type: 'local' } })` works with no config
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
- Union type `params | LocalAccount` on `toActionsWallet()` may cause TypeScript to widen the type in ways that lose type safety for Privy/Turnkey params. Mitigation: use function overloads if needed.
- `isLocalAccount()` runtime check must be robust — a provider's params object must never accidentally match the `LocalAccount` shape. viem's `LocalAccount` has distinctive properties (`type: 'local'`, `signMessage`, `signTransaction`, `publicKey`) that no provider params object would have.
- `NodeOptionsMap['local'] = undefined` must be verified to work with `ProviderSpec` conditional (`undefined extends undefined` → `{ type: 'local' }` with no config).
- Deps access: `toActionsWallet()` needs chain manager etc. to create a `LocalWallet` in the `LocalAccount` branch. Plan to resolve from the provider instance.

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
