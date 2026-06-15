import type { CSSProperties } from 'react'

interface InfoIconProps {
  width?: number
  height?: number
  color?: string
  strokeWidth?: number
  style?: CSSProperties
}

function InfoIcon({
  width = 14,
  height = 14,
  color = '#9195A6',
  strokeWidth = 1.2,
  style,
}: InfoIconProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      style={style}
    >
      <circle cx="7" cy="7" r="5.5" stroke={color} strokeWidth={strokeWidth} />
      <path
        d="M7 4V7M7 9.25V9.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  )
}

export default InfoIcon
