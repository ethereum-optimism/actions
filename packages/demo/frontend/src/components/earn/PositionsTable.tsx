import type { ReactNode } from 'react'
import { colors } from '../../constants/colors'
import Shimmer from './Shimmer'

/**
 * Shared outer chrome for positions tables (LentBalance, BorrowPositions).
 *
 * Owns: card frame, title, shimmer-while-loading, empty state, and the
 * desktop-vs-mobile responsive switch.
 *
 * Consumers own: the actual table rows / mobile cards, including any
 * hover-highlight wiring that's specific to their activity-action keys.
 * Pass the rendered table as `desktopTable` and the rendered mobile
 * layout as `mobileLayout`. Consumers also compute their own
 * `isCardHighlighted` from `useActivityHighlight` and pass it in.
 */
export interface PositionsTableProps {
  title: string
  isInitialLoad?: boolean
  isEmpty?: boolean
  emptyContent?: ReactNode
  desktopTable: ReactNode
  mobileLayout: ReactNode
  isCardHighlighted?: boolean
}

export function PositionsTable({
  title,
  isInitialLoad = false,
  isEmpty = false,
  emptyContent,
  desktopTable,
  mobileLayout,
  isCardHighlighted = false,
}: PositionsTableProps) {
  return (
    <div
      className="w-full transition-all"
      style={{
        backgroundColor: isCardHighlighted
          ? colors.highlight.background
          : '#FFFFFF',
        border: `1px solid ${
          isCardHighlighted ? colors.highlight.border : '#E0E2EB'
        }`,
        borderRadius: '24px',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.06)',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <div className="py-6 px-6">
        <h2
          className="font-semibold"
          style={{ color: '#1a1b1e', fontSize: '16px', marginBottom: '16px' }}
        >
          {title}
        </h2>
        {isInitialLoad ? (
          <div className="flex items-start">
            <Shimmer width="100%" height="20px" variant="rectangle" />
          </div>
        ) : isEmpty ? (
          <div className="flex items-start font-normal text-sm leading-5 text-secondary">
            {emptyContent}
          </div>
        ) : (
          <>
            <div className="md:hidden flex flex-col gap-3">{mobileLayout}</div>
            <div
              className="hidden md:block positions-table-container"
              style={{
                overflowX: 'auto',
                overflowY: 'visible',
                containerType: 'inline-size',
                containerName: 'positions-table',
              }}
            >
              {desktopTable}
            </div>
            {/* Container queries collapse the per-row text labels only when
                the table container itself becomes very narrow. Logos stay so
                rows remain identifiable. Thresholds are intentionally low so
                that the typical sidebar-open layout still shows full labels. */}
            <style>{`
              @container positions-table (max-width: 680px) {
                .positions-table-secondary-digits { display: none; }
              }
              @container positions-table (max-width: 480px) {
                .positions-table-asset-label { display: none; }
              }
              @container positions-table (max-width: 380px) {
                .positions-table-market-label,
                .positions-table-network-label { display: none; }
              }
            `}</style>
          </>
        )}
      </div>
    </div>
  )
}
