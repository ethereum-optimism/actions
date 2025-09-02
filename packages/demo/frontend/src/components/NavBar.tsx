import VerbsLogo from './VerbsLogo'

interface NavBarProps {
  fullWidth?: boolean
  rightElement?: React.ReactNode
}

function NavBar({ fullWidth = false, rightElement }: NavBarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-transparent">
      <div className={fullWidth ? "px-6 py-4" : "max-w-7xl mx-auto px-6 py-4"}>
        <div className="flex items-center justify-between">
          <a href="/" className="cursor-pointer">
            <VerbsLogo />
          </a>
          <div className="flex items-center gap-4">
            {rightElement}
            <a
              href="https://github.com/ethereum-optimism/verbs"
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