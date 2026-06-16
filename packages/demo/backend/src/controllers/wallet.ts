import type { SupportedChainId } from '@eth-optimism/actions-sdk'
import type { Context } from 'hono'
import { type Address } from 'viem'
import { z } from 'zod'

import { errorResponse, requireAuth } from '@/helpers/errors.js'
import {
  AddressSchema,
  Bytes32Schema,
  ChainIdStringSchema,
} from '@/helpers/schemas.js'
import { validateRequest } from '@/helpers/validation.js'
import * as borrowService from '@/services/borrow.js'
import * as faucetService from '@/services/faucet.js'
import * as walletService from '@/services/wallet.js'
import type { GetWalletResponse } from '@/types/service.js'

const LendPositionRequestSchema = z.object({
  params: z.object({
    chainId: z.string().min(1, 'chainId is required'),
    marketAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid market address format'),
  }),
})

const BorrowPositionRequestSchema = z.object({
  params: z.object({
    chainId: ChainIdStringSchema,
    marketId: Bytes32Schema,
  }),
})

const DripEthToWalletRequestSchema = z.object({
  body: z.object({
    walletAddress: AddressSchema,
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
   * GET - Borrow position for a wallet (Morpho variant). SDK errors
   * propagate to the borrow-scoped `app.onError` handler.
   */
  async getBorrowPosition(c: Context) {
    const validation = await validateRequest(c, BorrowPositionRequestSchema)
    if (!validation.success) return validation.response
    const {
      params: { chainId, marketId: marketIdHex },
    } = validation.data
    // Resolve kind from the allowlist; it is not trusted from the path.
    const marketId = borrowService.resolveBorrowMarketId(chainId, marketIdHex)

    const authResult = requireAuth(c)
    if ('error' in authResult) return authResult.error

    const wallet = await walletService.getWallet(authResult.auth.idToken)
    if (!wallet) {
      return errorResponse(c, 'Wallet not found', 404)
    }

    const position = await walletService.getBorrowPosition({
      marketId,
      walletAddress: wallet.address as Address,
    })
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
        await faucetService.isWalletEligibleForFaucet(walletAddress)
      if (!isWalletEligibleForFaucet) {
        return errorResponse(c, 'Wallet is not eligible for the faucet', 400)
      }

      const result = await faucetService.dripEthToWallet(walletAddress)
      if (!result.success) {
        return errorResponse(c, 'Failed to drip ETH to wallet', 500)
      }

      return c.json({ result: { userOpHash: result.userOpHash } })
    } catch (error) {
      return errorResponse(c, 'Failed to drip ETH to wallet', 500, error)
    }
  }
}
