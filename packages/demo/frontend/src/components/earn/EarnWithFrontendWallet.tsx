import { encodeFunctionData, type Address } from 'viem'
import { baseSepolia, optimismSepolia } from 'viem/chains'
import type {
  LendMarketId,
  Wallet,
  SupportedChainId,
  Asset,
} from '@eth-optimism/actions-sdk/react'
import { mintableErc20Abi } from '@/abis/mintableErc20Abi'
import Earn from './Earn'
import {
  FRONTEND_HOSTED_WALLET_PROVIDER_CONFIGS,
  WALLET_PROVIDER_CONFIGS,
  type FrontendWalletProviderType,
} from '@/constants/walletProviders'
import { useWalletBalance } from '@/hooks/useWalletBalance'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { LendExecutePositionParams } from '@/types/api'
import { convertLendMarketToMarketInfo } from '@/utils/marketConversion'
import {
  createActions,
  type ReactActionsConfig,
  type ReactProviderTypes,
} from '@eth-optimism/actions-sdk/react'
import { env } from '@/envVars'
import { useMarketData } from '@/hooks/useMarketData'

export interface EarnWithFrontendWalletProps {
  wallet: Wallet | null
  logout: () => Promise<void>
  selectedProvider: FrontendWalletProviderType
}

// Helper to create Actions config matching backend structure
function createActionsConfig<T extends ReactProviderTypes>(
  hostedWalletProviderType: T,
): ReactActionsConfig<T> {
  return {
    wallet: {
      hostedWalletConfig: {
        provider: {
          type: hostedWalletProviderType,
        },
      },
      smartWalletConfig: {
        provider: {
          type: 'default',
          attributionSuffix: 'actions',
        },
      },
    },
    lend: {
      morpho: {
        marketAllowlist: [],
      },
      aave: {
        marketAllowlist: [],
      },
    },
    chains: [
      {
        chainId: baseSepolia.id,
        rpcUrls: env.VITE_BASE_SEPOLIA_RPC_URL
          ? [env.VITE_BASE_SEPOLIA_RPC_URL]
          : undefined,
        bundler: env.VITE_BASE_SEPOLIA_BUNDER_URL
          ? {
              type: 'simple',
              url: env.VITE_BASE_SEPOLIA_BUNDER_URL,
            }
          : undefined,
      },
      {
        chainId: optimismSepolia.id,
      },
    ],
  } as unknown as ReactActionsConfig<T>
}

function useActions<T extends ReactProviderTypes>(
  hostedWalletProviderType: T,
) {
  const config = useMemo(
    () => createActionsConfig(hostedWalletProviderType),
    [hostedWalletProviderType],
  )
  return useMemo(() => createActions(config), [config])
}

/**
 * Container component that handles frontend wallet provider logic
 * and passes data/callbacks to the presentational Earn component
 */
export function EarnWithFrontendWallet({
  wallet,
  selectedProvider,
  logout,
}: EarnWithFrontendWalletProps) {
  const hasLoadedMarkets = useRef(false)
  const hostedWalletProviderType =
    FRONTEND_HOSTED_WALLET_PROVIDER_CONFIGS[selectedProvider]

  // Single Actions instance supporting both Morpho and Aave
  const actions = useActions(hostedWalletProviderType)

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

  // Primary wallet - ALWAYS use for balance operations to prevent flickering
  const primaryWallet = wallet

  // Balance operations - ALWAYS use primary wallet only
  const getTokenBalances = useCallback(
    async () => primaryWallet!.getBalance(),
    [primaryWallet],
  )

  // Market fetching - get from all configured providers
  const getMarkets = useCallback(async () => {
    return await actions.lend.getMarkets()
  }, [actions])

  // Position operations - use primary wallet
  const getPosition = useCallback(
    async (marketId: LendMarketId) =>
      primaryWallet!.lend!.getPosition({ marketId }),
    [primaryWallet],
  )
  const mintAsset = useCallback(
    async (asset: Asset) => {
      const walletAddress = wallet!.address
      const chainId = selectedMarket?.marketId.chainId
      if (!chainId) {
        throw new Error('No market selected')
      }
      const amountInDecimals = BigInt(
        Math.floor(parseFloat('100') * Math.pow(10, asset.metadata.decimals)),
      )
      const tokenAddress = asset.address[chainId as SupportedChainId]
      if (!tokenAddress) {
        throw new Error(
          `Asset ${asset.metadata.symbol} not available on chain ${chainId}`,
        )
      }
      const calls = [
        {
          to: tokenAddress,
          data: encodeFunctionData({
            abi: mintableErc20Abi,
            functionName: 'mint',
            args: [walletAddress, amountInDecimals],
          }),
          value: 0n,
        },
      ]
      await wallet!.sendBatch(calls, chainId as SupportedChainId)
    },
    [wallet, selectedMarket],
  )

  // Lend operations - use primary wallet
  const openPosition = useCallback(
    async (positionParams: LendExecutePositionParams) =>
      primaryWallet!.lend!.openPosition(positionParams),
    [primaryWallet],
  )
  const closePosition = useCallback(
    async (positionParams: LendExecutePositionParams) =>
      primaryWallet!.lend!.closePosition(positionParams),
    [primaryWallet],
  )
  const ready = !!wallet
  const isReady = useCallback(() => ready, [ready])

  // Fetch available markets on mount
  useEffect(() => {
    const fetchMarkets = async () => {
      // Prevent duplicate fetches (e.g., from React Strict Mode)
      if (hasLoadedMarkets.current) {
        console.log('[EarnWithFrontendWallet] Markets already loaded, skipping')
        return
      }
      hasLoadedMarkets.current = true

      try {
        console.log('[EarnWithFrontendWallet] Fetching markets...')
        setIsLoadingMarkets(true)
        const rawMarkets = await getMarkets()
        const marketInfoList = rawMarkets.map(convertLendMarketToMarketInfo)
        setMarkets(marketInfoList)

        // Fetch positions for all markets in parallel
        console.log(
          '[EarnWithFrontendWallet] Fetching positions for all markets...',
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
              asset: market.asset,
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
          '[EarnWithFrontendWallet] Loaded positions for',
          initialPositions.length,
          'markets with deposits',
        )

        // Set default selected market (first one, preferably Gauntlet/USDC)
        if (marketInfoList.length > 0 && !selectedMarket) {
          const defaultMarket =
            marketInfoList.find((m) => m.name === 'Gauntlet') ||
            marketInfoList[0]
          console.log(
            '[EarnWithFrontendWallet] Setting default market:',
            defaultMarket.name,
            'asset:',
            defaultMarket.asset.metadata.symbol,
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
            asset: defaultMarket.asset,
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
  }, [
    ready,
    getMarkets,
    getPosition,
    setMarkets,
    setMarketPositions,
    selectedMarket,
    setSelectedMarket,
    setIsLoadingMarkets,
  ])

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
    selectedAsset: selectedMarket?.asset,
  })

  // Update marketPositions when selected market's position changes
  useEffect(() => {
    if (!selectedMarket) return

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
      selectedProviderConfig={WALLET_PROVIDER_CONFIGS[selectedProvider]}
      walletAddress={wallet?.address || null}
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
      onMarketChange={setSelectedMarket}
      markets={markets}
      selectedMarket={selectedMarket}
      onMarketSelect={handleMarketSelect}
      isLoadingMarkets={isLoadingMarkets}
      marketPositions={marketPositions}
    />
  )
}
