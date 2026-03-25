# Tree-Shakeability Research

## 1. Current Behavior

### Install-time bloat

`packages/sdk/package.json` puts Aave, Morpho, and ethers v5 in hard `dependencies` (lines 57-67):

```json
"dependencies": {
  "@aave/contract-helpers": "^1.30.0",
  "@aave/math-utils": "^1.30.0",
  "@eth-optimism/viem": "^0.4.13",
  "@morpho-org/blue-sdk": "^4.5.1",
  "@morpho-org/blue-sdk-viem": "^3.1.1",
  "@morpho-org/morpho-ts": "^2.4.1",
  "ethers": "^5.7.2",
  "permissionless": "^0.2.54",
  "viem": "^2.24.1"
}
```

A project that only uses Morpho still installs `@aave/contract-helpers`, `@aave/math-utils`, and `ethers` v5. A project that uses neither lending protocol still installs all six protocol packages.

All 10 wallet peer dependencies (lines 68-79) lack `peerDependenciesMeta` with `optional: true`:

```json
"peerDependencies": {
  "@dynamic-labs/ethereum": ">=4.31.4",
  "@dynamic-labs/waas-evm": ">=4.31.4",
  "@dynamic-labs/wallet-connector-core": ">=4.31.4",
  "@privy-io/react-auth": ">=2.24.0",
  "@privy-io/node": ">=0.3.0",
  "@turnkey/core": ">=1.1.1",
  "@turnkey/http": ">=3.12.1",
  "@turnkey/sdk-server": ">=4.9.1",
  "@turnkey/react-wallet-kit": ">=1.1.1",
  "@turnkey/viem": ">=0.14.1"
}
```

npm and pnpm emit warnings for every missing peer dependency. A Privy-only Node project gets warnings for all Dynamic and Turnkey packages.

### Bundle-time bloat

Four static import sites prevent tree-shaking of unused providers:

**1. `src/actions.ts:2`** — Static import of both lend providers:

```ts
import { AaveLendProvider, MorphoLendProvider } from '@/lend/index.js'
```

Both providers are instantiated conditionally (lines 78-95) based on config, but the static import forces bundlers to include both regardless.

**2. `src/wallet/node/providers/hosted/registry/NodeHostedWalletProviderRegistry.ts:2-3`** — Static imports of Privy and Turnkey Node providers:

```ts
import { PrivyHostedWalletProvider } from '@/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.js'
import { TurnkeyHostedWalletProvider } from '@/wallet/node/providers/hosted/turnkey/TurnkeyHostedWalletProvider.js'
```

Both are instantiated in the constructor (lines 32, 49), pulling their entire dependency trees into any bundle.

**3. `src/wallet/react/providers/registry/ReactHostedWalletProviderRegistry.ts:2-4`** — Static imports of Dynamic, Privy, and Turnkey React providers:

```ts
import { DynamicHostedWalletProvider } from '@/wallet/react/providers/hosted/dynamic/DynamicHostedWalletProvider.js'
import { PrivyHostedWalletProvider } from '@/wallet/react/providers/hosted/privy/PrivyHostedWalletProvider.js'
import { TurnkeyHostedWalletProvider } from '@/wallet/react/providers/hosted/turnkey/TurnkeyHostedWalletProvider.js'
```

All three are instantiated in the constructor (lines 33, 44, 53).

**4. `src/index.ts:5` and `src/lend/index.ts`** — Barrel re-exports:

`src/index.ts:5`:
```ts
export { LendProvider, MorphoLendProvider } from '@/lend/index.js'
```

`src/lend/index.ts`:
```ts
export { LendProvider } from '@/lend/core/LendProvider.js'
export { AaveLendProvider } from '@/lend/providers/aave/AaveLendProvider.js'
export { MorphoLendProvider } from '@/lend/providers/morpho/MorphoLendProvider.js'
```

Note: `AaveLendProvider` is exported from `lend/index.ts` but not re-exported from `src/index.ts`. However, `actions.ts` imports it directly from the barrel, so it's still included in the bundle graph.

### Dependency footprint per provider

