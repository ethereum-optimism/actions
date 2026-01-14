import { colors } from '@/constants/colors'
import {
  TerminalIcon,
  DocumentIcon,
  GithubIcon,
  ChatBubbleIcon,
} from '@/assets/icons'

const TILE_IMAGES = [
  '/stack/active/1.png',
  '/stack/active/2.png',
  '/stack/active/3.png',
  '/stack/active/4.png',
  '/stack/active/5.png',
  '/stack/active/6.png',
  '/stack/active/7.png',
]

const TILE_POSITIONS = [
  { left: 380, top: 340, z: 9 },
  { left: 600, top: 450, z: 10 },
  { left: 820, top: 340, z: 9 },
  { left: 160, top: 230, z: 8 },
  { left: 600, top: 230, z: 8 },
  { left: 160, top: 450, z: 12 },
  { left: -60, top: 340, z: 11 },
]

interface TakeActionProps {
  showGithub?: boolean
  compact?: boolean
}

function TakeAction({ showGithub = false, compact = false }: TakeActionProps) {
  const tileSize = 500 // Large for full background

  return (
    <div className={`pt-8 ${compact ? 'pb-8' : 'pb-64'} text-center relative`}>
      {/* Background tiles */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-visible"
        style={{ opacity: 0.15, transform: 'translate(-110px, -200px)' }}
      >
        <div className="relative" style={{ width: 1500, height: 875 }}>
          {TILE_POSITIONS.map(({ left, top, z }, index) => (
            <img
              key={index}
              src={TILE_IMAGES[index]}
              alt=""
              className="absolute pixelated"
              style={{
                width: tileSize,
                height: 'auto',
                left: left * 1.25,
                top: top * 1.25,
                zIndex: z,
                opacity: 0,
                transition: 'opacity 0.5s ease-in',
              }}
              onLoad={(e) => {
                e.currentTarget.style.opacity = '1'
              }}
            />
          ))}
        </div>
      </div>
      <h3
        className="text-2xl font-medium mb-6 relative z-10 font-display"
        style={{ color: colors.text.cream }}
      >
        Ready to take Action?
      </h3>
      <div className="flex flex-row gap-4 justify-center relative z-10">
        <a
          href="/earn"
          className="text-black px-8 py-3 rounded-lg font-medium font-sans inline-flex items-center justify-center gap-2 transition-colors duration-200"
          style={{ backgroundColor: 'rgba(245, 245, 220, 0.9)' }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor =
              'rgba(229, 229, 204, 0.95)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = 'rgba(245, 245, 220, 0.9)')
          }
        >
          <TerminalIcon className="w-5 h-5" />
          Demo
        </a>
        {showGithub ? (
          <a
            href="https://github.com/ethereum-optimism/actions"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-gray-600 px-8 py-3 rounded-lg font-medium font-sans hover:bg-gray-700/80 inline-flex items-center justify-center gap-2 transition-colors duration-200"
            style={{
              color: colors.text.cream,
              backgroundColor: 'rgba(29, 32, 33, 0.7)',
            }}
          >
            <GithubIcon className="w-5 h-5" />
            Github
          </a>
        ) : (
          <a
            href="https://docs.optimism.io/app-developers/quickstarts/actions"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-gray-600 px-8 py-3 rounded-lg font-medium font-sans hover:bg-gray-700/80 inline-flex items-center justify-center gap-2 transition-colors duration-200"
            style={{
              color: colors.text.cream,
              backgroundColor: 'rgba(29, 32, 33, 0.7)',
            }}
          >
            <DocumentIcon className="w-5 h-5" />
            Docs
          </a>
        )}
      </div>
      <div className="mt-12 relative z-10">
        <p
          className="text-sm mb-4 font-sans"
          style={{ color: colors.text.cream }}
        >
          Are you a Fintech considering Actions?
        </p>
        <a
          href="https://www.optimism.io/learn-more?utm_source=actions_site&utm_medium=actions_site&utm_id=actions&variant=actions"
          target="_blank"
          rel="noopener noreferrer"
          className="border border-gray-600 px-6 py-2 rounded-lg font-medium font-sans hover:bg-gray-700/80 inline-flex items-center justify-center gap-2 transition-colors duration-200"
          style={{
            color: colors.text.cream,
            backgroundColor: 'rgba(29, 32, 33, 0.7)',
          }}
        >
          <ChatBubbleIcon className="w-5 h-5" />
          Let us know
        </a>
      </div>
    </div>
  )
}

export default TakeAction
