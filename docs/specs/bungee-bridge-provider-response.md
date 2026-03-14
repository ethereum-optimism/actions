# Bungee Bridge Provider — Design Response

> Response to the Bungee Bridge Provider Plan, proposing a design that fits the Actions SDK provider pattern while accommodating Bungee-specific features.

## Design Principles

1. **Provider-specific config at `createActions()`** — Bungee's unique settings (endpoint tiers, fees, API key) live in `ActionsConfig.bridge.config`, just like different wallet providers and lend providers have different config shapes
2. **Shared interface at `wallet.send()` and `actions.send.quote()`** — The developer has no notion of "bridging" as a separate concept. Sending is sending — if it's cross-chain, the SDK handles the bridge internally. Swapping Bungee for another bridge provider requires zero changes to call sites
3. **Per-request flexibility via `providerOptions`** — Bungee-specific routing params (refuel, slippage, bridge filters) passed as typed options on quote requests, not baked into the shared interface
4. **Execution complexity stays internal** — Permit2, Inbox, and Manual flows are implementation details of the Bungee provider, not developer-facing API surface

---

## Configuration

### ActionsConfig (Provider-Specific)

Bungee config lives under `bridge.config` with a Bungee-specific shape. Other bridge providers would have different config shapes in the same position.

```typescript
const actions = createActions({
  wallet: { /* ... */ },
  chains: [
    { chainId: 8453, rpcUrl: '...' },
    { chainId: 10, rpcUrl: '...' },
  ],
  bridge: {
    provider: 'bungee',
    config: {
      // Optional API key — when omitted, uses public sandbox endpoint
      apiKey: process.env.BUNGEE_API_KEY,

      // Optional endpoint override ('public' | 'frontend' | 'dedicated')
      // Auto-selected: public (no key) → dedicated (key provided)
      endpoint: 'dedicated',

      // Optional affiliate tracking
      affiliateAddress: '0x...',

      // Optional fee collection (both required if fees enabled)
      fees: {
        feeTakerAddress: '0x...',
        feeBps: 50, // 0.5%
      },

      // Optional routing defaults (applied to all quotes unless overridden)
      defaults: {
        slippage: 0.5,
        refuel: false,
      },
    },
  },
})
```

**For comparison, another bridge provider's config would look different:**

```typescript
// Hypothetical other provider — different config shape, same position
const actions = createActions({
  bridge: {
    provider: 'otherProvider',
    config: {
      apiKey: process.env.OTHER_API_KEY,
      integrator: 'MyApp',
      fee: 0.02,              // Percentage-based (not basis points)
      rpcOverrides: { ... },  // Provider-specific capability
    },
  },
})
```

The point: each provider defines its own config shape. The provider implementations live inside the SDK, but the shared interface layer (`BridgeProvider` base class, `wallet.send()`, `actions.send.quote()`) doesn't need to understand Bungee's three-tier endpoint system or another provider's integrator ID — that complexity is encapsulated in the provider subclass, not exposed through the shared abstraction.

### BungeeProviderConfig Type

```typescript
interface BungeeProviderConfig {
  /** Optional API key — uses public sandbox when omitted */
  apiKey?: string
  /** Endpoint selection ('public' | 'frontend' | 'dedicated') */
  endpoint?: 'public' | 'frontend' | 'dedicated'
  /** Affiliate address for tracking */
  affiliateAddress?: string
  /** Fee configuration (both fields required if fees enabled) */
  fees?: {
    feeTakerAddress: string
    feeBps: number
  }
  /** Default routing options (can be overridden per-request) */
  defaults?: BungeeRoutingOptions
}

interface BungeeRoutingOptions {
  /** Swap slippage percentage (e.g., 0.5 for 0.5%) */
  slippage?: number
  /** Enable gas refuel on destination */
  refuel?: boolean
  /** Enable manual route selection */
  enableManual?: boolean
  /** Bridge names to include/exclude */
  includeBridges?: string[]
  excludeBridges?: string[]
  /** DEX names to include/exclude */
  includeDexes?: string[]
  excludeDexes?: string[]
}
```

