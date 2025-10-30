import { useState } from 'react'
import { colors } from '@/constants/colors'
import PrivyLogo from '@/assets/privy-logo-white.svg'
import DynamicLogo from '@/assets/dynamic-logo-white.svg'
import TurnkeyLogo from '@/assets/turnkey-logo-white.svg'
import TabbedCodeBlock from './TabbedCodeBlock'

interface SmartWalletsSectionProps {
  stepNumber: number | string
  openAccordion: string | null
  setOpenAccordion: (value: string | null) => void
}

function SmartWalletsSection({
  stepNumber,
  openAccordion,
  setOpenAccordion,
}: SmartWalletsSectionProps) {
  const [selectedWalletProvider, setSelectedWalletProvider] = useState('privy')
  const [selectedSmartPrivyTab, setSelectedSmartPrivyTab] = useState('frontend')
  const [selectedSmartDynamicTab, setSelectedSmartDynamicTab] =
    useState('frontend')
  const [selectedSmartTurnkeyTab, setSelectedSmartTurnkeyTab] =
    useState('frontend')

  const privyFrontendCode = `import { actions } from './config'
import { useWallets } from '@privy-io/react-auth'

// PRIVY: Fetch wallet
const { wallets } = useWallets()
const embeddedWallet = wallets.find(
  (wallet) => wallet.walletClientType === 'privy',
)

// ACTIONS: Create signer from hosted wallet
const signer = await actions.wallet.createSigner({
  connectedWallet: embeddedWallet,
})

// ACTIONS: Create smart wallet capable of Actions
const { wallet } = await actions.wallet.createSmartWallet({
  signer: signer
})`

  const privyBackendCode = `import { actions } from './config'
import { PrivyClient } from '@privy-io/node'
import { getAddress } from 'viem'

// PRIVY: Create wallet
const privyWallet = await privyClient.wallets().create({
  chain_type: 'ethereum',
  owner: { user_id: 'privy:did:xxxxx' },
});

// ACTIONS: Create signer from hosted wallet
const privySigner = await actions.wallet.createSigner({
  walletId: privyWallet.id,
  address: getAddress(privyWallet.address),
})

// ACTIONS: Create smart wallet capable of Actions
const { wallet } = await actions.wallet.createSmartWallet({
  signer: privySigner
})`

  const dynamicFrontendCode = `import { actions } from './config'
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"

// DYNAMIC: Fetch wallet
const { primaryWallet } = useDynamicContext()

// ACTIONS: Create signer from hosted wallet
const signer = await actions.wallet.createSigner({wallet: primaryWallet})

// ACTIONS: Create smart wallet capable of Actions
const { wallet } = await actions.wallet.createSmartWallet({
  signer: signer
})`

  const dynamicBackendCode = ``

  const turnkeyFrontendCode = `import { actions } from './config'
import { useTurnkey } from "@turnkey/react-wallet-kit"

// TURNKEY: Fetch wallet
const { wallets, user, createWallet, refreshWallets, httpClient, session } = useTurnkey()
useEffect(() => {
  async function createEmbeddedWallet() {
    const wallet = await createWallet({
      walletName: \`My New Wallet \${Math.random().toString(36).substring(2, 15)}\`,
      accounts: ["ADDRESS_FORMAT_ETHEREUM"],
    })
    refreshWallets()
  }

const embeddedWallet = wallets.find(
  (wallet) => wallet.accounts.some((account) => account.addressFormat === 'ADDRESS_FORMAT_ETHEREUM' && wallet.source === WalletSource.Embedded,
)

const walletAddress = embeddedWallet.accounts[0].address

// ACTIONS: Create signer from hosted wallet
const signer = await actions.wallet.createSigner({
  client: httpClient,
  organizationId: session.organizationId,
  signWith: walletAddress,
  ethereumAddress: walletAddress
})

// ACTIONS: Create smart wallet capable of Actions
const { wallet } = await actions.wallet.createSmartWallet({
  signer: signer
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

// ACTIONS: Create signer from hosted wallet
const turnkeySigner = await actions.wallet.createSigner({
  organizationId: turnkeyWallet.activity.organizationId,
  signWith: turnkeyWallet.addresses[0],
})

// ACTIONS: Create smart wallet capable of Actions
const { wallet } = await actions.wallet.createSmartWallet({
  signer: turnkeySigner
})`

  return (
    <>
      {/* Accordion Item 3 (alternate): Customizable Smart Wallets */}
      <div className="mb-4">
        <button
          onClick={() =>
            setOpenAccordion(
              openAccordion === 'smart-wallet' ? null : 'smart-wallet',
            )
          }
          className="w-full flex items-center justify-between py-4 px-6 rounded-lg transition-colors"
          style={{
            backgroundColor:
              openAccordion === 'smart-wallet'
                ? 'rgba(60, 60, 60, 0.5)'
                : 'rgba(40, 40, 40, 0.5)',
          }}
        >
          <div className="flex items-center gap-4">
            {stepNumber && (
              <span
                className="text-2xl font-medium"
                style={{ color: colors.actionsRed }}
              >
                {stepNumber}
              </span>
            )}
            <h3
              className="text-lg font-medium"
              style={{ color: colors.text.cream }}
            >
              Smart Wallets
            </h3>
          </div>
          <svg
            className="w-5 h-5 text-gray-400 transition-transform duration-300"
            style={{
              transform:
                openAccordion === 'smart-wallet'
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
            maxHeight: openAccordion === 'smart-wallet' ? '3000px' : '0',
            opacity: openAccordion === 'smart-wallet' ? 1 : 0,
          }}
        >
          <div className="pt-6 pb-4">
            <p className="text-base mb-4" style={{ color: colors.text.cream }}>
              Use hosted wallets as signers of smart wallets you control.
            </p>
            <div
              className="rounded-lg overflow-hidden mb-8 shadow-2xl"
              style={{
                backgroundColor: colors.bg.code,
                boxShadow:
                  '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(184, 187, 38, 0.05)',
              }}
            >
              <div
                className="flex border-b"
                style={{ borderColor: 'rgba(184, 187, 38, 0.15)' }}
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
                        className="text-base mb-2"
                        style={{ color: colors.text.cream }}
                      >
                        2. Hosted user wallets can become signers for new,
                        customizable smart wallets:
                      </p>
                      <TabbedCodeBlock
                        tabs={[
                          { label: 'Frontend', code: privyFrontendCode },
                          { label: 'Backend', code: privyBackendCode },
                        ]}
                        selectedTab={selectedSmartPrivyTab}
                        onTabChange={setSelectedSmartPrivyTab}
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
                          href="https://docs.dynamic.xyz/quickstart"
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
                        className="text-base mb-2"
                        style={{ color: colors.text.cream }}
                      >
                        2. Hosted user wallets can become signers for new,
                        customizable smart wallets:
                      </p>
                      <TabbedCodeBlock
                        tabs={[
                          { label: 'Frontend', code: dynamicFrontendCode },
                          { label: 'Backend', code: dynamicBackendCode },
                        ]}
                        selectedTab={selectedSmartDynamicTab}
                        onTabChange={setSelectedSmartDynamicTab}
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
                        className="text-base mb-2"
                        style={{ color: colors.text.cream }}
                      >
                        2. Hosted user wallets can become signers for new,
                        customizable smart wallets:
                      </p>
                      <TabbedCodeBlock
                        tabs={[
                          { label: 'Frontend', code: turnkeyFrontendCode },
                          { label: 'Backend', code: turnkeyBackendCode },
                        ]}
                        selectedTab={selectedSmartTurnkeyTab}
                        onTabChange={setSelectedSmartTurnkeyTab}
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

export default SmartWalletsSection
