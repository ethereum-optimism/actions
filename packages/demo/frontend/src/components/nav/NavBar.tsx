interface NavBarProps {
  fullWidth?: boolean
  rightElement?: React.ReactNode
  showDemo?: boolean
  visible?: boolean
  responsiveLogo?: boolean
}

function NavBar({ fullWidth = false, rightElement, showDemo = false, visible = true, responsiveLogo = false }: NavBarProps) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out"
      style={{
        backgroundColor: 'rgba(29, 32, 33, 0.5)',
        transform: visible ? 'translateY(0)' : 'translateY(-100%)'
      }}
    >
      <div className={fullWidth ? 'px-6 py-4' : 'max-w-7xl mx-auto px-6 py-4'}>
        <div className="flex items-center justify-between">
          <a href="/" className="cursor-pointer">
            {responsiveLogo ? (
              <>
                <img src="/Actions-logo-A.png" alt="Actions" className="h-8 w-auto md:hidden" />
                <img src="/actions-logo.png" alt="Actions" className="h-8 w-auto hidden md:block" />
              </>
            ) : (
              <img src="/actions-logo.png" alt="Actions" className="h-8 w-auto" />
            )}
          </a>
          <div className="flex items-center gap-4">
            {rightElement}
            {showDemo && (
              <a
                href="/earn"
                className="flex items-center space-x-2 px-2 py-2 text-sm text-gray-300 hover:text-white transition-colors duration-200"
              >
                <span>Demo</span>
              </a>
            )}
            <a
              href="https://github.com/ethereum-optimism/actions"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 px-2 py-2 text-sm text-gray-300 hover:text-white transition-colors duration-200"
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
    </header>
  )
}

export default NavBar
