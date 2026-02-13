# ConnectWallet API Specification

## Overview

The Actions SDK enables embedded wallet integrations to connect with DeFi actions including Lend, Borrow, Swap, and Pay. This specification defines **ConnectWallet** support for third-party external wallets — wallets where the signer lives in the user's browser extension, mobile app, or hardware device rather than being managed by a hosted/embedded provider.

Today the SDK supports **hosted/embedded wallets** (Privy, Dynamic, Turnkey) where key management is delegated to a provider SDK on both server (Node) and client (React). ConnectWallet extends the wallet system to accept **external signers** from wallets like MetaMask, Coinbase Wallet, Rainbow, Rabby, and WalletConnect-compatible wallets.

The SDK uses the same **adapter pattern** established by other providers. A `ConnectWalletProvider` abstract base class defines the interface, with concrete implementations for specific connection methods (see [walletconnect-connect-wallet-provider.md](./walletconnect-connect-wallet-provider.md)).

---

## Common Types

### EIP-1193 Provider

External wallets expose an [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) provider — the standard interface for Ethereum wallet communication in the browser:

```typescript
interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on(event: string, listener: (...args: unknown[]) => void): void
  removeListener(event: string, listener: (...args: unknown[]) => void): void
}
```

viem's `walletClient` and `custom(provider)` transport already support EIP-1193 natively.

---

## Architecture

### Provider Pattern

This follows the established provider pattern used across the SDK:

| LendProvider | SwapProvider | BridgeProvider | ConnectWalletProvider |
|---|---|---|---|
| `LendProvider` abstract | `SwapProvider` abstract | `BridgeProvider` abstract | `ConnectWalletProvider` abstract |
| `MorphoLendProvider` | `UniswapSwapProvider` | `NativeBridgeProvider` | `WalletConnectProvider` |
| `AaveLendProvider` | — | `CustomBridgeProvider` | `InjectedConnectWalletProvider` (future) |

### ConnectWalletProvider Abstract Base Class

The abstract class handles everything generic to connecting an external wallet:

```typescript
abstract class ConnectWalletProvider<
  TConfig extends ConnectWalletProviderConfig = ConnectWalletProviderConfig,
> {
  protected readonly _config: TConfig
  protected readonly chainManager: ChainManager
  protected readonly lendProviders: { ... }
  protected readonly swapProviders: { ... }
  protected readonly supportedAssets?: Asset[]

  /** Connect and return an EIP-1193 provider + accounts */
  abstract connect(params?: unknown): Promise<ConnectWalletResult>

  /** Disconnect the wallet and clean up */
  abstract disconnect(): Promise<void>

  /** Whether a session is currently active */
  abstract get connected(): boolean

  /** Subscribe to provider events */
  abstract on(event: ConnectWalletEvent, listener: (...args: unknown[]) => void): void

  /** Unsubscribe from provider events */
  abstract removeListener(event: ConnectWalletEvent, listener: (...args: unknown[]) => void): void

  /**
   * Convert connected provider to an Actions EOAWallet
   * (Handled by base class — not abstract)
   */
  toActionsWallet(provider: EIP1193Provider, address: Address): Promise<Wallet>

  /**
   * Create a viem LocalAccount from the connected provider
   * (Handled by base class — not abstract)
   */
  createSigner(provider: EIP1193Provider, address: Address): Promise<LocalAccount>

  /**
   * Validate that the provider's active chain is in configured chains.
   * Request chain switch if not.
   * (Handled by base class — not abstract)
   */
  protected validateChain(provider: EIP1193Provider): Promise<void>

  /**
   * Get supported chain IDs for this provider
   */
  abstract supportedChainIds(): number[]
}
```

**What the base class handles (not abstract):**
- Converting any EIP-1193 provider to a viem `WalletClient` → `LocalAccount` → `EOAWallet`
- Chain validation against configured `ChainManager` chains
- Requesting chain switch via `wallet_switchEthereumChain` when needed
- Passing `lendProviders`, `swapProviders`, and `supportedAssets` through to the resulting `Wallet`

