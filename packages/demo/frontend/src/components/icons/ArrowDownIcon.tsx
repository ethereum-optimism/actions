interface ArrowDownIconProps {
  width?: number
  height?: number
  color?: string
}

function ArrowDownIcon({
  width = 16,
  height = 16,
  color = '#9195A6',
}: ArrowDownIconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 16 16" fill="none">
      <path
        d="M8 3V13M8 13L4 9M8 13L12 9"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default ArrowDownIcon
