import { useState } from 'react'

interface ActionProps {
  usdcBalance: string
  isLoadingBalance: boolean
  onMintUSDC?: () => void
}

function Action({ usdcBalance, isLoadingBalance, onMintUSDC }: ActionProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const [mode, setMode] = useState<'lend' | 'withdraw'>('lend')

  // TODO: NEED TO IMPLEMENT
  const handleLendUSDC = async () => {
    setIsLoading(true)
    try {
      // TODO: Add lend USDC logic here
      console.log('Lending USDC...')
      await new Promise(resolve => setTimeout(resolve, 2000)) // Simulate API call
    } catch (error) {
      console.error('Error lending USDC:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className="w-full"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E0E2EB',
        borderRadius: '24px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
      }}
    >
      <div className="py-6 px-6">
        <h2
          className="font-semibold"
          style={{ color: '#1a1b1e', fontSize: '16px', marginBottom: '12px' }}
        >
          Wallet Balance
        </h2>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/usd-coin-usdc-logo.svg"
              alt="USDC"
              style={{
                width: '20px',
                height: '20px'
              }}
            />
            <span style={{
              color: '#000',
              fontFamily: 'Inter',
              fontSize: '14px',
              fontStyle: 'normal',
              fontWeight: 400,
              lineHeight: '20px'
            }}>
              USDC
            </span>
          </div>
          {isLoadingBalance ? (
            <span style={{
              color: '#404454',
              fontFamily: 'Inter',
              fontSize: '14px',
              fontWeight: 500
            }}>
              Loading...
            </span>
          ) : parseFloat(usdcBalance) === 0 ? (
            <button
              onClick={onMintUSDC}
              className="flex items-center gap-1.5 py-1.5 px-3 transition-all hover:bg-gray-50"
              style={{
                backgroundColor: '#FFFFFF',
                color: '#1a1b1e',
                fontSize: '14px',
                fontWeight: 500,
                borderRadius: '6px',
                border: '1px solid #E0E2EB',
                cursor: 'pointer',
                fontFamily: 'Inter'
              }}
            >
              Get 100 USDC
            </button>
          ) : (
            <span style={{
              color: '#404454',
              fontFamily: 'Inter',
              fontSize: '14px',
              fontWeight: 500
            }}>
              {usdcBalance}
            </span>
          )}
        </div>
      </div>

      <div style={{ borderBottom: '1px solid #E0E2EB' }}></div>

      <div className="py-6 px-6" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2" style={{ position: 'relative' }}>
            <span style={{
              color: '#000',
              fontSize: '14px',
            }}>
              Demo APY
            </span>
            <div
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              style={{ position: 'relative', display: 'inline-flex', cursor: 'pointer' }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#666666"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {showTooltip && (
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%) translateY(-8px)',
                  padding: '8px 12px',
                  backgroundColor: 'rgba(0, 0, 0, 0.56)',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  borderRadius: '6px',
                  whiteSpace: 'nowrap',
                  zIndex: 10,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                }}>
                  For demo only. Real APYs vary by market and provider.
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 0,
                    height: 0,
                    borderLeft: '4px solid transparent',
                    borderRight: '4px solid transparent',
                    borderTop: '4px solid rgba(0, 0, 0, 0.56)'
                  }} />
                </div>
              )}
            </div>
          </div>
          <span style={{
            color:  '#000',
            fontFamily: 'Inter',
            fontSize: '14px',
            fontWeight: 500
          }}>
            30.90%
          </span>
        </div>

        <div style={{
          display: 'flex',
          width: '100%',
          backgroundColor: '#F5F5F7',
          borderRadius: '10px',
          padding: '3px',
        }}>
          <button
            onClick={() => setMode('lend')}
            style={{
              flex: 1,
              padding: '10px 32px',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 500,
              fontFamily: 'Inter',
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: mode === 'lend' ? '#FFFFFF' : 'transparent',
              color: mode === 'lend' ? '#000' : '#666',
              boxShadow: mode === 'lend' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none'
            }}
          >
            Lend
          </button>
          <button
            onClick={() => setMode('withdraw')}
            style={{
              flex: 1,
              padding: '10px 32px',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 500,
              fontFamily: 'Inter',
              cursor: 'pointer',
              transition: 'all 0.2s',
              backgroundColor: mode === 'withdraw' ? '#FFFFFF' : 'transparent',
              color: mode === 'withdraw' ? '#000' : '#666',
              boxShadow: mode === 'withdraw' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none'
            }}
          >
            Withdraw
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{
              color: '#000',
              fontFamily: 'Inter',
              fontSize: '14px',
              fontStyle: 'normal',
              fontWeight: 400,
              lineHeight: '20px'
            }}>
              Your Deposited Assets
            </span>
            <span style={{
              color: '#9195A6',
              fontFamily: 'Inter',
              fontSize: '14px',
              fontWeight: 400
            }}>
              Principal + Interest
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{
              color: '#000',
              fontSize: '14px',
              fontWeight: 500
            }}>
              0.00 USDC
            </span>
            <img
              src="/usd-coin-usdc-logo.svg"
              alt="USDC"
              style={{
                width: '20px',
                height: '20px'
              }}
            />
          </div>
        </div>

        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px'
          }}>
            <label style={{
              color: '#0F111A',
              fontSize: '16px',
              fontWeight: 600,
              display: 'block'
            }}>
              {mode === 'lend' ? 'Amount to lend' : 'Amount to withdraw'}
            </label>
            <button
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '16px',
                fontWeight: 400,
                color: '#3374DB',
                cursor: 'pointer',
              }}
            >
              Max
            </button>
          </div>
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            border: '1px solid #E0E2EB',
            borderRadius: '12px',
            padding: '12px 16px',
            backgroundColor: '#FFFFFF'
          }}>
            <input
              type="text"
              placeholder="0"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: '16px',
                color: '#000',
                backgroundColor: 'transparent',
                fontFamily: 'Inter'
              }}
            />
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              paddingLeft: '12px',
              borderLeft: '1px solid #E0E2EB'
            }}>
              <span style={{
                color: '#9195A6',
                fontSize: '14px',
                fontWeight: 600,
                fontFamily: 'Inter'
              }}>
                USDC
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={handleLendUSDC}
          disabled={isLoading}
          className="w-full py-3 px-4 font-medium transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: '#FF0420',
            color: '#FFFFFF',
            fontSize: '16px',
            borderRadius: '12px'
          }}
        >
          {isLoading ? 'Processing...' : (mode === 'lend' ? 'Lend USDC' : 'Withdraw USDC')}
        </button>
      </div>
    </div>
  )
}

export default Action