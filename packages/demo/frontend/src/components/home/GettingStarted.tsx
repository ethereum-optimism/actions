import { useState } from 'react'
import { colors } from '@/constants/colors'
import PrivyLogo from '@/assets/privy-logo-white.svg'
import DynamicLogo from '@/assets/dynamic-logo-white.svg'
import TurnkeyLogo from '@/assets/turnkey-logo-white.svg'

function GettingStarted() {
  const [openAccordion, setOpenAccordion] = useState<string | null>('install')
  const [selectedPackageManager, setSelectedPackageManager] = useState('npm')
  const [selectedWalletProvider, setSelectedWalletProvider] = useState('privy')
  const [selectedPrivyTab, setSelectedPrivyTab] = useState('frontend')
  const [selectedDynamicTab, setSelectedDynamicTab] = useState('frontend')
  const [selectedTurnkeyTab, setSelectedTurnkeyTab] = useState('frontend')
  const [selectedSmartPrivyTab, setSelectedSmartPrivyTab] = useState('frontend')
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
          <div className="mb-4">
            <button
              onClick={() =>
                setOpenAccordion(
                  openAccordion === 'install' ? null : 'install',
                )
              }
              className="w-full flex items-center justify-between py-4 px-6 rounded-lg transition-colors"
              style={{
                backgroundColor:
                  openAccordion === 'install'
                    ? 'rgba(60, 60, 60, 0.5)'
                    : 'rgba(40, 40, 40, 0.5)',
              }}
            >
              <div className="flex items-center gap-4">
                <span
                  className="text-2xl font-medium"
                  style={{ color: colors.actionsRed }}
                >
                  1
                </span>
                <h3 className="text-lg font-medium text-gray-300">
                  Install the library
                </h3>
              </div>
              <svg
                className="w-5 h-5 text-gray-400 transition-transform duration-300"
                style={{
                  transform:
                    openAccordion === 'install'
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
                maxHeight: openAccordion === 'install' ? '1000px' : '0',
                opacity: openAccordion === 'install' ? 1 : 0,
              }}
            >
              <div className="pt-6 pb-4">
                <div
                  className="rounded-lg overflow-hidden mb-8 shadow-2xl"
                  style={{
                    backgroundColor: colors.bg.code,
                    boxShadow:
                      '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(184, 187, 38, 0.05)',
                  }}
                >
                  {/* Tab switcher */}
                  <div
                    className="flex border-b"
                    style={{
                      backgroundColor: colors.bg.header,
                      borderColor: 'rgba(184, 187, 38, 0.15)',
                    }}
                  >
                    {Object.keys(packageManagers).map((pm) => (
                      <button
                        key={pm}
                        onClick={() => setSelectedPackageManager(pm)}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${
                          selectedPackageManager === pm
                            ? 'text-white border-b-2'
                            : 'text-gray-400 hover:text-gray-300'
                        }`}
                        style={{
                          borderColor:
                            selectedPackageManager === pm
                              ? 'rgb(184, 187, 38)'
                              : 'transparent',
                        }}
                      >
                        {pm}
                      </button>
                    ))}
                  </div>
                  {/* Code content */}
                  <div
                    className="p-8 text-left relative"
                    style={{ backgroundColor: colors.bg.code }}
                  >
                    <pre className="text-sm leading-relaxed font-mono">
                      <code style={{ color: colors.text.primary }}>
                        <span style={{ color: 'rgba(184, 187, 38, 0.9)' }}>
                          {
                            packageManagers[
                              selectedPackageManager as keyof typeof packageManagers
                            ].split(' ')[0]
                          }
                        </span>
                        {` ${packageManagers[selectedPackageManager as keyof typeof packageManagers].split(' ').slice(1).join(' ')}`}
                      </code>
                    </pre>
                    {/* Copy button */}
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(
                          packageManagers[
                            selectedPackageManager as keyof typeof packageManagers
                          ],
                        )
                      }
                      className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 transition-colors"
                      aria-label="Copy command"
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

          {/* Horizontal line */}
          <div className="h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent my-4"></div>

          {/* Accordion Item 2: Configure */}
          <div className="mb-4">
            <button
              onClick={() =>
                setOpenAccordion(
                  openAccordion === 'configure' ? null : 'configure',
                )
              }
              className="w-full flex items-center justify-between py-4 px-6 rounded-lg transition-colors"
              style={{
                backgroundColor:
                  openAccordion === 'configure'
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
                <h3 className="text-lg font-medium text-gray-300">
                  Configure Actions
                </h3>
              </div>
              <svg
                className="w-5 h-5 text-gray-400 transition-transform duration-300"
                style={{
                  transform:
                    openAccordion === 'configure'
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
                maxHeight: openAccordion === 'configure' ? '2000px' : '0',
                opacity: openAccordion === 'configure' ? 1 : 0,
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

          {/* Horizontal line */}
          <div className="h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent my-4"></div>

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
                  3
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
                          <div
                            className="rounded-lg overflow-hidden"
                            style={{
                              backgroundColor: colors.bg.code,
                            }}
                          >
                            {/* Frontend/Backend tabs */}
                            <div
                              className="flex border-b"
                              style={{
                                borderColor: 'rgba(184, 187, 38, 0.15)',
                              }}
                            >
                              <button
                                onClick={() =>
                                  setSelectedPrivyTab('frontend')
                                }
                                className="px-6 py-3 text-sm font-mono transition-colors border-b-2"
                                style={{
                                  backgroundColor: colors.bg.header,
                                  color:
                                    selectedPrivyTab === 'frontend'
                                      ? colors.text.primary
                                      : colors.text.secondary,
                                  borderColor:
                                    selectedPrivyTab === 'frontend'
                                      ? 'rgb(184, 187, 38)'
                                      : 'transparent',
                                  opacity:
                                    selectedPrivyTab === 'frontend'
                                      ? 1
                                      : 0.6,
                                }}
                              >
                                Frontend
                              </button>
                              <button
                                onClick={() =>
                                  setSelectedPrivyTab('backend')
                                }
                                className="px-6 py-3 text-sm font-mono transition-colors border-b-2"
                                style={{
                                  backgroundColor: colors.bg.header,
                                  color:
                                    selectedPrivyTab === 'backend'
                                      ? colors.text.primary
                                      : colors.text.secondary,
                                  borderColor:
                                    selectedPrivyTab === 'backend'
                                      ? 'rgb(184, 187, 38)'
                                      : 'transparent',
                                  opacity:
                                    selectedPrivyTab === 'backend'
                                      ? 1
                                      : 0.6,
                                }}
                              >
                                Backend
                              </button>
                            </div>
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
                                  style={{
                                    backgroundColor: colors.macos.red,
                                  }}
                                ></div>
                                <div
                                  className="w-3 h-3 rounded-full shadow-sm"
                                  style={{
                                    backgroundColor: colors.macos.yellow,
                                  }}
                                ></div>
                                <div
                                  className="w-3 h-3 rounded-full shadow-sm"
                                  style={{
                                    backgroundColor: 'rgb(184, 187, 38)',
                                    boxShadow:
                                      '0 0 6px rgba(184, 187, 38, 0.4)',
                                  }}
                                ></div>
                              </div>
                              <div
                                className="text-xs font-mono"
                                style={{ color: colors.syntax.keyword }}
                              >
                                wallet.ts
                              </div>
                            </div>
                            <div className="relative">
                              {selectedPrivyTab === 'frontend' && (
                                <pre
                                  className="text-sm leading-relaxed font-mono p-4"
                                  style={{
                                    backgroundColor: colors.bg.code,
                                  }}
                                >
                                  <code
                                    style={{ color: colors.text.primary }}
                                  >
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`import`}</span>
                                    {` { `}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`useWallets`}</span>
                                    {` } `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`from`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'@privy-io/react-auth'`}</span>
                                    {`

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` { `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallets`}</span>
                                    {` } = `}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`useWallets`}</span>
                                    {`()
`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`embeddedWallet`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallets`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`find`}</span>
                                    {`(
  (`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {`) `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`=>`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`walletClientType`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`===`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'privy'`}</span>
                                    {`,
)

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`await`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`actions`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`hostedWalletToActionsWallet`}</span>
                                    {`({
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`connectedWallet`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`embeddedWallet`}</span>
                                    {`,
})`}
                                  </code>
                                </pre>
                              )}
                              {selectedPrivyTab === 'backend' && (
                                <pre
                                  className="text-sm leading-relaxed font-mono p-4"
                                  style={{
                                    backgroundColor: colors.bg.code,
                                  }}
                                >
                                  <code
                                    style={{ color: colors.text.primary }}
                                  >
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`import`}</span>
                                    {` { `}
                                    <span
                                      style={{ color: '#8ec07c' }}
                                    >{`PrivyClient`}</span>
                                    {` } `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`from`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'@privy-io/node'`}</span>
                                    {`

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`privyClient`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`new`}</span>
                                    {` `}
                                    <span
                                      style={{ color: '#8ec07c' }}
                                    >{`PrivyClient`}</span>
                                    {`(`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`env`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`PRIVY_APP_ID`}</span>
                                    {`, `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`env`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`PRIVY_APP_SECRET`}</span>
                                    {`)

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`privyWallet`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`await`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`privyClient`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`walletApi`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`createWallet`}</span>
                                    {`({
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`chainType`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'ethereum'`}</span>
                                    {`,
})

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`await`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`actions`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`hostedWalletToActionsWallet`}</span>
                                    {`({
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`walletId`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`privyWallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`id`}</span>
                                    {`,
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`address`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`privyWallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`address`}</span>
                                    {`,
})`}
                                  </code>
                                </pre>
                              )}
                              {/* Copy button */}
                              <button
                                onClick={() =>
                                  navigator.clipboard.writeText(
                                    selectedPrivyTab === 'frontend'
                                      ? `import {useWallets} from '@privy-io/react-auth'

const { wallets } = useWallets()
const embeddedWallet = wallets.find(
  (wallet) => wallet.walletClientType === 'privy',
)

const actionsWallet = await actions.wallet.hostedWalletToActionsWallet({
  connectedWallet: embeddedWallet,
})`
                                      : `import { PrivyClient } from '@privy-io/node'

const privyClient = new PrivyClient(env.PRIVY_APP_ID, env.PRIVY_APP_SECRET)

const privyWallet = await privyClient.walletApi.createWallet({
  chainType: 'ethereum',
})

const wallet = await actions.wallet.hostedWalletToActionsWallet({
  walletId: privyWallet.id,
  address: privyWallet.address,
})`,
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
                          <div
                            className="rounded-lg overflow-hidden"
                            style={{
                              backgroundColor: colors.bg.code,
                            }}
                          >
                            {/* Frontend/Backend tabs */}
                            <div
                              className="flex border-b"
                              style={{
                                borderColor: 'rgba(184, 187, 38, 0.15)',
                              }}
                            >
                              <button
                                onClick={() =>
                                  setSelectedDynamicTab('frontend')
                                }
                                className="px-6 py-3 text-sm font-mono transition-colors border-b-2"
                                style={{
                                  backgroundColor: colors.bg.header,
                                  color:
                                    selectedDynamicTab === 'frontend'
                                      ? colors.text.primary
                                      : colors.text.secondary,
                                  borderColor:
                                    selectedDynamicTab === 'frontend'
                                      ? 'rgb(184, 187, 38)'
                                      : 'transparent',
                                  opacity:
                                    selectedDynamicTab === 'frontend'
                                      ? 1
                                      : 0.6,
                                }}
                              >
                                Frontend
                              </button>
                              <button
                                disabled
                                className="px-6 py-3 text-sm font-mono transition-colors border-b-2 cursor-not-allowed"
                                style={{
                                  backgroundColor: colors.bg.header,
                                  color: colors.text.secondary,
                                  borderColor: 'transparent',
                                  opacity: 0.3,
                                }}
                              >
                                Backend
                              </button>
                            </div>
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
                                  style={{
                                    backgroundColor: colors.macos.red,
                                  }}
                                ></div>
                                <div
                                  className="w-3 h-3 rounded-full shadow-sm"
                                  style={{
                                    backgroundColor: colors.macos.yellow,
                                  }}
                                ></div>
                                <div
                                  className="w-3 h-3 rounded-full shadow-sm"
                                  style={{
                                    backgroundColor: 'rgb(184, 187, 38)',
                                    boxShadow:
                                      '0 0 6px rgba(184, 187, 38, 0.4)',
                                  }}
                                ></div>
                              </div>
                              <div
                                className="text-xs font-mono"
                                style={{ color: colors.syntax.keyword }}
                              >
                                wallet.ts
                              </div>
                            </div>
                            <div className="relative">
                              <pre
                                className="text-sm leading-relaxed font-mono p-4"
                                style={{ backgroundColor: colors.bg.code }}
                              >
                                <code
                                  style={{ color: colors.text.primary }}
                                >
                                  <span
                                    style={{ color: colors.syntax.keyword }}
                                  >{`import`}</span>
                                  {` { `}
                                  <span
                                    style={{
                                      color: colors.syntax.function,
                                    }}
                                  >{`useDynamicContext`}</span>
                                  {` } `}
                                  <span
                                    style={{ color: colors.syntax.keyword }}
                                  >{`from`}</span>
                                  {` `}
                                  <span
                                    style={{ color: colors.syntax.string }}
                                  >{`"@dynamic-labs/sdk-react-core"`}</span>
                                  {`

`}
                                  <span
                                    style={{ color: colors.syntax.keyword }}
                                  >{`const`}</span>
                                  {` { `}
                                  <span
                                    style={{
                                      color: colors.syntax.variable,
                                    }}
                                  >{`primaryWallet`}</span>
                                  {` } = `}
                                  <span
                                    style={{
                                      color: colors.syntax.function,
                                    }}
                                  >{`useDynamicContext`}</span>
                                  {`()

`}
                                  <span
                                    style={{ color: colors.syntax.keyword }}
                                  >{`const`}</span>
                                  {` `}
                                  <span
                                    style={{
                                      color: colors.syntax.variable,
                                    }}
                                  >{`wallet`}</span>
                                  {` = `}
                                  <span
                                    style={{ color: colors.syntax.keyword }}
                                  >{`await`}</span>
                                  {` `}
                                  <span
                                    style={{
                                      color: colors.syntax.variable,
                                    }}
                                  >{`actions`}</span>
                                  {`.`}
                                  <span
                                    style={{
                                      color: colors.syntax.variable,
                                    }}
                                  >{`wallet`}</span>
                                  {`.`}
                                  <span
                                    style={{
                                      color: colors.syntax.function,
                                    }}
                                  >{`hostedWalletToVerbsWallet`}</span>
                                  {`({
  `}
                                  <span
                                    style={{
                                      color: colors.syntax.property,
                                    }}
                                  >{`wallet`}</span>
                                  {`: `}
                                  <span
                                    style={{
                                      color: colors.syntax.variable,
                                    }}
                                  >{`primaryWallet`}</span>
                                  {`,
})`}
                                </code>
                              </pre>
                              {/* Copy button */}
                              <button
                                onClick={() =>
                                  navigator.clipboard.writeText(
                                    `import { useDynamicContext } from "@dynamic-labs/sdk-react-core"

const { primaryWallet } = useDynamicContext()

const verbsDynamicWallet = await actions.wallet.hostedWalletToVerbsWallet({
  wallet: primaryWallet,
})`,
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
                          <div
                            className="rounded-lg overflow-hidden"
                            style={{
                              backgroundColor: colors.bg.code,
                            }}
                          >
                            {/* Frontend/Backend tabs */}
                            <div
                              className="flex border-b"
                              style={{
                                borderColor: 'rgba(184, 187, 38, 0.15)',
                              }}
                            >
                              <button
                                onClick={() =>
                                  setSelectedTurnkeyTab('frontend')
                                }
                                className="px-6 py-3 text-sm font-mono transition-colors border-b-2"
                                style={{
                                  backgroundColor: colors.bg.header,
                                  color:
                                    selectedTurnkeyTab === 'frontend'
                                      ? colors.text.primary
                                      : colors.text.secondary,
                                  borderColor:
                                    selectedTurnkeyTab === 'frontend'
                                      ? 'rgb(184, 187, 38)'
                                      : 'transparent',
                                  opacity:
                                    selectedTurnkeyTab === 'frontend'
                                      ? 1
                                      : 0.6,
                                }}
                              >
                                Frontend
                              </button>
                              <button
                                onClick={() =>
                                  setSelectedTurnkeyTab('backend')
                                }
                                className="px-6 py-3 text-sm font-mono transition-colors border-b-2"
                                style={{
                                  backgroundColor: colors.bg.header,
                                  color:
                                    selectedTurnkeyTab === 'backend'
                                      ? colors.text.primary
                                      : colors.text.secondary,
                                  borderColor:
                                    selectedTurnkeyTab === 'backend'
                                      ? 'rgb(184, 187, 38)'
                                      : 'transparent',
                                  opacity:
                                    selectedTurnkeyTab === 'backend'
                                      ? 1
                                      : 0.6,
                                }}
                              >
                                Backend
                              </button>
                            </div>
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
                                  style={{
                                    backgroundColor: colors.macos.red,
                                  }}
                                ></div>
                                <div
                                  className="w-3 h-3 rounded-full shadow-sm"
                                  style={{
                                    backgroundColor: colors.macos.yellow,
                                  }}
                                ></div>
                                <div
                                  className="w-3 h-3 rounded-full shadow-sm"
                                  style={{
                                    backgroundColor: 'rgb(184, 187, 38)',
                                    boxShadow:
                                      '0 0 6px rgba(184, 187, 38, 0.4)',
                                  }}
                                ></div>
                              </div>
                              <div
                                className="text-xs font-mono"
                                style={{ color: colors.syntax.keyword }}
                              >
                                wallet.ts
                              </div>
                            </div>
                            <div className="relative">
                              {selectedTurnkeyTab === 'frontend' && (
                                <pre
                                  className="text-sm leading-relaxed font-mono p-4"
                                  style={{
                                    backgroundColor: colors.bg.code,
                                  }}
                                >
                                  <code
                                    style={{ color: colors.text.primary }}
                                  >
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`import`}</span>
                                    {` { `}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`useTurnkey`}</span>
                                    {` } `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`from`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`"@turnkey/react-wallet-kit"`}</span>
                                    {`

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` { `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallets`}</span>
                                    {`, `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`user`}</span>
                                    {`, `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`createWallet`}</span>
                                    {`, `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`refreshWallets`}</span>
                                    {`, `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`httpClient`}</span>
                                    {`, `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`session`}</span>
                                    {` } = `}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`useTurnkey`}</span>
                                    {`()
`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`useEffect`}</span>
                                    {`(() => {
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`async function`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`createEmbeddedWallet`}</span>
                                    {`() {
    `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`await`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`createWallet`}</span>
                                    {`({
      `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`walletName`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`\`My New Wallet \${Math.random().toString(36).substring(2, 15)}\``}</span>
                                    {`,
      `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`accounts`}</span>
                                    {`: [`}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`"ADDRESS_FORMAT_ETHEREUM"`}</span>
                                    {`],
    })
    `}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`refreshWallets`}</span>
                                    {`()
  }

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`embeddedWallet`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallets`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`find`}</span>
                                    {`(
  (`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {`) => `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`accounts`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`some`}</span>
                                    {`((`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`account`}</span>
                                    {`) => `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`account`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`addressFormat`}</span>
                                    {` === `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'ADDRESS_FORMAT_ETHEREUM'`}</span>
                                    {`) && `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`source`}</span>
                                    {` === `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`WalletSource`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`Embedded`}</span>
                                    {`,
)

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`walletAddress`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`embeddedWallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`accounts`}</span>
                                    {`[`}
                                    <span
                                      style={{
                                        color: colors.syntax.number,
                                      }}
                                    >{`0`}</span>
                                    {`].`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`address`}</span>
                                    {`
`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`actionsWallet`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`await`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`actions`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`wallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`hostedWalletToActionsWallet`}</span>
                                    {`({
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`client`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`httpClient`}</span>
                                    {`,
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`organizationId`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`session`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`organizationId`}</span>
                                    {`,
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`signWith`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`walletAddress`}</span>
                                    {`,
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`ethereumAddress`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`walletAddress`}</span>
                                    {`
})`}
                                  </code>
                                </pre>
                              )}
                              {selectedTurnkeyTab === 'backend' && (
                                <pre
                                  className="text-sm leading-relaxed font-mono p-4"
                                  style={{
                                    backgroundColor: colors.bg.code,
                                  }}
                                >
                                  <code
                                    style={{ color: colors.text.primary }}
                                  >
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`import`}</span>
                                    {` { `}
                                    <span
                                      style={{ color: '#8ec07c' }}
                                    >{`Turnkey`}</span>
                                    {` } `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`from`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'@turnkey/sdk-server'`}</span>
                                    {`

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`turnkeyClient`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`new`}</span>
                                    {` `}
                                    <span
                                      style={{ color: '#8ec07c' }}
                                    >{`Turnkey`}</span>
                                    {`({
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`apiBaseUrl`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'https://api.turnkey.com'`}</span>
                                    {`,
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`apiPublicKey`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`env`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`TURNKEY_API_KEY`}</span>
                                    {`,
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`apiPrivateKey`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`env`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`TURNKEY_API_SECRET`}</span>
                                    {`,
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`defaultOrganizationId`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`env`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`TURNKEY_ORGANIZATION_ID`}</span>
                                    {`,
})

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`turnkeyWallet`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`await`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`turnkeyClient`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`apiClient`}</span>
                                    {`().`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`createWallet`}</span>
                                    {`({
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`walletName`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'ETH Wallet'`}</span>
                                    {`,
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`accounts`}</span>
                                    {`: [{
    `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`curve`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'CURVE_SECP256K1'`}</span>
                                    {`,
    `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`pathFormat`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'PATH_FORMAT_BIP32'`}</span>
                                    {`,
    `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`path`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`"m/44'/60'/0'/0/0"`}</span>
                                    {`,
    `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`addressFormat`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'ADDRESS_FORMAT_ETHEREUM'`}</span>
                                    {`,
  }],
})

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`await`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`actions`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`hostedWalletToActionsWallet`}</span>
                                    {`({
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`organizationId`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`turnkeyWallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`activity`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`organizationId`}</span>
                                    {`,
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`signWith`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`turnkeyWallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`addresses`}</span>
                                    {`[`}
                                    <span
                                      style={{
                                        color: colors.syntax.number,
                                      }}
                                    >{`0`}</span>
                                    {`],
})`}
                                  </code>
                                </pre>
                              )}
                              {/* Copy button */}
                              <button
                                onClick={() =>
                                  navigator.clipboard.writeText(
                                    selectedTurnkeyTab === 'frontend'
                                      ? `import { useTurnkey } from "@turnkey/react-wallet-kit"

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
                                      : `import { Turnkey } from '@turnkey/sdk-server'

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
})`,
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
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Horizontal line with OR */}
          <div className="flex items-center my-4">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent"></div>
            <span className="px-4 text-sm font-medium text-gray-500">
              OR
            </span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent"></div>
          </div>

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
                <span
                  className="text-2xl font-medium"
                  style={{ color: colors.actionsRed }}
                >
                  3
                </span>
                <h3 className="text-lg font-medium text-gray-300">
                  Customizable Smart Wallets
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
                maxHeight:
                  openAccordion === 'smart-wallet' ? '3000px' : '0',
                opacity: openAccordion === 'smart-wallet' ? 1 : 0,
              }}
            >
              <div className="pt-6 pb-4">
                <p className="text-gray-300 text-base mb-4">
                  Use hosted wallets as signers of smart wallets you
                  control.
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
                          <p className="text-gray-300 text-base mb-2">
                            2. Hosted user wallets can become signers for
                            new, customizable smart wallets:
                          </p>
                          <div
                            className="rounded-lg overflow-hidden"
                            style={{
                              backgroundColor: colors.bg.code,
                            }}
                          >
                            {/* Frontend/Backend tabs */}
                            <div
                              className="flex border-b"
                              style={{
                                borderColor: 'rgba(184, 187, 38, 0.15)',
                              }}
                            >
                              <button
                                onClick={() =>
                                  setSelectedSmartPrivyTab('frontend')
                                }
                                className="px-6 py-3 text-sm font-mono transition-colors border-b-2"
                                style={{
                                  backgroundColor: colors.bg.header,
                                  color:
                                    selectedSmartPrivyTab === 'frontend'
                                      ? colors.text.primary
                                      : colors.text.secondary,
                                  borderColor:
                                    selectedSmartPrivyTab === 'frontend'
                                      ? 'rgb(184, 187, 38)'
                                      : 'transparent',
                                  opacity:
                                    selectedSmartPrivyTab === 'frontend'
                                      ? 1
                                      : 0.6,
                                }}
                              >
                                Frontend
                              </button>
                              <button
                                onClick={() =>
                                  setSelectedSmartPrivyTab('backend')
                                }
                                className="px-6 py-3 text-sm font-mono transition-colors border-b-2"
                                style={{
                                  backgroundColor: colors.bg.header,
                                  color:
                                    selectedSmartPrivyTab === 'backend'
                                      ? colors.text.primary
                                      : colors.text.secondary,
                                  borderColor:
                                    selectedSmartPrivyTab === 'backend'
                                      ? 'rgb(184, 187, 38)'
                                      : 'transparent',
                                  opacity:
                                    selectedSmartPrivyTab === 'backend'
                                      ? 1
                                      : 0.6,
                                }}
                              >
                                Backend
                              </button>
                            </div>
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
                                  style={{
                                    backgroundColor: colors.macos.red,
                                  }}
                                ></div>
                                <div
                                  className="w-3 h-3 rounded-full shadow-sm"
                                  style={{
                                    backgroundColor: colors.macos.yellow,
                                  }}
                                ></div>
                                <div
                                  className="w-3 h-3 rounded-full shadow-sm"
                                  style={{
                                    backgroundColor: 'rgb(184, 187, 38)',
                                    boxShadow:
                                      '0 0 6px rgba(184, 187, 38, 0.4)',
                                  }}
                                ></div>
                              </div>
                              <div
                                className="text-xs font-mono"
                                style={{ color: colors.syntax.keyword }}
                              >
                                wallet.ts
                              </div>
                            </div>
                            <div className="relative">
                              {selectedSmartPrivyTab === 'frontend' && (
                                <pre
                                  className="text-sm leading-relaxed font-mono p-4"
                                  style={{
                                    backgroundColor: colors.bg.code,
                                  }}
                                >
                                  <code
                                    style={{ color: colors.text.primary }}
                                  >
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`import`}</span>
                                    {` { `}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`useWallets`}</span>
                                    {` } `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`from`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'@privy-io/react-auth'`}</span>
                                    {`

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` { `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallets`}</span>
                                    {` } = `}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`useWallets`}</span>
                                    {`()
`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`embeddedWallet`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallets`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`find`}</span>
                                    {`(
  (`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {`) `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`=>`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`walletClientType`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`===`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'privy'`}</span>
                                    {`,
)

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`signer`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`await`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`actions`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`createSigner`}</span>
                                    {`({
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`connectedWallet`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`embeddedWallet`}</span>
                                    {`,
})

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` { `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {` } = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`await`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`actions`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`createSmartWallet`}</span>
                                    {`({
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`owners`}</span>
                                    {`: [`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`signer`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`address`}</span>
                                    {`],
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`signer`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`signer`}</span>
                                    {`,
})`}
                                  </code>
                                </pre>
                              )}
                              {selectedSmartPrivyTab === 'backend' && (
                                <pre
                                  className="text-sm leading-relaxed font-mono p-4"
                                  style={{
                                    backgroundColor: colors.bg.code,
                                  }}
                                >
                                  <code
                                    style={{ color: colors.text.primary }}
                                  >
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`import`}</span>
                                    {` { `}
                                    <span
                                      style={{ color: '#8ec07c' }}
                                    >{`PrivyClient`}</span>
                                    {` } `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`from`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'@privy-io/node'`}</span>
                                    {`
`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`import`}</span>
                                    {` { `}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`getAddress`}</span>
                                    {` } `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`from`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'viem'`}</span>
                                    {`

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`privyWallet`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`await`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`privyClient`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`walletApi`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`createWallet`}</span>
                                    {`({
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`chainType`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'ethereum'`}</span>
                                    {`,
})

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`privySigner`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`await`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`actions`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`createSigner`}</span>
                                    {`({
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`walletId`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`privyWallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`id`}</span>
                                    {`,
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`address`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`getAddress`}</span>
                                    {`(`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`privyWallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`address`}</span>
                                    {`),
})

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` { `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {` } = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`await`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`actions`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`createSmartWallet`}</span>
                                    {`({
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`owners`}</span>
                                    {`: [`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`privySigner`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`address`}</span>
                                    {`],
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`signer`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`privySigner`}</span>
                                    {`,
})`}
                                  </code>
                                </pre>
                              )}
                              {/* Copy button */}
                              <button
                                onClick={() =>
                                  navigator.clipboard.writeText(
                                    selectedSmartPrivyTab === 'frontend'
                                      ? `import { useWallets } from '@privy-io/react-auth'

const { wallets } = useWallets()
const embeddedWallet = wallets.find(
  (wallet) => wallet.walletClientType === 'privy',
)

const signer = await actions.wallet.createSigner({
  connectedWallet: embeddedWallet,
})

const { wallet } = await actions.wallet.createSmartWallet({
  owners: [signer.address],
  signer: signer,
})`
                                      : `import { PrivyClient } from '@privy-io/node'
import { getAddress } from 'viem'

const privyWallet = await privyClient.walletApi.createWallet({
  chainType: 'ethereum',
})

const privySigner = await actions.wallet.createSigner({
  walletId: privyWallet.id,
  address: getAddress(privyWallet.address),
})

const { wallet } = await actions.wallet.createSmartWallet({
  owners: [privySigner.address],
  signer: privySigner,
})`,
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
                    )}
                    {selectedWalletProvider === 'dynamic' && (
                      <div className="space-y-6">
                        <div>
                          <p className="text-gray-300 text-base mb-4">
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
                          <p className="text-gray-300 text-base mb-2">
                            2. Hosted user wallets can become signers for
                            new, customizable smart wallets:
                          </p>
                          <div
                            className="rounded-lg overflow-hidden"
                            style={{
                              backgroundColor: colors.bg.code,
                            }}
                          >
                            {/* Frontend tab only */}
                            <div
                              className="flex border-b"
                              style={{
                                borderColor: 'rgba(184, 187, 38, 0.15)',
                              }}
                            >
                              <button
                                className="px-6 py-3 text-sm font-mono transition-colors border-b-2"
                                style={{
                                  backgroundColor: colors.bg.header,
                                  color: colors.text.primary,
                                  borderColor: 'rgb(184, 187, 38)',
                                  opacity: 1,
                                }}
                              >
                                Frontend
                              </button>
                              <button
                                disabled
                                className="px-6 py-3 text-sm font-mono transition-colors border-b-2 cursor-not-allowed"
                                style={{
                                  backgroundColor: colors.bg.header,
                                  color: colors.text.secondary,
                                  borderColor: 'transparent',
                                  opacity: 0.4,
                                }}
                              >
                                Backend
                              </button>
                            </div>
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
                                  style={{
                                    backgroundColor: colors.macos.red,
                                  }}
                                ></div>
                                <div
                                  className="w-3 h-3 rounded-full shadow-sm"
                                  style={{
                                    backgroundColor: colors.macos.yellow,
                                  }}
                                ></div>
                                <div
                                  className="w-3 h-3 rounded-full shadow-sm"
                                  style={{
                                    backgroundColor: 'rgb(184, 187, 38)',
                                    boxShadow:
                                      '0 0 6px rgba(184, 187, 38, 0.4)',
                                  }}
                                ></div>
                              </div>
                              <div
                                className="text-xs font-mono"
                                style={{ color: colors.syntax.keyword }}
                              >
                                wallet.ts
                              </div>
                            </div>
                            <div className="relative">
                              <pre
                                className="text-sm leading-relaxed font-mono p-4"
                                style={{ backgroundColor: colors.bg.code }}
                              >
                                <code
                                  style={{ color: colors.text.primary }}
                                >
                                  <span
                                    style={{ color: colors.syntax.keyword }}
                                  >{`import`}</span>
                                  {` { `}
                                  <span
                                    style={{
                                      color: colors.syntax.function,
                                    }}
                                  >{`useDynamicContext`}</span>
                                  {` } `}
                                  <span
                                    style={{ color: colors.syntax.keyword }}
                                  >{`from`}</span>
                                  {` `}
                                  <span
                                    style={{ color: colors.syntax.string }}
                                  >{`"@dynamic-labs/sdk-react-core"`}</span>
                                  {`

`}
                                  <span
                                    style={{ color: colors.syntax.keyword }}
                                  >{`const`}</span>
                                  {` { `}
                                  <span
                                    style={{
                                      color: colors.syntax.variable,
                                    }}
                                  >{`primaryWallet`}</span>
                                  {` } = `}
                                  <span
                                    style={{
                                      color: colors.syntax.function,
                                    }}
                                  >{`useDynamicContext`}</span>
                                  {`()

`}
                                  <span
                                    style={{ color: colors.syntax.keyword }}
                                  >{`const`}</span>
                                  {` `}
                                  <span
                                    style={{
                                      color: colors.syntax.variable,
                                    }}
                                  >{`signer`}</span>
                                  {` = `}
                                  <span
                                    style={{ color: colors.syntax.keyword }}
                                  >{`await`}</span>
                                  {` `}
                                  <span
                                    style={{
                                      color: colors.syntax.variable,
                                    }}
                                  >{`actions`}</span>
                                  {`.`}
                                  <span
                                    style={{
                                      color: colors.syntax.property,
                                    }}
                                  >{`wallet`}</span>
                                  {`.`}
                                  <span
                                    style={{
                                      color: colors.syntax.function,
                                    }}
                                  >{`createSigner`}</span>
                                  {`({`}
                                  <span
                                    style={{
                                      color: colors.syntax.property,
                                    }}
                                  >{`wallet`}</span>
                                  {`: `}
                                  <span
                                    style={{
                                      color: colors.syntax.variable,
                                    }}
                                  >{`primaryWallet`}</span>
                                  {`})
`}
                                  <span
                                    style={{ color: colors.syntax.keyword }}
                                  >{`const`}</span>
                                  {` { `}
                                  <span
                                    style={{
                                      color: colors.syntax.variable,
                                    }}
                                  >{`wallet`}</span>
                                  {` } = `}
                                  <span
                                    style={{ color: colors.syntax.keyword }}
                                  >{`await`}</span>
                                  {` `}
                                  <span
                                    style={{
                                      color: colors.syntax.variable,
                                    }}
                                  >{`actions`}</span>
                                  {`.`}
                                  <span
                                    style={{
                                      color: colors.syntax.property,
                                    }}
                                  >{`wallet`}</span>
                                  {`.`}
                                  <span
                                    style={{
                                      color: colors.syntax.function,
                                    }}
                                  >{`createSmartWallet`}</span>
                                  {`({
  `}
                                  <span
                                    style={{
                                      color: colors.syntax.property,
                                    }}
                                  >{`owners`}</span>
                                  {`: [`}
                                  <span
                                    style={{
                                      color: colors.syntax.variable,
                                    }}
                                  >{`signer`}</span>
                                  {`.`}
                                  <span
                                    style={{
                                      color: colors.syntax.property,
                                    }}
                                  >{`address`}</span>
                                  {`],
  `}
                                  <span
                                    style={{
                                      color: colors.syntax.property,
                                    }}
                                  >{`signer`}</span>
                                  {`: `}
                                  <span
                                    style={{
                                      color: colors.syntax.variable,
                                    }}
                                  >{`signer`}</span>
                                  {`,
})`}
                                </code>
                              </pre>
                            </div>
                          </div>
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
                          <p className="text-gray-300 text-base mb-2">
                            2. Hosted user wallets can become signers for
                            new, customizable smart wallets:
                          </p>
                          <div
                            className="rounded-lg overflow-hidden"
                            style={{
                              backgroundColor: colors.bg.code,
                            }}
                          >
                            {/* Frontend/Backend tabs */}
                            <div
                              className="flex border-b"
                              style={{
                                borderColor: 'rgba(184, 187, 38, 0.15)',
                              }}
                            >
                              <button
                                onClick={() =>
                                  setSelectedSmartTurnkeyTab('frontend')
                                }
                                className="px-6 py-3 text-sm font-mono transition-colors border-b-2"
                                style={{
                                  backgroundColor: colors.bg.header,
                                  color:
                                    selectedSmartTurnkeyTab === 'frontend'
                                      ? colors.text.primary
                                      : colors.text.secondary,
                                  borderColor:
                                    selectedSmartTurnkeyTab === 'frontend'
                                      ? 'rgb(184, 187, 38)'
                                      : 'transparent',
                                  opacity:
                                    selectedSmartTurnkeyTab === 'frontend'
                                      ? 1
                                      : 0.6,
                                }}
                              >
                                Frontend
                              </button>
                              <button
                                onClick={() =>
                                  setSelectedSmartTurnkeyTab('backend')
                                }
                                className="px-6 py-3 text-sm font-mono transition-colors border-b-2"
                                style={{
                                  backgroundColor: colors.bg.header,
                                  color:
                                    selectedSmartTurnkeyTab === 'backend'
                                      ? colors.text.primary
                                      : colors.text.secondary,
                                  borderColor:
                                    selectedSmartTurnkeyTab === 'backend'
                                      ? 'rgb(184, 187, 38)'
                                      : 'transparent',
                                  opacity:
                                    selectedSmartTurnkeyTab === 'backend'
                                      ? 1
                                      : 0.6,
                                }}
                              >
                                Backend
                              </button>
                            </div>
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
                                  style={{
                                    backgroundColor: colors.macos.red,
                                  }}
                                ></div>
                                <div
                                  className="w-3 h-3 rounded-full shadow-sm"
                                  style={{
                                    backgroundColor: colors.macos.yellow,
                                  }}
                                ></div>
                                <div
                                  className="w-3 h-3 rounded-full shadow-sm"
                                  style={{
                                    backgroundColor: 'rgb(184, 187, 38)',
                                    boxShadow:
                                      '0 0 6px rgba(184, 187, 38, 0.4)',
                                  }}
                                ></div>
                              </div>
                              <div
                                className="text-xs font-mono"
                                style={{ color: colors.syntax.keyword }}
                              >
                                wallet.ts
                              </div>
                            </div>
                            <div className="relative">
                              {selectedSmartTurnkeyTab === 'frontend' && (
                                <pre
                                  className="text-sm leading-relaxed font-mono p-4"
                                  style={{
                                    backgroundColor: colors.bg.code,
                                  }}
                                >
                                  <code
                                    style={{ color: colors.text.primary }}
                                  >
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`import`}</span>
                                    {` { `}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`useTurnkey`}</span>
                                    {` } `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`from`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`"@turnkey/react-wallet-kit"`}</span>
                                    {`

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` { `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallets`}</span>
                                    {`, `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`user`}</span>
                                    {`, `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`createWallet`}</span>
                                    {`, `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`refreshWallets`}</span>
                                    {`, `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`httpClient`}</span>
                                    {`, `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`session`}</span>
                                    {` } = `}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`useTurnkey`}</span>
                                    {`()
`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`useEffect`}</span>
                                    {`(() => {
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`async function`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`createEmbeddedWallet`}</span>
                                    {`() {
    `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`await`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`createWallet`}</span>
                                    {`({
      `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`walletName`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`\`My New Wallet \${Math.random().toString(36).substring(2, 15)}\``}</span>
                                    {`,
      `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`accounts`}</span>
                                    {`: [`}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`"ADDRESS_FORMAT_ETHEREUM"`}</span>
                                    {`],
    })
    `}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`refreshWallets`}</span>
                                    {`()
  }

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`embeddedWallet`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallets`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`find`}</span>
                                    {`(
  (`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {`) => `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`accounts`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`some`}</span>
                                    {`((`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`account`}</span>
                                    {`) => `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`account`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`addressFormat`}</span>
                                    {` === `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'ADDRESS_FORMAT_ETHEREUM'`}</span>
                                    {`) && `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`source`}</span>
                                    {` === `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`WalletSource`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`Embedded`}</span>
                                    {`,
)

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`walletAddress`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`embeddedWallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`accounts`}</span>
                                    {`[`}
                                    <span
                                      style={{
                                        color: colors.syntax.number,
                                      }}
                                    >{`0`}</span>
                                    {`].`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`address`}</span>
                                    {`
