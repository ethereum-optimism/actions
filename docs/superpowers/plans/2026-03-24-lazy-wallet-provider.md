# Lazy Wallet Provider Initialization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Defer wallet provider instantiation from the `Actions` constructor to first wallet method call, enabling dynamic `import()` of wallet provider code so bundlers only include the provider actually used.

**Architecture:** The `HostedProviderFactory.create()` method becomes async and uses `await import()` to load provider implementations. The `Actions` class stores wallet config but defers provider creation. `WalletNamespace` methods (already async) lazily initialize the provider on first call. `createActions` remains synchronous. No consumer API changes.

**Tech Stack:** TypeScript, viem, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/sdk/src/wallet/core/providers/hosted/types/index.ts` | Modify | Make `HostedProviderFactory.create()` return `TInstance \| Promise<TInstance>` |
| `packages/sdk/src/wallet/core/namespace/WalletNamespace.ts` | Modify | Accept a provider factory fn instead of a resolved provider. Lazily resolve on first method call. |
| `packages/sdk/src/wallet/core/providers/WalletProvider.ts` | Check | May need async factory pattern if it does work in constructor |
| `packages/sdk/src/actions.ts` | Modify | Defer `createWalletProvider` — pass a factory closure to `WalletNamespace` instead of a resolved provider |
| `packages/sdk/src/wallet/react/providers/registry/ReactHostedWalletProviderRegistry.ts` | Modify | Replace static imports with `await import()` inside each `create()` |
| `packages/sdk/src/wallet/node/providers/hosted/registry/NodeHostedWalletProviderRegistry.ts` | Modify | Same pattern for Node providers |
| Tests (various) | Modify | Update any tests that assert sync wallet provider creation |

---

## Task 1: Make `HostedProviderFactory.create()` support async

**Files:**
- Modify: `packages/sdk/src/wallet/core/providers/hosted/types/index.ts:55-57`

- [ ] **Step 1: Update the `create` return type**

Change the `HostedProviderFactory` interface:

```ts
// Before
create(deps: HostedProviderDeps, options: TOptions): TInstance

// After
create(deps: HostedProviderDeps, options: TOptions): TInstance | Promise<TInstance>
```

This is backwards compatible — existing sync factories still satisfy the type.

- [ ] **Step 2: Verify typecheck passes**

Run: `cd packages/sdk && pnpm typecheck`
Expected: PASS (existing sync implementations satisfy `T | Promise<T>`)

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/wallet/core/providers/hosted/types/index.ts
git commit -m "allow async factory create in type"
```

---

## Task 2: Add lazy initialization to `WalletNamespace`

**Files:**
- Modify: `packages/sdk/src/wallet/core/namespace/WalletNamespace.ts`
- Test: `packages/sdk/src/wallet/core/namespace/__tests__/WalletNamespace.spec.ts` (create if not exists)

The `WalletNamespace` currently takes a resolved `WalletProvider` in its constructor. We need it to accept either a resolved provider OR a factory function, and lazily resolve on first method call.

- [ ] **Step 1: Write failing test for lazy initialization**

```ts
import { describe, expect, it, vi } from 'vitest'

describe('WalletNamespace lazy initialization', () => {
  it('does not call provider factory until a method is invoked', async () => {
    const mockProvider = {
      hostedWalletProvider: {},
      smartWalletProvider: {},
      createSmartWallet: vi.fn().mockResolvedValue({ wallet: {} }),
      createSigner: vi.fn(),
      hostedWalletToActionsWallet: vi.fn(),
      getSmartWallet: vi.fn(),
    }
    const factory = vi.fn().mockResolvedValue(mockProvider)

    const ns = new WalletNamespace(factory)
    expect(factory).not.toHaveBeenCalled()

    await ns.createSmartWallet({ signer: {} as any })
    expect(factory).toHaveBeenCalledOnce()
  })

  it('caches the provider after first resolution', async () => {
    const mockProvider = {
      hostedWalletProvider: {},
      smartWalletProvider: {},
      createSmartWallet: vi.fn().mockResolvedValue({ wallet: {} }),
      createSigner: vi.fn().mockResolvedValue({}),
      hostedWalletToActionsWallet: vi.fn(),
      getSmartWallet: vi.fn(),
    }
    const factory = vi.fn().mockResolvedValue(mockProvider)

    const ns = new WalletNamespace(factory)
    await ns.createSmartWallet({ signer: {} as any })
    await ns.createSigner({} as any)
    expect(factory).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/sdk && pnpm test -- --testPathPattern WalletNamespace`
