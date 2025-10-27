import { useRef, useState, useEffect } from 'react'
import { ScrollyProvider, useScrolly } from 'react-scrolly-telling'
import CodeBlock from './CodeBlock'
import { colors } from '@/constants/colors'

const layerContent = [
  {
    num: 1,
    title: 'Wallet',
    description:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Secure, embedded wallet infrastructure that handles authentication and key management.',
    code: `// Initialize wallet with Actions SDK
const wallet = new Wallet({
  provider: WalletProvider.PRIVY,
  config: { appId: 'your-app-id' }
})`,
  },
  {
    num: 2,
    title: 'Lend',
    description:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Enable users to earn yield by lending assets to DeFi protocols with a single function call.',
    code: `// Enable asset lending in DeFi
const receipt = wallet.lend.openPosition({
  amount: 1,
  asset: USDC,
  ...ExampleMorphoMarket
})`,
  },
  {
    num: 3,
    title: 'Borrow',
    description:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Allow users to borrow assets against their collateral across multiple lending protocols.',
    code: `// Use lent assets as collateral
const receipt = wallet.borrow.openPosition({
  amount: 1,
  asset: USDT,
  ...ExampleAaveMarket
})`,
  },
  {
    num: 4,
    title: 'Swap',
    description:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Execute token swaps across decentralized exchanges with optimal routing and pricing.',
    code: `// Swap between tokens onchain
const receipt = wallet.swap.execute({
  amountIn: 1,
  assetIn: USDC,
  assetOut: ETH,
})`,
  },
  {
    num: 5,
    title: 'Pay',
    description:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Simple, safe asset transfers with ENS support and cross-chain compatibility.',
    code: `// Easy, safe asset transfers
const receipt = wallet.send({
  amount: 1,
  asset: USDC,
  to: 'vitalik.eth',
})`,
  },
  {
    num: 6,
    title: 'Assets',
    description:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Comprehensive asset management with real-time balances, prices, and portfolio tracking.',
    code: `// Get all wallet balances
const balances = await wallet.getBalances()

// Track specific asset
const usdcBalance = await wallet.getBalance(USDC)`,
  },
  {
    num: 7,
    title: 'Chains',
    description:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Seamless multi-chain support across Ethereum, Optimism, Base, and other L2 networks.',
    code: `// Switch between chains
await wallet.switchChain(optimism)

// Execute cross-chain transaction
const receipt = await wallet.bridgeAsset(...)`,
  },
]

const GAP_SIZE = 180
const LAYER_OVERLAP = -155
const IMAGE_PADDING_LEFT = 36

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

const getLayerMargin = (layerNum: number, activeLayer: number) => {
  if (layerNum === 1) return 0

  const baseMargin = LAYER_OVERLAP

  // Add gaps above and below the active layer
  if (activeLayer > 0) {
    if (layerNum === activeLayer && activeLayer !== 1) {
      return baseMargin + GAP_SIZE
    }
    if (layerNum === activeLayer + 1 && layerNum <= 7) {
      return baseMargin + GAP_SIZE
    }
  }

  return baseMargin
}

function ScrollyStack() {
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [imageHeight, setImageHeight] = useState(0)

  const { scrollRatio } = useScrolly(containerRef, {
    offsetTop: 0,
    offsetBottom: 0,
  })

  // Measure image height once loaded
  useEffect(() => {
    const measureImage = () => {
      if (imageRef.current) {
        setImageHeight(imageRef.current.offsetHeight)
      }
    }

    const img = imageRef.current

    if (img?.complete) {
      measureImage()
    } else {
      img?.addEventListener('load', measureImage)
    }

    return () => {
      img?.removeEventListener('load', measureImage)
    }
  }, [])

  // Map scroll progress to active layer (0 = none, 1-7 = layers)
  const activeLayer = Math.min(Math.floor(scrollRatio * 8), 7)

  // Calculate how far to move the stack up so active layer stays at top position
  const getStackTranslateY = () => {
    if (activeLayer === 0 || activeLayer === 1 || imageHeight === 0) return 0

    // Sum the actual margins between layers
    let marginSum = 0
    for (let i = 2; i <= activeLayer; i++) {
      marginSum += getLayerMargin(i, activeLayer)
    }

    // To align tops of images, we need to account for:
    // 1. The cumulative image heights of layers we're skipping
    // 2. The cumulative margins between them
    return -((activeLayer - 1) * imageHeight + marginSum)
  }

  return (
    <div ref={containerRef} style={{ height: '400vh' }}>
      {/* Sticky container that holds the stack */}
      <div
        style={{
          position: 'sticky',
          top: '10vh',
          height: '80vh',
        }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start gap-12">
            {/* Left side: Stack visualization - 1/3 width */}
            <div className="w-1/3">
              <div
                className="flex flex-col"
                style={{
                  transform: `translateY(${getStackTranslateY()}px)`,
                  transition: 'transform 0.5s ease-in-out',
                }}
              >
                {layers.map((layer) => (
                  <div
                    key={layer.num}
                    className="flex items-center"
                    style={{
                      marginTop: `${getLayerMargin(layer.num, activeLayer)}px`,
                      transition: 'margin-top 0.3s ease-in-out',
                    }}
                  >
                    <div
                      style={{
                        paddingLeft: `${IMAGE_PADDING_LEFT}px`,
                        position: 'relative',
                        pointerEvents: 'none',
                        zIndex: layer.imageZIndex,
                        width: '100%',
                      }}
                    >
                      <img
                        ref={layer.num === 1 ? imageRef : null}
                        src={getImagePath(layer.num, false)}
                        alt={`Layer ${layer.num} trace`}
                        className="w-full block"
                        style={{
                          opacity: activeLayer === layer.num ? 0 : 1,
                          transition: 'opacity 0.5s ease-in-out',
                        }}
                      />
                      <img
                        src={getImagePath(layer.num, true)}
                        alt={`Layer ${layer.num} active`}
                        className="w-full block"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: `${IMAGE_PADDING_LEFT}px`,
                          width: `calc(100% - ${IMAGE_PADDING_LEFT}px)`,
                          opacity: activeLayer === layer.num ? 1 : 0,
                          transition: 'opacity 0.5s ease-in-out',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right side: Content panel - 2/3 width */}
            <div className="w-2/3">
              {activeLayer > 0 && (
                <div
                  style={{
                    opacity: activeLayer > 0 ? 1 : 0,
                    transform: `translateY(${activeLayer > 0 ? 0 : 20}px)`,
                    transition:
                      'opacity 0.5s ease-in-out, transform 0.5s ease-in-out',
                  }}
                >
                  <h3
                    className="text-2xl font-medium mb-4"
                    style={{ color: colors.text.cream }}
                  >
                    {layerContent[activeLayer - 1].title}
                  </h3>
                  <p className="mb-6" style={{ color: colors.text.cream }}>
                    {layerContent[activeLayer - 1].description}
                  </p>
                  <CodeBlock
                    code={layerContent[activeLayer - 1].code}
                    filename={`${layerContent[activeLayer - 1].title.toLowerCase()}.ts`}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Overview() {
  return (
    <ScrollyProvider>
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
            Actions is an open source TypeScript SDK for letting your users
            easily perform onchain actions: <strong>Lend</strong>,{' '}
            <strong>Borrow</strong>, <strong>Swap</strong>, <strong>Pay</strong>
            , without managing complex infrastructure or custody.
            <br />
            <br />
            Integrate DeFi with a single dependency.
          </p>
        </div>

        {/* Scrolly-telling stack section */}
        <ScrollyStack />
      </div>
    </ScrollyProvider>
  )
}

export default Overview
