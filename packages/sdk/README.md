# verbs-sdk

Verbs is an SDK of abstractions and adapters for building applications on the OP stack

## Installation

```bash
npm install @eth-optimism/verbs-sdk
```

## Quick Start

Initialize the SDK with your wallet provider configuration:

```typescript
import { initVerbs } from '@eth-optimism/verbs-sdk'

const verbs = initVerbs({
  // MORE COMING SOON
})
```

## Usage

### Creating a Wallet

```typescript
// Create a new wallet for a user
const wallet = await verbs.createWallet('user123')

console.log(`Wallet created: ${wallet.address}`)
console.log(`Wallet ID: ${wallet.id}`)

// Get wallet balance
const balance = await wallet.getBalance()
console.log(`Balance: ${balance} wei`)
```

### Retrieving a Wallet

```typescript
// Get existing wallet by user ID
const wallet = await verbs.getWallet('user123')

if (wallet) {
  console.log(`Found wallet: ${wallet.address}`)
} else {
  console.log('Wallet not found')
}
```

## Development

### Prerequisites

For running supersim integration tests, you'll need:

1. **Supersim** - Local multi-chain development environment ([GitHub](https://github.com/ethereum-optimism/supersim))

   ```bash
   # macOS/Linux
   brew install ethereum-optimism/tap/supersim

   # Or download from releases
   # https://github.com/ethereum-optimism/supersim/releases
   ```

2. **Foundry** - Required by supersim
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

### Testing

Run unit tests:

```bash
pnpm test
```

Run tests including external tests (those that make real network requests):

```bash
EXTERNAL_TEST=true pnpm test
```

Run tests including supersim integration tests:

```bash
SUPERSIM_TEST=true pnpm test
```

External tests are used for integration testing with live APIs and services. Supersim tests require supersim to be installed and create local forked networks. Both are disabled by default.

#### Supersim Integration Tests

Some tests use supersim for local forked network testing. They automatically start/stop supersim, fund test wallets, and test transaction execution.

## Documentation

Generate API documentation:

```bash
npm run docs
```
