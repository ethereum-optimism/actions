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
 * that don't have a server-wallet wired (Dynamic / Turnkey today); the
 * public `/borrow/markets` route still resolves, but `/borrow/quote`
 * and mutations will fail without auth.
 */

import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import type {
  BorrowAction,
  BorrowMarket,
  BorrowMarketId,
  BorrowMarketPosition,
  BorrowQuote,
  BorrowReceipt,
} from '@eth-optimism/actions-sdk'
import type {
  BorrowQuoteParams,
  StubCloseParams,
  StubCollateralParams,
  StubOpenParams,
  StubRepayParams,
} from '@/api/borrowApi'
import { isEmptyPosition } from '@/api/borrowApi.serializers'
import { sameMarketId } from '@/utils/marketId'
import { useActivityLogger } from '@/hooks/useActivityLogger'
import {
  dispatchEarnPositionsChanged,
  EARN_POSITIONS_CHANGED_EVENT,
} from '@/utils/earnSync'

interface BorrowOperationParams {
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
    async (
      address: Address | null,
      isCancelled: () => boolean = () => false,
    ) => {
      if (!address) {
        if (isCancelled()) return
        // A null address means the wallet is still resolving (server-wallet
        // path fetches it async), not that there are no positions. Leave
        // isInitialLoad true so useCollateralStatus keeps failing safe until
        // the real address arrives and positions load.
        setBorrowPositions([])
        return
      }
      const activity = logActivity('getBorrowPosition')
      setIsLoadingPositions(true)
      try {
        // allSettled so one failing market doesn't blank out everything;
        // partial outage is better surfaced as a missing entry than as a
        // collapsed "no borrow" state in the Lend collateral check.
        const settled = await Promise.allSettled(
          markets.map((market) =>
            operations.getPosition(address, market.marketId),
          ),
        )
        if (isCancelled()) return
        const positions: BorrowMarketPosition[] = []
        let hadFailure = false
        for (const result of settled) {
          if (result.status === 'fulfilled') {
            if (result.value !== null) positions.push(result.value)
          } else {
            hadFailure = true
          }
        }
        setBorrowPositions(positions)
        if (hadFailure) activity?.error()
        else activity?.confirm()
      } catch (e) {
        if (isCancelled()) return
        activity?.error()
        throw e
      } finally {
        if (!isCancelled()) {
          setIsLoadingPositions(false)
          setIsInitialLoad(false)
        }
      }
    },
    [logActivity, markets, operations],
  )

  // Refetch positions whenever the active wallet changes. The cancelled
  // closure guards against late-resolving fetches from a previous wallet
  // overwriting the current wallet's state.
  useEffect(() => {
    setIsInitialLoad(true)
    let cancelled = false
    void fetchPositions(walletAddress, () => cancelled)
    return () => {
      cancelled = true
    }
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
      // Optimistic local update from the receipt so the table reflects the
      // new position before the backend refetch completes.
      if (receipt.positionAfter) {
        const next = receipt.positionAfter
        setBorrowPositions((current) => {
          const filtered = current.filter(
            (p) => !sameMarketId(p.marketId, next.marketId),
          )
          return isEmptyPosition(next) ? filtered : [...filtered, next]
        })
      }
      // Don't reconcile against the chain immediately. RPC propagation on
      // Base Sepolia commonly takes 1-3s after tx confirmation, so an
      // eager `fetchPositions` returns pre-tx state and clobbers the
      // optimistic update — the user sees the position revert until a
      // manual page refresh. Delay the reconciliation (and the cross-tab
      // event that the lend hook listens for) so both reads happen after
      // the new state has settled.
      window.setTimeout(() => {
        dispatchEarnPositionsChanged()
      }, 3000)
      await queryClient.invalidateQueries({ queryKey: ['tokenBalances'] })
      return receipt
    },
    [walletAddress, operations, queryClient],
  )

  const getQuote = useCallback<UseBorrowProviderReturn['getQuote']>(
    async (params) => {
      if (!walletAddress) throw new Error('Wallet not connected')
      return operations.getQuote(params as BorrowQuoteParams)
    },
    [walletAddress, operations],
  )

  const selectedMarketPosition =
    selectedMarket && borrowPositions.length > 0
      ? (borrowPositions.find((p) =>
          sameMarketId(p.marketId, selectedMarket.marketId),
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
    getQuote,
  }
}