---

## Shared Interface

### `wallet.send()` — Unchanged, Provider-Agnostic

```typescript
// Identical call regardless of bridge provider
const receipt = await wallet.send({
  amount: 100,
  asset: USDC,
  to: '0x...',
  originChainId: 8453,
  destinationChainId: 10,
})

// Returns SendReceipt
console.log(receipt.transactionHash)
console.log(receipt.provider)         // 'bungee'
console.log(receipt.estimatedArrival) // Unix timestamp
console.log(receipt.trackingUrl)      // Provider-specific tracking URL
```

Alternatively, pass a previously-fetched quote to execute that exact quote:

```typescript
const quote = await actions.send.quote({ ... })
// ... show user, they confirm ...
const receipt = await wallet.send({ quote })
```

The developer never interacts with Bungee's API directly through `wallet.send()`. The SDK:
1. If a `quote` is provided, validates it hasn't expired and executes that exact route
2. Otherwise, detects cross-chain transfer (originChainId !== destinationChainId) and fetches a quote internally
3. Delegates to configured bridge provider
4. Provider handles build → approve → execute internally
5. Returns a uniform `SendReceipt`

### `actions.send.quote()` — Shared + Provider Options

The quote function lives under the `send` namespace, not a separate `bridge` namespace. From the developer's perspective, they're getting a quote for a send — the SDK determines whether bridging is needed based on the chain parameters.

```typescript
// Same-chain quote (no bridge needed)
const quote = await actions.send.quote({
  asset: USDC,
  amount: 100,
  to: '0x...',
  chainId: 8453,
})

// Cross-chain quote (bridge handled transparently)
const quote = await actions.send.quote({
  asset: USDC,
  amount: 100,
  to: '0x...',
  originChainId: 8453,
  destinationChainId: 10,
})
```

```typescript
// With provider-specific options — for developers who want fine-grained control
const quote = await actions.send.quote({
  asset: USDC,
  amount: 100,
  to: '0x...',
  originChainId: 8453,
  destinationChainId: 10,
  providerOptions: {
    refuel: true,
    slippage: 1.0,
    includeBridges: ['across', 'stargate-v2'],
    excludeDexes: ['zeroxv2'],
  },
})
```

The quote response includes fee, timing, and output amount information. For same-chain sends, fees are zero and timing is immediate. For cross-chain sends, the bridge provider populates these fields.

### Quote → Send Flow

**Open question for Bungee team:** Can the quote object returned by `actions.send.quote()` be passed back to `wallet.send()` to execute that specific quote? This enables the "preview then confirm" pattern:

```typescript
// 1. Get quote (show user fees/timing before they confirm)
const quote = await actions.send.quote({
  asset: USDC,
  amount: 100,
  to: '0x...',
  originChainId: 8453,
  destinationChainId: 10,
})

// 2. Show user the quote details
console.log(`Fee: ${quote.feePercent}%`)
console.log(`You'll receive: ${quote.amountOut}`)
console.log(`ETA: ${quote.estimatedTime}s`)

// 3. User confirms → execute that exact quote
const receipt = await wallet.send({ quote })
```

For this to work:
- The `SendQuote` object would carry an opaque internal reference (e.g., Bungee's `quoteId` or `autoRoute` data) that the provider uses to execute the exact quoted route
- If the quote has expired (e.g., Bungee quotes expire in ~60s), `wallet.send({ quote })` should throw a clear error like `QuoteExpiredError` rather than silently fetching a new quote with potentially different terms
- For same-chain sends, the quote pass-through is trivial (no expiry concern)
- The quote object should be opaque to the developer — they read the display fields (`amountOut`, `fee`, `estimatedTime`) but don't need to understand the internal data

```typescript
interface SendQuote {
  // Public fields (developer reads these)
  amountIn: bigint
  amountOut: bigint
  fee: bigint
  feePercent: number
  estimatedTime: number
  gasEstimate?: bigint
  provider: string

