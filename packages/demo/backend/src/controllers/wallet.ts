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
    const requestId = Math.random().toString(36).substring(7)
    console.log(
      `[${new Date().toISOString()}] [${requestId}] getBalance - START`,
    )
    try {
      const auth = c.get('auth') as AuthContext | undefined

      if (!auth || !auth.idToken) {
        console.log(`[${requestId}] getBalance - UNAUTHORIZED`)
        return c.json({ error: 'Unauthorized' }, 401)
      }

      const wallet = await walletService.getWallet(auth.idToken)
      if (!wallet) {
        console.log(`[${requestId}] getBalance - WALLET NOT FOUND`)
        throw new Error('Wallet not found')
      }
      console.log(
        `[${requestId}] getBalance - Fetching balance for wallet: ${wallet.address}`,
      )
      const balance = await walletService.getWalletBalance(wallet)
      console.log(
        `[${requestId}] getBalance - SUCCESS, returning ${balance.length} token balances`,
      )
      return c.json({ result: balance })
    } catch (error) {
      console.error(`[${requestId}] getBalance - ERROR:`, error)
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
    const requestId = Math.random().toString(36).substring(7)
    console.log(
      `[${new Date().toISOString()}] [${requestId}] getLendPosition - START`,
    )

    const validation = await validateRequest(c, LendPositionRequestSchema)
    if (!validation.success) {
      console.log(`[${requestId}] getLendPosition - VALIDATION FAILED`)
      return validation.response
    }
    const {
      params: { marketAddress, chainId },
    } = validation.data
    const marketId = {
      address: marketAddress as Address,
      chainId: Number(chainId) as SupportedChainId,
    }

    console.log(
      `[${requestId}] getLendPosition - Market: ${marketAddress} on chain ${chainId}`,
    )

    const auth = c.get('auth') as AuthContext | undefined

    if (!auth || !auth.idToken) {
      console.log(`[${requestId}] getLendPosition - UNAUTHORIZED`)
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const wallet = await walletService.getWallet(auth.idToken)
    if (!wallet) {
      console.log(`[${requestId}] getLendPosition - WALLET NOT FOUND`)
      throw new Error('Wallet not found')
    }
    console.log(
      `[${requestId}] getLendPosition - Fetching position for wallet: ${wallet.address}`,
    )
    const position = await walletService.getLendPosition({ marketId, wallet })
    console.log(
      `[${requestId}] getLendPosition - SUCCESS, shares: ${position.shares}`,
    )
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
    const requestId = Math.random().toString(36).substring(7)
    console.log(
      `[${new Date().toISOString()}] [${requestId}] dripEthToWallet - START`,
    )
    const validation = await validateRequest(c, DripEthToWalletRequestSchema)
    if (!validation.success) {
      console.log(`[${requestId}] dripEthToWallet - VALIDATION FAILED`)
      return validation.response
    }
    const {
      body: { walletAddress },
    } = validation.data
    console.log(`[${requestId}] dripEthToWallet - Wallet: ${walletAddress}`)
    try {
      console.log(`[${requestId}] dripEthToWallet - Checking eligibility`)
      const isWalletEligibleForFaucet =
        await faucetService.isWalletEligibleForFaucet(walletAddress as Address)
      if (!isWalletEligibleForFaucet) {
        console.log(`[${requestId}] dripEthToWallet - NOT ELIGIBLE`)
        return c.json({ error: 'Wallet is not eligible for the faucet' }, 400)
      }

      console.log(`[${requestId}] dripEthToWallet - Calling faucet service`)
      const result = await faucetService.dripEthToWallet(
        walletAddress as Address,
      )
      if (!result.success) {
        console.log(
          `[${requestId}] dripEthToWallet - FAILED (result.success=false)`,
        )
        return c.json({ error: 'Failed to drip ETH to wallet' }, 500)
      }

      console.log(
        `[${requestId}] dripEthToWallet - SUCCESS, userOpHash: ${result.userOpHash}`,
      )
      return c.json({ result: { userOpHash: result.userOpHash } })
    } catch (error) {
      console.error(`[${requestId}] dripEthToWallet - ERROR:`, error)
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
