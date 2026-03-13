---

## title: "Aerodrome & Velodrome swap provider for Actions SDK"
date: 2026-03-13
topic: aerodrome-velodrome-swap-provider
type: feat
status: draft
target_repo: actions
brainstorm: 2026-03-13-aerodrome-velodrome-support-brainstorm.md
baseline_sha: 4442168f2fe25a0ef11bddc76d664c8a2cd9c3db
estimated_effort: high
priority: high
acceptance_criteria:
  - VelodromeSwapProvider extends SwapProvider and implements all abstract methods
  - Swaps encode correctly for both v2 Router (Optimism, Base) and leaf Router (other OP Stack chains)
  - Address table covers Aerodrome on Base + Velodrome on Optimism + 11 leaf chain deployments
  - SwapProviders type updated everywhere (types/swap/base.ts AND all 17 wallet-layer files)
  - SwapMarket.provider widened to 'uniswap' | 'velodrome'
  - Provider routing works — correct provider selected based on market config match
  - Demo frontend swap tab has market selector dropdown (Uniswap / Velodrome, both on Base Sepolia)
  - Demo backend and frontend fully wired — swap flow works end-to-end for both providers
  - Velodrome pool deployment script created (Foundry, parallel to DeployUniswapMarket.s.sol)
  - Velodrome/Aerodrome logos added to demo and home page
  - Shared abstractions minimize duplicate code between lend and swap market selectors
  - Unit tests for VelodromeSwapProvider and encoding
  - pnpm build, pnpm typecheck, pnpm lint, and pnpm test all pass

# Aerodrome & Velodrome Swap Provider

## Context

The Actions SDK (`@eth-optimism/actions-sdk`) currently supports Uniswap V4 as its only swap provider. The architecture is designed for multiple providers — `SwapProvider` is an abstract base class, `SwapProviders` is a typed map, and `BaseSwapNamespace.getAllProviders()` already iterates all configured providers.

Aerodrome (Base) and Velodrome (Optimism + 11 other OP Stack chains) are the dominant DEXes across the OP Stack ecosystem. Their Router interfaces are identical for core swap operations. However, there's a critical difference: **the v2 Router** (Optimism, Base/Aerodrome) uses a `Route` struct with 4 fields `{ from, to, stable, factory }`, while **the leaf Router** (other OP Stack chains via `velodrome-finance/superchain-contracts`) uses 3 fields `{ from, to, stable }`. This changes ABI encoding, so we need two encoding paths.

## Implementation

### Phase 1: Extend Supported Chains

Velodrome leaf chains are not in the SDK's `SUPPORTED_CHAIN_IDS`. Add them.

**Changes:**

- `packages/sdk/src/constants/supportedChains.ts`: Add chain IDs for Bob (60808), Celo (42220), Fraxtal (252), Ink (57073), Lisk (1135), Metal (1750), Mode (34443), Soneium (1868), Superseed (5330), Swell (1923).
  **viem availability**: Check which chains exist in `viem/chains`. For any missing, define the chain ID as a raw number literal with a comment. The `SupportedChainId` type is derived from the array, so it auto-widens.
  **`@eth-optimism/viem` availability**: `ChainManager.createPublicClients()` calls `chainById()` from `@eth-optimism/viem/chains`. Verify all 10 new chains exist there. If any are missing, they cannot be used with `ChainManager` without a PR to `@eth-optimism/viem` first. Document which chains are available vs. blocked.

**Verification Gates:**

- TYPE: `SupportedChainId` union includes new chains
- CI: `pnpm typecheck` passes

### Phase 2: Velodrome Types

**New file:** `packages/sdk/src/swap/providers/velodrome/types.ts`

```typescript
import type { SwapMarketConfig, SwapProviderConfig } from '@/types/swap/index.js'

/**
 * Velodrome/Aerodrome market config — pools differentiated by stable/volatile flag
 */
export interface VelodromeMarketConfig extends SwapMarketConfig {
  /** true = stable pool (correlated assets), false = volatile pool */
  stable: boolean
}

/**
 * Velodrome/Aerodrome swap provider configuration
 */
export interface VelodromeSwapProviderConfig extends SwapProviderConfig {
  marketAllowlist?: VelodromeMarketConfig[]
  marketBlocklist?: VelodromeMarketConfig[]
}
```

