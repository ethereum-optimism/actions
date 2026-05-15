/**
 * Borrow provider hook.
 *
 * Owns market + position loading and the five borrow mutations against
 * the demo backend's `/borrow/*` HTTP routes. Mirrors `useLendProvider`'s
 * shape: a single hook returning read state + transaction handlers, wrapped
 * by `BorrowProviderContextProvider` so the rest of the tree consumes
 * via `useBorrowProviderContext()`.
 *
 * Auth headers are injected via `getAuthHeaders`. Pass `null` for paths
 * that don't have a server-wallet wired (Dynamic / Turnkey today) — the
 * public `/borrow/markets` and `/borrow/price` routes still resolve, but
 * `/borrow/quote` and mutations will fail without auth.
 */

import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import type {
  BorrowAction,
  BorrowMarket,
  BorrowMarketId,
  BorrowMarketPosition,
  BorrowPrice,
  BorrowQuote,
  BorrowReceipt,
} from '@eth-optimism/actions-sdk'
import type {
  BorrowPriceParams,
  BorrowQuoteParams,
  StubCloseParams,
  StubCollateralParams,
  StubOpenParams,
  StubRepayParams,
} from '@/api/borrowApi'
import { useActivityLogger } from '@/hooks/useActivityLogger'
import {
  dispatchEarnPositionsChanged,
  EARN_POSITIONS_CHANGED_EVENT,
} from '@/utils/earnSync'

export type BorrowMode = 'borrow' | 'repay'

export interface BorrowOperationParams {
  open: StubOpenParams
  close: StubCloseParams
  depositCollateral: StubCollateralParams
  withdrawCollateral: StubCollateralParams
  repay: StubRepayParams
}

export interface BorrowOperations {
  getMarkets: () => Promise<readonly BorrowMarket[]>
  getPosition: (
    walletAddress: Address,
    marketId: BorrowMarketId,
  ) => Promise<BorrowMarketPosition | null>
  getPrice: (params: BorrowPriceParams) => Promise<BorrowPrice>
  getQuote: (params: BorrowQuoteParams) => Promise<BorrowQuote>
  openPosition: (
    walletAddress: Address,
    params: StubOpenParams,
  ) => Promise<BorrowReceipt>
  closePosition: (
    walletAddress: Address,
    params: StubCloseParams,
  ) => Promise<BorrowReceipt>
  depositCollateral: (
    walletAddress: Address,
    params: StubCollateralParams,
  ) => Promise<BorrowReceipt>
  withdrawCollateral: (
    walletAddress: Address,
    params: StubCollateralParams,
  ) => Promise<BorrowReceipt>
  repay: (
    walletAddress: Address,
    params: StubRepayParams,
  ) => Promise<BorrowReceipt>
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
  ) => Promise<BorrowReceipt>

  /**
   * Caller-side params omit `walletAddress` (provider injects it).
   */
  getPrice: (
    params: Omit<BorrowPriceParams, 'walletAddress'>,
  ) => Promise<BorrowPrice>

  getQuote: (
    params: Omit<BorrowQuoteParams, 'walletAddress'>,
  ) => Promise<BorrowQuote>
}

export function useBorrowProvider(
  walletAddress: Address | null,
  operations: BorrowOperations,
): UseBorrowProviderReturn {
  const queryClient = useQueryClient()
  const { logActivity } = useActivityLogger()
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

  // Load markets once at mount.
  useEffect(() => {
    let cancelled = false
    const activity = logActivity('getBorrowMarkets')
    setIsLoadingMarkets(true)
    operations
      .getMarkets()
      .then((m) => {
        if (cancelled) return
        setMarkets(m)
        if (!selectedMarket && m.length > 0) setSelectedMarket(m[0])
        activity?.confirm()
      })
      .catch(() => activity?.error())
      .finally(() => {
        if (!cancelled) setIsLoadingMarkets(false)
      })
    return () => {
      cancelled = true
    }
    // selectedMarket intentionally omitted from deps: we only default-pick
    // on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operations, logActivity])

  const fetchPositions = useCallback(
    async (address: Address | null) => {
      if (!address) {
        setBorrowPositions([])
        setIsInitialLoad(false)
        return
      }
      const activity = logActivity('getBorrowPosition')
      setIsLoadingPositions(true)
      try {
        const positions = await Promise.all(
          markets.map((market) =>
            operations.getPosition(address, market.marketId),
          ),
        )
        const nonEmptyPositions = positions.filter(
          (position): position is BorrowMarketPosition => position !== null,
        )
        setBorrowPositions(nonEmptyPositions)
        activity?.confirm()
      } catch (e) {
        activity?.error()
        throw e
      } finally {
        setIsLoadingPositions(false)
        setIsInitialLoad(false)
      }
    },
    [logActivity, markets, operations],
  )

  // Refetch positions whenever the active wallet changes.
  useEffect(() => {
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
    ): Promise<BorrowReceipt> => {
      if (!walletAddress) throw new Error('Wallet not connected')
      let receipt: BorrowReceipt
      switch (action) {
        case 'open':
          receipt = await operations.openPosition(
            walletAddress,
            params as StubOpenParams,
          )
          break
        case 'close':
          receipt = await operations.closePosition(
            walletAddress,
            params as StubCloseParams,
          )
          break
        case 'depositCollateral':
          receipt = await operations.depositCollateral(
            walletAddress,
            params as StubCollateralParams,
          )
          break
        case 'withdrawCollateral':
          receipt = await operations.withdrawCollateral(
            walletAddress,
            params as StubCollateralParams,
          )
          break
        case 'repay':
          receipt = await operations.repay(
            walletAddress,
            params as StubRepayParams,
          )
          break
      }
      await fetchPositions(walletAddress)
      await queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
      dispatchEarnPositionsChanged()
      return receipt
    },
    [walletAddress, fetchPositions, operations, queryClient],
  )

  const getPrice = useCallback<UseBorrowProviderReturn['getPrice']>(
    async (params) => {
      if (!walletAddress) throw new Error('Wallet not connected')
      return operations.getPrice({
        ...params,
        walletAddress,
      } as BorrowPriceParams)
    },
    [walletAddress, operations],
  )

  const getQuote = useCallback<UseBorrowProviderReturn['getQuote']>(
    async (params) => {
      if (!walletAddress) throw new Error('Wallet not connected')
      return operations.getQuote({
        ...params,
        walletAddress,
      } as BorrowQuoteParams)
    },
    [walletAddress, operations],
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

  useEffect(() => {
    const handlePositionsChanged = () => {
      void fetchPositions(walletAddress)
    }
    window.addEventListener(
      EARN_POSITIONS_CHANGED_EVENT,
      handlePositionsChanged,
    )
    return () => {
      window.removeEventListener(
        EARN_POSITIONS_CHANGED_EVENT,
        handlePositionsChanged,
      )
    }
  }, [fetchPositions, walletAddress])

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
