/**
 * Two-tone health bar: a solid fill for the post-action position plus a
 * barbershop-stripe delta segment that animates to read as "tentative".
 * When the action improves health the solid stops at the projected width
 * and the stripes dim the released tail; when it worsens, the solid stays
 * at the current width and the stripes extend it to the projected width.
 */
export function BorrowHealthBar({
  wouldLiquidate,
  currentBarPct,
  projectedBarPct,
  isImproving,
  showProjection,
  currentFill,
  projectedFill,
}: {
  wouldLiquidate: boolean
  currentBarPct: number
  projectedBarPct: number
  isImproving: boolean
  showProjection: boolean
  currentFill: string
  projectedFill: string
}) {
  return (
    <div
      data-testid="borrow-health-bar-shell"
      style={{
        width: '100%',
        borderRadius: '999px',
        padding: 0,
        boxShadow: wouldLiquidate ? '0 0 10px rgba(239, 68, 68, 0.3)' : 'none',
        animation: wouldLiquidate
          ? 'borrowHealthLiquidationGlow 2.4s ease-in-out infinite'
          : 'none',
      }}
    >
      <div
        data-testid="borrow-health-bar-track"
        style={{
          height: '6px',
          width: '100%',
          backgroundColor: wouldLiquidate ? '#FEE2E2' : '#E0E2EB',
          borderRadius: '999px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          data-testid="borrow-health-bar-current"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${
              wouldLiquidate
                ? 100
                : isImproving
                  ? projectedBarPct
                  : currentBarPct
            }%`,
            backgroundColor: wouldLiquidate
              ? '#EF4444'
              : isImproving
                ? projectedFill
                : currentFill,
            transition: 'width 200ms ease-in-out',
          }}
        />
        {!wouldLiquidate &&
          showProjection &&
          projectedBarPct !== currentBarPct && (
            <div
              data-testid="borrow-health-bar-projection"
              style={{
                position: 'absolute',
                top: 0,
                left: `${Math.min(currentBarPct, projectedBarPct)}%`,
                height: '100%',
                width: `${Math.abs(projectedBarPct - currentBarPct)}%`,
                backgroundImage: `repeating-linear-gradient(
                  -45deg,
                  ${isImproving ? currentFill : projectedFill} 0px,
                  ${isImproving ? currentFill : projectedFill} 4px,
                  rgba(255, 255, 255, 0.55) 4px,
                  rgba(255, 255, 255, 0.55) 8px
                )`,
                // Tile width = 20 stripe cycles (226.274px) so the looping animation has no visible seam.
                backgroundSize: '226.274px 100%',
                animation: `${
                  isImproving
                    ? 'borrowHealthBarbershopFlowLeft'
                    : 'borrowHealthBarbershopFlowRight'
                } 20s linear infinite`,
                opacity: 0.65,
                transition: 'left 200ms ease-in-out, width 200ms ease-in-out',
              }}
            />
          )}
      </div>
      <style>
        {`
          @keyframes borrowHealthLiquidationGlow {
            0%, 100% {
              box-shadow: 0 0 10px rgba(239, 68, 68, 0.28);
            }
            50% {
              box-shadow: 0 0 18px rgba(239, 68, 68, 0.48);
            }
          }
          /* Increasing background-position shifts the gradient rightward
             (stripes move right); decreasing it shifts left. Match the
             keyframe's visible motion to its name so the consumer
             (Improving → FlowLeft, Worsening → FlowRight) is obvious. */
          @keyframes borrowHealthBarbershopFlowLeft {
            from { background-position: 0 0; }
            to { background-position: -226.274px 0; }
          }
          @keyframes borrowHealthBarbershopFlowRight {
            from { background-position: 0 0; }
            to { background-position: 226.274px 0; }
          }
        `}
      </style>
    </div>
  )
}
