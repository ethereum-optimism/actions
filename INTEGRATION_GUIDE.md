# Verbs SDK Integration Guide: Lend Verb

A comprehensive guide for integrating the Verbs SDK's lending functionality into your application. The Verbs SDK provides lightweight, composable, and type-safe modules for DeFi operations, starting with the "lend" verb powered by Morpho protocol.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [Configuration](#configuration)
- [Lending Operations](#lending-operations)
- [Advanced Usage](#advanced-usage)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Overview

The Verbs SDK enables developers to integrate DeFi lending functionality with minimal complexity. The "lend" verb specifically focuses on yield-generating operations through the Morpho protocol, providing:

- **Gas-sponsored smart wallets** - ERC-4337 compatible wallets with paymaster support
- **Morpho integration** - Access to high-yield lending markets
- **Multi-chain support** - Works on Unichain and Base Sepolia (more chains coming)
- **Type safety** - Full TypeScript support with comprehensive type definitions
- **Flexible architecture** - Modular design allowing custom wallet providers

### Supported Networks

- **Unichain (Chain ID: 130)** - Primary production network
- **Base Sepolia (Chain ID: 84532)** - Testnet for development

### Supported Assets

- **USDC** - Primary stablecoin for lending operations

## Installation

```bash
npm install @eth-optimism/verbs-sdk
```

### Peer Dependencies

The SDK requires these peer dependencies:

```bash
npm install viem @privy-io/server-auth
```

## Quick Start

Here's a minimal example to get started with lending:

```typescript
import { Verbs } from '@eth-optimism/verbs-sdk'
import { PrivyClient } from '@privy-io/server-auth'
import { unichain } from 'viem/chains'

// 1. Initialize the SDK
const verbs = new Verbs({
  wallet: {
    hostedWalletConfig: {
      provider: {
        type: 'privy',
        privyClient: new PrivyClient(
          process.env.PRIVY_APP_ID!,
          process.env.PRIVY_APP_SECRET!
        ),
      },
    },
    smartWalletConfig: {
      provider: {
        type: 'default',
      },
    },
  },
  lend: {
    type: 'morpho',
    defaultSlippage: 50, // 0.5% slippage tolerance
  },
  chains: [
    {
      chainId: unichain.id,
      bundler: {
        type: 'pimlico',
        url: process.env.UNICHAIN_BUNDLER_URL!,
        sponsorshipPolicyId: process.env.UNICHAIN_BUNDLER_SPONSORSHIP_POLICY,
      },
    },
  ],
})

// 2. Create or retrieve a wallet
const wallet = await verbs.wallet.getWallet('user@example.com')
if (!wallet) {
  wallet = await verbs.wallet.createWallet('user@example.com')
}

// 3. Lend USDC to earn yield
const lendResult = await wallet.lend(
  100, // Amount in human-readable format
  'usdc', // Asset identifier
  unichain.id // Chain ID
)

console.log(`Lending transaction: ${lendResult.hash}`)
console.log(`APY: ${lendResult.apy}%`)
```

## Core Concepts

### Smart Wallets

The SDK uses ERC-4337 compatible smart wallets that provide:

- **Gas sponsorship** - Users don't need ETH for gas fees
- **Multi-owner support** - Wallets can have multiple authorized signers
- **Batch transactions** - Execute multiple operations in a single transaction
- **Cross-chain compatibility** - Same wallet address across supported chains

### Lend Provider

The lending functionality is abstracted through the `LendProvider` interface, with Morpho as the primary implementation:

```typescript
// Access the lend provider directly
const vaults = await verbs.lend.getVaults()
const vaultInfo = await verbs.lend.getVault('0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9')
```

### Asset Identifiers

Assets can be referenced using:

- **Symbol strings**: `'usdc'`, `'eth'` (case-insensitive)
- **Contract addresses**: `'0x078d782b760474a361dda0af3839290b0ef57ad6'`

## Configuration

### Environment Variables

Create environment variables for your application:

```bash
# Required - Privy Authentication
PRIVY_APP_ID=your_privy_app_id_here
PRIVY_APP_SECRET=your_privy_app_secret_here

# Required - Bundler Configuration (for gas sponsorship)
UNICHAIN_BUNDLER_URL=https://api.pimlico.io/v2/1301/rpc?apikey=YOUR_API_KEY
UNICHAIN_BUNDLER_SPONSORSHIP_POLICY=your_sponsorship_policy_id

# Optional - Custom RPC URLs
UNICHAIN_RPC_URL=https://sepolia.unichain.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

### VerbsConfig Interface

```typescript
interface VerbsConfig {
  wallet: WalletConfig
  lend?: LendConfig
  chains: ChainConfig[]
}

interface WalletConfig {
  hostedWalletConfig: {
    provider: {
      type: 'privy'
      privyClient: PrivyClient
    }
  }
  smartWalletConfig: {
    provider: {
      type: 'default'
    }
  }
}

interface LendConfig {
  type: 'morpho'
  defaultSlippage?: number // Basis points (50 = 0.5%)
}

interface ChainConfig {
  chainId: number
  rpcUrls?: string[]
  bundler?: {
    type: 'pimlico' | 'simple'
    url: string
    sponsorshipPolicyId?: string
  }
}
```

## Lending Operations

### Basic Lending

```typescript
// Lend 100 USDC with automatic vault selection
const result = await wallet.lend(100, 'usdc', unichain.id)

// Lend to a specific vault
const result = await wallet.lend(
  100, 
  'usdc', 
  unichain.id,
  '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' // Gauntlet USDC vault
)

// Lend with custom options
const result = await wallet.lend(
  100, 
  'usdc', 
  unichain.id,
  undefined, // Auto-select vault
  {
    slippage: 100, // 1% slippage tolerance
    gasLimit: 500000n,
  }
)
```

### Vault Information

```typescript
// Get all available vaults
const vaults = await verbs.lend.getVaults()
vaults.forEach(vault => {
  console.log(`${vault.name}: ${vault.apy}% APY`)
})

// Get specific vault details
const vaultInfo = await verbs.lend.getVault('0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9')
console.log(`Total assets: ${vaultInfo.totalAssets}`)
console.log(`APY breakdown:`, vaultInfo.apyBreakdown)
```

### Checking Balances

```typescript
// Get wallet's vault balance
const balance = await verbs.lend.getVaultBalance(
  '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9', // Vault address
  await wallet.getAddress() // Wallet address
)

console.log(`Balance: ${balance.balanceFormatted} USDC`)
console.log(`Shares: ${balance.sharesFormatted}`)
```

## Advanced Usage

### Batch Transactions

Execute multiple operations in a single transaction:

```typescript
// Prepare transaction data
const sendTxData = await wallet.sendTokens(50, 'usdc', recipientAddress)
const lendResult = await wallet.lend(100, 'usdc', unichain.id)

// Execute as batch if lend operation includes transaction data
if (lendResult.transactionData) {
  const batchTx = [
    sendTxData,
    lendResult.transactionData.approval!, // Token approval
    lendResult.transactionData.deposit,   // Lending deposit
  ]
  
  const hash = await wallet.sendBatch(batchTx, unichain.id)
}
```

### Custom Wallet Providers

Implement custom wallet providers for different authentication systems:

```typescript
import { HostedWalletProvider } from '@eth-optimism/verbs-sdk'

class CustomWalletProvider extends HostedWalletProvider {
  async createWallet(userId: string): Promise<HostedWallet> {
    // Your custom wallet creation logic
  }
  
  async getWallet(userId: string): Promise<HostedWallet | null> {
    // Your custom wallet retrieval logic
  }
  
  async getAllWallets(): Promise<HostedWallet[]> {
    // Your custom wallet listing logic
  }
}
```

### Error Handling

```typescript
try {
  const result = await wallet.lend(100, 'usdc', unichain.id)
  console.log('Success:', result.hash)
} catch (error) {
  if (error.message.includes('insufficient balance')) {
    console.error('Not enough USDC balance')
  } else if (error.message.includes('vault not found')) {
    console.error('Invalid vault address')
  } else {
    console.error('Lending failed:', error.message)
  }
}
```

## API Reference

### Core Classes

#### `Verbs`

Main SDK class for initialization and access to functionality.

```typescript
class Verbs {
  constructor(config: VerbsConfig)
  
  // Access wallet operations
  readonly wallet: WalletNamespace
  
  // Access lending operations
  get lend(): LendProvider
  
  // Get chain manager
  get chainManager(): ChainManager
}
```

#### `SmartWallet`

Abstract base class for smart wallet implementations.

```typescript
abstract class SmartWallet {
  // Get wallet address
  abstract getAddress(): Promise<Address>
  
  // Send single transaction
  abstract send(transactionData: TransactionData, chainId: SupportedChainId): Promise<Hash>
  
  // Send batch of transactions
  abstract sendBatch(transactionData: TransactionData[], chainId: SupportedChainId): Promise<Hash>
  
  // Lend tokens to earn yield
  abstract lend(
    amount: number,
    asset: AssetIdentifier,
    chainId: SupportedChainId,
    marketId?: string,
    options?: LendOptions
  ): Promise<LendTransaction>
  
  // Send tokens to another address
  abstract sendTokens(
    amount: number,
    asset: AssetIdentifier,
    recipientAddress: Address
  ): Promise<TransactionData>
  
  // Get token balance
  abstract getBalance(asset?: AssetIdentifier, chainId?: SupportedChainId): Promise<TokenBalance>
}
```

#### `LendProvider`

Abstract base class for lending protocol integrations.

```typescript
abstract class LendProvider {
  // Lend assets to a market
  abstract lend(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions
  ): Promise<LendTransaction>
  
  // Get vault information
  abstract getVault(vaultAddress: Address): Promise<LendVaultInfo>
  
  // Get all available vaults
  abstract getVaults(): Promise<LendVaultInfo[]>
  
  // Get vault balance for a wallet
  abstract getVaultBalance(
    vaultAddress: Address,
    walletAddress: Address
  ): Promise<{
    balance: bigint
    balanceFormatted: string
    shares: bigint
    sharesFormatted: string
    chainId: number
  }>
}
```

### Type Definitions

#### `LendTransaction`

```typescript
interface LendTransaction {
  hash?: string
  amount: bigint
  asset: Address
  marketId: string
  apy: number
  timestamp: number
  transactionData?: {
    approval?: TransactionData
    deposit: TransactionData
  }
  slippage?: number
}
```

#### `LendVaultInfo`

```typescript
interface LendVaultInfo {
  chainId: number
  address: Address
  name: string
  asset: Address
  totalAssets: bigint
  totalShares: bigint
  apy: number
  apyBreakdown: ApyBreakdown
  owner: Address
  curator: Address
  fee: number
  lastUpdate: number
}
```

#### `ApyBreakdown`

```typescript
interface ApyBreakdown {
  nativeApy: number
  totalRewardsApr: number
  usdc?: number
  morpho?: number
  other?: number
  performanceFee: number
  netApy: number
}
```

## Examples

### Backend Integration (Node.js/Express)

```typescript
import express from 'express'
import { Verbs } from '@eth-optimism/verbs-sdk'
import { PrivyClient } from '@privy-io/server-auth'

const app = express()
app.use(express.json())

const verbs = new Verbs({
  // ... configuration
})

app.post('/api/lend', async (req, res) => {
  try {
    const { userId, amount, asset, chainId } = req.body
    
    const wallet = await verbs.wallet.getWallet(userId)
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' })
    }
    
    const result = await wallet.lend(amount, asset, chainId)
    
    res.json({
      success: true,
      transaction: {
        hash: result.hash,
        apy: result.apy,
        amount: result.amount.toString(),
      }
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.listen(3000)
```

### Frontend Integration (React)

```typescript
import React, { useState } from 'react'

function LendingComponent({ userId }: { userId: string }) {
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleLend = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/lend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          amount: parseFloat(amount),
          asset: 'usdc',
          chainId: 130, // Unichain
        }),
      })
      
      const data = await response.json()
      setResult(data)
    } catch (error) {
      console.error('Lending failed:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount to lend"
      />
      <button onClick={handleLend} disabled={loading}>
        {loading ? 'Lending...' : 'Lend USDC'}
      </button>
      
      {result && (
        <div>
          <p>Transaction: {result.transaction.hash}</p>
          <p>APY: {result.transaction.apy}%</p>
        </div>
      )}
    </div>
  )
}
```

### Testing with Local Development

```typescript
import { describe, it, expect } from 'vitest'
import { Verbs } from '@eth-optimism/verbs-sdk'

describe('Lending Integration', () => {
  it('should lend USDC successfully', async () => {
    const verbs = new Verbs({
      // Test configuration
      wallet: {
        hostedWalletConfig: {
          provider: {
            type: 'privy',
            privyClient: mockPrivyClient,
          },
        },
        smartWalletConfig: {
          provider: {
            type: 'default',
          },
        },
      },
      lend: {
        type: 'morpho',
      },
      chains: [
        {
          chainId: 84532, // Base Sepolia for testing
        },
      ],
    })

    const wallet = await verbs.wallet.createWallet('test-user')
    const result = await wallet.lend(10, 'usdc', 84532)
    
    expect(result.amount).toBe(10n * 10n ** 6n) // 10 USDC in wei
    expect(result.apy).toBeGreaterThan(0)
    expect(result.hash).toBeDefined()
  })
})
```

## Troubleshooting

### Common Issues

#### 1. "Wallet not found" errors

```typescript
// Always check if wallet exists before operations
const wallet = await verbs.wallet.getWallet(userId)
if (!wallet) {
  // Create wallet if it doesn't exist
  wallet = await verbs.wallet.createWallet(userId)
}
```

#### 2. "Insufficient balance" errors

```typescript
// Check balance before lending
const balance = await wallet.getBalance('usdc', chainId)
if (balance.balance < parseUnits(amount.toString(), 6)) {
  throw new Error('Insufficient USDC balance')
}
```

#### 3. Gas estimation failures

```typescript
// Use custom gas limits for complex transactions
const result = await wallet.lend(amount, 'usdc', chainId, undefined, {
  gasLimit: 500000n,
})
```

#### 4. Network connectivity issues

```typescript
// Add retry logic for network requests
async function lendWithRetry(wallet, amount, asset, chainId, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await wallet.lend(amount, asset, chainId)
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
    }
  }
}
```

### Debug Mode

Enable detailed logging for troubleshooting:

```typescript
// Set environment variable
process.env.DEBUG = 'verbs:*'

// Or use console logging in development
const originalConsoleLog = console.log
console.log = (...args) => {
  if (process.env.NODE_ENV === 'development') {
    originalConsoleLog('[Verbs Debug]', ...args)
  }
}
```

### Support Channels

- **GitHub Issues**: [ethereum-optimism/verbs](https://github.com/ethereum-optimism/verbs/issues)
- **Documentation**: Check the `/packages/sdk/README.md` for additional details
- **API Reference**: Generated TypeDoc documentation available in the repository

---

## Next Steps

1. **Set up your development environment** with the required environment variables
2. **Start with the testnet** (Base Sepolia) for development and testing
3. **Implement error handling** and user feedback in your application
4. **Test thoroughly** before deploying to production networks
5. **Monitor transactions** using block explorers and implement proper logging

The Verbs SDK is designed to grow with your application. As new "verbs" (DeFi operations) are added, you'll be able to integrate them using the same patterns and architecture established with the lend functionality.
