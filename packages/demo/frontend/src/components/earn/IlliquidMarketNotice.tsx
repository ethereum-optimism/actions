export function IlliquidMarketNotice({ maxWithdraw }: { maxWithdraw: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 16px',
        backgroundColor: '#EFF6FF',
        border: '1px solid #BFDBFE',
        borderRadius: '8px',
        fontSize: '14px',
        color: '#1E40AF',
        fontWeight: 500,
      }}
    >
      <span style={{ fontSize: '16px' }}>ℹ️</span>
      <span>
        For the purposes of this demo, this testnet market only allows{' '}
        {maxWithdraw} withdrawals.
      </span>
    </div>
  )
}
