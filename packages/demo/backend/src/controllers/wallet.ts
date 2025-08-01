import type {
  CreateWalletResponse,
  GetAllWalletsResponse,
  GetWalletResponse,
} from '@eth-optimism/verbs-sdk'
import { unichain } from '@eth-optimism/viem/chains'
import type { Context } from 'hono'
import type { Address, Hex } from 'viem'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { writeContract } from 'viem/actions'
import { z } from 'zod'

import { faucetAbi } from '@/abis/faucet.js'
import { env } from '@/config/env.js'

import * as walletService from '../services/wallet.js'
import { serializeBigInt } from '../utils/serializers.js'

const userIdSchema = z.object({
  userId: z.string().min(1, 'User ID is required').trim(),
})

function createValidationError(c: Context, error: z.ZodError) {
  return c.json(
    {
      error: 'Invalid parameters',
      details: error.format(),
    },
    400,
  )
}

function validateUserParams(c: Context) {
  const params = c.req.param()
  const result = userIdSchema.safeParse(params)
  if (!result.success) {
    return {
      error: createValidationError(c, result.error),
      data: null,
    }
  }
  return { error: null, data: result.data }
}

export class WalletController {
  async createWallet(c: Context) {
    try {
      // Validate userId parameter
      const validation = validateUserParams(c)
      if (validation.error) return validation.error

      const { userId } = validation.data
      const wallet = await walletService.createWallet(userId)

      return c.json({
        address: wallet.address,
        userId,
      } satisfies CreateWalletResponse)
    } catch (error) {
      return c.json(
        {
          error: 'Failed to create wallet',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      )
    }
  }

  async getWallet(c: Context) {
    try {
      const validation = validateUserParams(c)
      if (validation.error) return validation.error

      const { userId } = validation.data
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

  async getAllWallets(c: Context) {
    try {
      const query = c.req.query()
      const options = {
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        cursor: query.cursor || undefined,
      }

      const wallets = await walletService.getAllWallets(options)

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

  async getBalance(c: Context) {
    try {
      const validation = validateUserParams(c)
      if (validation.error) return validation.error

      const { userId } = validation.data
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

  async fundWallet(c: Context) {
    try {
      const validation = validateUserParams(c)
      if (validation.error) return validation.error

      const { userId } = validation.data

      // Check if we're running against supersim locally
      const isLocalSupersim = env.RPC_URL === 'http://127.0.0.1:9545'
      console.log(env.RPC_URL)

      if (!isLocalSupersim) {
        return c.json(
          {
            error:
              'Wallet fund is coming soon. For now, manually send USDC or ETH to a wallet.',
            message:
              'Funding is only available in local development with supersim',
          },
          400,
        )
      }
      const faucetAdminWalletClient = createWalletClient({
        chain: unichain,
        transport: http(env.RPC_URL),
        account: privateKeyToAccount(env.FAUCET_ADMIN_PRIVATE_KEY as Hex),
      })

      const publicClient = createPublicClient({
        chain: unichain,
        transport: http(env.RPC_URL),
      })

      const wallet = await walletService.getWallet(userId)
      if (!wallet) {
        return c.json({ error: 'Wallet not found' }, 404)
      }

      // TODO:make this an env var
      const usdcAddress = '0x078D782b760474a361dDA0AF3839290b0EF57AD6'

      const dripHash = await writeContract(faucetAdminWalletClient, {
        account: faucetAdminWalletClient.account,
        address: env.FAUCET_ADDRESS as Address,
        abi: faucetAbi,
        functionName: 'dripERC20',
        // TODO: amount is hardcoded to 1000, we could also allow for a user to input the amount
        args: [wallet.address, 1000n, usdcAddress as Address],
      })
      await publicClient.waitForTransactionReceipt({ hash: dripHash })

      return c.json({ success: true })
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
}
