---
title: "feat: Add type: 'local' Provider to SDK"
type: feat
status: active
date: 2026-04-02
origin: docs/brainstorms/2026-04-01-eoa-and-agent-wallet-support-brainstorm.md
---

# Add `type: 'local'` Provider to SDK

## Enhancement Summary

**Deepened on:** 2026-04-02
**Sections enhanced:** 7
**Research agents used:** Sharp-edges security analysis, Architecture strategist, Security sentinel, Kieran TypeScript reviewer, Pattern recognition specialist, Code simplicity reviewer, Best practices researcher, Framework docs researcher

### Key Improvements
1. Params-object constructors matching Privy/Turnkey patterns (was positional args)
2. Named `LocalHostedWalletToActionsWalletOptions` type (was inline `Record<string, never>`)
3. `utils/createSigner.ts` utility for structural symmetry with existing providers
4. Security hardening: key scrubbing, browser runtime guard, `toJSON()` redaction, `isHex()` validation
5. Sanitized error cause chain to prevent key material in logs

### New Considerations Discovered
- viem's `isHex(value, { strict: true })` should be used for validation (built-in, hex-character-aware)
- `LocalAccount` retains the key in a closure — cannot be serialized safely without `toJSON()` override
- `options.privateKey` must be scrubbed after `privateKeyToAccount()` to prevent leaks via upstream error handlers
- Base `Wallet` class already provides a no-op `performInitialization()` — override is unnecessary
- `swapSettings` param in original sketch was a YAGNI violation (not on any existing wallet)

---

## Overview

Add a local EOA wallet provider to the Actions SDK that accepts a private key via config and creates a viem `LocalAccount` for signing. This plugs into the existing `HostedWalletProvider` registry alongside Privy and Turnkey, requiring no new factory patterns or API changes.

This is the foundational piece for agent wallet support — the local key serves as both a standalone EOA wallet (dev/testing) and the signer for ERC-4337 smart wallets (production). See brainstorm: `docs/brainstorms/2026-04-01-eoa-and-agent-wallet-support-brainstorm.md`, Issue 1.

## Problem Statement / Motivation

The SDK currently only supports hosted wallet providers (Privy, Turnkey) that rely on external services. There is no way to use a local private key directly. This blocks:

- Agent workflows that need a local signer for UserOperation submission
- Dev/testing scenarios where spinning up Privy/Turnkey is unnecessary
- The entire smart wallet + session key architecture planned in subsequent issues

## Proposed Solution

Follow the existing provider pattern exactly:

1. Add `'local'` to the type maps (`NodeOptionsMap`, `NodeHostedProviderInstanceMap`, `NodeToActionsOptionsMap`)
2. Create `LocalWallet` extending `EOAWallet`
3. Create `LocalHostedWalletProvider` extending `HostedWalletProvider`
4. Create `utils/createSigner.ts` utility (matching Privy/Turnkey structural pattern)
5. Register in `NodeHostedWalletProviderRegistry`
6. Export from the node barrel

### Usage

```typescript
import { createActions } from '@eth-optimism/actions-sdk/node'

const actions = createActions({
  chains: { ... },
  wallet: {
    hostedWalletConfig: {
      provider: {
        type: 'local',
        config: { privateKey: process.env.PRIVATE_KEY as `0x${string}` },
      },
    },
    smartWalletConfig: { provider: { type: 'default' } },
  },
})

// As standalone EOA wallet
const wallet = await actions.wallet.hostedWalletToActionsWallet({})

// As signer for smart wallet (future Issue 4)
const signer = await actions.wallet.createSigner({})
```

## Technical Considerations

### Key Design Decisions

**1. `privateKeyToAccount()` runs in the factory `create()`, not the provider constructor.**
The registry factory's `create()` function calls `privateKeyToAccount(options.privateKey)` and passes the resulting `LocalAccount` to the `LocalHostedWalletProvider` constructor. The raw key hex string never touches a class field. After conversion, the key is scrubbed from the options object. (see brainstorm: Key Decision #3)

