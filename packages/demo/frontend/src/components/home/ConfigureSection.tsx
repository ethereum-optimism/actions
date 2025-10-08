import { useState } from 'react'
import { colors } from '@/constants/colors'
import TabbedCodeBlock from './TabbedCodeBlock'

interface ConfigureSectionProps {
  stepNumber: number
  isOpen: boolean
  onToggle: () => void
}

function ConfigureSection({
  stepNumber,
  isOpen,
  onToggle,
}: ConfigureSectionProps) {
  const [selectedTab, setSelectedTab] = useState('backend')

  const frontendConfigCode = `import { createActions } from '@eth-optimism/actions-sdk/react'
import { USDC, ETH, WBTC, USDT } from '@eth-optimism/actions-sdk/assets'
import { ExampleMorphoMarket, ExampleAaveMarket } from '@eth-optimism/actions-sdk/markets'
import { unichain, optimism, base } from 'config/chains'

const config: ActionsConfig = {
  // no frontend wallet config

  // Lend Provider
  lend: {
    type: 'morpho',
    assetAllowlist: [USDC, ETH, WBTC],
    assetBlocklist: [USDT],
    marketAllowlist: [ExampleMorphoMarket],
    marketBlocklist: [ExampleAaveMarket],
  },

  // Borrow Provider
  borrow: {
    type: 'morpho',
    assetAllowlist: [USDC, ETH, WBTC],
    assetBlocklist: [USDT],
    marketAllowlist: [ExampleMorphoMarket],
    marketBlocklist: [ExampleAaveMarket],
  },

  // Swap Provider
  swap: {
    type: 'uniswap',
    defaultSlippage: 100,
    assetAllowList: [USDC, ETH, WBTC]
    marketAllowlist: [
      { from: ETH, to: USDC },
      { from: USDC, to: ETH },
      { from: ETH, to: WBTC },
      { from: WBTC, to: ETH }
    ],
    marketBlocklist: [
      { from: ETH, to: USDC },
      { from: USDC, to: ETH },
    ],
  },

  // Chain Provider
  chains: [
      unichain,
      optimism,
      base
  ]
}

export const actions = createActions(config)`

  const backendConfigCode = `import { createActions } from '@eth-optimism/actions-sdk/node'
import { USDC, ETH, WBTC, USDT } from '@eth-optimism/actions-sdk/assets'
import { ExampleMorphoMarket, ExampleAaveMarket } from '@eth-optimism/actions-sdk/markets'
import { unichain, optimism, base } from 'config/chains'
import { PrivyClient } from '@privy-io/node'

const privy = new PrivyClient(env.PRIVY_APP_ID, env.PRIVY_APP_SECRET)

const config: ActionsConfig = {
  wallet: {
    hostedWalletConfig: {
      provider: {
        type: 'privy',
        config: {
          privyClient: privy,
        },
      },
    },
    smartWalletConfig: {
      provider: {
        type: 'default',
        attributionSuffix: 'actions',
      },
    },
  },

  // Lend Provider
  lend: {
    type: 'morpho',
    assetAllowlist: [USDC, ETH, WBTC],
    assetBlocklist: [USDT],
    marketAllowlist: [ExampleMorphoMarket],
    marketBlocklist: [ExampleAaveMarket],
  },

  // Borrow Provider
  borrow: {
    type: 'morpho',
    assetAllowlist: [USDC, ETH, WBTC],
    assetBlocklist: [USDT],
    marketAllowlist: [ExampleMorphoMarket],
    marketBlocklist: [ExampleAaveMarket],
  },

  // Swap Provider
  swap: {
    type: 'uniswap',
    defaultSlippage: 100,
    assetAllowList: [USDC, ETH, WBTC]
    marketAllowlist: [
      { from: ETH, to: USDC },
      { from: USDC, to: ETH },
      { from: ETH, to: WBTC },
      { from: WBTC, to: ETH }
    ],
    marketBlocklist: [
      { from: ETH, to: USDC },
      { from: USDC, to: ETH },
    ],
  },

  // Chain Provider
  chains: [
      unichain,
      optimism,
      base
  ]
}

export const actions = createActions(config)`

  return (
    <div className="mb-4">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-4 px-6 rounded-lg transition-colors"
        style={{
          backgroundColor: isOpen
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
            Configure Actions
          </h3>
        </div>
        <svg
          className="w-5 h-5 text-gray-400 transition-transform duration-300"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
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
          maxHeight: isOpen ? '2000px' : '0',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="pt-6 pb-4">
          <p className="text-gray-300 text-base mb-4">
            Pick which DeFi protocols, markets, networks, assets, and providers
            you want to support.
          </p>
          <TabbedCodeBlock
            tabs={[
              { label: 'Backend', code: backendConfigCode },
              { label: 'Frontend', code: frontendConfigCode, disabled: true, disabledMessage: 'Soon™' },
            ]}
            selectedTab={selectedTab}
            onTabChange={setSelectedTab}
            filename="config.ts"
          />
        </div>
      </div>
    </div>
  )
}

export default ConfigureSection
