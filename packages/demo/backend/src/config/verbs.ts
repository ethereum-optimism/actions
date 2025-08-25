import {
  initVerbs,
  type Verbs,
  type VerbsConfig,
} from '@eth-optimism/verbs-sdk'
import { baseSepolia, unichain } from 'viem/chains'

import { env } from './env.js'

let verbsInstance: Verbs

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
        // rpcUrl: env.RPC_URL,
      },
      {
        chainId: baseSepolia.id,
        rpcUrl: env.RPC_URL,
      },
    ],
    bundlerUrl: env.BUNDLER_URL,
  }
}

export function initializeVerbs(config?: VerbsConfig): void {
  const verbsConfig = config || createVerbsConfig()
  verbsInstance = initVerbs(verbsConfig)
}

export function getVerbs() {
  if (!verbsInstance) {
    throw new Error('Verbs SDK not initialized. Call initializeVerbs() first.')
  }
  return verbsInstance
}
