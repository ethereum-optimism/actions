import { useState } from 'react'
import { colors } from '@/constants/colors'

interface InstallSectionProps {
  stepNumber: number
  isOpen: boolean
  onToggle: () => void
}

function InstallSection({ stepNumber, isOpen, onToggle }: InstallSectionProps) {
  const [selectedPackageManager, setSelectedPackageManager] = useState('npm')

  const packageManagers = {
    npm: 'npm install @eth-optimism/actions-sdk',
    pnpm: 'pnpm add @eth-optimism/actions-sdk',
    yarn: 'yarn add @eth-optimism/actions-sdk',
    bun: 'bun add @eth-optimism/actions-sdk',
    deno: 'deno add @eth-optimism/actions-sdk',
  }
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
          <div
            className="rounded-lg overflow-hidden mb-8 shadow-2xl"
            style={{
              backgroundColor: colors.bg.code,
              boxShadow:
                '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(184, 187, 38, 0.05)',
            }}
          >
            {/* Tab switcher */}
            <div
              className="flex border-b"
              style={{
                backgroundColor: colors.bg.header,
                borderColor: 'rgba(184, 187, 38, 0.15)',
              }}
            >
              {Object.keys(packageManagers).map((pm) => (
                <button
                  key={pm}
                  onClick={() => setSelectedPackageManager(pm)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    selectedPackageManager === pm
                      ? 'border-b-2'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                  style={{
                    color:
                      selectedPackageManager === pm
                        ? colors.text.cream
                        : undefined,
                    borderColor:
                      selectedPackageManager === pm
                        ? 'rgb(184, 187, 38)'
                        : 'transparent',
                  }}
                >
                  {pm}
                </button>
              ))}
            </div>
            {/* Code content */}
            <div
              className="p-8 text-left relative"
              style={{ backgroundColor: colors.bg.code }}
            >
              <pre className="text-sm leading-relaxed font-mono">
                <code style={{ color: colors.text.primary }}>
                  <span style={{ color: 'rgba(184, 187, 38, 0.9)' }}>
                    {
                      packageManagers[
                        selectedPackageManager as keyof typeof packageManagers
                      ].split(' ')[0]
                    }
                  </span>
                  {` ${packageManagers[selectedPackageManager as keyof typeof packageManagers].split(' ').slice(1).join(' ')}`}
                </code>
              </pre>
              {/* Copy button */}
              <button
                onClick={() =>
                  navigator.clipboard.writeText(
                    packageManagers[
                      selectedPackageManager as keyof typeof packageManagers
                    ],
                  )
                }
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 transition-colors"
                aria-label="Copy command"
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
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default InstallSection
