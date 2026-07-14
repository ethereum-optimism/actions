import { useActivityHighlight } from '../../contexts/ActivityHighlightContext'
import type { MarketPosition } from '@/types/market'
import { PositionsTable } from './PositionsTable'
import { LentBalanceDesktop } from './LentBalanceDesktop'
import { LentBalanceMobile } from './LentBalanceMobile'

interface LentBalanceProps {
  marketPositions: MarketPosition[]
  isInitialLoad?: boolean
  isLoadingPosition?: boolean
  currentDepositedAmount?: string | null
  selectedMarketId?: { address: string; chainId: number }
  getInterest?: (
    marketId: { address: string; chainId: number },
    currentOnChainBalance: string,
  ) => number
}

function LentBalance({
  marketPositions,
  isInitialLoad = false,
  isLoadingPosition = false,
  currentDepositedAmount,
  selectedMarketId,
  getInterest,
}: LentBalanceProps) {
  const { hoveredAction } = useActivityHighlight()

  const isSelectedMarket = (market: MarketPosition): boolean =>
    !!selectedMarketId &&
    market.marketId.address.toLowerCase() ===
      selectedMarketId.address.toLowerCase() &&
    market.marketId.chainId === selectedMarketId.chainId

  // For the selected market, always use the authoritative value from the position query.
  // Show shimmer only while isLoadingPosition is true.
  // This avoids stale flashes because both values come from the same source (useWalletBalance).
  const getDisplayState = (
    market: MarketPosition,
  ): { loading: boolean; amount: string } => {
    if (!isSelectedMarket(market)) {
      return { loading: false, amount: market.depositedAmount || '0' }
    }
    if (isLoadingPosition) {
      return { loading: true, amount: '0' }
    }
    return {
      loading: false,
      amount: currentDepositedAmount ?? market.depositedAmount ?? '0',
    }
  }

  const marketsWithDeposits = marketPositions
    .filter(
      (market) =>
        market.depositedAmount &&
        market.depositedAmount !== '0' &&
        market.depositedAmount !== '0.00' &&
        parseFloat(market.depositedAmount) > 0,
    )
    .sort((a, b) => {
      const assetA = a.asset.metadata.symbol || ''
      const assetB = b.asset.metadata.symbol || ''
      return assetA.localeCompare(assetB)
    })

  const isEmpty = !isInitialLoad && marketsWithDeposits.length === 0
  const isCardHighlighted =
    hoveredAction === 'getMarket' || hoveredAction === 'getPosition'

  return (
    <PositionsTable
      title="Lent Balance"
      isInitialLoad={isInitialLoad}
      isEmpty={isEmpty}
      emptyContent="No active markets yet. Lend to see your balances here."
      isCardHighlighted={isCardHighlighted}
      desktopTable={
        <LentBalanceDesktop
          markets={marketsWithDeposits}
          hoveredAction={hoveredAction}
          getDisplayState={getDisplayState}
          getInterest={getInterest}
        />
      }
      mobileLayout={
        <LentBalanceMobile
          markets={marketsWithDeposits}
          hoveredAction={hoveredAction}
          getDisplayState={getDisplayState}
        />
      }
    />
  )
}

export default LentBalance
