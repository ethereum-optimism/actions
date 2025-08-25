import type { Context } from 'hono'
import type { Address } from 'viem'
import { z } from 'zod'

import { validateRequest } from '../helpers/validation.js'
import * as lendService from '../services/lend.js'

const DepositRequestSchema = z.object({
  body: z.object({
    walletId: z.string().min(1, 'walletId is required'),
    amount: z.number().positive('amount must be positive'),
    token: z.string().min(1, 'token is required'),
  }),
})

const VaultAddressParamSchema = z.object({
  params: z.object({
    vaultAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid vault address format'),
  }),
})

const VaultBalanceParamsSchema = z.object({
  params: z.object({
    vaultAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid vault address format'),
    walletId: z.string().min(1, 'walletId is required'),
  }),
})

export class LendController {
  /**
   * GET - Retrieve all available lending vaults
   */
  async getVaults(c: Context) {
    try {
      const vaults = await lendService.getVaults()
      const formattedVaults = await Promise.all(
        vaults.map((vault) => lendService.formatVaultResponse(vault)),
      )
      return c.json({ vaults: formattedVaults })
    } catch (error) {
      console.error('[LendController.getVaults] Error:', error)
      return c.json(
        {
          error: 'Failed to get vaults',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }

  /**
   * GET - Retrieve specific vault information by address
   */
  async getVault(c: Context) {
    try {
      const validation = await validateRequest(c, VaultAddressParamSchema)
      if (!validation.success) return validation.response

      const {
        params: { vaultAddress },
      } = validation.data
      const vaultInfo = await lendService.getVault(vaultAddress as Address)
      const formattedVault = await lendService.formatVaultResponse(vaultInfo)
      return c.json({ vault: formattedVault })
    } catch (error) {
      console.error('[LendController.getVault] Error:', error)
      return c.json(
        {
          error: 'Failed to get vault info',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }

  /**
   * GET - Get vault balance for a specific wallet
   */
  async getVaultBalance(c: Context) {
    try {
      const validation = await validateRequest(c, VaultBalanceParamsSchema)
      if (!validation.success) return validation.response

      const {
        params: { vaultAddress, walletId },
      } = validation.data
      const balance = await lendService.getVaultBalance(
        vaultAddress as Address,
        walletId,
      )
      const formattedBalance =
        await lendService.formatVaultBalanceResponse(balance)
      return c.json(formattedBalance)
    } catch (error) {
      console.error('[LendController.getVaultBalance] Error:', error)
      return c.json(
        {
          error: 'Failed to get vault balance',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }

  /**
   * POST - Deposit tokens into a lending vault
   */
  async deposit(c: Context) {
    try {
      const validation = await validateRequest(c, DepositRequestSchema)
      if (!validation.success) return validation.response

      const {
        body: { walletId, amount, token },
      } = validation.data
      const lendTransaction = await lendService.deposit(walletId, amount, token)
      const result = await lendService.executeLendTransaction(
        walletId,
        lendTransaction,
      )

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
      console.error('[LendController.deposit] Error:', error)
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
