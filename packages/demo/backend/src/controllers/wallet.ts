import type { SupportedChainId } from '@eth-optimism/actions-sdk'
import type { Context } from 'hono'
import { type Address } from 'viem'
import { z } from 'zod'

import type { AuthContext } from '@/middleware/auth.js'
import type {
  CreateWalletResponse,
  GetWalletResponse,
} from '@/types/service.js'

import { validateRequest } from '../helpers/validation.js'
import * as walletService from '../services/wallet.js'
import { serializeBigInt } from '../utils/serializers.js'

const LendPositionRequestSchema = z.object({
  params: z.object({
    chainId: z.string().min(1, 'chainId is required'),
    marketAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid market address format'),
  }),
})

export class WalletController {
  /**
   * POST - Create a new wallet for a user
   */
  async createWallet(c: Context) {
    try {
      const auth = c.get('auth') as AuthContext | undefined

      if (!auth || !auth.userId) {
        return c.json({ error: 'Unauthorized' }, 401)
      }

      const { privyAddress, smartWalletAddress } =
        await walletService.createWallet()

      return c.json({
        privyAddress,
        smartWalletAddress,
        userId: auth.userId,
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
      const auth = c.get('auth') as AuthContext | undefined

      if (!auth || !auth.userId) {
        return c.json({ error: 'Unauthorized' }, 401)
      }

      const wallet = await walletService.getWallet(auth.userId)

      if (!wallet) {
        return c.json(
          {
            error: 'Wallet not found',
            message: `No wallet found for user ${auth.userId}`,
          },
          404,
        )
      }

      return c.json({
        address: wallet.address,
        userId: auth.userId,
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
   * GET - Get wallet balance by user ID
   */
  async getBalance(c: Context) {
    try {
      const auth = c.get('auth') as AuthContext | undefined

      if (!auth || !auth.userId) {
        return c.json({ error: 'Unauthorized' }, 401)
      }

      const wallet = await walletService.getWallet(auth.userId)
      if (!wallet) {
        throw new Error('Wallet not found')
      }
      const balance = await walletService.getWalletBalance(wallet)
      return c.json({ result: serializeBigInt(balance) })
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
   * GET - Lend position for a wallet
   */
  async getLendPosition(c: Context) {
    const validation = await validateRequest(c, LendPositionRequestSchema)
    if (!validation.success) return validation.response
    const {
      params: { marketAddress, chainId },
    } = validation.data
    const marketId = {
      address: marketAddress as Address,
      chainId: Number(chainId) as SupportedChainId,
    }

    const auth = c.get('auth') as AuthContext | undefined

    if (!auth || !auth.userId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const wallet = await walletService.getWallet(auth.userId)
    if (!wallet) {
      throw new Error('Wallet not found')
    }
    const position = await walletService.getLendPosition({ marketId, wallet })
    return c.json({ result: serializeBigInt(position) })
  }

  /**
   * POST - Fund a wallet with test tokens (ETH or USDC)
   */
  async fundWallet(c: Context) {
    try {
      const auth = c.get('auth') as AuthContext | undefined
      if (!auth || !auth.userId) {
        return c.json({ error: 'Unauthorized' }, 401)
      }

      const wallet = await walletService.getWallet(auth.userId)
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
}
