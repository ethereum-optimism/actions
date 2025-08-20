import { Verbs, type VerbsConfig } from '@eth-optimism/verbs-sdk'
import { unichain } from 'viem/chains'

import { env } from './env.js'

const config: VerbsConfig = {
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
      rpcUrl: env.RPC_URL,
    },
  ],
}

// Initialize once at module load
export const verbs = new Verbs(config)
