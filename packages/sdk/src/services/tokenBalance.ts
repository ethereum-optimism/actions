import type { Address } from 'viem'
import { erc20Abi } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { getTokenAddress, type TokenInfo } from '@/supported/tokens.js'
import type { TokenBalance } from '@/types/token.js'

/**
 * Fetch total balance for this token across all supported chains
 */
export async function fetchBalance(
  chainManager: ChainManager,
  walletAddress: Address,
  token: TokenInfo,
): Promise<TokenBalance> {
  const supportedChains = chainManager.getSupportedChains()
  const chainsWithToken = supportedChains.filter((chainId) =>
    getTokenAddress(token.symbol, chainId),
  )

  const chainBalancePromises = chainsWithToken.map(async (chainId) => {
    const balance = await fetchBalanceForChain(
      token,
      chainId,
      walletAddress,
      chainManager,
    )
    return { chainId, balance }
  })

  const chainBalances = await Promise.all(chainBalancePromises)
  const totalBalance = chainBalances.reduce(
    (total, { balance }) => total + balance,
    0n,
  )

  return {
    symbol: token.symbol,
    totalBalance,
    chainBalances,
  }
}

/**
 * Fetch balance for this token on a specific chain
 */
async function fetchBalanceForChain(
  token: TokenInfo,
  chainId: SupportedChainId,
  walletAddress: Address,
  chainManager: ChainManager,
): Promise<bigint> {
  const tokenAddress = getTokenAddress(token.symbol, chainId)
  if (!tokenAddress) {
    throw new Error(`${token.symbol} not supported on chain ${chainId}`)
  }

  const publicClient = chainManager.getPublicClient(chainId)

  return publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [walletAddress],
  })
}
