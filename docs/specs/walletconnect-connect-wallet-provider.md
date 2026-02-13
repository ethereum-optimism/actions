# WalletConnectProvider Specification

> **Prerequisite:** This document assumes familiarity with the [ConnectWallet API Specification](./connect-wallet-summary.md), which defines the `ConnectWalletProvider` abstract base class, wallet namespace API, and SDK configuration.

## Overview

`WalletConnectProvider` is a concrete implementation of `ConnectWalletProvider` that connects external wallets via the [WalletConnect v2](https://docs.walletconnect.com/) relay protocol. It wraps `@walletconnect/ethereum-provider` to handle QR code pairing, deep linking, session persistence, and relay communication.

---

## Configuration

```typescript
interface WalletConnectProviderConfig extends ConnectWalletProviderConfig {
  /** WalletConnect Cloud project ID (required) — obtain from cloud.walletconnect.com */
  projectId: string
  /** App metadata shown in wallet pairing UI */
  metadata?: {
    name: string
    description: string
    url: string
    icons: string[]
  }
  /** Show WalletConnect's built-in QR modal (default: true).
   *  Set to false for custom QR rendering via `display_uri` event. */
  showQrModal?: boolean
  /** Custom RPC URLs per chain. Defaults to ChainManager's configured RPCs. */
  rpcMap?: Record<number, string>
}
```

> **Implementation note:** `@walletconnect/ethereum-provider` is a **peer dependency** — the SDK does not bundle it. The provider is initialized via `EthereumProvider.init()` (async factory) with `optionalChains` populated from the SDK's configured chains.

---

## What WalletConnect Manages Beyond the Base Class

| Concern | Base `ConnectWalletProvider` | `WalletConnectProvider` |
|---|---|---|
| **Connection ceremony** | Abstract `connect()` | QR code / deep link via WalletConnect relay |
| **Session persistence** | Not handled | `localStorage` sessions (~7 day TTL), auto-restore on init |
| **Account format** | `Address` | CAIP-10 (`eip155:84532:0x...`) → parsed to `Address` |
| **Chain negotiation** | `validateChain()` requests switch | `optionalChains` sent during pairing proposal |
| **Transport** | Any EIP-1193 | WebSocket relay to WalletConnect bridge servers |
| **Custom QR rendering** | N/A | `display_uri` event with URI for custom QR components |
| **Disconnect** | Abstract `disconnect()` | Relay `session_delete` + local session cleanup |
| **Session expiry** | N/A | ~7 day TTL; `session_delete` from relay triggers `disconnect` event |

---

## Class Definition

```typescript
class WalletConnectProvider extends ConnectWalletProvider<
  WalletConnectProviderConfig
> {
  private wcProvider: InstanceType<typeof EthereumProvider> | null = null

  async connect(): Promise<ConnectWalletResult> {
    // 1. Initialize @walletconnect/ethereum-provider with projectId + chains
    // 2. Enable the provider (triggers QR modal or deep link)
    // 3. Parse CAIP-10 accounts to Address[]
    // 4. Return { provider, accounts, chainId }
  }

  async disconnect(): Promise<void> {
    // 1. Call wcProvider.disconnect()
    // 2. Clean up event listeners
    // 3. Set wcProvider = null
  }

  get connected(): boolean {
    // Check wcProvider.session existence
  }

  on(event: ConnectWalletEvent, listener: (...args: unknown[]) => void): void {
    // Forward to wcProvider.on()
    // Map WalletConnect session_delete → 'disconnect' event
  }

  removeListener(event: ConnectWalletEvent, listener: (...args: unknown[]) => void): void {
    // Forward to wcProvider.removeListener()
  }

  supportedChainIds(): number[] {
    // Return chain IDs from ChainManager config
  }
}
```

---

## Session Lifecycle

### Initial Connection

```
Developer calls connect()
  → EthereumProvider.init({ projectId, optionalChains, showQrModal, rpcMap, metadata })
  → provider.enable()
  → WalletConnect relay opens WebSocket
  → QR modal displayed (or display_uri emitted for custom rendering)
  → User scans QR / taps deep link in mobile wallet
  → Wallet approves session proposal
  → provider.accounts populated (CAIP-10 format)
  → Session stored in localStorage
  → ConnectWalletResult returned
```

### Session Restoration

On subsequent page loads, WalletConnect's `EthereumProvider` automatically restores persisted sessions:

```typescript
const provider = actions.wallet.connectWalletProvider

// If a session was persisted, connected is true without calling connect()
if (provider.connected) {
  const wallet = await actions.wallet.connectWallet()
  // Wallet is ready — no QR code needed
}
```

> **Implementation note:** `EthereumProvider.init()` checks `localStorage` for an existing session. If found and not expired (~7 day TTL), the provider reconnects to the relay automatically. `loadPersistedSession()` is called internally during init.

### Session Expiry & Disconnect

- WalletConnect sessions have a ~7 day TTL set by the relay
- The relay sends `session_delete` when a session expires or the remote wallet disconnects
- `WalletConnectProvider` maps `session_delete` to the `disconnect` event
- Consumers should listen for `disconnect` and clear stale wallet references

---

## Custom QR Rendering

For apps that want to render their own QR code instead of WalletConnect's built-in modal:

```typescript
const actions = createActions({
  wallet: {
    connectWallet: {
      walletConnect: {
        projectId: 'YOUR_PROJECT_ID',
        showQrModal: false, // Disable built-in modal
      },
    },
  },
  // ...
})

const provider = actions.wallet.connectWalletProvider

// Listen for the pairing URI before calling connect
provider.on('display_uri', (uri: string) => {
  // Render QR code in your own UI component
  renderCustomQrCode(uri)
})

const wallet = await actions.wallet.connectWallet()
```

> **Implementation note:** `display_uri` is a WalletConnect-specific event, not part of the base `ConnectWalletEvent` type. Consumers access it through the provider's `on()` method which accepts arbitrary event names. When `showQrModal: false`, the `display_uri` event is the only way to present the pairing URI to the user.

---

## RPC Configuration

WalletConnect requires RPC URLs for each chain to relay JSON-RPC calls:

```typescript
const actions = createActions({
  wallet: {
    connectWallet: {
      walletConnect: {
        projectId: 'YOUR_PROJECT_ID',
        rpcMap: {
          84532: 'https://sepolia.base.org',
        },
      },
    },
  },
  chains: [{ chainId: 84532, rpcUrl: 'https://sepolia.base.org' }],
})
```

> **Implementation note:** If `rpcMap` is not provided, the implementation defaults to the RPC URLs configured in `ChainManager`. This avoids requiring developers to specify the same URLs twice.

---

## CAIP-10 Account Parsing

WalletConnect returns accounts in [CAIP-10](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-10.md) format:

```
eip155:84532:0x1234...abcd
```

The provider parses these to standard `Address` values (`0x1234...abcd`) before returning them in `ConnectWalletResult.accounts`.

---

## Usage Example

### Basic WalletConnect Connection

```typescript
const actions = createActions({
  wallet: {
    connectWallet: {
      walletConnect: { projectId: 'YOUR_PROJECT_ID' },
    },
    smartWalletConfig: { provider: { type: 'default' } },
  },
  chains: [{ chainId: 84532, rpcUrl: 'https://sepolia.base.org' }],
  lend: { aave: {} },
})

// Connect — shows QR modal for mobile wallet pairing
const wallet = await actions.wallet.connectWallet()

// Use the wallet for DeFi operations
await wallet.lend.supply({
  asset: USDC,
  amount: 1000,
  chainId: 84532,
})
```

### WalletConnect + Smart Wallet

```typescript
const smartWallet = await actions.wallet.connectSmartWallet({
  walletAddress: '0x...',
})

// Gas-sponsored operations via ERC-4337
await smartWallet.lend.supply({
  asset: USDC,
  amount: 1000,
  chainId: 84532,
})
```

### Event Handling

```typescript
const provider = actions.wallet.connectWalletProvider

provider.on('accountsChanged', (accounts: Address[]) => {
  // User switched accounts in their mobile wallet
})

provider.on('chainChanged', (chainId: number) => {
  // User switched chains
})

provider.on('disconnect', () => {
  // Session expired or user disconnected from mobile wallet
})
```

---

## Peer Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@walletconnect/ethereum-provider` | `^2.x` | EIP-1193 provider over WalletConnect relay |

> **Implementation note:** Following the client injection pattern from BridgeProvider (PR #287), the SDK declares `@walletconnect/ethereum-provider` as an optional peer dependency. Apps that don't use WalletConnect don't need to install it.
