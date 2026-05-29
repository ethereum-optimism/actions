import { optimismSepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import {
  getAaveAddresses,
  getPoolAddress,
  getSupportedChainIds,
  getWETHGatewayAddress,
} from '@/actions/shared/aave/addresses.js'

describe('shared aave addresses', () => {
  it('returns the full address set for a supported chain', () => {
    const addresses = getAaveAddresses(optimismSepolia.id)
    expect(addresses).toBeDefined()
    expect(addresses?.pool).toBe('0xb50201558b00496a145fe76f7424749556e326d8')
    expect(addresses?.wethGateway).toBe(
      '0x589750BA8aF186cE5B55391B0b7148cAD43a1619',
    )
  })

  it('resolves pool and weth gateway by chain id', () => {
    expect(getPoolAddress(optimismSepolia.id)).toBe(
      '0xb50201558b00496a145fe76f7424749556e326d8',
    )
    expect(getWETHGatewayAddress(optimismSepolia.id)).toBe(
      '0x589750BA8aF186cE5B55391B0b7148cAD43a1619',
    )
  })

  it('returns undefined for an unsupported chain', () => {
    expect(getAaveAddresses(1)).toBeUndefined()
    expect(getPoolAddress(1)).toBeUndefined()
    expect(getWETHGatewayAddress(1)).toBeUndefined()
  })

  it('lists supported chain ids including op sepolia', () => {
    expect(getSupportedChainIds()).toContain(optimismSepolia.id)
  })
})
