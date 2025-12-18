import type {
  ReactActionsConfig,
  ReactProviderTypes,
} from '@eth-optimism/actions-sdk/react'
import { baseSepolia, optimismSepolia } from 'viem/chains'
import { env } from '@/envVars'
import {
  USDC_DEMO,
  WETH,
  GauntletUSDCDemo,
  AaveWETH,
} from '@/constants/markets'

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
              type: 'pimlico' as const,
              url: env.VITE_OP_SEPOLIA_BUNDLER_URL,
            }
          : undefined,
      },
    ],
  } as unknown as ReactActionsConfig<T>
}
