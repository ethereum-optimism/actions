import { createActions } from '@eth-optimism/actions-sdk'
import type { NodeActionsConfig } from '@eth-optimism/actions-sdk/node'
import { PrivyClient } from '@privy-io/server-auth'

import { BASE_SEPOLIA, OPTIMISM_SEPOLIA, UNICHAIN } from './chains.js'
import { env } from './env.js'
import { AaveWETH, GauntletUSDCDemo } from './markets.js'

let morphoActionsInstance: ReturnType<typeof createActions<'privy'>>
let aaveActionsInstance: ReturnType<typeof createActions<'privy'>>

function createBaseWalletConfig() {
  return {
    hostedWalletConfig: {
      provider: {
        type: 'privy' as const,
        config: {
          privyClient: getPrivyClient(),
        },
      },
    },
    smartWalletConfig: {
      provider: {
        type: 'default' as const,
        attributionSuffix: 'actions',
      },
    },
  }
}

export function createMorphoActionsConfig(): NodeActionsConfig<'privy'> {
  return {
    wallet: createBaseWalletConfig(),
    lend: {
      provider: 'morpho',
      defaultSlippage: 50,
      marketAllowlist: [GauntletUSDCDemo],
    },
    chains: [UNICHAIN, BASE_SEPOLIA, OPTIMISM_SEPOLIA],
  }
}

export function createAaveActionsConfig(): NodeActionsConfig<'privy'> {
  return {
    wallet: createBaseWalletConfig(),
    lend: {
      provider: 'aave',
      defaultSlippage: 50,
      marketAllowlist: [AaveWETH],
    },
    chains: [UNICHAIN, BASE_SEPOLIA, OPTIMISM_SEPOLIA],
  }
}

export function initializeActions(): void {
  morphoActionsInstance = createActions(createMorphoActionsConfig())
  aaveActionsInstance = createActions(createAaveActionsConfig())
}

export function getMorphoActions() {
  if (!morphoActionsInstance) {
    throw new Error(
      'Morpho Actions SDK not initialized. Call initializeActions() first.',
    )
  }
  return morphoActionsInstance
}

export function getAaveActions() {
  if (!aaveActionsInstance) {
    throw new Error(
      'Aave Actions SDK not initialized. Call initializeActions() first.',
    )
  }
  return aaveActionsInstance
}

export function getActions() {
  return getMorphoActions()
}

export function getPrivyClient() {
  const privy = new PrivyClient(env.PRIVY_APP_ID, env.PRIVY_APP_SECRET)
  if (env.SESSION_SIGNER_PK) {
    privy.walletApi.updateAuthorizationKey(env.SESSION_SIGNER_PK)
  }
  return privy
}
