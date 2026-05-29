import { useEffect, useRef, useState } from 'react'
import InfoIcon from '@/components/icons/InfoIcon'

/**
 * "Borrow APY" header label with a help-cursor info icon. Hovering the
 * label shows a tooltip explaining how the rate is computed and behaves.
 * Wording is grounded in Morpho's IRM docs: the rate is per-second,
 * applied with continuous compounding (`(1 + r)^secondsPerYear - 1` in
 * effect), and adjusts as the market's utilization moves relative to its
 * target.
 */
export function BorrowApyHeaderLabel() {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (show && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setPos({ top: rect.top - 8, left: rect.left + rect.width / 2 })
    }
  }, [show])

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          cursor: 'help',
        }}
      >
        APY
        <InfoIcon width={12} height={12} />
      </span>
      {show && (
        <div
          style={{
            position: 'fixed',
            top: `${pos.top}px`,
            left: `${pos.left}px`,
            transform: 'translate(-50%, -100%)',
            padding: '10px 14px',
            backgroundColor: 'rgba(0, 0, 0, 0.78)',
            color: '#FFFFFF',
            fontSize: '12px',
            lineHeight: 1.4,
            borderRadius: '8px',
            maxWidth: '280px',
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            pointerEvents: 'none',
            fontFamily: 'Inter',
            textAlign: 'left',
            fontWeight: 400,
          }}
        >
          The annualized interest rate paid on your borrowed amount. Interest
          accrues to your debt continuously, and the rate adjusts as the
          market's utilization changes.
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
              borderTop: '4px solid rgba(0, 0, 0, 0.78)',
            }}
          />
        </div>
      )}
    </>
  )
}
