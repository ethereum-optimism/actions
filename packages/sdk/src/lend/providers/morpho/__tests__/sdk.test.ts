import { mainnet } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import {
  calculateBaseApy,
  calculateRewardsBreakdown,
} from '@/lend/providers/morpho/sdk.js'
import { MORPHO, USDC } from '@/constants/assets.js'

const CHAIN_ID = mainnet.id
const USDC_ADDRESS = USDC.address[CHAIN_ID]!.toLowerCase()
const MORPHO_ADDRESS = MORPHO.address[CHAIN_ID]!.toLowerCase()
const testSupportedAssets = [USDC, MORPHO]

describe('Vault Utilities', () => {
  describe('calculateBaseApy', () => {
    it('should return 0 for vault with no assets', () => {
      const vault = {
        totalAssets: 0n,
        fee: BigInt(1e17), // 10% fee
        allocations: new Map(),
      }

      const result = calculateBaseApy(vault)
      expect(result).toBe(0)
    })

    it('should calculate APY correctly for single allocation', () => {
      const vault = {
        totalAssets: BigInt(1000000e6), // 1M USDC
        fee: BigInt(1e17), // 10% fee in WAD format
        allocations: new Map([
          [
            '0',
            {
              position: {
                supplyShares: BigInt(500000e6), // 500K shares
                supplyAssets: BigInt(500000e6), // 500K assets
                market: {
                  supplyApy: BigInt(5e16), // 5% APY in WAD format
                },
              },
            },
          ],
        ]),
      }

      const result = calculateBaseApy(vault)

      // Expected calculation:
      // Weighted APY = (5% * 500K) / 1M = 2.5% before fees
      // After 10% fee = 2.5% * (1 - 0.1) = 2.25%
      expect(result).toBeCloseTo(0.0225, 4) // 2.25%
    })

    it('should calculate weighted APY for multiple allocations', () => {
      const vault = {
        totalAssets: BigInt(1000000e6), // 1M USDC
        fee: BigInt(2e17), // 20% fee in WAD format
        allocations: new Map([
          [
            '0',
            {
              position: {
                supplyShares: BigInt(300000e6),
                supplyAssets: BigInt(300000e6), // 30% allocation
                market: {
                  supplyApy: BigInt(4e16), // 4% APY
                },
              },
            },
          ],
          [
            '1',
            {
              position: {
                supplyShares: BigInt(700000e6),
                supplyAssets: BigInt(700000e6), // 70% allocation
                market: {
                  supplyApy: BigInt(6e16), // 6% APY
                },
              },
            },
          ],
        ]),
      }

      const result = calculateBaseApy(vault)

      // Expected calculation:
      // Weighted APY = (4% * 300K + 6% * 700K) / 1M = (1.2% + 4.2%) = 5.4%
      // After 20% fee = 5.4% * (1 - 0.2) = 4.32%
      expect(result).toBeCloseTo(0.0432, 4) // 4.32%
    })

    it('should handle allocations with zero supply shares', () => {
      const vault = {
        totalAssets: BigInt(1000000e6),
        fee: BigInt(1e17), // 10% fee
        allocations: new Map([
          [
            '0',
            {
              position: {
                supplyShares: 0n, // No shares
                supplyAssets: 0n,
                market: {
                  supplyApy: BigInt(5e16),
                },
              },
            },
          ],
          [
            '1',
            {
              position: {
                supplyShares: BigInt(1000000e6),
                supplyAssets: BigInt(1000000e6),
                market: {
                  supplyApy: BigInt(3e16), // 3% APY
                },
              },
            },
          ],
        ]),
      }

      const result = calculateBaseApy(vault)

      // Should only count the allocation with shares
      // 3% * (1 - 0.1) = 2.7%
      expect(result).toBeCloseTo(0.027, 4)
    })

    it('should handle vault with no market in allocation', () => {
      const vault = {
        totalAssets: BigInt(1000000e6),
        fee: BigInt(1e17),
        allocations: new Map([
          [
            '0',
            {
              position: {
                supplyShares: BigInt(1000000e6),
                supplyAssets: BigInt(1000000e6),
                market: null, // No market
              },
            },
          ],
        ]),
      }

      const result = calculateBaseApy(vault)
      expect(result).toBe(0)
    })
  })

  describe('calculateRewardsBreakdown', () => {
    it('should return zero rewards for vault with no rewards', () => {
      const apiVault = {
        state: {
          rewards: [],
          allocation: [],
        },
      }

      const result = calculateRewardsBreakdown(
        apiVault,
        testSupportedAssets,
        CHAIN_ID,
      )

      expect(result[USDC_ADDRESS]).toBe(0)
      expect(result[MORPHO_ADDRESS]).toBe(0)
      expect(result.other).toBe(0)
      expect(result.totalRewards).toBe(0)
    })

    it('should categorize vault-level rewards by address', () => {
      const apiVault = {
        state: {
          rewards: [
            {
              supplyApr: 0.03, // 3% USDC rewards
              asset: {
                address: USDC_ADDRESS,
                name: 'USDC',
                symbol: 'USDC',
                chain: { id: CHAIN_ID },
              },
            },
            {
              supplyApr: 0.015, // 1.5% MORPHO rewards
              asset: {
                address: MORPHO_ADDRESS,
                name: 'MORPHO',
                symbol: 'MORPHO',
                chain: { id: CHAIN_ID },
              },
            },
          ],
          allocation: [],
        },
      }

      const result = calculateRewardsBreakdown(
        apiVault,
        testSupportedAssets,
        CHAIN_ID,
      )

      expect(result[USDC_ADDRESS]).toBeCloseTo(0.03, 4)
      expect(result[MORPHO_ADDRESS]).toBeCloseTo(0.015, 4)
      expect(result.other).toBe(0)
      expect(result.totalRewards).toBeCloseTo(0.045, 4)
    })

    it('should calculate weighted market-level rewards', () => {
      const apiVault = {
        state: {
          rewards: [],
          allocation: [
            {
              supplyAssetsUsd: 600000, // 60% of total
              market: {
                uniqueKey: 'market1',
                state: {
                  rewards: [
                    {
                      supplyApr: 0.02, // 2% reward
                      asset: {
                        address: USDC_ADDRESS,
                        symbol: 'USDC',
                        chain: { id: CHAIN_ID },
                      },
                    },
                  ],
                },
              },
            },
            {
              supplyAssetsUsd: 400000, // 40% of total
              market: {
                uniqueKey: 'market2',
                state: {
                  rewards: [
                    {
                      supplyApr: 0.05, // 5% reward
                      asset: {
                        address: MORPHO_ADDRESS,
                        symbol: 'MORPHO',
                        chain: { id: CHAIN_ID },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      }

      const result = calculateRewardsBreakdown(
        apiVault,
        testSupportedAssets,
        CHAIN_ID,
      )

      // Expected calculation:
      // USDC: 2% * (600k / 1M) = 1.2%
      // MORPHO: 5% * (400k / 1M) = 2%
      expect(result[USDC_ADDRESS]).toBeCloseTo(0.012, 4)
      expect(result[MORPHO_ADDRESS]).toBeCloseTo(0.02, 4)
      expect(result.other).toBe(0)
      expect(result.totalRewards).toBeCloseTo(0.032, 4)
    })

    it('should handle mixed vault and market rewards', () => {
      const apiVault = {
        state: {
          rewards: [
            {
              supplyApr: 0.01, // 1% vault-level USDC reward
              asset: {
                address: USDC_ADDRESS,
                symbol: 'USDC',
                chain: { id: CHAIN_ID },
              },
            },
          ],
          allocation: [
            {
              supplyAssetsUsd: 1000000,
              market: {
                uniqueKey: 'market1',
                state: {
                  rewards: [
                    {
                      supplyApr: 0.015, // 1.5% market-level MORPHO reward
                      asset: {
                        address: MORPHO_ADDRESS,
                        symbol: 'MORPHO',
                        chain: { id: CHAIN_ID },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      }

      const result = calculateRewardsBreakdown(
        apiVault,
        testSupportedAssets,
        CHAIN_ID,
      )

      expect(result[USDC_ADDRESS]).toBeCloseTo(0.01, 4) // Vault-level
      expect(result[MORPHO_ADDRESS]).toBeCloseTo(0.015, 4) // Market-level (100% weight)
      expect(result.totalRewards).toBeCloseTo(0.025, 4)
    })

    it('should categorize unknown token addresses as other', () => {
      const apiVault = {
        state: {
          rewards: [
            {
              supplyApr: 0.005, // 0.5% unknown token reward
              asset: {
                address: '0x1234567890123456789012345678901234567890',
                name: 'UNKNOWN',
                symbol: 'UNKNOWN',
                chain: { id: CHAIN_ID },
              },
            },
          ],
          allocation: [],
        },
      }

      const result = calculateRewardsBreakdown(
        apiVault,
        testSupportedAssets,
        CHAIN_ID,
      )

      expect(result[USDC_ADDRESS]).toBe(0)
      expect(result[MORPHO_ADDRESS]).toBe(0)
      expect(result.other).toBeCloseTo(0.005, 4)
      expect(result.totalRewards).toBeCloseTo(0.005, 4)
    })

    it('should handle zero total supply in market allocations', () => {
      const apiVault = {
        state: {
          rewards: [],
          allocation: [
            {
              supplyAssetsUsd: 0, // No supply
              market: {
                uniqueKey: 'market1',
                state: {
                  rewards: [
                    {
                      supplyApr: 0.1, // High reward but no weight
                      asset: {
                        address: USDC_ADDRESS,
                        symbol: 'USDC',
                        chain: { id: CHAIN_ID },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      }

      const result = calculateRewardsBreakdown(
        apiVault,
        testSupportedAssets,
        CHAIN_ID,
      )

      // Should be zero because total supply is zero (weight = 0)
      expect(result[USDC_ADDRESS]).toBe(0)
      expect(result.totalRewards).toBe(0)
    })
  })
})
