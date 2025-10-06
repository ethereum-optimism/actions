import { colors } from '../../constants/colors'

function Features() {
  return (
    <div className="py-16">
      <div className="max-w-4xl mx-auto mb-8">
        <h2 className="text-3xl font-medium text-gray-300 mb-4">
          Features
        </h2>
        <div className="h-px bg-gradient-to-r from-gray-600 via-gray-500 to-transparent"></div>
      </div>

      {/* Core Capabilities Grid */}
      <div className="max-w-4xl mx-auto">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="mb-3 flex justify-center">
              <svg
                className="w-8 h-8"
                style={{ color: colors.syntax.keyword }}
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
            <p className="text-gray-300 text-base">Lend across markets</p>
          </div>
          <div className="text-center">
            <div className="mb-3 flex justify-center">
              <svg
                className="w-8 h-8"
                style={{ color: colors.syntax.keyword }}
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
            <p className="text-gray-300 text-base">
              Borrow against collateral
            </p>
          </div>
          <div className="text-center">
            <div className="mb-3 flex justify-center">
              <svg
                className="w-8 h-8"
                style={{ color: colors.syntax.keyword }}
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
            <p className="text-gray-300 text-base">Trade via Dex</p>
          </div>
          <div className="text-center">
            <div className="mb-3 flex justify-center">
              <svg
                className="w-8 h-8"
                style={{ color: colors.syntax.keyword }}
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
            <p className="text-gray-300 text-base">Create smart wallets</p>
          </div>
          <div className="text-center">
            <div className="mb-3 flex justify-center">
              <svg
                className="w-8 h-8"
                style={{ color: colors.syntax.keyword }}
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
            <p className="text-gray-300 text-base">Sponsor transactions</p>
          </div>
          <div className="text-center">
            <div className="mb-3 flex justify-center">
              <svg
                className="w-8 h-8"
                style={{ color: colors.syntax.keyword }}
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
            <p className="text-gray-300 text-base">
              Flexible configuration
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Features
