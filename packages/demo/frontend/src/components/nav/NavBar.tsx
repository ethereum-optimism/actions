import { colors } from '@/constants/colors'

interface NavBarProps {
  fullWidth?: boolean
  rightElement?: React.ReactNode
  showDemo?: boolean
  visible?: boolean
  responsiveLogo?: boolean
  progressBar?: {
    show: boolean
    activeLayer: number
    progressPercent: number
    progressColors: string[]
    layers: { num: number; label: string }[]
    onLayerClick: (layerNum: number) => void
  }
}

function NavBar({
  fullWidth = false,
  rightElement,
  showDemo = false,
  visible = true,
  responsiveLogo = false,
  progressBar,
}: NavBarProps) {
  const handleLogoClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const isHomePage = window.location.pathname === '/'
    if (isHomePage) {
      e.preventDefault()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out min-w-[400px]"
      style={{
        backgroundColor: colors.bg.dark,
        transform: visible ? 'translateY(0)' : 'translateY(-100%)',
      }}
    >
      <div className={fullWidth ? 'px-6 py-4' : 'max-w-7xl mx-auto px-6 py-4'}>
        <div className="flex items-center justify-between">
          <a href="/" className="cursor-pointer" onClick={handleLogoClick}>
            {responsiveLogo ? (
              <>
                <img
                  src="/Actions-logo-A.png"
                  alt="Actions"
                  className="h-8 w-auto md:hidden"
                />
                <img
                  src="/Optimism.svg"
                  alt="Optimism"
                  className="h-4 w-auto hidden md:block"
                />
              </>
            ) : (
              <img src="/Optimism.svg" alt="Optimism" className="h-4 w-auto" />
            )}
          </a>
          <div className="flex items-center gap-4">
            {rightElement}
            {showDemo && (
              <>
                <a
                  href="https://docs.optimism.io/app-developers/quickstarts/actions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 px-2 py-2 text-sm transition-colors duration-200"
                  style={{ color: colors.text.cream }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  <span>Docs</span>
                </a>
                <a
                  href="/earn"
                  className="flex items-center space-x-2 px-2 py-2 text-sm transition-colors duration-200"
                  style={{ color: colors.text.cream }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  <span>Demo</span>
                </a>
              </>
            )}
            <a
              href="https://github.com/ethereum-optimism/actions"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 px-2 py-2 text-sm transition-colors duration-200"
              style={{ color: colors.text.cream }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              <span>GitHub</span>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* Progress bar with labels */}
      {progressBar && (
        <div
          style={{
            transform: progressBar.show ? 'scaleY(1)' : 'scaleY(0)',
            transformOrigin: 'top',
            opacity: progressBar.show ? 1 : 0,
            transition: 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out',
            pointerEvents: progressBar.show ? 'auto' : 'none',
            backgroundColor: colors.bg.dark,
          }}
        >
          {/* Progress bar */}
          <div
            style={{
              height: '4px',
              backgroundColor: '#282828',
              display: 'flex',
              width: '100%',
            }}
          >
            {progressBar.progressColors.map((color, index) => {
              const sectionStart = (index / 7) * 100
              const sectionVisible =
                progressBar.progressPercent >= sectionStart
                  ? Math.min(
                      ((progressBar.progressPercent - sectionStart) /
                        (100 / 7)) *
                        100,
                      100,
                    )
                  : 0

              return (
                <div
                  key={index}
                  style={{
                    flex: 1,
                    backgroundColor: '#282828',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      height: '100%',
                      width: '100%',
                      backgroundColor: color,
                      transform: `scaleX(${sectionVisible / 100})`,
                      transformOrigin: 'left',
                      willChange: 'transform',
                    }}
                  />
                </div>
              )
            })}
          </div>

          {/* Labels */}
          <div
            className="min-[470px]:px-0 px-2"
            style={{
              display: 'flex',
              width: '100%',
              paddingTop: '8px',
              paddingBottom: '8px',
            }}
          >
            {progressBar.layers.map((layer) => (
              <button
                key={layer.num}
                onClick={() => progressBar.onLayerClick(layer.num)}
                className="min-[470px]:text-[13px] text-[10px] min-[470px]:px-1 px-0"
                style={{
                  flex: 1,
                  color:
                    progressBar.activeLayer === layer.num
                      ? colors.text.cream
                      : '#666',
                  fontWeight:
                    progressBar.activeLayer === layer.num ? '600' : '400',
                  cursor: 'pointer',
                  background: 'none',
                  border: 'none',
                  paddingTop: '4px',
                  paddingBottom: '4px',
                  transition: 'color 0.2s ease-in-out',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                onMouseEnter={(e) => {
                  if (progressBar.activeLayer !== layer.num) {
                    e.currentTarget.style.color = '#999'
                  }
                }}
                onMouseLeave={(e) => {
                  if (progressBar.activeLayer !== layer.num) {
                    e.currentTarget.style.color = '#666'
                  }
                }}
              >
                {layer.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}

export default NavBar
