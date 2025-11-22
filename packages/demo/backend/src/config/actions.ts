import { createActions } from '@eth-optimism/actions-sdk'
import type { NodeActionsConfig } from '@eth-optimism/actions-sdk/node'
import { type AuthorizationContext, PrivyClient } from '@privy-io/node'

import { BASE_SEPOLIA, OPTIMISM_SEPOLIA, UNICHAIN } from './chains.js'
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
            authorizationContext: getAuthorizationContext(),
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
    chains: [UNICHAIN, BASE_SEPOLIA, OPTIMISM_SEPOLIA],
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
  return new PrivyClient({
    appId: env.PRIVY_APP_ID,
    appSecret: env.PRIVY_APP_SECRET,
  })
}

export function getAuthorizationContext(): AuthorizationContext {
  return {
    authorization_private_keys: [env.SESSION_SIGNER_PK],
  }
}
