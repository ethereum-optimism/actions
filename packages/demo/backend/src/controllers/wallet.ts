import type {
  CreateWalletResponse,
  GetAllWalletsResponse,
  GetWalletResponse,
} from '@eth-optimism/verbs-sdk'
import type { Context } from 'hono'
import type { Address } from 'viem'
import { z } from 'zod'

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
    asset: z.string().min(1, 'asset is required'),
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
      console.log('=== WALLET CONTROLLER createWallet START ===')
      console.log('Method:', c.req.method)
      console.log('URL:', c.req.url)
      console.log('Path:', c.req.path)
      console.log('Params:', c.req.param())
      
      const validation = await validateRequest(c, UserIdParamSchema)
      if (!validation.success) {
        console.log('Validation failed:', validation.response)
        return validation.response
      }

      const {
        params: { userId },
      } = validation.data
      
      console.log('Creating wallet for userId:', userId)
      const wallet = await walletService.createWallet(userId)

      const response = {
        address: wallet.address,
        userId,
      } satisfies CreateWalletResponse
      
      console.log('Sending createWallet response:', response)
      console.log('=== WALLET CONTROLLER createWallet END ===')

      return c.json(response)
    } catch (error) {
      console.log('=== WALLET CONTROLLER createWallet ERROR ===')
      console.log('Error:', error)
      console.log('=== WALLET CONTROLLER createWallet ERROR END ===')
      
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

      return c.json({
        wallets: wallets.map((wallet) => ({
          address: wallet.address,
          id: wallet.id,
        })),
        count: wallets.length,
      } satisfies GetAllWalletsResponse)
    } catch (error) {
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
      console.log('=== WALLET CONTROLLER sendTokens START ===')
      console.log('Method:', c.req.method)
      console.log('URL:', c.req.url)
      console.log('Path:', c.req.path)
      console.log('Raw Body:', await c.req.text())
      
      // Reset the request body for validation
      const clonedRequest = c.req.clone()
      
      const validation = await validateRequest(clonedRequest, SendTokensRequestSchema)
      if (!validation.success) {
        console.log('Validation failed:', validation.response)
        return validation.response
      }

      const {
        body: { walletId, amount, asset, recipientAddress },
      } = validation.data
      
      console.log('Validated request data:', { walletId, amount, asset, recipientAddress })

      const transactionData = await walletService.sendTokens(
        walletId,
        amount,
        asset,
        recipientAddress as Address,
      )
      
      console.log('Transaction data from service:', transactionData)

      const response = {
        transaction: {
          to: transactionData.to,
          value: transactionData.value,
          data: transactionData.data,
        },
      }
      
      console.log('Sending response:', response)
      console.log('=== WALLET CONTROLLER sendTokens END ===')
      
      return c.json(response)
    } catch (error) {
      console.log('=== WALLET CONTROLLER sendTokens ERROR ===')
      console.log('Error:', error)
      console.log('Error message:', error instanceof Error ? error.message : 'Unknown error')
      console.log('=== WALLET CONTROLLER sendTokens ERROR END ===')
      
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
