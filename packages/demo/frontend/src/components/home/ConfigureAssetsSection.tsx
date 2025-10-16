import { colors } from '@/constants/colors'
import CodeBlock from './CodeBlock'

interface ConfigureAssetsSectionProps {
  stepNumber: number
  isOpen: boolean
  onToggle: () => void
}

function ConfigureAssetsSection({
  stepNumber,
  isOpen,
  onToggle,
}: ConfigureAssetsSectionProps) {
  const assetsCode = `// Import popular assets
import { USDC } from '@eth-optimism/actions-sdk/assets'

// Define custom assets
export const CustomToken: Asset = {
  address: {
    [mainnet.id]: '0x123...',
    [unichain.id]: '0x456...',
    [baseSepolia.id]: '0x789...',
  },
  metadata: {
    decimals: 6,
    name: 'Custom Token',
    symbol: 'CUSTOM',
  },
  type: 'erc20',
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
            Configure Assets
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
            Import asset data from the{' '}
            <a
              href="https://github.com/ethereum-optimism/ethereum-optimism.github.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              Superchain Token List
            </a>{' '}
            or define custom assets.
          </p>
          <CodeBlock code={assetsCode} filename="assets.ts" />
        </div>
      </div>
    </div>
  )
}

export default ConfigureAssetsSection