### Phase 3: Velodrome Addresses

**New file:** `packages/sdk/src/swap/providers/velodrome/addresses.ts`

```typescript
import type { Address } from 'viem'
import type { SupportedChainId } from '@/constants/supportedChains.js'

/** Router type determines ABI encoding (Route struct differs) */
export type VelodromeRouterType = 'v2' | 'leaf'

export interface VelodromeAddresses {
  router: Address
  poolFactory: Address
  routerType: VelodromeRouterType
}
```

Address map:


| Chain              | ID      | Router                                       | Factory                                      | Type |
| ------------------ | ------- | -------------------------------------------- | -------------------------------------------- | ---- |
| Optimism           | 10      | `0xa062aE8A9c5e11aaA026fc2670B0D65cCc8B2858` | `0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a` | v2   |
| Base               | 8453    | `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43` | `0x420DD381b31aEf6683db6B902084cB0FFECe40Da` | v2   |
| All 11 leaf chains | various | `0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45` | `0x31832f2a97Fd20664D76Cc421207669b55CE4BC0` | leaf |


Leaf chains (all share identical CREATE2 addresses): Bob (60808), Celo (42220), Fraxtal (252), Ink (57073), Lisk (1135), Metal (1750), Mode (34443), Soneium (1868), Superseed (5330), Swell (1923), Unichain (130).

Functions: `getVelodromeAddresses(chainId)`, `getSupportedChainIds()`.

### Phase 4: Velodrome ABIs

**New file:** `packages/sdk/src/swap/providers/velodrome/abis.ts`

Two Router ABI variants — v2 and leaf — differing in the `Route` struct:

- **v2 Route**: `(address from, address to, bool stable, address factory)`
- **Leaf Route**: `(address from, address to, bool stable)`

ABI functions needed (for each variant):

- `swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, Route[] routes, address to, uint256 deadline) returns (uint256[] amounts)`
- `swapExactETHForTokens(uint256 amountOutMin, Route[] routes, address to, uint256 deadline) payable returns (uint256[] amounts)`
- `swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, Route[] routes, address to, uint256 deadline) returns (uint256[] amounts)`
- `getAmountsOut(uint256 amountIn, Route[] routes) view returns (uint256[] amounts)`

Also: standard `ERC20_ALLOWANCE_ABI` and `ERC20_APPROVE_ABI` for token approval checks.

### Phase 5: Velodrome Encoding

**New file:** `packages/sdk/src/swap/providers/velodrome/encoding.ts`

`**getQuote(params: GetQuoteParams): Promise<SwapPrice>`**:

- Constructs Route array (1-hop: tokenIn → tokenOut with stable flag)
- For v2: includes `factory` in Route; for leaf: omits it
- Calls `getAmountsOut(amountIn, routes)` via `publicClient.readContract()` using the correct ABI variant
- Calculates price from input/output amounts
- Price impact: set to 0 for v1 (pool mid-price read not implemented yet — noted in SwapPrice.priceImpact docs)
- Returns `SwapPrice`

Note: Only exact-input swaps supported. `_execute` and `_getPrice` throw if `amountOut` is provided without `amountIn`.

**Exact-Output Simulation (frontend only):**
Velodrome/Aerodrome routers have no exact-output swap function. When the user specifies a desired output amount in the demo UI, the frontend handles this by:
1. Calling `getAmountsOut` with a trial input to get the exchange rate
2. Computing the required input amount from the rate
3. Submitting an exact-input swap with that computed amount

This logic lives in the demo frontend (`SwapAction.tsx`), NOT in the SDK. Add a comment in the frontend code:
```typescript
// EXACT-OUTPUT SIMULATION: Velodrome/Aerodrome routers only support exact-input swaps.
// When the user sets an exact output amount, we estimate the required input via getAmountsOut
// and execute an exact-input swap. The user may receive slightly more or less than their target.
// TODO: Ask Velodrome team whether this simulation logic belongs in the SDK or is too opinionated.
```

The SDK's `VelodromeSwapProvider._execute()` and `_getPrice()` throw cleanly if `amountOut` is provided, keeping the SDK honest about what the protocol actually supports.

