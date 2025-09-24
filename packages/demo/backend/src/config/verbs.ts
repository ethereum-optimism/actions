import {
  createVerbs,
  type Verbs,
  type VerbsConfig,
} from '@eth-optimism/verbs-sdk/node'
import { PrivyClient } from '@privy-io/server-auth'
import { Turnkey } from '@turnkey/sdk-server'
import { baseSepolia, unichain } from 'viem/chains'

import { env } from './env.js'
import { GauntletUSDC, MetaMorphoUSDC, USDCDemoVault } from './markets.js'

let verbsInstance: Verbs<'turnkey'>

export function createVerbsConfig(): VerbsConfig<'turnkey'> {
  return {
    wallet: {
      hostedWalletConfig: {
        provider: {
          type: 'turnkey',
          config: {
            client: getTurnkeyClient().apiClient(),
            organizationId: env.TURNKEY_ORGANIZATION_ID,
          },
        },
      },
      smartWalletConfig: {
        provider: {
          type: 'default',
          // converts to '0xee4a2159c53ceed04edf4ce23cc97c5c'
          attributionSuffix: 'verbs',
        },
      },
    },
    lend: {
      provider: 'morpho',
      defaultSlippage: 50,
      marketAllowlist: [GauntletUSDC, MetaMorphoUSDC, USDCDemoVault],
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

export function initializeVerbs(config?: VerbsConfig<'turnkey'>): void {
  const verbsConfig = config || createVerbsConfig()
  verbsInstance = createVerbs(verbsConfig)
}

export function getVerbs() {
  if (!verbsInstance) {
    throw new Error('Verbs SDK not initialized. Call initializeVerbs() first.')
  }
  return verbsInstance
}

export function getPrivyClient() {
  const privy = new PrivyClient(env.PRIVY_APP_ID, env.PRIVY_APP_SECRET)
  if (env.SESSION_SIGNER_PK) {
    privy.walletApi.updateAuthorizationKey(env.SESSION_SIGNER_PK)
  }
  return privy
}

export function getTurnkeyClient() {
  return new Turnkey({
    apiBaseUrl: 'https://api.turnkey.com',
    apiPublicKey: env.TURNKEY_API_KEY,
    apiPrivateKey: env.TURNKEY_API_SECRET,
    defaultOrganizationId: env.TURNKEY_ORGANIZATION_ID,
  })
}
