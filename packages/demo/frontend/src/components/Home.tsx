import { useState } from 'react'
import NavBar from './NavBar'
import PrivyLogo from '../assets/privy-logo-white.svg'
import DynamicLogo from '../assets/dynamic-logo-white.svg'
import TurnkeyLogo from '../assets/turnkey-logo-white.svg'

function Home() {
  const [selectedPackageManager, setSelectedPackageManager] = useState('npm')
  const [selectedWalletProvider, setSelectedWalletProvider] = useState('privy')

  const packageManagers = {
    npm: 'npm install @ethereum-optimism/actions',
    pnpm: 'pnpm add @ethereum-optimism/actions',
    yarn: 'yarn add @ethereum-optimism/actions',
    bun: 'bun add @ethereum-optimism/actions',
    deno: 'deno add @ethereum-optimism/actions',
  }
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#121113' }}>
      <NavBar />

      {/* ASCII Art - Isolated from other styles */}
      <div className="pt-32 pb-8 flex justify-center">
        <div
          style={{
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Menlo, Consolas, "Liberation Mono", "Courier New", monospace',
            color: '#FF0621',
            whiteSpace: 'pre',
            lineHeight: '0.75',
            letterSpacing: '0',
            fontVariantLigatures: 'none',
            fontFeatureSettings: '"liga" 0',
            fontSize: 'clamp(0.625rem, 2.5vw, 1.25rem)',
            margin: 0,
            padding: 0,
            border: 'none',
          }}
        >{`
    █████████             █████     ███
   ███░░░░░███           ░░███     ░░░
  ░███    ░███   ██████  ███████   ████   ██████  ████████    █████
  ░███████████  ███░░███░░░███░   ░░███  ███░░███░░███░░███  ███░░
  ░███░░░░░███ ░███ ░░░   ░███     ░███ ░███ ░███ ░███ ░███ ░░█████
  ░███    ░███ ░███  ███  ░███ ███ ░███ ░███ ░███ ░███ ░███  ░░░░███
  █████   █████░░██████   ░░█████  █████░░██████  ████ █████ ██████
 ░░░░░   ░░░░░  ░░░░░░     ░░░░░  ░░░░░  ░░░░░░  ░░░░ ░░░░░ ░░░░░░
     `}</div>
      </div>
      <div className="text-center pb-8">
        <p className="text-gray-400 text-lg">
          By{' '}
          <a
            href="https://www.optimism.io/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#FF0621', fontWeight: 'bold' }}
            className="hover:opacity-80"
          >
            Optimism
          </a>
        </p>
      </div>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6">
        <div className="text-center py-20">
          <div>
            <h1
              className="text-4xl md:text-5xl font-normal mb-6 leading-tight"
              style={{
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                color: '#d1d5db',
              }}
            >
              Perform <span className="font-semibold">DeFi</span> actions with
              lightweight, composable, and type-safe modules.
            </h1>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <a
                href="https://github.com/ethereum-optimism/actions"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white text-black px-8 py-3 rounded-lg font-medium hover:bg-gray-200 inline-block text-center"
              >
                Docs
              </a>
              <a
                href="/demo"
                className="border border-gray-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-gray-800 inline-block text-center"
              >
                Demo
              </a>
            </div>
          </div>
        </div>

        {/* Code Example */}
        <div className="py-16">
          <div className="max-w-4xl mx-auto mb-8">
            <h2 className="text-lg font-medium text-gray-300 mb-4">Overview</h2>
            <div className="h-px bg-gradient-to-r from-gray-600 via-gray-500 to-transparent mb-4"></div>
            <p className="text-gray-300 mb-4">
              <span style={{ color: '#FF0621', fontWeight: 'bold' }}>
                Actions
              </span>{' '}
              is an open source SDK for onchain actions: <strong>Lend</strong>,{' '}
              <strong>Borrow</strong>, <strong>Swap</strong>,{' '}
              <strong>Pay</strong>, without managing complex infrastructure or
              custody.
            </p>
          </div>
          <div
            className="rounded-lg overflow-hidden max-w-4xl mx-auto shadow-2xl"
            style={{
              backgroundColor: '#1a1b1e',
              border: '1px solid rgba(184, 187, 38, 0.1)',
              boxShadow:
                '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(184, 187, 38, 0.05)',
            }}
          >
            {/* Terminal header */}
            <div
              className="px-4 py-3 border-b flex items-center justify-between"
              style={{
                backgroundColor: '#0f1011',
                borderColor: 'rgba(184, 187, 38, 0.15)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <div className="flex items-center space-x-2">
                <div
                  className="w-3 h-3 rounded-full shadow-sm"
                  style={{ backgroundColor: '#ff5f56' }}
                ></div>
                <div
                  className="w-3 h-3 rounded-full shadow-sm"
                  style={{ backgroundColor: '#ffbd2e' }}
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
                style={{ color: '#FF0621' }}
              >
                example.ts
              </div>
            </div>
            {/* Code content */}
            <div
              className="p-8 text-left"
              style={{ backgroundColor: '#1a1b1e' }}
            >
              <pre className="text-sm leading-relaxed font-mono">
                <code style={{ color: '#e8e3d3' }}>
                  <span
                    style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                  >{`import`}</span>
                  {` { `}
                  <span style={{ color: '#4db6ac' }}>{`Actions`}</span>
                  {` } `}
                  <span
                    style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                  >{`from`}</span>
                  {` `}
                  <span
                    style={{ color: '#ff8a65' }}
                  >{`'@eth-optimism/actions'`}</span>
                  {`
`}
                  <span
                    style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                  >{`import`}</span>
                  {` { `}
                  <span style={{ color: '#4db6ac' }}>{`USDC`}</span>
                  {`, `}
                  <span style={{ color: '#4db6ac' }}>{`ETH`}</span>
                  {`, `}
                  <span style={{ color: '#4db6ac' }}>{`WBTC`}</span>
                  {` } `}
                  <span
                    style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                  >{`from`}</span>
                  {` `}
                  <span
                    style={{ color: '#ff8a65' }}
                  >{`'@eth-optimism/actions/assets'`}</span>
                  {`

`}
                  <span
                    style={{ color: 'rgb(98, 114, 164)' }}
                  >{`// gas sponsored smart wallets`}</span>
                  {`
`}
                  <span
                    style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                  >{`const`}</span>
                  {` `}
                  <span style={{ color: '#4db6ac' }}>{`wallet`}</span>
                  {` = `}
                  <span
                    style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                  >{`await`}</span>
                  {` `}
                  <span style={{ color: '#4db6ac' }}>{`Actions`}</span>
                  {`.`}
                  <span style={{ color: '#4db6ac' }}>{`createWallet`}</span>
                  {`(`}
                  <span
                    style={{ color: '#ff8a65' }}
                  >{`'user@example.com'`}</span>
                  {`)

`}
                  <span
                    style={{ color: 'rgb(98, 114, 164)' }}
                  >{`// onramp to stables`}</span>
                  {`
`}
                  <span
                    style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                  >{`await`}</span>
                  {` `}
                  <span style={{ color: '#4db6ac' }}>{`wallet`}</span>
                  {`.`}
                  <span style={{ color: '#4db6ac' }}>{`fund`}</span>
                  {`(`}
                  <span style={{ color: '#ce9178' }}>{`1000`}</span>
                  {`, `}
                  <span style={{ color: '#4db6ac' }}>{`USDC`}</span>
                  {`)

`}
                  <span
                    style={{ color: 'rgb(98, 114, 164)' }}
                  >{`// earn DeFi yield`}</span>
                  {`
`}
                  <span
                    style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                  >{`await`}</span>
                  {` `}
                  <span style={{ color: '#4db6ac' }}>{`wallet`}</span>
                  {`.`}
                  <span style={{ color: '#4db6ac' }}>{`lend`}</span>
                  {`(`}
                  <span style={{ color: '#ce9178' }}>{`100`}</span>
                  {`, `}
                  <span style={{ color: '#4db6ac' }}>{`USDC`}</span>
                  {`)

`}
                  <span
                    style={{ color: 'rgb(98, 114, 164)' }}
                  >{`// borrow against collateral`}</span>
                  {`
`}
                  <span
                    style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                  >{`await`}</span>
                  {` `}
                  <span style={{ color: '#4db6ac' }}>{`wallet`}</span>
                  {`.`}
                  <span style={{ color: '#4db6ac' }}>{`borrow`}</span>
                  {`(`}
                  <span style={{ color: '#ce9178' }}>{`0.01`}</span>
                  {`, `}
                  <span style={{ color: '#4db6ac' }}>{`ETH`}</span>
                  {`)

`}
                  <span
                    style={{ color: 'rgb(98, 114, 164)' }}
                  >{`// swap tokens`}</span>
                  {`
`}
                  <span
                    style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                  >{`await`}</span>
                  {` `}
                  <span style={{ color: '#4db6ac' }}>{`wallet`}</span>
                  {`.`}
                  <span style={{ color: '#4db6ac' }}>{`swap`}</span>
                  {`(`}
                  <span style={{ color: '#ce9178' }}>{`0.01`}</span>
                  {`, `}
                  <span style={{ color: '#4db6ac' }}>{`ETH`}</span>
                  {`, `}
                  <span style={{ color: '#4db6ac' }}>{`WBTC`}</span>
                  {`)`}
                </code>
              </pre>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="py-16">
          <div className="max-w-4xl mx-auto mb-8">
            <h2 className="text-lg font-medium text-gray-300 mb-4">Features</h2>
            <div className="h-px bg-gradient-to-r from-gray-600 via-gray-500 to-transparent"></div>
          </div>

          {/* Core Capabilities Grid */}
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="mb-3 flex justify-center">
                  <svg
                    className="w-8 h-8"
                    style={{ color: '#FF0621' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
                <h3 className="font-semibold mb-2 text-white">Lend</h3>
                <p className="text-gray-300 text-sm">Lend across markets</p>
              </div>
              <div className="text-center">
                <div className="mb-3 flex justify-center">
                  <svg
                    className="w-8 h-8"
                    style={{ color: '#FF0621' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M7 16l-4-4m0 0l4-4m-4 4h18M3 20h18M3 4h18"
                    />
                  </svg>
                </div>
                <h3 className="font-semibold mb-2 text-white">Borrow</h3>
                <p className="text-gray-300 text-sm">
                  Borrow against collateral
                </p>
              </div>
              <div className="text-center">
                <div className="mb-3 flex justify-center">
                  <svg
                    className="w-8 h-8"
                    style={{ color: '#FF0621' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                    />
                  </svg>
                </div>
                <h3 className="font-semibold mb-2 text-white">Swap</h3>
                <p className="text-gray-300 text-sm">Trade via Dex</p>
              </div>
              <div className="text-center">
                <div className="mb-3 flex justify-center">
                  <svg
                    className="w-8 h-8"
                    style={{ color: '#FF0621' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                  </svg>
                </div>
                <h3 className="font-semibold mb-2 text-white">Wallet</h3>
                <p className="text-gray-300 text-sm">Create smart wallets</p>
              </div>
              <div className="text-center">
                <div className="mb-3 flex justify-center">
                  <svg
                    className="w-8 h-8"
                    style={{ color: '#FF0621' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </div>
                <h3 className="font-semibold mb-2 text-white">Gas Paymaster</h3>
                <p className="text-gray-300 text-sm">Sponsor transactions</p>
              </div>
              <div className="text-center">
                <div className="mb-3 flex justify-center">
                  <svg
                    className="w-8 h-8"
                    style={{ color: '#FF0621' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
                <h3 className="font-semibold mb-2 text-white">Config</h3>
                <p className="text-gray-300 text-sm">Flexible configuration</p>
              </div>
            </div>
          </div>

          {/* Getting Started Subsection */}
          <div className="pt-24 pb-16">
            <div className="max-w-4xl mx-auto mb-8">
              <h2 className="text-lg font-medium text-gray-300 mb-4">
                Getting Started
              </h2>
              <div className="h-px bg-gradient-to-r from-gray-600 via-gray-500 to-transparent mb-4"></div>
              <p className="text-gray-300 mb-4">Install the library:</p>
              <div
                className="rounded-lg overflow-hidden mb-8 shadow-2xl"
                style={{
                  backgroundColor: '#1a1b1e',
                  border: '1px solid rgba(184, 187, 38, 0.1)',
                  boxShadow:
                    '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(184, 187, 38, 0.05)',
                }}
              >
                {/* Tab switcher */}
                <div
                  className="flex border-b"
                  style={{
                    backgroundColor: '#0f1011',
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
                  style={{ backgroundColor: '#1a1b1e' }}
                >
                  <pre className="text-sm leading-relaxed font-mono">
                    <code style={{ color: '#e8e3d3' }}>
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

              <p className="text-gray-300 mb-2">
                Configure{' '}
                <span style={{ color: '#FF0621', fontWeight: 'bold' }}>
                  Actions
                </span>
                : Pick which DeFi protocols, markets, networks, assets, and
                providers you want to support.
              </p>
              <div
                className="rounded-lg overflow-hidden mb-8 shadow-2xl"
                style={{
                  backgroundColor: '#1a1b1e',
                  border: '1px solid rgba(184, 187, 38, 0.1)',
                  boxShadow:
                    '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(184, 187, 38, 0.05)',
                }}
              >
                {/* Terminal header */}
                <div
                  className="px-4 py-3 border-b flex items-center justify-between"
                  style={{
                    backgroundColor: '#0f1011',
                    borderColor: 'rgba(184, 187, 38, 0.15)',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-3 h-3 rounded-full shadow-sm"
                      style={{ backgroundColor: '#ff5f56' }}
                    ></div>
                    <div
                      className="w-3 h-3 rounded-full shadow-sm"
                      style={{ backgroundColor: '#ffbd2e' }}
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
                    style={{ color: '#FF0621' }}
                  >
                    config.ts
                  </div>
                </div>
                {/* Code content */}
                <div
                  className="p-8 text-left relative"
                  style={{ backgroundColor: '#1a1b1e' }}
                >
                  <pre className="text-sm leading-relaxed font-mono">
                    <code style={{ color: '#e8e3d3' }}>
                      <span
                        style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                      >{`import`}</span>
                      {` { `}
                      <span style={{ color: '#4db6ac' }}>{`USDC`}</span>
                      {`, `}
                      <span style={{ color: '#4db6ac' }}>{`ETH`}</span>
                      {`, `}
                      <span style={{ color: '#4db6ac' }}>{`WBTC`}</span>
                      {`, `}
                      <span style={{ color: '#4db6ac' }}>{`USDT`}</span>
                      {` } `}
                      <span
                        style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                      >{`from`}</span>
                      {` `}
                      <span
                        style={{ color: '#ff8a65' }}
                      >{`'@eth-optimism/actions/assets'`}</span>
                      {`
`}
                      <span
                        style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                      >{`import`}</span>
                      {` { `}
                      <span
                        style={{ color: '#4db6ac' }}
                      >{`ExampleMorphoMarket`}</span>
                      {`, `}
                      <span
                        style={{ color: '#4db6ac' }}
                      >{`ExampleAaveMarket`}</span>
                      {` } `}
                      <span
                        style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                      >{`from`}</span>
                      {` `}
                      <span
                        style={{ color: '#ff8a65' }}
                      >{`'@eth-optimism/actions/markets'`}</span>
                      {`
`}
                      <span
                        style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                      >{`import`}</span>
                      {` { `}
                      <span style={{ color: '#4db6ac' }}>{`unichain`}</span>
                      {`, `}
                      <span style={{ color: '#4db6ac' }}>{`optimism`}</span>
                      {`, `}
                      <span style={{ color: '#4db6ac' }}>{`base`}</span>
                      {` } `}
                      <span
                        style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                      >{`from`}</span>
                      {` `}
                      <span
                        style={{ color: '#ff8a65' }}
                      >{`'viem/chains'`}</span>
                      {`

`}
                      <span
                        style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                      >{`const`}</span>
                      {` `}
                      <span style={{ color: '#4db6ac' }}>{`config`}</span>
                      {`: `}
                      <span
                        style={{ color: '#4db6ac' }}
                      >{`ActionsConfig`}</span>
                      {` = {
  `}
                      <span style={{ color: '#9cdcfe' }}>{`wallet`}</span>
                      {`: {
    `}
                      <span
                        style={{ color: '#9cdcfe' }}
                      >{`hostedWalletConfig`}</span>
                      {`: {
      `}
                      <span style={{ color: '#9cdcfe' }}>{`provider`}</span>
                      {`: {
        `}
                      <span style={{ color: '#9cdcfe' }}>{`type`}</span>
                      {`: `}
                      <span style={{ color: '#ff8a65' }}>{`'privy'`}</span>
                      {`,
        `}
                      <span style={{ color: '#9cdcfe' }}>{`config`}</span>
                      {`: {
          `}
                      <span style={{ color: '#9cdcfe' }}>{`privyClient`}</span>
                      {`: `}
                      <span
                        style={{ color: '#4db6ac' }}
                      >{`getPrivyClient`}</span>
                      {`(),
        },
      },
    },
    `}
                      <span
                        style={{ color: '#9cdcfe' }}
                      >{`smartWalletConfig`}</span>
                      {`: {
      `}
                      <span style={{ color: '#9cdcfe' }}>{`provider`}</span>
                      {`: {
        `}
                      <span style={{ color: '#9cdcfe' }}>{`type`}</span>
                      {`: `}
                      <span style={{ color: '#ff8a65' }}>{`'default'`}</span>
                      {`,
        `}
                      <span
                        style={{ color: '#9cdcfe' }}
                      >{`attributionSuffix`}</span>
                      {`: `}
                      <span style={{ color: '#ff8a65' }}>{`'actions'`}</span>
                      {`,
      },
    },
  },
  `}
                      <span style={{ color: '#9cdcfe' }}>{`lend`}</span>
                      {`: {
    `}
                      <span style={{ color: '#9cdcfe' }}>{`type`}</span>
                      {`: `}
                      <span style={{ color: '#ff8a65' }}>{`'morpho'`}</span>
                      {`, `}
                      <span
                        style={{ color: 'rgb(98, 114, 164)' }}
                      >{`// Lend Provider`}</span>
                      {`
    `}
                      <span
                        style={{ color: '#9cdcfe' }}
                      >{`assetAllowlist`}</span>
                      {`: [`}
                      <span style={{ color: '#4db6ac' }}>{`USDC`}</span>
                      {`, `}
                      <span style={{ color: '#4db6ac' }}>{`ETH`}</span>
                      {`, `}
                      <span style={{ color: '#4db6ac' }}>{`WBTC`}</span>
                      {`],
    `}
                      <span
                        style={{ color: '#9cdcfe' }}
                      >{`assetBlocklist`}</span>
                      {`: [`}
                      <span style={{ color: '#4db6ac' }}>{`USDT`}</span>
                      {`],
    `}
                      <span
                        style={{ color: '#9cdcfe' }}
                      >{`marketAllowlist`}</span>
                      {`: [`}
                      <span
                        style={{ color: '#4db6ac' }}
                      >{`ExampleMorphoMarket`}</span>
                      {`],
    `}
                      <span
                        style={{ color: '#9cdcfe' }}
                      >{`marketBlocklist`}</span>
                      {`: [`}
                      <span
                        style={{ color: '#4db6ac' }}
                      >{`ExampleAaveMarket`}</span>
                      {`],
  },
  `}
                      <span style={{ color: '#9cdcfe' }}>{`borrow`}</span>
                      {`: {
    `}
                      <span style={{ color: '#9cdcfe' }}>{`type`}</span>
                      {`: `}
                      <span style={{ color: '#ff8a65' }}>{`'morpho'`}</span>
                      {`, `}
                      <span
                        style={{ color: 'rgb(98, 114, 164)' }}
                      >{`// Borrow Provider`}</span>
                      {`
    `}
                      <span
                        style={{ color: '#9cdcfe' }}
                      >{`assetAllowlist`}</span>
                      {`: [`}
                      <span style={{ color: '#4db6ac' }}>{`USDC`}</span>
                      {`, `}
                      <span style={{ color: '#4db6ac' }}>{`ETH`}</span>
                      {`, `}
                      <span style={{ color: '#4db6ac' }}>{`WBTC`}</span>
                      {`],
    `}
                      <span
                        style={{ color: '#9cdcfe' }}
                      >{`assetBlocklist`}</span>
                      {`: [`}
                      <span style={{ color: '#4db6ac' }}>{`USDT`}</span>
                      {`],
    `}
                      <span
                        style={{ color: '#9cdcfe' }}
                      >{`marketAllowlist`}</span>
                      {`: [`}
                      <span
                        style={{ color: '#4db6ac' }}
                      >{`ExampleMorphoMarket`}</span>
                      {`],
    `}
                      <span
                        style={{ color: '#9cdcfe' }}
                      >{`marketBlocklist`}</span>
                      {`: [`}
                      <span
                        style={{ color: '#4db6ac' }}
                      >{`ExampleAaveMarket`}</span>
                      {`],
  },
  `}
                      <span style={{ color: '#9cdcfe' }}>{`swap`}</span>
                      {`: {
    `}
                      <span style={{ color: '#9cdcfe' }}>{`type`}</span>
                      {`: `}
                      <span style={{ color: '#ff8a65' }}>{`'uniswap'`}</span>
                      {`, `}
                      <span
                        style={{ color: 'rgb(98, 114, 164)' }}
                      >{`// Swap Provider`}</span>
                      {`
    `}
                      <span
                        style={{ color: '#9cdcfe' }}
                      >{`defaultSlippage`}</span>
                      {`: `}
                      <span style={{ color: '#ce9178' }}>{`100`}</span>
                      {`,
    `}
                      <span
                        style={{ color: '#9cdcfe' }}
                      >{`assetAllowList`}</span>
                      {`: [`}
                      <span style={{ color: '#4db6ac' }}>{`USDC`}</span>
                      {`, `}
                      <span style={{ color: '#4db6ac' }}>{`ETH`}</span>
                      {`, `}
                      <span style={{ color: '#4db6ac' }}>{`WBTC`}</span>
                      {`]
    `}
                      <span
                        style={{ color: '#9cdcfe' }}
                      >{`marketAllowlist`}</span>
                      {`: [
      { `}
                      <span style={{ color: '#9cdcfe' }}>{`from`}</span>
                      {`: `}
                      <span style={{ color: '#4db6ac' }}>{`ETH`}</span>
                      {`, `}
                      <span style={{ color: '#9cdcfe' }}>{`to`}</span>
                      {`: `}
                      <span style={{ color: '#4db6ac' }}>{`USDC`}</span>
                      {` },
      { `}
                      <span style={{ color: '#9cdcfe' }}>{`from`}</span>
                      {`: `}
                      <span style={{ color: '#4db6ac' }}>{`USDC`}</span>
                      {`, `}
                      <span style={{ color: '#9cdcfe' }}>{`to`}</span>
                      {`: `}
                      <span style={{ color: '#4db6ac' }}>{`ETH`}</span>
                      {` },
      { `}
                      <span style={{ color: '#9cdcfe' }}>{`from`}</span>
                      {`: `}
                      <span style={{ color: '#4db6ac' }}>{`ETH`}</span>
                      {`, `}
                      <span style={{ color: '#9cdcfe' }}>{`to`}</span>
                      {`: `}
                      <span style={{ color: '#4db6ac' }}>{`WBTC`}</span>
                      {` },
      { `}
                      <span style={{ color: '#9cdcfe' }}>{`from`}</span>
                      {`: `}
                      <span style={{ color: '#4db6ac' }}>{`WBTC`}</span>
                      {`, `}
                      <span style={{ color: '#9cdcfe' }}>{`to`}</span>
                      {`: `}
                      <span style={{ color: '#4db6ac' }}>{`ETH`}</span>
                      {` }
    ],
    `}
                      <span
                        style={{ color: '#9cdcfe' }}
                      >{`marketBlocklist`}</span>
                      {`: [
      { `}
                      <span style={{ color: '#9cdcfe' }}>{`from`}</span>
                      {`: `}
                      <span style={{ color: '#4db6ac' }}>{`ETH`}</span>
                      {`, `}
                      <span style={{ color: '#9cdcfe' }}>{`to`}</span>
                      {`: `}
                      <span style={{ color: '#4db6ac' }}>{`USDC`}</span>
                      {` },
      { `}
                      <span style={{ color: '#9cdcfe' }}>{`from`}</span>
                      {`: `}
                      <span style={{ color: '#4db6ac' }}>{`USDC`}</span>
                      {`, `}
                      <span style={{ color: '#9cdcfe' }}>{`to`}</span>
                      {`: `}
                      <span style={{ color: '#4db6ac' }}>{`ETH`}</span>
                      {` },
    ],
  },
  `}
                      <span
                        style={{ color: 'rgb(98, 114, 164)' }}
                      >{`// Chain Provider`}</span>
                      {`
  `}
                      <span style={{ color: '#9cdcfe' }}>{`chains`}</span>
                      {`: [
      `}
                      <span style={{ color: '#4db6ac' }}>{`unichain`}</span>
                      {`,
      `}
                      <span style={{ color: '#4db6ac' }}>{`optimism`}</span>
                      {`,
      `}
                      <span style={{ color: '#4db6ac' }}>{`base`}</span>
                      {`
  ]
}`}
                    </code>
                  </pre>
                  {/* Copy button */}
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `import { USDC, ETH, WBTC, USDT } from '@eth-optimism/actions/assets'
import { ExampleMorphoMarket, ExampleAaveMarket } from '@eth-optimism/actions/markets'
import { unichain, optimism, base } from 'viem/chains'

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

              <p className="text-gray-300 mb-4">
                Bring your own wallet provider:
              </p>
              <div
                className="rounded-lg overflow-hidden mb-8 shadow-2xl"
                style={{
                  backgroundColor: '#1a1b1e',
                  border: '1px solid rgba(184, 187, 38, 0.1)',
                  boxShadow:
                    '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(184, 187, 38, 0.05)',
                }}
              >
                {/* Tab switcher with logos */}
                <div
                  className="flex border-b"
                  style={{
                    backgroundColor: '#1a1b1e',
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
                </div>

                {/* Content for each provider */}
                <div className="p-8" style={{ backgroundColor: '#0f1011' }}>
                  {selectedWalletProvider === 'privy' && (
                    <div className="space-y-6">
                      <div>
                        <p className="text-gray-300 mb-4">
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
                          2. Create user wallet and extend it with DeFi{' '}
                          <span
                            style={{ color: '#FF0621', fontWeight: 'bold' }}
                          >
                            Actions
                          </span>
                          :
                        </p>
                        <div
                          className="rounded-lg overflow-hidden"
                          style={{
                            backgroundColor: '#1a1b1e',
                            border: '1px solid rgba(184, 187, 38, 0.1)',
                          }}
                        >
                          {/* Terminal header */}
                          <div
                            className="px-4 py-3 border-b flex items-center justify-between"
                            style={{
                              backgroundColor: '#0f1011',
                              borderColor: 'rgba(184, 187, 38, 0.15)',
                              backdropFilter: 'blur(10px)',
                            }}
                          >
                            <div className="flex items-center space-x-2">
                              <div
                                className="w-3 h-3 rounded-full shadow-sm"
                                style={{ backgroundColor: '#ff5f56' }}
                              ></div>
                              <div
                                className="w-3 h-3 rounded-full shadow-sm"
                                style={{ backgroundColor: '#ffbd2e' }}
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
                              style={{ color: '#FF0621' }}
                            >
                              wallet.ts
                            </div>
                          </div>
                          <div className="relative">
                            <pre
                              className="text-sm leading-relaxed font-mono p-4"
                              style={{ backgroundColor: '#1a1b1e' }}
                            >
                            <code style={{ color: '#e8e3d3' }}>
                              <span
                                style={{ color: 'rgb(98, 114, 164)' }}
                              >{`// Create a new wallet using your hosted wallet provider.`}</span>
                              {`
`}
                              <span
                                style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                              >{`const`}</span>
                              {` `}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`privyWallet`}</span>
                              {` = `}
                              <span
                                style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                              >{`await`}</span>
                              {` `}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`privyClient`}</span>
                              {`.`}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`walletApi`}</span>
                              {`.`}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`createWallet`}</span>
                              {`({
  `}
                              <span
                                style={{ color: '#9cdcfe' }}
                              >{`chainType`}</span>
                              {`: `}
                              <span
                                style={{ color: '#ff8a65' }}
                              >{`'ethereum'`}</span>
                              {`,
})

`}
                              <span
                                style={{ color: 'rgb(98, 114, 164)' }}
                              >{`// Convert the hosted wallet to a DeFi Actions wallet.`}</span>
                              {`
`}
                              <span
                                style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                              >{`const`}</span>
                              {` `}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`wallet`}</span>
                              {` = `}
                              <span
                                style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                              >{`await`}</span>
                              {` `}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`actions`}</span>
                              {`.`}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`wallet`}</span>
                              {`.`}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`hostedWalletToActionsWallet`}</span>
                              {`({
  `}
                              <span
                                style={{ color: '#9cdcfe' }}
                              >{`walletId`}</span>
                              {`: `}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`privyWallet`}</span>
                              {`.`}
                              <span style={{ color: '#4db6ac' }}>{`id`}</span>
                              {`,
  `}
                              <span
                                style={{ color: '#9cdcfe' }}
                              >{`address`}</span>
                              {`: `}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`privyWallet`}</span>
                              {`.`}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`address`}</span>
                              {`,
})`}
                            </code>
                          </pre>
                          {/* Copy button */}
                          <button
                            onClick={() =>
                              navigator.clipboard.writeText(
                                `// Create a new wallet using your hosted wallet provider.
const privyWallet = await privyClient.walletApi.createWallet({
  chainType: 'ethereum',
})

// Convert the hosted wallet to a DeFi Actions wallet.
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
                        <p className="text-gray-300 mb-4">
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
                          2. Create user wallet and extend it with DeFi{' '}
                          <span
                            style={{ color: '#FF0621', fontWeight: 'bold' }}
                          >
                            Actions
                          </span>
                          :
                        </p>
                        <div
                          className="rounded-lg overflow-hidden"
                          style={{
                            backgroundColor: '#1a1b1e',
                            border: '1px solid rgba(184, 187, 38, 0.1)',
                          }}
                        >
                          {/* Terminal header */}
                          <div
                            className="px-4 py-3 border-b flex items-center justify-between"
                            style={{
                              backgroundColor: '#0f1011',
                              borderColor: 'rgba(184, 187, 38, 0.15)',
                              backdropFilter: 'blur(10px)',
                            }}
                          >
                            <div className="flex items-center space-x-2">
                              <div
                                className="w-3 h-3 rounded-full shadow-sm"
                                style={{ backgroundColor: '#ff5f56' }}
                              ></div>
                              <div
                                className="w-3 h-3 rounded-full shadow-sm"
                                style={{ backgroundColor: '#ffbd2e' }}
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
                              style={{ color: '#FF0621' }}
                            >
                              wallet.ts
                            </div>
                          </div>
                          <div className="relative">
                            <pre
                              className="text-sm leading-relaxed font-mono p-4"
                              style={{ backgroundColor: '#1a1b1e' }}
                            >
                            <code style={{ color: '#e8e3d3' }}>
                              <span
                                style={{ color: 'rgb(98, 114, 164)' }}
                              >{`// Create a new wallet using your hosted wallet provider.`}</span>
                              {`
`}
                              <span
                                style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                              >{`const`}</span>
                              {` `}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`dynamicWallet`}</span>
                              {` = `}
                              <span
                                style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                              >{`await`}</span>
                              {` `}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`dynamicClient`}</span>
                              {`.`}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`walletApi`}</span>
                              {`.`}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`createWallet`}</span>
                              {`({
  `}
                              <span
                                style={{ color: '#9cdcfe' }}
                              >{`chainType`}</span>
                              {`: `}
                              <span
                                style={{ color: '#ff8a65' }}
                              >{`'ethereum'`}</span>
                              {`,
})

`}
                              <span
                                style={{ color: 'rgb(98, 114, 164)' }}
                              >{`// Convert the hosted wallet to a DeFi Actions wallet.`}</span>
                              {`
`}
                              <span
                                style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                              >{`const`}</span>
                              {` `}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`wallet`}</span>
                              {` = `}
                              <span
                                style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                              >{`await`}</span>
                              {` `}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`actions`}</span>
                              {`.`}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`wallet`}</span>
                              {`.`}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`hostedWalletToActionsWallet`}</span>
                              {`({
  `}
                              <span
                                style={{ color: '#9cdcfe' }}
                              >{`walletId`}</span>
                              {`: `}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`dynamicWallet`}</span>
                              {`.`}
                              <span style={{ color: '#4db6ac' }}>{`id`}</span>
                              {`,
  `}
                              <span
                                style={{ color: '#9cdcfe' }}
                              >{`address`}</span>
                              {`: `}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`dynamicWallet`}</span>
                              {`.`}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`address`}</span>
                              {`,
})`}
                            </code>
                          </pre>
                          {/* Copy button */}
                          <button
                            onClick={() =>
                              navigator.clipboard.writeText(
                                `// Create a new wallet using your hosted wallet provider.
const dynamicWallet = await dynamicClient.walletApi.createWallet({
  chainType: 'ethereum',
})

// Convert the hosted wallet to a DeFi Actions wallet.
const wallet = await actions.wallet.hostedWalletToActionsWallet({
  walletId: dynamicWallet.id,
  address: dynamicWallet.address,
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
                        <p className="text-gray-300 mb-4">
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
                          2. Create user wallet and extend it with DeFi{' '}
                          <span
                            style={{ color: '#FF0621', fontWeight: 'bold' }}
                          >
                            Actions
                          </span>
                          :
                        </p>
                        <div
                          className="rounded-lg overflow-hidden"
                          style={{
                            backgroundColor: '#1a1b1e',
                            border: '1px solid rgba(184, 187, 38, 0.1)',
                          }}
                        >
                          {/* Terminal header */}
                          <div
                            className="px-4 py-3 border-b flex items-center justify-between"
                            style={{
                              backgroundColor: '#0f1011',
                              borderColor: 'rgba(184, 187, 38, 0.15)',
                              backdropFilter: 'blur(10px)',
                            }}
                          >
                            <div className="flex items-center space-x-2">
                              <div
                                className="w-3 h-3 rounded-full shadow-sm"
                                style={{ backgroundColor: '#ff5f56' }}
                              ></div>
                              <div
                                className="w-3 h-3 rounded-full shadow-sm"
                                style={{ backgroundColor: '#ffbd2e' }}
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
                              style={{ color: '#FF0621' }}
                            >
                              wallet.ts
                            </div>
                          </div>
                          <div className="relative">
                            <pre
                              className="text-sm leading-relaxed font-mono p-4"
                              style={{ backgroundColor: '#1a1b1e' }}
                            >
                            <code style={{ color: '#e8e3d3' }}>
                              <span
                                style={{ color: 'rgb(98, 114, 164)' }}
                              >{`// Create a new wallet using your hosted wallet provider.`}</span>
                              {`
`}
                              <span
                                style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                              >{`const`}</span>
                              {` `}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`turnkeyWallet`}</span>
                              {` = `}
                              <span
                                style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                              >{`await`}</span>
                              {` `}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`turnkeyClient`}</span>
                              {`.`}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`walletApi`}</span>
                              {`.`}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`createWallet`}</span>
                              {`({
  `}
                              <span
                                style={{ color: '#9cdcfe' }}
                              >{`chainType`}</span>
                              {`: `}
                              <span
                                style={{ color: '#ff8a65' }}
                              >{`'ethereum'`}</span>
                              {`,
})

`}
                              <span
                                style={{ color: 'rgb(98, 114, 164)' }}
                              >{`// Convert the hosted wallet to a DeFi Actions wallet.`}</span>
                              {`
`}
                              <span
                                style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                              >{`const`}</span>
                              {` `}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`wallet`}</span>
                              {` = `}
                              <span
                                style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                              >{`await`}</span>
                              {` `}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`actions`}</span>
                              {`.`}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`wallet`}</span>
                              {`.`}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`hostedWalletToActionsWallet`}</span>
                              {`({
  `}
                              <span
                                style={{ color: '#9cdcfe' }}
                              >{`walletId`}</span>
                              {`: `}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`turnkeyWallet`}</span>
                              {`.`}
                              <span style={{ color: '#4db6ac' }}>{`id`}</span>
                              {`,
  `}
                              <span
                                style={{ color: '#9cdcfe' }}
                              >{`address`}</span>
                              {`: `}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`turnkeyWallet`}</span>
                              {`.`}
                              <span
                                style={{ color: '#4db6ac' }}
                              >{`address`}</span>
                              {`,
})`}
                            </code>
                          </pre>
                          {/* Copy button */}
                          <button
                            onClick={() =>
                              navigator.clipboard.writeText(
                                `// Create a new wallet using your hosted wallet provider.
const turnkeyWallet = await turnkeyClient.walletApi.createWallet({
  chainType: 'ethereum',
})

// Convert the hosted wallet to a DeFi Actions wallet.
const wallet = await actions.wallet.hostedWalletToActionsWallet({
  walletId: turnkeyWallet.id,
  address: turnkeyWallet.address,
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

              <p className="text-gray-300 mb-2">Lend, Borrow, Swap, or Send:</p>
              <div
                className="rounded-lg overflow-hidden mb-8 shadow-2xl"
                style={{
                  backgroundColor: '#1a1b1e',
                  border: '1px solid rgba(184, 187, 38, 0.1)',
                  boxShadow:
                    '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(184, 187, 38, 0.05)',
                }}
              >
                {/* Terminal header */}
                <div
                  className="px-4 py-3 border-b flex items-center justify-between"
                  style={{
                    backgroundColor: '#0f1011',
                    borderColor: 'rgba(184, 187, 38, 0.15)',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-3 h-3 rounded-full shadow-sm"
                      style={{ backgroundColor: '#ff5f56' }}
                    ></div>
                    <div
                      className="w-3 h-3 rounded-full shadow-sm"
                      style={{ backgroundColor: '#ffbd2e' }}
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
                    style={{ color: '#FF0621' }}
                  >
                    wallet.ts
                  </div>
                </div>
                {/* Code content */}
                <div
                  className="p-8 text-left relative"
                  style={{ backgroundColor: '#1a1b1e' }}
                >
                  <pre className="text-sm leading-relaxed font-mono">
                    <code style={{ color: '#e8e3d3' }}>
                        <span
                          style={{ color: 'rgb(98, 114, 164)' }}
                        >{`// Enable asset lending in DeFi`}</span>
                        {`
`}
                        <span
                          style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                        >{`const`}</span>
                        {` `}
                        <span style={{ color: '#4db6ac' }}>{`receipt1`}</span>
                        {` = `}
                        <span style={{ color: '#4db6ac' }}>{`wallet`}</span>
                        {`.`}
                        <span style={{ color: '#4db6ac' }}>{`lend`}</span>
                        {`.`}
                        <span
                          style={{ color: '#4db6ac' }}
                        >{`openPosition`}</span>
                        {`({
  `}
                        <span style={{ color: '#9cdcfe' }}>{`amount`}</span>
                        {`: `}
                        <span style={{ color: '#ce9178' }}>{`1`}</span>
                        {`,
  `}
                        <span style={{ color: '#9cdcfe' }}>{`asset`}</span>
                        {`: `}
                        <span style={{ color: '#4db6ac' }}>{`USDC`}</span>
                        {`,
  ...`}
                        <span
                          style={{ color: '#4db6ac' }}
                        >{`ExampleMorphoMarket`}</span>
                        {`
})

`}
                        <span
                          style={{ color: 'rgb(98, 114, 164)' }}
                        >{`// Use lent assets as collateral`}</span>
                        {`
`}
                        <span
                          style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                        >{`const`}</span>
                        {` `}
                        <span style={{ color: '#4db6ac' }}>{`receipt2`}</span>
                        {` = `}
                        <span style={{ color: '#4db6ac' }}>{`wallet`}</span>
                        {`.`}
                        <span style={{ color: '#4db6ac' }}>{`borrow`}</span>
                        {`.`}
                        <span
                          style={{ color: '#4db6ac' }}
                        >{`openPosition`}</span>
                        {`({
  `}
                        <span style={{ color: '#9cdcfe' }}>{`amount`}</span>
                        {`: `}
                        <span style={{ color: '#ce9178' }}>{`1`}</span>
                        {`,
  `}
                        <span style={{ color: '#9cdcfe' }}>{`asset`}</span>
                        {`: `}
                        <span style={{ color: '#4db6ac' }}>{`USDT`}</span>
                        {`,
  ...`}
                        <span
                          style={{ color: '#4db6ac' }}
                        >{`ExampleAaveMarket`}</span>
                        {`
})

`}
                        <span
                          style={{ color: 'rgb(98, 114, 164)' }}
                        >{`// Token swap via DEX of choice`}</span>
                        {`
`}
                        <span
                          style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                        >{`const`}</span>
                        {` `}
                        <span style={{ color: '#4db6ac' }}>{`receipt3`}</span>
                        {` = `}
                        <span style={{ color: '#4db6ac' }}>{`wallet`}</span>
                        {`.`}
                        <span style={{ color: '#4db6ac' }}>{`swap`}</span>
                        {`.`}
                        <span style={{ color: '#4db6ac' }}>{`execute`}</span>
                        {`({
  `}
                        <span style={{ color: '#9cdcfe' }}>{`amountIn`}</span>
                        {`: `}
                        <span style={{ color: '#ce9178' }}>{`1`}</span>
                        {`,
  `}
                        <span style={{ color: '#9cdcfe' }}>{`assetIn`}</span>
                        {`: `}
                        <span style={{ color: '#4db6ac' }}>{`USDC`}</span>
                        {`,
  `}
                        <span style={{ color: '#9cdcfe' }}>{`assetOut`}</span>
                        {`: `}
                        <span style={{ color: '#4db6ac' }}>{`ETH`}</span>
                        {`,
})

`}
                        <span
                          style={{ color: 'rgb(98, 114, 164)' }}
                        >{`// Easy, safe asset transfers`}</span>
                        {`
`}
                        <span
                          style={{ color: 'rgba(184, 187, 38, 0.9)' }}
                        >{`const`}</span>
                        {` `}
                        <span style={{ color: '#4db6ac' }}>{`receipt4`}</span>
                        {` = `}
                        <span style={{ color: '#4db6ac' }}>{`wallet`}</span>
                        {`.`}
                        <span style={{ color: '#4db6ac' }}>{`send`}</span>
                        {`({
  `}
                        <span style={{ color: '#9cdcfe' }}>{`amount`}</span>
                        {`: `}
                        <span style={{ color: '#ce9178' }}>{`1`}</span>
                        {`,
  `}
                        <span style={{ color: '#9cdcfe' }}>{`asset`}</span>
                        {`: `}
                        <span style={{ color: '#4db6ac' }}>{`USDC`}</span>
                        {`,
  `}
                        <span style={{ color: '#9cdcfe' }}>{`to`}</span>
                        {`: `}
                        <span
                          style={{ color: '#ff8a65' }}
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
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 text-center text-gray-400 text-sm">
        <div className="max-w-7xl mx-auto px-6">
          <p>
            © 2025 Actions by{' '}
            <a
              href="https://www.optimism.io/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#FF0621', fontWeight: 'bold' }}
              className="hover:opacity-80"
            >
              Optimism
            </a>
            . Open source. MIT License.
          </p>
        </div>
      </footer>
    </div>
  )
}

export default Home
