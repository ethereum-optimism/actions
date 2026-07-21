/**
 * Server-wallet (Privy) operation builders: pure factories that adapt the demo
 * backend's HTTP API + auth headers into the `EarnOperations` /
 * `BorrowOperations` shapes the providers consume.
 */

import type { Address } from 'viem'
import type { Asset } from '@eth-optimism/actions-sdk/react'
import { actionsApi } from '@/api/actionsApi'
import { borrowApi } from '@/api/borrowApi'
import type { EarnOperations } from '@/hooks/useLendProvider'
import type { BorrowOperations } from '@/hooks/useBorrowProvider'

export type AuthHeaders = { Authorization: string } | undefined

type PrivyAuthHeaders = {
  Authorization: string
  'privy-id-token': string
}

function requirePrivyAuthHeaders(headers: AuthHeaders): PrivyAuthHeaders {
  if (
    !headers ||
    !('privy-id-token' in headers) ||
    typeof headers['privy-id-token'] !== 'string'
  ) {
    throw new Error('Privy authentication headers are not available')
  }
  return headers
}

export function buildLendOperations(
  getAuthHeaders: () => Promise<AuthHeaders>,
): Pick<
  EarnOperations,
  | 'getTokenBalances'
  | 'getMarkets'
  | 'getPosition'
  | 'getPositions'
  | 'openPosition'
  | 'closePosition'
> {
  return {
    getTokenBalances: async () =>
      actionsApi.getWalletBalance(await getAuthHeaders()),
    getMarkets: async () => actionsApi.getMarkets(await getAuthHeaders()),
    getPosition: async (marketId) =>
      actionsApi.getPosition({ marketId }, await getAuthHeaders()),
    getPositions: async (params) =>
      actionsApi.getPositions(params, await getAuthHeaders()),
    openPosition: async (params) =>
      actionsApi.openLendPosition(params, await getAuthHeaders()),
    closePosition: async (params) =>
      actionsApi.closeLendPosition(params, await getAuthHeaders()),
  }
}

export function buildSwapOperations(
  getAuthHeaders: () => Promise<AuthHeaders>,
): Pick<
  EarnOperations,
  'executeSwap' | 'getConfiguredAssets' | 'getSwapMarkets' | 'getSwapQuote'
> {
  return {
    executeSwap: async (quote) => {
      const tokenInAddress = quote.assetIn.address[quote.chainId]
      const tokenOutAddress = quote.assetOut.address[quote.chainId]
      if (!tokenInAddress || !tokenOutAddress) {
        throw new Error('Token address not found for chain')
      }
      // Server wallet re-quotes server-side; pass the quote params for execution
      const result = await actionsApi.executeSwap(
        {
          amountIn: quote.amountIn,
          tokenInAddress: tokenInAddress as Address,
          tokenOutAddress: tokenOutAddress as Address,
          chainId: quote.chainId,
          provider: quote.provider,
        },
        await getAuthHeaders(),
      )
      return { blockExplorerUrl: result.blockExplorerUrls?.[0] }
    },
    getConfiguredAssets: async () =>
      actionsApi.getAssets(await getAuthHeaders()),
    getSwapMarkets: async () =>
      actionsApi.getSwapMarkets(undefined, await getAuthHeaders()),
    getSwapQuote: async (params) => {
      try {
        return await actionsApi.getSwapQuote(params, await getAuthHeaders())
      } catch {
        return null
      }
    },
  }
}

export function buildMintOperation(
  getAuthHeaders: () => Promise<AuthHeaders>,
  walletAddress: Address | null,
): EarnOperations['mintAsset'] {
  return async (asset: Asset) => {
    if (asset.metadata.symbol === 'ETH' && asset.type === 'native') {
      if (!walletAddress) throw new Error('Wallet address not available')
      const headers = requirePrivyAuthHeaders(await getAuthHeaders())
      await actionsApi.dripEthToWallet(headers)
      return
    }
    return actionsApi.mintDemoUsdcToWallet(await getAuthHeaders())
  }
}

export function buildBorrowOperations(
  getAuthHeaders: () => Promise<AuthHeaders>,
): BorrowOperations {
  // Fall back to {} so every borrow call sends a valid HeadersInit.
  const headers = async () => (await getAuthHeaders()) ?? {}
  return {
    getTokenBalances: async () =>
      actionsApi.getWalletBalance(await getAuthHeaders()),
    getMarkets: async () => borrowApi.getMarkets(await headers()),
    getPosition: async (walletAddress, marketId) =>
      borrowApi.getPosition(walletAddress, marketId, await headers()),
    getQuote: async (params) => borrowApi.getQuote(params, await headers()),
    openPosition: async (walletAddress, params) =>
      borrowApi.openPosition(walletAddress, params, await headers()),
    closePosition: async (walletAddress, params) =>
      borrowApi.closePosition(walletAddress, params, await headers()),
    depositCollateral: async (walletAddress, params) =>
      borrowApi.depositCollateral(walletAddress, params, await headers()),
    withdrawCollateral: async (walletAddress, params) =>
      borrowApi.withdrawCollateral(walletAddress, params, await headers()),
    repay: async (walletAddress, params) =>
      borrowApi.repay(walletAddress, params, await headers()),
  }
}
