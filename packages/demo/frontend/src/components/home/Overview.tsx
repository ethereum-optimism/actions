import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import { ScrollyProvider, useScrolly } from 'react-scrolly-telling'
import CodeBlock from './CodeBlock'
import { colors } from '@/constants/colors'
import PrivyLogo from '@/assets/privy-logo-white.svg'
import DynamicLogo from '@/assets/dynamic-logo-white.svg'
import TurnkeyLogo from '@/assets/turnkey-logo-white.svg'

const layerContent = [
  {
    num: 1,
    title: 'Wallet',
    description:
      'Actions supports embedded wallet providers, creating smart wallets, managing signers, and sponsoring transactions with a gas paymaster.',
    images: [PrivyLogo, TurnkeyLogo, DynamicLogo],
    imageLabel: 'Supports embedded wallet providers:',
    code: `// Make onchain Actions from any embedded wallet
const wallet = await actions.wallet.toActionsWallet({
  embeddedWallet
});

// Create signers
const signer = await actions.wallet.createSigner({
  connectedWallet: embeddedWallet,
});

// Create smart contract wallets
const smartWallet = await actions.wallet.createSmartWallet({
  signer
});
`,
  },
  {
    num: 2,
    title: 'Lend',
    description:
      'Let users earn yield by lending assets across chains and protocols. Configure preferred markets with allow & block lists',
    code: `// Fetch live market data
const markets = actions.lend.getMarkets(USDC);

// Lend assets, earn yield
const receipt = wallet.lend.openPosition({
  amount: 1,
  asset: USDC,
  ...ExampleMorphoMarket
});`,
  },
  {
    num: 3,
    title: 'Borrow',
    description:
      'Let users borrow assets against lent collateral. Configure preferred markets with allow & block lists',
    code: `// Fetch live market data
const markets = actions.borrow.getMarkets(USDC);

// Borrow against lent collateral
const receipt = wallet.borrow.openPosition({
  amount: 1,
  asset: ETH,
  ...ExampleAaveMarket
});`,
  },
  {
    num: 4,
    title: 'Swap',
    description:
      'Enable onchain trading between configurable protocols and assets.',
    code: `// Swap between tokens
const receipt = wallet.swap.execute({
  amountIn: 1,
  assetIn: USDC,
  assetOut: ETH,
});`,
  },
  {
    num: 5,
    title: 'Pay',
    description: 'Simple interface for transfers and payments.',
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
    description: 'Configure which assets you want to support.',
    code: `// Import popular assets
import { USDC } from '@eth-optimism/actions-sdk/assets'

// Define custom assets
export const CustomToken: Asset = {
  address: {
    [mainnet.id]: '0x123...',
    [unichain.id]: '0x456...',
    [baseSepolia.id]: '0x789...',
  },
  metadata: {
    decimals: 6,
    name: 'Custom Token',
    symbol: 'CUSTOM',
  },
  type: 'erc20',
}

// Track balances
const usdcBalance = await wallet.getBalance(CustomToken);`,
  },
  {
    num: 7,
    title: 'Chains',
    description:
      'Configure which chains you want to support. Abstract them away from your users.',
    code: `// Define chains once in a global config
const OPTIMISM = {
  chainId: optimism.id,
  rpcUrls: env.OPTIMISM_RPC_URL
  bundler: { // Bundle and sponsor txs with a gas paymaster
    type: 'simple' as const,
    url: env.OPTIMISM_BUNDLER_URL,
  },
}

const BASE = {
  chainId: base.id,
  rpcUrls: env.BASE_RPC_URL
  bundler: { // Bundle and sponsor txs with a gas paymaster
    type: 'simple' as const,
    url: env.BASE_BUNDLER_URL,
  },
}`,
  },
]

// Mobile breakpoint constants (475-1023px)
const MOBILE_GAP_SIZE = 250
const MOBILE_LAYER_OVERLAP = -153.5
const MOBILE_IMAGE_PADDING_LEFT = 0
const MOBILE_IMAGE_WIDTH = 300 // Fixed width for consistent height

