import { useState } from 'react'
import InstallSection from './InstallSection'
import ConfigureSection from './ConfigureSection'
import HostedWalletsSection from './HostedWalletsSection'
import SmartWalletsSection from './SmartWalletsSection'
import TakeActionSection from './TakeActionSection'

function GettingStarted() {
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set())
  const [openNestedAccordions, setOpenNestedAccordions] = useState<Set<string>>(new Set())
  const [selectedPackageManager, setSelectedPackageManager] = useState('npm')

  const toggleAccordion = (id: string) => {
    setOpenAccordions(prev => {
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
    setOpenNestedAccordions(prev => {
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
          <h2 className="text-3xl font-medium text-gray-300 mb-8">
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
                backgroundColor:
                  openAccordions.has('configure-wallet')
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
                <h3 className="text-lg font-medium text-gray-300">
                  Configure Wallet
                </h3>
              </div>
              <svg
                className="w-5 h-5 text-gray-400 transition-transform duration-300"
                style={{
                  transform:
                    openAccordions.has('configure-wallet')
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
                maxHeight: openAccordions.has('configure-wallet') ? '5000px' : '0',
                opacity: openAccordions.has('configure-wallet') ? 1 : 0,
              }}
            >
              <div className="pt-6 pb-4">
                {/* Flexible wallet config container */}
                <div className="border border-gray-600 rounded-lg p-6">
                  {/* Accordion Item: BYO Hosted Wallets */}
                  <HostedWalletsSection
                    stepNumber=""
                    openAccordion={openNestedAccordions.has('byo-wallet') ? 'byo-wallet' : null}
                    setOpenAccordion={(val) => {
                      if (val === 'byo-wallet') {
                        toggleNestedAccordion('byo-wallet')
                      } else {
                        setOpenNestedAccordions(prev => {
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
                    <span className="px-4 text-sm font-medium text-gray-500">OR</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent"></div>
                  </div>

                  {/* Accordion Item: Customizable Smart Wallets */}
                  <SmartWalletsSection
                    stepNumber=""
                    openAccordion={openNestedAccordions.has('smart-wallet') ? 'smart-wallet' : null}
                    setOpenAccordion={(val) => {
                      if (val === 'smart-wallet') {
                        toggleNestedAccordion('smart-wallet')
                      } else {
                        setOpenNestedAccordions(prev => {
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
        </div>
      </div>
    </>
  )
}

export default GettingStarted