### Research Insights — Key Lifecycle

**Security hardening (from Security Sentinel + Sharp-edges analysis):**
- After calling `privateKeyToAccount()`, immediately scrub the key from the options object: `(options as Record<string, unknown>).privateKey = undefined`. This prevents leaks via upstream error handlers that may log the options object.
- viem's `LocalAccount` retains the key in a closure for signing — this is inherent and acceptable, but the provider and wallet classes must prevent accidental serialization via `toJSON()` overrides.
- JavaScript strings are immutable and cannot be reliably zeroed from memory. This is a known platform limitation shared by all JS wallet libraries (ethers.js, web3.js). For high-security production deployments, recommend Turnkey/KMS-backed providers.

**2. `NodeToActionsOptionsMap['local']` uses a named empty type.**
Since the provider encapsulates a single key provided at construction, `toActionsWallet()` and `createSigner()` need no additional params. Callers pass `{}`. A named type `LocalHostedWalletToActionsWalletOptions` (set to `Record<string, never>`) is used for consistency with `PrivyHostedWalletToActionsWalletOptions` and `TurnkeyHostedWalletToActionsWalletOptions`.

### Research Insights — Empty Params Type

**TypeScript ergonomics (from Kieran TypeScript reviewer):**
- `Record<string, never>` means "no properties allowed" — `{}` satisfies it at the call site.
- `ProviderSpec` conditional correctly resolves: `undefined extends { privateKey: Hex }` is `false`, so `config` is required.
- Prototype the types first to verify `actions.wallet.hostedWalletToActionsWallet({})` compiles cleanly.

**3. No `performInitialization()` override needed.**
The base `Wallet` class already provides a default no-op `performInitialization()`. Since the `LocalAccount` is pre-built at provider construction time, there is nothing async to do. Omit the override rather than adding an explicit no-op — the base class handles it. Still call `await wallet.initialize()` in `static create()` for pattern consistency.

**4. Use viem's `Hex` type for `privateKey` config field.**
Provides compile-time safety that the key has a `0x` prefix, matching `privateKeyToAccount()`'s signature. At runtime, `Hex` is just `string` — `validateOptions()` is the real gate.

**5. Use params objects for constructors and `create()` factories.**
Both `PrivyWallet.create()` and `TurnkeyWallet.create()` accept a params object. The local provider must follow this pattern for consistency. Never use positional arguments for factories with 3+ parameters.

**6. Add `utils/createSigner.ts` matching structural pattern.**
Both Privy and Turnkey wallets have a `utils/createSigner.ts` utility with corresponding tests. The local provider should maintain this structural symmetry. This utility wraps `privateKeyToAccount()` with validation and error handling, and is the natural place for domain-specific error messages.

**7. Browser runtime guard.**
Add a `typeof window !== 'undefined'` check in the factory `create()` that throws a clear error. Tree-shaking and separate entry points are the primary guard, but this catches misuse in SSR/universal bundles.

### Architecture

```
createActions({ type: 'local', config: { privateKey } })
  │
  ▼
NodeHostedWalletProviderRegistry
  │ getFactory('local')
  │ validateOptions({ privateKey }) → isHex(strict) + length check
  │ create(deps, { privateKey })
  │   └── typeof window check (browser guard)
  │   └── createSigner(privateKey) → LocalAccount
  │   └── options.privateKey = undefined (scrub)
  │   └── new LocalHostedWalletProvider({ account, ...deps })
  ▼
LocalHostedWalletProvider
  ├── toActionsWallet({}) → LocalWallet.create({ account, ...deps })
  └── createSigner({})   → account
```

### Files to Create

| File | Purpose |
|------|---------|
| `packages/sdk/src/wallet/node/wallets/hosted/local/LocalWallet.ts` | Wallet class extending `EOAWallet` |
| `packages/sdk/src/wallet/node/wallets/hosted/local/utils/createSigner.ts` | Wraps `privateKeyToAccount()` with validation and error handling |
| `packages/sdk/src/wallet/node/providers/hosted/local/LocalHostedWalletProvider.ts` | Provider class extending `HostedWalletProvider` |

