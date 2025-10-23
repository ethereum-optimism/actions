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
  const [expandedLayer, setExpandedLayer] = useState<number | null>(null)

  const GAP_SIZE = 124
  const LAYER_OVERLAP = -210.5 // Negative margin to create overlap
  const IMAGE_PADDING_LEFT = 36 // Left padding for images

  const layers = [
    { num: 1, image: '1.png', label: 'Wallet', imageZIndex: 70 },
    { num: 2, image: '2.png', label: 'Lend', imageZIndex: 60 },
    { num: 3, image: '3.png', label: 'Borrow', imageZIndex: 50 },
    { num: 4, image: '4.png', label: 'Swap', imageZIndex: 40 },
    { num: 5, image: '5.png', label: 'Pay', imageZIndex: 30 },
    { num: 6, image: '6.png', label: 'Assets', imageZIndex: 20 },
    { num: 7, image: '7.png', label: 'Chains', imageZIndex: 10 },
  ]

  // Click handler for labels
  const handleLabelClick = (layerNum: number) => {
    setExpandedLayer(expandedLayer === layerNum ? null : layerNum)
  }

  const getLayerMargin = (layerNum: number) => {
    // First layer always has no margin
    if (layerNum === 1) return 0

    const baseMargin = LAYER_OVERLAP

    if (expandedLayer !== null) {
      // no top gap for layer 1
      if (layerNum === expandedLayer && expandedLayer !== 1)
        return baseMargin + GAP_SIZE * 2
      // no bottom gap for layer 7
      if (layerNum === expandedLayer + 1 && layerNum <= 7)
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
          {layers.map((layer) => (
            <div
              key={layer.num}
              className="flex items-center"
              style={{
                marginTop: `${getLayerMargin(layer.num)}px`,
                transition: 'margin-top 0.3s ease-in-out',
              }}
            >
              <div
                className="w-1/2"
                style={{
                  paddingLeft: `${IMAGE_PADDING_LEFT}px`,
                  position: 'relative',
                  pointerEvents: 'none',
                  zIndex: layer.imageZIndex,
                }}
              >
                <img
                  src={`/src/assets/stack/${layer.image}`}
                  alt={`Layer ${layer.num}`}
                  className="w-full"
                />
              </div>
              <div
                className="w-1/2 flex items-center justify-start pl-8 cursor-pointer"
                style={{ position: 'relative', zIndex: 100 }}
                onClick={() => handleLabelClick(layer.num)}
              >
                <div
                  className="w-48 h-px mr-3"
                  style={{ backgroundColor: colors.text.cream }}
                />
                <span
                  className="font-medium whitespace-nowrap"
                  style={{ color: colors.text.cream }}
                >
                  {layer.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="max-w-4xl mx-auto">
        <CodeBlock code={exampleCode} filename="example.ts" />
      </div>
    </div>
  )
}

export default Overview
