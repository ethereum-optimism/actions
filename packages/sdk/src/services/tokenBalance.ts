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
  console.log(`[DEBUG] Fetching ${token.symbol} balance for wallet ${walletAddress}`)
  
  const supportedChains = chainManager.getSupportedChains()
  console.log(`[DEBUG] Supported chains: ${supportedChains.join(', ')}`)
  
  const chainsWithToken = supportedChains.filter((chainId) => {
    const hasToken = getTokenAddress(token.symbol, chainId)
    console.log(`[DEBUG] Chain ${chainId} has ${token.symbol}: ${!!hasToken}`)
    return hasToken
  })
  console.log(`[DEBUG] Chains with ${token.symbol}: ${chainsWithToken.join(', ')}`)

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

  console.log(`[DEBUG] Total ${token.symbol} balance: ${totalBalance.toString()}`)

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
  console.log(`[DEBUG] Fetching ${token.symbol} balance for wallet ${walletAddress} on chain ${chainId}`)
  
  const tokenAddress = getTokenAddress(token.symbol, chainId)
  if (!tokenAddress) {
    console.log(`[DEBUG] Token ${token.symbol} not supported on chain ${chainId}`)
    throw new Error(`${token.symbol} not supported on chain ${chainId}`)
  }

  const publicClient = chainManager.getPublicClient(chainId)

  // Handle native ETH balance
  if (token.symbol === 'ETH') {
    console.log(`[DEBUG] Fetching native ETH balance for ${walletAddress} on chain ${chainId}`)
    const balance = await publicClient.getBalance({
      address: walletAddress,
    })
    console.log(`[DEBUG] ETH balance on chain ${chainId}: ${balance.toString()}`)
    return balance
  }

  // Handle ERC20 token balance
  console.log(`[DEBUG] Fetching ERC20 ${token.symbol} balance at ${tokenAddress} for ${walletAddress} on chain ${chainId}`)
  const balance = await publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [walletAddress],
  })
  console.log(`[DEBUG] ${token.symbol} balance on chain ${chainId}: ${balance.toString()}`)
  return balance
}
