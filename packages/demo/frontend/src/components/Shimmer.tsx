interface ShimmerProps {
  width?: string
  height?: string
  borderRadius?: string
}

function Shimmer({ width = '100px', height = '20px', borderRadius = '4px' }: ShimmerProps) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background: 'linear-gradient(90deg, #F0F0F0 25%, #E0E0E0 50%, #F0F0F0 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
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
