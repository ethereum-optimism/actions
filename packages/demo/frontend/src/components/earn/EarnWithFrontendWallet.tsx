import { encodeFunctionData } from 'viem'
import { getTokenBySymbol } from '@eth-optimism/actions-sdk/react'
import type {
  LendMarketId,
  Wallet,
  SupportedChainId,
} from '@eth-optimism/actions-sdk/react'
import { mintableErc20Abi } from '@/abis/mintableErc20Abi'
import Earn from './Earn'
import {
  FRONTEND_HOSTED_WALLET_PROVIDER_CONFIGS,
  WALLET_PROVIDER_CONFIGS,
  type FrontendWalletProviderType,
} from '@/constants/walletProviders'
import { useBalanceOperations } from '@/hooks/useBalanceOperations'
import { useCallback, useState, useEffect, useMemo } from 'react'
import type { LendExecutePositionParams } from '@/types/api'
import type { MarketPosition } from '@/types/market'
import type { MarketInfo } from './MarketSelector'
import type { LendMarket } from '@eth-optimism/actions-sdk'
import { baseSepolia, optimismSepolia } from 'viem/chains'
import {
  createActions,
  type ReactActionsConfig,
  type ReactProviderTypes,
} from '@eth-optimism/actions-sdk/react'
import { env } from '@/envVars'

export interface EarnWithFrontendWalletProps {
  wallet: Wallet | null
  logout: () => Promise<void>
  selectedProvider: FrontendWalletProviderType
}

// Helper to create Actions config for a specific lend provider
function createActionsConfig<T extends ReactProviderTypes>(
  hostedWalletProviderType: T,
  lendProvider: 'morpho' | 'aave',
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
      provider: lendProvider,
      marketAllowlist: [],
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

function useActionsMorpho<T extends ReactProviderTypes>(
  hostedWalletProviderType: T,
) {
  const config = useMemo(
    () => createActionsConfig(hostedWalletProviderType, 'morpho'),
    [hostedWalletProviderType],
  )
  return useMemo(() => createActions(config), [config])
}

function useActionsAave<T extends ReactProviderTypes>(
  hostedWalletProviderType: T,
) {
  const config = useMemo(
    () => createActionsConfig(hostedWalletProviderType, 'aave'),
    [hostedWalletProviderType],
  )
  return useMemo(() => createActions(config), [config])
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
    assetSymbol,
    assetLogo,
    apy: market.apy.total,
    isLoadingApy: false,
    marketId: market.marketId,
    provider: market.name.toLowerCase().includes('aave') ? 'aave' : 'morpho',
  }
}

export function EarnWithFrontendWallet({
  wallet,
  selectedProvider,
  logout,
}: EarnWithFrontendWalletProps) {
  const hostedWalletProviderType =
    FRONTEND_HOSTED_WALLET_PROVIDER_CONFIGS[selectedProvider]

  // Primary Actions instance (Morpho) - used for balance operations
  const morphoActions = useActionsMorpho(hostedWalletProviderType)

  // Secondary Actions instance (Aave) - only used for Aave lend operations
  const aaveActions = useActionsAave(hostedWalletProviderType)

  const [selectedMarket, setSelectedMarket] = useState<MarketPosition | null>(
    null,
  )
  const [markets, setMarkets] = useState<MarketInfo[]>([])
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(true)
  const [marketPositions, setMarketPositions] = useState<MarketPosition[]>([])

  // Primary wallet - ALWAYS use for balance operations to prevent flickering
  const primaryWallet = wallet

  // Balance operations - ALWAYS use primary wallet only
  const getTokenBalances = useCallback(
    async () => primaryWallet!.getBalance(),
    [primaryWallet],
  )

  // Market fetching - get from both providers
  const getMarkets = useCallback(async () => {
    const [morphoMarkets, aaveMarkets] = await Promise.all([
      morphoActions.lend.getMarkets(),
      aaveActions.lend.getMarkets(),
    ])
    return [...morphoMarkets, ...aaveMarkets]
  }, [morphoActions, aaveActions])

  // Position operations - use primary wallet
  const getPosition = useCallback(
    async (marketId: LendMarketId) =>
      primaryWallet!.lend!.getPosition({ marketId }),
    [primaryWallet],
  )
  const mintAsset = useCallback(
    async (assetSymbol: string, chainId: number) => {
      const walletAddress = wallet!.address
      // USDC uses 6 decimals, WETH uses 18 decimals
      const decimals = assetSymbol.includes('USDC') ? 6 : 18
      const amountInDecimals = BigInt(
        Math.floor(parseFloat('100') * Math.pow(10, decimals)),
      )
      const token = getTokenBySymbol(assetSymbol)
      if (!token) {
        throw new Error(`Token ${assetSymbol} not found`)
      }
      const tokenAddress = token.address[chainId as SupportedChainId]
      if (!tokenAddress) {
        throw new Error(
          `Token ${assetSymbol} not available on chain ${chainId}`,
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
    [wallet],
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
      try {
        setIsLoadingMarkets(true)
        const rawMarkets = await getMarkets()
        const marketInfoList = rawMarkets.map(convertLendMarketToMarketInfo)
        setMarkets(marketInfoList)

        // Set default selected market (first one, preferably Gauntlet/USDC)
        if (marketInfoList.length > 0 && !selectedMarket) {
          const defaultMarket =
            marketInfoList.find((m) => m.name === 'Gauntlet') ||
            marketInfoList[0]
          setSelectedMarket({
            marketName: defaultMarket.name,
            marketLogo: defaultMarket.logo,
            networkName: defaultMarket.networkName,
            networkLogo: defaultMarket.networkLogo,
            assetSymbol: defaultMarket.assetSymbol,
            assetLogo: defaultMarket.assetLogo,
            apy: defaultMarket.apy,
            depositedAmount: null,
            isLoadingApy: false,
            isLoadingPosition: false,
            marketId: defaultMarket.marketId,
            provider: defaultMarket.provider,
          })
        }
      } catch (error) {
        console.error('Error fetching markets:', error)
      } finally {
        setIsLoadingMarkets(false)
      }
    }

    if (ready) {
      fetchMarkets()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, getMarkets])

  const {
    assetBalance,
    isLoadingBalance,
    handleMintUSDC,
    isLoadingApy,
    apy,
    isInitialLoad,
    isLoadingPosition,
    depositedAmount,
    handleTransaction,
  } = useBalanceOperations({
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
  })

  const handleMarketSelect = useCallback((market: MarketInfo) => {
    setSelectedMarket({
      marketName: market.name,
      marketLogo: market.logo,
      networkName: market.networkName,
      networkLogo: market.networkLogo,
      assetSymbol: market.assetSymbol,
      assetLogo: market.assetLogo,
      apy: market.apy,
      depositedAmount: null,
      isLoadingApy: false,
      isLoadingPosition: false,
      marketId: market.marketId,
      provider: market.provider,
    })
  }, [])

  // Update marketPositions when selected market's position changes
  useEffect(() => {
    if (!selectedMarket || !depositedAmount || !apy) return

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

      if (existingIndex >= 0) {
        // Update existing market
        const newPositions = [...prev]
        newPositions[existingIndex] = updatedMarket
        return newPositions
      } else {
        // Add new market
        return [...prev, updatedMarket]
      }
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
      onMintUSDC={handleMintUSDC}
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
