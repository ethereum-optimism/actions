import { encodeFunctionData } from 'viem'
import { getTokenBySymbol } from '@eth-optimism/actions-sdk/react'
import type { LendMarketId, Wallet } from '@eth-optimism/actions-sdk/react'
import { mintableErc20Abi } from '@/abis/mintableErc20Abi'
import { baseSepolia } from '@eth-optimism/viem/chains'
import Earn from './Earn'
import {
  FRONTEND_HOSTED_WALLET_PROVIDER_CONFIGS,
  WALLET_PROVIDER_CONFIGS,
  type FrontendWalletProviderType,
} from '@/constants/walletProviders'
import { useBalanceOperations } from '@/hooks/useBalanceOperations'
import { useCallback } from 'react'
import type { LendExecutePositionParams } from '@/types/api'
import { useActions } from '@/hooks/useActions'

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
  const mintUSDC = useCallback(async () => {
    const walletAddress = wallet!.address
    const amountInDecimals = BigInt(Math.floor(parseFloat('100') * 1000000))
    const calls = [
      {
        to: getTokenBySymbol('USDC_DEMO')!.address[baseSepolia.id]!,
        data: encodeFunctionData({
          abi: mintableErc20Abi,
          functionName: 'mint',
          args: [walletAddress, amountInDecimals],
        }),
        value: 0n,
      },
    ]
    await wallet!.sendBatch(calls, baseSepolia.id)
  }, [wallet])
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
  const isReady = useCallback(() => !!wallet, [wallet])

  const {
    usdcBalance,
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
    mintUSDC,
    openPosition,
    closePosition,
    isReady,
  })

  return (
    <Earn
      ready={true}
      selectedProviderConfig={WALLET_PROVIDER_CONFIGS[selectedProvider]}
      walletAddress={wallet?.address || null}
      logout={logout}
      usdcBalance={usdcBalance}
      isLoadingBalance={isLoadingBalance}
      apy={apy}
      isLoadingApy={isLoadingApy}
      depositedAmount={depositedAmount}
      isLoadingPosition={isLoadingPosition}
      isInitialLoad={isInitialLoad}
      onMintUSDC={handleMintUSDC}
      onTransaction={handleTransaction}
    />
  )
}
