export const WALLET_PROVIDERS = {
  PRIVY: 'privy',
  DYNAMIC: 'dynamic',
} as const

export type WalletProviderType =
  (typeof WALLET_PROVIDERS)[keyof typeof WALLET_PROVIDERS]

export interface WalletProviderConfig {
  name: string
  logoSrc: string
  queryParam: WalletProviderType
}

export const WALLET_PROVIDER_CONFIGS: Record<
  WalletProviderType,
  WalletProviderConfig
> = {
  [WALLET_PROVIDERS.PRIVY]: {
    name: 'Privy',
    logoSrc: '/Privy.png',
    queryParam: WALLET_PROVIDERS.PRIVY,
  },
  [WALLET_PROVIDERS.DYNAMIC]: {
    name: 'Dynamic',
    logoSrc: '/dynamic.png',
    queryParam: WALLET_PROVIDERS.DYNAMIC,
  },
}

export const DEFAULT_WALLET_PROVIDER = WALLET_PROVIDERS.PRIVY
