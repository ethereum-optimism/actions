import morphoLogo from '../assets/morpho-logo-light.svg'
import Shimmer from './Shimmer'

interface LentBalanceProps {
  depositedAmount: string | null
  apy: number | null
  isLoadingPosition: boolean
  isLoadingApy: boolean
  isInitialLoad?: boolean
}

function LentBalance({
  depositedAmount,
  apy,
  isLoadingPosition,
  isLoadingApy,
  isInitialLoad = false,
}: LentBalanceProps) {
  const isEmpty = !isLoadingPosition && !isLoadingApy && depositedAmount === '0'
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
        {isEmpty ? (
          <div className="flex items-start font-normal text-sm leading-5 text-secondary">
            No active markets yet. Lend to see your balances here.
          </div>
        ) : (
          <>
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
                  <tr>
                    <td style={{ padding: '16px 8px' }}>
                      {isInitialLoad ? (
                        <Shimmer
                          width="120px"
                          height="20px"
                          borderRadius="4px"
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <img
                            src={morphoLogo}
                            alt="Morpho"
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
                            Gauntlet
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '16px 8px' }}>
                      {isInitialLoad ? (
                        <Shimmer
                          width="110px"
                          height="20px"
                          borderRadius="4px"
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <img
                            src="/base-logo.svg"
                            alt="Base"
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
                            Base Sepolia
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '16px 8px' }}>
                      {isInitialLoad ? (
                        <Shimmer
                          width="60px"
                          height="20px"
                          borderRadius="4px"
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <img
                            src="/usd-coin-usdc-logo.svg"
                            alt="USDC"
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
                            USDC
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '16px 8px', textAlign: 'right' }}>
                      {isInitialLoad || isLoadingApy ? (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                          }}
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
                          {apy !== null
                            ? `${(apy * 100).toFixed(2)}%`
                            : '0.00%'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '16px 8px', textAlign: 'right' }}>
                      {isInitialLoad || isLoadingPosition ? (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                          }}
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
                          ${formatDepositedAmount(depositedAmount || '0').main}
                          <span
                            style={{
                              color: '#9195A6',
                              fontSize: '12px',
                            }}
                          >
                            {
                              formatDepositedAmount(depositedAmount || '0')
                                .secondary
                            }
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default LentBalance
