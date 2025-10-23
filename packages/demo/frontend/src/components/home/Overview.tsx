import { useState } from 'react'
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
  const [hoveredLayer, setHoveredLayer] = useState<number | null>(null)

  const GAP_SIZE = 124
  const LAYER_OVERLAP = -210.5 // Negative margin to create overlap
  const IMAGE_PADDING_LEFT = 36 // Left padding for images

  const getLayerMargin = (layerNum: number) => {
    // First layer always has no margin
    if (layerNum === 1) return 0

    const baseMargin = LAYER_OVERLAP

    if (hoveredLayer !== null) {
      // no top gap for layer 1
      if (layerNum === hoveredLayer && hoveredLayer !== 1)
        return baseMargin + GAP_SIZE * 2
      // no bottom gap for layer 7
      if (layerNum === hoveredLayer + 1 && layerNum <= 7)
        return baseMargin + GAP_SIZE * 2
    }

    return baseMargin
  }

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
        <div className="flex flex-col">
          {/* Layer 1 - Wallet */}
          <div
            className="flex items-center cursor-pointer z-[70]"
            style={{
              marginTop: `${getLayerMargin(1)}px`,
              transition: 'margin-top 0.3s ease-in-out',
            }}
            onMouseEnter={() => setHoveredLayer(1)}
            onMouseLeave={() => setHoveredLayer(null)}
          >
            <div
              className="w-1/2"
              style={{ paddingLeft: `${IMAGE_PADDING_LEFT}px` }}
            >
              <img
                src="/src/assets/stack/1.png"
                alt="Layer 1"
                className="w-full"
              />
            </div>
            <div className="w-1/2 flex items-center justify-start pl-8">
              <div
                className="w-48 h-px mr-3"
                style={{ backgroundColor: colors.text.cream }}
              />
              <span
                className="font-medium whitespace-nowrap"
                style={{ color: colors.text.cream }}
              >
                Wallet
              </span>
            </div>
          </div>

          {/* Layer 2 - Lend */}
          <div
            className="flex items-center cursor-pointer z-[60]"
            style={{
              marginTop: `${getLayerMargin(2)}px`,
              transition: 'margin-top 0.3s ease-in-out',
            }}
            onMouseEnter={() => setHoveredLayer(2)}
            onMouseLeave={() => setHoveredLayer(null)}
          >
            <div
              className="w-1/2"
              style={{ paddingLeft: `${IMAGE_PADDING_LEFT}px` }}
            >
              <img
                src="/src/assets/stack/2.png"
                alt="Layer 2"
                className="w-full"
              />
            </div>
            <div className="w-1/2 flex items-center justify-start pl-8">
              <div
                className="w-48 h-px mr-3"
                style={{ backgroundColor: colors.text.cream }}
              />
              <span
                className="font-medium whitespace-nowrap"
                style={{ color: colors.text.cream }}
              >
                Lend
              </span>
            </div>
          </div>

          {/* Layer 3 - Borrow */}
          <div
            className="flex items-center cursor-pointer z-[50]"
            style={{
              marginTop: `${getLayerMargin(3)}px`,
              transition: 'margin-top 0.3s ease-in-out',
            }}
            onMouseEnter={() => setHoveredLayer(3)}
            onMouseLeave={() => setHoveredLayer(null)}
          >
            <div
              className="w-1/2"
              style={{ paddingLeft: `${IMAGE_PADDING_LEFT}px` }}
            >
              <img
                src="/src/assets/stack/3.png"
                alt="Layer 3"
                className="w-full"
              />
            </div>
            <div className="w-1/2 flex items-center justify-start pl-8">
              <div
                className="w-48 h-px mr-3"
                style={{ backgroundColor: colors.text.cream }}
              />
              <span
                className="font-medium whitespace-nowrap"
                style={{ color: colors.text.cream }}
              >
                Borrow
              </span>
            </div>
          </div>

          {/* Layer 4 - Swap */}
          <div
            className="flex items-center cursor-pointer z-[40]"
            style={{
              marginTop: `${getLayerMargin(4)}px`,
              transition: 'margin-top 0.3s ease-in-out',
            }}
            onMouseEnter={() => setHoveredLayer(4)}
            onMouseLeave={() => setHoveredLayer(null)}
          >
            <div
              className="w-1/2"
              style={{ paddingLeft: `${IMAGE_PADDING_LEFT}px` }}
            >
              <img
                src="/src/assets/stack/4.png"
                alt="Layer 4"
                className="w-full"
              />
            </div>
            <div className="w-1/2 flex items-center justify-start pl-8">
              <div
                className="w-48 h-px mr-3"
                style={{ backgroundColor: colors.text.cream }}
              />
              <span
                className="font-medium whitespace-nowrap"
                style={{ color: colors.text.cream }}
              >
                Swap
              </span>
            </div>
          </div>

          {/* Layer 5 - Pay */}
          <div
            className="flex items-center cursor-pointer z-[30]"
            style={{
              marginTop: `${getLayerMargin(5)}px`,
              transition: 'margin-top 0.3s ease-in-out',
            }}
            onMouseEnter={() => setHoveredLayer(5)}
            onMouseLeave={() => setHoveredLayer(null)}
          >
            <div
              className="w-1/2"
              style={{ paddingLeft: `${IMAGE_PADDING_LEFT}px` }}
            >
              <img
                src="/src/assets/stack/5.png"
                alt="Layer 5"
                className="w-full"
              />
            </div>
            <div className="w-1/2 flex items-center justify-start pl-8">
              <div
                className="w-48 h-px mr-3"
                style={{ backgroundColor: colors.text.cream }}
              />
              <span
                className="font-medium whitespace-nowrap"
                style={{ color: colors.text.cream }}
              >
                Pay
              </span>
            </div>
          </div>

          {/* Layer 6 - Assets */}
          <div
            className="flex items-center cursor-pointer z-[20]"
            style={{
              marginTop: `${getLayerMargin(6)}px`,
              transition: 'margin-top 0.3s ease-in-out',
            }}
            onMouseEnter={() => setHoveredLayer(6)}
            onMouseLeave={() => setHoveredLayer(null)}
          >
            <div
              className="w-1/2"
              style={{ paddingLeft: `${IMAGE_PADDING_LEFT}px` }}
            >
              <img
                src="/src/assets/stack/6.png"
                alt="Layer 6"
                className="w-full"
              />
            </div>
            <div className="w-1/2 flex items-center justify-start pl-8">
              <div
                className="w-48 h-px mr-3"
                style={{ backgroundColor: colors.text.cream }}
              />
              <span
                className="font-medium whitespace-nowrap"
                style={{ color: colors.text.cream }}
              >
                Assets
              </span>
            </div>
          </div>

          {/* Layer 7 - Chains */}
          <div
            className="flex items-center cursor-pointer z-[10]"
            style={{
              marginTop: `${getLayerMargin(7)}px`,
              transition: 'margin-top 0.3s ease-in-out',
            }}
            onMouseEnter={() => setHoveredLayer(7)}
            onMouseLeave={() => setHoveredLayer(null)}
          >
            <div
              className="w-1/2"
              style={{ paddingLeft: `${IMAGE_PADDING_LEFT}px` }}
            >
              <img
                src="/src/assets/stack/7.png"
                alt="Layer 7"
                className="w-full"
              />
            </div>
            <div className="w-1/2 flex items-center justify-start pl-8">
              <div
                className="w-48 h-px mr-3"
                style={{ backgroundColor: colors.text.cream }}
              />
              <span
                className="font-medium whitespace-nowrap"
                style={{ color: colors.text.cream }}
              >
                Chains
              </span>
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
