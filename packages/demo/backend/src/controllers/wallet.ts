import type { Context } from 'hono'
import type { Address } from 'viem'
import { z } from 'zod'

import type { AuthContext } from '@/middleware/auth.js'
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
      const validation = await validateRequest(c, UserIdParamSchema)
      if (!validation.success) return validation.response

      const {
        params: { userId },
      } = validation.data
      const { privyAddress, smartWalletAddress } =
        await walletService.createWallet()

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
      const wallet = await walletService.getWallet(userId)

      if (!wallet) {
        return c.json(
          {
            error: 'Wallet not found',
            message: `No wallet found for user ${userId}`,
          },
          404,
        )
      }

      return c.json({
        address: wallet.address,
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
      const walletsData = wallets.map(({ wallet, id }) => ({
        address: wallet.address,
        id,
      }))

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
      const auth = c.get('auth') as AuthContext | undefined

      // TODO (https://github.com/ethereum-optimism/actions/issues/124): enforce auth and clean
      // up this route.
      if (auth && auth.userId) {
        const wallet = await walletService.getWallet(auth.userId, true)
        if (!wallet) {
          throw new Error('Wallet not found')
        }
        const balance = await walletService.getWalletBalance(wallet)
        return c.json({ balance: serializeBigInt(balance) })
      }

      const balance = await walletService.getBalance(userId)

      return c.json({ balance: serializeBigInt(balance) })
    } catch (error) {
      console.error(error)
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
      } = validation.data
      const auth = c.get('auth') as AuthContext | undefined

      // Use auth.userId if authenticated, otherwise fall back to userId param
      const targetUserId = auth?.userId || userId
      const isAuthedUser = !!auth?.userId

      const wallet = await walletService.getWallet(targetUserId, isAuthedUser)
      if (!wallet) {
        throw new Error('Wallet not found')
      }

      const result = await walletService.fundWallet(wallet)
      return c.json(result)
    } catch (error) {
      console.error(error)
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