| Provider | Dependencies |
|----------|-------------|
| **Aave** | `@aave/contract-helpers`, `@aave/math-utils`, `ethers` v5 |
| **Morpho** | `@morpho-org/blue-sdk`, `@morpho-org/blue-sdk-viem`, `@morpho-org/morpho-ts` |
| **Privy (Node)** | `@privy-io/node` |
| **Privy (React)** | `@privy-io/react-auth` |
| **Dynamic** | `@dynamic-labs/ethereum`, `@dynamic-labs/waas-evm`, `@dynamic-labs/wallet-connector-core` |
| **Turnkey** | `@turnkey/core`, `@turnkey/http`, `@turnkey/sdk-server`, `@turnkey/react-wallet-kit`, `@turnkey/viem` |
| **Core (always needed)** | `viem`, `@eth-optimism/viem`, `permissionless` |

---

## 2. Feasibility Analysis

| Approach | Solves Install | Solves Bundle | API Change | Effort |
|----------|:-:|:-:|---|---|
| **A**: Optional peer deps + `sideEffects: false` | Yes | No | None | Low |
| **B**: Dynamic `import()` + optional peers | Yes | Yes | `createActions` becomes async | Medium |
| **C**: Subpath exports per provider | Yes | Yes | Major (users import providers separately) | Medium |
| **D**: Separate npm packages | Yes | Yes | Major (multiple packages) | High |

### Approach A: Optional peer deps + `sideEffects: false`

Move protocol dependencies to `peerDependencies` with `optional: true` in `peerDependenciesMeta`. Add `"sideEffects": false` to `package.json`.

**Pros**: No API change. Solves install warnings and unnecessary installs.
**Cons**: Does not solve bundle-time bloat. Static imports in `actions.ts` and the registry constructors still force all provider code into the bundle. `sideEffects: false` helps bundlers drop unused *exports*, but cannot eliminate code that is *imported and conditionally executed* (like the constructor calls in `actions.ts:79` and `actions.ts:86`).

### Approach B: Dynamic `import()` + optional peers

Combine Approach A (optional peer deps) with dynamic `import()` calls that load providers only when the config requests them. `createActions` becomes async to allow `await import()` resolution.

**Pros**: Solves both install and bundle bloat. Minimal API surface change — only `createActions` becomes async (returns `Promise<Actions>`). Leverages the existing registry/factory pattern. Config shape is unchanged.
**Cons**: `createActions` returning a `Promise` is a breaking change (callers must add `await`). Dynamic imports add a small latency on first call.

### Approach C: Subpath exports per provider

Expose each provider as a separate entry point (e.g., `@eth-optimism/actions-sdk/aave`, `@eth-optimism/actions-sdk/privy-node`). Users import and register only the providers they need.

**Pros**: Full tree-shaking via separate entry points. No async required.
**Cons**: Major API change — users must import and register providers manually. Increases integration complexity. `package.json` `exports` map grows significantly.

### Approach D: Separate npm packages

Split into `@eth-optimism/actions-sdk-core`, `@eth-optimism/actions-sdk-aave`, etc.

**Pros**: Cleanest separation. Each package declares only its own dependencies.
**Cons**: Highest effort. Multiple packages to publish, version, and coordinate. Significant refactor of the monorepo structure.

---

## 3. Recommended Approach

**Approach B** (dynamic imports) combined with **Approach A** (optional peer deps).

### Rationale

1. **No config shape change** — `ActionsConfig` remains the same. The developer's mental model doesn't change.
2. **Leverages existing patterns** — The registry/factory pattern already decouples provider creation from the `Actions` class. Making `HostedProviderFactory.create()` async and using `await import()` inside each factory is a natural extension.
3. **Well-contained breaking change** — `createActions` becoming async (`Promise<Actions>`) is a single call site change for consumers. Most initialization code is already async (wallet setup, chain connections).
4. **Incremental adoption** — Can be rolled out in stages (peer deps first, then dynamic imports) if needed.

### Tradeoffs & DX Impact

This approach introduces a meaningful change to the consumer install experience. It's important to understand what changes and why.

#### Fundamental constraint: config cannot control installs

npm/pnpm dependency resolution happens at `npm install` time — before any code runs. The SDK's `ActionsConfig` is a runtime concept. There is no mechanism in the npm ecosystem for a package to say "if the consumer configures Morpho, install `@morpho-org/*` automatically." The only options are:

- **Hard `dependencies`**: always installed for every consumer (current behavior for Aave/Morpho/ethers)
- **`peerDependencies`**: consumer must install manually; npm 7+ auto-installs non-optional peers, pnpm does not
- **`peerDependencies` + `optional: true`**: never auto-installed, no warnings if missing

#### Before vs After: what a Turnkey + Morpho developer does