### Files to Modify

| File | Change |
|------|--------|
| `packages/sdk/src/wallet/node/providers/hosted/types/index.ts` | Add `local` to `NodeOptionsMap`, `NodeHostedProviderInstanceMap`, `NodeToActionsOptionsMap`; add `LocalHostedWalletToActionsWalletOptions` named type |
| `packages/sdk/src/wallet/node/providers/hosted/registry/NodeHostedWalletProviderRegistry.ts` | Add `this.register<'local'>({...})` with `validateOptions` and `create` |
| `packages/sdk/src/wallet/node/index.ts` | Export `LocalWallet`, `LocalHostedWalletProvider`, `LocalHostedWalletToActionsWalletOptions` |

### Tests to Create

| File | Coverage |
|------|----------|
| `packages/sdk/src/wallet/node/wallets/hosted/local/__tests__/LocalWallet.spec.ts` | Construction via params object, signer assignment, address derivation, send/sendBatch |
| `packages/sdk/src/wallet/node/wallets/hosted/local/utils/__tests__/createSigner.spec.ts` | Valid key → LocalAccount, invalid keys (empty, no prefix, wrong length, non-hex chars), error message |
| `packages/sdk/src/wallet/node/providers/hosted/local/__tests__/LocalHostedWalletProvider.spec.ts` | `toActionsWallet()` returns `Wallet`, `createSigner()` returns `LocalAccount`, `toJSON()` redaction |
| Registry tests (existing file) | Add cases for `'local'` factory: `getFactory`, `validateOptions` (valid/invalid/non-hex), `create`, browser guard |
| Integration test | Full flow: `createActions({ type: 'local' })` → `hostedWalletToActionsWallet({})` → verify address matches |

### Research Insights — Testing

