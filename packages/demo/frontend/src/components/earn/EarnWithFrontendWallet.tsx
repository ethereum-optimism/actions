import { encodeFunctionData, type Address } from 'viem'
import type {
  LendMarketId,
  Wallet,
  SupportedChainId,
  Asset,
  ReactProviderTypes,
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
import { createActions } from '@eth-optimism/actions-sdk/react'
import { useMarketData } from '@/hooks/useMarketData'
import { createActionsConfig } from '@/config/actions'
import { actionsApi } from '@/api/actionsApi'

export interface EarnWithFrontendWalletProps {
  wallet: Wallet | null
  logout: () => Promise<void>
  selectedProvider: FrontendWalletProviderType
}

function useActions<T extends ReactProviderTypes>(hostedWalletProviderType: T) {
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
    async (asset: Asset): Promise<{ blockExplorerUrls?: string[] } | void> => {
      console.log('[EarnWithFrontendWallet] mintAsset called', {
        asset: asset.metadata.symbol,
        wallet: wallet?.address,
        selectedMarket: selectedMarket?.marketName,
      })

      const walletAddress = wallet!.address
      const chainId = selectedMarket?.marketId.chainId
      if (!chainId) {
        console.error('[EarnWithFrontendWallet] No market selected')
        throw new Error('No market selected')
      }

      // For WETH, use ETH faucet endpoint instead of minting token
      if (asset.metadata.symbol.includes('WETH')) {
        console.log('[EarnWithFrontendWallet] Using ETH faucet for WETH', {
          walletAddress,
        })
        await actionsApi.dripEthToWallet(walletAddress)
        return
      }

      const amountInDecimals = BigInt(
        Math.floor(parseFloat('100') * Math.pow(10, asset.metadata.decimals)),
      )
      const tokenAddress = asset.address[chainId as SupportedChainId]

      console.log('[EarnWithFrontendWallet] Mint details', {
        walletAddress,
        chainId,
        tokenAddress,
        amount: amountInDecimals.toString(),
        assetSymbol: asset.metadata.symbol,
      })

      if (!tokenAddress || tokenAddress === 'native') {
        console.error(
          `[EarnWithFrontendWallet] Asset ${asset.metadata.symbol} not available on chain ${chainId}`,
        )
        throw new Error(
          `Asset ${asset.metadata.symbol} not available on chain ${chainId}`,
        )
      }

      const calls = [
        {
          to: tokenAddress as Address,
          data: encodeFunctionData({
            abi: mintableErc20Abi,
            functionName: 'mint',
            args: [walletAddress, amountInDecimals],
          }),
          value: 0n,
        },
      ]

      console.log('[EarnWithFrontendWallet] Sending batch transaction', {
        calls,
      })
      const result = await wallet!.sendBatch(calls, chainId as SupportedChainId)
      console.log('[EarnWithFrontendWallet] Mint transaction sent', {
        result,
        resultType: typeof result,
        resultKeys: Object.keys(result),
        hasBlockExplorerUrl: 'blockExplorerUrl' in result,
        hasBlockExplorerUrls: 'blockExplorerUrls' in result,
        userOpHash: 'userOpHash' in result ? result.userOpHash : undefined,
        transactionHash:
          'transactionHash' in result ? result.transactionHash : undefined,
      })

      // Extract blockExplorerUrls from result
      if ('blockExplorerUrl' in result && result.blockExplorerUrl) {
        return { blockExplorerUrls: [result.blockExplorerUrl as string] }
      }
      if ('blockExplorerUrls' in result && result.blockExplorerUrls) {
        return { blockExplorerUrls: result.blockExplorerUrls as string[] }
      }
      return undefined
    },
    [wallet, selectedMarket],
  )

  // Lend operations - use primary wallet
  const openPosition = useCallback(
    async (positionParams: LendExecutePositionParams) => {
      console.log('[EarnWithFrontendWallet] openPosition called', {
        positionParams,
      })
      try {
        const result = await primaryWallet!.lend!.openPosition(positionParams)
        console.log('[EarnWithFrontendWallet] openPosition result', { result })
        return result
      } catch (error) {
        console.error('[EarnWithFrontendWallet] openPosition error', {
          error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          positionParams,
        })
        throw error
      }
    },
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
