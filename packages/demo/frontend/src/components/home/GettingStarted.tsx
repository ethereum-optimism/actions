import { useState } from 'react'
import InstallSection from './InstallSection'
import ConfigureActionsSection from './ConfigureActionsSection'
import TakeActionSection from './TakeActionSection'
import ConfigureAssetsSection from './ConfigureAssetsSection'
import ConfigureMarketsSection from './ConfigureMarketsSection'
import ConfigureChainsSection from './ConfigureChainsSection'
import ConfigureSignersSection from './ConfigureSignersSection'
import { colors } from '@/constants/colors'
import PrivyLogo from '@/assets/privy-logo-white.svg'
import DynamicLogo from '@/assets/dynamic-logo-white.svg'
import TurnkeyLogo from '@/assets/turnkey-logo-white.svg'
import TabbedCodeBlock from './TabbedCodeBlock'

function GettingStarted() {
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set())
  const [selectedPackageManager, setSelectedPackageManager] = useState('npm')
  const [selectedWalletProvider, setSelectedWalletProvider] = useState('privy')
  const [selectedPrivyTab, setSelectedPrivyTab] = useState('frontend')
  const [selectedDynamicTab, setSelectedDynamicTab] = useState('frontend')
  const [selectedTurnkeyTab, setSelectedTurnkeyTab] = useState('frontend')

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

  const privyFrontendCode = `import { actions } from './config'
import { useWallets } from '@privy-io/react-auth'

// PRIVY: Fetch wallet
const { wallets } = useWallets()
const embeddedWallet = wallets.find(
  (wallet) => wallet.walletClientType === 'privy',
)

// ACTIONS: Let wallet make onchain Actions
const wallet = await actions.wallet.hostedWalletToActionsWallet({
  connectedWallet: embeddedWallet,
})`

  const privyBackendCode = `import { actions } from './config'
import { PrivyClient } from '@privy-io/node'

const privyClient = new PrivyClient(env.PRIVY_APP_ID, env.PRIVY_APP_SECRET)

// PRIVY: Create wallet
const privyWallet = await privyClient.walletApi.createWallet({
  chainType: 'ethereum',
})

// ACTIONS: Let wallet make onchain Actions
const wallet = await actions.wallet.hostedWalletToActionsWallet({
  walletId: privyWallet.id,
  address: privyWallet.address,
})`

  const dynamicCode = `import { actions } from './config'
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"

// DYNAMIC: Fetch wallet
const { primaryWallet } = useDynamicContext()
const embeddedWallet = primaryWallet

// ACTIONS: Let wallet make onchain Actions
const wallet = await actions.wallet.hostedWalletToVerbsWallet({
  wallet: embeddedWallet,
})`

  const turnkeyFrontendCode = `import { actions } from './config'
import { useTurnkey } from "@turnkey/react-wallet-kit"

// TURNKEY: Fetch wallet
const { wallets, createWallet, refreshWallets, httpClient, session } = useTurnkey()

const embeddedWallet = await createWallet({
  walletName: \`My New Wallet \${Math.random()}\`,
  accounts: ["ADDRESS_FORMAT_ETHEREUM"],
})

const walletAddress = embeddedWallet.accounts[0].address

// ACTIONS: Let wallet make onchain Actions
const wallet = await actions.wallet.hostedWalletToActionsWallet({
  client: httpClient,
  organizationId: session.organizationId,
  signWith: walletAddress,
  ethereumAddress: walletAddress,
})`

  const turnkeyBackendCode = `import { actions } from './config'
import { Turnkey } from '@turnkey/sdk-server'

const turnkeyClient = new Turnkey({
  apiBaseUrl: 'https://api.turnkey.com',
  apiPublicKey: env.TURNKEY_API_KEY,
  apiPrivateKey: env.TURNKEY_API_SECRET,
  defaultOrganizationId: env.TURNKEY_ORGANIZATION_ID,
})

// TURNKEY: Create wallet
const turnkeyWallet = await turnkeyClient.apiClient().createWallet({
  walletName: 'ETH Wallet',
  accounts: [{
    curve: 'CURVE_SECP256K1',
    pathFormat: 'PATH_FORMAT_BIP32',
    path: "m/44'/60'/0'/0/0",
    addressFormat: 'ADDRESS_FORMAT_ETHEREUM',
  }],
})

// ACTIONS: Let wallet make onchain Actions
const wallet = await actions.wallet.hostedWalletToActionsWallet({
  organizationId: turnkeyWallet.activity.organizationId,
  signWith: turnkeyWallet.addresses[0],
})`

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
            selectedPackageManager={selectedPackageManager}
            setSelectedPackageManager={setSelectedPackageManager}
            packageManagers={packageManagers}
          />

          {/* Accordion Item 2: Configure Wallets */}
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
                  style={{ color: colors.actionsRed }}
                >
                  2
                </span>
                <h3
                  className="text-lg font-medium"
                  style={{ color: colors.text.cream }}
                >
                  Configure Wallets
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
                  ? '3000px'
                  : '0',
                opacity: openAccordions.has('configure-wallet') ? 1 : 0,
              }}
            >
              <div className="pt-6 pb-4">
                <p
                  className="text-base mb-4"
                  style={{ color: colors.text.cream }}
                >
                  Actions supports your existing embedded wallet provider.
                </p>
                <div
                  className="rounded-lg overflow-hidden mb-8 shadow-2xl"
                  style={{
                    backgroundColor: colors.bg.code,
                    boxShadow:
                      '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(184, 187, 38, 0.05)',
                  }}
                >
                  {/* Tab switcher with logos */}
                  <div
                    className="flex border-b"
                    style={{
                      backgroundColor: colors.bg.code,
                      borderColor: 'rgba(184, 187, 38, 0.15)',
                    }}
                  >
                    <button
                      onClick={() => setSelectedWalletProvider('privy')}
                      className={`w-1/3 px-6 py-4 transition-colors flex items-center justify-center border-b-2 ${
                        selectedWalletProvider === 'privy'
                          ? ''
                          : 'opacity-50 hover:opacity-75'
                      }`}
                      style={{
                        borderColor:
                          selectedWalletProvider === 'privy'
                            ? 'rgb(184, 187, 38)'
                            : 'transparent',
                      }}
                    >
                      <img
                        src={PrivyLogo}
                        alt="Privy"
                        className="h-8 w-auto object-contain"
                      />
                    </button>
                    <button
                      onClick={() => setSelectedWalletProvider('turnkey')}
                      className={`w-1/3 px-6 py-4 transition-colors flex items-center justify-center border-b-2 ${
                        selectedWalletProvider === 'turnkey'
                          ? ''
                          : 'opacity-50 hover:opacity-75'
                      }`}
                      style={{
                        borderColor:
                          selectedWalletProvider === 'turnkey'
                            ? 'rgb(184, 187, 38)'
                            : 'transparent',
                      }}
                    >
                      <img
                        src={TurnkeyLogo}
                        alt="Turnkey"
                        className="h-8 w-auto object-contain"
                      />
                    </button>
                    <button
                      onClick={() => setSelectedWalletProvider('dynamic')}
                      className={`w-1/3 px-6 py-4 transition-colors flex items-center justify-center border-b-2 ${
                        selectedWalletProvider === 'dynamic'
                          ? ''
                          : 'opacity-50 hover:opacity-75'
                      }`}
                      style={{
                        borderColor:
                          selectedWalletProvider === 'dynamic'
                            ? 'rgb(184, 187, 38)'
                            : 'transparent',
                      }}
                    >
                      <img
                        src={DynamicLogo}
                        alt="Dynamic"
                        className="h-8 w-auto object-contain"
                      />
                    </button>
                  </div>

                  {/* Content for each provider */}
                  <div className="p-8" style={{ backgroundColor: '#32302f' }}>
                    {selectedWalletProvider === 'privy' && (
                      <div className="space-y-6">
                        <div>
                          <p
                            className="text-base mb-4"
                            style={{ color: colors.text.cream }}
                          >
                            1.{' '}
                            <a
                              href="https://docs.privy.io/basics/react/installation"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 underline"
                            >
                              Install
                            </a>{' '}
                            and setup Privy.
                          </p>
                        </div>

                        <div>
                          <p
                            className="mb-2"
                            style={{ color: colors.text.cream }}
                          >
                            2. Create a frontend or backend user wallet and
                            extend it with DeFi Actions:
                          </p>
                          <TabbedCodeBlock
                            tabs={[
                              { label: 'Frontend', code: privyFrontendCode },
                              { label: 'Backend', code: privyBackendCode },
                            ]}
                            selectedTab={selectedPrivyTab}
                            onTabChange={setSelectedPrivyTab}
                            filename="wallet.ts"
                          />
                        </div>
                      </div>
                    )}

                    {selectedWalletProvider === 'dynamic' && (
                      <div className="space-y-6">
                        <div>
                          <p
                            className="text-base mb-4"
                            style={{ color: colors.text.cream }}
                          >
                            1.{' '}
                            <a
                              href="https://www.dynamic.xyz/docs/wallets/embedded-wallets/mpc/setup"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 underline"
                            >
                              Install
                            </a>{' '}
                            and setup Dynamic.
                          </p>
                        </div>

                        <div>
                          <p
                            className="mb-2"
                            style={{ color: colors.text.cream }}
                          >
                            2. Create a frontend user wallet and extend it with
                            DeFi Actions:
                          </p>
                          <TabbedCodeBlock
                            tabs={[
                              { label: 'Frontend', code: dynamicCode },
                              { label: 'Backend', code: '' },
                            ]}
                            selectedTab={selectedDynamicTab}
                            onTabChange={setSelectedDynamicTab}
                            filename="wallet.ts"
                          />
                        </div>
                      </div>
                    )}

                    {selectedWalletProvider === 'turnkey' && (
                      <div className="space-y-6">
                        <div>
                          <p
                            className="text-base mb-4"
                            style={{ color: colors.text.cream }}
                          >
                            1.{' '}
                            <a
                              href="https://docs.turnkey.com/sdks/react/getting-started"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 underline"
                            >
                              Install
                            </a>{' '}
                            and setup Turnkey.
                          </p>
                        </div>

                        <div>
                          <p
                            className="mb-2"
                            style={{ color: colors.text.cream }}
                          >
                            2. Create a frontend or backend user wallet and
                            extend it with DeFi Actions:
                          </p>
                          <TabbedCodeBlock
                            tabs={[
                              { label: 'Frontend', code: turnkeyFrontendCode },
                              { label: 'Backend', code: turnkeyBackendCode },
                            ]}
                            selectedTab={selectedTurnkeyTab}
                            onTabChange={setSelectedTurnkeyTab}
                            filename="wallet.ts"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

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
                style={{ color: colors.text.cream }}
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