`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`signer`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`await`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`actions`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`wallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`createSigner`}</span>
                                    {`({
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`client`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`httpClient`}</span>
                                    {`,
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`organizationId`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`session`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`organizationId`}</span>
                                    {`,
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`signWith`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`walletAddress`}</span>
                                    {`,
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`ethereumAddress`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`walletAddress`}</span>
                                    {`
})
`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` { `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {` } = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`await`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`actions`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`wallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`createSmartWallet`}</span>
                                    {`({
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`owners`}</span>
                                    {`: [`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`signer`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`address`}</span>
                                    {`],
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`signer`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`signer`}</span>
                                    {`,
})`}
                                  </code>
                                </pre>
                              )}
                              {selectedSmartTurnkeyTab === 'backend' && (
                                <pre
                                  className="text-sm leading-relaxed font-mono p-4"
                                  style={{
                                    backgroundColor: colors.bg.code,
                                  }}
                                >
                                  <code
                                    style={{ color: colors.text.primary }}
                                  >
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`import`}</span>
                                    {` { `}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`Turnkey`}</span>
                                    {` } `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`from`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'@turnkey/sdk-server'`}</span>
                                    {`

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`turnkeyClient`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`new`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`Turnkey`}</span>
                                    {`({
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`apiBaseUrl`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'https://api.turnkey.com'`}</span>
                                    {`,
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`apiPublicKey`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`env`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`TURNKEY_API_KEY`}</span>
                                    {`,
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`apiPrivateKey`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`env`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`TURNKEY_API_SECRET`}</span>
                                    {`,
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`defaultOrganizationId`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`env`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`TURNKEY_ORGANIZATION_ID`}</span>
                                    {`,
})

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`turnkeyWallet`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`await`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`turnkeyClient`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`apiClient`}</span>
                                    {`().`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`createWallet`}</span>
                                    {`({
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`walletName`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'ETH Wallet'`}</span>
                                    {`,
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`accounts`}</span>
                                    {`: [{
    `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`curve`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'CURVE_SECP256K1'`}</span>
                                    {`,
    `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`pathFormat`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'PATH_FORMAT_BIP32'`}</span>
                                    {`,
    `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`path`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`"m/44'/60'/0'/0/0"`}</span>
                                    {`,
    `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`addressFormat`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.string,
                                      }}
                                    >{`'ADDRESS_FORMAT_ETHEREUM'`}</span>
                                    {`,
  }],
})

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`turnkeySigner`}</span>
                                    {` = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`await`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`actions`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`wallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`createSigner`}</span>
                                    {`({
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`organizationId`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`turnkeyWallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`activity`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`organizationId`}</span>
                                    {`,
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`signWith`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`turnkeyWallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`addresses`}</span>
                                    {`[`}
                                    <span
                                      style={{
                                        color: colors.syntax.number,
                                      }}
                                    >{`0`}</span>
                                    {`],
})

`}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`const`}</span>
                                    {` { `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`wallet`}</span>
                                    {` } = `}
                                    <span
                                      style={{
                                        color: colors.syntax.keyword,
                                      }}
                                    >{`await`}</span>
                                    {` `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`actions`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`wallet`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.function,
                                      }}
                                    >{`createSmartWallet`}</span>
                                    {`({
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`owners`}</span>
                                    {`: [`}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`turnkeySigner`}</span>
                                    {`.`}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`address`}</span>
                                    {`],
  `}
                                    <span
                                      style={{
                                        color: colors.syntax.property,
                                      }}
                                    >{`signer`}</span>
                                    {`: `}
                                    <span
                                      style={{
                                        color: colors.syntax.variable,
                                      }}
                                    >{`turnkeySigner`}</span>
                                    {`,
})`}
                                  </code>
                                </pre>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Horizontal line */}
          <div className="h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent my-4"></div>

          {/* Accordion Item 4: Take Action */}
          <div className="mb-4">
            <button
              onClick={() =>
                setOpenAccordion(
                  openAccordion === 'take-action' ? null : 'take-action',
                )
              }
              className="w-full flex items-center justify-between py-4 px-6 rounded-lg transition-colors"
              style={{
                backgroundColor:
                  openAccordion === 'take-action'
                    ? 'rgba(60, 60, 60, 0.5)'
                    : 'rgba(40, 40, 40, 0.5)',
              }}
            >
              <div className="flex items-center gap-4">
                <span
                  className="text-2xl font-medium"
                  style={{ color: colors.actionsRed }}
                >
                  4
                </span>
                <h3 className="text-lg font-medium text-gray-300">
                  Take Action
                </h3>
              </div>
              <svg
                className="w-5 h-5 text-gray-400 transition-transform duration-300"
                style={{
                  transform:
                    openAccordion === 'take-action'
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
                maxHeight: openAccordion === 'take-action' ? '3000px' : '0',
                opacity: openAccordion === 'take-action' ? 1 : 0,
              }}
            >
              <div className="pt-6 pb-4">
                <p className="text-gray-300 text-base mb-4">
                  Lend, Borrow, Swap, or Send.
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
                      wallet.ts
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
                          style={{ color: colors.syntax.comment }}
                        >{`// Enable asset lending in DeFi`}</span>
                        {`
`}
                        <span
                          style={{ color: colors.syntax.keyword }}
                        >{`const`}</span>
                        {` `}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`receipt1`}</span>
                        {` = `}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`wallet`}</span>
                        {`.`}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`lend`}</span>
                        {`.`}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`openPosition`}</span>
                        {`({
  `}
                        <span
                          style={{ color: colors.syntax.property }}
                        >{`amount`}</span>
                        {`: `}
                        <span
                          style={{ color: colors.syntax.number }}
                        >{`1`}</span>
                        {`,
  `}
                        <span
                          style={{ color: colors.syntax.property }}
                        >{`asset`}</span>
                        {`: `}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`USDC`}</span>
                        {`,
  ...`}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`ExampleMorphoMarket`}</span>
                        {`
})

`}
                        <span
                          style={{ color: colors.syntax.comment }}
                        >{`// Use lent assets as collateral`}</span>
                        {`
`}
                        <span
                          style={{ color: colors.syntax.keyword }}
                        >{`const`}</span>
                        {` `}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`receipt2`}</span>
                        {` = `}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`wallet`}</span>
                        {`.`}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`borrow`}</span>
                        {`.`}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`openPosition`}</span>
                        {`({
  `}
                        <span
                          style={{ color: colors.syntax.property }}
                        >{`amount`}</span>
                        {`: `}
                        <span
                          style={{ color: colors.syntax.number }}
                        >{`1`}</span>
                        {`,
  `}
                        <span
                          style={{ color: colors.syntax.property }}
                        >{`asset`}</span>
                        {`: `}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`USDT`}</span>
                        {`,
  ...`}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`ExampleAaveMarket`}</span>
                        {`
})

`}
                        <span
                          style={{ color: colors.syntax.comment }}
                        >{`// Token swap via DEX of choice`}</span>
                        {`
`}
                        <span
                          style={{ color: colors.syntax.keyword }}
                        >{`const`}</span>
                        {` `}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`receipt3`}</span>
                        {` = `}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`wallet`}</span>
                        {`.`}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`swap`}</span>
                        {`.`}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`execute`}</span>
                        {`({
  `}
                        <span
                          style={{ color: colors.syntax.property }}
                        >{`amountIn`}</span>
                        {`: `}
                        <span
                          style={{ color: colors.syntax.number }}
                        >{`1`}</span>
                        {`,
  `}
                        <span
                          style={{ color: colors.syntax.property }}
                        >{`assetIn`}</span>
                        {`: `}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`USDC`}</span>
                        {`,
  `}
                        <span
                          style={{ color: colors.syntax.property }}
                        >{`assetOut`}</span>
                        {`: `}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`ETH`}</span>
                        {`,
})

`}
                        <span
                          style={{ color: colors.syntax.comment }}
                        >{`// Easy, safe asset transfers`}</span>
                        {`
`}
                        <span
                          style={{ color: colors.syntax.keyword }}
                        >{`const`}</span>
                        {` `}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`receipt4`}</span>
                        {` = `}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`wallet`}</span>
                        {`.`}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`send`}</span>
                        {`({
  `}
                        <span
                          style={{ color: colors.syntax.property }}
                        >{`amount`}</span>
                        {`: `}
                        <span
                          style={{ color: colors.syntax.number }}
                        >{`1`}</span>
                        {`,
  `}
                        <span
                          style={{ color: colors.syntax.property }}
                        >{`asset`}</span>
                        {`: `}
                        <span
                          style={{ color: colors.syntax.variable }}
                        >{`USDC`}</span>
                        {`,
  `}
                        <span
                          style={{ color: colors.syntax.property }}
                        >{`to`}</span>
                        {`: `}
                        <span
                          style={{ color: colors.syntax.string }}
                        >{`'vitalik.eth'`}</span>
                        {`,
})`}
                      </code>
                    </pre>
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(
                          `// Enable asset lending in DeFi
const receipt1 = wallet.lend.openPosition({
  amount: 1,
  asset: USDC,
  ...ExampleMorphoMarket
})

// Use lent assets as collateral
const receipt2 = wallet.borrow.openPosition({
  amount: 1,
  asset: USDT,
  ...ExampleAaveMarket
})

// Token swap via DEX of choice
const receipt3 = wallet.swap.execute({
  amountIn: 1,
  assetIn: USDC,
  assetOut: ETH,
})

// Easy, safe asset transfers
const receipt4 = wallet.send({
  amount: 1,
  asset: USDC,
  to: 'vitalik.eth',
})`,
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
        </div>
      </div>
    </>
  )
}

export default GettingStarted
