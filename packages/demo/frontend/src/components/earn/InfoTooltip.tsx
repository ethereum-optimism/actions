import { useEffect, useRef, useState, type ReactNode } from 'react'
import InfoIcon from '@/components/icons/InfoIcon'

/**
 * Info icon (optionally preceded by a `label`) that reveals a small
 * popover on hover. The popover is fixed-positioned above the trigger and
 * centered on it.
 */
export function InfoTooltip({
  text,
  label,
  size = 12,
}: {
  text: string
  label?: ReactNode
  size?: number
}) {
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
          gap: label ? '4px' : 0,
          cursor: 'help',
        }}
      >
        {label}
        <InfoIcon width={size} height={size} />
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
            maxWidth: '240px',
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            pointerEvents: 'none',
            fontFamily: 'Inter',
            textAlign: 'left',
          }}
        >
          {text}
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