`**encodeSwap(params: EncodeSwapParams): Hex**`:

- For native ETH in: encode `swapExactETHForTokens`
- For native ETH out: encode `swapExactTokensForETH`
- Otherwise: encode `swapExactTokensForTokens`
- Route struct encoding branches on `routerType`
- Uses `encodeFunctionData` from viem with the correct ABI variant

### Phase 6: VelodromeSwapProvider

**New file:** `packages/sdk/src/swap/providers/velodrome/VelodromeSwapProvider.ts`

```typescript
export class VelodromeSwapProvider extends SwapProvider<VelodromeSwapProviderConfig>
```

`**supportedChainIds()**`: Returns `getSupportedChainIds()` from addresses module.

`**_execute(params: ResolvedSwapParams)**`:

1. Throw if `amountOutWei` is set (exact-output not supported by Velodrome/Aerodrome routers). The SDK intentionally does NOT simulate exact-output via iterative quoting — see "Exact-Output Simulation" note below.
2. Get addresses via `getVelodromeAddresses(chainId)`
3. Resolve market config to get `stable` flag via `resolveVelodromeConfig()`
4. Get quote via `getQuote()`
5. Calculate `amountOutMin` = quote.amountOutWei * (1 - slippage)
6. Encode swap calldata via `encodeSwap()`
7. Build ERC-20 approve transaction for Router (if assetIn is not native):
  - Read current allowance via `publicClient.readContract({ abi: ERC20_ALLOWANCE_ABI, ... })`
  - Skip if allowance >= amountInWei
  - No Permit2 — Velodrome uses direct Router approval
8. Return `SwapTransaction`:
  - `tokenApproval`: approve to Router address (or undefined if not needed)
  - `permit2Approval`: always undefined
  - `swap`: `{ to: router, data: calldata, value: isNativeIn ? amountInWei : 0n }`

`**_getPrice(params: SwapPriceParams)*`*:

1. Throw if `amountOut` is set
2. Default to 1 unit of assetIn if no amount
3. Call `getQuote()` and return `SwapPrice`

`**_getMarket(params: GetSwapMarketParams)**`:

1. Search allowlist for matching poolId on given chain

`**_getMarkets(params: GetSwapMarketsParams)**`:

1. Expand allowlist into concrete `SwapMarket` objects
2. For each valid config entry (has `stable` defined), generate asset pairs
3. Compute deterministic poolId per pair
4. Set `provider: 'velodrome'`, `fee: 0` (Velodrome fees are dynamic/pool-level, not config-level), `version: 'v2'`

**Private helpers:**

- `resolveVelodromeConfig(assetIn, assetOut, chainId)` — Resolve `VelodromeMarketConfig`, validate `stable` is defined
- `validConfigs()` — Filter allowlist to entries where `stable` is explicitly `true` or `false` (not undefined)
- `marketsFromConfig()`, `assetPairs()`, `configToMarket()` — Same pattern as `UniswapSwapProvider`
- `configToMarket()` — Compute poolId as `keccak256(abi.encodePacked(sorted_tokenA, sorted_tokenB, stable))` matching Velodrome's pool address derivation

### Phase 7: Update Core Types — SwapProviders Everywhere

**Critical: The inline type `{ uniswap?: SwapProvider<SwapProviderConfig> }` is hardcoded in 17 files across the wallet subsystem.** All must be updated to use the canonical `SwapProviders` type from `types/swap/base.ts`, or have `velodrome?` added.

**Preferred approach: Replace all inline types with the `SwapProviders` import.** This is the O(1) fix — future providers only need updating in one place.

**Files requiring `SwapProviders` type update (add `velodrome?` or use import):**

