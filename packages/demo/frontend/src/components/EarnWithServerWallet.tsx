import { useState, useCallback, useEffect, useRef } from 'react'
import type { Address } from 'viem'
import { useLoggedActionsApi } from '../hooks/useLoggedActionsApi'
import Earn from './Earn'
import { actionsApi } from '@/api/actionsApi'

interface EarnWithServerWalletProps {
  ready: boolean
  logout: () => void
  userId?: string
  getAuthHeaders: () => Promise<
    | {
        Authorization: string
      }
    | undefined
  >
  userEmailAddress?: string
}

/**
 * Container component that handles Privy wallet provider logic
 * and passes data/callbacks to the presentational EarnContent component
 */
export function EarnWithServerWallet({
  ready,
  logout,
  userId,
  getAuthHeaders,
  userEmailAddress,
}: EarnWithServerWalletProps) {
  const loggedApi = useLoggedActionsApi()

  // State for wallet balance and lend position
  const [usdcBalance, setUsdcBalance] = useState<string>('0')
  const [isLoadingBalance, setIsLoadingBalance] = useState(false)
  const hasInitializedWallet = useRef(false)
  const [depositedAmount, setDepositedAmount] = useState<string | null>(null)
  const [apy, setApy] = useState<number | null>(null)
  const [isLoadingPosition, setIsLoadingPosition] = useState(false)
  const [isLoadingApy, setIsLoadingApy] = useState(true)
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  // Market data for transactions
  const [marketData, setMarketData] = useState<{
    marketId: { chainId: number; address: Address }
    assetAddress: Address
  } | null>(null)
  const hasInitiatedMarketFetch = useRef(false)

  const marketChainId = marketData?.marketId.chainId
  const marketAddress = marketData?.marketId.address

  // Function to fetch wallet balance
  const fetchBalance = useCallback(
    async (userId: string) => {
      try {
        setIsLoadingBalance(true)
        const headers = await getAuthHeaders()
        const balanceResult = await loggedApi.getWalletBalance(userId, headers)

        // Find USDC balance (try USDC_DEMO first not USDC)
        const usdcToken = balanceResult.balance.find(
          (token) => token.symbol === 'USDC_DEMO',
        )

        if (usdcToken && parseFloat(usdcToken.totalBalance) > 0) {
          // Parse the balance (it's in smallest unit, divide by 1e6 for USDC)
          const balance = parseFloat(usdcToken.totalBalance) / 1e6
          // Floor to 2 decimals to ensure we never try to send more than we have
          const flooredBalance = Math.floor(balance * 100) / 100
          setUsdcBalance(flooredBalance.toFixed(2))
        } else {
          setUsdcBalance('0.00')
        }
      } catch {
        setUsdcBalance('0.00')
      } finally {
        setIsLoadingBalance(false)
      }
    },
    [getAuthHeaders, loggedApi],
  )

  // Function to mint demo USDC
  const handleMintUSDC = useCallback(async () => {
    if (!userId) return

    try {
      setIsLoadingBalance(true)
      const headers = await getAuthHeaders()
      await loggedApi.fundWallet(userId, headers)

      // Transaction succeeded - optimistically update balance with the minted amount (100 USDC)
      const currentBalance = parseFloat(usdcBalance)
      const mintedAmount = 100
      const newOptimisticBalance = (currentBalance + mintedAmount).toFixed(2)
      setUsdcBalance(newOptimisticBalance)
      setIsLoadingBalance(false)

      // Fetch actual balance to verify/correct the optimistic update
      const balanceResult = await loggedApi.getWalletBalance(userId, headers)
      const usdcToken = balanceResult.balance.find(
        (token) => token.symbol === 'USDC_DEMO',
      )

      if (usdcToken && parseFloat(usdcToken.totalBalance) > 0) {
        const actualBalance = parseFloat(usdcToken.totalBalance) / 1e6
        const flooredBalance = Math.floor(actualBalance * 100) / 100
        const actualBalanceStr = flooredBalance.toFixed(2)

        // Only update if different from optimistic value
        if (actualBalanceStr !== newOptimisticBalance) {
          setUsdcBalance(actualBalanceStr)
        }
      }
    } catch (error) {
      console.error('Error minting USDC:', error)
      // Revert to actual balance on error
      setIsLoadingBalance(false)
      if (userId) {
        await fetchBalance(userId)
      }
    }
  }, [userId, getAuthHeaders, loggedApi, fetchBalance, usdcBalance])

  // Fetch balance when user logs in
  useEffect(() => {
    if (!userId || hasInitializedWallet.current) {
      return
    }

    hasInitializedWallet.current = true

    const initializeWallet = async () => {
      try {
        await fetchBalance(userId)
      } catch (error) {
        console.error('Error fetching balance:', error)
        hasInitializedWallet.current = false // Reset on error so it can retry
      }
    }

    initializeWallet()
  }, [userId, fetchBalance])

  // Fetch market APY and data on mount
  useEffect(() => {
    const fetchMarketApy = async () => {
      // Skip if already initiated (prevents double-fetch in StrictMode)
      if (hasInitiatedMarketFetch.current) {
        console.log('[getMarkets] Skipping - already initiated')
        return
      }

      hasInitiatedMarketFetch.current = true
      console.log('[getMarkets] Fetching market data...')

      try {
        setIsLoadingApy(true)
        const result = await loggedApi.getMarkets()

        // Get the USDC Demo Vault (Base Sepolia) at index 1
        if (result.markets.length > 1) {
          const market = result.markets[1]
          setApy(market.apy.total)

          // Store market data for transactions
          const assetAddress = (market.asset.address[market.marketId.chainId] ||
            Object.values(market.asset.address)[0]) as Address

          setMarketData({
            marketId: market.marketId,
            assetAddress,
          })
        }
      } catch {
        // Error fetching market APY
      } finally {
        setIsLoadingApy(false)
        setIsInitialLoad(false)
      }
    }

    fetchMarketApy()
  }, [loggedApi])

  const fetchPosition = useCallback(
    async (backgroundPolling: boolean = false) => {
      if (!userId || !marketChainId || !marketAddress) return

      const api = backgroundPolling ? actionsApi : loggedApi

      try {
        if (!backgroundPolling) {
          setIsLoadingPosition(true)
        }
        const position = await api.getPosition(
          {
            chainId: marketChainId,
            address: marketData.marketId.address,
          },
          userId,
        )
        setDepositedAmount(position.balanceFormatted)
      } catch {
        // Silently fail polling - don't reset to 0.00
        if (!backgroundPolling) {
          setDepositedAmount('0.00')
        }
      } finally {
        if (!backgroundPolling) {
          setIsLoadingPosition(false)
        }
      }
    },
    [userId, marketChainId, marketAddress, loggedApi, actionsApi],
  )

  // Fetch position when market data is available or user changes
  useEffect(() => {
    if (userId && marketChainId && marketAddress) {
      fetchPosition()
    }
  }, [userId, marketChainId, marketAddress, loggedApi])

  useEffect(() => {
    if (!userId || !marketChainId || !marketAddress) return

    const intervalId = setInterval(() => fetchPosition(true), 5000)
    return () => clearInterval(intervalId)
  }, [userId, marketChainId, marketAddress])

  // Handle transaction (lend or withdraw)
  const handleTransaction = useCallback(
    async (mode: 'lend' | 'withdraw', amount: number) => {
      if (!userId || !marketData) {
        throw new Error('User or market data not available')
      }

      const headers = await getAuthHeaders()

      const result =
        mode === 'lend'
          ? await loggedApi.openLendPosition(
              userId,
              amount,
              marketData.assetAddress,
              marketData.marketId,
              headers,
            )
          : await loggedApi.closeLendPosition(
              userId,
              amount,
              marketData.assetAddress,
              marketData.marketId,
              headers,
            )

      // Get the first transaction hash if available, or use userOpHash for account abstraction
      const txHash =
        result.transaction.transactionHashes?.[0] ||
        result.transaction.userOpHash

      // Use the block explorer URL from the backend (first one in the array)
      const explorerUrl = result.transaction.blockExplorerUrls?.[0]

      // Refresh position after successful transaction with a small delay to ensure state is updated
      setTimeout(async () => {
        if (userId && marketData) {
          try {
            const position = await loggedApi.getPosition(
              marketData.marketId,
              userId,
            )
            setDepositedAmount(position.balanceFormatted)
          } catch {
            setDepositedAmount('0.00')
          }
        }
      }, 1000)

      // Also refresh wallet balance
      if (userId) {
        setTimeout(async () => {
          await fetchBalance(userId)
        }, 2000)
      }

      return {
        transactionHash: txHash,
        blockExplorerUrl: explorerUrl,
      }
    },
    [userId, marketData, getAuthHeaders, loggedApi, fetchBalance],
  )

  return (
    <Earn
      ready={ready}
      logout={logout}
      userEmail={userEmailAddress}
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
