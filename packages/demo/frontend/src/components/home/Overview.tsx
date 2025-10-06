import { colors } from '@/constants/colors'

function Overview() {
  return (
    <div className="py-16">
      <div className="max-w-4xl mx-auto mb-8">
        <h2 className="text-3xl font-medium text-gray-300 mb-4">
          Overview
        </h2>
        <div className="h-px bg-gradient-to-r from-gray-600 via-gray-500 to-transparent mb-4"></div>
        <p className="text-gray-300 mb-4">
          Actions is an open source SDK for onchain actions:{' '}
          <strong>Lend</strong>, <strong>Borrow</strong>,{' '}
          <strong>Swap</strong>, <strong>Pay</strong>, without managing
          complex infrastructure or custody.
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
          <pre
            className="text-sm leading-relaxed font-mono"
            style={{
              fontVariantLigatures: 'none',
              fontFeatureSettings: '"liga" 0',
            }}
          >
            <code style={{ color: colors.text.primary }}>
              <span
                style={{ color: colors.syntax.keyword }}
              >{`import`}</span>
              {` { `}
              <span
                style={{ color: colors.syntax.variable }}
              >{`wallet`}</span>
              {` } `}
              <span style={{ color: colors.syntax.keyword }}>{`from`}</span>
              {` `}
              <span
                style={{ color: colors.syntax.string }}
              >{`'actions'`}</span>
              {`

`}
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
              <span style={{ color: colors.syntax.number }}>{`1`}</span>
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
              <span style={{ color: colors.syntax.number }}>{`1`}</span>
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
              <span style={{ color: colors.syntax.number }}>{`1`}</span>
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
              <span style={{ color: colors.syntax.variable }}>{`ETH`}</span>
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
              <span style={{ color: colors.syntax.number }}>{`1`}</span>
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
              <span style={{ color: colors.syntax.property }}>{`to`}</span>
              {`: `}
              <span
                style={{ color: colors.syntax.string }}
              >{`'vitalik.eth'`}</span>
              {`,
})`}
            </code>
          </pre>
        </div>
      </div>
    </div>
  )
}

export default Overview
