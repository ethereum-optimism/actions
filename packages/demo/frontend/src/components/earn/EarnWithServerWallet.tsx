import { useState, useCallback, useEffect, useRef } from 'react'
import { type Address } from 'viem'
import Earn from './Earn'
import type { WalletProviderConfig } from '@/constants/walletProviders'
import {
  type LendMarketId,
  type SupportedChainId,
} from '@eth-optimism/actions-sdk/react'
import { useWalletBalance } from '@/hooks/useWalletBalance'
import { useMarketData } from '@/hooks/useMarketData'
import type { LendExecutePositionParams } from '@/types/api'
import { actionsApi } from '@/api/actionsApi'
import type { MarketInfo } from './MarketSelector'
import type { LendMarket } from '@eth-optimism/actions-sdk'
import { baseSepolia, optimismSepolia } from 'viem/chains'

interface EarnWithServerWalletProps {
  ready: boolean
  logout: () => Promise<void>
  userId?: string
  embeddedWalletExists: boolean
  getAuthHeaders: () => Promise<
    | {
        Authorization: string
      }
    | undefined
  >
  userEmailAddress?: string
  selectedProvider: WalletProviderConfig
}

const convertLendMarketToMarketInfo = (market: LendMarket): MarketInfo => {
  const chainId = market.marketId.chainId

  // Determine network info
  let networkName = 'Unknown'
  let networkLogo = '/base-logo.svg'
  if (chainId === baseSepolia.id) {
    networkName = 'Base Sepolia'
    networkLogo = '/base-logo.svg'
  } else if (chainId === optimismSepolia.id) {
    networkName = 'Optimism Sepolia'
    networkLogo = '/OP.svg'
  }

  // Determine provider logo
  const providerLogo =
    market.name.toLowerCase().includes('gauntlet') ||
    market.name.toLowerCase().includes('morpho')
      ? '/morpho-logo.svg'
      : '/aave-logo-dark.svg'

  // Determine asset info
  const assetSymbol = market.asset.metadata.symbol
  const assetLogo = assetSymbol.includes('USDC')
    ? '/usd-coin-usdc-logo.svg'
    : assetSymbol.includes('WETH')
      ? '/eth.svg'
      : '/usd-coin-usdc-logo.svg'

  // Extract simple market name
  const marketName = market.name.split(' ')[0] || market.name

  return {
    name: marketName,
    logo: providerLogo,
    networkName,
    networkLogo,
    assetSymbol, // Keep original symbol (e.g., 'USDC_DEMO') for internal matching
    assetLogo,
    apy: market.apy.total,
    isLoadingApy: false,
    marketId: market.marketId,
    provider: market.name.toLowerCase().includes('aave') ? 'aave' : 'morpho',
  }
}

/**
 * Container component that handles Privy wallet provider logic
 * and passes data/callbacks to the presentational EarnContent component
 */
