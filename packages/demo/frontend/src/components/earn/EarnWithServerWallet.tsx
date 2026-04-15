import { useState, useCallback, useEffect, useMemo } from 'react'
import type { Address } from 'viem'
import type { Asset } from '@eth-optimism/actions-sdk/react'
import Earn from './Earn'
import type { WalletProviderConfig } from '@/constants/walletProviders'
import { actionsApi } from '@/api/actionsApi'
import type { EarnOperations } from '@/hooks/useLendProvider'

type AuthHeaders = { Authorization: string } | undefined

function buildLendOperations(
  getAuthHeaders: () => Promise<AuthHeaders>,
): Pick<
  EarnOperations,
  | 'getTokenBalances'
  | 'getMarkets'
  | 'getPosition'
  | 'openPosition'
  | 'closePosition'
> {
  return {
    getTokenBalances: async () =>
      actionsApi.getWalletBalance(await getAuthHeaders()),
    getMarkets: async () => actionsApi.getMarkets(await getAuthHeaders()),
    getPosition: async (marketId) =>
      actionsApi.getPosition({ marketId }, await getAuthHeaders()),
    openPosition: async (params) =>
      actionsApi.openLendPosition(params, await getAuthHeaders()),
    closePosition: async (params) =>
      actionsApi.closeLendPosition(params, await getAuthHeaders()),
  }
}

function buildSwapOperations(
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

function buildMintOperation(
  getAuthHeaders: () => Promise<AuthHeaders>,
  walletAddress: Address | null,
): EarnOperations['mintAsset'] {
  return async (asset: Asset) => {
    if (asset.metadata.symbol === 'ETH' && asset.type === 'native') {
      if (!walletAddress) throw new Error('Wallet address not available')
      await actionsApi.dripEthToWallet(walletAddress)
      return
    }
    return actionsApi.mintDemoUsdcToWallet(await getAuthHeaders())
  }
}

interface EarnWithServerWalletProps {
  ready: boolean
  logout: () => Promise<void>
  getAuthHeaders: () => Promise<AuthHeaders>
  selectedProvider: WalletProviderConfig
}

export function EarnWithServerWallet({
  getAuthHeaders,
  logout,
  selectedProvider,
  ready,
}: EarnWithServerWalletProps) {
  const [walletAddress, setWalletAddress] = useState<Address | null>(null)

  const operations = useMemo<EarnOperations>(
    () => ({
      ...buildLendOperations(getAuthHeaders),
      ...buildSwapOperations(getAuthHeaders),
      mintAsset: buildMintOperation(getAuthHeaders, walletAddress),
    }),
    [getAuthHeaders, walletAddress],
  )

  const fetchWalletAddress = useCallback(async () => {
    const { address } = await actionsApi.getWallet(await getAuthHeaders())
    setWalletAddress(address)
  }, [getAuthHeaders])

  useEffect(() => {
    if (ready) fetchWalletAddress()
  }, [ready, fetchWalletAddress])

  return (
    <Earn
      operations={operations}
      ready={ready}
      logout={logout}
      walletAddress={walletAddress}
      providerConfig={selectedProvider}
      logPrefix="[EarnWithServerWallet]"
    />
  )
}
