import type {
  Asset,
  LendMarketConfig,
  ReactActionsConfig,
  ReactProviderTypes,
} from '@eth-optimism/actions-sdk/react'
import type { Address } from 'viem'
import { baseSepolia, optimismSepolia } from 'viem/chains'
import { env } from '@/envVars'

// Asset definitions matching backend config
export const USDC_DEMO: Asset = {
  address: {
    [baseSepolia.id]: '0x87c25229afbc30418d0144e8dfb2bcf8efd92c6c',
  },
  metadata: {
    decimals: 6,
    name: 'USDC',
    symbol: 'USDC_DEMO',
  },
  type: 'erc20',
}

export const WETH: Asset = {
  address: {
    [optimismSepolia.id]: '0x4200000000000000000000000000000000000006',
  },
  metadata: {
    decimals: 18,
    name: 'Wrapped Ether',
    symbol: 'WETH',
  },
  type: 'erc20',
}

// Market definitions matching backend config
export const GauntletUSDCDemo: LendMarketConfig = {
  address: '0x297E324C46309E93112610ebf35559685b4E3547' as Address,
  chainId: baseSepolia.id,
  name: 'Gauntlet USDC',
  asset: USDC_DEMO,
  lendProvider: 'morpho',
}

export const AaveWETH: LendMarketConfig = {
  address: '0x4200000000000000000000000000000000000006' as Address,
  chainId: optimismSepolia.id,
  name: 'Aave ETH',
  asset: WETH,
  lendProvider: 'aave',
}

// Helper to create Actions config matching backend structure
export function createActionsConfig<T extends ReactProviderTypes>(
  hostedWalletProviderType: T,
): ReactActionsConfig<T> {
  return {
    wallet: {
      hostedWalletConfig: {
        provider: {
          type: hostedWalletProviderType,
        },
      },
      smartWalletConfig: {
        provider: {
          type: 'default',
          attributionSuffix: 'actions',
        },
      },
    },
    lend: {
      morpho: {
        marketAllowlist: [GauntletUSDCDemo],
      },
      aave: {
        marketAllowlist: [AaveWETH],
      },
    },
    assets: {
      allow: [USDC_DEMO, WETH],
    },
    chains: [
      {
        chainId: baseSepolia.id,
        rpcUrls: env.VITE_BASE_SEPOLIA_RPC_URL
          ? [env.VITE_BASE_SEPOLIA_RPC_URL]
          : undefined,
        bundler: env.VITE_BASE_SEPOLIA_BUNDLER_URL
          ? {
              type: 'simple',
              url: env.VITE_BASE_SEPOLIA_BUNDLER_URL,
            }
          : undefined,
      },
      {
        chainId: optimismSepolia.id,
        rpcUrls: env.VITE_OP_SEPOLIA_RPC_URL
          ? [env.VITE_OP_SEPOLIA_RPC_URL]
          : undefined,
        bundler: env.VITE_OP_SEPOLIA_BUNDLER_URL
          ? {
              type: 'simple',
              url: env.VITE_OP_SEPOLIA_BUNDLER_URL,
            }
          : undefined,
      },
    ],
  } as unknown as ReactActionsConfig<T>
}
