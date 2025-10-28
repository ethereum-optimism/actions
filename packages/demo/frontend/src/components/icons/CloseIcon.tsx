interface CloseIconProps {
  width?: number
  height?: number
  color?: string
}

function CloseIcon({
  width = 24,
  height = 24,
  color = '#1a1b1e',
}: CloseIconProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export default CloseIcon
