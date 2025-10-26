import type { ReactProviderTypes } from '@eth-optimism/actions-sdk/react'

export const WALLET_PROVIDERS = {
  PRIVY: 'privy',
  DYNAMIC: 'dynamic',
  TURNKEY: 'turnkey',
} as const

export type WalletProviderType =
  (typeof WALLET_PROVIDERS)[keyof typeof WALLET_PROVIDERS]

export type FrontendWalletProviderType = Extract<
  WalletProviderType,
  'dynamic' | 'turnkey'
>

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
  [WALLET_PROVIDERS.TURNKEY]: {
    name: 'Turnkey',
    logoSrc: '/turnkey.png',
    queryParam: WALLET_PROVIDERS.TURNKEY,
  },
}

export const FRONTEND_HOSTED_WALLET_PROVIDER_CONFIGS: Record<
  FrontendWalletProviderType,
  ReactProviderTypes
> = {
  [WALLET_PROVIDERS.DYNAMIC]: 'dynamic',
  [WALLET_PROVIDERS.TURNKEY]: 'turnkey',
}

export const DEFAULT_WALLET_PROVIDER = WALLET_PROVIDERS.PRIVY
