import type { SupportedChainId } from '@eth-optimism/actions-sdk'
import type { Context } from 'hono'
import { type Address } from 'viem'
import { z } from 'zod'

import type { GetWalletResponse } from '@/types/service.js'

import { errorResponse, requireAuth } from '../helpers/errors.js'
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
      const authResult = requireAuth(c)
      if ('error' in authResult) return authResult.error

      const wallet = await walletService.getWallet(authResult.auth.idToken)

      if (!wallet) {
        return errorResponse(c, 'Wallet not found', 404)
      }

      return c.json({
        address: wallet.address,
      } satisfies GetWalletResponse)
    } catch (error) {
      return errorResponse(c, 'Failed to get wallet', 500, error)
    }
  }

  /**
   * GET - Get wallet balance by user ID
   */
  async getBalance(c: Context) {
    try {
      const authResult = requireAuth(c)
      if ('error' in authResult) return authResult.error

      const wallet = await walletService.getWallet(authResult.auth.idToken)
      if (!wallet) {
        throw new Error('Wallet not found')
      }
      const balance = await walletService.getWalletBalance(wallet)
      return c.json({ result: balance })
    } catch (error) {
      return errorResponse(c, 'Failed to get balance', 500, error)
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

    const authResult = requireAuth(c)
    if ('error' in authResult) return authResult.error

    const wallet = await walletService.getWallet(authResult.auth.idToken)
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
      const authResult = requireAuth(c)
      if ('error' in authResult) return authResult.error

      const wallet = await walletService.getWallet(authResult.auth.idToken)
      if (!wallet) {
        throw new Error('Wallet not found')
      }

      const result = await walletService.mintDemoUsdcToWallet(wallet)
      return c.json(result)
    } catch (error) {
      return errorResponse(c, 'Failed to fund wallet', 500, error)
    }
  }

  /**
   * POST - Drip ETH to a wallet from the faucet
   */
  async dripEthToWallet(c: Context) {
    const validation = await validateRequest(c, DripEthToWalletRequestSchema)
    if (!validation.success) return validation.response
    const {
      body: { walletAddress },
    } = validation.data
    try {
      const isWalletEligibleForFaucet =
        await faucetService.isWalletEligibleForFaucet(walletAddress as Address)
      if (!isWalletEligibleForFaucet) {
        return errorResponse(c, 'Wallet is not eligible for the faucet', 400)
      }

      const result = await faucetService.dripEthToWallet(
        walletAddress as Address,
      )
      if (!result.success) {
        return errorResponse(c, 'Failed to drip ETH to wallet', 500)
      }

      return c.json({ result: { userOpHash: result.userOpHash } })
    } catch (error) {
      return errorResponse(c, 'Failed to drip ETH to wallet', 500, error)
    }
  }
}
