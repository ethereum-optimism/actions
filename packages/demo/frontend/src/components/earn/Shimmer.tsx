interface ShimmerProps {
  width?: string
  height?: string
  variant?: 'rectangle' | 'circle'
}

function Shimmer({
  width = '100px',
  height = '20px',
  variant = 'rectangle',
}: ShimmerProps) {
  const borderRadius = variant === 'circle' ? '50%' : '6px'

  return (
    <div
      style={{
        width,
        height,
        minWidth: variant === 'circle' ? width : undefined,
        borderRadius,
        background:
          'linear-gradient(90deg, #F0F0F0 25%, #E0E0E0 50%, #F0F0F0 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 3.5s ease-in-out infinite',
      }}
    >
      <style>{`
        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </div>
  )
}

export default Shimmer