**Before (current published version):**

```bash
npm install @eth-optimism/actions-sdk \
  @turnkey/core @turnkey/http @turnkey/sdk-server @turnkey/viem
```

Aave, ethers v5, and Morpho packages auto-install as hard `dependencies` — even though this developer doesn't use Aave. Turnkey packages are peer deps and must be installed manually (same as before).

```ts
const actions = createActions({ /* ... */ })  // synchronous
```

**After (this branch):**

```bash
npm install @eth-optimism/actions-sdk \
  @turnkey/core @turnkey/http @turnkey/sdk-server @turnkey/viem \
  @morpho-org/blue-sdk @morpho-org/blue-sdk-viem @morpho-org/morpho-ts
```

All protocol and wallet dependencies are now optional peers. The consumer must explicitly install every provider's dependencies. Aave and ethers are no longer installed. However, Morpho packages (previously auto-installed) must now be installed manually too.

```ts
const actions = await createActions({ /* ... */ })  // now async
```

If a developer forgets to install a required dependency, they get a clear error at runtime:

```
Error: Morpho lend provider requires @morpho-org/blue-sdk, @morpho-org/blue-sdk-viem,
and @morpho-org/morpho-ts. Install them with:
  pnpm add @morpho-org/blue-sdk @morpho-org/blue-sdk-viem @morpho-org/morpho-ts
```

#### Bundle-time: where dynamic imports help and where they don't

Dynamic `import()` behaves differently depending on the runtime environment:

**Node.js (no bundler):** Dynamic imports work as expected. Only the configured providers are loaded at runtime. If Aave packages aren't installed and the config doesn't request Aave, no error occurs — the `import()` is never called.

**Frontend bundler (esbuild, webpack, Vite/Rollup):** The bundler resolves dynamic import targets at **build time**, not runtime. This means:

- If `@morpho-org/*` is installed, the bundler follows `await import('./MorphoLendProvider.js')` → `MorphoLendProvider.js` → `@morpho-org/blue-sdk` and includes it in the output (either inlined or as a separate chunk depending on code-splitting support).
- If `@aave/*` is NOT installed, the bundler cannot resolve the Aave provider's transitive deps and will either error or leave the import as a runtime expression.

**The real frontend bundle win is indirect**: because unused deps aren't in `node_modules`, the bundler can't include them. The dynamic import pattern makes this safe by deferring the resolution so that missing packages cause a runtime error (with a helpful message) rather than a build-time crash across all entry points.

#### Summary of tradeoffs

| | Before | After |
|---|---|---|
| **Install command** | Only wallet peer deps manually installed; protocol deps auto-install | All provider deps manually installed |
| **Unused deps installed** | Yes (Aave + ethers for Morpho-only users) | No |
| **Peer dep warnings** | Yes (all 10 wallet packages) | No (all optional) |
| **`createActions` API** | Synchronous | Async (`Promise<Actions>`) — breaking change |
| **Bundle (Node.js)** | All provider code loaded | Only configured providers loaded |
| **Bundle (frontend)** | All installed provider code bundled via static imports | Only installed provider code bundled; unused providers absent from `node_modules` |
| **Missing dep experience** | Build-time crash with opaque module-not-found error | Runtime error with explicit install instructions |

---

## 4. Implementation Steps

### Step 1: `package.json` — Dependency restructuring

Move protocol-specific packages from `dependencies` to `peerDependencies`. Add `peerDependenciesMeta` with `optional: true` for all provider/protocol packages. Add `"sideEffects": false`.