  // Internal (opaque to developer, used by provider during execution)
  /** @internal */ _providerData?: unknown
  /** @internal */ _expiresAt?: number
}
```

This pattern ensures the user sees exactly what they'll get — no bait-and-switch between quote and execution.

### `actions.send.quotes()` — Multi-Provider Comparison

When multiple bridge providers are configured, compare quotes for a cross-chain send:

```typescript
const quotes = await actions.send.quotes({
  asset: USDC,
  amount: 100,
  to: '0x...',
  originChainId: 8453,
  destinationChainId: 10,
})
// Returns SendQuote[] sorted by best output
```

### `actions.send.supportedRoutes()` — Route Discovery

Returns all supported send routes — both same-chain and cross-chain:

```typescript
const routes = await actions.send.supportedRoutes()
```

---

## Shared Types

These types are **provider-agnostic** — they unify same-chain and cross-chain sends:

```typescript
/**
 * Quote request params — same shape as wallet.send() params.
 * Uses chainId for same-chain, originChainId/destinationChainId for cross-chain.
 */
interface SendQuoteParams<TProviderOptions = Record<string, unknown>> {
  asset: Asset
  amount: number
  to: Address

  /** Single-chain send */
  chainId?: number

  /** Cross-chain send */
  originChainId?: number
  destinationChainId?: number

  /** Provider-specific options for cross-chain sends (typed per provider) */
  providerOptions?: TProviderOptions
}

interface SendQuote {
  amountIn: bigint
  amountOut: bigint
  fee: bigint
  feePercent: number
  estimatedTime: number       // 0 for same-chain
  gasEstimate?: bigint
  provider: string            // 'native', 'bungee', 'same-chain', etc.

  // Internal (opaque to developer — used when passing quote back to wallet.send())
  /** @internal */ _providerData?: unknown
  /** @internal */ _expiresAt?: number
}

interface SendReceipt {
  transactionHash: string
  amountIn: bigint
  amountOut: bigint
  asset: Asset
  to: Address
  originChainId: number
  destinationChainId: number  // Same as originChainId for same-chain sends
  fee: bigint
  provider: string
  estimatedArrival?: number   // Only for cross-chain
  trackingUrl?: string        // Only for cross-chain
}
```

**Note:** `SendQuote` intentionally does NOT include provider-internal data (like `quoteId`, `autoRoute`, `signTypedData`) in its public interface. That data is stored internally by the provider for use during execution.

---

## Internal Implementation

### BungeeBridgeProvider

The provider implements `BridgeClient` and handles all Bungee-specific complexity internally.

```typescript
class BungeeBridgeProvider extends BridgeProvider<BungeeProviderConfig> {
  readonly name = 'bungee'
  private baseURL: string

  constructor(config: BungeeProviderConfig, chainManager: ChainManager) {
    super(config, chainManager)
    this.baseURL = this.resolveEndpoint(config)
  }