Expected: FAIL — `WalletNamespace` constructor doesn't accept a function

- [ ] **Step 3: Implement lazy initialization**

Modify `WalletNamespace` to accept a factory function. All methods call `this.resolveProvider()` before delegating:

```ts
export class WalletNamespace<...> {
  private _provider: WalletProvider<...> | null = null
  private _providerFactory: () => Promise<WalletProvider<...>>

  constructor(
    providerOrFactory: WalletProvider<...> | (() => Promise<WalletProvider<...>>),
  ) {
    if (typeof providerOrFactory === 'function') {
      this._providerFactory = providerOrFactory
    } else {
      this._provider = providerOrFactory
      this._providerFactory = () => Promise.resolve(providerOrFactory)
    }
  }

  private async resolveProvider(): Promise<WalletProvider<...>> {
    if (!this._provider) {
      this._provider = await this._providerFactory()
    }
    return this._provider
  }

  get hostedWalletProvider(): H {
    if (!this._provider) {
      throw new Error('Wallet provider not yet initialized. Call an async wallet method first.')
    }
    return this._provider.hostedWalletProvider
  }

  get smartWalletProvider(): S {
    if (!this._provider) {
      throw new Error('Wallet provider not yet initialized. Call an async wallet method first.')
    }
    return this._provider.smartWalletProvider
  }

  async createSmartWallet(params) {
    const provider = await this.resolveProvider()
    return provider.createSmartWallet(params)
  }

  async createSigner(params) {
    const provider = await this.resolveProvider()
    return provider.createSigner(params)
  }

  async toActionsWallet(params) {
    const provider = await this.resolveProvider()
    return provider.hostedWalletToActionsWallet(params)
  }

  async getSmartWallet(params) {
    const provider = await this.resolveProvider()
    return provider.getSmartWallet(params)
  }
}
```

**Note:** The sync getters (`hostedWalletProvider`, `smartWalletProvider`) throw if accessed before any async method. Check if these are used directly in the demo or SDK — if so, they may need to become async too, or the first async call must happen before they're accessed.

- [ ] **Step 4: Run tests**

Run: `cd packages/sdk && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/wallet/core/namespace/
git commit -m "lazy wallet provider in WalletNamespace"
```

---

## Task 3: Defer wallet creation in `Actions` constructor

**Files:**
- Modify: `packages/sdk/src/actions.ts:115,207-310`

- [ ] **Step 1: Pass a factory closure to `WalletNamespace` instead of a resolved provider**

In `createWalletNamespace`, instead of calling `createWalletProvider(config)` eagerly, pass a factory function:

```ts
private createWalletNamespace(
  config: ActionsConfig<...>['wallet'],
) {
  // Factory closure — called lazily on first wallet method access
  const providerFactory = async () => this.createWalletProvider(config)

  return new WalletNamespace<...>(providerFactory)
}
```

`createWalletProvider` itself doesn't change yet — it stays sync for now. The async boundary exists but isn't used until Task 4.

- [ ] **Step 2: Remove eager `hostedWalletProvider` and `smartWalletProvider` field assignments**

The `createWalletProvider` method currently sets `this.hostedWalletProvider` and `this.smartWalletProvider` as side effects. These fields are used by the `Actions` class itself — check if they're accessed outside of `WalletNamespace`. If they are only accessed through `actions.wallet.hostedWalletProvider`, they can be removed from `Actions`.

Grep for direct access:
```bash
grep -rn 'this\.hostedWalletProvider\|this\.smartWalletProvider' packages/sdk/src/actions.ts
```

- [ ] **Step 3: Run full test suite**

