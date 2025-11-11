import { ScrollyProvider } from 'react-scrolly-telling'
import { colors } from '@/constants/colors'
import ScrollingStack from '@/components/home/ScrollingStack'
import type {
  ScrollingStackProps,
  LayerContentItem,
} from '@/components/home/ScrollingStack'
import PrivyLogo from '@/assets/privy-logo-white.svg'
import DynamicLogo from '@/assets/dynamic-logo-white.svg'
import TurnkeyLogo from '@/assets/turnkey-logo-white.svg'

const content: LayerContentItem[] = [
  {
    title: 'Wallet',
    description:
      'Actions supports embedded wallet providers, creating smart wallets, managing signers, and sponsoring transactions with a gas paymaster.',
    images: [
      { src: PrivyLogo, link: 'https://www.privy.io/' },
      { src: TurnkeyLogo, link: 'https://www.turnkey.com/' },
      { src: DynamicLogo, link: 'https://www.dynamic.xyz/' },
    ],
    imageLabel: 'Supports embedded wallet providers:',
    mobileHeightBuffer: 0,
    code: `// Make onchain Actions from any embedded wallet
const wallet = await actions.wallet.toActionsWallet({
  embeddedWallet
});

// Create signers
const signer = await actions.wallet.createSigner({
  connectedWallet: embeddedWallet,
});

// Create smart contract wallets
const smartWallet = await actions.wallet.createSmartWallet({
  signer
});
`,
  },
  {
    title: 'Lend',
    description:
      'Let users earn yield by lending assets across chains and protocols. Configure preferred markets with allow & block lists',
    code: `// Fetch live market data
const markets = actions.lend.getMarkets(USDC);

// Lend assets, earn yield
const receipt = wallet.lend.openPosition({
  amount: 1,
  asset: USDC,
  ...ExampleMorphoMarket
});`,
  },
  {
    title: 'Borrow',
    description:
      'Let users borrow assets against lent collateral. Configure preferred markets with allow & block lists',
    soonBadge: true,
    code: `// Fetch live market data
const markets = actions.borrow.getMarkets(ETH);

// Borrow against lent collateral
const receipt = wallet.borrow.openPosition({
  amount: 1,
  asset: ETH,
  ...ExampleAaveMarket
});`,
  },
  {
    title: 'Swap',
    description:
      'Enable onchain trading between configurable protocols and assets.',
    soonBadge: true,
    code: `// Swap between tokens
const receipt = wallet.swap.execute({
  amountIn: 1,
  assetIn: USDC,
  assetOut: ETH,
});`,
  },
  {
    title: 'Pay',
    description: 'Simple interface for transfers and payments.',
    code: `// Easy, safe asset transfers
const receipt = wallet.send({
  amount: 1,
  asset: USDC,
  to: 'vitalik.eth',
})`,
  },
  {
    title: 'Assets',
    description: 'Configure which assets you want to support.',
    mobileHeightBuffer: 0,
    code: `// Import popular assets
import { USDC } from '@eth-optimism/actions-sdk/assets'

// Define custom assets
export const CustomToken: Asset = {
  address: {
    [mainnet.id]: '0x123...',
    [unichain.id]: '0x456...',
    [baseSepolia.id]: '0x789...',
  },
  metadata: {
    decimals: 6,
    name: 'Custom Token',
    symbol: 'CUSTOM',
  },
  type: 'erc20',
}

// Track balances
const usdcBalance = await wallet.getBalance(CustomToken);`,
  },
  {
    title: 'Chains',
    description:
      'Configure which chains you want to support. Abstract them away from your users.',
    mobileHeightBuffer: 0,
    code: `// Define chains once in a global config
const OPTIMISM = {
  chainId: optimism.id,
  rpcUrls: env.OPTIMISM_RPC_URL
  bundler: { // Bundle and sponsor txs with a gas paymaster
    type: 'simple' as const,
    url: env.OPTIMISM_BUNDLER_URL,
  },
}

const BASE = {
  chainId: base.id,
  rpcUrls: env.BASE_RPC_URL
  bundler: { // Bundle and sponsor txs with a gas paymaster
    type: 'simple' as const,
    url: env.BASE_BUNDLER_URL,
  },
}`,
  },
]

interface OverviewProps {
  onProgressUpdate: ScrollingStackProps['onProgressUpdate']
}

function Overview({ onProgressUpdate }: OverviewProps) {
  return (
    <ScrollyProvider>
      <div className="py-16">
        <div className="max-w-4xl mx-auto mb-8">
          <h2
            className="text-3xl font-medium mb-4"
            style={{ color: colors.text.cream }}
          >
            Overview
          </h2>
          <div className="h-px bg-gradient-to-r from-gray-600 via-gray-500 to-transparent mb-4"></div>
          <p className="mb-16" style={{ color: colors.text.cream }}>
            Actions is an open source TypeScript SDK for letting your users
            easily perform onchain actions: <strong>Lend</strong>,{' '}
            <strong>Borrow</strong>, <strong>Swap</strong>, <strong>Pay</strong>
            , without managing complex infrastructure or custody.
          </p>
          <p className="mb-16 text-center" style={{ color: colors.text.cream }}>
            Integrate DeFi with a single dependency.
          </p>
        </div>

        <ScrollingStack content={content} onProgressUpdate={onProgressUpdate} />
      </div>
    </ScrollyProvider>
  )
}

export default Overview
