import type { Wallet as DynamicWallet } from '@dynamic-labs/wallet-connector-core'
import type { ConnectedWallet } from '@privy-io/react-auth'
import type { TurnkeySDKClientBase } from '@turnkey/react-wallet-kit'

import type { EmbeddedWalletProvidersSchema } from '@/wallet/core/providers/embedded/types/index.js'
import type { DynamicEmbeddedWalletProvider } from '@/wallet/react/providers/embedded/dynamic/DynamicEmbeddedWalletProvider.js'
import type { PrivyEmbeddedWalletProvider } from '@/wallet/react/providers/embedded/privy/PrivyEmbeddedWalletProvider.js'
import type { TurnkeyEmbeddedWalletProvider } from '@/wallet/react/providers/embedded/turnkey/TurnkeyEmbeddedWalletProvider.js'

/**
 * React provider type keys
 * @description
 * Narrow union of provider identifiers supported in the React/browser environment.
 * Uses an intersection of the keys from each map to help keep maps in sync
 * at compile time.
 */
export type ReactProviderTypes = keyof ReactOptionsMap &
  keyof ReactEmbeddedProviderInstanceMap

/**
 * Configuration options per React embedded wallet provider
 * @description
 * Strongly-typed configuration inputs passed to each provider factory when
 * creating a embedded wallet provider for React. The Dynamic provider has no
 * build-time options.
 */
export interface ReactOptionsMap {
  dynamic: undefined
  privy: undefined
  turnkey: undefined
}

/**
 * Options for converting a Dynamic embedded wallet to an Actions wallet
 * @description Parameters for converting a embedded wallet to an Actions wallet
 * @property wallet Dynamic wallet instance obtained from the Dynamic connector
 */
export type DynamicEmbeddedWalletToActionsWalletOptions = {
  wallet: DynamicWallet
}

/**
 * Options for converting a Privy embedded wallet to an Actions wallet
 * @description Parameters for converting a Privy embedded wallet to an Actions wallet
 * @property connectedWallet Privy ConnectedWallet instance from @privy-io/react-auth
 */
export type PrivyEmbeddedWalletToActionsWalletOptions = {
  connectedWallet: ConnectedWallet
}

/**
 * Options for converting a Turnkey embedded wallet to an Actions wallet
 * @description Parameters for converting a embedded wallet to an Actions wallet
 * @property signWith This can be a wallet account address, private key address, or private key ID.
 * @property ethereumAddress Ethereum address to use for this account, in the case that a private key ID is used to sign.
 * If left undefined, `createSigner` will fetch it from the Turnkey API. We recommend setting this if you're using a passkey
 * client, so that your users are not prompted for a passkey signature just to fetch their address. You may leave this
 * undefined if using an API key client.
 */
export type TurnkeyEmbeddedWalletToActionsWalletOptions = {
  client: TurnkeySDKClientBase
  organizationId: string
  signWith: string
  ethereumAddress?: string
}

/**
 * React/browser embedded wallet registry
 * @description Registers browser-only providers for client apps.
 */
export type ReactEmbeddedProviderInstanceMap = {
  dynamic: DynamicEmbeddedWalletProvider
  privy: PrivyEmbeddedWalletProvider
  turnkey: TurnkeyEmbeddedWalletProvider
}

/**
 * Parameters required to convert each embedded wallet to an Actions wallet (React)
 * @description Provider-specific, caller-supplied data needed by `toActionsWallet`.
 */
export type ReactToActionsOptionsMap = {
  dynamic: DynamicEmbeddedWalletToActionsWalletOptions
  privy: PrivyEmbeddedWalletToActionsWalletOptions
  turnkey: TurnkeyEmbeddedWalletToActionsWalletOptions
}

/**
 * Complete React embedded wallet providers schema
 * @description
 * Bundles provider type keys, concrete provider instances, creation configs,
 * and `toActionsWallet` parameter types for the React environment.
 * This schema is used to type `Actions` and its registries without widening
 * to generic `string` keys.
 */
export type ReactEmbeddedWalletProvidersSchema = EmbeddedWalletProvidersSchema<
  ReactProviderTypes,
  ReactEmbeddedProviderInstanceMap,
  ReactOptionsMap,
  ReactToActionsOptionsMap
>
