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
          apyBreakdown: vaultInfo.apyBreakdown,
          totalAssets: vaultInfo.totalAssets.toString(),
          totalShares: vaultInfo.totalShares.toString(),
          fee: vaultInfo.fee,
          owner: vaultInfo.owner,
          curator: vaultInfo.curator,
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

  async deposit(c: Context) {
    try {
      const { walletId, amount, token } = await c.req.json()

      if (!walletId || !amount || !token) {
        return c.json(
          {
            error: 'Missing required parameters: walletId, amount, token',
          },
          400,
        )
      }

      if (typeof amount !== 'number' || amount <= 0) {
        return c.json(
          {
            error: 'Amount must be a positive number',
          },
          400,
        )
      }

      if (typeof token !== 'string') {
        return c.json(
          {
            error: 'Token must be a string',
          },
          400,
        )
      }

      const lendTransaction = await lendService.deposit(walletId, amount, token)

      return c.json({
        transaction: {
          hash: lendTransaction.hash,
          amount: lendTransaction.amount.toString(),
          asset: lendTransaction.asset,
          marketId: lendTransaction.marketId,
          apy: lendTransaction.apy,
          timestamp: lendTransaction.timestamp,
          slippage: lendTransaction.slippage,
          transactionData: lendTransaction.transactionData,
        },
      })
    } catch (error) {
      return c.json(
        {
          error: 'Failed to deposit',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }
}