**From best practices research:**
- Use `ANVIL_ACCOUNTS` constants from `src/utils/test.ts` (already typed as `0x${string}` literals) for test keys
- Test `validateOptions` with: missing `privateKey`, non-string, empty string, missing `0x`, wrong length, non-hex characters (`0xGGGG...`), known-bad keys (zero key)
- In test frameworks, avoid mocking `viem/accounts` too aggressively — `@noble/curves` stubbing can cause "expected Uint8Array, got object" errors ([viem Discussion #1228](https://github.com/wevm/viem/discussions/1228))

## System-Wide Impact

- **Interaction graph**: `createActions()` → `NodeHostedWalletProviderRegistry.getFactory('local')` → `factory.create()` → `LocalHostedWalletProvider` → `LocalWallet`. No callbacks, middleware, or observers involved. Isolated addition.
- **Error propagation**: Invalid key → `createSigner()` throws domain error → factory `create()` propagates → lazy initialization surfaces on first wallet operation (not at `createActions()` call time). Error messages must never contain key material.
- **State lifecycle risks**: None. No persistent state created. The `LocalAccount` lives in memory only.
- **API surface parity**: `hostedWalletToActionsWallet({})` and `createSigner({})` — same interface as Privy/Turnkey. No new methods or breaking changes.
- **Integration test scenarios**: (1) Full `createActions` → wallet → send flow with local key. (2) Same key produces same address across provider and wallet. (3) Invalid key at `createActions` surfaces clear error on first use.

## Acceptance Criteria

- [ ] `createActions({ ..., provider: { type: 'local', config: { privateKey } } })` works without errors
- [ ] `hostedWalletToActionsWallet({})` returns a `Wallet` with correct address
- [ ] `createSigner({})` returns a `LocalAccount` with correct address
- [ ] Raw private key hex is never stored on any class property — only `LocalAccount`
- [ ] `options.privateKey` is scrubbed (set to `undefined`) after `privateKeyToAccount()` in factory `create()`
- [ ] `validateOptions()` uses `isHex(key, { strict: true })` + length check; rejects malformed keys
- [ ] `createSigner()` utility wraps `privateKeyToAccount()` errors with domain-specific message (no key material in error)
- [ ] Provider and wallet classes override `toJSON()` to redact the `LocalAccount`
- [ ] Browser runtime guard throws if `typeof window !== 'undefined'`
- [ ] Constructors and `create()` factories use params objects (not positional args)
- [ ] `LocalHostedWalletToActionsWalletOptions` is a named exported type
- [ ] `utils/createSigner.ts` utility exists with tests (structural match with Privy/Turnkey)
- [ ] Existing Privy and Turnkey providers are unaffected (no regressions)
- [ ] All new code has TypeDoc comments on public classes and methods
- [ ] Tests pass: unit tests for wallet, provider, createSigner, registry; integration test for full flow
- [ ] Exports available from `@eth-optimism/actions-sdk/node`
- [ ] `pnpm build && pnpm typecheck && pnpm lint` pass

## Success Metrics

- Zero new external dependencies (only uses existing `viem`)
- Type system correctly requires `config: { privateKey }` when `type: 'local'`
- Follows existing patterns closely enough that a developer familiar with Privy/Turnkey providers can understand the local provider immediately

## Dependencies & Risks

**Dependencies:** None — this is the starting point of the agent wallet work.

**Risks:**
- `LocalHostedWalletToActionsWalletOptions` (alias for `Record<string, never>`) may interact poorly with generic constraints in downstream middleware. Mitigation: prototype the types first and verify `actions.wallet.hostedWalletToActionsWallet({})` compiles without assertion.
- Node-only: the local provider must NOT be registered in any React/browser registry. Mitigation: browser runtime guard + no React registry entry.
- JavaScript cannot guarantee memory zeroing of the private key. Mitigation: document as a known platform limitation; recommend Turnkey/KMS for high-security production.

## MVP Code Sketches

### packages/sdk/src/wallet/node/providers/hosted/types/index.ts

```typescript
// Named empty params type (matches Privy/Turnkey pattern of named option types)
export type LocalHostedWalletToActionsWalletOptions = Record<string, never>

// Add to NodeOptionsMap
interface NodeOptionsMap {
  privy: { ... }
  turnkey: { ... }
  local: { privateKey: Hex }
}

// Add to NodeHostedProviderInstanceMap
type NodeHostedProviderInstanceMap = {
  privy: PrivyHostedWalletProvider
  turnkey: TurnkeyHostedWalletProvider
  local: LocalHostedWalletProvider
}

// Add to NodeToActionsOptionsMap
type NodeToActionsOptionsMap = {
  privy: PrivyHostedWalletToActionsWalletOptions
  turnkey: TurnkeyHostedWalletToActionsWalletOptions
  local: LocalHostedWalletToActionsWalletOptions
}
```

### packages/sdk/src/wallet/node/wallets/hosted/local/utils/createSigner.ts

```typescript
import type { Hex, LocalAccount } from 'viem'
import { isHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

/**
 * Creates a viem LocalAccount from a private key hex string.
 * Validates the key format and wraps errors with a domain-specific message.
 */
export function createSigner(privateKey: Hex): LocalAccount {
  if (!isHex(privateKey, { strict: true }) || privateKey.length !== 66) {
    throw new Error(
      'Invalid private key: must be a 0x-prefixed 32-byte hex string (66 characters)',
    )
  }
  try {
    return privateKeyToAccount(privateKey)
  } catch (error) {
    throw new Error(
      `Failed to create local signer: ${error instanceof Error ? error.constructor.name : 'unknown error'}`,
    )
  }
}
```

### packages/sdk/src/wallet/node/wallets/hosted/local/LocalWallet.ts

```typescript
import type { Address, LocalAccount } from 'viem'
import { EOAWallet } from '@/wallet/core/wallets/eoa/EOAWallet.js'

interface LocalWalletParams {
  account: LocalAccount
  chainManager: ChainManager
  lendProviders?: LendProviders
  swapProviders?: SwapProviders
  supportedAssets?: SupportedAssets
}

/** EOA wallet backed by a local private key. Node-only — must not be used in browser. */
export class LocalWallet extends EOAWallet {
  readonly address: Address
  readonly signer: LocalAccount

  private constructor(params: LocalWalletParams) {
    super(params.chainManager, params.lendProviders, params.swapProviders, params.supportedAssets)
    this.address = params.account.address
    this.signer = params.account
  }

  static async create(params: LocalWalletParams): Promise<LocalWallet> {
    const wallet = new LocalWallet(params)
    await wallet.initialize()
    return wallet
  }

  /** Prevent accidental serialization of key material. */
  toJSON(): Record<string, unknown> {
    return { address: this.address, type: 'local' }
  }
}
```

### packages/sdk/src/wallet/node/providers/hosted/local/LocalHostedWalletProvider.ts

```typescript
import type { LocalAccount } from 'viem'
import { HostedWalletProvider } from '@/wallet/core/providers/hosted/abstract/HostedWalletProvider.js'
import { LocalWallet } from '@/wallet/node/wallets/hosted/local/LocalWallet.js'
import type { LocalHostedWalletToActionsWalletOptions, NodeToActionsOptionsMap } from '@/wallet/node/providers/hosted/types/index.js'

interface LocalHostedWalletProviderParams {
  account: LocalAccount
  chainManager: ChainManager
  lendProviders?: LendProviders
  swapProviders?: SwapProviders
  supportedAssets?: SupportedAssets
}

/** Hosted wallet provider backed by a local private key. Node-only. */
export class LocalHostedWalletProvider extends HostedWalletProvider<'local', NodeToActionsOptionsMap> {
  private readonly account: LocalAccount

  constructor(params: LocalHostedWalletProviderParams) {
    super(params.chainManager, params.lendProviders, params.swapProviders, params.supportedAssets)
    this.account = params.account
  }

  async toActionsWallet(_params: LocalHostedWalletToActionsWalletOptions): Promise<Wallet> {
    return LocalWallet.create({
      account: this.account,
      chainManager: this.chainManager,
      lendProviders: this.lendProviders,
      swapProviders: this.swapProviders,
      supportedAssets: this.supportedAssets,
    })
  }

  async createSigner(_params: LocalHostedWalletToActionsWalletOptions): Promise<LocalAccount> {
    return this.account
  }

  /** Prevent accidental serialization of key material. */
  toJSON(): Record<string, unknown> {
    return { type: 'local', address: this.account.address }
  }
}
```

### NodeHostedWalletProviderRegistry.ts (addition)

```typescript
this.register<'local'>({
  type: 'local',
  validateOptions(options: unknown): options is NodeOptionsMap['local'] {
    if (typeof options !== 'object' || options === null) return false
    const opts = options as Record<string, unknown>
    if (typeof opts.privateKey !== 'string') return false
    const { isHex } = await import('viem')
    return isHex(opts.privateKey, { strict: true }) && opts.privateKey.length === 66
  },
  async create(deps, options) {
    if (typeof window !== 'undefined') {
      throw new Error(
        'LocalHostedWalletProvider is not supported in browser environments. ' +
        'Private keys must never be used in client-side code.',
      )
    }
    const { createSigner } = await import(
      '../../wallets/hosted/local/utils/createSigner.js'
    )
    const { LocalHostedWalletProvider } = await import(
      '../local/LocalHostedWalletProvider.js'
    )
    const account = createSigner(options.privateKey)
    // Scrub the raw key from the options object to prevent leaks via error handlers
    ;(options as Record<string, unknown>).privateKey = undefined
    return new LocalHostedWalletProvider({
      account,
      chainManager: deps.chainManager,
      lendProviders: deps.lendProviders,
      swapProviders: deps.swapProviders,
      supportedAssets: deps.supportedAssets,
    })
  },
})
```

> **Note on `validateOptions` and `isHex`**: The existing Privy/Turnkey validators are synchronous, but `validateOptions` in the registry interface returns `boolean` (not `Promise<boolean>`). If `isHex` must be dynamically imported, the validation should either: (a) use a simple regex `/^0x[0-9a-fA-F]{64}$/` instead of `isHex`, or (b) move the full `isHex` validation into `createSigner()`. The regex approach keeps `validateOptions` synchronous and consistent with existing validators.

```typescript
// Synchronous alternative for validateOptions:
validateOptions(options: unknown): options is NodeOptionsMap['local'] {
  if (typeof options !== 'object' || options === null) return false
  const opts = options as Record<string, unknown>
  if (typeof opts.privateKey !== 'string') return false
  return /^0x[0-9a-fA-F]{64}$/.test(opts.privateKey)
},
```

## Security Considerations

### Addressed in This Plan

| Finding | Severity | Mitigation |
|---------|----------|------------|
| Config object holds raw key indefinitely | High | Scrub `options.privateKey = undefined` after `privateKeyToAccount()` |
| `LocalAccount` retains key in closure | Medium | `toJSON()` overrides on provider and wallet; TypeDoc warnings |
| No runtime browser guard | Medium | `typeof window !== 'undefined'` check in factory `create()` |
| Error cause chain may leak key material | Low | Error wraps constructor name only, not original message |
| `validateOptions` accepts non-hex chars | Low | Use regex `/^0x[0-9a-fA-F]{64}$/` for strict hex validation |
| JS cannot zero memory | Low | Documented as platform limitation; recommend Turnkey/KMS for production |

### Intentional Divergences from Existing Patterns (Documented)

| Divergence | Reason |
|------------|--------|
| More rigorous `validateOptions` (regex) vs Privy/Turnkey (truthiness check) | Private key validation warrants more rigor than checking for a client object |
| `utils/createSigner.ts` wraps errors (existing providers don't) | Domain-specific error message prevents cryptic `@noble/curves` errors from surfacing |
| `toJSON()` override (not on existing wallets) | Existing wallets hold no local key material; local provider does |
| Browser runtime guard (not on existing providers) | Existing providers use remote services (safe in browser); local provider holds a raw key |

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-01-eoa-and-agent-wallet-support-brainstorm.md](../brainstorms/2026-04-01-eoa-and-agent-wallet-support-brainstorm.md) — Key decisions carried forward: `type: 'local'` naming (#1), config-based key passing (#2), immediate `privateKeyToAccount()` conversion (#3), no rename of HostedWalletProvider (#6)

### Internal References

- Existing provider pattern: `packages/sdk/src/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.ts`
- Existing createSigner utility: `packages/sdk/src/wallet/node/wallets/hosted/privy/utils/createSigner.ts`
- Registry: `packages/sdk/src/wallet/node/providers/hosted/registry/NodeHostedWalletProviderRegistry.ts`
- Type maps: `packages/sdk/src/wallet/node/providers/hosted/types/index.ts`
- ProviderSpec conditional: `packages/sdk/src/wallet/core/providers/hosted/types/index.ts:29-36`
- EOAWallet base: `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts`
- Wallet base (performInitialization default): `packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts:114`
- Factory entry: `packages/sdk/src/nodeActionsFactory.ts`
- Test utilities (ANVIL_ACCOUNTS): `packages/sdk/src/utils/test.ts:17-25`

### External References

- [viem privateKeyToAccount docs](https://viem.sh/docs/accounts/local/privateKeyToAccount)
- [viem isHex utility](https://viem.sh/docs/utilities/isHex.html)
- [viem Discussion #614: MetaMask key prefix issue](https://github.com/wevm/viem/discussions/614)
- [viem Discussion #1228: test framework mock issues](https://github.com/wevm/viem/discussions/1228)
- [noble-curves security considerations](https://github.com/paulmillr/noble-curves)
