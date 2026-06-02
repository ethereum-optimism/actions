/**
 * Debounced, race-safe backend preview for the Borrow form. Calls
 * `/borrow/quote` 250 ms after inputs settle, discards stale responses, and
 * returns a null preview on error so the caller falls back to its local projection.
 */

import { useEffect, useState } from 'react'
import type { BorrowMarket, BorrowQuote } from '@eth-optimism/actions-sdk'
import type { MarketPosition } from '@/types/market'
import type { UseBorrowProviderReturn } from '@/hooks/useBorrowProvider'

export function useBorrowQuotePreview({
  activeMarket,
  amountNum,
  mode,
  currentCollUsd,
  selectedLendPosition,
  getQuote,
}: {
  activeMarket: BorrowMarket | null
  amountNum: number
  mode: 'borrow' | 'repay'
  currentCollUsd: number
  selectedLendPosition: MarketPosition
  getQuote: UseBorrowProviderReturn['getQuote']
}): { livePreview: BorrowQuote | null; isPreviewLoading: boolean } {
  const [livePreview, setLivePreview] = useState<BorrowQuote | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)

  useEffect(() => {
    if (!activeMarket || amountNum <= 0) {
      setLivePreview(null)
      setIsPreviewLoading(false)
      return
    }
    let cancelled = false
    setIsPreviewLoading(true)
    const handle = setTimeout(async () => {
      try {
        const lendCollateralSharesRaw = selectedLendPosition.depositedSharesRaw
        const directCollateralSharesRaw =
          selectedLendPosition.directDepositedSharesRaw
        const params =
          mode === 'borrow'
            ? ({
                action: 'open' as const,
                marketId: activeMarket.marketId,
                borrowAmount: { amount: amountNum },
                // Fresh-open pledges the full vault-share balance; an existing position pledges only newly added direct shares.
                ...((currentCollUsd === 0 &&
                  lendCollateralSharesRaw !== null &&
                  lendCollateralSharesRaw > 0n) ||
                (currentCollUsd > 0 &&
                  directCollateralSharesRaw !== null &&
                  directCollateralSharesRaw > 0n)
                  ? {
                      collateralAmount: {
                        amountRaw:
                          currentCollUsd === 0
                            ? lendCollateralSharesRaw!
                            : directCollateralSharesRaw!,
                      },
                    }
                  : {}),
              } as const)
            : ({
                action: 'repay' as const,
                marketId: activeMarket.marketId,
                amount: { amount: amountNum },
              } as const)
        const quote = await getQuote(params)
        if (!cancelled) setLivePreview(quote)
      } catch {
        // Network / 4xx: fall back to the local projection.
        if (!cancelled) setLivePreview(null)
      } finally {
        if (!cancelled) setIsPreviewLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [
    activeMarket,
    amountNum,
    currentCollUsd,
    mode,
    selectedLendPosition,
    getQuote,
  ])

  return { livePreview, isPreviewLoading }
}
