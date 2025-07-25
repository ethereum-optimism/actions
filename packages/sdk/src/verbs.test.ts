import { describe, expect, it } from 'vitest'

import { Verbs } from './verbs.js'

describe('Verbs SDK - System Tests', () => {
  describe('Morpho Lend Provider Integration', () => {
    // Note: This is a system test that makes real network requests
    // Run with: SYSTEM_TEST=true pnpm test src/verbs.test.ts
    // or manually comment out the skip to run locally
    it.skip('should fetch real market info from Morpho on Unichain', async () => {
      // Create Verbs instance with Morpho lending configured
      const verbs = new Verbs({
        chainId: 130, // Unichain
        rpcUrl: 'https://rpc.unichain.org',
        lend: {
          type: 'morpho',
          defaultSlippage: 50,
        },
        wallet: {
          type: 'privy',
          appId: 'test-app-id',
          appSecret: 'test-app-secret',
        },
      })

      // Test the Gauntlet USDC vault market
      const marketId = '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9'

      // This will make an actual network request to fetch market data
      const marketInfo = await verbs.lend.getMarketInfo(marketId)

      // Verify the market info structure
      expect(marketInfo).toHaveProperty('id', marketId)
      expect(marketInfo).toHaveProperty('name')
      expect(marketInfo).toHaveProperty('loanToken')
      expect(marketInfo).toHaveProperty('collateralToken')
      expect(marketInfo).toHaveProperty('supplyApy')
      expect(marketInfo).toHaveProperty('utilization')
      expect(marketInfo).toHaveProperty('liquidity')
      expect(marketInfo).toHaveProperty('oracle')
      expect(marketInfo).toHaveProperty('irm')
      expect(marketInfo).toHaveProperty('lltv')
      expect(marketInfo).toHaveProperty('totalSupply')
      expect(marketInfo).toHaveProperty('totalBorrow')
      expect(marketInfo).toHaveProperty('supplyRate')
      expect(marketInfo).toHaveProperty('borrowRate')
      expect(marketInfo).toHaveProperty('lastUpdate')

      // Verify the data types
      expect(typeof marketInfo.supplyApy).toBe('number')
      expect(typeof marketInfo.utilization).toBe('number')
      expect(typeof marketInfo.lltv).toBe('number')
      expect(marketInfo.liquidity).toBeInstanceOf(BigInt)
      expect(marketInfo.totalSupply).toBeInstanceOf(BigInt)
      expect(marketInfo.totalBorrow).toBeInstanceOf(BigInt)
      expect(marketInfo.supplyRate).toBeInstanceOf(BigInt)
      expect(marketInfo.borrowRate).toBeInstanceOf(BigInt)

      // Verify reasonable values
      expect(marketInfo.supplyApy).toBeGreaterThanOrEqual(0)
      expect(marketInfo.utilization).toBeGreaterThanOrEqual(0)
      expect(marketInfo.utilization).toBeLessThanOrEqual(1)
      expect(marketInfo.lltv).toBeGreaterThan(0)
      expect(marketInfo.lltv).toBeLessThanOrEqual(1)

      // Log the actual values for manual verification
      // eslint-disable-next-line no-console
      console.log('Market Info:', {
        id: marketInfo.id,
        name: marketInfo.name,
        supplyApy: `${(marketInfo.supplyApy * 100).toFixed(2)}%`,
        utilization: `${(marketInfo.utilization * 100).toFixed(2)}%`,
        liquidity: marketInfo.liquidity.toString(),
        lltv: `${(marketInfo.lltv * 100).toFixed(2)}%`,
      })
    }, 30000) // 30 second timeout for network request

    it.skip('should handle non-existent market gracefully', async () => {
      const verbs = new Verbs({
        chainId: 130,
        rpcUrl: 'https://rpc.unichain.org',
        lend: {
          type: 'morpho',
          defaultSlippage: 50,
        },
        wallet: {
          type: 'privy',
          appId: 'test-app-id',
          appSecret: 'test-app-secret',
        },
      })

      const invalidMarketId =
        '0x0000000000000000000000000000000000000000000000000000000000000000'

      await expect(verbs.lend.getMarketInfo(invalidMarketId)).rejects.toThrow(
        `Market ${invalidMarketId} not found`,
      )
    })

    it('should list supported network IDs', async () => {
      const verbs = new Verbs({
        chainId: 130,
        rpcUrl: 'https://rpc.unichain.org',
        lend: {
          type: 'morpho',
          defaultSlippage: 50,
        },
        wallet: {
          type: 'privy',
          appId: 'test-app-id',
          appSecret: 'test-app-secret',
        },
      })

      const networkIds = verbs.lend.supportedNetworkIds()

      expect(Array.isArray(networkIds)).toBe(true)
      expect(networkIds).toContain(130) // Unichain
    })
  })
})
