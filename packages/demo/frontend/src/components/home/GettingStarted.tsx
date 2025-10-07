import { useState } from 'react'
import InstallSection from './InstallSection'
import ConfigureSection from './ConfigureSection'
import HostedWalletsSection from './HostedWalletsSection'
import SmartWalletsSection from './SmartWalletsSection'
import TakeActionSection from './TakeActionSection'

function GettingStarted() {
  const [openAccordion, setOpenAccordion] = useState<string | null>('install')
  const [selectedPackageManager, setSelectedPackageManager] = useState('npm')
  const [selectedWalletProvider, setSelectedWalletProvider] = useState('privy')
  const [selectedPrivyTab, setSelectedPrivyTab] = useState('frontend')
  const [selectedDynamicTab, setSelectedDynamicTab] = useState('frontend')
  const [selectedTurnkeyTab, setSelectedTurnkeyTab] = useState('frontend')
  const [selectedSmartPrivyTab, setSelectedSmartPrivyTab] = useState('frontend')
  const [selectedSmartDynamicTab, setSelectedSmartDynamicTab] = useState('frontend')
  const [selectedSmartTurnkeyTab, setSelectedSmartTurnkeyTab] = useState('frontend')

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
      <div className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-medium text-gray-300 mb-8">
            Getting Started
          </h2>

          {/* Accordion Item 1: Install */}
          <InstallSection
            stepNumber={1}
            isOpen={openAccordion === 'install'}
            onToggle={() =>
              setOpenAccordion(openAccordion === 'install' ? null : 'install')
            }
            selectedPackageManager={selectedPackageManager}
            setSelectedPackageManager={setSelectedPackageManager}
            packageManagers={packageManagers}
          />

          {/* Horizontal line */}
          <div className="h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent my-4"></div>

          {/* Accordion Item 2: Configure */}
          <ConfigureSection
            stepNumber={2}
            isOpen={openAccordion === 'configure'}
            onToggle={() =>
              setOpenAccordion(
                openAccordion === 'configure' ? null : 'configure',
              )
            }
          />

          {/* Horizontal line */}
          <div className="h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent my-4"></div>

          {/* Accordion Item 3: BYO Hosted Wallets */}
          <HostedWalletsSection
            stepNumber={3}
            openAccordion={openAccordion}
            setOpenAccordion={setOpenAccordion}
            selectedWalletProvider={selectedWalletProvider}
            setSelectedWalletProvider={setSelectedWalletProvider}
            selectedPrivyTab={selectedPrivyTab}
            setSelectedPrivyTab={setSelectedPrivyTab}
            selectedDynamicTab={selectedDynamicTab}
            setSelectedDynamicTab={setSelectedDynamicTab}
            selectedTurnkeyTab={selectedTurnkeyTab}
            setSelectedTurnkeyTab={setSelectedTurnkeyTab}
          />

          {/* Horizontal line with OR */}
          <div className="flex items-center my-4">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent"></div>
            <span className="px-4 text-sm font-medium text-gray-500">OR</span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent"></div>
          </div>

          {/* Accordion Item 3 (alternate): Customizable Smart Wallets */}
          <SmartWalletsSection
            stepNumber={3}
            openAccordion={openAccordion}
            setOpenAccordion={setOpenAccordion}
            selectedSmartPrivyTab={selectedSmartPrivyTab}
            setSelectedSmartPrivyTab={setSelectedSmartPrivyTab}
            selectedSmartDynamicTab={selectedSmartDynamicTab}
            setSelectedSmartDynamicTab={setSelectedSmartDynamicTab}
            selectedSmartTurnkeyTab={selectedSmartTurnkeyTab}
            setSelectedSmartTurnkeyTab={setSelectedSmartTurnkeyTab}
          />

          {/* Horizontal line */}
          <div className="h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent my-4"></div>

          {/* Accordion Item 4: Take Action */}
          <TakeActionSection
            stepNumber={4}
            isOpen={openAccordion === 'take-action'}
            onToggle={() =>
              setOpenAccordion(
                openAccordion === 'take-action' ? null : 'take-action',
              )
            }
          />
        </div>
      </div>
    </>
  )
}

export default GettingStarted
