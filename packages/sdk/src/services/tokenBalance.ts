import type { Address } from 'viem'
import { erc20Abi, formatEther, formatUnits } from 'viem'

import { ETH } from '@/constants/assets.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type {
  Asset,
  BalanceFetchOptions,
  TokenBalance,
} from '@/types/asset.js'

/**
 * Fetch ETH balance across the requested chains (or all supported chains).
 * @param chainManager - The chain manager
 * @param walletAddress - The wallet address
 * @param options - Optional `chainIds` filter (caller-validated)
 * @returns Promise resolving to ETH balance
 */
export async function fetchETHBalance(
  chainManager: ChainManager,
  walletAddress: Address,
  options?: BalanceFetchOptions,
): Promise<TokenBalance> {
  const targetChains = options?.chainIds ?? chainManager.getSupportedChains()
  const chainBalancePromises = targetChains.map(async (chainId) => {
    const publicClient = chainManager.getPublicClient(chainId)
    const balanceRaw = await publicClient.getBalance({
      address: walletAddress,
    })
    return {
      chainId,
      balanceRaw,
      balance: parseFloat(formatEther(balanceRaw)),
    }
  })
  const chainResults = await Promise.all(chainBalancePromises)
  const totalBalanceRaw = chainResults.reduce(
    (total, { balanceRaw }) => total + balanceRaw,
    0n,
  )

  const chains: TokenBalance['chains'] = {}
  for (const { chainId, balance, balanceRaw } of chainResults) {
    chains[chainId] = { balance, balanceRaw }
  }

  return {
    asset: ETH,
    totalBalance: parseFloat(formatEther(totalBalanceRaw)),
    totalBalanceRaw,
    chains,
  }
}

/**
 * Fetch total balance for this asset across the requested chains (or all
 * supported chains). Chains where the asset has no configured address are
 * silently skipped, matching the unfiltered behavior.
 */
export async function fetchERC20Balance(
  chainManager: ChainManager,
  walletAddress: Address,
  asset: Asset,
  options?: BalanceFetchOptions,
): Promise<TokenBalance> {
  const targetChains = options?.chainIds ?? chainManager.getSupportedChains()
  const chainsWithToken = targetChains.filter(
    (chainId) => asset.address[chainId],
  )

  const chainBalancePromises = chainsWithToken.map(async (chainId) => {
    const balanceRaw = await fetchBalanceForChain(
      asset,
      chainId,
      walletAddress,
      chainManager,
    )
    return {
      chainId,
      balanceRaw,
      balance: parseFloat(formatUnits(balanceRaw, asset.metadata.decimals)),
    }
  })

  const chainResults = await Promise.all(chainBalancePromises)
  const totalBalanceRaw = chainResults.reduce(
    (total, { balanceRaw }) => total + balanceRaw,
    0n,
  )

  const chains: TokenBalance['chains'] = {}
  for (const { chainId, balance, balanceRaw } of chainResults) {
    chains[chainId] = { balance, balanceRaw }
  }

  return {
    asset,
    totalBalance: parseFloat(
      formatUnits(totalBalanceRaw, asset.metadata.decimals),
    ),
    totalBalanceRaw,
    chains,
  }
}

/**
 * Fetch balance for this asset on a specific chain
 */
async function fetchBalanceForChain(
  asset: Asset,
  chainId: SupportedChainId,
  walletAddress: Address,
  chainManager: ChainManager,
): Promise<bigint> {
  const tokenAddress = asset.address[chainId]
  if (!tokenAddress) {
    throw new Error(
      `${asset.metadata.symbol} not supported on chain ${chainId}`,
    )
  }

  const publicClient = chainManager.getPublicClient(chainId)

  // Handle native ETH balance
  if (asset.type === 'native' || tokenAddress === 'native') {
    return publicClient.getBalance({ address: walletAddress })
  }

  return publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [walletAddress],
  })
}