```jsonc
{
  "sideEffects": false,
  "dependencies": {
    // Core — always required
    "@eth-optimism/viem": "^0.4.13",
    "permissionless": "^0.2.54",
    "viem": "^2.24.1"
  },
  "peerDependencies": {
    // Aave
    "@aave/contract-helpers": "^1.30.0",
    "@aave/math-utils": "^1.30.0",
    "ethers": "^5.7.2",
    // Morpho
    "@morpho-org/blue-sdk": "^4.5.1",
    "@morpho-org/blue-sdk-viem": "^3.1.1",
    "@morpho-org/morpho-ts": "^2.4.1",
    // Dynamic
    "@dynamic-labs/ethereum": ">=4.31.4",
    "@dynamic-labs/waas-evm": ">=4.31.4",
    "@dynamic-labs/wallet-connector-core": ">=4.31.4",
    // Privy
    "@privy-io/react-auth": ">=2.24.0",
    "@privy-io/node": ">=0.3.0",
    // Turnkey
    "@turnkey/core": ">=1.1.1",
    "@turnkey/http": ">=3.12.1",
    "@turnkey/sdk-server": ">=4.9.1",
    "@turnkey/react-wallet-kit": ">=1.1.1",
    "@turnkey/viem": ">=0.14.1"
  },
  "peerDependenciesMeta": {
    "@aave/contract-helpers": { "optional": true },
    "@aave/math-utils": { "optional": true },
    "ethers": { "optional": true },
    "@morpho-org/blue-sdk": { "optional": true },
    "@morpho-org/blue-sdk-viem": { "optional": true },
    "@morpho-org/morpho-ts": { "optional": true },
    "@dynamic-labs/ethereum": { "optional": true },
    "@dynamic-labs/waas-evm": { "optional": true },
    "@dynamic-labs/wallet-connector-core": { "optional": true },
    "@privy-io/react-auth": { "optional": true },
    "@privy-io/node": { "optional": true },
    "@turnkey/core": { "optional": true },
    "@turnkey/http": { "optional": true },
    "@turnkey/sdk-server": { "optional": true },
    "@turnkey/react-wallet-kit": { "optional": true },
    "@turnkey/viem": { "optional": true }
  }
}
```

### Step 2: `src/actions.ts` — Remove static lend provider imports

Replace the static import on line 2:

```ts
// Before
import { AaveLendProvider, MorphoLendProvider } from '@/lend/index.js'
```

Add an async `initLendProviders()` method that uses dynamic `import()`:

```ts
private async initLendProviders(lendConfig: ActionsConfig<...>['lend']) {
  if (!lendConfig) return

  if (lendConfig.morpho) {
    const { MorphoLendProvider } = await import('@/lend/providers/morpho/MorphoLendProvider.js')
    this._lendProviders.morpho = new MorphoLendProvider(lendConfig.morpho, this.chainManager)
  }

  if (lendConfig.aave) {
    const { AaveLendProvider } = await import('@/lend/providers/aave/AaveLendProvider.js')
    this._lendProviders.aave = new AaveLendProvider(lendConfig.aave, this.chainManager)
  }

  if (this._lendProviders.morpho || this._lendProviders.aave) {
    this._lend = new ActionsLendNamespace(this._lendProviders)
  }
}
```

Convert to a static factory pattern to encapsulate the async initialization:

```ts
static async create<...>(config, deps): Promise<Actions<...>> {
  const instance = new Actions(config, deps)
  await instance.initLendProviders(config.lend)
  return instance
}
```

### Step 3: Registry constructors — Dynamic provider imports

**`NodeHostedWalletProviderRegistry.ts`** — Remove static imports on lines 2-3. Use `await import()` inside each factory's `create` method:

```ts
// Before
import { PrivyHostedWalletProvider } from '@/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.js'

// After — inside the factory's create method
create: async ({ chainManager, lendProviders, supportedAssets }, options) => {
  const { PrivyHostedWalletProvider } = await import(
    '@/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.js'
  )
  return new PrivyHostedWalletProvider({ ... })
}
```

Apply the same pattern for Turnkey in `NodeHostedWalletProviderRegistry` and for Dynamic, Privy, and Turnkey in `ReactHostedWalletProviderRegistry`.

### Step 4: `HostedProviderFactory` type — Async `create`

Update `src/wallet/core/providers/hosted/types/index.ts` line 55:

```ts
// Before
create(deps: HostedProviderDeps, options: TOptions): TInstance

// After
create(deps: HostedProviderDeps, options: TOptions): TInstance | Promise<TInstance>
```

All callers of `factory.create()` must now `await` the result. The primary call site is `actions.ts:194` inside `createWalletProvider`.

### Step 5: Factory functions — Async `createActions`

**`src/nodeActionsFactory.ts`** — Make `createActions` async (line 29):

```ts
// Before
export function createActions<...>(config): Actions<...> {
  return new Actions(config, { ... })
}

// After
export async function createActions<...>(config): Promise<Actions<...>> {
  return Actions.create(config, {
    hostedWalletProviderRegistry: new NodeHostedWalletProviderRegistry(),
  })
}
```

Apply the same change to `src/reactActionsFactory.ts`.

### Step 6: Barrel exports — Remove direct lend provider re-exports

**`src/lend/index.ts`** — Remove concrete provider exports, keep only the abstract type:

