import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VerbsLendNamespace } from '@/lend/namespaces/VerbsLendNamespace.js'
import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { getRandomAddress } from '@/test/utils.js'
import type { LendProvider } from '@/types/lend/index.js'

describe('VerbsLendNamespace', () => {
  let mockProvider: LendProvider

  beforeEach(() => {
    mockProvider = createMockLendProvider()
  })

  it('should create an instance with a lend provider', () => {
    const namespace = new VerbsLendNamespace(mockProvider)

    expect(namespace).toBeInstanceOf(VerbsLendNamespace)
  })

  it('should delegate getMarkets to provider', async () => {
    const namespace = new VerbsLendNamespace(mockProvider)
    const spy = vi.spyOn(mockProvider, 'getMarkets')

    await namespace.getMarkets()

    expect(spy).toHaveBeenCalledOnce()
  })

  it('should delegate getMarket to provider with correct parameters', async () => {
    const namespace = new VerbsLendNamespace(mockProvider)
    const marketId = getRandomAddress()
    const chainId = 130 as const
    const spy = vi.spyOn(mockProvider, 'getMarket')

    await namespace.getMarket({ address: marketId, chainId })

    expect(spy).toHaveBeenCalledWith({ address: marketId, chainId })
  })

  it('should delegate supportedChainIds to provider', () => {
    const namespace = new VerbsLendNamespace(mockProvider)
    const spy = vi.spyOn(mockProvider, 'supportedChainIds')

    namespace.supportedChainIds()

    expect(spy).toHaveBeenCalledOnce()
  })

  it('should provide access to provider config', () => {
    const namespace = new VerbsLendNamespace(mockProvider)

    const config = namespace.config

    expect(config).toBeDefined()
    expect(config.defaultSlippage || 50).toBe(50)
  })
})
