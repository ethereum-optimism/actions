import { colors } from '@/constants/colors'

interface TakeActionSectionProps {
  stepNumber: number
  isOpen: boolean
  onToggle: () => void
}

function TakeActionSection({ stepNumber, isOpen, onToggle }: TakeActionSectionProps) {
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
            Take Action
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
          maxHeight: isOpen ? '3000px' : '0',
          opacity: isOpen ? 1 : 0,
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
  )
}

export default TakeActionSection
