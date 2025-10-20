import Shimmer from './Shimmer'
import type { MarketPosition } from '@/types/market'

interface LentBalanceProps {
  markets: MarketPosition[]
  isInitialLoad?: boolean
}

function LentBalance({ markets, isInitialLoad = false }: LentBalanceProps) {
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

        {/* Table */}
        <div style={{ overflow: 'auto' }}>
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
                  }}
                >
                  APY
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
              {markets.map((market, index) => (
                <tr key={index}>
                  <td style={{ padding: '16px 8px' }}>
                    {isInitialLoad ? (
                      <Shimmer width="120px" height="20px" borderRadius="4px" />
                    ) : (
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
                    )}
                  </td>
                  <td style={{ padding: '16px 8px' }}>
                    {isInitialLoad ? (
                      <Shimmer width="110px" height="20px" borderRadius="4px" />
                    ) : (
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
                    )}
                  </td>
                  <td style={{ padding: '16px 8px' }}>
                    {isInitialLoad ? (
                      <Shimmer width="60px" height="20px" borderRadius="4px" />
                    ) : (
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
                          {market.assetSymbol}
                        </span>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '16px 8px', textAlign: 'right' }}>
                    {isInitialLoad || market.isLoadingApy ? (
                      <div
                        style={{ display: 'flex', justifyContent: 'flex-end' }}
                      >
                        <Shimmer
                          width="50px"
                          height="20px"
                          borderRadius="4px"
                        />
                      </div>
                    ) : (
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
                    )}
                  </td>
                  <td style={{ padding: '16px 8px', textAlign: 'right' }}>
                    {isInitialLoad || market.isLoadingPosition ? (
                      <div
                        style={{ display: 'flex', justifyContent: 'flex-end' }}
                      >
                        <Shimmer
                          width="70px"
                          height="20px"
                          borderRadius="4px"
                        />
                      </div>
                    ) : (
                      <span
                        style={{
                          color: '#1a1b1e',
                          fontSize: '14px',
                          fontWeight: 500,
                          fontFamily: 'Inter',
                        }}
                      >
                        $
                        {
                          formatDepositedAmount(market.depositedAmount || '0')
                            .main
                        }
                        <span
                          style={{
                            color: '#9195A6',
                            fontSize: '12px',
                          }}
                        >
                          {
                            formatDepositedAmount(market.depositedAmount || '0')
                              .secondary
                          }
                        </span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default LentBalance
