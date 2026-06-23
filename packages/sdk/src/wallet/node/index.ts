// Type-only re-export: a value (runtime) re-export here would eagerly pull
// `@privy-io/node` into the SDK-root import graph for every consumer, defeating
// the registry's lazy `import()`. Privy providers are constructed lazily via the
// hosted-wallet registry; consumers only need the type at the barrel.
export type { PrivyHostedWalletProvider } from '@/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.js'
export type {
  NodeHostedWalletProvidersSchema,
  NodeOptionsMap,
  NodeProviderTypes,
} from '@/wallet/node/providers/hosted/types/index.js'
export type { PrivyWallet } from '@/wallet/node/wallets/hosted/privy/PrivyWallet.js'
export { LocalWallet } from '@/wallet/node/wallets/local/LocalWallet.js'
