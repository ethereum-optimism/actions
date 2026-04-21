import type { AuthorizationContext, PrivyClient } from '@privy-io/node'
import type { TurnkeySDKClientBase } from '@turnkey/core'
import type { TurnkeyClient as TurnkeyHttpClient } from '@turnkey/http'
import type { TurnkeyServerClient } from '@turnkey/sdk-server'
import type { Address } from 'viem'

import type { HostedWalletProvidersSchema } from '@/wallet/core/providers/hosted/types/index.js'
import type { PrivyHostedWalletProvider } from '@/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.js'
import type { TurnkeyHostedWalletProvider } from '@/wallet/node/providers/hosted/turnkey/TurnkeyHostedWalletProvider.js'

/**
 * Node provider type keys
 * @description
 * Narrow union of provider identifiers supported in the Node environment.
 * Uses an intersection of the keys from each map to guarantee that all maps
 * stay in sync (options, instances, and toActions options) at compile time.
 */
export type NodeProviderTypes = keyof NodeOptionsMap &
  keyof NodeHostedProviderInstanceMap &
  keyof NodeToActionsOptionsMap

/**
 * Configuration options per Node hosted wallet provider
 * @description
 * Strongly-typed configuration inputs passed to each provider factory when
 * creating a hosted wallet provider for Node.
 */
export interface NodeOptionsMap {
  /**
   * Privy provider configuration
   * @property privyClient Server-side Privy client instance used to query/create wallets
   * @property authorizationContext Optional authorization context for the Privy client.
   * Used when Privy needs to sign requests.
   * See https://docs.privy.io/controls/authorization-keys/using-owners/sign/automatic#using-the-authorization-context
   * for more information on building and using the authorization context.
   */
  privy: {
    privyClient: PrivyClient
    authorizationContext?: AuthorizationContext
  }
  /**
   * Turnkey provider configuration
   * @property client Turnkey SDK/HTTP client used to sign and manage keys
   * @property organizationId Turnkey organization identifier that owns the key material
   */
  turnkey: {
    client: TurnkeyHttpClient | TurnkeyServerClient | TurnkeySDKClientBase
  }
}

/**
 * Options for converting a Turnkey hosted wallet to an Actions wallet
 * @description Parameters for converting a hosted wallet to an Actions wallet
 * @property signWith This can be a wallet account address, private key address, or private key ID.
 * @property ethereumAddress Ethereum address to use for this account, in the case that a private key ID is used to sign.
 * If left undefined, `createAccount` will fetch it from the Turnkey API. We recommend setting this if you're using a passkey
 * client, so that your users are not prompted for a passkey signature just to fetch their address. You may leave this
 * undefined if using an API key client.
 */
export type TurnkeyHostedWalletToActionsWalletOptions = {
  organizationId: string
  signWith: string
  ethereumAddress?: string
}

/**
 * Options for converting a Privy hosted wallet to an Actions wallet
 * @description Parameters for converting a hosted wallet to an Actions wallet
 * @property walletId Privy wallet identifier
 * @property address Ethereum address of the wallet
 */
export type PrivyHostedWalletToActionsWalletOptions = {
  walletId: string
  address: Address
}

/**
 * Node environment hosted wallet registry.
 * Registers server-safe providers for use in Node.
 */
export type NodeHostedProviderInstanceMap = {
  privy: PrivyHostedWalletProvider
  turnkey: TurnkeyHostedWalletProvider
}

/**
 * Parameters required to convert each hosted wallet to an Actions wallet (Node)
 * @description
 * Provider-specific, caller-supplied data needed by `toActionsWallet`.
 */
export type NodeToActionsOptionsMap = {
  privy: PrivyHostedWalletToActionsWalletOptions
  turnkey: TurnkeyHostedWalletToActionsWalletOptions
}

/**
 * Complete Node hosted wallet providers schema
 * @description
 * Bundles provider type keys, concrete provider instances, creation configs,
 * and `toActionsWallet` parameter types for the Node environment.
 * This schema is used to type `Actions` and its registries without widening
 * to generic `string` keys.
 */
export type NodeHostedWalletProvidersSchema = HostedWalletProvidersSchema<
  NodeProviderTypes,
  NodeHostedProviderInstanceMap,
  NodeOptionsMap,
  NodeToActionsOptionsMap
>
