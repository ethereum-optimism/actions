import { useState, useCallback, useEffect, useRef } from 'react'
import { type Address } from 'viem'
import type { TokenBalance } from '@eth-optimism/actions-sdk/react'
import type {
  Asset,
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
  mintAsset: (assetSymbol: string, chainId: number) => Promise<void>
  openPosition: (
    positionParams: LendExecutePositionParams,
  ) => Promise<LendTransactionReceipt>
  closePosition: (
    positionParams: LendExecutePositionParams,
  ) => Promise<LendTransactionReceipt>
  /** Predicate to check if balance operations can be executed */
  isReady: () => boolean
  /** The currently selected market for operations */
  selectedMarketId?: LendMarketId | null
  /** Asset symbol for the selected market (e.g., 'USDC', 'WETH') */
  selectedAssetSymbol?: string
  /** Optional pre-loaded APY to skip market fetch */
  selectedMarketApy?: number | null
}

export function useBalanceOperations(params: UseBalanceOperationsConfig) {
  const {
    getTokenBalances: getTokenBalancesRaw,
    getMarkets: getMarketsRaw,
    getPosition: getPositionRaw,
    mintAsset: mintAssetRaw,
    isReady,
    openPosition,
    closePosition,
    selectedMarketId,
    selectedAssetSymbol = 'USDC',
    selectedMarketApy,
  } = params
  const { logActivity } = useActivityLogger()

  const [isLoadingPosition, setIsLoadingPosition] = useState(false)
  const [depositedAmount, setDepositedAmount] = useState<string | null>(null)
  const [assetBalance, setAssetBalance] = useState<string>('0.00')
  const [isLoadingBalance, setIsLoadingBalance] = useState(false)
  const [isLoadingApy, setIsLoadingApy] = useState(true)
  const [apy, setApy] = useState<number | null>(null)
  const [marketData, setMarketData] = useState<{
    marketId: LendMarketId
    assetAddress: Address
    asset: Asset
  } | null>(null)
  const marketChainId = marketData?.marketId.chainId
  const marketAddress = marketData?.marketId.address
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  const hasInitialized = useRef(false)
  const hasInitiatedMarketFetch = useRef(false)

  // Wrap operations with activity logging
  const getTokenBalances = useCallback(async () => {
    const activity = logActivity('getBalance')
    try {
      const result = await getTokenBalancesRaw()
      activity?.confirm()
      return result
    } catch (error) {
      activity?.error()
      throw error
    }
  }, [getTokenBalancesRaw, logActivity])

  const getMarkets = useCallback(
    async (withLogging: boolean = true) => {
      const activity = withLogging ? logActivity('getMarket') : null
      try {
        const result = await getMarketsRaw()
        activity?.confirm()
        return result
      } catch (error) {
        activity?.error()
        throw error
      }
    },
    [getMarketsRaw, logActivity],
  )

  const getPosition = useCallback(
    async (marketId: LendMarketId, withLogging: boolean = true) => {
      const activity = withLogging ? logActivity('getPosition') : null
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

  const fetchBalance = useCallback(async () => {
    try {
      setIsLoadingBalance(true)
      const tokenBalances = await getTokenBalances()

      console.log('[fetchBalance] selectedAssetSymbol:', selectedAssetSymbol)
      console.log('[fetchBalance] marketData:', marketData)
      console.log(
        '[fetchBalance] tokenBalances symbols:',
        tokenBalances.map((t) => t.symbol),
      )

      // If we have market data, match by address and chain for precision
      // Otherwise fall back to symbol matching
      let assetToken: (typeof tokenBalances)[0] | undefined
      let chainBalance:
        | (typeof tokenBalances)[0]['chainBalances'][0]
        | undefined

      if (marketData?.assetAddress && marketData?.marketId?.chainId) {
        const targetAddress = marketData.assetAddress.toLowerCase()
        const targetChainId = marketData.marketId.chainId

        console.log(
          '[fetchBalance] Matching by address:',
          targetAddress,
          'on chain:',
          targetChainId,
        )

        // Find the token that has a chainBalance matching both address and chainId
        for (const token of tokenBalances) {
          const matchingChainBalance = token.chainBalances.find(
            (cb) =>
              cb.tokenAddress.toLowerCase() === targetAddress &&
              cb.chainId === targetChainId,
          )
          if (matchingChainBalance) {
            assetToken = token
            chainBalance = matchingChainBalance
            break
          }
        }
      } else {
        // Fallback to symbol matching (less precise)
        console.log(
          '[fetchBalance] No marketData, falling back to symbol matching',
        )
        assetToken = tokenBalances.find(
          (token) => token.symbol === selectedAssetSymbol,
        )
      }

      if (assetToken && chainBalance && BigInt(chainBalance.balance) > 0n) {
        // Use the specific chain balance
        const decimals = selectedAssetSymbol.includes('USDC') ? 6 : 18
        const balance =
          parseFloat(`${chainBalance.balance}`) / Math.pow(10, decimals)
        const flooredBalance = Math.floor(balance * 100) / 100
        console.log(
          '[fetchBalance] Found token by address, setting balance to:',
          flooredBalance.toFixed(2),
        )
        setAssetBalance(flooredBalance.toFixed(2))
      } else if (assetToken && BigInt(assetToken.totalBalance) > 0n) {
        // Fallback to total balance if no specific chain balance
        const decimals = selectedAssetSymbol.includes('USDC') ? 6 : 18
        const balance =
          parseFloat(`${assetToken.totalBalance}`) / Math.pow(10, decimals)
        const flooredBalance = Math.floor(balance * 100) / 100
        console.log(
          '[fetchBalance] Found token by symbol, setting balance to:',
          flooredBalance.toFixed(2),
        )
        setAssetBalance(flooredBalance.toFixed(2))
      } else {
        console.log(
          '[fetchBalance] Token not found or balance is 0, setting to 0.00',
        )
        setAssetBalance('0.00')
      }
    } catch (error) {
      console.log('[fetchBalance] Error:', error)
      setAssetBalance('0.00')
    } finally {
      setIsLoadingBalance(false)
    }
  }, [getTokenBalances, selectedAssetSymbol, marketData])

  // Function to mint demo asset
  const handleMintUSDC = useCallback(async () => {
    // Early exit if precondition not met
    if (!isReady() || !selectedMarketId) {
      return
    }

    try {
      setIsLoadingBalance(true)
      await mintAssetRaw(selectedAssetSymbol, selectedMarketId.chainId)

      // Transaction succeeded - optimistically update balance with the minted amount (100 tokens)
      const currentBalance = parseFloat(assetBalance)
      const mintedAmount = 100
      const newOptimisticBalance = (currentBalance + mintedAmount).toFixed(2)
      setAssetBalance(newOptimisticBalance)
      setIsLoadingBalance(false)

      // Fetch actual balance to verify/correct the optimistic update
      const balanceResult = await getTokenBalances()
      const assetToken = balanceResult.find(
        (token) => token.symbol === selectedAssetSymbol,
      )

      if (assetToken && assetToken.totalBalance > 0) {
        const decimals = selectedAssetSymbol.includes('USDC') ? 6 : 18
        const actualBalance =
          parseFloat(`${assetToken.totalBalance}`) / Math.pow(10, decimals)
        const flooredBalance = Math.floor(actualBalance * 100) / 100
        const actualBalanceStr = flooredBalance.toFixed(2)

        // Only update if different from optimistic value
        if (actualBalanceStr !== newOptimisticBalance) {
          setAssetBalance(actualBalanceStr)
        }
      }
    } catch (error) {
      console.error('Error minting asset:', error)
      setIsLoadingBalance(false)
    }
  }, [
    mintAssetRaw,
    isReady,
    fetchBalance,
    assetBalance,
    getTokenBalances,
    selectedAssetSymbol,
    selectedMarketId,
  ])

  // Auto-initialize balance on first ready state
  useEffect(() => {
    if (!isReady() || hasInitialized.current || !selectedAssetSymbol) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAssetSymbol])

  // Refetch balance when selected asset changes
  useEffect(() => {
    console.log(
      '[useBalanceOperations] selectedAssetSymbol changed to:',
      selectedAssetSymbol,
    )
    if (isReady() && hasInitialized.current) {
      console.log(
        '[useBalanceOperations] Fetching balance due to asset symbol change',
      )
      fetchBalance()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAssetSymbol])

  const executePositon = useCallback(
    async (operation: 'open' | 'close', amount: number) => {
      if (!isReady() || !marketData) {
        throw new Error('User or market data not available')
      }
      if (!marketData.asset) {
        throw new Error('Market asset data not available')
      }
      const marketId = marketData.marketId
      const asset = marketData.asset

      const positionParams = { amount, asset, marketId }

      const activity =
        operation === 'open' ? logActivity('deposit') : logActivity('withdraw')
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

  // Clear state immediately when market changes
  useEffect(() => {
    setApy(null)
    setDepositedAmount(null)
    setIsLoadingApy(true)
    setIsLoadingPosition(true)
  }, [selectedMarketId])

  // Fetch market APY and data when selected market changes
  useEffect(() => {
    const fetchMarketApy = async () => {
      // Skip if APY already provided by parent
      if (selectedMarketApy !== undefined && selectedMarketApy !== null) {
        setApy(selectedMarketApy)
        setIsLoadingApy(false)
        setIsInitialLoad(false)

        // Still need to fetch market data for asset address
        if (selectedMarketId && selectedAssetSymbol) {
          try {
            const markets = await getMarkets()
            const market = markets.find(
              (m) =>
                m.marketId.address.toLowerCase() === selectedMarketId.address.toLowerCase() &&
                m.marketId.chainId === selectedMarketId.chainId,
            )
            if (market) {
              const assetAddress = (market.asset.address[market.marketId.chainId] ||
                Object.values(market.asset.address)[0]) as Address
              setMarketData({
                marketId: market.marketId,
                assetAddress,
                asset: market.asset,
              })
            }
          } catch {
            // Error fetching market data
          }
        }
        return
      }

      if (!selectedMarketId) {
        // Use default USDC Demo market on initial load
        if (hasInitiatedMarketFetch.current) {
          return
        }
        hasInitiatedMarketFetch.current = true
      }

      console.log('[getMarkets] Fetching market data...')

      try {
        const markets = await getMarkets()
        const formattedMarkets = markets.map((market) =>
          formatMarketResponse(market),
        )

        const targetMarket = selectedMarketId || USDCDemoVault
        const market = formattedMarkets.find(
          (market) =>
            market.marketId.address.toLowerCase() ===
              targetMarket.address.toLowerCase() &&
            market.marketId.chainId === targetMarket.chainId,
        )

        if (market) {
          setApy(market.apy.total)

          // Store market data for transactions
          const assetAddress = (market.asset.address[market.marketId.chainId] ||
            Object.values(market.asset.address)[0]) as Address

          setMarketData({
            marketId: market.marketId,
            assetAddress,
            asset: market.asset,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMarketId, selectedMarketApy, selectedAssetSymbol])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketChainId, marketAddress])

  useEffect(() => {
    if (!isReady() || !marketChainId || !marketAddress) return

    const intervalId = setInterval(() => fetchPosition(true), 5000)
    return () => clearInterval(intervalId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketChainId, marketAddress])

  return {
    assetBalance,
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
