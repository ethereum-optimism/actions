import type {
  CreateWalletResponse,
  GetAllWalletsResponse,
  GetWalletResponse,
} from '@eth-optimism/verbs-sdk'
import type { Context } from 'hono'
import type { Address } from 'viem'
import { z } from 'zod'

import { verbs } from '../config/verbs.js'
import { errorResponse, notFoundResponse } from '../helpers/request.js'
import { validateRequest } from '../helpers/validation.js'
import * as walletService from '../services/wallet.js'
import { serializeBigInt } from '../utils/serializers.js'

const userIdSchema = z.object({
  params: z.object({
    userId: z.string().min(1, 'User ID is required').trim(),
  }),
})

/**
 * Wallet controller for handling wallet-related API endpoints
 */
export class WalletController {
  /**
   * POST - Create a new wallet for a user
   */
  async createWallet(c: Context): Promise<Response> {
    const validation = await validateRequest(c, userIdSchema)
    if (!validation.success) return validation.response

    try {
      const {
        params: { userId },
      } = validation.data
      const wallet = await verbs.createWallet(userId)
      return c.json({
        address: wallet.address,
        userId,
      } satisfies CreateWalletResponse)
    } catch (error) {
      return errorResponse(c, 'Failed to create wallet', error)
    }
  }

  /**
   * GET - Retrieve wallet information by user ID
   */
  async getWallet(c: Context): Promise<Response> {
    const validation = await validateRequest(c, userIdSchema)
    if (!validation.success) return validation.response

    try {
      const {
        params: { userId },
      } = validation.data
      const wallet = await verbs.getWallet(userId)

      if (!wallet) return notFoundResponse(c, 'Wallet', `user ${userId}`)
      return c.json({
        address: wallet.address,
        userId,
      } satisfies GetWalletResponse)
    } catch (error) {
      return errorResponse(c, 'Failed to get wallet', error)
    }
  }

  /**
   * GET - Retrieve all wallets with optional pagination
   */
  async getAllWallets(c: Context): Promise<Response> {
    const schema = z.object({
      query: z.object({
        limit: z
          .string()
          .optional()
          .transform((val) => (val ? parseInt(val, 10) : undefined)),
        cursor: z.string().optional(),
      }),
    })

    const validation = await validateRequest(c, schema)
    if (!validation.success) return validation.response

    try {
      const {
        query: { limit, cursor },
      } = validation.data
      const wallets = await verbs.getAllWallets({ limit, cursor })

      return c.json({
        wallets: wallets.map(({ address, id }) => ({ address, id })),
        count: wallets.length,
      } satisfies GetAllWalletsResponse)
    } catch (error) {
      return errorResponse(c, 'Failed to get wallets', error)
    }
  }

  /**
   * GET - Get wallet balance by user ID
   */
  async getBalance(c: Context): Promise<Response> {
    const validation = await validateRequest(c, userIdSchema)
    if (!validation.success) return validation.response

    try {
      const {
        params: { userId },
      } = validation.data
      const balance = await walletService.getBalance(userId)
      return c.json({ balance: serializeBigInt(balance) })
    } catch (error) {
      return errorResponse(c, 'Failed to get balance', error)
    }
  }

  /**
   * POST - Fund a wallet with test tokens (ETH or USDC)
   */
  async fundWallet(c: Context): Promise<Response> {
    const schema = userIdSchema.extend({
      body: z.object({
        tokenType: z.enum(['ETH', 'USDC']).optional().default('USDC'),
      }),
    })

    const validation = await validateRequest(c, schema)
    if (!validation.success) return validation.response

    try {
      const {
        params: { userId },
        body: { tokenType },
      } = validation.data
      return c.json(await walletService.fundWallet(userId, tokenType))
    } catch (error) {
      return errorResponse(c, 'Failed to fund wallet', error)
    }
  }

  /**
   * POST - Send tokens from wallet to recipient address
   */
  async sendTokens(c: Context): Promise<Response> {
    const schema = z.object({
      body: z.object({
        walletId: z.string().min(1, 'walletId is required'),
        amount: z.number().positive('amount must be positive'),
        recipientAddress: z
          .string()
          .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid recipient address format'),
      }),
    })

    const validation = await validateRequest(c, schema)
    if (!validation.success) return validation.response

    try {
      const {
        body: { walletId, amount, recipientAddress },
      } = validation.data
      const { to, value, data } = await walletService.sendTokens(
        walletId,
        amount,
        recipientAddress as Address,
      )

      return c.json({ transaction: { to, value, data } })
    } catch (error) {
      return errorResponse(c, 'Failed to send tokens', error)
    }
  }
}
