import type { SmartWallet } from '@/index.js'
import type {
  CreateSmartWalletOptions,
  GetSmartWalletOptions,
  HostedWalletToVerbsWalletOptions,
} from '@/types/wallet.js'
import type { Wallet } from '@/wallet/base/Wallet.js'
import type { HostedWalletProvider } from '@/wallet/providers/base/HostedWalletProvider.js'
import type { SmartWalletProvider } from '@/wallet/providers/base/SmartWalletProvider.js'
import type { WalletProvider } from '@/wallet/WalletProvider.js'

import type { DefaultSmartWallet } from './DefaultSmartWallet.js'
import type { MorphoSmartWallet } from './MorphoSmartWallet.js'

export type Config = {
  type: 'morpho' | 'default'
}

interface MorphoConfig extends Config {
  type: 'morpho'
}

export interface DefaultConfig extends Config {
  type: 'default'
}

export type WalletNamespaceFor<T extends Config> = T extends MorphoConfig
  ? MorphoWalletNamespace
  : DefaultWalletNamespace

interface WalletNamespace {
  hostedWalletProvider: () => HostedWalletProvider
  smartWalletProvider: () => SmartWalletProvider
  createSmartWallet: (params: CreateSmartWalletOptions) => Promise<SmartWallet>
  hostedWalletToVerbsWallet: (
    params: HostedWalletToVerbsWalletOptions,
  ) => Promise<Wallet>
  getSmartWallet: (params: GetSmartWalletOptions) => Promise<SmartWallet>
}

interface MorphoWalletNamespace extends WalletNamespace {
  createSmartWallet: (
    params: CreateSmartWalletOptions,
  ) => Promise<MorphoSmartWallet>
}

interface DefaultWalletNamespace extends WalletNamespace {
  createSmartWallet: (
    params: CreateSmartWalletOptions,
  ) => Promise<DefaultSmartWallet>
}

export function createWalletNameSpace<T extends Config>(
  provider: WalletProvider,
  config: T,
): WalletNamespaceFor<T> {
  const base: Omit<WalletNamespace, 'createSmartWallet'> = {
    hostedWalletProvider: () => provider.hostedWalletProvider,
    smartWalletProvider: () => provider.smartWalletProvider,
    hostedWalletToVerbsWallet: (params) =>
      provider.hostedWalletToVerbsWallet(params),
    getSmartWallet: (params) => provider.getSmartWallet(params),
  }

  if (config.type === 'morpho') {
    const ns: MorphoWalletNamespace = {
      ...base,
      createSmartWallet: async (params) => {
        // Delegate to provider and specialize the return type for callers
        return (await provider.createSmartWallet(params)) as MorphoSmartWallet
      },
    }
    return ns as WalletNamespaceFor<T>
  }

  const ns: DefaultWalletNamespace = {
    ...base,
    createSmartWallet: async (params) => {
      // Delegate to provider and specialize the return type for callers
      return (await provider.createSmartWallet(params)) as DefaultSmartWallet
    },
  }
  return ns as WalletNamespaceFor<T>
}
