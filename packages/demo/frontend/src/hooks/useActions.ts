import { useMemo } from 'react'
import { USDCDemoVault } from '@/constants/markets'
import { env } from '@/envVars'
import {
  createActions,
  type ReactActionsConfig,
} from '@eth-optimism/actions-sdk/react'
import { baseSepolia } from 'viem/chains'

export function useActions() {
  // Memoize the config to prevent recreating it on every render
  const config: ReactActionsConfig<'dynamic'> = useMemo(
    () => ({
      wallet: {
        hostedWalletConfig: {
          provider: {
            type: 'dynamic',
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
        marketAllowlist: [USDCDemoVault],
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
      ],
    }),
    [], // Empty deps since config is static
  )

  // Memoize the actions instance to prevent recreating on every render
  const actions = useMemo(() => createActions(config), [config])

  return { actions }
}
