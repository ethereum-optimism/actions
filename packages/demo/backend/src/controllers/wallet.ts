import type { SupportedChainId } from '@eth-optimism/actions-sdk'
import type { Context } from 'hono'
import { type Address } from 'viem'
import { z } from 'zod'

import type { AuthContext } from '@/middleware/auth.js'
import type { GetWalletResponse } from '@/types/service.js'

import { validateRequest } from '../helpers/validation.js'
import * as faucetService from '../services/faucet.js'
import * as walletService from '../services/wallet.js'

const LendPositionRequestSchema = z.object({
  params: z.object({
    chainId: z.string().min(1, 'chainId is required'),
    marketAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid market address format'),
  }),
})

const DripEthToWalletRequestSchema = z.object({
  body: z.object({
    walletAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address format'),
  }),
})

export class WalletController {
  /**
   * GET - Retrieve wallet information by user ID
   */
  async getWallet(c: Context) {
    try {
      const auth = c.get('auth') as AuthContext | undefined

      if (!auth || !auth.idToken) {
        return c.json({ error: 'Unauthorized' }, 401)
      }

      const wallet = await walletService.getWallet(auth.idToken)

      if (!wallet) {
        return c.json(
          {
            error: 'Wallet not found',
            message: `No wallet found for user`,
          },
          404,
        )
      }

      return c.json({
        address: wallet.address,
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

      if (!auth || !auth.idToken) {
        return c.json({ error: 'Unauthorized' }, 401)
      }

      const wallet = await walletService.getWallet(auth.idToken)
      if (!wallet) {
        throw new Error('Wallet not found')
      }
      const balance = await walletService.getWalletBalance(wallet)
      return c.json({ result: balance })
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
   * GET - Lend position for a wallet
   */
  async getLendPosition(c: Context) {
    const validation = await validateRequest(c, LendPositionRequestSchema)
    if (!validation.success) {
      return validation.response
    }
    const {
      params: { marketAddress, chainId },
    } = validation.data
    const marketId = {
      address: marketAddress as Address,
      chainId: Number(chainId) as SupportedChainId,
    }

    const auth = c.get('auth') as AuthContext | undefined

    if (!auth || !auth.idToken) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const wallet = await walletService.getWallet(auth.idToken)
    if (!wallet) {
      throw new Error('Wallet not found')
    }
    const position = await walletService.getLendPosition({ marketId, wallet })
    return c.json({ result: position })
  }

  /**
   * POST - Fund a wallet with test tokens (ETH or USDC)
   */
  async mintDemoUsdcToWallet(c: Context) {
    try {
      const auth = c.get('auth') as AuthContext | undefined
      if (!auth || !auth.idToken) {
        return c.json({ error: 'Unauthorized' }, 401)
      }

      const wallet = await walletService.getWallet(auth.idToken)
      if (!wallet) {
        throw new Error('Wallet not found')
      }

      const result = await walletService.mintDemoUsdcToWallet(wallet)
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
   * POST - Drip ETH to a wallet from the faucet
   */
  async dripEthToWallet(c: Context) {
    const validation = await validateRequest(c, DripEthToWalletRequestSchema)
    if (!validation.success) {
      return validation.response
    }
    const {
      body: { walletAddress },
    } = validation.data
    try {
      const isWalletEligibleForFaucet =
        await faucetService.isWalletEligibleForFaucet(walletAddress as Address)
      if (!isWalletEligibleForFaucet) {
        return c.json({ error: 'Wallet is not eligible for the faucet' }, 400)
      }

      const result = await faucetService.dripEthToWallet(
        walletAddress as Address,
      )
      if (!result.success) {
        return c.json({ error: 'Failed to drip ETH to wallet' }, 500)
      }

      return c.json({ result: { userOpHash: result.userOpHash } })
    } catch (error) {
      return c.json(
        {
          error: 'Failed to drip ETH to wallet',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }
}
