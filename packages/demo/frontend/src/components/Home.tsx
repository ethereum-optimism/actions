import VerbsLogo from './VerbsLogo'

function Home() {
  return (
    <div className="min-h-screen" style={{backgroundColor: '#121113'}}>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-transparent">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <VerbsLogo />
            <a
              href="https://github.com/ethereum-optimism/verbs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 px-2 py-2 text-sm text-gray-300 hover:text-white transition-colors duration-200"
            >
              <span>GitHub</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6">
        <div className="text-center py-20">
          <div>
              <div className="mt-40 mb-8">
                <div className="font-mono mb-4 text-lg md:text-xl lg:text-2xl" style={{color: 'rgb(184, 187, 38)', lineHeight: 0.7}}>
                  <pre>{`
██╗   ██╗███████╗██████╗ ██████╗ ███████╗
██║   ██║██╔════╝██╔══██╗██╔══██╗██╔════╝
██║   ██║█████╗  ██████╔╝██████╔╝███████╗
╚██╗ ██╔╝██╔══╝  ██╔══██╗██╔══██╗╚════██║
 ╚████╔╝ ███████╗██║  ██║██████╔╝███████║
  ╚═══╝  ╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝
                  `}</pre>
                </div>
              </div>

              <h1 className="text-4xl md:text-5xl font-normal mb-6 leading-tight" style={{fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#d1d5db'}}>
                Perform <span className="font-semibold">DeFi</span> actions in your application with lightweight, composable, and type-safe modules.
              </h1>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
                <button className="bg-white text-black px-8 py-3 rounded-lg font-medium hover:bg-gray-200">
                  Docs
                </button>
                <a href="/" className="border border-gray-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-gray-800 inline-block text-center">
                  Demo
                </a>
              </div>
          </div>
        </div>

        {/* Code Example */}
        <div className="py-16">
          <div className="max-w-4xl mx-auto mb-8">
            <h2 className="text-lg font-medium text-gray-300 mb-4">Overview</h2>
            <div className="h-px bg-gradient-to-r from-gray-600 via-gray-500 to-transparent"></div>
          </div>
          <div className="rounded-lg overflow-hidden max-w-4xl mx-auto shadow-2xl" style={{
            backgroundColor: '#1a1b1e',
            border: '1px solid rgba(184, 187, 38, 0.1)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(184, 187, 38, 0.05)'
          }}>
            {/* Terminal header */}
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{
              backgroundColor: '#0f1011',
              borderColor: 'rgba(184, 187, 38, 0.15)',
              backdropFilter: 'blur(10px)'
            }}>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full shadow-sm" style={{backgroundColor: '#ff5f56'}}></div>
                <div className="w-3 h-3 rounded-full shadow-sm" style={{backgroundColor: '#ffbd2e'}}></div>
                <div className="w-3 h-3 rounded-full shadow-sm" style={{backgroundColor: 'rgb(184, 187, 38)', boxShadow: '0 0 6px rgba(184, 187, 38, 0.4)'}}></div>
              </div>
              <div className="text-xs font-mono" style={{color: 'rgba(184, 187, 38, 0.7)'}}>example.js</div>
            </div>
            {/* Code content */}
            <div className="p-8 text-left" style={{backgroundColor: '#1a1b1e'}}>
              <pre className="text-sm leading-relaxed font-mono">
                <code style={{color: '#e8e3d3'}}>
{`// 1. Import modules
`}<span style={{color: 'rgba(184, 187, 38, 0.9)'}}>{`import`}</span>{` { `}<span style={{color: '#4db6ac'}}>{`createPublicClient`}</span>{`, `}<span style={{color: '#4db6ac'}}>{`http`}</span>{` } `}<span style={{color: 'rgba(184, 187, 38, 0.9)'}}>{`from`}</span>{` `}<span style={{color: '#ff8a65'}}>{`'viem'`}</span>{`
`}<span style={{color: 'rgba(184, 187, 38, 0.9)'}}>{`import`}</span>{` { `}<span style={{color: '#4db6ac'}}>{`mainnet`}</span>{` } `}<span style={{color: 'rgba(184, 187, 38, 0.9)'}}>{`from`}</span>{` `}<span style={{color: '#ff8a65'}}>{`'viem/chains'`}</span>{`

// 2. Set up your client with desired chain & transport
`}<span style={{color: 'rgba(184, 187, 38, 0.9)'}}>{`const`}</span>{` `}<span style={{color: '#4db6ac'}}>{`client`}</span>{` = `}<span style={{color: '#4db6ac'}}>{`createPublicClient`}</span>{`({
  chain: `}<span style={{color: '#4db6ac'}}>{`mainnet`}</span>{`,
  transport: `}<span style={{color: '#4db6ac'}}>{`http`}</span>{`(),
})

// 3. Consume an action!
`}<span style={{color: 'rgba(184, 187, 38, 0.9)'}}>{`const`}</span>{` `}<span style={{color: '#4db6ac'}}>{`blockNumber`}</span>{` = `}<span style={{color: 'rgba(184, 187, 38, 0.9)'}}>{`await`}</span>{` `}<span style={{color: '#4db6ac'}}>{`client`}</span>{`.`}<span style={{color: '#4db6ac'}}>{`getBlockNumber`}</span>{`()`}
                </code>
              </pre>
            </div>
          </div>
        </div>

        {/* DeFi Actions Grid */}
        <div className="py-16">
          <div className="max-w-4xl mx-auto mb-8">
            <h2 className="text-lg font-medium text-gray-300 mb-4">Features</h2>
            <div className="h-px bg-gradient-to-r from-gray-600 via-gray-500 to-transparent"></div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="mb-3 flex justify-center">
                <svg className="w-8 h-8" style={{color: 'rgb(184, 187, 38)'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-semibold mb-2 text-white">Fund</h3>
              <p className="text-gray-300 text-sm">Onramp to stables</p>
            </div>
            <div className="text-center">
              <div className="mb-3 flex justify-center">
                <svg className="w-8 h-8" style={{color: 'rgb(184, 187, 38)'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16l-4-4m0 0l4-4m-4 4h18M3 20h18M3 4h18" />
                </svg>
              </div>
              <h3 className="font-semibold mb-2 text-white">Borrow</h3>
              <p className="text-gray-300 text-sm">Borrow via Morpho</p>
            </div>
            <div className="text-center">
              <div className="mb-3 flex justify-center">
                <svg className="w-8 h-8" style={{color: 'rgb(184, 187, 38)'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
              <h3 className="font-semibold mb-2 text-white">Repay</h3>
              <p className="text-gray-300 text-sm">Repay Morpho loan</p>
            </div>
            <div className="text-center">
              <div className="mb-3 flex justify-center">
                <svg className="w-8 h-8" style={{color: 'rgb(184, 187, 38)'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <h3 className="font-semibold mb-2 text-white">Swap</h3>
              <p className="text-gray-300 text-sm">Trade via Uniswap</p>
            </div>
            <div className="text-center">
              <div className="mb-3 flex justify-center">
                <svg className="w-8 h-8" style={{color: 'rgb(184, 187, 38)'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h3 className="font-semibold mb-2 text-white">Earn</h3>
              <p className="text-gray-300 text-sm">Earn DeFi yield</p>
            </div>
            <div className="text-center">
              <div className="mb-3 flex justify-center">
                <svg className="w-8 h-8" style={{color: 'rgb(184, 187, 38)'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="font-semibold mb-2 text-white">Lend</h3>
              <p className="text-gray-300 text-sm">Lend via Morpho</p>
            </div>
            <div className="text-center">
              <div className="mb-3 flex justify-center">
                <svg className="w-8 h-8" style={{color: 'rgb(184, 187, 38)'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="font-semibold mb-2 text-white">Wallet</h3>
              <p className="text-gray-300 text-sm">Create new wallet</p>
            </div>
            <div className="text-center">
              <div className="mb-3 flex justify-center">
                <svg className="w-8 h-8" style={{color: 'rgb(184, 187, 38)'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <h3 className="font-semibold mb-2 text-white">List Wallets</h3>
              <p className="text-gray-300 text-sm">List all wallets</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 text-center text-gray-400 text-sm">
        <div className="max-w-7xl mx-auto px-6">
          <p>© 2025 verbs. MIT License.</p>
        </div>
      </footer>
    </div>
  )
}

export default Home