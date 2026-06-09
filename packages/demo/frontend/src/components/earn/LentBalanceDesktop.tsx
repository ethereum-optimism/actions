/**
 * Desktop table layout for the Lent Balance table.
 */

import type { MarketPosition } from '@/types/market'
import { displaySymbol } from '@/utils/tokenDisplay'
import { colors } from '../../constants/colors'
import { InfoTooltip } from './InfoTooltip'
import { DepositedAmount, type DisplayState } from './LentBalanceCells'

const APY_TOOLTIP =
  'Annual Percentage Yield: the rate of return earned on an investment over one year'

const headerStyle = {
  padding: '12px 6px',
  color: '#9195A6',
  fontSize: '12px',
  fontWeight: 500,
  fontFamily: 'Inter',
} as const

const cellLabelStyle = {
  color: '#1a1b1e',
  fontSize: '14px',
  fontWeight: 400,
  fontFamily: 'Inter',
} as const

export function LentBalanceDesktop({
  markets,
  hoveredAction,
  getDisplayState,
  getInterest,
}: {
  markets: MarketPosition[]
  hoveredAction: string | null
  getDisplayState: DisplayState
  getInterest?: (
    marketId: { address: string; chainId: number },
    currentOnChainBalance: string,
  ) => number
}) {
  const marketBg =
    hoveredAction === 'getMarket' ? colors.highlight.background : 'transparent'
  const positionBg =
    hoveredAction === 'getPosition'
      ? colors.highlight.background
      : 'transparent'

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #E0E2EB' }}>
          <th style={{ ...headerStyle, textAlign: 'left' }}>Market</th>
          <th style={{ ...headerStyle, textAlign: 'left' }}>Network</th>
          <th style={{ ...headerStyle, textAlign: 'left' }}>Asset</th>
          <th
            style={{ ...headerStyle, textAlign: 'right', position: 'relative' }}
          >
            <InfoTooltip label="APY" text={APY_TOOLTIP} />
          </th>
          <th style={{ ...headerStyle, textAlign: 'right' }}>Interest</th>
          <th style={{ ...headerStyle, textAlign: 'right' }}>Value</th>
        </tr>
      </thead>
      <tbody>
        {markets.map((market) => (
          <tr
            key={`desktop-${market.marketId.address}-${market.marketId.chainId}`}
          >
            <td
              className="transition-all"
              style={{ padding: '16px 6px', backgroundColor: marketBg }}
            >
              <div className="flex items-center gap-2">
                <img
                  src={market.marketLogo}
                  alt={market.marketName}
                  style={{ width: '20px', height: '20px' }}
                />
                <span
                  className="positions-table-market-label"
                  style={cellLabelStyle}
                >
                  {market.marketName}
                </span>
              </div>
            </td>
            <td
              className="transition-all"
              style={{ padding: '16px 6px', backgroundColor: marketBg }}
            >
              <div className="flex items-center gap-2">
                <img
                  src={market.networkLogo}
                  alt={market.networkName}
                  style={{ width: '20px', height: '20px' }}
                />
                <span
                  className="positions-table-network-label"
                  style={cellLabelStyle}
                >
                  {market.networkName}
                </span>
              </div>
            </td>
            <td
              className="transition-all"
              style={{ padding: '16px 6px', backgroundColor: marketBg }}
            >
              <div className="flex items-center gap-2">
                <img
                  src={market.assetLogo}
                  alt={market.asset.metadata.symbol}
                  style={{ width: '20px', height: '20px' }}
                />
                <span
                  className="positions-table-asset-label"
                  style={cellLabelStyle}
                >
                  {displaySymbol(market.asset.metadata.symbol)}
                </span>
              </div>
            </td>
            <td
              className="transition-all"
              style={{
                padding: '16px 6px',
                textAlign: 'right',
                backgroundColor: marketBg,
              }}
            >
              <span style={cellLabelStyle}>
                {market.apy !== null
                  ? `${(market.apy * 100).toFixed(2)}%`
                  : '0.00%'}
              </span>
            </td>
            <td
              className="transition-all"
              style={{
                padding: '16px 6px',
                textAlign: 'right',
                backgroundColor: positionBg,
              }}
            >
              <span
                style={{
                  color: '#22C55E',
                  fontSize: '14px',
                  fontWeight: 500,
                  fontFamily: 'Inter',
                }}
              >
                +
                {(getInterest
                  ? getInterest(market.marketId, market.depositedAmount || '0')
                  : 0
                ).toFixed(3)}
              </span>
            </td>
            <td
              className="transition-all"
              style={{
                padding: '16px 6px',
                textAlign: 'right',
                backgroundColor: positionBg,
              }}
            >
              <span
                style={{
                  color: '#1a1b1e',
                  fontSize: '14px',
                  fontWeight: 500,
                  fontFamily: 'Inter',
                }}
              >
                <DepositedAmount
                  market={market}
                  getDisplayState={getDisplayState}
                />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