  private resolveEndpoint(config: BungeeProviderConfig): string {
    if (config.endpoint === 'frontend') return 'https://backend.bungee.exchange'
    if (config.endpoint === 'dedicated' || config.apiKey) return 'https://dedicated-backend.bungee.exchange'
    return 'https://public-backend.bungee.exchange'
  }
}
```

### Quote Flow (Internal)

```typescript
protected async _getQuote(params: BridgeQuoteInternalParams): Promise<BridgeQuote> {
  // 1. Build query params from shared params
  const queryParams = this.buildQueryParams(params)

  // 2. Merge provider-specific options (from providerOptions or config.defaults)
  const routingOptions = {
    ...this._config.defaults,
    ...params.providerOptions,
  }
  this.applyRoutingOptions(queryParams, routingOptions)

  // 3. Apply client-level fee config
  if (this._config.fees) {
    queryParams.feeTakerAddress = this._config.fees.feeTakerAddress
    queryParams.feeBps = this._config.fees.feeBps.toString()
  }

  // 4. Call Bungee API
  const response = await this.fetchWithAuth('/api/v1/bungee/quote', queryParams)

  // 5. Transform to shared BridgeQuote format
  //    Store autoRoute/quoteId internally for execution
  return this.transformQuoteResponse(response)
}
```

### Execution Flow (Internal)

The three Bungee transaction flows (Permit2, Inbox, Manual) are handled entirely inside `_execute()`. The caller only sees the uniform `BridgeTransaction` output.

```typescript
protected async _execute(params: BridgeExecuteInternalParams): Promise<BridgeTransaction> {
  // 1. Get quote (stores internal route data)
  const { quote, internalData } = await this._getQuoteWithInternals(params)
  const autoRoute = internalData.autoRoute

  // 2. Determine flow and execute
  let txResult: TransactionResult

  if (autoRoute?.signTypedData) {
    // Permit2 flow: sign typed data → submit to Bungee
    txResult = await this.executePermit2Flow(autoRoute, params.walletContext)
  } else if (autoRoute?.txData) {
    // Inbox flow: send tx directly to inbox contract
    txResult = await this.executeInboxFlow(autoRoute, params.walletContext)
  } else {
    // Manual flow: call /build-tx then send
    txResult = await this.executeManualFlow(internalData.quoteId, params.walletContext)
  }

  // 3. Return uniform BridgeTransaction
  return {
    amountIn: quote.amountIn,
    amountOut: quote.amountOut,
    asset: params.asset,
    to: params.to,
    originChainId: params.originChainId,
    destinationChainId: params.destinationChainId,
    fee: quote.fee,
    estimatedArrival: Math.floor(Date.now() / 1000) + quote.estimatedTime,
    transactionData: txResult.transactionData,
    provider: this.name,
  }
}
```

### Error Handling

All API calls capture `server-req-id` for debugging:

```typescript
private async fetchWithAuth(path: string, params: Record<string, string>): Promise<any> {
  const headers: Record<string, string> = {}
  if (this._config.apiKey) headers['x-api-key'] = this._config.apiKey
  if (this._config.affiliateAddress) headers['affiliate'] = this._config.affiliateAddress

  const url = `${this.baseURL}${path}?${new URLSearchParams(params)}`
  const response = await fetch(url, { headers })
  const data = await response.json()
  const serverReqId = response.headers.get('server-req-id')

  if (!data.success) {
    throw new BridgeError(
      `Bungee ${path} error: ${data.statusCode}: ${data.message}. server-req-id: ${serverReqId}`
    )
  }

  return data.result
}
```

---

## What Changes vs the Bungee Plan Document

### Kept (good ideas from the plan)

- **Three-tier endpoint selection** — public/frontend/dedicated with auto-selection logic
- **Fee validation** — both `feeTakerAddress` and `feeBps` required together
- **`server-req-id` in errors** — useful for debugging with Bungee support
- **Per-request routing options** — slippage, refuel, bridge/DEX filtering
- **Three transaction flows** — Permit2, Inbox, Manual are all real and needed
- **Native token address convention** — `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`

### Changed

| Aspect | Plan Document | This Response |
|--------|---------------|---------------|
| **`BungeeQuoteParams` extends `BridgeQuoteParams`** | Per-request Bungee params on shared type | Per-request params in `providerOptions` bag — keeps shared type clean |
| **`submitPermit2Request()` public method** | Developer calls it manually | Internal to `_execute()` — developer never sees Permit2 |
| **`permit2Data` on `BridgeTransactionData`** | Public interface field | Internal implementation detail |
| **`buildTransaction()` with three branches** | Developer chooses flow | Provider determines flow automatically |
| **Class name** | `BungeeBridgeProvider implements BridgeClient` | `BungeeBridgeProvider extends BridgeProvider` (uses base class) |
| **`fromChainId / toChainId` naming** | Used in examples | `originChainId / destinationChainId` (matches SDK convention) |
| **Config location** | Constructor params on client class | `ActionsConfig.bridge.config` (matches SDK pattern) |
| **`walletAddress` on config** | Client-level config | Derived from wallet context at execution time |
| **`defaults` for routing** | Not available | Client-level defaults that can be overridden per-request |

### Removed (not needed at shared interface level)

- `BungeeQuoteParams` as a public type (replaced by `providerOptions`)
- Developer-facing Permit2 signature flow
- Developer-facing Inbox vs Manual decision
- Direct `buildTransaction()` calls from application code
- `requestHash` as a public field on `BridgeTransactionData`

---

## Provider Options Reference

For developers who want fine-grained control over Bungee routing, these options are available via `providerOptions` on `actions.send.quote()`:

```typescript
interface BungeeProviderOptions {
  /** Swap slippage percentage (e.g., 0.5 for 0.5%) */
  slippage?: number
  /** Enable gas refuel on destination chain */
  refuel?: boolean
  /** Enable manual route selection (vs auto) */
  enableManual?: boolean
  /** Disable swapping for manual routes */
  disableSwapping?: boolean
  /** Disable auto routes */
  disableAuto?: boolean
  /** Bridge names to include */
  includeBridges?: string[]
  /** Bridge names to exclude */
  excludeBridges?: string[]
  /** DEX names to include */
  includeDexes?: string[]
  /** DEX names to exclude */
  excludeDexes?: string[]
  /** Payload to execute on destination chain */
  destinationPayload?: string
  /** Gas limit for destination payload execution */
  destinationGasLimit?: string
}
```

These overlap conceptually with options other bridge providers offer (slippage, bridge filtering, refuel/gas), but the naming and semantics are Bungee-specific. Each provider defines its own `ProviderOptions` type.

### Cross-Provider Option Comparison

Even when two providers offer a conceptually similar option, the semantics can differ in ways that matter. We should **not** attempt to consolidate provider option names into a shared vocabulary — each provider defines its own `ProviderOptions` type with its own naming and behavior.

Examples of where naming looks similar but behavior may diverge:

| Concept | Possible Deviations |
|---------|---------------------|
| **Slippage** | Some providers express as percentage (`0.5` = 0.5%), others as decimal (`0.005` = 0.5%). May apply at different stages (swap vs bridge vs both). |
| **Bridge filtering** | Naming varies (`includeBridges` vs `allowBridges` vs `preferBridges`). Some support preference ranking, others only allow/deny. Filter names are provider-specific (e.g., `'across'` in one provider may not match `'across-v2'` in another). |
| **DEX filtering** | Same issues as bridge filtering. One provider's `'1inch'` may cover different underlying aggregation than another's. |
| **Gas refuel** | Some providers offer a boolean toggle, others take an explicit amount to convert to destination gas. Max refuel amounts may differ. |
| **Route ordering** | Some providers return a single auto-optimized route, others return multiple routes sortable by `CHEAPEST` or `FASTEST`. Not all providers support both. |
| **Destination calls** | Payload format, gas limit semantics, and supported contract call patterns vary across providers. |
| **Fee model** | Some use basis points with an explicit fee recipient address, others use a percentage float with portal-based configuration. Fee deduction timing (pre-swap vs post-swap) may differ. |

Attempting to normalize these into shared option names would obscure these differences and create a leaky abstraction. The `providerOptions` pattern keeps each provider's options typed independently — developers who use provider-specific options are already opting into provider-specific behavior.

---

## Implementation Tasks

1. Define `BungeeProviderConfig` and `BungeeProviderOptions` types
2. Implement `BungeeBridgeProvider` extending `BridgeProvider` base class
3. Implement endpoint selection logic in constructor
4. Implement `_getQuote()` with Bungee API mapping and `providerOptions` merging
5. Implement `_execute()` with internal Permit2/Inbox/Manual flow detection
6. Implement `fetchWithAuth()` helper with `server-req-id` error handling
7. Implement response transformers for quote, build-tx, and supported-routes
8. Add fee configuration validation
9. Export provider from SDK for developer use
10. Add to bridge provider factory in `Actions` class

### Files

**New:**
- `packages/sdk/src/bridge/providers/bungee/BungeeBridgeProvider.ts`
- `packages/sdk/src/bridge/providers/bungee/types.ts`
- `packages/sdk/src/bridge/providers/bungee/transformers.ts`
- `packages/sdk/src/bridge/providers/bungee/errors.ts`

**Modified:**
- `packages/sdk/src/bridge/providers/index.ts` (export)
- `packages/sdk/src/actions.ts` (factory registration)
- `packages/sdk/src/index.ts` (re-export)

---

## Summary

This design absorbs the valuable details from the Bungee plan (endpoint tiers, fee handling, three transaction flows, error handling) while fitting them into the established Actions SDK provider pattern:

- **Config** is provider-specific (Bungee's endpoint tiers, fee model, routing defaults)
- **Interface** is shared (`wallet.send()`, `actions.send.quote()`, `actions.send.supportedRoutes()`)
- **No "bridge" concept exposed to developers** — sending is sending, cross-chain is handled transparently
- **Execution** is internal (Permit2/Inbox/Manual flows hidden from developer)
- **Per-request tuning** is opt-in via `providerOptions` (developers who don't need it ignore it)

The same `wallet.send()` call works whether the bridge provider is native, Bungee, or any future provider. Provider switching requires only changing `ActionsConfig.bridge` — no call site changes.

---

## Open Questions

### 1. Does this design work as a whole?

This proposal moves provider-specific complexity (Permit2, Inbox, endpoint tiers) behind the `BridgeProvider` subclass and exposes a unified `wallet.send()` / `actions.send.quote()` interface. Does the Bungee team see any cases where this encapsulation would prevent the SDK from leveraging Bungee's capabilities effectively? Are there Bungee features that fundamentally require developer-facing surface area beyond what `providerOptions` provides?

### 2. Is config-time provider options sufficient, or will developers need transaction-specific options at `wallet.send()` time?

This design places all Bungee-specific routing options either in `ActionsConfig.bridge.config.defaults` (set once) or in `providerOptions` on `actions.send.quote()` (set per-quote). The `wallet.send()` call itself takes no provider-specific params — it either fetches a quote internally or executes a previously-fetched one. Are there scenarios where a developer would need to pass Bungee-specific options at the moment of `wallet.send()` that couldn't be captured earlier at quote time? For example, would a developer ever need to change refuel or slippage between getting a quote and executing it?

### 3. Can the quote object be passed back to `wallet.send()` to execute a specific quoted route?

This is described in the "Quote → Send Flow" section above. The key question for Bungee: does the data returned from `/api/v1/bungee/quote` (specifically `quoteId`, `autoRoute`, `signTypedData`, `txData`) remain valid and executable for a reasonable window after the quote is fetched? What is the expiry window, and does the Bungee API return an explicit expiry timestamp we can use to fail fast if a developer tries to execute a stale quote?

### 4. Are there Bungee-specific status tracking requirements that should surface through the shared receipt?

The `SendReceipt` currently includes `trackingUrl` and `estimatedArrival` as optional fields. Bungee provides `requestHash` for polling `/api/v1/bungee/status`. Should the SDK expose a shared `actions.send.status(receipt)` method that providers implement internally, or is `trackingUrl` sufficient for developers to handle status tracking themselves? If the SDK manages status polling, what polling intervals and timeout behavior does Bungee recommend?