```ts
// Before
export { LendProvider } from '@/lend/core/LendProvider.js'
export { AaveLendProvider } from '@/lend/providers/aave/AaveLendProvider.js'
export { MorphoLendProvider } from '@/lend/providers/morpho/MorphoLendProvider.js'

// After
export { LendProvider } from '@/lend/core/LendProvider.js'
```

**`src/index.ts:5`** — Remove `MorphoLendProvider` from the export:

```ts
// Before
export { LendProvider, MorphoLendProvider } from '@/lend/index.js'

// After
export { LendProvider } from '@/lend/index.js'
```

Optionally add subpath exports in `package.json` for consumers who need direct access:

```jsonc
"exports": {
  ".": { "react": "./dist/index.react.js", "import": "./dist/index.node.js", "default": "./dist/index.node.js" },
  "./react": "./dist/index.react.js",
  "./node": "./dist/index.node.js",
  "./lend/aave": "./dist/lend/providers/aave/AaveLendProvider.js",
  "./lend/morpho": "./dist/lend/providers/morpho/MorphoLendProvider.js"
}
```

### Step 7: Error handling — Clear messages for missing deps

Wrap dynamic imports in try/catch to surface helpful errors:

```ts
if (lendConfig.aave) {
  try {
    const { AaveLendProvider } = await import('@/lend/providers/aave/AaveLendProvider.js')
    this._lendProviders.aave = new AaveLendProvider(lendConfig.aave, this.chainManager)
  } catch {
    throw new Error(
      'Aave lend provider requires @aave/contract-helpers, @aave/math-utils, and ethers. ' +
      'Install them with: pnpm add @aave/contract-helpers @aave/math-utils ethers@5'
    )
  }
}
```

Same pattern for Morpho and all wallet providers:

```ts
// Morpho
'Morpho lend provider requires @morpho-org/blue-sdk, @morpho-org/blue-sdk-viem, and @morpho-org/morpho-ts. ' +
'Install them with: pnpm add @morpho-org/blue-sdk @morpho-org/blue-sdk-viem @morpho-org/morpho-ts'

// Privy (Node)
'Privy wallet provider requires @privy-io/node. Install with: pnpm add @privy-io/node'

// Privy (React)
'Privy wallet provider requires @privy-io/react-auth. Install with: pnpm add @privy-io/react-auth'

// Dynamic
'Dynamic wallet provider requires @dynamic-labs/ethereum, @dynamic-labs/waas-evm, and @dynamic-labs/wallet-connector-core. ' +
'Install them with: pnpm add @dynamic-labs/ethereum @dynamic-labs/waas-evm @dynamic-labs/wallet-connector-core'

// Turnkey (full)
'Turnkey wallet provider requires @turnkey/core, @turnkey/http, @turnkey/sdk-server, @turnkey/react-wallet-kit, and @turnkey/viem. ' +
'Install them with: pnpm add @turnkey/core @turnkey/http @turnkey/sdk-server @turnkey/react-wallet-kit @turnkey/viem'
```

---

## 5. Feature Tests

### Test 1: Bundle-size assertion

Use esbuild programmatically in vitest to bundle a minimal config and assert excluded provider code is absent:

```ts
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

describe('tree-shaking', () => {
  it('morpho-only config excludes aave code', async () => {
    const result = await build({
      stdin: {
        contents: `
          import { createActions } from './src/index.node.js'
          const actions = await createActions({
            lend: { morpho: { /* config */ } },
            wallet: { /* privy config */ },
            chains: [],
          })
        `,
        resolveDir: process.cwd(),
        loader: 'ts',
      },
      bundle: true,
      write: false,
      format: 'esm',
      external: ['@morpho-org/*', '@privy-io/*', 'viem', '@eth-optimism/viem', 'permissionless'],
    })
    const output = result.outputFiles[0].text
    expect(output).not.toContain('AaveLendProvider')
    expect(output).not.toContain('UiPoolDataProvider')
  })

  it('privy-only config excludes dynamic and turnkey code', async () => {
    // Same pattern — bundle with privy config, assert DynamicHostedWalletProvider
    // and TurnkeyHostedWalletProvider strings are absent
  })
})
```

### Test 2: Dynamic import resolution

Verify each provider can be dynamically loaded when its deps are installed:

