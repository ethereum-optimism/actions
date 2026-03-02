import type { SwapAsset } from '@/hooks/useSwapAssets'
import { displaySymbol, getTokenName, isStablecoin } from '@/utils/tokenDisplay'

import { Modal } from '../Modal'

export function TokenSelectModal({
  isOpen,
  onClose,
  assets,
  onSelect,
}: {
  isOpen: boolean
  onClose: () => void
  assets: SwapAsset[]
  onSelect: (index: number) => void
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="420px">
      <div style={{ margin: '-24px' }}>
        <div
          className="flex items-center justify-between"
          style={{ padding: '20px 24px 16px' }}
        >
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1b1e' }}>
            Select a token
          </h2>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: '#666666',
              fontSize: '20px',
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        <div style={{ padding: '0 8px 8px' }}>
          {assets.map((asset, index) => {
            const symbol = displaySymbol(asset.asset.metadata.symbol)
            const name = getTokenName(asset.asset.metadata.symbol)
            const balance = asset.balance
            const usdValue = isStablecoin(asset.asset.metadata.symbol)
              ? `$${parseFloat(balance).toFixed(2)}`
              : null

            return (
              <button
                key={asset.asset.metadata.symbol}
                onClick={() => {
                  onSelect(index)
                  onClose()
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '12px 16px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  borderRadius: '12px',
                  fontFamily: 'Inter',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F9FAFB'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <img
                  src={asset.logo}
                  alt={symbol}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    marginRight: '12px',
                  }}
                />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 500,
                      color: '#1a1b1e',
                    }}
                  >
                    {name}
                  </div>
                  <div style={{ fontSize: '14px', color: '#9195A6' }}>
                    {symbol}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 500,
                      color: '#1a1b1e',
                    }}
                  >
                    {usdValue ?? balance}
                  </div>
                  {usdValue && (
                    <div style={{ fontSize: '14px', color: '#9195A6' }}>
                      {balance}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
