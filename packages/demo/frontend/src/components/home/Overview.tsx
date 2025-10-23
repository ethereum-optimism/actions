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
      <div className="max-w-4xl mx-auto mb-8">
        <div className="grid grid-cols-2 gap-8">
          {/* Image Stack */}
          <div className="relative">
            <img
              src="/src/assets/stack/1-red.png"
              alt="Layer 1"
              className="relative z-[70] w-full"
              style={{ top: '0px' }}
            />
            <img
              src="/src/assets/stack/2-orange.png"
              alt="Layer 2"
              className="absolute left-0 z-[60] w-full"
              style={{ top: '0px' }}
            />
            <img
              src="/src/assets/stack/3-yellow.png"
              alt="Layer 3"
              className="absolute left-0 z-50 w-full"
              style={{ top: '0px' }}
            />
            <img
              src="/src/assets/stack/4-green.png"
              alt="Layer 4"
              className="absolute left-0 z-40 w-full"
              style={{ top: '0px' }}
            />
            <img
              src="/src/assets/stack/5-teal.png"
              alt="Layer 5"
              className="absolute left-0 z-30 w-full"
              style={{ top: '0px' }}
            />
            <img
              src="/src/assets/stack/6-indigo.png"
              alt="Layer 6"
              className="absolute left-0 z-20 w-full"
              style={{ top: '0px' }}
            />
            <img
              src="/src/assets/stack/7-violet.png"
              alt="Layer 7"
              className="absolute left-0 z-10 w-full"
              style={{ top: '0px' }}
            />
          </div>

          {/* Labels in right column */}
          <div className="relative">
            <div
              className="absolute font-medium flex items-center whitespace-nowrap z-[100]"
              style={{ top: '98px', left: '-80px', color: colors.text.cream }}
            >
              <div
                className="w-48 h-px mr-3"
                style={{ backgroundColor: colors.text.cream }}
              />
              Wallet
            </div>
            <div
              className="absolute font-medium flex items-center whitespace-nowrap z-[100]"
              style={{ top: '138px', left: '-80px', color: colors.text.cream }}
            >
              <div
                className="w-48 h-px mr-3"
                style={{ backgroundColor: colors.text.cream }}
              />
              Lend
            </div>
            <div
              className="absolute font-medium flex items-center whitespace-nowrap z-[100]"
              style={{ top: '178px', left: '-80px', color: colors.text.cream }}
            >
              <div
                className="w-48 h-px mr-3"
                style={{ backgroundColor: colors.text.cream }}
              />
              Borrow
            </div>
            <div
              className="absolute font-medium flex items-center whitespace-nowrap z-[100]"
              style={{ top: '218px', left: '-80px', color: colors.text.cream }}
            >
              <div
                className="w-48 h-px mr-3"
                style={{ backgroundColor: colors.text.cream }}
              />
              Swap
            </div>
            <div
              className="absolute font-medium flex items-center whitespace-nowrap z-[100]"
              style={{ top: '258px', left: '-80px', color: colors.text.cream }}
            >
              <div
                className="w-48 h-px mr-3"
                style={{ backgroundColor: colors.text.cream }}
              />
              Pay
            </div>
            <div
              className="absolute font-medium flex items-center whitespace-nowrap z-[100]"
              style={{ top: '298px', left: '-80px', color: colors.text.cream }}
            >
              <div
                className="w-48 h-px mr-3"
                style={{ backgroundColor: colors.text.cream }}
              />
              Assets
            </div>
            <div
              className="absolute font-medium flex items-center whitespace-nowrap z-[100]"
              style={{ top: '338px', left: '-80px', color: colors.text.cream }}
            >
              <div
                className="w-48 h-px mr-3"
                style={{ backgroundColor: colors.text.cream }}
              />
              Chains
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-4xl mx-auto">
        <CodeBlock code={exampleCode} filename="example.ts" />
      </div>
    </div>
  )
}

export default Overview
