/**
 * Active Positions table for the Borrow tab.
 *
 * Delegates to a desktop grid layout and a mobile stacked-card layout.
 */

import type { BorrowMarketPosition } from '@eth-optimism/actions-sdk'
import { useActivityHighlight } from '@/contexts/ActivityHighlightContext'
import { PositionsTable } from '../PositionsTable'
import { DesktopTable } from './BorrowPositionsDesktop'
import { MobileCards } from './BorrowPositionsMobile'

export interface BorrowPositionsProps {
  positions: readonly BorrowMarketPosition[]
}

export function BorrowPositions({ positions }: BorrowPositionsProps) {
  const { hoveredAction } = useActivityHighlight()
  const isCardHighlighted =
    hoveredAction === 'getBorrowPosition' ||
    hoveredAction === 'getBorrowMarkets'

  if (positions.length === 0) return null

  return (
    <PositionsTable
      title="Active Positions"
      isCardHighlighted={isCardHighlighted}
      desktopTable={
        <DesktopTable positions={positions} hoveredAction={hoveredAction} />
      }
      mobileLayout={
        <MobileCards positions={positions} hoveredAction={hoveredAction} />
      }
    />
  )
}
