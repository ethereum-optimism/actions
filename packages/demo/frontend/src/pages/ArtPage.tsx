import { colors } from '@/constants/colors'

const ASCII_ART = `
    █████████             █████     ███
   ███░░░░░███           ░░███     ░░░
  ░███    ░███   ██████  ███████   ████   ██████  ████████    █████
  ░███████████  ███░░███░░░███░   ░░███  ███░░███░░███░░███  ███░░
  ░███░░░░░███ ░███ ░░░   ░███     ░███ ░███ ░███ ░███ ░███ ░░█████
  ░███    ░███ ░███  ███  ░███ ███ ░███ ░███ ░███ ░███ ░███  ░░░░███
  █████   █████░░██████   ░░█████  █████░░██████  ████ █████ ██████
 ░░░░░   ░░░░░  ░░░░░░     ░░░░░  ░░░░░  ░░░░░░  ░░░░ ░░░░░ ░░░░░░
     `

const TILE_IMAGES = [
  '/stack/active/1.png',
  '/stack/active/2.png',
  '/stack/active/3.png',
  '/stack/active/4.png',
  '/stack/active/5.png',
  '/stack/active/6.png',
  '/stack/active/7.png',
]

export function ArtPage() {
  const tileSize = 400

  // Hardcoded absolute positions for each tile (left, top, zIndex)
  // Positioned to create isometric grid with gap
  const tilePositions = [
    { left: 600, top: 450, z: 10 }, // 1 - front center
    { left: 380, top: 340, z: 9 }, // 2 - back-left of 1
    { left: 820, top: 340, z: 9 }, // 3 - back-right of 1
    { left: 160, top: 230, z: 8 }, // 4 - back-left of 2
    { left: 600, top: 230, z: 8 }, // 5 - back center
    { left: 160, top: 450, z: 12 }, // 6 - bottom-left of 2 (in front of 7)
    { left: -60, top: 340, z: 11 }, // 7 - bottom-left of 4
  ]

  return (
    <div className="w-full min-h-screen bg-terminal-bg flex flex-col items-center justify-center overflow-hidden">
      <div
        style={{
          fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Menlo, Consolas, "Liberation Mono", "Courier New", monospace',
          color: colors.actionsRed,
          whiteSpace: 'pre',
          lineHeight: '0.75',
          letterSpacing: '0',
          fontVariantLigatures: 'none',
          fontFeatureSettings: '"liga" 0',
          fontSize: 'clamp(0.5rem, 2.5vw, 1.25rem)',
          marginBottom: '-12rem',
        }}
      >
        {ASCII_ART}
      </div>
      <div
        className="relative"
        style={{
          width: 1200,
          height: 700,
        }}
      >
        {tilePositions.map(({ left, top, z }, index) => (
          <img
            key={index}
            src={TILE_IMAGES[index]}
            alt={`Isometric tile ${index + 1}`}
            className="absolute pixelated"
            style={{
              width: tileSize,
              height: 'auto',
              left,
              top,
              zIndex: z,
            }}
          />
        ))}
      </div>
    </div>
  )
}
