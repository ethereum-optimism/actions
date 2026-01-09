import { encodeFunctionData, type Address } from 'viem'
import type {
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
import { useMemo } from 'react'
import { createActions } from '@eth-optimism/actions-sdk/react'
import { createActionsConfig } from '@/config/actions'
import { actionsApi } from '@/api/actionsApi'
import { useEarnData, type EarnOperations } from '@/hooks/useEarnData'

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
  const hostedWalletProviderType =
    FRONTEND_HOSTED_WALLET_PROVIDER_CONFIGS[selectedProvider]

  // Single Actions instance supporting both Morpho and Aave
  const actions = useActions(hostedWalletProviderType)

  const ready = !!wallet

  // Create operations object for the shared hook
  const operations = useMemo<EarnOperations>(
    () => ({
      getTokenBalances: async () => wallet!.getBalance(),
      getMarkets: async () => actions.lend.getMarkets(),
      getPosition: async (marketId) => wallet!.lend!.getPosition({ marketId }),
      mintAsset: async (
        asset: Asset,
      ): Promise<{ blockExplorerUrls?: string[] } | void> => {
        const walletAddress = wallet!.address
        const chainId = asset.address
          ? Object.keys(asset.address).find(
              (key) => asset.address[key as unknown as SupportedChainId],
            )
          : undefined

        if (!chainId) {
          throw new Error('No chain available for asset')
        }

        // For WETH, use ETH faucet endpoint instead of minting token
        if (asset.metadata.symbol.includes('WETH')) {
          await actionsApi.dripEthToWallet(walletAddress)
          return
        }

        const amountInDecimals = BigInt(
          Math.floor(parseFloat('100') * Math.pow(10, asset.metadata.decimals)),
        )
        const tokenAddress =
          asset.address[parseInt(chainId) as SupportedChainId]

        if (!tokenAddress || tokenAddress === 'native') {
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

        const result = await wallet!.sendBatch(
          calls,
          parseInt(chainId) as SupportedChainId,
        )

        // Extract blockExplorerUrls from result
        if ('blockExplorerUrl' in result && result.blockExplorerUrl) {
          return { blockExplorerUrls: [result.blockExplorerUrl as string] }
        }
        if ('blockExplorerUrls' in result && result.blockExplorerUrls) {
          return { blockExplorerUrls: result.blockExplorerUrls as string[] }
        }
        return undefined
      },
      openPosition: async (params) => wallet!.lend!.openPosition(params),
      closePosition: async (params) => wallet!.lend!.closePosition(params),
    }),
    [wallet, actions],
  )

  const {
    markets,
    selectedMarket,
    setSelectedMarket,
    handleMarketSelect,
    isLoadingMarkets,
    marketPositions,
    assetBalance,
    isLoadingBalance,
    apy,
    isLoadingApy,
    depositedAmount,
    isLoadingPosition,
    isInitialLoad,
    handleMintAsset,
    handleTransaction,
  } = useEarnData({
    operations,
    ready,
    logPrefix: '[EarnWithFrontendWallet]',
  })

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
