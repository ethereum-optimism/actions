# Actions SDK Integration Guide

This file is an integration playbook for AI coding agents helping developers add Actions SDK to their application. Actions SDK is an open source TypeScript toolkit by Optimism for integrating DeFi (lending, borrowing, swaps, payments) into apps.

> **For agents**: This guide uses concrete examples but the SDK evolves. When you encounter references to specific providers, assets, or chains, always verify against the actual codebase to discover what is currently supported. Source-of-truth locations are called out in each section.

## Overview

Actions SDK follows a provider pattern. Developers configure:

1. **A wallet provider** — an embedded wallet (Privy, Turnkey, Dynamic, etc.) that handles key management and signing
2. **DeFi action providers** — protocols for lending (Morpho, Aave), borrowing, swaps, etc.
3. **Chains** — which EVM networks to support
4. **Assets** — which tokens to allow or block

Then they call `createActions(config)` to get an `actions` instance, convert a user's wallet into an Actions wallet, and call DeFi operations on it.

## Step 1: Detect Project Environment

Before starting, determine the developer's environment and existing integrations.

**Check the environment** by reading the project's `package.json`:

- If `react`, `next`, `remix`, or similar React framework is in dependencies → **React/frontend** environment. Use `@eth-optimism/actions-sdk/react` imports.
- If it's a Node.js backend (hono, express, fastify, etc.) → **Node/backend** environment. Use `@eth-optimism/actions-sdk/node` imports (or the default import which resolves to node).
- The available wallet providers differ by environment. Check the SDK's `peerDependencies` in `node_modules/@eth-optimism/actions-sdk/package.json` to see which provider packages exist for each environment.

**Check for existing wallet provider integrations** by scanning the project's `package.json` dependencies for:

- `@privy-io/react-auth` or `@privy-io/node` → Privy is already integrated
- `@turnkey/*` packages → Turnkey is already integrated
- `@dynamic-labs/*` packages → Dynamic is already integrated (React only)

If a wallet provider is already present, use it. If not, see Step 3.

## Step 2: Install the SDK

```bash
npm install @eth-optimism/actions-sdk
```

The SDK has peer dependencies for whichever wallet provider the developer chooses. These are optional — only the selected provider's packages need to be installed.

## Step 3: Choose a Wallet Provider

The wallet provider is the biggest integration decision because it involves third-party account setup, authentication flows, and potentially significant frontend/backend work.

**If the developer already has a wallet provider** (detected in Step 1): skip this step and use their existing integration.

**If no wallet provider exists**: Present the available options and help the developer choose, but do not block the rest of the setup. The wallet provider can be integrated in parallel.

> **For agents with interactive UX** (e.g. choice selection): present the wallet provider options as a choice. Otherwise, list them and ask which the developer prefers.

