import type { Context } from 'hono'
import type { Address } from 'viem'
import { getAddress } from 'viem'
import { z } from 'zod'

import type {
  CreateWalletResponse,
  GetAllWalletsResponse,
  GetWalletResponse,
} from '@/types/service.js'

import { validateRequest } from '../helpers/validation.js'
import * as walletService from '../services/wallet.js'
import { serializeBigInt } from '../utils/serializers.js'

const WalletAddressParamSchema = z.object({
  params: z.object({
    walletAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address format')
      .trim(),
  }),
})

const FundWalletRequestSchema = z.object({
  params: z.object({
    walletAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address format')
      .trim(),
  }),
})

const SendTokensRequestSchema = z.object({
  body: z.object({
    walletAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address format')
      .trim(),
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
      const { signerAddress, smartWalletAddress } =
        await walletService.createWallet()

      return c.json({
        signerAddress,
        smartWalletAddress,
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
      const validation = await validateRequest(c, WalletAddressParamSchema)
      if (!validation.success) return validation.response

      const {
        params: { walletAddress },
      } = validation.data
      const wallet = await walletService.getWallet(getAddress(walletAddress))

      if (!wallet) {
        return c.json(
          {
            error: 'Wallet not found',
            message: `No wallet found for user ${walletAddress}`,
          },
          404,
        )
      }

      return c.json({
        address: wallet.address,
        userId: walletAddress,
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
      const validation = await validateRequest(c, WalletAddressParamSchema)
      if (!validation.success) return validation.response

      const {
        params: { walletAddress },
      } = validation.data
      const balance = await walletService.getBalance(getAddress(walletAddress))

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
        params: { walletAddress },
      } = validation.data

      const result = await walletService.fundWallet(getAddress(walletAddress))

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
        body: { walletAddress, amount, recipientAddress },
      } = validation.data

      const transactionData = await walletService.sendTokens(
        getAddress(walletAddress),
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
