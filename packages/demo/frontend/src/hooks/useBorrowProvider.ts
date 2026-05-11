/**
 * Borrow provider hook.
 *
 * Owns the lifecycle of the demo's in-memory borrow positions + market
 * list against the `borrowApi` stub. Mirrors `useLendProvider`'s shape:
 * a single hook returning the read state + transaction handlers, intended
 * to be wrapped by a context provider so the rest of the tree consumes
 * via `useBorrowProviderContext()`.
 *
 * When PR #4 lands, the underlying `borrowApi` swaps to a real HTTP
 * client with no consumer changes.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address } from 'viem'
import { borrowApi } from '@/api/borrowApi'
import { BORROW_HEALTH_BUFFER_PCT } from '@/config/borrow'
import { assertBufferValid } from '@/utils/borrowMath'
import type {
  BorrowAction,
  BorrowCloseParams,
  BorrowCollateralParams,
  BorrowMarket,
  BorrowMarketPosition,
  BorrowOpenParams,
  BorrowPrice,
  BorrowQuote,
  BorrowRepayParams,
  BorrowTransactionReceipt,
} from '@/types/borrow'

// Validate the buffer constant once at module load. If PR #3 ships a
// negative or >= 1 value via the actions config, this throws immediately
// rather than silently producing nonsense bar values.
assertBufferValid(BORROW_HEALTH_BUFFER_PCT)

export type BorrowMode = 'borrow' | 'repay'

export interface BorrowOperationParams {
  open: BorrowOpenParams
  close: BorrowCloseParams
  depositCollateral: BorrowCollateralParams
  withdrawCollateral: BorrowCollateralParams
  repay: BorrowRepayParams
}

export interface UseBorrowProviderReturn {
  markets: readonly BorrowMarket[]
  selectedMarket: BorrowMarket | null
  handleMarketSelect: (market: BorrowMarket) => void
  isLoadingMarkets: boolean

  borrowPositions: readonly BorrowMarketPosition[]
  selectedMarketPosition: BorrowMarketPosition | null
  isLoadingPositions: boolean
  isInitialLoad: boolean

  refreshPositions: () => Promise<void>

  /**
   * Execute one of the five borrow actions. Returns the receipt and
   * refreshes positions on success.
   */
  handleTransaction: <A extends BorrowAction>(
    action: A,
    params: BorrowOperationParams[A],
  ) => Promise<BorrowTransactionReceipt>

  getPrice: (params: {
    action: BorrowAction
    marketId: BorrowMarket['marketId']
    borrowAmount?: { amount: number } | { amountRaw: bigint } | { max: true }
    collateralAmount?:
      | { amount: number }
      | { amountRaw: bigint }
      | { max: true }
  }) => Promise<BorrowPrice>

  getQuote: (params: {
    action: BorrowAction
    marketId: BorrowMarket['marketId']
    borrowAmount?: { amount: number } | { amountRaw: bigint } | { max: true }
    collateralAmount?:
      | { amount: number }
      | { amountRaw: bigint }
      | { max: true }
  }) => Promise<BorrowQuote>
}

