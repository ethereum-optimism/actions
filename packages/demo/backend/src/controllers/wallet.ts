import type { Context } from 'hono'
import type { Address } from 'viem'
import { z } from 'zod'

import type {
  CreateWalletResponse,
  GetAllWalletsResponse,
  GetWalletResponse,
} from '@/types/service.js'

import { validateRequest } from '../helpers/validation.js'
import * as walletService from '../services/wallet.js'
import { serializeBigInt } from '../utils/serializers.js'

const UserIdParamSchema = z.object({
  params: z.object({
    userId: z.string().min(1, 'User ID is required').trim(),
  }),
})

const FundWalletRequestSchema = z.object({
  params: z.object({
    userId: z.string().min(1, 'User ID is required').trim(),
  }),
  body: z.object({
    tokenType: z.enum(['ETH', 'USDC']).optional().default('USDC'),
  }),
})

const SendTokensRequestSchema = z.object({
  body: z.object({
    walletId: z.string().min(1, 'walletId is required'),
    amount: z.number().positive('amount must be positive'),
    recipientAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid recipient address format'),
  }),
})

const GetAllWalletsQuerySchema = z.object({
  query: z.object({
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : undefined)),
    cursor: z.string().optional(),
  }),
})

export class WalletController {
  /**
   * POST - Create a new wallet for a user
   */
  async createWallet(c: Context) {
    try {
      const auth = c.get('auth')
      const userId = auth?.userId || c.req.param('userId')

      if (!userId) {
        return c.json({ error: 'User ID required' }, 400)
      }

      const { privyAddress, smartWalletAddress } =
        await walletService.createWallet(userId)

      return c.json({
        privyAddress,
        smartWalletAddress,
        userId,
      } satisfies CreateWalletResponse)
    } catch (error) {
      console.error(error)
      return c.json(
        {
          error: 'Failed to create wallet',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }

  /**
   * GET - Retrieve wallet information by user ID
   */
  async getWallet(c: Context) {
    try {
      const validation = await validateRequest(c, UserIdParamSchema)
      if (!validation.success) return validation.response

      const {
        params: { userId },
      } = validation.data
      const { wallet } = await walletService.getWallet(userId)

      if (!wallet) {
        return c.json(
          {
            error: 'Wallet not found',
            message: `No wallet found for user ${userId}`,
          },
          404,
        )
      }
      const walletAddress = await wallet.getAddress()

      return c.json({
        address: walletAddress,
        userId,
      } satisfies GetWalletResponse)
    } catch (error) {
      console.error(error)
      return c.json(
        {
          error: 'Failed to get wallet',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }

  /**
   * GET - Retrieve all wallets with optional pagination
   */
  async getAllWallets(c: Context) {
    try {
      const validation = await validateRequest(c, GetAllWalletsQuerySchema)
      if (!validation.success) return validation.response

      const {
        query: { limit, cursor },
      } = validation.data
      const wallets = await walletService.getAllWallets({ limit, cursor })
      const walletsData = await Promise.all(
        wallets.map(async ({ wallet, id }) => ({
          address: await wallet.getAddress(),
          id,
        })),
      )

      return c.json({
        wallets: walletsData,
        count: wallets.length,
      } satisfies GetAllWalletsResponse)
    } catch (error) {
      console.error(error)
      return c.json(
        {
          error: 'Failed to get wallets',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }

  /**
   * GET - Get wallet balance by user ID
   */
  async getBalance(c: Context) {
    try {
      const validation = await validateRequest(c, UserIdParamSchema)
      if (!validation.success) return validation.response

      const {
        params: { userId },
      } = validation.data
      const balance = await walletService.getBalance(userId)

      return c.json({ balance: serializeBigInt(balance) })
    } catch (error) {
      return c.json(
        {
          error: 'Failed to get balance',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }

  /**
   * POST - Fund a wallet with test tokens (ETH or USDC)
   */
  async fundWallet(c: Context) {
    try {
      const validation = await validateRequest(c, FundWalletRequestSchema)
      if (!validation.success) return validation.response

      const {
        params: { userId },
        body: { tokenType },
      } = validation.data

      const result = await walletService.fundWallet(userId, tokenType)

      return c.json(result)
    } catch (error) {
      return c.json(
        {
          error: 'Failed to fund wallet',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }

  /**
   * POST - Send tokens from wallet to recipient address
   */
  async sendTokens(c: Context) {
    try {
      const validation = await validateRequest(c, SendTokensRequestSchema)
      if (!validation.success) return validation.response

      const {
        body: { walletId, amount, recipientAddress },
      } = validation.data

      const transactionData = await walletService.sendTokens(
        walletId,
        amount,
        recipientAddress as Address,
      )

      return c.json({
        transaction: {
          to: transactionData.to,
          value: transactionData.value,
          data: transactionData.data,
        },
      })
    } catch (error) {
      return c.json(
        {
          error: 'Failed to send tokens',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }
}
