import type { Address } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchRewards } from '@/lend/providers/morpho/api.js'
import {
  calculateRewardsBreakdown,
  fetchAndCalculateRewards,
} from '@/lend/providers/morpho/sdk.js'
import { externalTest } from '@/utils/test.js'

/**
 * Mock API response for a vault with rewards
 */
const mockVaultWithRewards = {
  address: '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9',
  id: 'test-vault-id',
  state: {
    rewards: [
      {
        asset: {
          address: '0x078d782b760474a361dda0af3839290b0ef57ad6',
          name: 'USD Coin',
          symbol: 'USDC',
          chain: { id: 130 },
        },
        amountPerSuppliedToken: '1000000',
        supplyApr: 0.025, // 2.5% APR
      },
      {
        asset: {
          address: '0x9994e35db50125e0df82e4c2dde62496ce330999',
          name: 'Morpho Token',
          symbol: 'MORPHO',
          chain: { id: 130 },
        },
        amountPerSuppliedToken: '500000',
        supplyApr: 0.01, // 1% APR
      },
    ],
    allocation: [
      {
        market: {
          id: 'market-1',
          uniqueKey: '0xmarket1',
          state: {
            rewards: [
              {
                supplyApr: 0.005, // 0.5% APR
                amountPerSuppliedToken: '100000',
                asset: {
                  address: '0xunknown',
                  symbol: 'UNKNOWN',
                  chain: { id: 130 },
                },
              },
            ],
          },
        },
        supplyAssetsUsd: 1000000,
      },
      {
        market: {
          id: 'market-2',
          uniqueKey: '0xmarket2',
          state: {
            rewards: [],
          },
        },
        supplyAssetsUsd: 500000,
      },
    ],
  },
  chain: { id: 130 },
}

/**
 * Mock API response for a vault with no rewards
 */
const mockVaultNoRewards = {
  address: '0x1234567890123456789012345678901234567890',
  id: 'empty-vault-id',
  state: {
    rewards: [],
    allocation: [],
  },
  chain: { id: 130 },
}

