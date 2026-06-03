interface CaretDownIconProps {
  width?: number
  height?: number
  color?: string
}

function CaretDownIcon({
  width = 12,
  height = 12,
  color = '#1a1b1e',
}: CaretDownIconProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default CaretDownIcon
