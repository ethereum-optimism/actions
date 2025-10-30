import { colors } from '@/constants/colors'
import PackageManagerSelector from '@/components/home/PackageManagerSelector'

interface InstallSectionProps {
  stepNumber: number
  isOpen: boolean
  onToggle: () => void
}

function InstallSection({ stepNumber, isOpen, onToggle }: InstallSectionProps) {
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
            Install Actions SDK
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
          maxHeight: isOpen ? '1000px' : '0',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="pt-6 pb-4">
          <div className="mb-8">
            <PackageManagerSelector showShadow={true} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default InstallSection
