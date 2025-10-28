import { colors } from '@/constants/colors'
import { TerminalIcon, DocumentIcon } from '@/assets/icons'
import PackageManagerSelector from '@/components/home/PackageManagerSelector'

function Hero() {
  return (
    <>
      {/* ASCII Art - Isolated from other styles */}
      <div className="pt-32 pb-6 flex justify-center px-6 overflow-x-auto">
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
      <div className="text-center pb-6">
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
        <div className="text-center pt-12 pb-20">
          <div>
            <h1
              className="text-4xl md:text-5xl font-normal mb-12 leading-tight"
              style={{
                fontFamily:
                  '"VT323", "IBM VGA", "IBM BIOS", "Courier New", Courier, "Lucida Console", Monaco, monospace',
                color: colors.text.cream,
              }}
            >
              Perform <span className="font-semibold">DeFi</span> actions with
              lightweight,
              <br />
              composable, and type-safe modules.
            </h1>

            <div className="max-w-2xl mx-auto mb-12">
              <PackageManagerSelector showShadow={false} />
            </div>

            <div className="flex flex-row gap-4 justify-center">
              <a
                href="/earn"
                className="text-black px-8 py-3 rounded-lg font-medium inline-flex items-center justify-center gap-2 transition-colors duration-200 flex-1 sm:flex-initial"
                style={{ backgroundColor: colors.text.cream }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = '#E5E5CC')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = colors.text.cream)
                }
              >
                <TerminalIcon className="w-5 h-5" />
                Demo
              </a>
              <a
                href="/docs"
                className="border border-gray-600 px-8 py-3 rounded-lg font-medium hover:bg-gray-700 inline-flex items-center justify-center gap-2 transition-colors duration-200 flex-1 sm:flex-initial"
                style={{ color: colors.text.cream }}
              >
                <DocumentIcon className="w-5 h-5" />
                Docs
              </a>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}

export default Hero
