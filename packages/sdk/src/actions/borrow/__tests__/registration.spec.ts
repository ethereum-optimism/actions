import type { Address } from 'viem'
import { optimismSepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import { borrowModule } from '@/actions/borrow/module.js'
import { BaseBorrowNamespace } from '@/actions/borrow/namespaces/BaseBorrowNamespace.js'
import { AaveBorrowProvider } from '@/actions/borrow/providers/aave/AaveBorrowProvider.js'
import { computeAaveBorrowMarketId } from '@/actions/borrow/providers/aave/marketId.js'
import { MorphoBorrowProvider } from '@/actions/borrow/providers/morpho/MorphoBorrowProvider.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset } from '@/types/asset.js'
import type { AaveBorrowMarketConfig } from '@/types/borrow/index.js'
import { BORROW_PROVIDER_NAMES } from '@/types/providers.js'

const OPS = optimismSepolia.id
const WETH = '0x4200000000000000000000000000000000000006' as Address
const USDC = '0x5fd84259d66Cd46123540766Be93DFE6D43130D7' as Address

const aaveMarket: AaveBorrowMarketConfig = {
  kind: 'aave-v3',
  marketId: computeAaveBorrowMarketId({
    chainId: OPS,
    collateralAddress: WETH,
    debtAddress: USDC,
  }),
  chainId: OPS,
  name: 'Aave ETH / USDC',
  collateralAsset: {
    type: 'native',
    address: { [OPS]: WETH },
    metadata: { symbol: 'ETH', name: 'Ether', decimals: 18 },
  } satisfies Asset,
  borrowAsset: {
    type: 'erc20',
    address: { [OPS]: USDC },
    metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  } satisfies Asset,
  borrowProvider: 'aave',
  lendProvider: 'aave',
  aave: {
    debtReserve: USDC,
    collateralReserve: WETH,
    collateralUsesWethGateway: true,
  },
}

function chainManager(): ChainManager {
  return new MockChainManager({
    supportedChains: [OPS],
  }) as unknown as ChainManager
}

describe('borrow provider registration', () => {
  it('lists aave in BORROW_PROVIDER_NAMES', () => {
    expect(BORROW_PROVIDER_NAMES).toContain('aave')
    expect(BORROW_PROVIDER_NAMES).toContain('morpho')
  })

  it('constructs an AaveBorrowProvider from config.aave', () => {
    const providers = borrowModule.buildProviders(
      { aave: { marketAllowlist: [aaveMarket] } },
      { chainManager: chainManager() },
    )
    expect(providers.aave).toBeInstanceOf(AaveBorrowProvider)
    expect(providers.morpho).toBeUndefined()
  })

  it('constructs both providers when both are configured', () => {
    const providers = borrowModule.buildProviders(
      {
        aave: { marketAllowlist: [aaveMarket] },
        morpho: { marketAllowlist: [] },
      },
      { chainManager: chainManager() },
    )
    expect(providers.aave).toBeInstanceOf(AaveBorrowProvider)
    expect(providers.morpho).toBeInstanceOf(MorphoBorrowProvider)
  })

  it('routes an aave-v3 market to the aave provider via the namespace fallback', () => {
    const providers = borrowModule.buildProviders(
      { aave: { marketAllowlist: [] } },
      { chainManager: chainManager() },
    )
    const namespace = new BaseBorrowNamespace(providers)
    const route = (
      namespace as unknown as {
        getProviderForMarket: (id: {
          kind: 'aave-v3'
          marketId: `0x${string}`
          chainId: number
        }) => unknown
      }
    ).getProviderForMarket.bind(namespace)
    // An aave-v3 id with no allowlist hit must still route to the aave
    // provider via the discriminator fallback (not throw).
    expect(() =>
      route({ kind: 'aave-v3', marketId: aaveMarket.marketId, chainId: OPS }),
    ).not.toThrow()
  })

  it('rejects an aave config on a chain with no Aave deployment', () => {
    expect(
      () =>
        new AaveBorrowProvider(
          { marketAllowlist: [{ ...aaveMarket, chainId: 999999 as never }] },
          chainManager(),
        ),
    ).toThrow()
  })
})
