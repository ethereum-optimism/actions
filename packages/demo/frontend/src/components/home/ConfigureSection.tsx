import { colors } from '@/constants/colors'

interface ConfigureSectionProps {
  stepNumber: number
  isOpen: boolean
  onToggle: () => void
}

function ConfigureSection({ stepNumber, isOpen, onToggle }: ConfigureSectionProps) {
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
            Pick which DeFi protocols, markets, networks, assets, and
            providers you want to support.
          </p>
          <div
            className="rounded-lg overflow-hidden mb-8 shadow-2xl"
            style={{
              backgroundColor: colors.bg.code,
              boxShadow:
                '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(184, 187, 38, 0.05)',
            }}
          >
            {/* Terminal header */}
            <div
              className="px-4 py-3 border-b flex items-center justify-between"
              style={{
                backgroundColor: colors.bg.header,
                borderColor: 'rgba(184, 187, 38, 0.15)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <div className="flex items-center space-x-2">
                <div
                  className="w-3 h-3 rounded-full shadow-sm"
                  style={{ backgroundColor: colors.macos.red }}
                ></div>
                <div
                  className="w-3 h-3 rounded-full shadow-sm"
                  style={{ backgroundColor: colors.macos.yellow }}
                ></div>
                <div
                  className="w-3 h-3 rounded-full shadow-sm"
                  style={{
                    backgroundColor: 'rgb(184, 187, 38)',
                    boxShadow: '0 0 6px rgba(184, 187, 38, 0.4)',
                  }}
                ></div>
              </div>
              <div
                className="text-xs font-mono"
                style={{ color: colors.syntax.keyword }}
              >
                config.ts
              </div>
            </div>
            {/* Code content */}
            <div
              className="p-8 text-left relative"
              style={{ backgroundColor: colors.bg.code }}
            >
              <pre className="text-sm leading-relaxed font-mono">
                <code style={{ color: colors.text.primary }}>
                  <span
                    style={{ color: colors.syntax.keyword }}
                  >{`import`}</span>
                  {` { `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`USDC`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`ETH`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`WBTC`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`USDT`}</span>
                  {` } `}
                  <span
                    style={{ color: colors.syntax.keyword }}
                  >{`from`}</span>
                  {` `}
                  <span
                    style={{ color: colors.syntax.string }}
                  >{`'@eth-optimism/actions-sdk/assets'`}</span>
                  {`
`}
                  <span
                    style={{ color: colors.syntax.keyword }}
                  >{`import`}</span>
                  {` { `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`ExampleMorphoMarket`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`ExampleAaveMarket`}</span>
                  {` } `}
                  <span
                    style={{ color: colors.syntax.keyword }}
                  >{`from`}</span>
                  {` `}
                  <span
                    style={{ color: colors.syntax.string }}
                  >{`'@eth-optimism/actions-sdk/markets'`}</span>
                  {`
`}
                  <span
                    style={{ color: colors.syntax.keyword }}
                  >{`import`}</span>
                  {` { `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`unichain`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`optimism`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`base`}</span>
                  {` } `}
                  <span
                    style={{ color: colors.syntax.keyword }}
                  >{`from`}</span>
                  {` `}
                  <span
                    style={{ color: colors.syntax.string }}
                  >{`'viem/chains'`}</span>
                  {`
`}
                  <span
                    style={{ color: colors.syntax.keyword }}
                  >{`import`}</span>
                  {` { `}
                  <span
                    style={{ color: colors.syntax.function }}
                  >{`getPrivyClient`}</span>
                  {` } `}
                  <span
                    style={{ color: colors.syntax.keyword }}
                  >{`from`}</span>
                  {` `}
                  <span
                    style={{ color: colors.syntax.string }}
                  >{`'privy'`}</span>
                  {`

`}
                  <span
                    style={{ color: colors.syntax.keyword }}
                  >{`const`}</span>
                  {` `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`config`}</span>
                  {`: `}
                  <span
                    style={{ color: '#8ec07c' }}
                  >{`ActionsConfig`}</span>
                  {` = {
  `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`wallet`}</span>
                  {`: {
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`hostedWalletConfig`}</span>
                  {`: {
      `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`provider`}</span>
                  {`: {
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`type`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.string }}
                  >{`'privy'`}</span>
                  {`,
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`config`}</span>
                  {`: {
      `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`privyClient`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.function }}
                  >{`getPrivyClient`}</span>
                  {`(),
    },
      },
    },
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`smartWalletConfig`}</span>
                  {`: {
      `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`provider`}</span>
                  {`: {
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`type`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.string }}
                  >{`'default'`}</span>
                  {`,
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`attributionSuffix`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.string }}
                  >{`'actions'`}</span>
                  {`,
      },
    },
  },
  `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`lend`}</span>
                  {`: {
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`type`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.string }}
                  >{`'morpho'`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.comment }}
                  >{`// Lend Provider`}</span>
                  {`
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`assetAllowlist`}</span>
                  {`: [`}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`USDC`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`ETH`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`WBTC`}</span>
                  {`],
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`assetBlocklist`}</span>
                  {`: [`}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`USDT`}</span>
                  {`],
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`marketAllowlist`}</span>
                  {`: [`}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`ExampleMorphoMarket`}</span>
                  {`],
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`marketBlocklist`}</span>
                  {`: [`}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`ExampleAaveMarket`}</span>
                  {`],
  },
  `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`borrow`}</span>
                  {`: {
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`type`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.string }}
                  >{`'morpho'`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.comment }}
                  >{`// Borrow Provider`}</span>
                  {`
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`assetAllowlist`}</span>
                  {`: [`}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`USDC`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`ETH`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`WBTC`}</span>
                  {`],
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`assetBlocklist`}</span>
                  {`: [`}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`USDT`}</span>
                  {`],
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`marketAllowlist`}</span>
                  {`: [`}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`ExampleMorphoMarket`}</span>
                  {`],
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`marketBlocklist`}</span>
                  {`: [`}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`ExampleAaveMarket`}</span>
                  {`],
  },
  `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`swap`}</span>
                  {`: {
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`type`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.string }}
                  >{`'uniswap'`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.comment }}
                  >{`// Swap Provider`}</span>
                  {`
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`defaultSlippage`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.number }}
                  >{`100`}</span>
                  {`,
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`assetAllowList`}</span>
                  {`: [`}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`USDC`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`ETH`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`WBTC`}</span>
                  {`]
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`marketAllowlist`}</span>
                  {`: [
      { `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`from`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`ETH`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`to`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`USDC`}</span>
                  {` },
      { `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`from`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`USDC`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`to`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`ETH`}</span>
                  {` },
      { `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`from`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`ETH`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`to`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`WBTC`}</span>
                  {` },
      { `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`from`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`WBTC`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`to`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`ETH`}</span>
                  {` }
    ],
    `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`marketBlocklist`}</span>
                  {`: [
      { `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`from`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`ETH`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`to`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`USDC`}</span>
                  {` },
      { `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`from`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`USDC`}</span>
                  {`, `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`to`}</span>
                  {`: `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`ETH`}</span>
                  {` },
    ],
  },
  `}
                  <span
                    style={{ color: colors.syntax.comment }}
                  >{`// Chain Provider`}</span>
                  {`
  `}
                  <span
                    style={{ color: colors.syntax.property }}
                  >{`chains`}</span>
                  {`: [
      `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`unichain`}</span>
                  {`,
      `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`optimism`}</span>
                  {`,
      `}
                  <span
                    style={{ color: colors.syntax.variable }}
                  >{`base`}</span>
                  {`
  ]
}`}
                </code>
              </pre>
              {/* Copy button */}
              <button
                onClick={() =>
                  navigator.clipboard.writeText(
                    `import { USDC, ETH, WBTC, USDT } from '@eth-optimism/actions-sdk/assets'
import { ExampleMorphoMarket, ExampleAaveMarket } from '@eth-optimism/actions-sdk/markets'
import { unichain, optimism, base } from 'viem/chains'
import { getPrivyClient } from 'privy'

const config: ActionsConfig = {
  wallet: {
    hostedWalletConfig: {
      provider: {
    type: 'privy',
    config: {
      privyClient: getPrivyClient(),
    },
      },
    },
    smartWalletConfig: {
      provider: {
    type: 'default',
    // converts to '0xee4a2159c53ceed04edf4ce23cc97c5c'
    attributionSuffix: 'actions',
      },
    },
  },
  lend: {
    type: 'morpho', // Lend Provider
    assetAllowlist: [USDC, ETH, WBTC],
    assetBlocklist: [USDT],
    marketAllowlist: [ExampleMorphoMarket],
    marketBlocklist: [ExampleAaveMarket],
  },
  borrow: {
    type: 'morpho', // Borrow Provider
    assetAllowlist: [USDC, ETH, WBTC],
    assetBlocklist: [USDT],
    marketAllowlist: [ExampleMorphoMarket],
    marketBlocklist: [ExampleAaveMarket],
  },
  swap: {
    type: 'uniswap', // Swap Provider
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
}`,
                  )
                }
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 transition-colors"
                aria-label="Copy code"
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
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConfigureSection
