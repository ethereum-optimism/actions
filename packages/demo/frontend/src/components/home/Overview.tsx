import { colors } from '@/constants/colors'
import Code from '../Code'

const exampleCode = `import { wallet } from 'actions'

// Enable asset lending in DeFi
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
})`

function Overview() {
  return (
    <div className="py-16">
      <div className="max-w-4xl mx-auto mb-8">
        <h2 className="text-3xl font-medium text-gray-300 mb-4">Overview</h2>
        <div className="h-px bg-gradient-to-r from-gray-600 via-gray-500 to-transparent mb-4"></div>
        <p className="text-gray-300 mb-4">
          Actions is an open source SDK for onchain actions:{' '}
          <strong>Lend</strong>, <strong>Borrow</strong>, <strong>Swap</strong>,{' '}
          <strong>Pay</strong>, without managing complex infrastructure or
          custody.
        </p>
      </div>
      <div
        className="rounded-lg overflow-hidden max-w-4xl mx-auto shadow-2xl"
        style={{
          backgroundColor: colors.bg.code,
          border: '1px solid rgba(80, 73, 69, 0.3)',
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
                backgroundColor: colors.macos.green,
                boxShadow: '0 0 6px rgba(184, 187, 38, 0.4)',
              }}
            ></div>
          </div>
          <div
            className="text-xs font-mono"
            style={{ color: colors.syntax.keyword }}
          >
            example.ts
          </div>
        </div>
        {/* Code content */}
        <div
          className="p-8 text-left"
          style={{ backgroundColor: colors.bg.code }}
        >
          <Code code={exampleCode} language="typescript" />
        </div>
      </div>
    </div>
  )
}

export default Overview
