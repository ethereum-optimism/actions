import type { Context } from 'hono'

import * as lendService from '../services/lend.js'

export class LendController {
  async getVaults(c: Context) {
    try {
      const vaults = await lendService.getVaults()

      return c.json({
        vaults: vaults.map((vault) => ({
          address: vault.address,
          name: vault.name,
          apy: vault.apy,
          asset: vault.asset,
        })),
      })
    } catch (error) {
      return c.json(
        {
          error: 'Failed to get vaults',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }

  async getVault(c: Context) {
    try {
      const { vaultAddress } = c.req.param()

      if (!vaultAddress) {
        return c.json(
          {
            error: 'Vault address is required',
          },
          400,
        )
      }

      const vaultInfo = await lendService.getVault(
        vaultAddress as `0x${string}`,
      )

      return c.json({
        vault: {
          address: vaultInfo.address,
          name: vaultInfo.name,
          asset: vaultInfo.asset,
          apy: vaultInfo.apy,
          apyBreakdown: {
            nativeApy: vaultInfo.apyBreakdown.nativeApy,
            totalRewardsApr: vaultInfo.apyBreakdown.totalRewardsApr,
            usdcRewardsApr: vaultInfo.apyBreakdown.usdcRewardsApr,
            morphoRewardsApr: vaultInfo.apyBreakdown.morphoRewardsApr,
            otherRewardsApr: vaultInfo.apyBreakdown.otherRewardsApr,
            performanceFee: vaultInfo.apyBreakdown.performanceFee,
            netApy: vaultInfo.apyBreakdown.netApy,
          },
          totalAssets: vaultInfo.totalAssets.toString(),
          totalShares: vaultInfo.totalShares.toString(),
          fee: vaultInfo.fee,
          owner: vaultInfo.owner,
          curator: vaultInfo.curator,
          depositCapacity: vaultInfo.depositCapacity.toString(),
          withdrawalCapacity: vaultInfo.withdrawalCapacity.toString(),
          lastUpdate: vaultInfo.lastUpdate,
        },
      })
    } catch (error) {
      return c.json(
        {
          error: 'Failed to get vault info',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }
}