describe('Morpho API Integration', () => {
  const GAUNTLET_USDC_VAULT =
    '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' as Address

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('fetchRewards', () => {
    it('should return vault data on successful API response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          json: async () => ({
            data: {
              vaultByAddress: mockVaultWithRewards,
            },
          }),
        }),
      )

      const vaultData = await fetchRewards(GAUNTLET_USDC_VAULT)

      expect(vaultData).toBeDefined()
      expect(vaultData).not.toBeNull()
      expect(vaultData.address.toLowerCase()).toBe(
        GAUNTLET_USDC_VAULT.toLowerCase(),
      )
      expect(vaultData.state.rewards).toHaveLength(2)
    })

    it('should return null when vault not found', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          json: async () => ({
            data: {
              vaultByAddress: null,
            },
          }),
        }),
      )

      const vaultData = await fetchRewards(GAUNTLET_USDC_VAULT)
      expect(vaultData).toBeNull()
    })

    it('should handle API errors gracefully', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network error')),
      )

      const vaultData = await fetchRewards(GAUNTLET_USDC_VAULT)
      expect(vaultData).toBeNull()
    })

    it('should handle malformed JSON response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          json: async () => {
            throw new Error('Invalid JSON')
          },
        }),
      )

      const vaultData = await fetchRewards(GAUNTLET_USDC_VAULT)
      expect(vaultData).toBeNull()
    })
  })

  describe('calculateRewardsBreakdown', () => {
    it('should calculate rewards from vault-level rewards', () => {
      const rewards = calculateRewardsBreakdown(mockVaultWithRewards)

      expect(rewards.usdc).toBe(0.025)
      expect(rewards.morpho).toBe(0.01)
      expect(rewards.totalRewards).toBeCloseTo(0.025 + 0.01 + 0.005 * (1000000 / 1500000), 6)
    })

    it('should return zeros for vault with no rewards', () => {
      const rewards = calculateRewardsBreakdown(mockVaultNoRewards)

      expect(rewards.usdc).toBe(0)
      expect(rewards.morpho).toBe(0)
      expect(rewards.other).toBe(0)
      expect(rewards.totalRewards).toBe(0)
    })

    it('should categorize unknown tokens as other', () => {
      const vaultWithUnknown = {
        ...mockVaultNoRewards,
        state: {
          rewards: [
            {
              asset: { symbol: 'RARE_TOKEN' },
              supplyApr: 0.05,
            },
          ],
          allocation: [],
        },
      }

      const rewards = calculateRewardsBreakdown(vaultWithUnknown)

      expect(rewards.other).toBe(0.05)
    })

    it('should weight market rewards by allocation', () => {
      const vaultWithMarketRewards = {
        ...mockVaultNoRewards,
        state: {
          rewards: [],
          allocation: [
            {
              market: {
                state: {
                  rewards: [{ asset: { symbol: 'USDC' }, supplyApr: 0.1 }],
                },
              },
              supplyAssetsUsd: 750000, // 75% of total
            },
            {
              market: {
                state: {
                  rewards: [{ asset: { symbol: 'USDC' }, supplyApr: 0.02 }],
                },
              },
              supplyAssetsUsd: 250000, // 25% of total
            },
          ],
        },
      }

      const rewards = calculateRewardsBreakdown(vaultWithMarketRewards)

      // Expected: 0.1 * 0.75 + 0.02 * 0.25 = 0.075 + 0.005 = 0.08
      expect(rewards.usdc).toBeCloseTo(0.08, 6)
    })
  })

  describe('fetchAndCalculateRewards', () => {
    it('should fetch and calculate rewards breakdown', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          json: async () => ({
            data: {
              vaultByAddress: mockVaultWithRewards,
            },
          }),
        }),
      )

      const rewards = await fetchAndCalculateRewards(GAUNTLET_USDC_VAULT)

      expect(rewards).toBeDefined()
      expect(typeof rewards.usdc).toBe('number')
      expect(typeof rewards.morpho).toBe('number')
      expect(typeof rewards.other).toBe('number')
      expect(typeof rewards.totalRewards).toBe('number')
      expect(rewards.usdc).toBeGreaterThan(0)
      expect(rewards.morpho).toBeGreaterThan(0)
    })

    it('should return empty rewards when vault not found', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          json: async () => ({
            data: {
              vaultByAddress: null,
            },
          }),
        }),
      )

      const rewards = await fetchAndCalculateRewards(GAUNTLET_USDC_VAULT)

      expect(rewards.usdc).toBe(0)
      expect(rewards.morpho).toBe(0)
      expect(rewards.other).toBe(0)
      expect(rewards.totalRewards).toBe(0)
    })
  })

  // External tests that make real network requests (only run with EXTERNAL_TEST=true)
  describe.runIf(externalTest())('External API Tests', () => {
    it(
      'should fetch raw vault data from Morpho GraphQL API',
      async () => {
        const vaultData = await fetchRewards(GAUNTLET_USDC_VAULT)

        expect(vaultData).toBeDefined()
        expect(vaultData).not.toBeNull()
        expect(vaultData.address.toLowerCase()).toBe(
          GAUNTLET_USDC_VAULT.toLowerCase(),
        )
        expect(vaultData.state).toBeDefined()
      },
      30000,
    )

    it(
      'should fetch and calculate rewards breakdown',
      async () => {
        const rewards = await fetchAndCalculateRewards(GAUNTLET_USDC_VAULT)

        expect(rewards).toBeDefined()
        expect(typeof rewards.usdc).toBe('number')
        expect(typeof rewards.morpho).toBe('number')
        expect(typeof rewards.other).toBe('number')
        expect(typeof rewards.totalRewards).toBe('number')

        expect(rewards.usdc).toBeGreaterThanOrEqual(0)
        expect(rewards.morpho).toBeGreaterThanOrEqual(0)
        expect(rewards.other).toBeGreaterThanOrEqual(0)
        expect(rewards.totalRewards).toBeGreaterThanOrEqual(0)

        const expectedTotal = rewards.usdc + rewards.morpho + rewards.other
        expect(rewards.totalRewards).toBeCloseTo(expectedTotal, 6)
      },
      30000,
    )

    it(
      'should handle non-existent vault gracefully',
      async () => {
        const nonExistentVault =
          '0x0000000000000000000000000000000000000000' as Address

        const vaultData = await fetchRewards(nonExistentVault)
        expect(vaultData).toBeNull()
      },
      30000,
    )

    it(
      'should validate GraphQL response structure',
      async () => {
        const vaultData = await fetchRewards(GAUNTLET_USDC_VAULT)

        expect(vaultData).toMatchObject({
          address: expect.any(String),
          state: expect.objectContaining({
            rewards: expect.any(Array),
            allocation: expect.any(Array),
          }),
        })
      },
      30000,
    )
  })
})
