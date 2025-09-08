# Verbs SDK Integration Guide: Lend Verb

A comprehensive guide for integrating the Verbs SDK's lending functionality into your application. The Verbs SDK provides lightweight, composable, and type-safe modules for DeFi operations, starting with the "lend" verb powered by Morpho protocol.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
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

The Verbs SDK enables developers to integrate DeFi lending functionality with minimal complexity. The "lend" verb specifically focuses on yield-generating operations initially through the Morpho protocol, providing:

- **Gas-sponsored smart wallets** - ERC-4337 compatible wallets with paymaster support
- **Morpho integration** - Access to high-yield lending markets
- **Multi-chain support** - Works on Unichain and Base Sepolia (more chains coming)
- **Type safety** - Full TypeScript support with comprehensive type definitions
- **Flexible architecture** - Modular design allowing custom wallet providers

### Integration Architecture

The following diagram illustrates how the Verbs SDK integrates into your fintech application workflow:

```
┌─────────────────────┐
│   Your Fintech App  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│     Verbs SDK       │
│  ┌───────────────┐  │
│  │ Authentication│──┼──────────┐
│  │   (Privy)     │  │          │
│  └───────────────┘  │          │
│  ┌───────────────┐  │          │
│  │ Wallet Mgmt   │──┼──────┐   │
│  │ (Smart Wallet)│  │      │   │
│  └───────────────┘  │      │   │
│  ┌───────────────┐  │      │   │
│  │ DeFi Ops      │──┼──┐   │   │
│  │ (Morpho Lend) │  │  │   │   │
│  └───────────────┘  │  │   │   │
└─────────────────────┘  │   │   │
                         │   │   │
        ┌────────────────┘   │   │
        │                    │   │
        ▼                    ▼   ▼
┌─────────────┐    ┌─────────────────────┐
│   Morpho    │    │     External        │
│  Protocol   │    │     Services        │
│             │    │                     │
│ • Lending   │    │ ┌─────────────────┐ │
│   Markets   │    │ │  Privy API      │ │
│ • Vaults    │    │ │ • User Mgmt     │ │
│ • APY Calc  │    │ │ • Wallet Mgmt   │ │
└─────────────┘    │ └─────────────────┘ │
                   │ ┌─────────────────┐ │
                   │ │ Pimlico Bundler │ │
                   │ │ • Gas Sponsor   │ │
                   │ │ • ERC-4337 AA   │ │
                   │ └─────────────────┘ │
                   │ ┌─────────────────┐ │
                   │ │ Blockchain RPC  │ │
                   │ │ • Unichain      │ │
                   │ │ • Base Sepolia  │ │
                   │ └─────────────────┘ │
                   └─────────────────────┘

Data Flow:
1. Your App → Verbs SDK (Simple API calls)
2. Verbs SDK → External Services (Complex integrations)
3. Results flow back through the same path
```

**Integration Flow Explanation**:

1. **Your Application Layer**: Your fintech app interfaces with the Verbs SDK through simple, type-safe APIs
2. **Verbs SDK Core**: Acts as the orchestration layer, handling authentication, wallet management, and DeFi operations
3. **External Service Dependencies**: The SDK coordinates with multiple external services seamlessly
4. **Blockchain Interaction**: All blockchain operations are abstracted away from your application code

**Key Benefits of This Architecture**:

- **Simplified Integration**: Your app only needs to integrate with the Verbs SDK, not multiple external services
- **Abstracted Complexity**: Blockchain interactions, gas management, and protocol specifics are handled internally
- **Modular Design**: Each component can be customized or replaced as needed
- **Production Ready**: Built-in error handling, retry logic, and monitoring capabilities

### Supported Networks

- **Unichain (Chain ID: 130)** - Primary production network
- **Base Sepolia (Chain ID: 84532)** - Testnet for development

### Supported Assets

- **USDC** - Primary stablecoin for lending operations

## Prerequisites

Before integrating the Verbs SDK into your fintech application, ensure you have the following infrastructure and accounts set up. These are essential for the SDK's core functionality including wallet management, gas sponsorship, and DeFi operations.

### Required External Services

#### 1. Privy Account (Required)

**Purpose**: User authentication and hosted wallet management