```ts
describe('dynamic import resolution', () => {
  it('loads MorphoLendProvider dynamically', async () => {
    const mod = await import('@/lend/providers/morpho/MorphoLendProvider.js')
    expect(mod.MorphoLendProvider).toBeDefined()
  })

  it('loads AaveLendProvider dynamically', async () => {
    const mod = await import('@/lend/providers/aave/AaveLendProvider.js')
    expect(mod.AaveLendProvider).toBeDefined()
  })
})
```

### Test 3: Missing dependency error messages

Mock dynamic imports to simulate missing packages and verify helpful error messages:

```ts
describe('missing dependency errors', () => {
  it('provides helpful error when aave deps are missing', async () => {
    vi.mock('@/lend/providers/aave/AaveLendProvider.js', () => {
      throw new Error('Cannot find module')
    })

    await expect(
      createActions({
        lend: { aave: { /* config */ } },
        // ...
      })
    ).rejects.toThrow(/Aave lend provider requires @aave\/contract-helpers/)
  })
})
```

### Test 4: Update existing tests

All existing tests using `new Actions(...)` directly (or `createActions(...)` synchronously) must be updated:

```ts
// Before
const actions = createActions(config)

// After
const actions = await createActions(config)
```

Search the test suite for all `createActions` and `new Actions` call sites and add `await`. Test files to update:
- Any test file importing from `nodeActionsFactory` or `reactActionsFactory`
- Any test file directly instantiating `Actions`
- Registry tests that call `factory.create()` (now returns `Promise`)

---

## 6. Additional Findings (2026-03-24)

### `sideEffects: false` — quick win, partial fix

Adding `"sideEffects": false` to `packages/sdk/package.json` helps bundlers tree-shake unused barrel re-exports. In the demo frontend build, this reduced the `actionsApi` chunk from **2,022 kB → 110 kB** — the bundler can now drop re-exports from `src/index.ts` that aren't actually used by the consumer.

However, `sideEffects: false` alone does **not** solve the overall memory pressure. The code that was in the `actionsApi` chunk shifted to `EarnWithFrontendWallet` (which directly calls `createActions` and thus pulls in all providers). The largest chunk went from 2,022 kB to 2,188 kB — a slight increase in peak. CI builds still require `NODE_OPTIONS='--max-old-space-size=4096'` and `--parallel=1` to avoid OOM.

### Vite `manualChunks` — tested, not viable as-is

Two `manualChunks` strategies were tested:

**Function-based chunking** (splitting by `node_modules` path pattern): This made things worse. Forcing all `@dynamic-labs` modules into one chunk pulled their transitive deps along, inflating the Dynamic chunk from 1,290 kB to 3,196 kB. Same issue with WalletConnect (1,901 → 2,863 kB). The problem is that these SDKs share transitive dependencies that Rollup normally deduplicates across chunks — forcing them together defeats that optimization.

**Object-based chunking** (listing package names): Failed because protocol deps (`@aave/contract-helpers`, `@morpho-org/*`) are transitive deps of the SDK, not direct deps of the frontend. In pnpm strict mode, Rollup can't resolve them as entry modules from the frontend package.

### Stale dist as a contributing factor

The backend typecheck errors (15 errors referencing missing `swap` config, `Promise<Actions>` types, etc.) were caused by a stale `packages/sdk/dist/` that predated the swap provider addition. Rebuilding the SDK (`pnpm build` in `packages/sdk/`) resolved all errors. CI should always build the SDK before typechecking dependents — the NX dependency graph handles this, but local development can hit stale dist if the SDK isn't rebuilt after pulling changes.

### Constraint: `createActions` must stay synchronous

During brainstorming, keeping `createActions` synchronous was identified as a hard requirement. The current React integration uses `useMemo(() => createActions(config))` which cannot await. This rules out **Approach B** (dynamic imports inside `createActions`) as a standalone solution without a wrapper pattern.

### Viable next step: per-wallet subpath exports (Approach C variant)

The most promising direction that preserves the synchronous API:

- Create `@eth-optimism/actions-sdk/react/privy`, `/react/dynamic`, `/react/turnkey` entry points
- Each entry point exports the same `createActions` with the same config-driven API
- Each only imports that wallet provider's registry, avoiding the static import of all 3
- The demo's existing `React.lazy` pattern in `EarnPage.tsx` would naturally separate wallet chunks
- Action providers (Lend, Swap) stay as hard deps — no developer workflow change
- The existing `@eth-optimism/actions-sdk/react` entry point would continue to work (imports all 3) for backwards compatibility