export function EarnWithServerWallet({
  getAuthHeaders,
  logout,
  selectedProvider,
  ready,
}: EarnWithServerWalletProps) {
  const [walletAddress, setWalletAddress] = useState<Address | null>(null)
  const hasLoadedMarkets = useRef(false)

  // Memoize operation functions to prevent infinite loops
  const getTokenBalances = useCallback(async () => {
    const headers = await getAuthHeaders()
    return actionsApi.getWalletBalance(headers)
  }, [getAuthHeaders])

  const getMarkets = useCallback(async () => {
    const headers = await getAuthHeaders()
    return actionsApi.getMarkets(headers)
  }, [getAuthHeaders])

  const getPosition = useCallback(
    async (marketId: LendMarketId) => {
      const headers = await getAuthHeaders()
      return actionsApi.getPosition({ marketId }, headers)
    },
    [getAuthHeaders],
  )

  const mintAsset = useCallback(
    async (assetSymbol: string) => {
      const headers = await getAuthHeaders()

      if (assetSymbol.includes('WETH')) {
        // Use faucet for WETH on OP Sepolia
        if (!walletAddress) {
          throw new Error('Wallet address not available')
        }
        await actionsApi.dripEthToWallet(walletAddress)
        // Note: dripEthToWallet doesn't return blockExplorerUrls yet
        return
      } else {
        // Use USDC minting for other assets
        return await actionsApi.mintDemoUsdcToWallet(headers)
      }
    },
    [getAuthHeaders, walletAddress],
  )

  const openPosition = useCallback(
    async (positionParams: LendExecutePositionParams) => {
      const headers = await getAuthHeaders()
      return actionsApi.openLendPosition(positionParams, headers)
    },
    [getAuthHeaders],
  )

  const closePosition = useCallback(
    async (positionParams: LendExecutePositionParams) => {
      const headers = await getAuthHeaders()
      return actionsApi.closeLendPosition(positionParams, headers)
    },
    [getAuthHeaders],
  )

  const isReady = useCallback(() => ready, [ready])

  // Market selection state management
  const {
    markets,
    setMarkets,
    marketPositions,
    setMarketPositions,
    selectedMarket,
    setSelectedMarket,
    isLoadingMarkets,
    setIsLoadingMarkets,
    handleMarketSelect,
  } = useMarketData()

  // Fetch available markets on mount
  useEffect(() => {
    const fetchMarkets = async () => {
      // Prevent duplicate fetches (e.g., from React Strict Mode)
      if (hasLoadedMarkets.current) {
        console.log('[EarnWithServerWallet] Markets already loaded, skipping')
        return
      }
      hasLoadedMarkets.current = true

      try {
        console.log('[EarnWithServerWallet] Fetching markets...')
        setIsLoadingMarkets(true)
        const rawMarkets = await getMarkets()
        const marketInfoList = rawMarkets.map(convertLendMarketToMarketInfo)
        setMarkets(marketInfoList)

        // Fetch positions for all markets in parallel
        console.log(
          '[EarnWithServerWallet] Fetching positions for all markets...',
        )
        const positionPromises = marketInfoList.map(async (market) => {
          try {
            const position = await getPosition({
              address: market.marketId.address as Address,
              chainId: market.marketId.chainId as SupportedChainId,
            })
            return {
              market,
              position,
            }
          } catch (error) {
            console.error(
              `Error fetching position for market ${market.name}:`,
              error,
            )
            return null
          }
        })

        const positionResults = await Promise.all(positionPromises)

        // Build initial market positions array with all markets that have deposits
        const initialPositions = positionResults
          .filter((result) => {
            if (!result) return false
            const hasDeposit = result.position.balance > 0n
            return hasDeposit
          })
          .map((result) => {
            const { market, position } = result!
            return {
              marketName: market.name,
              marketLogo: market.logo,
              networkName: market.networkName,
              networkLogo: market.networkLogo,
              assetSymbol: market.assetSymbol,
              assetLogo: market.assetLogo,
              apy: market.apy,
              depositedAmount: position.balanceFormatted,
              isLoadingApy: false,
              isLoadingPosition: false,
              marketId: market.marketId,
              provider: market.provider,
            }
          })

        setMarketPositions(initialPositions)
        console.log(
          '[EarnWithServerWallet] Loaded positions for',
          initialPositions.length,
          'markets with deposits',
        )

        // Set default selected market (first one, preferably Gauntlet/USDC)
        if (marketInfoList.length > 0 && !selectedMarket) {
          const defaultMarket =
            marketInfoList.find((m) => m.name === 'Gauntlet') ||
            marketInfoList[0]
          console.log(
            '[EarnWithServerWallet] Setting default market:',
            defaultMarket.name,
            'assetSymbol:',
            defaultMarket.assetSymbol,
          )

          // Find if we already fetched position for this market
          const defaultPosition = positionResults.find(
            (r) =>
              r?.market.marketId.address === defaultMarket.marketId.address,
          )

          setSelectedMarket({
            marketName: defaultMarket.name,
            marketLogo: defaultMarket.logo,
            networkName: defaultMarket.networkName,
            networkLogo: defaultMarket.networkLogo,
            assetSymbol: defaultMarket.assetSymbol,
            assetLogo: defaultMarket.assetLogo,
            apy: defaultMarket.apy,
            depositedAmount: defaultPosition?.position.balanceFormatted || null,
            isLoadingApy: false,
            isLoadingPosition: false,
            marketId: defaultMarket.marketId,
            provider: defaultMarket.provider,
          })
        }
      } catch (error) {
        console.error('Error fetching markets:', error)
        hasLoadedMarkets.current = false // Reset on error to allow retry
      } finally {
        setIsLoadingMarkets(false)
      }
    }

    if (ready) {
      fetchMarkets()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  const {
    assetBalance,
    isLoadingBalance,
    handleMintAsset,
    isLoadingApy,
    apy,
    isInitialLoad,
    isLoadingPosition,
    depositedAmount,
    handleTransaction,
  } = useWalletBalance({
    getTokenBalances,
    getMarkets,
    getPosition,
    mintAsset,
    openPosition,
    closePosition,
    isReady,
    selectedMarketId: selectedMarket?.marketId as
      | LendMarketId
      | null
      | undefined,
    selectedAssetSymbol: selectedMarket?.assetSymbol,
    selectedMarketApy: selectedMarket?.apy,
  })

  const fetchWalletAddress = useCallback(async () => {
    const headers = await getAuthHeaders()
    const { address } = await actionsApi.getWallet(headers)
    setWalletAddress(address)
  }, [getAuthHeaders])

  useEffect(() => {
    if (ready) {
      fetchWalletAddress()
    }
  }, [ready, fetchWalletAddress])

  // Update marketPositions when selected market's position changes
  useEffect(() => {
    if (!selectedMarket) return

    // Only update if we have actual position data (not initial/loading state)
    if (depositedAmount === null) return

    setMarketPositions((prev) => {
      const existingIndex = prev.findIndex(
        (p) =>
          p.marketId.address.toLowerCase() ===
            selectedMarket.marketId.address.toLowerCase() &&
          p.marketId.chainId === selectedMarket.marketId.chainId,
      )

      const updatedMarket = {
        ...selectedMarket,
        depositedAmount,
        apy,
      }

      // Check if this is a meaningful update
      const hasDeposit =
        depositedAmount &&
        depositedAmount !== '0' &&
        depositedAmount !== '0.00' &&
        parseFloat(depositedAmount) > 0

      if (existingIndex >= 0) {
        const existing = prev[existingIndex]
        // Only update if the deposited amount or APY actually changed
        if (
          existing.depositedAmount === depositedAmount &&
          existing.apy === apy
        ) {
          return prev // No change, return same reference to prevent re-render
        }

        // If deposited amount is now 0, remove from list
        if (!hasDeposit) {
          return prev.filter((_, i) => i !== existingIndex)
        }

        // Update existing market
        const newPositions = [...prev]
        newPositions[existingIndex] = updatedMarket
        return newPositions
      } else if (hasDeposit) {
        // Only add new market if it has a deposit
        return [...prev, updatedMarket]
      }

      return prev // No change needed
    })
  }, [selectedMarket, depositedAmount, apy])

  return (
    <Earn
      ready={ready}
      selectedProviderConfig={selectedProvider}
      walletAddress={walletAddress}
      logout={logout}
      usdcBalance={assetBalance}
      isLoadingBalance={isLoadingBalance}
      apy={apy}
      isLoadingApy={isLoadingApy}
      depositedAmount={depositedAmount}
      isLoadingPosition={isLoadingPosition}
      isInitialLoad={isInitialLoad}
      onMintUSDC={handleMintAsset}
      onTransaction={handleTransaction}
      markets={markets}
      selectedMarket={selectedMarket}
      onMarketSelect={handleMarketSelect}
      isLoadingMarkets={isLoadingMarkets}
      marketPositions={marketPositions}
    />
  )
}