**Setup Steps**:
1. Visit [privy.io](https://privy.io) and create an account
2. Create a new application in your Privy dashboard
3. Obtain your **App ID** and **App Secret** from the dashboard
4. Configure allowed origins and redirect URLs for your application

**What you'll need**:
- `PRIVY_APP_ID` - Your application's public identifier
- `PRIVY_APP_SECRET` - Your application's secret key (keep secure)

**Cost**: Privy offers a generous free tier for development and testing

#### 2. Pimlico Bundler Service (Required for Gas Sponsorship)

**Purpose**: ERC-4337 bundler service for gasless transactions and smart wallet operations

**Setup Steps**:
1. Visit [pimlico.io](https://pimlico.io) and create an account
2. Generate an API key from your dashboard
3. Set up sponsorship policies for your supported networks
4. Configure spending limits and rules for gas sponsorship

**What you'll need**:
- Pimlico API key (embedded in bundler URL)
- Sponsorship Policy IDs for each network you plan to support
- Bundler URLs for supported networks:
  - **Unichain**: `https://api.pimlico.io/v2/1301/rpc?apikey=YOUR_API_KEY`
  - **Base Sepolia**: `https://api.pimlico.io/v2/84532/rpc?apikey=YOUR_API_KEY`

**Cost**: Pay-per-transaction model with free development tier

### Technical Infrastructure Requirements

#### Node.js Environment
- **Node.js 18+** - Required for running the SDK
- **Package Manager**: npm, yarn, or pnpm
- **TypeScript Support**: Recommended for type safety

#### Network Access
- **Outbound HTTPS**: Required for API calls to external services
- **WebSocket Support**: Optional, for real-time blockchain data
- **CORS Configuration**: If building web applications

#### Development Tools (Optional but Recommended)
- **Foundry**: For local blockchain development and testing
- **Supersim**: For multi-chain local development environment

### Blockchain Infrastructure

#### RPC Endpoints (Optional)
While the SDK provides default RPC endpoints, you may want to use your own for better reliability and rate limits:

**Recommended Providers**:
- **Alchemy** - Enterprise-grade blockchain APIs
- **Infura** - Reliable Ethereum infrastructure
- **QuickNode** - High-performance blockchain endpoints

**Setup**:
```bash
# Optional - Custom RPC URLs
UNICHAIN_RPC_URL=https://your-rpc-provider.com/unichain
BASE_SEPOLIA_RPC_URL=https://your-rpc-provider.com/base-sepolia
```

### Security Considerations

#### Environment Variables Management
- Use a secure environment variable management system
- Never commit API keys or secrets to version control
- Implement proper secret rotation policies
- Use different API keys for development, staging, and production

#### Network Security
- Implement rate limiting for your API endpoints
- Use HTTPS for all external communications
- Consider implementing API key rotation
- Monitor for unusual transaction patterns

#### Wallet Security
- Understand that the SDK manages smart wallets on behalf of users
- Implement proper user authentication before wallet operations
- Consider implementing transaction limits and approval workflows
- Monitor wallet activities for suspicious behavior

### Testing Infrastructure

#### Testnet Requirements
For development and testing, you'll need:
- **Base Sepolia ETH** - For gas fees during testing
- **Base Sepolia USDC** - For testing lending operations
- Access to testnet faucets for obtaining test tokens

#### Local Development (Optional)
- **Supersim** - For local multi-chain testing
- **Foundry** - For smart contract interactions

### Compliance and Regulatory Considerations

#### Know Your Customer (KYC)
- Consider implementing KYC/AML procedures
- Understand regulatory requirements in your jurisdiction
- Plan for compliance reporting and audit trails

#### Financial Regulations
- Understand DeFi lending regulations in your operating regions
- Consider implementing transaction monitoring
- Plan for regulatory reporting requirements

### Monitoring and Observability

#### Recommended Tools
- **Application Performance Monitoring** (APM) tools
- **Blockchain transaction monitoring** services
- **Error tracking** and alerting systems
- **Usage analytics** for understanding user behavior

#### Key Metrics to Track
- Transaction success/failure rates
- Gas usage and costs
- API response times and error rates
- User wallet creation and activity

### Pre-Integration Checklist

Before starting your Verbs SDK integration, ensure you have:

- [ ] **Privy account** set up with App ID and App Secret
- [ ] **Pimlico account** configured with API keys and sponsorship policies
- [ ] **Development environment** with Node.js 18+ installed
- [ ] **Environment variable management** system in place
- [ ] **Security policies** defined for API key management
- [ ] **Testing strategy** planned for both testnet and mainnet
- [ ] **Monitoring and logging** infrastructure ready
- [ ] **Compliance requirements** understood and planned for

### Estimated Setup Time

- **Basic setup** (Privy + Pimlico): 1-2 hours
- **Full infrastructure** (including monitoring, security): 1-2 days
- **Production-ready setup** (including compliance, monitoring): 1-2 weeks

### Support and Resources

- **Privy Documentation**: [docs.privy.io](https://docs.privy.io)
- **Pimlico Documentation**: [docs.pimlico.io](https://docs.pimlico.io)
- **Verbs SDK Issues**: [GitHub Issues](https://github.com/ethereum-optimism/verbs/issues)

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

The lending functionality is abstracted through the `LendProvider` interface, with Morpho as the initial implementation:

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
