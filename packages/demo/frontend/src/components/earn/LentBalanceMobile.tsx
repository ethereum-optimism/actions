/**
 * Mobile stacked-card layout for the Lent Balance table.
 */

import type { MarketPosition } from '@/types/market'
import { displaySymbol } from '@/utils/tokenDisplay'
import { colors } from '../../constants/colors'
import { DepositedAmount, type DisplayState } from './LentBalanceCells'

export function LentBalanceMobile({
  markets,
  hoveredAction,
  getDisplayState,
}: {
  markets: MarketPosition[]
  hoveredAction: string | null
  getDisplayState: DisplayState
}) {
  return (
    <>
      {markets.map((market, index) => (
        <div
          key={`mobile-${market.marketId.address}-${market.marketId.chainId}`}
          className="transition-all"
          style={{
            borderTop: index > 0 ? '1px solid #E0E2EB' : 'none',
            paddingTop: index > 0 ? '12px' : '0',
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <div
              className="flex items-center gap-2 transition-all rounded px-1 -mx-1"
              style={{
                backgroundColor:
                  hoveredAction === 'getMarket'
                    ? colors.highlight.background
                    : 'transparent',
              }}
            >
              <img
                src={market.assetLogo}
                alt={market.asset.metadata.symbol}
                style={{ width: '20px', height: '20px' }}
              />
              <span
                style={{
                  color: '#1a1b1e',
                  fontSize: '14px',
                  fontWeight: 500,
                  fontFamily: 'Inter',
                }}
              >
                {displaySymbol(market.asset.metadata.symbol)}
              </span>
              <span
                style={{
                  color: '#9195A6',
                  fontSize: '12px',
                  fontFamily: 'Inter',
                }}
              >
                {market.apy !== null
                  ? `${(market.apy * 100).toFixed(2)}%`
                  : '0.00%'}
              </span>
            </div>
            <span
              className="transition-all rounded px-1"
              style={{
                color: '#1a1b1e',
                fontSize: '14px',
                fontWeight: 500,
                fontFamily: 'Inter',
                backgroundColor:
                  hoveredAction === 'getPosition'
                    ? colors.highlight.background
                    : 'transparent',
              }}
            >
              <DepositedAmount
                market={market}
                getDisplayState={getDisplayState}
              />
            </span>
          </div>
          <div
            className="flex items-center gap-1 transition-all rounded px-1 -mx-1"
            style={{
              backgroundColor:
                hoveredAction === 'getMarket'
                  ? colors.highlight.background
                  : 'transparent',
            }}
          >
            <img
              src={market.marketLogo}
              alt={market.marketName}
              style={{ width: '16px', height: '16px' }}
            />
            <span
              style={{
                color: '#9195A6',
                fontSize: '12px',
                fontFamily: 'Inter',
              }}
            >
              {market.marketName}
            </span>
            <span style={{ color: '#9195A6', fontSize: '12px' }}>·</span>
            <img
              src={market.networkLogo}
              alt={market.networkName}
              style={{ width: '16px', height: '16px' }}
            />
            <span
              style={{
                color: '#9195A6',
                fontSize: '12px',
                fontFamily: 'Inter',
              }}
            >
              {market.networkName}
            </span>
          </div>
        </div>
      ))}
    </>
  )
}
