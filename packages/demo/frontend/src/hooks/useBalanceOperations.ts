import { useState, useCallback, useEffect, useRef } from 'react'
import { formatUnits, type Address } from 'viem'
import { getAssetAddress, SUPPORTED_TOKENS } from '@eth-optimism/actions-sdk'
import type { TokenBalance } from '@eth-optimism/actions-sdk/react'
import type {
  LendMarket,
  LendMarketId,
  LendMarketPosition,
  LendTransactionReceipt,
  SupportedChainId,
} from '@eth-optimism/actions-sdk'
import { formatMarketResponse } from '@/utils/formatters'
import { USDCDemoVault } from '@/constants/markets'
import type { LendExecutePositionParams } from '@/types/api'
import {
  isBatchEOATransactionReceipt,
  isEOATransactionReceipt,
  isUserOperationTransactionReceipt,
} from '@/utils/receiptTypeGuards'
import { getBlockExplorerUrls } from '@/utils/blockExplorer'
import { useActivityLogger } from './useActivityLogger'

export interface UseBalanceOperationsConfig {
  getTokenBalances: () => Promise<TokenBalance[]>
  getMarkets: () => Promise<LendMarket[]>
  getPosition: (marketId: LendMarket['marketId']) => Promise<LendMarketPosition>
  mintUSDC: () => Promise<void>
  openPosition: (
    positionParams: LendExecutePositionParams,
  ) => Promise<LendTransactionReceipt>
  closePosition: (
    positionParams: LendExecutePositionParams,
  ) => Promise<LendTransactionReceipt>
  /** Predicate to check if balance operations can be executed */
  isReady: () => boolean
}

