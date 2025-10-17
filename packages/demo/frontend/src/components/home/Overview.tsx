import CodeBlock from './CodeBlock'
import { colors } from '@/constants/colors'

const exampleCode = `// Enable asset lending in DeFi
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

// Swap between tokens onchain
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
        <h2
          className="text-3xl font-medium mb-4"
          style={{ color: colors.text.cream }}
        >
          Overview
        </h2>
        <div className="h-px bg-gradient-to-r from-gray-600 via-gray-500 to-transparent mb-4"></div>
        <p className="mb-4" style={{ color: colors.text.cream }}>
          Actions is an open source TypeScript SDK for letting your users easily
          perform onchain actions: <strong>Lend</strong>,{' '}
          <strong>Borrow</strong>, <strong>Swap</strong>, <strong>Pay</strong>,
          without managing complex infrastructure or custody.
          <br />
          <br />
          Integrate DeFi with a single dependency.
        </p>
      </div>
      <div className="max-w-4xl mx-auto">
        <CodeBlock code={exampleCode} filename="example.ts" />
      </div>
    </div>
  )
}

export default Overview
