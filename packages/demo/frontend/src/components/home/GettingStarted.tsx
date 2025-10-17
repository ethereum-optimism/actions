import { useState } from 'react'
import InstallSection from './InstallSection'
import ConfigureActionsSection from './ConfigureActionsSection'
import ConfigureWalletsSection from './ConfigureWalletsSection'
import TakeActionSection from './TakeActionSection'
import ConfigureAssetsSection from './ConfigureAssetsSection'
import ConfigureMarketsSection from './ConfigureMarketsSection'
import ConfigureChainsSection from './ConfigureChainsSection'
import ConfigureSignersSection from './ConfigureSignersSection'
import { colors } from '@/constants/colors'
import { TerminalIcon, GithubIcon } from '@/assets/icons'

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
      <div id="getting-started" className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto">
          <h2
            className="text-3xl font-medium mb-8"
            style={{ color: colors.text.cream }}
          >
            Getting Started
          </h2>

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

          {/* CTA Section */}
          <div className="pt-16 text-center">
            <h3
              className="text-2xl font-medium mb-6"
              style={{ color: colors.text.cream }}
            >
              Ready to get started?
            </h3>
            <div className="flex flex-row gap-4 justify-center">
              <a
                href="/earn"
                className="text-black px-8 py-3 rounded-lg font-medium inline-flex items-center justify-center gap-2 transition-colors duration-200"
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
                href="https://github.com/ethereum-optimism/actions"
                target="_blank"
                rel="noopener noreferrer"
                className="border border-gray-600 px-8 py-3 rounded-lg font-medium hover:bg-gray-700 inline-flex items-center justify-center gap-2 transition-colors duration-200"
                style={{ color: colors.text.cream }}
              >
                <GithubIcon className="w-5 h-5" />
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