Available wallet providers (verify the current list by checking the SDK's `peerDependencies`):

| Provider | Frontend (React) | Backend (Node) | Setup Guide                  |
| -------- | :--------------: | :------------: | ---------------------------- |
| Privy    |       Yes        |      Yes       | https://docs.privy.io        |
| Turnkey  |       Yes        |      Yes       | https://docs.turnkey.com     |
| Dynamic  |       Yes        |       No       | https://www.dynamic.xyz/docs |

Each provider requires its own account setup, API keys, and SDK installation. Direct the developer to the provider's documentation for initial setup, then return here to wire it into Actions.

**Important**: The developer does not need to finish wallet provider setup before continuing. You can scaffold the full Actions config with a placeholder and fill in the wallet section once the provider is ready.

## Step 4: Create the Actions Config File

Create a config file (e.g. `actions.ts`) that centralizes the Actions SDK configuration. This is the main integration point.

### 4a: Wallet Config

The wallet config declares which embedded wallet provider to use and enables smart wallets. Here's an example using Privy on a React frontend:

```typescript
const walletConfig = {
  embeddedWalletConfig: {
    provider: {
      type: 'privy' as const,
    },
  },
  smartWalletConfig: {
    provider: {
      type: 'default' as const,
    },
  },
}
```

Each provider has different config requirements depending on the environment (React vs Node). For the full setup code for each provider, see the [Integrating Wallets](https://docs.optimism.io/app-developers/reference/actions/integrating-wallets) guide.

> **Source of truth for provider config shapes**: Check the SDK source at `src/wallet/node/providers/embedded/types/` (Node) or `src/wallet/react/providers/embedded/types/` (React) for the exact config each provider expects.

### 4b: DeFi Provider Config (Lend, Borrow, Swap, etc.)

The SDK uses a modular provider pattern for DeFi actions. Each action type (lend, borrow, swap) can have one or more protocol providers. **Configure DeFi providers first** — the market selections will inform which chains and assets need to be configured in the following steps.

> **For agents**: Ask the developer which DeFi actions and providers they want to support. Check `src/lend/` for lending providers and look for other action directories (e.g. `src/borrow/`, `src/swap/`) as the SDK evolves. The `ActionsConfig` type in `src/types/actions.ts` shows all configurable action categories.

#### Morpho

Morpho uses individual vault markets. Ask the developer which Morpho vaults they want to support. The developer may:

- **Provide a vault URL** (e.g. `https://app.morpho.org/unichain/vault/0x38f4...`). Parse the chain name and vault address from the URL to construct the `LendMarketConfig`.
- **Want demo/testnet markets** for development — see `packages/demo/backend/src/config/markets.ts` for examples.
- **Not know yet** — scaffold with an empty allowlist and a TODO comment.

```typescript
// Morpho market — address is the vault address from the Morpho app URL
const MorphoUSDC: LendMarketConfig = {
  address: '0x...', // e.g. from https://app.morpho.org/{chain}/vault/{address}
  chainId: unichain.id,
  name: 'Gauntlet USDC',
  asset: USDC,
  lendProvider: 'morpho',
}
```

#### Aave

Aave uses a singleton lending pool per chain — there is no per-vault address. Instead, each Aave "market" in the config represents an **underlying asset** you want to support lending for on Aave. The `address` field is the asset's token address on that chain.

> **For agents**: Ask the developer which assets they want to lend via Aave and on which chains. Then construct the `LendMarketConfig` for each, using the asset's token address on that chain. Look up the address from the SDK's built-in asset constants in `src/constants/assets.ts`, or if the asset isn't built-in, look up the token address on the target chain.

```typescript
// Aave market — address is the underlying token address on the target chain
const AaveETH: LendMarketConfig = {
  address: '0x4200000000000000000000000000000000000006', // WETH on Optimism
  chainId: optimism.id,
  name: 'Aave ETH',
  asset: ETH,
  lendProvider: 'aave',
}
```

#### Bringing it together

```typescript
import type { LendConfig, LendMarketConfig } from '@eth-optimism/actions-sdk'
import { ETH, USDC } from '@eth-optimism/actions-sdk'
import { optimism, unichain } from 'viem/chains'

const lendConfig: LendConfig = {
  morpho: {
    marketAllowlist: [MorphoUSDC],
  },
  aave: {
    marketAllowlist: [AaveETH],
  },
}
```

For more on configuring lend providers, see the [Configuring Actions](https://docs.optimism.io/app-developers/guides/configuring-actions) guide and the [Lend Reference](https://docs.optimism.io/app-developers/reference/actions/lend-documentation).

> **Source of truth**: `src/lend/` for available lending providers. `packages/demo/backend/src/config/markets.ts` for working market examples.

### 4c: Chain Config

> **For agents**: Start by including every chain already referenced by the markets configured in 4b. Then ask the developer if they want to support any additional chains. Check `src/constants/supportedChains.ts` in the SDK for the full list, and present the remaining chains as options. If your tool supports multi-select, use it here.

Each chain needs an RPC URL and optionally a bundler for smart wallet gas sponsorship.

```typescript
import { optimism, base, unichain } from 'viem/chains'

const chains = [
  {
    chainId: optimism.id,
    rpcUrls: [process.env.OPTIMISM_RPC_URL],
    bundler: {
      type: 'pimlico' as const, // or 'simple'
      url: process.env.OPTIMISM_BUNDLER_URL,
    },
  },
  {
    chainId: unichain.id,
    rpcUrls: [process.env.UNICHAIN_RPC_URL],
    bundler: {
      type: 'simple' as const,
      url: process.env.UNICHAIN_BUNDLER_URL,
    },
  },
]
```

### 4d: Asset Config

> **For agents**: Start by including every asset already referenced by the markets configured in 4b. Then ask the developer if they want to support any additional tokens. Check `src/constants/assets.ts` for built-in asset constants (ETH, USDC, WETH, etc.) and present remaining options. If the developer needs a token not built into the SDK, help them define a custom `Asset` object — you'll need the token's contract address on each supported chain, decimals, symbol, and name.

```typescript
import { USDC, ETH } from '@eth-optimism/actions-sdk'

const assetsConfig = {
  allow: [USDC, ETH], // Only these assets are available in the app
}
```

Custom assets can be defined inline:

```typescript
import type { Asset } from '@eth-optimism/actions-sdk'
import { unichain } from 'viem/chains'

const CUSTOM_TOKEN: Asset = {
  address: {
    [unichain.id]: '0x...',
  },
  metadata: {
    decimals: 18,
    name: 'Custom Token',
    symbol: 'CUSTOM',
  },
  type: 'erc20',
}
```

> **Source of truth**: `src/constants/assets.ts` for built-in assets, `src/supported/tokens.ts` for the `SUPPORTED_TOKENS` list.

### 4e: Initialize Actions

Bring everything together:

```typescript
// React frontend
import { createActions } from '@eth-optimism/actions-sdk/react'

export const actions = createActions({
  wallet: walletConfig,
  chains,
  assets: assetsConfig,
  lend: lendConfig,
})
```

```typescript
// Node backend
import { createActions } from '@eth-optimism/actions-sdk/node'

export const actions = createActions({
  wallet: walletConfig,
  chains,
  assets: assetsConfig,
  lend: lendConfig,
})
```

In a backend, initialize once at startup and export a singleton. In React, memoize the instance to avoid recreating on every render.

## Step 5: Use Actions

### Convert a wallet to an Actions wallet

Once the developer has a wallet from their provider, convert it to an Actions wallet. Each provider passes different arguments. Example with Privy on React:

```typescript
import { useWallets } from '@privy-io/react-auth'

const { wallets } = useWallets()
const embeddedWallet = wallets.find(
  (wallet) => wallet.walletClientType === 'privy',
)

const wallet = await actions.wallet.toActionsWallet({
  connectedWallet: embeddedWallet,
})
```

For all provider-specific `toActionsWallet` code, see the [Quickstart](https://docs.optimism.io/app-developers/quickstarts/actions#choose-a-wallet-provider) guide.

### Create a smart wallet (optional)

Smart wallets add ERC-4337 features (gas sponsorship, batch transactions). Create a signer from the provider wallet, then create a smart wallet. Example with Privy on React:

```typescript
const signer = await actions.wallet.createSigner({
  connectedWallet: embeddedWallet,
})

const { wallet } = await actions.wallet.createSmartWallet({ signer })
```

For all provider-specific `createSigner` parameters, see the [Integrating Wallets](https://docs.optimism.io/app-developers/reference/actions/integrating-wallets) reference.

### Perform DeFi actions

For the full list of wallet methods and lend operations, see the [Wallet Reference](https://docs.optimism.io/app-developers/reference/actions/wallet-definitions) and [Lend Reference](https://docs.optimism.io/app-developers/reference/actions/lend-documentation).

```typescript
// Get token balances across all configured chains
const balances = await wallet.getBalance()

// Open a lending position
const receipt = await wallet.lend.openPosition({
  amount: 100,
  asset: USDC,
  ...market, // { address, chainId } of the market — a LendMarketId
})

// Get current position
const position = await wallet.lend.getPosition(market)

// Close a position (withdraw)
const closeReceipt = await wallet.lend.closePosition({
  amount: 50,
  asset: USDC,
  ...market,
})

// Browse available markets
const markets = await actions.lend.getMarkets()
```

> **Source of truth for available actions**: The wallet instance exposes namespaces for each action type. Check which namespaces exist on the `Wallet` and `SmartWallet` classes in `src/wallet/core/wallets/`. The `actions` instance also exposes top-level namespaces for read-only operations (e.g. `actions.lend.getMarkets()`).

## Reference

### Key types

```typescript
import type {
  ActionsConfig, // Top-level config
  Asset, // Token definition (address per chain + metadata)
  TokenBalance, // Balance result (total + per-chain breakdown)
  LendConfig, // Lend provider configuration
  LendMarketConfig, // Market definition
  LendMarketId, // Market identifier ({ address, chainId })
  LendMarket, // Market data (name, asset, supply, APY)
  LendMarketPosition, // User position in a market
  LendTransaction, // Transaction result from lend operations
  WalletConfig, // Wallet provider configuration
  SupportedChainId, // Union of supported chain IDs
} from '@eth-optimism/actions-sdk'
```

### Key imports

```typescript
// Assets
import { ETH, USDC, WETH } from '@eth-optimism/actions-sdk'

// Utilities
import {
  getTokenAddress,
  getTokenBySymbol,
  SUPPORTED_TOKENS,
} from '@eth-optimism/actions-sdk'

// Wallet classes (for type checking)
import { Wallet, SmartWallet } from '@eth-optimism/actions-sdk'

// Factory (environment-specific)
import { createActions } from '@eth-optimism/actions-sdk/react' // or /node
```

### Documentation

- Quickstart: https://docs.optimism.io/app-developers/quickstarts/actions
- Configuring Actions: https://docs.optimism.io/app-developers/guides/configuring-actions
- Integrating Wallets: https://docs.optimism.io/app-developers/reference/actions/integrating-wallets
- Wallet Reference: https://docs.optimism.io/app-developers/reference/actions/wallet-definitions
- Lend Reference: https://docs.optimism.io/app-developers/reference/actions/lend-documentation

### Example code

The demo applications in this repository show complete working integrations:

- `packages/demo/backend/` — Node.js backend with Privy, Morpho, and Aave
- `packages/demo/frontend/` — React frontend with Privy, Turnkey, and Dynamic
