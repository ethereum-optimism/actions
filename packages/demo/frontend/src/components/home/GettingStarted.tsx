import { useState } from 'react'
import InstallSection from '@/components/home/InstallSection'
import ConfigureActionsSection from '@/components/docs/ConfigureActionsSection'
import ConfigureWalletsSection from '@/components/docs/ConfigureWalletsSection'
import TakeActionSection from '@/components/home/TakeActionSection'
import ConfigureAssetsSection from '@/components/docs/ConfigureAssetsSection'
import ConfigureMarketsSection from '@/components/docs/ConfigureMarketsSection'
import ConfigureChainsSection from '@/components/docs/ConfigureChainsSection'
import ConfigureSignersSection from '@/components/docs/ConfigureSignersSection'
import TakeActions from '@/components/home/TakeActions'

function GettingStarted() {
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set())

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

  return (
    <>
      {/* Getting Started Subsection */}
      <div id="getting-started" className="pb-16">
        <div className="max-w-4xl mx-auto">
          {/* Accordion Item 1: Install */}
          <InstallSection
            stepNumber={1}
            isOpen={openAccordions.has('install')}
            onToggle={() => toggleAccordion('install')}
          />

          {/* Accordion Item 2: Configure Wallets */}
          <ConfigureWalletsSection
            stepNumber={2}
            isOpen={openAccordions.has('configure-wallet')}
            onToggle={() => toggleAccordion('configure-wallet')}
          />

          {/* Accordion Item 3: Configure Signers */}
          <ConfigureSignersSection
            stepNumber={3}
            isOpen={openAccordions.has('configure-signers')}
            onToggle={() => toggleAccordion('configure-signers')}
          />

          {/* Accordion Item 4: Configure Actions */}
          <ConfigureActionsSection
            stepNumber={4}
            isOpen={openAccordions.has('configure')}
            onToggle={() => toggleAccordion('configure')}
          />

          {/* Accordion Item 5: Configure Assets */}
          <ConfigureAssetsSection
            stepNumber={5}
            isOpen={openAccordions.has('configure-assets')}
            onToggle={() => toggleAccordion('configure-assets')}
          />

          {/* Accordion Item 6: Configure Markets */}
          <ConfigureMarketsSection
            stepNumber={6}
            isOpen={openAccordions.has('configure-markets')}
            onToggle={() => toggleAccordion('configure-markets')}
          />

          {/* Accordion Item 7: Configure Chains */}
          <ConfigureChainsSection
            stepNumber={7}
            isOpen={openAccordions.has('configure-chains')}
            onToggle={() => toggleAccordion('configure-chains')}
          />

          {/* Accordion Item 8: Take Action */}
          <TakeActionSection
            stepNumber={8}
            isOpen={openAccordions.has('take-action')}
            onToggle={() => toggleAccordion('take-action')}
          />

          <TakeActions showGithub={true} compact={true} />
        </div>
      </div>
    </>
  )
}

export default GettingStarted
