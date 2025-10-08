import { useState } from 'react'
import { colors } from '@/constants/colors'
import PrivyLogo from '@/assets/privy-logo-white.svg'
import DynamicLogo from '@/assets/dynamic-logo-white.svg'
import TurnkeyLogo from '@/assets/turnkey-logo-white.svg'
import TabbedCodeBlock from '../TabbedCodeBlock'

interface HostedWalletsSectionProps {
  stepNumber: number
  openAccordion: string | null
  setOpenAccordion: (value: string | null) => void
}

function HostedWalletsSection({
  stepNumber,
  openAccordion,
  setOpenAccordion,
}: HostedWalletsSectionProps) {
  const [selectedWalletProvider, setSelectedWalletProvider] = useState('privy')
  const [selectedPrivyTab, setSelectedPrivyTab] = useState('frontend')
  const [selectedDynamicTab, setSelectedDynamicTab] = useState('frontend')
  const [selectedTurnkeyTab, setSelectedTurnkeyTab] = useState('frontend')
  const privyFrontendCode = `import { useWallets } from '@privy-io/react-auth'

const { wallets } = useWallets()
const embeddedWallet = wallets.find(
  (wallet) => wallet.walletClientType === 'privy',
)

const actionsWallet = await actions.wallet.hostedWalletToActionsWallet({
  connectedWallet: embeddedWallet,
})`

  const privyBackendCode = `import { PrivyClient } from '@privy-io/node'

const privyClient = new PrivyClient(env.PRIVY_APP_ID, env.PRIVY_APP_SECRET)

const privyWallet = await privyClient.walletApi.createWallet({
  chainType: 'ethereum',
})

const wallet = await actions.wallet.hostedWalletToActionsWallet({
  walletId: privyWallet.id,
  address: privyWallet.address,
})`

  const dynamicCode = `import { useDynamicContext } from "@dynamic-labs/sdk-react-core"

const { primaryWallet } = useDynamicContext()

const verbsDynamicWallet = await actions.wallet.hostedWalletToVerbsWallet({
  wallet: primaryWallet,
})`

  const turnkeyFrontendCode = `import { useTurnkey } from "@turnkey/react-wallet-kit"

const { wallets, createWallet, refreshWallets, httpClient, session } = useTurnkey()

const wallet = await createWallet({
  walletName: \`My New Wallet \${Math.random()}\`,
  accounts: ["ADDRESS_FORMAT_ETHEREUM"],
})

const walletAddress = wallet.accounts[0].address

const actionsWallet = await actions.wallet.hostedWalletToActionsWallet({
  client: httpClient,
  organizationId: session.organizationId,
  signWith: walletAddress,
  ethereumAddress: walletAddress,
})`

  const turnkeyBackendCode = `import { Turnkey } from '@turnkey/sdk-server'

const turnkeyClient = new Turnkey({
  apiBaseUrl: 'https://api.turnkey.com',
  apiPublicKey: env.TURNKEY_API_KEY,
  apiPrivateKey: env.TURNKEY_API_SECRET,
  defaultOrganizationId: env.TURNKEY_ORGANIZATION_ID,
})

const turnkeyWallet = await turnkeyClient.apiClient().createWallet({
  walletName: 'ETH Wallet',
  accounts: [{
    curve: 'CURVE_SECP256K1',
    pathFormat: 'PATH_FORMAT_BIP32',
    path: "m/44'/60'/0'/0/0",
    addressFormat: 'ADDRESS_FORMAT_ETHEREUM',
  }],
})

const wallet = await actions.wallet.hostedWalletToActionsWallet({
  organizationId: turnkeyWallet.activity.organizationId,
  signWith: turnkeyWallet.addresses[0],
})`

  return (
    <>
      {/* Accordion Item 3: BYO Hosted Wallets */}
      <div className="mb-4">
        <button
          onClick={() =>
            setOpenAccordion(
              openAccordion === 'byo-wallet' ? null : 'byo-wallet',
            )
          }
          className="w-full flex items-center justify-between py-4 px-6 rounded-lg transition-colors"
          style={{
            backgroundColor:
              openAccordion === 'byo-wallet'
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
            <h3 className="text-lg font-medium text-gray-300">
              BYO Hosted Wallets
            </h3>
          </div>
          <svg
            className="w-5 h-5 text-gray-400 transition-transform duration-300"
            style={{
              transform:
                openAccordion === 'byo-wallet'
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
            maxHeight: openAccordion === 'byo-wallet' ? '3000px' : '0',
            opacity: openAccordion === 'byo-wallet' ? 1 : 0,
          }}
        >
          <div className="pt-6 pb-4">
            <p className="text-gray-300 text-base mb-4">
              Actions supports your existing hosted wallet provider.
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
              <div
                className="p-8"
                style={{ backgroundColor: '#32302f' }}
              >
                {selectedWalletProvider === 'privy' && (
                  <div className="space-y-6">
                    <div>
                      <p className="text-gray-300 text-base mb-4">
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
                      <p className="text-gray-300 mb-2">
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
                      <p className="text-gray-300 text-base mb-4">
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
                      <p className="text-gray-300 mb-2">
                        2. Create a frontend user wallet and extend it
                        with DeFi Actions:
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
                      <p className="text-gray-300 text-base mb-4">
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
                      <p className="text-gray-300 mb-2">
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
    </>
  )
}

export default HostedWalletsSection
