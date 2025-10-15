function Info() {
  return (
    <div
      className="w-full p-8"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E0E2EB',
        borderRadius: '24px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <h2 className="text-2xl font-semibold mb-6" style={{ color: '#1a1b1e' }}>
        What's Happening Under the Hood
      </h2>

      <ul
        className="space-y-3 mb-8"
        style={{ color: '#000000', fontSize: '14px' }}
      >
        <li className="flex items-start">
          <span className="mr-2">•</span>
          <span>Actions creates a smart wallet for you.</span>
        </li>
        <li className="flex items-start">
          <span className="mr-2">•</span>
          <span>You can mint demo USDC into the wallet to try actions.</span>
        </li>
        <li className="flex items-start">
          <span className="mr-2">•</span>
          <span>
            When you click Lend USDC, Actions: gets a quote and opens a lending
            position on Base Sepolia.
          </span>
        </li>
      </ul>

      <div className="space-y-3">
        <a
          href="/#getting-started"
          className="flex items-center justify-between p-3 rounded-lg transition-all hover:bg-gray-50"
        >
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5"
              style={{ color: '#666666' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span style={{ color: '#1a1b1e' }}>
              Get started with Actions SDK
            </span>
          </div>
          <svg
            className="w-4 h-4"
            style={{ color: '#666666' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </a>

        <div style={{ borderBottom: '1px solid #E0E2EB' }}></div>

        <a
          href="https://github.com/ethereum-optimism/actions"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between p-3 rounded-lg transition-all hover:bg-gray-50"
        >
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5"
              style={{ color: '#666666' }}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <span style={{ color: '#1a1b1e' }}>View code on GitHub</span>
          </div>
          <svg
            className="w-4 h-4"
            style={{ color: '#666666' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 17L17 7M17 7H7M17 7V17"
            />
          </svg>
        </a>
      </div>
    </div>
  )
}

export default Info
