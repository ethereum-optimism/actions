import { useState } from 'react'
import { colors } from '@/constants/colors'

interface PackageManagerSelectorProps {
  showShadow?: boolean
}

function PackageManagerSelector({
  showShadow = false,
}: PackageManagerSelectorProps) {
  const [selectedPackageManager, setSelectedPackageManager] = useState('npm')

  const packageManagers = {
    npm: 'npm install @eth-optimism/actions-sdk',
    pnpm: 'pnpm add @eth-optimism/actions-sdk',
    yarn: 'yarn add @eth-optimism/actions-sdk',
    bun: 'bun add @eth-optimism/actions-sdk',
    deno: 'deno add @eth-optimism/actions-sdk',
  }

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: colors.bg.code,
        boxShadow: showShadow
          ? '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(184, 187, 38, 0.05)'
          : undefined,
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
                selectedPackageManager === pm ? colors.text.cream : undefined,
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
  )
}

export default PackageManagerSelector
