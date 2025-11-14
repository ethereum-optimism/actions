import { createActions } from '@eth-optimism/actions-sdk'
import type { NodeActionsConfig } from '@eth-optimism/actions-sdk/node'
import { type AuthorizationContext, PrivyClient } from '@privy-io/node'

import { BASE_SEPOLIA, OPTIMISM_SEPOLIA, UNICHAIN } from './chains.js'
import { env } from './env.js'
import { AaveWETH, GauntletUSDCDemo } from './markets.js'

let actionsInstance: ReturnType<typeof createActions<'privy'>>

function createActionsConfig(): NodeActionsConfig<'privy'> {
  return {
    wallet: {
      hostedWalletConfig: {
        provider: {
          type: 'privy' as const,
          config: {
            privyClient: getPrivyClient(),
            authorizationContext: getAuthorizationContext(),
          },
        },
      },
      smartWalletConfig: {
        provider: {
          type: 'default' as const,
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
    chains: [UNICHAIN, BASE_SEPOLIA, OPTIMISM_SEPOLIA],
  }
}

export function initializeActions(): void {
  actionsInstance = createActions(createActionsConfig())
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