Run: `cd packages/sdk && pnpm test`
Expected: PASS — behavior is identical since the factory is called immediately when any wallet method is invoked

- [ ] **Step 4: Typecheck all packages**

Run: `pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/actions.ts
git commit -m "defer wallet provider creation to first use"
```

---

## Task 4: Dynamic imports in React registry

**Files:**
- Modify: `packages/sdk/src/wallet/react/providers/registry/ReactHostedWalletProviderRegistry.ts`
- Test: `packages/sdk/src/wallet/react/providers/registry/__tests__/ReactHostedWalletProviderRegistry.spec.ts`

This is the core change that enables tree-shaking. Replace static imports with `await import()` inside each factory's `create` method.

- [ ] **Step 1: Remove static imports, add dynamic imports in `create`**

```ts
// REMOVE these static imports at top of file:
// import { DynamicHostedWalletProvider } from '...'
// import { PrivyHostedWalletProvider } from '...'
// import { TurnkeyHostedWalletProvider } from '...'

// In each factory registration, create becomes async:
this.register<'dynamic'>({
  type: 'dynamic',
  validateOptions(_options): _options is ReactOptionsMap['dynamic'] {
    return true
  },
  async create({ chainManager, lendProviders, swapProviders }, _options) {
    const { DynamicHostedWalletProvider } = await import(
      '@/wallet/react/providers/hosted/dynamic/DynamicHostedWalletProvider.js'
    )
    return new DynamicHostedWalletProvider(chainManager, lendProviders, swapProviders)
  },
})

// Same pattern for privy and turnkey
```

- [ ] **Step 2: Update registry tests**

Existing tests in `ReactHostedWalletProviderRegistry.spec.ts` will need to `await` the `factory.create()` calls.

- [ ] **Step 3: Run tests**

Run: `cd packages/sdk && pnpm test`

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/wallet/react/providers/registry/
git commit -m "dynamic imports in react wallet registry"
```

---

## Task 5: Dynamic imports in Node registry

**Files:**
- Modify: `packages/sdk/src/wallet/node/providers/hosted/registry/NodeHostedWalletProviderRegistry.ts`
- Test: corresponding test file

- [ ] **Step 1: Same pattern as Task 4 for Node providers (Privy, Turnkey)**

Replace static imports with `await import()` inside `create`.

- [ ] **Step 2: Update tests, run, verify**

Run: `cd packages/sdk && pnpm test`

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/wallet/node/providers/hosted/registry/
git commit -m "dynamic imports in node wallet registry"
```

---

## Task 6: Build verification

- [ ] **Step 1: Full build**

```bash
pnpm nx run-many --target=build
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Lint**

```bash
pnpm lint:fix && pnpm lint
```

- [ ] **Step 4: Run all tests**

```bash
cd packages/sdk && pnpm test
cd packages/demo/frontend && pnpm test
cd packages/demo/backend && pnpm test
```

- [ ] **Step 5: Check frontend chunk sizes**

Build the frontend and verify wallet provider chunks are now separate:
```bash
cd packages/demo/frontend && pnpm build
```

The `EarnWithFrontendWallet` chunk should be significantly smaller since `createActions` no longer statically pulls in all 3 wallet SDKs.

- [ ] **Step 6: Final commit if any fixups needed**

---

## Open Questions

1. **Sync getters on `WalletNamespace`**: `hostedWalletProvider` and `smartWalletProvider` are sync getters. If anything accesses them before an async wallet method is called, they'll throw. Need to verify no code paths depend on these being available immediately after `createActions`.

2. **`resolve-tspaths` and dynamic imports**: The SDK build uses `tsc && resolve-tspaths` to rewrite `@/` path aliases. Need to verify that `resolve-tspaths` correctly handles dynamic `import('@/...')` expressions, not just static imports.

3. **Bundler behavior with dynamic `import()`**: Vite/Rollup will see the dynamic imports and create separate chunks automatically. But the import path is a string literal pointing to a local file, so the bundler CAN still follow it at build time. The tree-shaking win comes from the fact that each `create()` is only called for the configured provider — the bundler should code-split the other providers into separate chunks that are never loaded. Verify this produces the expected chunk split.
