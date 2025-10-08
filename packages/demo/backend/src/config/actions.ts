import { createActions } from '@eth-optimism/actions-sdk'
import type { NodeActionsConfig } from '@eth-optimism/actions-sdk/node'
import { PrivyClient } from '@privy-io/server-auth'

import { BASE_SEPOLIA, UNICHAIN } from './chains.js'
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
    chains: [UNICHAIN, BASE_SEPOLIA],
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
