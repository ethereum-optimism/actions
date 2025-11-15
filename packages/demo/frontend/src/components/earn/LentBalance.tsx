import { useState, useRef, useEffect } from 'react'
import { useActivityHighlight } from '../../contexts/ActivityHighlightContext'
import { colors } from '../../constants/colors'
import type { MarketPosition } from '@/types/market'
import Shimmer from './Shimmer'

interface LentBalanceProps {
  marketPositions: MarketPosition[]
  isInitialLoad?: boolean
}

function LentBalance({
  marketPositions,
  isInitialLoad = false,
}: LentBalanceProps) {
  const { hoveredAction } = useActivityHighlight()
  const [showApyTooltip, setShowApyTooltip] = useState(false)
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 })
  const apyRef = useRef<HTMLDivElement>(null)

  // Filter to only show markets with deposits > 0
  const marketsWithDeposits = marketPositions.filter(
    (market) =>
      market.depositedAmount &&
      market.depositedAmount !== '0' &&
      market.depositedAmount !== '0.00' &&
      parseFloat(market.depositedAmount) > 0,
  )

  const isEmpty = !isInitialLoad && marketsWithDeposits.length === 0

  useEffect(() => {
    if (showApyTooltip && apyRef.current) {
      const rect = apyRef.current.getBoundingClientRect()
      setTooltipPos({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
      })
    }
  }, [showApyTooltip])
  // Format deposited amount to 4 decimals and return parts
  const formatDepositedAmount = (amount: string) => {
    const num = parseFloat(amount)
    if (isNaN(num)) return { main: '0.00', secondary: '00' }

    const formatted = num.toFixed(4)
    const parts = formatted.split('.')
    const wholePart = parts[0]
    const decimalPart = parts[1] || '0000'

    return {
      main: `${wholePart}.${decimalPart.substring(0, 2)}`,
      secondary: decimalPart.substring(2, 4),
    }
  }

  return (
    <>
      <div
        className="w-full"
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E0E2EB',
          borderRadius: '24px',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
      >
        <div className="py-6 px-6">
          <h2
            className="font-semibold"
            style={{ color: '#1a1b1e', fontSize: '16px', marginBottom: '16px' }}
          >
            Lent Balance
          </h2>
          {isInitialLoad ? (
            // Shimmer state - matches empty state text height
            <div className="flex items-start">
              <Shimmer width="100%" height="20px" variant="rectangle" />
            </div>
          ) : isEmpty ? (
            <div className="flex items-start font-normal text-sm leading-5 text-secondary">
              No active markets yet. Lend to see your balances here.
            </div>
          ) : (
            <>
              {/* Table */}
              <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  {/* Header */}
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E0E2EB' }}>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: '12px 8px',
                          color: '#9195A6',
                          fontSize: '12px',
                          fontWeight: 500,
                          fontFamily: 'Inter',
                          minWidth: '120px',
                        }}
                      >
                        Market
                      </th>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: '12px 8px',
                          color: '#9195A6',
                          fontSize: '12px',
                          fontWeight: 500,
                          fontFamily: 'Inter',
                          minWidth: '130px',
                        }}
                      >
                        Network
                      </th>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: '12px 8px',
                          color: '#9195A6',
                          fontSize: '12px',
                          fontWeight: 500,
                          fontFamily: 'Inter',
                          minWidth: '80px',
                        }}
                      >
                        Asset
                      </th>
                      <th
                        style={{
                          textAlign: 'right',
                          padding: '12px 8px',
                          color: '#9195A6',
                          fontSize: '12px',
                          fontWeight: 500,
                          fontFamily: 'Inter',
                          minWidth: '70px',
                          position: 'relative',
                        }}
                      >
                        <div
                          ref={apyRef}
                          onMouseEnter={() => setShowApyTooltip(true)}
                          onMouseLeave={() => setShowApyTooltip(false)}
                          style={{
                            display: 'inline-flex',
                            cursor: 'pointer',
                          }}
                        >
                          APY
                        </div>
                      </th>
                      <th
                        style={{
                          textAlign: 'right',
                          padding: '12px 8px',
                          color: '#9195A6',
                          fontSize: '12px',
                          fontWeight: 500,
                          fontFamily: 'Inter',
                          minWidth: '100px',
                        }}
                      >
                        Value
                      </th>
                    </tr>
                  </thead>

                  {/* Body */}
                  <tbody>
                    {marketsWithDeposits.map((market) => (
                      <tr
                        key={`${market.marketId.address}-${market.marketId.chainId}`}
                      >
                        <td
                          className="transition-all"
                          style={{
                            padding: '16px 8px',
                            backgroundColor:
                              hoveredAction === 'getMarket'
                                ? colors.highlight.background
                                : 'transparent',
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <img
                              src={market.marketLogo}
                              alt={market.marketName}
                              style={{ width: '20px', height: '20px' }}
                            />
                            <span
                              style={{
                                color: '#1a1b1e',
                                fontSize: '14px',
                                fontWeight: 400,
                                fontFamily: 'Inter',
                              }}
                            >
                              {market.marketName}
                            </span>
                          </div>
                        </td>
                        <td
                          className="transition-all"
                          style={{
                            padding: '16px 8px',
                            backgroundColor:
                              hoveredAction === 'getMarket'
                                ? colors.highlight.background
                                : 'transparent',
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <img
                              src={market.networkLogo}
                              alt={market.networkName}
                              style={{ width: '20px', height: '20px' }}
                            />
                            <span
                              style={{
                                color: '#1a1b1e',
                                fontSize: '14px',
                                fontWeight: 400,
                                fontFamily: 'Inter',
                              }}
                            >
                              {market.networkName}
                            </span>
                          </div>
                        </td>
                        <td
                          className="transition-all"
                          style={{
                            padding: '16px 8px',
                            backgroundColor:
                              hoveredAction === 'getMarket'
                                ? colors.highlight.background
                                : 'transparent',
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <img
                              src={market.assetLogo}
                              alt={market.assetSymbol}
                              style={{ width: '20px', height: '20px' }}
                            />
                            <span
                              style={{
                                color: '#1a1b1e',
                                fontSize: '14px',
                                fontWeight: 400,
                                fontFamily: 'Inter',
                              }}
                            >
                              {market.assetSymbol?.replace('_DEMO', '')}
                            </span>
                          </div>
                        </td>
                        <td
                          className="transition-all"
                          style={{
                            padding: '16px 8px',
                            textAlign: 'right',
                            backgroundColor:
                              hoveredAction === 'getMarket'
                                ? colors.highlight.background
                                : 'transparent',
                          }}
                        >
                          <span
                            style={{
                              color: '#1a1b1e',
                              fontSize: '14px',
                              fontWeight: 400,
                              fontFamily: 'Inter',
                            }}
                          >
                            {market.apy !== null
                              ? `${(market.apy * 100).toFixed(2)}%`
                              : '0.00%'}
                          </span>
                        </td>
                        <td
                          className="transition-all"
                          style={{
                            padding: '16px 8px',
                            textAlign: 'right',
                            backgroundColor:
                              hoveredAction === 'getPosition'
                                ? colors.highlight.background
                                : 'transparent',
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
                            {market.assetSymbol !== 'WETH' && '$'}
                            {
                              formatDepositedAmount(
                                market.depositedAmount || '0',
                              ).main
                            }
                            <span
                              style={{
                                color: '#9195A6',
                                fontSize: '12px',
                              }}
                            >
                              {
                                formatDepositedAmount(
                                  market.depositedAmount || '0',
                                ).secondary
                              }
                            </span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
      {showApyTooltip && (
        <div
          style={{
            position: 'fixed',
            top: `${tooltipPos.top}px`,
            left: `${tooltipPos.left}px`,
            transform: 'translate(-50%, -100%)',
            padding: '8px 12px',
            backgroundColor: 'rgba(0, 0, 0, 0.56)',
            color: '#FFFFFF',
            fontSize: '12px',
            borderRadius: '6px',
            whiteSpace: 'nowrap',
            zIndex: 9999,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            pointerEvents: 'none',
          }}
        >
          Annual Percentage Yield: the rate of return earned on an investment
          over one year
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: '4px solid rgba(0, 0, 0, 0.56)',
            }}
          />
        </div>
      )}
    </>
  )
}

export default LentBalance