export function useBorrowProvider(
  walletAddress: Address | null,
): UseBorrowProviderReturn {
  const [markets, setMarkets] = useState<readonly BorrowMarket[]>([])
  const [selectedMarket, setSelectedMarket] = useState<BorrowMarket | null>(
    null,
  )
  const [borrowPositions, setBorrowPositions] = useState<
    readonly BorrowMarketPosition[]
  >([])
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(false)
  const [isLoadingPositions, setIsLoadingPositions] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  // Track wallet across renders so we can reset stub state on switch.
  const prevWalletRef = useRef<Address | null>(walletAddress)

  // Load markets once at mount.
  useEffect(() => {
    let cancelled = false
    setIsLoadingMarkets(true)
    borrowApi
      .getMarkets()
      .then((m) => {
        if (cancelled) return
        setMarkets(m)
        if (!selectedMarket && m.length > 0) setSelectedMarket(m[0])
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMarkets(false)
      })
    return () => {
      cancelled = true
    }
    // selectedMarket intentionally omitted from deps: we only default-pick
    // on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchPositions = useCallback(async (address: Address | null) => {
    if (!address) {
      setBorrowPositions([])
      setIsInitialLoad(false)
      return
    }
    setIsLoadingPositions(true)
    try {
      const positions = await borrowApi.getPositions(address)
      setBorrowPositions(positions)
    } finally {
      setIsLoadingPositions(false)
      setIsInitialLoad(false)
    }
  }, [])

  // Refresh positions when wallet changes. Wipe stub state on switch so
  // the new wallet sees its own positions (or none), not the previous
  // wallet's residual.
  useEffect(() => {
    const prev = prevWalletRef.current
    if (prev && prev !== walletAddress) {
      borrowApi.resetWallet(prev)
    }
    prevWalletRef.current = walletAddress
    setIsInitialLoad(true)
    void fetchPositions(walletAddress)
  }, [walletAddress, fetchPositions])

  const handleMarketSelect = useCallback((market: BorrowMarket) => {
    setSelectedMarket(market)
  }, [])

  const refreshPositions = useCallback(
    () => fetchPositions(walletAddress),
    [fetchPositions, walletAddress],
  )

  const handleTransaction = useCallback(
    async <A extends BorrowAction>(
      action: A,
      params: BorrowOperationParams[A],
    ): Promise<BorrowTransactionReceipt> => {
      if (!walletAddress) throw new Error('Wallet not connected')
      let receipt: BorrowTransactionReceipt
      switch (action) {
        case 'open':
          receipt = await borrowApi.openPosition(
            walletAddress,
            params as BorrowOpenParams,
          )
          break
        case 'close':
          receipt = await borrowApi.closePosition(
            walletAddress,
            params as BorrowCloseParams,
          )
          break
        case 'depositCollateral':
          receipt = await borrowApi.depositCollateral(
            walletAddress,
            params as BorrowCollateralParams,
          )
          break
        case 'withdrawCollateral':
          receipt = await borrowApi.withdrawCollateral(
            walletAddress,
            params as BorrowCollateralParams,
          )
          break
        case 'repay':
          receipt = await borrowApi.repay(
            walletAddress,
            params as BorrowRepayParams,
          )
          break
      }
      await fetchPositions(walletAddress)
      return receipt
    },
    [walletAddress, fetchPositions],
  )

  const getPrice = useCallback<UseBorrowProviderReturn['getPrice']>(
    async (params) => {
      if (!walletAddress) throw new Error('Wallet not connected')
      return borrowApi.getPrice({ ...params, walletAddress })
    },
    [walletAddress],
  )

  const getQuote = useCallback<UseBorrowProviderReturn['getQuote']>(
    async (params) => {
      if (!walletAddress) throw new Error('Wallet not connected')
      return borrowApi.getQuote({
        ...params,
        walletAddress,
        recipient: walletAddress,
      })
    },
    [walletAddress],
  )

  const selectedMarketPosition =
    selectedMarket && borrowPositions.length > 0
      ? (borrowPositions.find(
          (p) =>
            p.marketId.kind === selectedMarket.marketId.kind &&
            p.marketId.chainId === selectedMarket.marketId.chainId &&
            (selectedMarket.marketId.kind === 'morpho-blue' &&
            p.marketId.kind === 'morpho-blue'
              ? p.marketId.marketId === selectedMarket.marketId.marketId
              : false),
        ) ?? null)
      : null

  return {
    markets,
    selectedMarket,
    handleMarketSelect,
    isLoadingMarkets,
    borrowPositions,
    selectedMarketPosition,
    isLoadingPositions,
    isInitialLoad,
    refreshPositions,
    handleTransaction,
    getPrice,
    getQuote,
  }
}
