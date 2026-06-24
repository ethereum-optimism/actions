// Keep Privy type-only so the node barrel does not eager-load the vendor SDK.
export type { PrivyHostedWalletProvider } from '@/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.js'
export type {
  NodeHostedWalletProvidersSchema,
  NodeOptionsMap,
  NodeProviderTypes,
} from '@/wallet/node/providers/hosted/types/index.js'
export type { PrivyWallet } from '@/wallet/node/wallets/hosted/privy/PrivyWallet.js'
export { LocalWallet } from '@/wallet/node/wallets/local/LocalWallet.js'
