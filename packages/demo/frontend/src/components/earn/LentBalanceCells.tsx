/**
 * Shared cells for the Lent Balance table (desktop + mobile).
 */

import type { MarketPosition } from '@/types/market'
import { formatAmountParts } from '@/utils/tokenDisplay'
import { isEthSymbol } from '@/utils/assetUtils'
import Shimmer from './Shimmer'

export type DisplayState = (market: MarketPosition) => {
  loading: boolean
  amount: string
}

/** Deposited value cell: a shimmer while loading, else `$`-prefixed amount. */
export function DepositedAmount({
  market,
  getDisplayState,
}: {
  market: MarketPosition
  getDisplayState: DisplayState
}) {
  const { loading, amount } = getDisplayState(market)
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Shimmer width="60px" height="16px" variant="rectangle" />
      </div>
    )
  }
  const fmt = formatAmountParts(
    amount,
    isEthSymbol(market.asset.metadata.symbol),
  )
  return (
    <>
      {market.asset.metadata.symbol !== 'ETH' && '$'}
      {fmt.main}
      <span style={{ color: '#9195A6', fontSize: '12px' }}>
        {fmt.secondary}
      </span>
    </>
  )
}
