import { colors } from '@/constants/colors'

function Hero() {
  return (
    <>
      {/* ASCII Art - Isolated from other styles */}
      <div className="pt-32 pb-8 flex justify-center px-6 overflow-x-auto">
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
            margin: 0,
            padding: 0,
            border: 'none',
          }}
        >{`
    █████████             █████     ███
   ███░░░░░███           ░░███     ░░░
  ░███    ░███   ██████  ███████   ████   ██████  ████████    █████
  ░███████████  ███░░███░░░███░   ░░███  ███░░███░░███░░███  ███░░
  ░███░░░░░███ ░███ ░░░   ░███     ░███ ░███ ░███ ░███ ░███ ░░█████
  ░███    ░███ ░███  ███  ░███ ███ ░███ ░███ ░███ ░███ ░███  ░░░░███
  █████   █████░░██████   ░░█████  █████░░██████  ████ █████ ██████
 ░░░░░   ░░░░░  ░░░░░░     ░░░░░  ░░░░░  ░░░░░░  ░░░░ ░░░░░ ░░░░░░
     `}</div>
      </div>
      <div className="text-center pb-8">
        <p className="text-gray-400 text-lg">
          By{' '}
          <a
            href="https://www.optimism.io/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: colors.actionsRed, fontWeight: 'bold' }}
            className="hover:opacity-80"
          >
            Optimism
          </a>
        </p>
      </div>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6">
        <div className="text-center py-20">
          <div>
            <h1
              className="text-4xl md:text-5xl font-normal mb-6 leading-tight"
              style={{
                fontFamily:
                  '"VT323", "IBM VGA", "IBM BIOS", "Courier New", Courier, "Lucida Console", Monaco, monospace',
                color: '#F5F5DC',
              }}
            >
              Perform <span className="font-semibold">DeFi</span> actions with
              lightweight,
              <br />
              composable, and type-safe modules.
            </h1>

            <div className="flex flex-row gap-4 justify-center mb-8">
              <a
                href="/earn"
                className="text-black px-8 py-3 rounded-lg font-medium inline-flex items-center justify-center gap-2 transition-colors duration-200 flex-1 sm:flex-initial"
                style={{ backgroundColor: '#F5F5DC' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E5E5CC'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F5F5DC'}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Demo
              </a>
              <a
                href="https://github.com/ethereum-optimism/actions"
                target="_blank"
                rel="noopener noreferrer"
                className="border border-gray-600 px-8 py-3 rounded-lg font-medium hover:bg-gray-700 inline-flex items-center justify-center gap-2 transition-colors duration-200 flex-1 sm:flex-initial"
                style={{ color: '#F5F5DC' }}
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                Github
              </a>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}

export default Hero
