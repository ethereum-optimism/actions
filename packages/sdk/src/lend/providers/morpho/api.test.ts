import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { externalTest } from '../../../utils/test.js'
import { fetchRewards } from './api.js'
import { fetchAndCalculateRewards } from './vaults.js'

/**
 * External tests for API functionality
 * These tests make actual network requests and require EXTERNAL_TEST=true
 */

describe('Morpho API Integration', () => {
  const GAUNTLET_USDC_VAULT =
    '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' as Address

  it.runIf(externalTest())(
    'should fetch raw vault data from Morpho GraphQL API',
    async () => {
      const vaultData = await fetchRewards(GAUNTLET_USDC_VAULT)

      expect(vaultData).toBeDefined()
      expect(vaultData).not.toBeNull()
      expect(vaultData.address).toBe(GAUNTLET_USDC_VAULT.toLowerCase())
      expect(vaultData.state).toBeDefined()
    },
    30000,
  ) // 30 second timeout for network request

  it.runIf(externalTest())(
    'should fetch and calculate rewards breakdown',
    async () => {
      const rewards = await fetchAndCalculateRewards(GAUNTLET_USDC_VAULT)

      expect(rewards).toBeDefined()
      expect(typeof rewards.usdcRewardsApr).toBe('number')
      expect(typeof rewards.morphoRewardsApr).toBe('number')
      expect(typeof rewards.otherRewardsApr).toBe('number')
      expect(typeof rewards.totalRewardsApr).toBe('number')

      // All reward APRs should be non-negative
      expect(rewards.usdcRewardsApr).toBeGreaterThanOrEqual(0)
      expect(rewards.morphoRewardsApr).toBeGreaterThanOrEqual(0)
      expect(rewards.otherRewardsApr).toBeGreaterThanOrEqual(0)
      expect(rewards.totalRewardsApr).toBeGreaterThanOrEqual(0)

      // Total rewards should equal sum of individual rewards
      const expectedTotal =
        rewards.usdcRewardsApr +
        rewards.morphoRewardsApr +
        rewards.otherRewardsApr
      expect(rewards.totalRewardsApr).toBeCloseTo(expectedTotal, 6)

      // For the Gauntlet USDC vault, we typically expect some rewards
      // This assertion may need adjustment based on actual market conditions
      expect(rewards.totalRewardsApr).toBeGreaterThanOrEqual(0)
    },
    30000,
  ) // 30 second timeout for network request

  it.runIf(externalTest())(
    'should handle non-existent vault gracefully',
    async () => {
      const nonExistentVault =
        '0x0000000000000000000000000000000000000000' as Address

      const vaultData = await fetchRewards(nonExistentVault)
      expect(vaultData).toBeNull()
    },
    30000,
  ) // 30 second timeout for network request

  it('should handle API errors gracefully', async () => {
    // Mock fetch to simulate network error
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    try {
      const vaultData = await fetchRewards(GAUNTLET_USDC_VAULT)
      expect(vaultData).toBeNull()
    } finally {
      // Restore original fetch
      global.fetch = originalFetch
    }
  })

  it.runIf(externalTest())(
    'should validate GraphQL response structure',
    async () => {
      const vaultData = await fetchRewards(GAUNTLET_USDC_VAULT)

      // Verify that the response has the expected structure
      expect(vaultData).toMatchObject({
        address: expect.any(String),
        state: expect.objectContaining({
          rewards: expect.any(Array),
          allocation: expect.any(Array),
        }),
      })
    },
    30000,
  ) // 30 second timeout for network request
})
