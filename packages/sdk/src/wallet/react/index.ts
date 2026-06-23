export type {
  ReactHostedWalletProvidersSchema,
  ReactProviderTypes,
} from '@/wallet/react/providers/hosted/types/index.js'
// Type-only re-export: a value (runtime) re-export here would eagerly pull
// `@dynamic-labs/ethereum` into the SDK-root import graph for every consumer,
// defeating the registry's lazy `import()`. Dynamic providers are constructed
// lazily via the hosted-wallet registry; consumers only need the type here.
export type { DynamicWallet } from '@/wallet/react/wallets/hosted/dynamic/DynamicWallet.js'
