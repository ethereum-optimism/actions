import type { NodeActionsConfig } from '@eth-optimism/actions-sdk/node'
import { createActions } from '@eth-optimism/actions-sdk/node'
import { PrivyClient } from '@privy-io/server-auth'
import { baseSepolia, unichain } from 'viem/chains'

import { env } from './env.js'
import { GauntletUSDC, USDCDemoVault } from './markets.js'

let actionsInstance: ReturnType<typeof createActions<'privy'>>

export function createActionsConfig(): NodeActionsConfig<'privy'> {
  return {
    wallet: {
      hostedWalletConfig: {
        provider: {
          type: 'privy',
          config: {
            privyClient: getPrivyClient(),
          },
        },
      },
      smartWalletConfig: {
        provider: {
          type: 'default',
          // converts to '0xee4a2159c53ceed04edf4ce23cc97c5c'
          attributionSuffix: 'actions',
        },
      },
    },
    lend: {
      provider: 'morpho',
      defaultSlippage: 50,
      marketAllowlist: [GauntletUSDC, USDCDemoVault],
    },
    chains: [
      {
        chainId: unichain.id,
        rpcUrls: env.UNICHAIN_RPC_URL ? [env.UNICHAIN_RPC_URL] : undefined,
        bundler: {
          type: 'pimlico',
          url: env.UNICHAIN_BUNDLER_URL,
          sponsorshipPolicyId: env.UNICHAIN_BUNDLER_SPONSORSHIP_POLICY,
        },
      },
      {
        chainId: baseSepolia.id,
        rpcUrls: env.BASE_SEPOLIA_RPC_URL
          ? [env.BASE_SEPOLIA_RPC_URL]
          : undefined,
        bundler: {
          type: 'simple',
          url: env.BASE_SEPOLIA_BUNDER_URL,
        },
      },
    ],
  }
}

export function initializeActions(config?: NodeActionsConfig<'privy'>): void {
  const actionsConfig = config || createActionsConfig()
  actionsInstance = createActions(actionsConfig)
}

export function getActions() {
  if (!actionsInstance) {
    throw new Error(
      'Actions SDK not initialized. Call initializeActions() first.',
    )
  }
  return actionsInstance
}

export function getPrivyClient() {
  const privy = new PrivyClient(env.PRIVY_APP_ID, env.PRIVY_APP_SECRET)
  if (env.SESSION_SIGNER_PK) {
    privy.walletApi.updateAuthorizationKey(env.SESSION_SIGNER_PK)
  }
  return privy
}
