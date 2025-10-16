import { colors } from '@/constants/colors'
import CodeBlock from './CodeBlock'

interface ConfigureMarketsSectionProps {
  stepNumber: number
  isOpen: boolean
  onToggle: () => void
}

function ConfigureMarketsSection({
  stepNumber,
  isOpen,
  onToggle,
}: ConfigureMarketsSectionProps) {
  const marketsCode = `
// Fetch all markets
const markets = actions.lend.getMarkets()

// Specify your preferred ones
export const GauntletUSDC: LendMarketConfig = {
  address: '0xabc...',
  chainId: unichain.id,
  name: 'Gauntlet USDC',
  asset: USDC,
  lendProvider: 'morpho',
}`

  return (
    <div className="mb-4">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-4 px-6 rounded-lg transition-colors"
        style={{
          backgroundColor: isOpen
            ? 'rgba(60, 60, 60, 0.5)'
            : 'rgba(40, 40, 40, 0.5)',
        }}
      >
        <div className="flex items-center gap-4">
          <span
            className="text-2xl font-medium"
            style={{ color: colors.actionsRed }}
          >
            {stepNumber}
          </span>
          <h3
            className="text-lg font-medium"
            style={{ color: colors.text.cream }}
          >
            Configure Markets
          </h3>
        </div>
        <svg
          className="w-5 h-5 text-gray-400 transition-transform duration-300"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          maxHeight: isOpen ? '2000px' : '0',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="pt-6 pb-4">
          <p className="text-base mb-4" style={{ color: colors.text.cream }}>
            Fetch the latest markets or enshrine your selected favorites.
          </p>
          <CodeBlock code={marketsCode} filename="markets.ts" />
        </div>
      </div>
    </div>
  )
}

export default ConfigureMarketsSection