**What implementations must provide (abstract):**
- `connect()` — the connection ceremony (QR code, popup, injected detection, etc.)
- `disconnect()` — session/connection cleanup
- `connected` — connection state
- `on()` / `removeListener()` — event forwarding from the underlying provider
- `supportedChainIds()` — which chains this provider can reach

### ConnectWalletResult

```typescript
interface ConnectWalletResult {
  /** The EIP-1193 provider to use for signing */
  provider: EIP1193Provider
  /** Connected account addresses */
  accounts: Address[]
  /** Active chain ID */
  chainId: number
}
```

### ConnectWalletEvent

```typescript
type ConnectWalletEvent =
  | 'accountsChanged'   // User switched accounts
  | 'chainChanged'      // User switched chains
  | 'disconnect'        // Wallet disconnected
```

> **Implementation note:** Concrete providers may emit additional events beyond this base set (e.g., WalletConnect's `display_uri`). Consumers can listen for these via the provider's `on()` method.

---

## Wallet Namespace API

### `actions.wallet.connectWallet(params?)`

Connect an external wallet and return a fully functional Actions wallet.

```typescript
// Using configured provider (e.g., WalletConnect)
const wallet = await actions.wallet.connectWallet()

// Or pass an EIP-1193 provider directly (injected wallet)
const wallet = await actions.wallet.connectWallet({
  provider: window.ethereum,
})
```

**Parameters:**

```typescript
interface ConnectWalletParams {
  /** EIP-1193 provider to use directly (bypasses configured ConnectWalletProvider).
   *  Useful for injected wallets like MetaMask. */
  provider?: EIP1193Provider
  /** Specific account address to use. If omitted, uses first connected account. */
  address?: Address
}
```

**Returns:** `Wallet` (an `EOAWallet` instance backed by the external signer)

**Behavior:**
- If `params.provider` is given, uses it directly (no ConnectWalletProvider involved)
- If no `params.provider`, delegates to the configured `ConnectWalletProvider.connect()`
- In both cases, the EIP-1193 provider is converted to a `Wallet` via the base class

> **Implementation note:** The `provider` parameter enables a "bring your own provider" escape hatch. Any EIP-1193 provider works — `window.ethereum`, a WalletConnect provider the developer initialized themselves, or a Coinbase Wallet SDK provider. The configured `ConnectWalletProvider` is the managed path for apps that want the SDK to handle connection lifecycle.

---

### `actions.wallet.connectSmartWallet(params)`

Connect an external wallet as a **signer** on an ERC-4337 smart wallet.

```typescript
const smartWallet = await actions.wallet.connectSmartWallet({
  walletAddress: '0x...',
})

// Or with an explicit provider
const smartWallet = await actions.wallet.connectSmartWallet({
  provider: window.ethereum,
  walletAddress: '0x...',
})
```

**Parameters:**

```typescript
interface ConnectSmartWalletParams {
  /** EIP-1193 provider (optional — uses configured ConnectWalletProvider if omitted) */
  provider?: EIP1193Provider
  /** Specific account address to use from the provider */
  address?: Address
  /** Smart wallet address. Required unless deploymentSigners provided. */
  walletAddress?: Address
  /** Original deployment signers for address calculation */
  deploymentSigners?: Signer[]
  /** Additional signers on the smart wallet */
  signers?: Signer[]
  /** Nonce used during smart wallet creation */
  nonce?: bigint
}
```

**Returns:** `SmartWallet` (ERC-4337 wallet with the external signer)

> **Implementation note:** Reuses the existing `SmartWalletProvider.getWallet()` flow. The external provider is converted to a `LocalAccount` via `ConnectWalletProvider.createSigner()`, then passed as the `signer` parameter.

---

### `actions.wallet.connectWalletProvider`

Direct access to the configured `ConnectWalletProvider` for advanced use cases (event listening, disconnect, connection state).

```typescript
const provider = actions.wallet.connectWalletProvider

// Check connection state
if (provider.connected) { ... }

// Listen for events
provider.on('accountsChanged', (accounts) => { ... })
provider.on('chainChanged', (chainId) => { ... })
provider.on('disconnect', () => { ... })

// Disconnect
await provider.disconnect()
```

---

### Account Change & Disconnect Events

External wallets can change accounts or disconnect at any time.

```typescript
const provider = actions.wallet.connectWalletProvider

provider.on('accountsChanged', (accounts: Address[]) => {
  // Re-connect or update UI
})

provider.on('chainChanged', (chainId: number) => {
  // Update chain context
})

provider.on('disconnect', () => {
  // Clean up wallet state
})
```

> **Implementation note:** These proxy the underlying EIP-1193 provider events. `accountsChanged` is critical — when the user switches accounts, the current `Wallet` instance becomes stale. Consumers should re-call `connectWallet()` or invalidate the wallet reference.

---

## SDK Configuration

### ConnectWalletConfig

```typescript
interface ConnectWalletConfig {
  /** WalletConnect provider configuration */
  walletConnect?: WalletConnectProviderConfig
  // Future: injected?: InjectedConnectWalletProviderConfig
}
```

### With Hosted + External Wallets (Hybrid)

```typescript
const actions = createActions({
  wallet: {
    hostedWalletConfig: { provider: { type: 'privy', config: { ... } } },
    connectWallet: {
      walletConnect: { projectId: 'YOUR_PROJECT_ID' },
    },
    smartWalletConfig: { provider: { type: 'default' } },
  },
  chains: [{ chainId: 84532, rpcUrl: '...' }],
  swap: { uniswap: { ... } },
  lend: { aave: { ... } },
})

// Path A: Privy embedded wallet
const privySigner = await actions.wallet.createSigner({ connectedWallet })
const privySmartWallet = await actions.wallet.getSmartWallet({ signer: privySigner })

// Path B: External wallet
const externalWallet = await actions.wallet.connectWallet()

// Both wallets have identical SDK capabilities
```

### Standalone Mode (No Hosted Provider)

For apps that **only** use external wallets:

```typescript
const actions = createActions({
  wallet: {
    connectWallet: {
      walletConnect: { projectId: 'YOUR_PROJECT_ID' },
    },
    smartWalletConfig: { provider: { type: 'default' } },
  },
  chains: [{ chainId: 84532, rpcUrl: '...' }],
  lend: { aave: {} },
})

const wallet = await actions.wallet.connectWallet()
```

> **Implementation note:** Standalone mode makes `hostedWalletConfig` optional in `WalletConfig`. When omitted, `createSigner()` and `toActionsWallet()` throw with a clear error. The `HostedWalletProviderRegistry` is not instantiated. This keeps the hosted wallet dependency tree out of the bundle (complements the tree-shakeability work in PR #292).

### Direct Provider (No Config)

For injected wallets or developer-managed providers, no `connectWallet` config is needed:

```typescript
const actions = createActions({
  wallet: {
    smartWalletConfig: { provider: { type: 'default' } },
  },
  chains: [{ chainId: 84532, rpcUrl: '...' }],
})

// Pass provider directly — works without any connectWallet config
const wallet = await actions.wallet.connectWallet({
  provider: window.ethereum,
})
```

---

## Design Decisions

- **Abstract + implementation pattern** — `ConnectWalletProvider` base class with concrete implementations per connection method. Mirrors `LendProvider` → `AaveLendProvider` and `SwapProvider` → `UniswapSwapProvider`.
- **EIP-1193 as the common interface** — All external wallets (injected, WalletConnect, Coinbase SDK) expose EIP-1193. The base class converts any EIP-1193 provider to an Actions wallet.
- **Two connection paths** — Configured provider (managed lifecycle via `ConnectWalletProvider`) or direct provider (bring your own EIP-1193 via `params.provider`). The managed path handles connection ceremony, session persistence, and events. The direct path is a zero-config escape hatch.
- **Provider SDKs as peer dependencies** — The SDK does not bundle provider-specific packages (e.g., `@walletconnect/ethereum-provider`). Developers install them. This follows the client injection pattern from BridgeProvider (PR #287).
- **EOAWallet reuse** — External wallets produce `EOAWallet` instances using the same base class as hosted EOA wallets. All namespace functionality (lend, swap, borrow, bridge) works identically.
- **Smart wallet composition** — External signers can control ERC-4337 smart wallets via `connectSmartWallet()`, reusing the existing `SmartWalletProvider.getWallet()` path.
- **Standalone mode** — Apps that only use external wallets can skip `hostedWalletConfig` entirely, enabling smaller bundles.
- **Event forwarding** — EIP-1193 events are proxied through `ConnectWalletProvider`. Implementation-specific events are available via the provider's `on()` method.

---

## Signing Differences

| | Hosted/Embedded Wallets | External Wallets (ConnectWallet) |
|---|---|---|
| **Key custody** | Provider (Privy, Dynamic, Turnkey) | User (browser extension, mobile, hardware) |
| **Signing** | Provider SDK methods | EIP-1193 `eth_signTransaction`, `personal_sign`, `eth_signTypedData_v4` |
| **Account discovery** | Provider API (walletId, etc.) | EIP-1193 `eth_requestAccounts` |
| **User interaction** | Transparent (no popup) | Requires user approval (popup/confirmation) |
| **Server-side** | Supported (Node providers) | Not supported (browser-only) |
| **React-side** | Supported (React providers) | Supported |
| **Connection** | Provider-specific auth flows | Implementation-specific (QR code, browser popup, deep link) |
| **Session lifetime** | Managed by provider | Implementation-specific (injected: always available, WalletConnect: ~7 days) |
| **Smart wallet signer** | Via `createSigner()` → `getSmartWallet()` | Via `connectSmartWallet()` |

> **Implementation note:** External wallet signing is **asynchronous and user-gated** — every `send()` or `sign()` triggers a confirmation in the user's wallet. The SDK's `EOAWallet.send()` already awaits transaction results, so this is transparent at the API level. Consumers should handle `UserRejectedRequestError` (EIP-1193 error code `4001`).

---

## Testnet Support

- **Target chain:** Base Sepolia (84532)
- **Test wallets:** MetaMask (injected), Coinbase Wallet (injected), WalletConnect (via mobile wallet)
- **Demo flow:** Connect external wallet → view balances → execute swap/lend operations

---

## Demo Application

The connect wallet feature will be integrated into the existing demo:

- **Frontend:** "Connect Wallet" button alongside existing Privy login flow
- **Backend:** No backend changes required — external wallet signing is entirely client-side
- **Wallet selector:** Modal with detected injected wallets + configured provider options
- **Account display:** Connected address, chain, and balances
- **Disconnect flow:** Clean disconnection with event handling

---

## Usage Examples

### Injected Wallet (MetaMask)

```typescript
// No connectWallet config needed for injected wallets
const wallet = await actions.wallet.connectWallet({
  provider: window.ethereum,
})

await wallet.lend.supply({
  asset: USDC,
  amount: 1000,
  chainId: 84532,
})
```

### External Signer on Smart Wallet

```typescript
const smartWallet = await actions.wallet.connectSmartWallet({
  provider: window.ethereum,
  walletAddress: '0x...',
})

// Smart wallet operations are gas-sponsored via ERC-4337
await smartWallet.lend.supply({
  asset: USDC,
  amount: 1000,
  chainId: 84532,
})
```

### Hybrid: Hosted + External

```typescript
const actions = createActions({
  wallet: {
    hostedWalletConfig: { provider: { type: 'privy', config: { ... } } },
    connectWallet: {
      walletConnect: { projectId: '...' },
    },
    smartWalletConfig: { provider: { type: 'default' } },
  },
  chains: [{ chainId: 84532, rpcUrl: '...' }],
})

// Path A: Privy embedded wallet
const privySigner = await actions.wallet.createSigner({ connectedWallet })
const privySmartWallet = await actions.wallet.getSmartWallet({ signer: privySigner })

// Path B: External wallet
const externalWallet = await actions.wallet.connectWallet()

// Both wallets have identical SDK capabilities
```
