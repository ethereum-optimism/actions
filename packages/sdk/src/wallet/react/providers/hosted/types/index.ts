import type { Wallet as DynamicWallet } from '@dynamic-labs/wallet-connector-core'
import type { ConnectedWallet } from '@privy-io/react-auth'
import type { TurnkeySDKClientBase } from '@turnkey/react-wallet-kit'

import type { HostedWalletProvidersSchema } from '@/wallet/core/providers/hosted/types/index.js'
import type { DynamicHostedWalletProvider } from '@/wallet/react/providers/hosted/dynamic/DynamicHostedWalletProvider.js'
import type { PrivyHostedWalletProvider } from '@/wallet/react/providers/hosted/privy/PrivyHostedWalletProvider.js'
import type { TurnkeyHostedWalletProvider } from '@/wallet/react/providers/hosted/turnkey/TurnkeyHostedWalletProvider.js'

/**
 * React provider type keys
 * @description
 * Narrow union of provider identifiers supported in the React/browser environment.
 * Uses an intersection of the keys from each map to help keep maps in sync
 * at compile time.
 */
export type ReactProviderTypes = keyof ReactOptionsMap &
  keyof ReactHostedProviderInstanceMap

/**
 * Configuration options per React hosted wallet provider
 * @description
 * Strongly-typed configuration inputs passed to each provider factory when
 * creating a hosted wallet provider for React. The Dynamic provider has no
 * build-time options.
 */
export interface ReactOptionsMap {
  dynamic: undefined
  privy: undefined
  turnkey: undefined
}

/**
 * Options for converting a Dynamic hosted wallet to an Actions wallet
 * @description Parameters for converting a hosted wallet to an Actions wallet
 * @property wallet Dynamic wallet instance obtained from the Dynamic connector
 */
export type DynamicHostedWalletToActionsWalletOptions = {
  wallet: DynamicWallet
}

/**
 * Options for converting a Privy hosted wallet to an Actions wallet
 * @description Parameters for converting a Privy hosted wallet to an Actions wallet
 * @property connectedWallet Privy ConnectedWallet instance from @privy-io/react-auth
 */
export type PrivyHostedWalletToActionsWalletOptions = {
  connectedWallet: ConnectedWallet
}

/**
 * Options for converting a Turnkey hosted wallet to an Actions wallet
 * @description Parameters for converting a hosted wallet to an Actions wallet
 * @property signWith This can be a wallet account address, private key address, or private key ID.
 * @property ethereumAddress Ethereum address to use for this account, in the case that a private key ID is used to sign.
 * If left undefined, `createSigner` will fetch it from the Turnkey API. We recommend setting this if you're using a passkey
 * client, so that your users are not prompted for a passkey signature just to fetch their address. You may leave this
 * undefined if using an API key client.
 */
export type TurnkeyHostedWalletToActionsWalletOptions = {
  client: TurnkeySDKClientBase
  organizationId: string
  signWith: string
  ethereumAddress?: string
}

/**
 * React/browser hosted wallet registry
 * @description Registers browser-only providers for client apps.
 */
export type ReactHostedProviderInstanceMap = {
  dynamic: DynamicHostedWalletProvider
  privy: PrivyHostedWalletProvider
  turnkey: TurnkeyHostedWalletProvider
}

/**
 * Parameters required to convert each hosted wallet to an Actions wallet (React)
 * @description Provider-specific, caller-supplied data needed by `toActionsWallet`.
 */
export type ReactToActionsOptionsMap = {
  dynamic: DynamicHostedWalletToActionsWalletOptions
  privy: PrivyHostedWalletToActionsWalletOptions
  turnkey: TurnkeyHostedWalletToActionsWalletOptions
}

/**
 * Complete React hosted wallet providers schema
 * @description
 * Bundles provider type keys, concrete provider instances, creation configs,
 * and `toActionsWallet` parameter types for the React environment.
 * This schema is used to type `Actions` and its registries without widening
 * to generic `string` keys.
 */
export type ReactHostedWalletProvidersSchema = HostedWalletProvidersSchema<
  ReactProviderTypes,
  ReactHostedProviderInstanceMap,
  ReactOptionsMap,
  ReactToActionsOptionsMap
>
