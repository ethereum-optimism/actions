import type { Address } from 'viem'
import { erc20Abi, formatEther, formatUnits } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { getTokenAddress, type TokenInfo } from '@/supported/tokens.js'
import type { TokenBalance } from '@/types/token.js'

/**
 * Fetch ETH balance across all supported chains
 * @param chainManager - The chain manager
 * @param walletAddress - The wallet address
 * @returns Promise resolving to array of ETH balances
 */
export async function fetchETHBalance(
  chainManager: ChainManager,
  walletAddress: Address,
): Promise<TokenBalance> {
  const supportedChains = chainManager.getSupportedChains()
  const chainBalancePromises = supportedChains.map(async (chainId) => {
    const publicClient = chainManager.getPublicClient(chainId)
    const balance = await publicClient.getBalance({
      address: walletAddress,
    })
    return { chainId, balance, formattedBalance: formatEther(balance) }
  })
  const chainBalances = await Promise.all(chainBalancePromises)
  const totalBalance = chainBalances.reduce(
    (total, { balance }) => total + balance,
    0n,
  )
  return {
    symbol: 'ETH',
    totalBalance,
    totalFormattedBalance: formatEther(totalBalance),
    chainBalances,
  }
}

/**
 * Fetch total balance for this token across all supported chains
 */
export async function fetchERC20Balance(
  chainManager: ChainManager,
  walletAddress: Address,
  token: TokenInfo,
): Promise<TokenBalance> {
  const supportedChains = chainManager.getSupportedChains()
  const chainsWithToken = supportedChains.filter((chainId) =>
    getTokenAddress(token.symbol, chainId),
  )

  const chainBalancePromises = chainsWithToken.map(async (chainId) => {
    const balance = await fetchERC20BalanceForChain(
      token,
      chainId,
      walletAddress,
      chainManager,
    )
    return {
      chainId,
      balance,
      formattedBalance: formatUnits(balance, token.decimals),
    }
  })

  const chainBalances = await Promise.all(chainBalancePromises)
  const totalBalance = chainBalances.reduce(
    (total, { balance }) => total + balance,
    0n,
  )

  return {
    symbol: token.symbol,
    totalBalance,
    totalFormattedBalance: formatUnits(totalBalance, token.decimals),
    chainBalances,
  }
}

/**
 * Fetch balance for this token on a specific chain
 */
async function fetchERC20BalanceForChain(
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
