import { useState, useCallback, useEffect } from 'react'
import { type Address } from 'viem'
import Earn from './Earn'
import type { WalletProviderConfig } from '@/constants/walletProviders'
import { type LendMarketId } from '@eth-optimism/actions-sdk/react'
import { useBalanceOperations } from '@/hooks/useBalanceOperations'
import type { LendExecutePositionParams } from '@/types/api'
import { actionsApi } from '@/api/actionsApi'

interface EarnWithServerWalletProps {
  ready: boolean
  logout: () => Promise<void>
  userId?: string
  getAuthHeaders: () => Promise<
    | {
        Authorization: string
      }
    | undefined
  >
  userEmailAddress?: string
  selectedProvider: WalletProviderConfig
}

/**
 * Container component that handles Privy wallet provider logic
 * and passes data/callbacks to the presentational EarnContent component
 */
export function EarnWithServerWallet({
  ready,
  userId,
  getAuthHeaders,
  logout,
  selectedProvider,
}: EarnWithServerWalletProps) {
  // State for wallet balance and lend position
  const [walletAddress, setWalletAddress] = useState<Address | null>(null)

  // Memoize operation functions to prevent infinite loops
  const getTokenBalances = useCallback(async () => {
    const headers = await getAuthHeaders()
    return actionsApi.getWalletBalanceV1(headers)
  }, [getAuthHeaders])

  const getMarkets = useCallback(async () => {
    const headers = await getAuthHeaders()
    return actionsApi.getMarketsV1(headers)
  }, [getAuthHeaders])

  const getPosition = useCallback(
    async (marketId: LendMarketId) => {
      const headers = await getAuthHeaders()
      return actionsApi.getPositionV1({ marketId }, headers)
    },
    [getAuthHeaders],
  )

  const mintUSDC = useCallback(async () => {
    const headers = await getAuthHeaders()
    await actionsApi.fundWallet(userId!, headers)
  }, [getAuthHeaders, userId])

  const openPosition = useCallback(
    async (positionParams: LendExecutePositionParams) => {
      const headers = await getAuthHeaders()
      return actionsApi.openLendPositionV1(positionParams, headers)
    },
    [getAuthHeaders],
  )

  const closePosition = useCallback(
    async (positionParams: LendExecutePositionParams) => {
      const headers = await getAuthHeaders()
      return actionsApi.closeLendPositionV1(positionParams, headers)
    },
    [getAuthHeaders],
  )

  const isReady = useCallback(() => !!userId, [userId])

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

  const fetchWalletAddress = useCallback(
    async (userId: string) => {
      const headers = await getAuthHeaders()
      const { address } = await actionsApi.getWallet(userId, headers)
      setWalletAddress(address)
    },
    [getAuthHeaders],
  )

  useEffect(() => {
    if (userId) {
      fetchWalletAddress(userId)
    }
  }, [userId, fetchWalletAddress])

  return (
    <Earn
      ready={ready}
      selectedProviderConfig={selectedProvider}
      walletAddress={walletAddress}
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
