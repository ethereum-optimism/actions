import { useState } from 'react'
import InstallSection from './InstallSection'
import ConfigureSection from './ConfigureSection'
import HostedWalletsSection from './HostedWalletsSection'
import SmartWalletsSection from './SmartWalletsSection'
import TakeActionSection from './TakeActionSection'

function GettingStarted() {
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set())
  const [openNestedAccordions, setOpenNestedAccordions] = useState<Set<string>>(
    new Set(),
  )
  const [selectedPackageManager, setSelectedPackageManager] = useState('npm')

  const toggleAccordion = (id: string) => {
    setOpenAccordions((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const toggleNestedAccordion = (id: string) => {
    setOpenNestedAccordions((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const packageManagers = {
    npm: 'npm install @eth-optimism/actions-sdk',
    pnpm: 'pnpm add @eth-optimism/actions-sdk',
    yarn: 'yarn add @eth-optimism/actions-sdk',
    bun: 'bun add @eth-optimism/actions-sdk',
    deno: 'deno add @eth-optimism/actions-sdk',
  }

  return (
    <>
      {/* Getting Started Subsection */}
      <div id="getting-started" className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-medium mb-8" style={{ color: '#F5F5DC' }}>
            Getting Started
          </h2>

          {/* Accordion Item 1: Install */}
          <InstallSection
            stepNumber={1}
            isOpen={openAccordions.has('install')}
            onToggle={() => toggleAccordion('install')}
            selectedPackageManager={selectedPackageManager}
            setSelectedPackageManager={setSelectedPackageManager}
            packageManagers={packageManagers}
          />

          {/* Accordion Item 2: Configure */}
          <ConfigureSection
            stepNumber={2}
            isOpen={openAccordions.has('configure')}
            onToggle={() => toggleAccordion('configure')}
          />

          {/* Accordion Item 3: Configure Wallet */}
          <div className="mb-4">
            <button
              onClick={() => toggleAccordion('configure-wallet')}
              className="w-full flex items-center justify-between py-4 px-6 rounded-lg transition-colors"
              style={{
                backgroundColor: openAccordions.has('configure-wallet')
                  ? 'rgba(60, 60, 60, 0.5)'
                  : 'rgba(40, 40, 40, 0.5)',
              }}
            >
              <div className="flex items-center gap-4">
                <span
                  className="text-2xl font-medium"
                  style={{ color: '#FF0420' }}
                >
                  3
                </span>
                <h3 className="text-lg font-medium" style={{ color: '#F5F5DC' }}>
                  Configure Wallet
                </h3>
              </div>
              <svg
                className="w-5 h-5 text-gray-400 transition-transform duration-300"
                style={{
                  transform: openAccordions.has('configure-wallet')
                    ? 'rotate(180deg)'
                    : 'rotate(0deg)',
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
                maxHeight: openAccordions.has('configure-wallet')
                  ? '5000px'
                  : '0',
                opacity: openAccordions.has('configure-wallet') ? 1 : 0,
              }}
            >
              <div className="pt-6 pb-4">
                {/* Flexible wallet config container */}
                <div className="border border-gray-600 rounded-lg p-6">
                  {/* Accordion Item: BYO Hosted Wallets */}
                  <HostedWalletsSection
                    stepNumber=""
                    openAccordion={
                      openNestedAccordions.has('byo-wallet')
                        ? 'byo-wallet'
                        : null
                    }
                    setOpenAccordion={(val) => {
                      if (val === 'byo-wallet') {
                        toggleNestedAccordion('byo-wallet')
                      } else {
                        setOpenNestedAccordions((prev) => {
                          const newSet = new Set(prev)
                          newSet.delete('byo-wallet')
                          return newSet
                        })
                      }
                    }}
                  />

                  {/* OR separator */}
                  <div className="flex items-center my-4">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent"></div>
                    <span className="px-4 text-sm font-medium text-gray-500">
                      OR
                    </span>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent"></div>
                  </div>

                  {/* Accordion Item: Customizable Smart Wallets */}
                  <SmartWalletsSection
                    stepNumber=""
                    openAccordion={
                      openNestedAccordions.has('smart-wallet')
                        ? 'smart-wallet'
                        : null
                    }
                    setOpenAccordion={(val) => {
                      if (val === 'smart-wallet') {
                        toggleNestedAccordion('smart-wallet')
                      } else {
                        setOpenNestedAccordions((prev) => {
                          const newSet = new Set(prev)
                          newSet.delete('smart-wallet')
                          return newSet
                        })
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Accordion Item 4: Take Action */}
          <TakeActionSection
            stepNumber={4}
            isOpen={openAccordions.has('take-action')}
            onToggle={() => toggleAccordion('take-action')}
          />

          {/* CTA Section */}
          <div className="pt-16 text-center">
            <h3 className="text-2xl font-medium mb-6" style={{ color: '#F5F5DC' }}>
              Ready to get started?
            </h3>
            <div className="flex flex-row gap-4 justify-center">
              <a
                href="/earn"
                className="text-black px-8 py-3 rounded-lg font-medium inline-flex items-center justify-center gap-2 transition-colors duration-200"
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
                className="border border-gray-600 px-8 py-3 rounded-lg font-medium hover:bg-gray-700 inline-flex items-center justify-center gap-2 transition-colors duration-200"
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
      </div>
    </>
  )
}

export default GettingStarted