// Desktop breakpoint constants (1024px and up)
const GAP_SIZE = 210
const LAYER_OVERLAP = -160.5
const IMAGE_PADDING_LEFT = 36
const DESKTOP_IMAGE_WIDTH = 350 // Fixed width for consistent height

const CONTENT_SCROLL_BUFFER_START = 0.33 // Content stays at top for first 33%
const CONTENT_SCROLL_BUFFER_END = 0.33 // Content stays at bottom for last 33%

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

const getMobileLayerMargin = (layerNum: number, activeLayer: number) => {
  if (layerNum === 1) return 0

  const baseMargin = MOBILE_LAYER_OVERLAP

  // Add gaps above and below the active layer
  if (activeLayer > 0) {
    if (layerNum === activeLayer && activeLayer !== 1) {
      return baseMargin + MOBILE_GAP_SIZE
    }
    if (layerNum === activeLayer + 1 && layerNum <= 7) {
      return baseMargin + MOBILE_GAP_SIZE
    }
  }

  return baseMargin
}

function ScrollyStack({
  onProgressUpdate,
}: {
  onProgressUpdate: OverviewProps['onProgressUpdate']
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const mobileImageRef = useRef<HTMLImageElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const mobileContentRef = useRef<HTMLDivElement>(null)
  const [imageHeight, setImageHeight] = useState(0)
  const [mobileImageHeight, setMobileImageHeight] = useState(0)
  const [smoothScrollRatio, setSmoothScrollRatio] = useState(0)
  const [contentOpacity, setContentOpacity] = useState(1)
  const prevLayerRef = useRef(0)
  const frozenScrollOffsetRef = useRef(0)

  const { scrollRatio } = useScrolly(containerRef)

  // Direct scroll listener for smooth progress bar updates
  useEffect(() => {
    const handleScroll = () => {
      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const containerHeight = container.offsetHeight
      const viewportHeight = window.innerHeight

      // Calculate how far through the container we've scrolled
      const scrolled = -rect.top
      const scrollableDistance = containerHeight - viewportHeight
      const ratio = Math.max(0, Math.min(1, scrolled / scrollableDistance))

      setSmoothScrollRatio(ratio)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll() // Initial calculation

    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Measure desktop image height once loaded
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

  // Measure mobile image height once loaded
  useEffect(() => {
    const measureImage = () => {
      if (mobileImageRef.current) {
        setMobileImageHeight(mobileImageRef.current.offsetHeight)
      }
    }

    const img = mobileImageRef.current

    if (img?.complete) {
      measureImage()
    } else {
      img?.addEventListener('load', measureImage)
    }

    return () => {
      img?.removeEventListener('load', measureImage)
    }
  }, [])

  // Re-measure image heights on window resize
  useEffect(() => {
    const handleResize = () => {
      if (imageRef.current) {
        setImageHeight(imageRef.current.offsetHeight)
      }
      if (mobileImageRef.current) {
        setMobileImageHeight(mobileImageRef.current.offsetHeight)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Map scroll progress to active layer (0 = inactive, 1-7 = layers)
  // Small intro section (0-0.01) where stack is centered, then 7 equal sections
  // When scrolled past (scrollRatio >= 1), deactivate all layers
  const activeLayer =
    scrollRatio < 0.01 || scrollRatio >= 1
      ? 0
      : Math.min(Math.ceil(((scrollRatio - 0.01) / 0.99) * 7), 7)

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

  // Mobile version - calculate stack offset using mobile constants
  const getMobileStackTranslateY = () => {
    if (activeLayer === 0 || activeLayer === 1 || mobileImageHeight === 0)
      return 0

    // Sum the actual margins between layers
    let marginSum = 0
    for (let i = 2; i <= activeLayer; i++) {
      marginSum += getMobileLayerMargin(i, activeLayer)
    }

    // To align tops of images, we need to account for:
    // 1. The cumulative image heights of layers we're skipping
    // 2. The cumulative margins between them
    return -((activeLayer - 1) * mobileImageHeight + marginSum)
  }

  const progressColors = [
    '#fb4933', // Red
    '#fe8019', // Orange
    '#fabd2f', // Yellow
    '#b8bb26', // Green
    '#8ec07c', // Aqua
    '#83a598', // Blue
    '#d3869b', // Purple
  ]

  // Calculate progress percentage (0-100), accounting for 0.01 intro section
  // Use smoothScrollRatio for progress bar to avoid chunky updates
  const progressPercent =
    smoothScrollRatio < 0.01
      ? 0
      : Math.min(((smoothScrollRatio - 0.01) / 0.99) * 100, 100)

  // Show progress bar when in or past scrolly section, hide when before it
  const showProgressBar = smoothScrollRatio > 0

  const scrollToLayer = (layerIndex: number) => {
    const container = containerRef.current
    if (!container) return

    // Calculate scroll position for this layer
    // Layer 0 (intro) is at scrollRatio 0-0.01
    // Layer 1-7 are divided equally in scrollRatio 0.01-1.0
    // Scroll 5% into the section to ensure it activates reliably
    const sectionSize = 0.99 / 7
    const targetScrollRatio =
      layerIndex === 0
        ? 0
        : 0.01 + ((layerIndex - 1) / 7) * 0.99 + sectionSize * 0.05

    const containerHeight = container.offsetHeight
    const viewportHeight = window.innerHeight
    const scrollableDistance = containerHeight - viewportHeight
    const targetScroll = targetScrollRatio * scrollableDistance

    const containerTop = container.getBoundingClientRect().top + window.scrollY
    window.scrollTo({
      top: containerTop + targetScroll,
      behavior: 'smooth',
    })
  }

  // Update progress bar in parent
  useEffect(() => {
    onProgressUpdate({
      show: showProgressBar,
      activeLayer,
      progressPercent,
      progressColors,
      layers,
      onLayerClick: scrollToLayer,
    })
  }, [showProgressBar, activeLayer, progressPercent])

  // Update URL hash based on active layer
  useEffect(() => {
    if (activeLayer > 0 && activeLayer <= layers.length) {
      const layerName = layers[activeLayer - 1].label.toLowerCase()
      window.history.replaceState(null, '', `#${layerName}`)
    } else if (activeLayer === 0) {
      // Clear hash when not on any layer
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [activeLayer])

  // Calculate content scroll offset based on progress within current slide
  const calculateContentScrollOffset = (layerNum: number) => {
    // Detect if mobile or desktop layout is active
    const isMobile = window.innerWidth < 1024 // lg breakpoint
    const content = isMobile ? mobileContentRef.current : contentRef.current
    if (!content || layerNum === 0) return 0

    // Calculate progress within the current slide (0 to 1)
    const slideStartRatio = 0.01 + ((layerNum - 1) / 7) * 0.99
    const slideEndRatio = 0.01 + (layerNum / 7) * 0.99
    const slideProgress = Math.max(
      0,
      Math.min(
        1,
        (smoothScrollRatio - slideStartRatio) /
          (slideEndRatio - slideStartRatio),
      ),
    )

    // Calculate how much content can be scrolled
    const scrollableHeight = content.scrollHeight - content.clientHeight

    if (scrollableHeight > 0) {
      // First 33%: stay at top
      if (slideProgress < CONTENT_SCROLL_BUFFER_START) {
        return 0
      }

      // Last 33%: stay at bottom
      if (slideProgress > 1 - CONTENT_SCROLL_BUFFER_END) {
        return -scrollableHeight
      }

      // Middle 34%: scroll from top to bottom
      const scrollStart = CONTENT_SCROLL_BUFFER_START
      const scrollEnd = 1 - CONTENT_SCROLL_BUFFER_END
      const scrollProgress =
        (slideProgress - scrollStart) / (scrollEnd - scrollStart)

      // Return negative offset to scroll content upward as user scrolls down
      return -(scrollProgress * scrollableHeight)
    }

    return 0
  }

  // Initialize prevLayerRef synchronously before first render
  useLayoutEffect(() => {
    if (activeLayer > 0 && prevLayerRef.current === 0) {
      prevLayerRef.current = activeLayer
      setContentOpacity(1)
    }
  }, [activeLayer])

  // Handle smooth fade transitions when layer changes
  useEffect(() => {
    if (activeLayer > 0 && prevLayerRef.current > 0) {
      // Handle layer changes with fade transition
      if (activeLayer !== prevLayerRef.current) {
        // Freeze the current scroll offset before fading out
        frozenScrollOffsetRef.current = calculateContentScrollOffset(
          prevLayerRef.current,
        )

        // Fade out
        setContentOpacity(0)

        // Wait for fade out, then change content and fade in
        const timer = setTimeout(() => {
          prevLayerRef.current = activeLayer
          setContentOpacity(1)
        }, 150)

        return () => clearTimeout(timer)
      }
    }
  }, [activeLayer])

  // Get content scroll offset - use frozen offset during fade-out, live offset otherwise
  const contentScrollOffset =
    contentOpacity === 0
      ? frozenScrollOffsetRef.current
      : calculateContentScrollOffset(prevLayerRef.current)

  // Handle initial hash navigation on page load
  useEffect(() => {
    const hash = window.location.hash.slice(1) // Remove the '#'
    if (hash) {
      const layerIndex = layers.findIndex(
        (layer) => layer.label.toLowerCase() === hash.toLowerCase(),
      )
      if (layerIndex !== -1) {
        const layerNum = layers[layerIndex].num

        const scrollToHash = () => {
          const container = containerRef.current
          if (container && container.offsetHeight > 0) {
            // Calculate scroll position - scroll 5% into section to ensure it activates
            const sectionSize = 0.99 / 7
            const targetScrollRatio =
              layerNum === 0
                ? 0
                : 0.01 + ((layerNum - 1) / 7) * 0.99 + sectionSize * 0.05
            const containerHeight = container.offsetHeight
            const viewportHeight = window.innerHeight
            const scrollableDistance = containerHeight - viewportHeight
            const targetScroll = targetScrollRatio * scrollableDistance
            const containerTop =
              container.getBoundingClientRect().top + window.scrollY

            // Set scroll position immediately without animation
            window.scrollTo({
              top: containerTop + targetScroll,
              behavior: 'auto',
            })
          }
        }

        // Wait for all resources (images, fonts, etc.) to load
        if (document.readyState === 'complete') {
          // Page already loaded, scroll immediately
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              scrollToHash()
            })
          })
        } else {
          // Wait for page to fully load
          window.addEventListener('load', () => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                scrollToHash()
              })
            })
          })
        }
      }
    }
  }, [])

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <div ref={containerRef} style={{ height: '1000vh' }}>
        {/* Sticky container that holds the stack */}
        <div
          style={{
            position: 'sticky',
            top: '140px',
            height: '80vh',
          }}
        >
          <div className="max-w-6xl mx-auto px-4 lg:px-0">
            {/* Mobile Layout: Stack vertically */}
            <div
              className="flex flex-col lg:hidden"
              style={{ height: '80vh', position: 'relative' }}
            >
              {/* Mobile: All stack images in background */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '20%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  zIndex: 0,
                  overflow: 'visible',
                  paddingTop: '40px',
                }}
              >
                <div
                  style={{
                    transform: `translateY(${getMobileStackTranslateY()}px)`,
                    transition: 'transform 0.4s ease-in-out',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  {layers.map((layer) => (
                    <div
                      key={layer.num}
                      style={{
                        marginTop:
                          layer.num === 1
                            ? 0
                            : `${getMobileLayerMargin(layer.num, activeLayer)}px`,
                        transition: 'margin-top 0.3s ease-in-out',
                      }}
                    >
                      <div
                        style={{
                          paddingLeft: `${MOBILE_IMAGE_PADDING_LEFT}px`,
                          position: 'relative',
                          pointerEvents: 'none',
                          zIndex: layer.imageZIndex,
                        }}
                      >
                        <img
                          ref={layer.num === 1 ? mobileImageRef : null}
                          src={getImagePath(layer.num, false)}
                          alt={`Layer ${layer.num} trace`}
                          style={{
                            width: `${MOBILE_IMAGE_WIDTH}px`,
                            height: 'auto',
                            opacity: activeLayer === layer.num ? 0 : 1,
                            transition: 'opacity 0.5s ease-in-out',
                          }}
                        />
                        <img
                          src={getImagePath(layer.num, true)}
                          alt={`Layer ${layer.num} active`}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: `${MOBILE_IMAGE_PADDING_LEFT}px`,
                            width: `${MOBILE_IMAGE_WIDTH}px`,
                            height: 'auto',
                            opacity: activeLayer === layer.num ? 1 : 0,
                            transition: 'opacity 0.5s ease-in-out',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mobile: Spacer for image area */}
              <div style={{ height: '20%' }} />

              {/* Mobile: Content below (80% height) */}
              <div
                style={{
                  height: '80%',
                  overflow: 'hidden',
                  position: 'relative',
                  zIndex: 10,
                }}
              >
                {activeLayer > 0 && prevLayerRef.current > 0 && (
                  <div
                    ref={mobileContentRef}
                    style={{
                      height: '100%',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                      }}
                    >
                      <div
                        style={{
                          transform: `translateY(${contentScrollOffset}px)`,
                          transition: 'none',
                        }}
                      >
                        <div
                          style={{
                            backgroundColor: 'rgba(26, 26, 26, 0.5)',
                            padding: '16px',
                            borderRadius: '8px',
                            marginBottom: '24px',
                            opacity: contentOpacity,
                            transition: 'opacity 0.15s ease-in-out',
                          }}
                        >
                          <h3
                            className="text-2xl font-medium mb-4"
                            style={{ color: colors.text.cream }}
                          >
                            {layerContent[prevLayerRef.current - 1].title}
                          </h3>
                          <p
                            className="mb-0"
                            style={{ color: colors.text.cream }}
                          >
                            {layerContent[prevLayerRef.current - 1].description}
                          </p>
                        </div>
                        <CodeBlock
                          code={layerContent[prevLayerRef.current - 1].code}
                          filename={`${layerContent[prevLayerRef.current - 1].title.toLowerCase()}.ts`}
                          opacity={contentOpacity}
                        />
                        {layerContent[prevLayerRef.current - 1].images && (
                          <div className="mt-6">
                            {layerContent[prevLayerRef.current - 1]
                              .imageLabel && (
                              <p
                                className="mb-4 text-sm"
                                style={{ color: colors.text.cream }}
                              >
                                {
                                  layerContent[prevLayerRef.current - 1]
                                    .imageLabel
                                }
                              </p>
                            )}
                            <div
                              className="flex gap-4"
                              style={{
                                display: 'flex',
                                gap: '6rem',
                              }}
                            >
                              {layerContent[
                                prevLayerRef.current - 1
                              ].images?.map((image, index) => (
                                <div
                                  key={index}
                                  style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <img
                                    src={image}
                                    alt={`Provider ${index + 1}`}
                                    style={{
                                      maxWidth: '100%',
                                      height: 'auto',
                                      objectFit: 'contain',
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Desktop Layout: Side by side */}
            <div
              className="hidden lg:flex items-start gap-16"
              style={{ position: 'relative', minHeight: '60vh' }}
            >
              {/* Left side: Stack visualization - fixed width */}
              <div
                style={{
                  position: 'absolute',
                  left: activeLayer > 0 ? '0' : '50%',
                  transition: 'left 0.4s ease-in-out',
                  width: `${DESKTOP_IMAGE_WIDTH}px`,
                }}
              >
                <div
                  className="flex flex-col"
                  style={{
                    transform: `translateX(${activeLayer > 0 ? '0' : '-50%'}) translateY(${getStackTranslateY()}px)`,
                    transition: 'transform 0.4s ease-in-out',
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
                          width: `${DESKTOP_IMAGE_WIDTH}px`,
                        }}
                      >
                        <img
                          ref={layer.num === 1 ? imageRef : null}
                          src={getImagePath(layer.num, false)}
                          alt={`Layer ${layer.num} trace`}
                          className="block"
                          style={{
                            width: `${DESKTOP_IMAGE_WIDTH}px`,
                            height: 'auto',
                            opacity: activeLayer === layer.num ? 0 : 1,
                            transition: 'opacity 0.5s ease-in-out',
                          }}
                        />
                        <img
                          src={getImagePath(layer.num, true)}
                          alt={`Layer ${layer.num} active`}
                          className="block"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: `${IMAGE_PADDING_LEFT}px`,
                            width: `${DESKTOP_IMAGE_WIDTH - IMAGE_PADDING_LEFT}px`,
                            height: 'auto',
                            opacity: activeLayer === layer.num ? 1 : 0,
                            transition: 'opacity 0.5s ease-in-out',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right side: Content panel */}
              <div
                style={{
                  marginLeft: `${DESKTOP_IMAGE_WIDTH + 64}px`,
                  opacity: activeLayer > 0 ? 1 : 0,
                  transition: 'opacity 0.4s ease-in-out',
                  flex: 1,
                }}
              >
                {activeLayer > 0 && prevLayerRef.current > 0 && (
                  <div
                    ref={contentRef}
                    style={{
                      overflow: 'hidden',
                      maxHeight: '80vh',
                      position: 'relative',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          transform: `translateY(${contentScrollOffset}px)`,
                          transition: 'none',
                        }}
                      >
                        <div
                          style={{
                            backgroundColor: 'rgba(26, 26, 26, 0.5)',
                            padding: '16px',
                            borderRadius: '8px',
                            marginBottom: '24px',
                            opacity: contentOpacity,
                            transition: 'opacity 0.15s ease-in-out',
                          }}
                        >
                          <h3
                            className="text-2xl font-medium mb-4"
                            style={{ color: colors.text.cream }}
                          >
                            {layerContent[prevLayerRef.current - 1].title}
                          </h3>
                          <p
                            className="mb-0"
                            style={{ color: colors.text.cream }}
                          >
                            {layerContent[prevLayerRef.current - 1].description}
                          </p>
                        </div>
                        <CodeBlock
                          code={layerContent[prevLayerRef.current - 1].code}
                          filename={`${layerContent[prevLayerRef.current - 1].title.toLowerCase()}.ts`}
                          opacity={contentOpacity}
                        />
                        {layerContent[prevLayerRef.current - 1].images && (
                          <div className="mt-6">
                            {layerContent[prevLayerRef.current - 1]
                              .imageLabel && (
                              <p
                                className="mb-4 text-sm"
                                style={{ color: colors.text.cream }}
                              >
                                {
                                  layerContent[prevLayerRef.current - 1]
                                    .imageLabel
                                }
                              </p>
                            )}
                            <div
                              className="flex gap-4"
                              style={{
                                display: 'flex',
                                gap: '6rem',
                              }}
                            >
                              {layerContent[
                                prevLayerRef.current - 1
                              ].images?.map((image, index) => (
                                <div
                                  key={index}
                                  style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <img
                                    src={image}
                                    alt={`Provider ${index + 1}`}
                                    style={{
                                      maxWidth: '100%',
                                      height: 'auto',
                                      objectFit: 'contain',
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

interface OverviewProps {
  onProgressUpdate: (data: {
    show: boolean
    activeLayer: number
    progressPercent: number
    progressColors: string[]
    layers: { num: number; label: string }[]
    onLayerClick: (layerNum: number) => void
  }) => void
}

function Overview({ onProgressUpdate }: OverviewProps) {
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
          <p className="mb-32" style={{ color: colors.text.cream }}>
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
        <ScrollyStack onProgressUpdate={onProgressUpdate} />
      </div>
    </ScrollyProvider>
  )
}

export default Overview
