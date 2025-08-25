import {
  initVerbs,
  type VerbsConfig,
  type VerbsInterface,
} from '@eth-optimism/verbs-sdk'
import { baseSepolia, unichain } from 'viem/chains'

import { env } from './env.js'

let verbsInstance: VerbsInterface

export function createVerbsConfig(): VerbsConfig {
  return {
    wallet: {
      type: 'privy',
      appId: env.PRIVY_APP_ID,
      appSecret: env.PRIVY_APP_SECRET,
    },
    lend: {
      type: 'morpho',
    },
    chains: [
      {
        chainId: unichain.id,
        rpcUrl: unichain.rpcUrls.default.http[0],
      },
      {
        chainId: baseSepolia.id,
        rpcUrl: baseSepolia.rpcUrls.default.http[0],
      },
    ],
  }
}

export function initializeVerbs(config?: VerbsConfig): void {
  const verbsConfig = config || createVerbsConfig()
  verbsInstance = initVerbs(verbsConfig)
}

export function getVerbs(): VerbsInterface {
  if (!verbsInstance) {
    throw new Error('Verbs SDK not initialized. Call initializeVerbs() first.')
  }
  return verbsInstance
}