1. `packages/sdk/src/types/swap/base.ts` (line 19-21) — canonical definition, add `velodrome?`
2. `packages/sdk/src/actions.ts` (lines 56-58, 158-160) — `_swapProviders` initializer + `swapProviders` getter return type
3. `packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts` (lines 35-37, 73-75) — property + constructor param
4. `packages/sdk/src/wallet/core/providers/hosted/abstract/HostedWalletProvider.ts` (lines 26, 37)
5. `packages/sdk/src/wallet/core/providers/hosted/types/index.ts` — `HostedProviderDeps.swapProviders`
6. `packages/sdk/src/wallet/core/providers/smart/default/DefaultSmartWalletProvider.ts` (lines 37, 59)
7. `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts` (lines 77, 130)
8. `packages/sdk/src/wallet/react/wallets/hosted/privy/PrivyWallet.ts`
9. `packages/sdk/src/wallet/react/wallets/hosted/turnkey/TurnkeyWallet.ts`
10. `packages/sdk/src/wallet/react/wallets/hosted/dynamic/DynamicWallet.ts`
11. `packages/sdk/src/wallet/react/providers/hosted/privy/PrivyHostedWalletProvider.ts`
12. `packages/sdk/src/wallet/react/providers/hosted/turnkey/TurnkeyHostedWalletProvider.ts`
13. `packages/sdk/src/wallet/react/providers/hosted/dynamic/DynamicHostedWalletProvider.ts`
14. `packages/sdk/src/wallet/node/wallets/hosted/privy/PrivyWallet.ts`
15. `packages/sdk/src/wallet/node/wallets/hosted/turnkey/TurnkeyWallet.ts`
16. `packages/sdk/src/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.ts`
17. `packages/sdk/src/wallet/node/providers/hosted/turnkey/TurnkeyHostedWalletProvider.ts`

**Changes to `SwapProviders` type in `types/swap/base.ts`:**

```typescript
export type SwapProviders = RequireAtLeastOne<{
  uniswap?: SwapProvider<SwapProviderConfig>
  velodrome?: SwapProvider<SwapProviderConfig>
}>
```

This mirrors the `SwapConfig` and `LendConfig` patterns — if you're constructing a swap namespace, at least one provider must be present. Import `RequireAtLeastOne` from `types/actions.ts` (or extract it to a shared utility type).

**Changes to `SwapMarket.provider`:**

```typescript
provider: 'uniswap' | 'velodrome'
```

**Changes to `types/actions.ts`:**

- Import `VelodromeSwapProviderConfig`
- Add `velodrome?` to `SwapConfig`:
  ```typescript
  export type SwapConfig = RequireAtLeastOne<{
    uniswap?: UniswapSwapProviderConfig
    velodrome?: VelodromeSwapProviderConfig
  }>
  ```

**Changes to `actions.ts` constructor:**

- Import `VelodromeSwapProvider`
- Add velodrome initialization after uniswap block:
  ```typescript
  if (config.swap?.velodrome) {
    this._swapProviders.velodrome = new VelodromeSwapProvider(
      config.swap.velodrome,
      this.chainManager,
    )
  }
  ```
- Fix namespace creation guard (currently only checks uniswap):
  ```typescript
  if (Object.values(this._swapProviders).some(Boolean)) {
    this._swap = new ActionsSwapNamespace(this._swapProviders)
  }
  ```

**Changes to `Wallet.ts` constructor (line 85):**

- Fix swap namespace creation guard:
  ```typescript
  if (Object.values(this.swapProviders).some(Boolean)) {
    this.swap = new WalletSwapNamespace(this.swapProviders, this)
  }
  ```

### Phase 8: Provider Routing

**Changes to `BaseSwapNamespace.ts`:**

Replace hardcoded `getProvider()` with market-aware routing:

```typescript
/**
 * Get the provider that supports the given pair on the given chain.
 * Iterates all configured providers; returns the first whose market
 * allowlist includes this pair. Falls back to the first provider if
 * no market-level match (provider's own validation will catch mismatches).
 */
protected getProviderForParams(
  assetIn: Asset,
  assetOut: Asset,
  chainId: SupportedChainId,
): SwapProvider<SwapProviderConfig> {
  const allProviders = this.getAllProviders()
  if (allProviders.length === 0) {
    throw new Error('No swap provider configured')
  }
  if (allProviders.length === 1) {
    return allProviders[0]
  }
  // Try each provider — first that supports this chain wins
  for (const provider of allProviders) {
    if (provider.isChainSupported(chainId)) {
      return provider
    }
  }
  return allProviders[0]
}
```

Update callers:

