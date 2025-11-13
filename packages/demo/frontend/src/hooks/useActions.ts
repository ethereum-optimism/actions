import { useMemo } from 'react'
import { env } from '@/envVars'
import {
  createActions,
  type ReactActionsConfig,
  type ReactProviderTypes,
} from '@eth-optimism/actions-sdk/react'
import { baseSepolia, optimismSepolia } from 'viem/chains'

export function useActions<T extends ReactProviderTypes>({
  hostedWalletProviderType,
}: {
  hostedWalletProviderType: T
}) {
  // Memoize the config to prevent recreating it on every render
  const config = useMemo(
    () =>
      ({
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
          provider: 'morpho',
          // Remove marketAllowlist to disable validation for demo
          marketAllowlist: [],
        },
        chains: [
          {
            chainId: baseSepolia.id,
            rpcUrls: env.VITE_BASE_SEPOLIA_RPC_URL
              ? [env.VITE_BASE_SEPOLIA_RPC_URL]
              : undefined,
            bundler: env.VITE_BASE_SEPOLIA_BUNDER_URL
              ? {
                  type: 'simple',
                  url: env.VITE_BASE_SEPOLIA_BUNDER_URL,
                }
              : undefined,
          },
          {
            chainId: optimismSepolia.id,
            rpcUrls: env.VITE_OP_SEPOLIA_RPC_URL
              ? [env.VITE_OP_SEPOLIA_RPC_URL]
              : undefined,
            bundler: env.VITE_OP_SEPOLIA_BUNDER_URL
              ? {
                  type: 'simple',
                  url: env.VITE_OP_SEPOLIA_BUNDER_URL,
                }
              : undefined,
          },
        ],
      }) as unknown as ReactActionsConfig<T>,
    [hostedWalletProviderType],
  )

  // Memoize the actions instance to prevent recreating on every render
  const actions = useMemo(() => createActions(config), [config])

  return { actions }
}
