import {
  initVerbs,
  type VerbsConfig,
  type VerbsInterface,
} from '@eth-optimism/verbs-sdk'
import { unichain } from 'viem/chains'

import { env } from './env.js'

let verbsInstance: VerbsInterface

export function createVerbsConfig(): VerbsConfig {
  return {
    wallet: {
      type: 'dynamic',
      authToken: env.DYNAMIC_AUTH_TOKEN,
    },
    lend: {
      type: 'morpho',
    },
    chains: [
      {
        chainId: unichain.id,
        rpcUrl: env.RPC_URL,
      },
    ],
  }
}

export async function initializeVerbs(config?: VerbsConfig): Promise<void> {
  const verbsConfig = config || createVerbsConfig()
  verbsInstance = await initVerbs(verbsConfig)
}

export function getVerbs(): VerbsInterface {
  if (!verbsInstance) {
    throw new Error('Verbs SDK not initialized. Call initializeVerbs() first.')
  }
  return verbsInstance
}
