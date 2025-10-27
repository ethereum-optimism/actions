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

  const GAP_SIZE = 134
  const LAYER_OVERLAP = -192.2 // Negative margin to create overlap
  const IMAGE_PADDING_LEFT = 36 // Left padding for images

  const layers = [
    { num: 1, label: 'Wallet', imageZIndex: 70 },
    { num: 2, label: 'Lend', imageZIndex: 60 },
    { num: 3, label: 'Borrow', imageZIndex: 50 },
    { num: 4, label: 'Swap', imageZIndex: 40 },
    { num: 5, label: 'Pay', imageZIndex: 30 },
    { num: 6, label: 'Assets', imageZIndex: 20 },
    { num: 7, label: 'Chains', imageZIndex: 10 },
  ]

  const getImagePath = (layerNum: number, isActive: boolean) => {
    const folder = isActive ? 'active' : 'trace'
    return `/src/assets/stack/${folder}/${layerNum}.png`
  }

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
                {/* Trace image (inactive state) - maintains container height */}
                <img
                  src={getImagePath(layer.num, false)}
                  alt={`Layer ${layer.num} trace`}
                  className="w-full block"
                  style={{
                    opacity: expandedLayer === layer.num ? 0 : 1,
                    transition: 'opacity 0.5s ease-in-out',
                  }}
                />
                {/* Active image (selected state) - overlays on top */}
                <img
                  src={getImagePath(layer.num, true)}
                  alt={`Layer ${layer.num} active`}
                  className="w-full block"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: `${IMAGE_PADDING_LEFT}px`,
                    width: `calc(100% - ${IMAGE_PADDING_LEFT}px)`,
                    opacity: expandedLayer === layer.num ? 1 : 0,
                    transition: 'opacity 0.5s ease-in-out',
                  }}
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