export function useBalanceOperations(params: UseBalanceOperationsConfig) {
  const {
    getTokenBalances: getTokenBalancesRaw,
    getMarkets: getMarketsRaw,
    getPosition: getPositionRaw,
    mintUSDC: mintUSDCRaw,
    isReady,
    openPosition,
    closePosition,
  } = params
  const { logActivity } = useActivityLogger()

  const [isLoadingPosition, setIsLoadingPosition] = useState(false)
  const [depositedAmount, setDepositedAmount] = useState<string | null>(null)
  const [usdcBalance, setUsdcBalance] = useState<string>('0.00')
  const [isLoadingBalance, setIsLoadingBalance] = useState(false)
  const [isLoadingApy, setIsLoadingApy] = useState(true)
  const [apy, setApy] = useState<number | null>(null)
  const [marketData, setMarketData] = useState<{
    marketId: LendMarketId
    assetAddress: Address
  } | null>(null)
  const marketChainId = marketData?.marketId.chainId
  const marketAddress = marketData?.marketId.address
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  const hasInitialized = useRef(false)
  const hasInitiatedMarketFetch = useRef(false)

  // Wrap operations with activity logging
  const getTokenBalances = useCallback(async () => {
    const activity = logActivity('wallet.getBalance()')
    try {
      const result = await getTokenBalancesRaw()
      activity?.confirm()
      return result
    } catch (error) {
      activity?.error()
      throw error
    }
  }, [getTokenBalancesRaw, logActivity])

  const getMarkets = useCallback(async () => {
    const activity = logActivity('actions.lend.getMarkets()')
    try {
      const result = await getMarketsRaw()
      activity?.confirm()
      return result
    } catch (error) {
      activity?.error()
      throw error
    }
  }, [getMarketsRaw, logActivity])

  const getPosition = useCallback(
    async (marketId: LendMarketId, withLogging: boolean = true) => {
      const activity = withLogging
        ? logActivity('wallet.lend.getPosition()')
        : null
      try {
        const result = await getPositionRaw(marketId)
        activity?.confirm()
        return result
      } catch (error) {
        activity?.error()
        throw error
      }
    },
    [getPositionRaw, logActivity],
  )

  const mintUSDC = useCallback(async () => {
    const activity = logActivity('wallet.fund()')
    try {
      await mintUSDCRaw()
      activity?.confirm()
    } catch (error) {
      activity?.error()
      throw error
    }
  }, [mintUSDCRaw, logActivity])

  const fetchBalance = useCallback(async () => {
    try {
      setIsLoadingBalance(true)
      const tokenBalances = await getTokenBalances()
      const vaults = await getMarkets()

      const vaultBalances = await Promise.all(
        vaults.map(async (vault) => {
          try {
            const vaultBalance = await getPosition(vault.marketId)

            // Only include vaults with non-zero balances
            if (vaultBalance.balance > 0n) {
              // Create a TokenBalance object for the vault
              const formattedBalance = formatUnits(vaultBalance.balance, 6)

              // Get asset address for the vault's chain
              const assetAddress = getAssetAddress(
                vault.asset,
                vault.marketId.chainId,
              )

              return {
                symbol: `${vault.name}`,
                totalBalance: vaultBalance.balance,
                totalFormattedBalance: formattedBalance,
                chainBalances: [
                  {
                    chainId: vaultBalance.marketId.chainId,
                    balance: vaultBalance.balance,
                    tokenAddress: assetAddress,
                    formattedBalance: formattedBalance,
                  },
                ],
              } as TokenBalance
            }
            return null
          } catch (error) {
            console.error(error)
            return null
          }
        }),
      )

      const validVaultBalances = vaultBalances.filter(
        (balance): balance is NonNullable<typeof balance> => balance !== null,
      )

      const balanceResult = {
        balance: [...tokenBalances, ...validVaultBalances],
      }

      // Find USDC balance (try USDC_DEMO first not USDC)
      const usdcToken = balanceResult.balance.find(
        (token) => token.symbol === 'USDC_DEMO',
      )

      if (usdcToken && BigInt(usdcToken.totalBalance) > 0n) {
        // Parse the balance (it's in smallest unit, divide by 1e6 for USDC)
        const balance = parseFloat(`${usdcToken.totalBalance}`) / 1e6
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
  }, [getPosition, getMarkets, getTokenBalances])

  // Function to mint demo USDC
  const handleMintUSDC = useCallback(async () => {
    // Early exit if precondition not met
    if (!isReady()) {
      return
    }

    try {
      setIsLoadingBalance(true)
      await mintUSDC()

      // Transaction succeeded - optimistically update balance with the minted amount (100 USDC)
      const currentBalance = parseFloat(usdcBalance)
      const mintedAmount = 100
      const newOptimisticBalance = (currentBalance + mintedAmount).toFixed(2)
      setUsdcBalance(newOptimisticBalance)
      setIsLoadingBalance(false)

      // Fetch actual balance to verify/correct the optimistic update
      const balanceResult = await getTokenBalances()
      const usdcToken = balanceResult.find(
        (token) => token.symbol === 'USDC_DEMO',
      )

      if (usdcToken && usdcToken.totalBalance > 0) {
        const actualBalance = parseFloat(`${usdcToken.totalBalance}`) / 1e6
        const flooredBalance = Math.floor(actualBalance * 100) / 100
        const actualBalanceStr = flooredBalance.toFixed(2)

        // Only update if different from optimistic value
        if (actualBalanceStr !== newOptimisticBalance) {
          setUsdcBalance(actualBalanceStr)
        }
      }
    } catch (error) {
      console.error('Error minting USDC:', error)
      setIsLoadingBalance(false)
    }
  }, [mintUSDC, isReady, fetchBalance, usdcBalance, getTokenBalances])

  // Auto-initialize balance on first ready state
  useEffect(() => {
    if (!isReady() || hasInitialized.current) {
      return
    }

    hasInitialized.current = true

    const initialize = async () => {
      try {
        await fetchBalance()
      } catch (error) {
        console.error('Error fetching balance:', error)
        hasInitialized.current = false // Reset on error so it can retry
      }
    }

    initialize()
  }, [isReady, fetchBalance])

  const executePositon = useCallback(
    async (operation: 'open' | 'close', amount: number) => {
      if (!isReady() || !marketData) {
        throw new Error('User or market data not available')
      }
      const marketId = marketData.marketId
      const tokenAddress = marketData.assetAddress

      const asset = SUPPORTED_TOKENS.find(
        (token) =>
          token.address[marketId.chainId as SupportedChainId] === tokenAddress,
      )
      if (!asset) {
        const error = `Asset not found for token address: ${tokenAddress}`
        console.error('[executePosition] ERROR:', error)
        throw new Error(error)
      }

      const positionParams = { amount, asset, marketId }

      const activity =
        operation === 'open'
          ? logActivity('wallet.lend.openPosition()')
          : logActivity('wallet.lend.closePosition()')
      const result =
        operation === 'open'
          ? await openPosition(positionParams).catch((error) => {
              activity?.error()
              throw error
            })
          : await closePosition(positionParams).catch((error) => {
              activity?.error()
              throw error
            })

      const transactionHashes = isEOATransactionReceipt(result)
        ? [result.transactionHash]
        : isBatchEOATransactionReceipt(result)
          ? result.map((receipt) => receipt.transactionHash)
          : undefined

      const userOpHash = isUserOperationTransactionReceipt(result)
        ? result.userOpHash
        : undefined

      const blockExplorerUrls = await getBlockExplorerUrls(
        marketId.chainId,
        transactionHashes,
        userOpHash,
      )

      activity?.confirm({
        blockExplorerUrl: blockExplorerUrls.length
          ? blockExplorerUrls[blockExplorerUrls.length - 1]
          : undefined,
      })

      const transaction = {
        transactionHashes,
        userOpHash,
        blockExplorerUrls,
        amount,
        tokenAddress,
        marketId,
      }

      return { transaction }
    },
    [isReady, marketData],
  )

  // Handle transaction (lend or withdraw)
  const handleTransaction = useCallback(
    async (mode: 'lend' | 'withdraw', amount: number) => {
      if (!isReady() || !marketData) {
        throw new Error('User or market data not available')
      }

      const result =
        mode === 'lend'
          ? await executePositon('open', amount)
          : await executePositon('close', amount)

      // Get the last transaction hash if available, or use userOpHash for account abstraction
      const txHash =
        result.transaction.userOpHash ||
        result.transaction.transactionHashes?.length
          ? result.transaction.transactionHashes?.[
              result.transaction.transactionHashes?.length - 1
            ]
          : undefined

      const explorerUrl = result.transaction.blockExplorerUrls.length
        ? result.transaction.blockExplorerUrls[
            result.transaction.blockExplorerUrls.length - 1
          ]
        : undefined

      // Refresh position after successful transaction with a small delay to ensure state is updated
      setTimeout(async () => {
        if (isReady() && marketData) {
          try {
            await fetchPosition()
          } catch {
            setDepositedAmount('0.00')
          }
        }
      }, 1000)

      // Also refresh wallet balance
      if (isReady()) {
        setTimeout(async () => {
          await fetchBalance()
        }, 2000)
      }

      return {
        transactionHash: txHash,
        blockExplorerUrl: explorerUrl,
      }
    },
    [isReady, marketData, fetchBalance],
  )

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
        const markets = await getMarkets()
        const formattedMarkets = markets.map((market) =>
          formatMarketResponse(market),
        )

        const market = formattedMarkets.find(
          (market) =>
            market.marketId.address === USDCDemoVault.address &&
            market.marketId.chainId === USDCDemoVault.chainId,
        )

        if (market) {
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
  }, [hasInitiatedMarketFetch])

  const fetchPosition = useCallback(
    async (backgroundPolling: boolean = false) => {
      if (!isReady() || !marketChainId || !marketAddress) return

      try {
        if (!backgroundPolling) {
          setIsLoadingPosition(true)
        }
        const position = await getPosition(
          {
            chainId: marketChainId,
            address: marketAddress,
          },
          !backgroundPolling,
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
    [isReady, marketChainId, marketAddress, getPosition],
  )

  // Fetch position when market data is available or user changes
  useEffect(() => {
    if (isReady() && marketChainId && marketAddress) {
      fetchPosition()
    }
  }, [isReady, marketChainId, marketAddress, fetchPosition])

  useEffect(() => {
    if (!isReady() || !marketChainId || !marketAddress) return

    const intervalId = setInterval(() => fetchPosition(true), 5000)
    return () => clearInterval(intervalId)
  }, [isReady, marketChainId, marketAddress, fetchPosition])

  return {
    usdcBalance,
    isLoadingBalance,
    handleMintUSDC,
    isLoadingApy,
    apy,
    isInitialLoad,
    isLoadingPosition,
    depositedAmount,
    handleTransaction,
  }
}
