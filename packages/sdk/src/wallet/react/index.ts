export type {
  ReactHostedWalletProvidersSchema,
  ReactProviderTypes,
} from '@/wallet/react/providers/hosted/types/index.js'
// Keep Dynamic type-only so the react barrel does not eager-load the vendor SDK.
export type { DynamicWallet } from '@/wallet/react/wallets/hosted/dynamic/DynamicWallet.js'
