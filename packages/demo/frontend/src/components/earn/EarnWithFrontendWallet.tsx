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
import { useCallback, useState } from 'react'
import type { LendExecutePositionParams } from '@/types/api'
import { useActions } from '@/hooks/useActions'
import type { MarketPosition } from '@/types/market'

export interface EarnWithFrontendWalletProps {
  wallet: Wallet | null
  logout: () => Promise<void>
  selectedProvider: FrontendWalletProviderType
}

export function EarnWithFrontendWallet({
  wallet,
  selectedProvider,
  logout,
}: EarnWithFrontendWalletProps) {
  const hostedWalletProviderType =
    FRONTEND_HOSTED_WALLET_PROVIDER_CONFIGS[selectedProvider]
  const { actions } = useActions({ hostedWalletProviderType })
  const [selectedMarket, setSelectedMarket] = useState<MarketPosition | null>(
    null,
  )

  // Memoize operation functions to prevent infinite loops
  const getTokenBalances = useCallback(
    async () => wallet!.getBalance(),
    [wallet],
  )
  const getMarkets = useCallback(
    async () => actions.lend.getMarkets(),
    [actions],
  )
  const getPosition = useCallback(
    async (marketId: LendMarketId) => wallet!.lend!.getPosition({ marketId }),
    [wallet],
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

  const openPosition = useCallback(
    async (positionParams: LendExecutePositionParams) =>
      wallet!.lend!.openPosition(positionParams),
    [wallet],
  )
  const closePosition = useCallback(
    async (positionParams: LendExecutePositionParams) =>
      wallet!.lend!.closePosition(positionParams),
    [wallet],
  )
  const ready = !!wallet
  const isReady = useCallback(() => ready, [ready])

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
    />
  )
}
