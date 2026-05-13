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
import type { Address } from 'viem'
import type {
  BorrowAction,
  BorrowMarket,
  BorrowMarketPosition,
  BorrowPrice,
  BorrowQuote,
  BorrowReceipt,
} from '@eth-optimism/actions-sdk'
import {
  borrowApi,
  type StubCloseParams,
  type StubCollateralParams,
  type StubOpenParams,
  type StubRepayParams,
} from '@/api/borrowApi'
import { useActivityLogger } from '@/hooks/useActivityLogger'

export type BorrowMode = 'borrow' | 'repay'

export interface BorrowOperationParams {
  open: StubOpenParams
  close: StubCloseParams
  depositCollateral: StubCollateralParams
  withdrawCollateral: StubCollateralParams
  repay: StubRepayParams
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

export type GetAuthHeaders = () => Promise<HeadersInit | undefined>

export function useBorrowProvider(
  walletAddress: Address | null,
  getAuthHeaders?: GetAuthHeaders,
): UseBorrowProviderReturn {
  const resolveHeaders = useCallback(async (): Promise<HeadersInit> => {
    if (!getAuthHeaders) return {}
    return (await getAuthHeaders()) ?? {}
  }, [getAuthHeaders])
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
    resolveHeaders()
      .then((headers) => borrowApi.getMarkets(headers))
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
  }, [resolveHeaders])

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
        const headers = await resolveHeaders()
        const positions = await borrowApi.getPositions(address, headers)
        setBorrowPositions(positions)
        activity?.confirm()
      } catch (e) {
        activity?.error()
        throw e
      } finally {
        setIsLoadingPositions(false)
        setIsInitialLoad(false)
      }
    },
    [logActivity, resolveHeaders],
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
      const headers = await resolveHeaders()
      let receipt: BorrowReceipt
      switch (action) {
        case 'open':
          receipt = await borrowApi.openPosition(
            walletAddress,
            params as StubOpenParams,
            headers,
          )
          break
        case 'close':
          receipt = await borrowApi.closePosition(
            walletAddress,
            params as StubCloseParams,
            headers,
          )
          break
        case 'depositCollateral':
          receipt = await borrowApi.depositCollateral(
            walletAddress,
            params as StubCollateralParams,
            headers,
          )
          break
        case 'withdrawCollateral':
          receipt = await borrowApi.withdrawCollateral(
            walletAddress,
            params as StubCollateralParams,
            headers,
          )
          break
        case 'repay':
          receipt = await borrowApi.repay(
            walletAddress,
            params as StubRepayParams,
            headers,
          )
          break
      }
      await fetchPositions(walletAddress)
      return receipt
    },
    [walletAddress, fetchPositions, resolveHeaders],
  )

  const getPrice = useCallback<UseBorrowProviderReturn['getPrice']>(
    async (params) => {
      if (!walletAddress) throw new Error('Wallet not connected')
      const headers = await resolveHeaders()
      return borrowApi.getPrice({ ...params, walletAddress }, headers)
    },
    [walletAddress, resolveHeaders],
  )

  const getQuote = useCallback<UseBorrowProviderReturn['getQuote']>(
    async (params) => {
      if (!walletAddress) throw new Error('Wallet not connected')
      const headers = await resolveHeaders()
      // walletAddress is derived from auth server-side; do not forward.
      return borrowApi.getQuote(params, headers)
    },
    [walletAddress, resolveHeaders],
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
