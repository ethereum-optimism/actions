import type { Address } from 'viem'
import { erc20Abi, formatEther, formatUnits } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset, TokenBalance } from '@/types/asset.js'

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
    return {
      chainId,
      balance,
      tokenAddress: 'native' as const,
      formattedBalance: formatEther(balance),
    }
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
 * Fetch total balance for this asset across all supported chains
 */
export async function fetchERC20Balance(
  chainManager: ChainManager,
  walletAddress: Address,
  asset: Asset,
): Promise<TokenBalance> {
  const supportedChains = chainManager.getSupportedChains()
  const chainsWithToken = supportedChains.filter(
    (chainId) => asset.address[chainId],
  )

  const chainBalancePromises = chainsWithToken.map(async (chainId) => {
    const { balance, tokenAddress } = await fetchERC20BalanceForChain(
      asset,
      chainId,
      walletAddress,
      chainManager,
    )
    return {
      chainId,
      balance,
      tokenAddress,
      formattedBalance: formatUnits(balance, asset.metadata.decimals),
    }
  })

  const chainBalances = await Promise.all(chainBalancePromises)
  const totalBalance = chainBalances.reduce(
    (total, { balance }) => total + balance,
    0n,
  )

  return {
    symbol: asset.metadata.symbol,
    totalBalance,
    totalFormattedBalance: formatUnits(totalBalance, asset.metadata.decimals),
    chainBalances,
  }
}

/**
 * Fetch balance for this asset on a specific chain
 */
async function fetchERC20BalanceForChain(
  asset: Asset,
  chainId: SupportedChainId,
  walletAddress: Address,
  chainManager: ChainManager,
): Promise<{ balance: bigint; tokenAddress: Address | 'native' }> {
  const tokenAddress = asset.address[chainId]
  if (!tokenAddress) {
    throw new Error(
      `${asset.metadata.symbol} not supported on chain ${chainId}`,
    )
  }

  const publicClient = chainManager.getPublicClient(chainId)

  // Handle native ETH balance
  if (asset.type === 'native' || tokenAddress === 'native') {
    return {
      balance: await publicClient.getBalance({
        address: walletAddress,
      }),
      tokenAddress: 'native',
    }
  }

  const balance = await publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [walletAddress],
  })
  return { balance, tokenAddress }
}
