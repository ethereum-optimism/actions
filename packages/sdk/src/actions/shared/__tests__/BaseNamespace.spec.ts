import { describe, expect, it } from 'vitest'

import {
  BaseNamespace,
  type NamespaceProvider,
} from '@/actions/shared/BaseNamespace.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'

class FakeProvider implements NamespaceProvider {
  constructor(private readonly chains: readonly SupportedChainId[]) {}
  supportedChainIds(): readonly SupportedChainId[] {
    return this.chains
  }
}

type FakeProviders = {
  morpho?: FakeProvider
  aave?: FakeProvider
}

class TestNamespace extends BaseNamespace<FakeProvider, FakeProviders> {
  providersSnapshot(): FakeProvider[] {
    return this.getAllProviders()
  }
}

describe('BaseNamespace', () => {
  it('returns only configured providers (skips undefined)', () => {
    const morpho = new FakeProvider([1, 10])
    const ns = new TestNamespace({ morpho, aave: undefined })

    expect(ns.providersSnapshot()).toEqual([morpho])
  })

  it('returns all providers when multiple are configured', () => {
    const morpho = new FakeProvider([1])
    const aave = new FakeProvider([10])
    const ns = new TestNamespace({ morpho, aave })

    expect(ns.providersSnapshot()).toEqual([morpho, aave])
  })

  it('returns empty array when no providers are configured', () => {
    const ns = new TestNamespace({})
    expect(ns.providersSnapshot()).toEqual([])
    expect(ns.supportedChainIds()).toEqual([])
  })

  it('unions supported chain ids across providers, deduplicated', () => {
    const morpho = new FakeProvider([1, 10, 8453])
    const aave = new FakeProvider([10, 8453, 42220])
    const ns = new TestNamespace({ morpho, aave })

    expect([...ns.supportedChainIds()].sort((a, b) => a - b)).toEqual([
      1, 10, 8453, 42220,
    ])
  })
})
