import type {
  LendMarket,
  LendMarketId,
  LendTransactionReceipt,
  SupportedChainId,
} from '@eth-optimism/actions-sdk'
import { SUPPORTED_TOKENS } from '@eth-optimism/actions-sdk'
import { chainById } from '@eth-optimism/viem/chains'
import { baseSepolia, unichain } from 'viem/chains'

import { getActions } from '../config/actions.js'
import type { PositionParams } from '../types/index.js'
import { serializeBigInt } from '../utils/serializers.js'
import { getWallet } from './wallet.js'

export async function getBlockExplorerUrls(
  chainId: SupportedChainId,
  transactionHashes?: string[],
  userOpHash?: string,
): Promise<string[]> {
  const chain = chainById[chainId]
  if (!chain) {
    throw new Error(`Chain not found for chainId: ${chainId}`)
  }

  let url = `${chain.blockExplorers?.default.url}`
  if (chain.id === unichain.id) {
    url = `https://unichain.blockscout.com`
  }
  if (chain.id === baseSepolia.id) {
    url = `https://base-sepolia.blockscout.com`
  }

  if (userOpHash) {
    return [`${url}/op/${userOpHash}`]
  }
  if (!transactionHashes) {
    throw new Error('Transaction hashes not found')
  }
  return transactionHashes.map((hash) => `${url}/tx/${hash}`)
}

export async function getMarkets() {
  const markets = await getActions().lend.getMarkets()
  return serializeBigInt(markets)
}

export async function getMarket(marketId: LendMarketId) {
  const market = await getActions().lend.getMarket(marketId)
  return serializeBigInt(market)
}

async function executePosition(
  params: PositionParams,
  operation: 'open' | 'close',
) {
  const { idToken, amount, tokenAddress, marketId } = params

  try {
    const wallet = await getWallet(idToken)
    if (!wallet) {
      const error = `Wallet not found`
      console.error('[executePositionV1] ERROR:', error)
      throw new Error(error)
    }

    const asset = SUPPORTED_TOKENS.find(
      (token) =>
        token.address[marketId.chainId as SupportedChainId] === tokenAddress,
    )
    if (!asset) {
      const error = `Asset not found for token address: ${tokenAddress}`
      console.error('[executePosition] ERROR:', error)
      throw new Error(error)
    }

    const positionParams = { amount, asset, marketId }

    const result =
      operation === 'open'
        ? await wallet.lend!.openPosition(positionParams)
        : await wallet.lend!.closePosition(positionParams)

    return serializeBigInt(result)
  } catch (error) {
    console.error('[executePosition] ERROR:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }
}

export async function openPosition(params: PositionParams) {
  return executePosition(params, 'open')
}

export async function closePosition(params: PositionParams) {
  return executePosition(params, 'close')
}
