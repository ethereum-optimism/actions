import { mainnet, unichain } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { ChainNotSupportedError } from '@/core/error/errors.js'
import { createActions } from '@/nodeActionsFactory.js'

function createTestActions(chainIds: readonly SupportedChainId[]) {
  return createActions<'privy'>({
    chains: chainIds.map((chainId) => ({ chainId })),
    wallet: {
      smartWalletConfig: { provider: { type: 'default' } },
    },
  })
}

describe('Actions.getPublicClient', () => {
  it('returns the configured client for a chain', () => {
    const actions = createTestActions([unichain.id, mainnet.id])

    const unichainClient = actions.getPublicClient(unichain.id)
    const mainnetClient = actions.getPublicClient(mainnet.id)

    expect(unichainClient.chain?.id).toBe(unichain.id)
    expect(mainnetClient.chain?.id).toBe(mainnet.id)
    expect(unichainClient).not.toBe(mainnetClient)
  })

  it('returns the same cached client on repeated calls', () => {
    const actions = createTestActions([unichain.id])

    expect(actions.getPublicClient(unichain.id)).toBe(
      actions.getPublicClient(unichain.id),
    )
  })

  it('throws ChainNotSupportedError when the chain is not configured', () => {
    const actions = createTestActions([unichain.id])
    const readMainnet = () => actions.getPublicClient(mainnet.id)

    expect(readMainnet).toThrow(ChainNotSupportedError)
    expect(readMainnet).toThrow(
      expect.objectContaining({
        chainId: mainnet.id,
        supportedChainIds: [unichain.id],
      }),
    )
  })
})
