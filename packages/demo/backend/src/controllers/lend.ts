import type { Context } from 'hono'
import type { Address } from 'viem'
import { z } from 'zod'

import { errorResponse } from '../helpers/request.js'
import { validateRequest } from '../helpers/validation.js'
import * as lendService from '../services/lend.js'

/**
 * Lend controller for handling lending-related API endpoints
 */
export class LendController {
  /**
   * GET - Retrieve all available lending vaults
   */
  async getVaults(c: Context): Promise<Response> {
    try {
      const vaults = await lendService.getVaults()
      const formattedVaults = await Promise.all(
        vaults.map((vault) => lendService.formatVaultResponse(vault)),
      )
      return c.json({ vaults: formattedVaults })
    } catch (error) {
      return errorResponse(c, 'Failed to get vaults', error)
    }
  }

  /**
   * GET - Retrieve specific vault information by address
   */
  async getVault(c: Context): Promise<Response> {
    const schema = z.object({
      params: z.object({
        vaultAddress: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid vault address format'),
      }),
    })

    const validation = await validateRequest(c, schema)
    if (!validation.success) return validation.response

    try {
      const {
        params: { vaultAddress },
      } = validation.data
      const vaultInfo = await lendService.getVault(vaultAddress as Address)
      const formattedVault = await lendService.formatVaultResponse(vaultInfo)
      return c.json({ vault: formattedVault })
    } catch (error) {
      return errorResponse(c, 'Failed to get vault info', error)
    }
  }

  /**
   * GET - Get vault balance for a specific wallet
   */
  async getVaultBalance(c: Context): Promise<Response> {
    const schema = z.object({
      params: z.object({
        vaultAddress: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid vault address format'),
        walletId: z.string().min(1, 'walletId is required'),
      }),
    })

    const validation = await validateRequest(c, schema)
    if (!validation.success) return validation.response

    try {
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
      return errorResponse(c, 'Failed to get vault balance', error)
    }
  }

  /**
   * POST - Deposit tokens into a lending vault
   */
  async deposit(c: Context): Promise<Response> {
    const schema = z.object({
      body: z.object({
        walletId: z.string().min(1, 'walletId is required'),
        amount: z.number().positive('amount must be positive'),
        token: z.string().min(1, 'token is required'),
      }),
    })

    const validation = await validateRequest(c, schema)
    if (!validation.success) return validation.response

    try {
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
          ...result,
          amount: result.amount.toString(),
        },
      })
    } catch (error) {
      return errorResponse(c, 'Failed to deposit', error)
    }
  }
}
