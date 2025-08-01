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
          apyBreakdown: vault.apyBreakdown,
          totalAssets: vault.totalAssets.toString(),
          totalShares: vault.totalShares.toString(),
          fee: vault.fee,
          owner: vault.owner,
          curator: vault.curator,
          lastUpdate: vault.lastUpdate,
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

  async getVaultBalance(c: Context) {
    try {
      const { vaultAddress, walletId } = c.req.param()

      if (!vaultAddress || !walletId) {
        return c.json(
          {
            error: 'Vault address and wallet ID are required',
          },
          400,
        )
      }

      const vaultBalance = await lendService.getVaultBalance(
        vaultAddress as `0x${string}`,
        walletId,
      )

      return c.json({
        balance: vaultBalance.balance.toString(),
        balanceFormatted: vaultBalance.balanceFormatted,
        shares: vaultBalance.shares.toString(),
        sharesFormatted: vaultBalance.sharesFormatted,
      })
    } catch (error) {
      return c.json(
        {
          error: 'Failed to get vault balance',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }

  async deposit(c: Context) {
    try {
      const { walletId, amount, token } = await c.req.json()

      console.log(
        `[LEND] Starting deposit for wallet ${walletId}, amount ${amount}, token ${token}`,
      )

      if (!walletId || !amount || !token) {
        console.log('[LEND] Missing required parameters')
        return c.json(
          {
            error: 'Missing required parameters: walletId, amount, token',
          },
          400,
        )
      }

      if (typeof amount !== 'number' || amount <= 0) {
        console.log(`[LEND] Invalid amount: ${amount}`)
        return c.json(
          {
            error: 'Amount must be a positive number',
          },
          400,
        )
      }

      if (typeof token !== 'string') {
        console.log(`[LEND] Invalid token type: ${typeof token}`)
        return c.json(
          {
            error: 'Token must be a string',
          },
          400,
        )
      }

      console.log('[LEND] Calling lendService.deposit')
      const lendTransaction = await lendService.deposit(walletId, amount, token)
      console.log(`[LEND] Lend transaction prepared, executing on-chain...`)

      // Execute the actual transactions using wallet.sign() and wallet.send()
      const result = await lendService.executeLendTransaction(walletId, lendTransaction)
      console.log(`[LEND] Deposit successful, hash: ${result.hash}`)

      return c.json({
        transaction: {
          hash: result.hash,
          amount: result.amount.toString(),
          asset: result.asset,
          marketId: result.marketId,
          apy: result.apy,
          timestamp: result.timestamp,
          slippage: result.slippage,
          transactionData: result.transactionData,
        },
      })
    } catch (error) {
      console.error('[LEND] Deposit failed:', error)
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