- `price(params)` → `this.getProviderForParams(params.assetIn, params.assetOut!, params.chainId).getPrice(params)`
- `getMarket(params)` — iterate `getAllProviders()`, try each, return first success
- `WalletSwapNamespace.execute()` → `this.getProviderForParams(params.assetIn, params.assetOut, params.chainId).execute(resolvedParams)`

Delete the old `getProvider()` method.

Update stale comments:

- Line 62: Change `"(uniswap?, aerodrome?, etc.)"` → `"(uniswap?, velodrome?, etc.)"`
- Line 69: Remove `"Future: resolve the best provider"` comment (it's now real)

### Phase 9: Update Exports

**Changes to `packages/sdk/src/swap/index.ts`:**
Add Velodrome exports:

```typescript
export type {
  VelodromeMarketConfig,
  VelodromeSwapProviderConfig,
} from '@/swap/providers/velodrome/types.js'
export { VelodromeSwapProvider } from '@/swap/providers/velodrome/VelodromeSwapProvider.js'
```

**Changes to `packages/sdk/src/index.ts`:**
Add to the `@/swap/index.js` re-exports:

```typescript
export {
  SwapProvider,
  type UniswapMarketConfig,
  UniswapSwapProvider,
  type UniswapSwapProviderConfig,
  type VelodromeMarketConfig,
  VelodromeSwapProvider,
  type VelodromeSwapProviderConfig,
} from '@/swap/index.js'
```

### Phase 10: Unit Tests

**Update: `packages/sdk/src/swap/__mocks__/MockSwapProvider.ts`**

- Make `provider` field configurable in `MockSwapProviderConfig`:
  ```typescript
  provider?: 'uniswap' | 'velodrome'
  ```
- Default to `'uniswap'` for backward compat
- Use in `createMockMarket()` at line 194

**Update: `packages/sdk/src/swap/namespaces/__tests__/BaseSwapNamespace.spec.ts`**

- Replace `(namespace as any).providers.oneInch` hack with proper `{ velodrome: provider2 }` key
- Add test: velodrome-only config → `price()` works
- Add test: both providers configured → `getMarkets()` aggregates both

**New file: `packages/sdk/src/swap/providers/velodrome/__tests__/VelodromeSwapProvider.test.ts`**

Mirror `UniswapSwapProvider.test.ts` structure:

- `**supportedChainIds**`: Returns Optimism (10) and Base (8453) chain IDs
- `**execute**`:
  - Returns swap transaction with approval data (approve to Router, not Permit2)
  - Includes token approval when allowance insufficient
  - Omits token approval for native ETH
  - Throws without `stable` in market config
  - Throws if `amountOut` provided (exact-output not supported)
- `**getPrice**`:
  - Returns price quote
  - Defaults to 1 unit
  - Throws if `amountOut` provided
- `**getMarkets**`:
  - Returns markets from allowlist
  - Expands multi-asset filter into all pairs
  - Filters by asset
  - Skips configs without `stable` defined
  - Produces deterministic poolIds
  - Sets `provider: 'velodrome'`
- `**getMarket**`: Finds by poolId, throws for unknown

Mock setup: `createMockChainManager()` with mock `readContract` for:

- `getAmountsOut` returning `[amountIn, amountOut]`
- `allowance` returning `0n`

**New file: `packages/sdk/src/swap/providers/velodrome/__tests__/encoding.test.ts`**

- Test `getQuote()` calls `getAmountsOut` with correct Route struct for v2 and leaf
- Test `encodeSwap()` encodes correct function for token→token, ETH→token, token→ETH
- Test Route struct encoding: v2 has 4 fields, leaf has 3 fields

### Phase 11: Demo Deployment Scripts

**DEPENDENCY: Testnet protocol instance.** No official Aerodrome/Velodrome deployment exists on Base Sepolia. Unlike Uniswap (where V4 PoolManager, PositionManager, and Permit2 are already deployed on Base Sepolia and `DeployUniswapMarket.s.sol` only creates a pool on the existing infra), Velodrome would require deploying the core protocol contracts (Router, PoolFactory, FactoryRegistry, stubs for Voter/WETH) — a significantly larger task.

**Resolution options (check with team first):**

1. **Team already has a testnet deployment** — use their addresses. Simplest path.
2. **Deploy Aerodrome ourselves using their existing scripts** — the `aerodrome-finance/contracts` repo has a JSON config system (`script/constants/`) that supports custom deployments without code changes. Steps:
  - Clone `aerodrome-finance/contracts`
  - Create `script/constants/BaseSepolia.json` from `TEMPLATE.json` (set WETH to `0x4200000000000000000000000000000000000006`, team/feeManager/emergencyCouncil/allowedManager to deployer address, minimal minter amounts, empty pools)
  - Run: `forge script script/DeployCore.s.sol:DeployCore --broadcast --slow --rpc-url <base-sepolia-rpc>`
  - Collect Router + PoolFactory addresses from output
  - This is a ~30 min one-time task, not an ongoing maintenance burden
3. **Use supersim fork mode** — fork Base mainnet locally for Aerodrome. Works for local dev only.

Note: The Velodrome repo (`velodrome-finance/contracts`) hardcodes addresses in Solidity and requires code changes to deploy to a new chain. **Use the Aerodrome repo** for testnet deployment — it's better structured for this.

**Assuming option 1 or 2 provides addresses:**

**New file: `packages/demo/contracts/script/DeployVelodromeMarket.s.sol`**

Parallel to `DeployUniswapMarket.s.sol`. Creates a Velodrome-style pool on Base Sepolia with initial liquidity for DemoUSDC/DemoOP on an existing protocol deployment:

1. Read DemoUSDC and DemoOP addresses from env
2. Call `PoolFactory.createPool(tokenA, tokenB, stable=false)` to create a volatile pool
3. Mint demo tokens
4. Approve tokens to Router
5. Call `Router.addLiquidity(tokenA, tokenB, stable=false, amountADesired, amountBDesired, amountAMin, amountBMin, to, deadline)` to seed liquidity
6. Output pool address

**Update: `packages/demo/contracts/script/deploy-demo.sh`**
Add Step 4 after Uniswap pool deployment:

```bash
# --- Step 4: Deploy Velodrome Pool ---
VELO_POOL=$(read_state "velodrome.pool")
if [[ -z "$VELO_POOL" ]]; then
    echo ">>> Deploying Velodrome pool..."
    OUTPUT=$(DEMO_USDC_ADDRESS="$USDC_ADDR" DEMO_OP_ADDRESS="$OP_ADDR" \
        forge script script/DeployVelodromeMarket.s.sol:DeployVelodromeMarket \
        "${FORGE_ARGS[@]}" --broadcast 2>&1)
    VELO_POOL=$(parse_address "Pool:" "$OUTPUT")
    write_state "velodrome.pool" "$VELO_POOL"
fi
```

Add the testnet Router and PoolFactory addresses to the Velodrome addresses module:

```typescript
// Base Sepolia — testnet deployment (addresses TBD after protocol deploy/discovery)
[baseSepolia.id]: {
  router: '<testnet Router address>',
  poolFactory: '<testnet PoolFactory address>',
  routerType: 'v2',
},
```

### Phase 12: Demo Frontend & Backend — Full Integration

**Design principle: Minimize duplicate code.** The lend tab already has a `MarketSelector` dropdown. Rather than building a separate swap market selector from scratch, extract a shared `ProviderSelector` component and use it in both places.

#### 12a: Shared ProviderSelector Component

The existing `MarketSelector.tsx` in `components/earn/` is lend-specific (shows APY, asset logo, uses `MarketInfo` type). Extract the generic dropdown behavior into a shared component.

**New file: `packages/demo/frontend/src/components/earn/ProviderSelector.tsx`**

A generic dropdown that accepts items with `{ name, logo, networkName, networkLogo, description? }` shape. Both the lend `MarketSelector` and the new swap market selector wrap this with their domain-specific data mapping.

```typescript
interface ProviderOption {
  id: string
  name: string           // "Uniswap" or "Velodrome"
  logo: string           // provider logo path
  networkName: string    // "OP Sepolia" or "Base Sepolia"
  networkLogo: string    // chain logo path
  description?: string   // e.g., "USDC/OP volatile pool"
}

interface ProviderSelectorProps {
  options: ProviderOption[]
  selected: ProviderOption | null
  onSelect: (option: ProviderOption) => void
  isLoading?: boolean
}
```

Reuses the same click-outside detection, dropdown animation, and styling patterns from `MarketSelector`.

#### 12b: Swap Market Selector

**New file: `packages/demo/frontend/src/components/earn/SwapMarketSelector.tsx`**

Wraps `ProviderSelector` with swap-specific logic:

- Maps `SwapMarket[]` from `actions.swap.getMarkets()` to `ProviderOption[]`
- Each option = one provider: "Uniswap" and "Velodrome", both on Base Sepolia with the same USDC/OP pair
- Selection controls which provider is used for quotes and execution (chainId stays the same)

**Integration into SwapAction.tsx:**

- Add `SwapMarketSelector` above the Sell panel
- When user selects a market, store the selected `provider` name in state
- Pass the selected provider through to price quote and execute calls
- Since both providers are on the same chain (Base Sepolia), the provider name — not chainId — is what distinguishes them

This means the demo's swap API calls need a `provider` param. Update:
- Backend `/swap/price` and `/swap/execute` endpoints: accept optional `provider` query/body param
- Backend swap service: if `provider` specified, call that provider directly instead of namespace routing
- Frontend `useSwap` hook: pass selected provider name to API calls

#### 12c: Swap Market Type

**New file or update: `packages/demo/frontend/src/types/swapMarket.ts`**

```typescript
export interface SwapMarketOption {
  provider: 'uniswap' | 'velodrome'
  chainId: SupportedChainId
  name: string           // "Uniswap" or "Velodrome"
  networkName: string    // "OP Sepolia" or "Base Sepolia"
}
```

**Constants: `packages/demo/frontend/src/constants/swapMarkets.ts`**

```typescript
export const SWAP_MARKETS: SwapMarketOption[] = [
  {
    provider: 'uniswap',
    chainId: baseSepolia.id,
    name: 'Uniswap',
    networkName: 'Base Sepolia',
  },
  {
    provider: 'velodrome',
    chainId: baseSepolia.id,
    name: 'Velodrome',
    networkName: 'Base Sepolia',
  },
]
```

#### 12d: Logo Assets

- Fetch Velodrome logo SVG → `packages/demo/frontend/public/velodrome-logo.svg`
- Fetch Velodrome white variant → `packages/demo/frontend/public/velodrome-logo-white.svg`

**Update `packages/demo/frontend/src/constants/logos.ts`:**

```typescript
export const MARKET_LOGO: Record<string, string> = {
  Morpho: '/morpho-logo.svg',
  Aave: '/aave-logo-dark.svg',
  Uniswap: '/uniswap-logo.svg',
  Velodrome: '/velodrome-logo.svg',
}
```

#### 12e: Home Page

**Update `packages/demo/frontend/src/components/home/Overview.tsx` (line 75):**
Add Velodrome logo in the Swap section:

```typescript
images: [
  { src: '/uniswap-logo-white.svg', link: 'https://uniswap.org/' },
  { src: '/velodrome-logo-white.svg', link: 'https://velodrome.finance/' },
],
```

#### 12f: Activity Summary

**Update `packages/demo/frontend/src/utils/activitySummary.ts` (line 52):**
Hardcoded `marketSegment('Uniswap')` → derive from swap metadata:

```typescript
marketSegment(m.provider === 'velodrome' ? 'Velodrome' : 'Uniswap')
```

This requires the swap execution flow to pass `provider` through to the activity log entry. Update the `executeSwap` call in `useSwap.ts` to include the selected provider name in the activity metadata.

#### 12g: Backend & Frontend Config

**Update `packages/demo/frontend/src/config/actions.ts`:**

```typescript
swap: {
  uniswap: {
    defaultSlippage: 0.005,
    marketAllowlist: [
      { assets: [USDC_DEMO, OP_DEMO], fee: 100, tickSpacing: 2, chainId: baseSepolia.id },
    ],
  },
  velodrome: {
    defaultSlippage: 0.005,
    marketAllowlist: [
      { assets: [USDC_DEMO, OP_DEMO], stable: false, chainId: baseSepolia.id },
    ],
  },
},
```

Both providers on Base Sepolia with the same USDC/OP pair. The market selector controls which provider is used.

**Update `packages/demo/backend/src/config/actions.ts`:** Same config structure.

#### 12h: Backend Swap Endpoints

Since both providers are on the same chain, the backend needs a way to target a specific provider.

**Update backend swap controller (`/swap/price`, `/swap/execute`):**
- Accept optional `provider` param (`'uniswap' | 'velodrome'`)
- If specified, look up the provider directly from `actions.swapProviders[provider]` and call it
- If omitted, fall back to namespace routing (backward compatible)

**Update backend swap service:**
- `getSwapPrice({ ..., provider? })` — route to specific provider when specified
- `executeSwap({ ..., provider? })` — same

**Response:** Include `provider` in the swap response so the frontend can log it in the activity feed.

### Cutover Checklist

- `SwapProviders` type updated in `types/swap/base.ts` — add `velodrome?`
- All 17 wallet-layer files updated to include `velodrome?` in their `swapProviders` type (or import `SwapProviders`)
- `Wallet.ts` constructor guard changed from `if (this.swapProviders.uniswap)` to `Object.values(this.swapProviders).some(Boolean)`
- `Actions.ts` constructor guard changed similarly
- `Actions.ts` `swapProviders` getter return type updated
- `BaseSwapNamespace.getProvider()` replaced with `getProviderForParams()` — no more hardcoded `this.providers.uniswap`
- Stale "aerodrome" comments in `BaseSwapNamespace.ts` updated to "velodrome"
- `MockSwapProvider.provider` field made configurable
- `BaseSwapNamespace.spec.ts` — `oneInch` hack replaced with proper `velodrome` key
- `SwapMarket.provider` type widened
- `SwapConfig` type includes `velodrome?`
- All exports added to `swap/index.ts` and `index.ts`
- Velodrome/Aerodrome logo files added to frontend public/
- Home page Overview.tsx updated with Velodrome logo
- Activity summary renders correct provider logo (not hardcoded 'Uniswap')
- Swap tab has `SwapMarketSelector` dropdown — Uniswap / Velodrome (both Base Sepolia)
- Shared `ProviderSelector` component extracted — no duplicate dropdown logic
- Testnet protocol instance resolved (team deployment or self-deploy)
- `DeployVelodromeMarket.s.sol` creates pool + liquidity on Base Sepolia
- `deploy-demo.sh` updated with Step 4 for Velodrome
- Frontend and backend configs both include `velodrome` swap provider with `chainId` scoping
- No dual paths — single `VelodromeSwapProvider` handles both Aerodrome and Velodrome

### Proof of Correctness

**Mechanical Verification:**

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

**Structural Proof:**

- `SwapProviders` type with `velodrome?` key — using the canonical type across all 17 wallet files means adding a third provider in the future only requires updating one type definition
- `SwapMarket.provider: 'uniswap' | 'velodrome'` — any switch/comparison on this field will type-error if a new variant is added
- `VelodromeRouterType` discriminated union (`'v2' | 'leaf'`) ensures encoding functions handle both Router variants
- `VelodromeSwapProviderConfig` extends `SwapProviderConfig` — base class validation works automatically
- `Object.values(this.swapProviders).some(Boolean)` guards in Wallet and Actions constructors — automatically handle any future provider

**Integration Proof:**

- Test: VelodromeSwapProvider with stable=true market → `getQuote` encodes Route with stable=true → swap calldata is `swapExactTokensForTokens`
- Test: ETH as assetIn → calldata is `swapExactETHForTokens` with msg.value set
- Test: v2 routerType → Route struct has 4 fields; leaf → 3 fields
- Test: `ActionsSwapNamespace.getMarkets()` with both uniswap and velodrome → returns markets from both, correctly tagged
- Test: `getProviderForParams()` routes to velodrome when chain is velodrome-only

**Regression Proof:**

- All existing Uniswap tests pass unchanged
- `BaseSwapNamespace.spec.ts` continues to pass (provider routing returns first available)
- `SwapProvider.test.ts` unchanged — tests base class behavior
- `MockSwapProvider` backward-compatible (defaults to `provider: 'uniswap'`)

