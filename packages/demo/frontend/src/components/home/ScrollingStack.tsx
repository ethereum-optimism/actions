import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import { useScrolly } from 'react-scrolly-telling'
import CodeBlock from '@/components/home/CodeBlock'
import { colors } from '@/constants/colors'

export interface LayerContentItem {
  title: string
  description: string
  code: string
  images?: string[]
  imageLabel?: string
  mobileHeightBuffer?: number
}

// Mobile breakpoint constants (475-1023px)
const MOBILE_GAP_SIZE = 250
const MOBILE_LAYER_OVERLAP = -153.5
const MOBILE_IMAGE_PADDING_LEFT = 0
const MOBILE_IMAGE_WIDTH = 300 // Fixed width for consistent height

// Desktop breakpoint constants (1024px and up)
const SLIDE_HEIGHT = 800 // 800vh
const GAP_SIZE = 210
const LAYER_OVERLAP = -160.5
const IMAGE_PADDING_LEFT = 36
const DESKTOP_IMAGE_WIDTH = 350 // Fixed width for consistent height

const CONTENT_SCROLL_BUFFER_START = 0.1 // Content stays at top for first 10%
const CONTENT_SCROLL_BUFFER_END = 0.1 // Content stays at bottom for last 10%

const getImagePath = (layerNum: number, isActive: boolean) => {
  const folder = isActive ? 'active' : 'trace'
  return `/stack/${folder}/${layerNum}.png`
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

// Helper: Calculate stack vertical offset to align active layer at top
const calculateStackTranslateY = (
  activeLayer: number,
  imageHeight: number,
  getMarginFn: (layerNum: number, activeLayer: number) => number,
) => {
  if (activeLayer === 0 || activeLayer === 1 || imageHeight === 0) return 0

  // Sum the actual margins between layers
  let marginSum = 0
  for (let i = 2; i <= activeLayer; i++) {
    marginSum += getMarginFn(i, activeLayer)
  }

  // To align tops of images, we need to account for:
  // 1. The cumulative image heights of layers we're skipping
  // 2. The cumulative margins between them
  return -((activeLayer - 1) * imageHeight + marginSum)
}

// Helper: Measure image height once loaded
const useMeasureImageHeight = (
  imageRef: React.RefObject<HTMLImageElement>,
  setHeight: (height: number) => void,
) => {
  useEffect(() => {
    const measureImage = () => {
      if (imageRef.current) {
        setHeight(imageRef.current.offsetHeight)
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
  }, [imageRef, setHeight])
}

export interface ScrollingStackProps {
  content: LayerContentItem[]
  onProgressUpdate: (data: {
    show: boolean
    activeLayer: number
    progressPercent: number
    progressColors: string[]
    layers: { num: number; label: string }[]
    onLayerClick: (layerNum: number) => void
  }) => void
}

function ScrollingStack({ content, onProgressUpdate }: ScrollingStackProps) {
  // Desktop refs
  const imageRef = useRef<HTMLImageElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevLayerRef = useRef(0)
  const frozenScrollOffsetRef = useRef(0)

  // Mobile refs
  const mobileImageRef = useRef<HTMLImageElement>(null)
  const mobileContentRef = useRef<HTMLDivElement>(null)

  // Desktop state
  const [imageHeight, setImageHeight] = useState(0)
  const [smoothScrollRatio, setSmoothScrollRatio] = useState(0)
  const [contentOpacity, setContentOpacity] = useState(1)

  // Mobile state
  const [mobileImageHeight, setMobileImageHeight] = useState(0)

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

  // Measure image heights once loaded
  useMeasureImageHeight(imageRef, setImageHeight)
  useMeasureImageHeight(mobileImageRef, setMobileImageHeight)

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

  // Calculate stack offsets for alignment
  const stackTranslateY = calculateStackTranslateY(
    activeLayer,
    imageHeight,
    getLayerMargin,
  )
  const mobileStackTranslateY = calculateStackTranslateY(
    activeLayer,
    mobileImageHeight,
    getMobileLayerMargin,
  )

  const progressColors = [
    colors.red,
    colors.orange,
    colors.yellow,
    colors.green,
    colors.aqua,
    colors.blue,
    colors.purple,
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
      layers: content.map((item, index) => ({
        num: index + 1,
        label: item.title,
      })),
      onLayerClick: scrollToLayer,
    })
  }, [showProgressBar, activeLayer, progressPercent, content])

  // Update URL hash based on active layer
  useEffect(() => {
    if (activeLayer > 0 && activeLayer <= content.length) {
      const layerName = content[activeLayer - 1].title.toLowerCase()
      window.history.replaceState(null, '', `#${layerName}`)
    }
    // Don't clear hash when activeLayer is 0 - preserve user's hash for navigation
  }, [activeLayer, content])

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
    // On mobile, add the image gap (20% of viewport) since content can now extend into that area
    const imageGapHeight = isMobile ? window.innerHeight * 0.2 : 0
    // Also account for the fixed nav bar height
    const navHeight =
      document.querySelector('header')?.getBoundingClientRect().height || 0
    // Add mobile-specific height buffer for slides that need extra space
    const currentLayerContent = content[layerNum - 1]
    const contentBuffer = currentLayerContent?.mobileHeightBuffer || 0
    const scrollableHeight =
      content.scrollHeight -
      content.clientHeight +
      imageGapHeight +
      contentBuffer

    if (scrollableHeight > 0) {
      // First 10%: stay at top
      if (slideProgress < CONTENT_SCROLL_BUFFER_START) {
        return 0
      }

      // Last 10%: stay at bottom
      if (slideProgress >= 1 - CONTENT_SCROLL_BUFFER_END) {
        return -scrollableHeight
      }

      // Middle 80%: scroll from top to bottom
      const scrollStart = CONTENT_SCROLL_BUFFER_START
      const scrollEnd = 1 - CONTENT_SCROLL_BUFFER_END
      const scrollProgress = Math.min(
        1,
        (slideProgress - scrollStart) / (scrollEnd - scrollStart),
      )

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
    const hash = window.location.hash.slice(1)
    if (!hash) return

    // Only attempt navigation once images are loaded and container has dimensions
    const isMobile = window.innerWidth < 1024
    const hasImageHeight = isMobile ? mobileImageHeight > 0 : imageHeight > 0
    if (!hasImageHeight) return

    const layerIndex = content.findIndex(
      (item) => item.title.toLowerCase() === hash.toLowerCase(),
    )
    if (layerIndex === -1) return

    const container = containerRef.current
    if (!container) return

    const layerNum = layerIndex + 1
    const sectionSize = 0.99 / content.length
    const targetScrollRatio =
      layerNum === 0
        ? 0
        : 0.01 + ((layerNum - 1) / content.length) * 0.99 + sectionSize * 0.05

    const containerHeight = container.offsetHeight
    const viewportHeight = window.innerHeight
    const scrollableDistance = containerHeight - viewportHeight
    const targetScroll = targetScrollRatio * scrollableDistance
    const containerTop = container.getBoundingClientRect().top + window.scrollY

    // Small delay to ensure layout is stable
    setTimeout(() => {
      window.scrollTo({
        top: containerTop + targetScroll,
        behavior: 'auto',
      })
    }, 100)
  }, [imageHeight, mobileImageHeight, content.length])

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
      <div ref={containerRef} style={{ height: `${SLIDE_HEIGHT}vh` }}>
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
                    transform: `translateY(${mobileStackTranslateY}px)`,
                    transition: 'transform 0.4s ease-in-out',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  {content.map((_item, index) => {
                    const num = index + 1
                    const imageZIndex = 70 - index * 10
                    return (
                      <div
                        key={num}
                        style={{
                          marginTop:
                            num === 1
                              ? 0
                              : `${getMobileLayerMargin(num, activeLayer)}px`,
                          transition: 'margin-top 0.3s ease-in-out',
                        }}
                      >
                        <div
                          style={{
                            paddingLeft: `${MOBILE_IMAGE_PADDING_LEFT}px`,
                            position: 'relative',
                            pointerEvents: 'none',
                            zIndex: imageZIndex,
                          }}
                        >
                          <img
                            ref={num === 1 ? mobileImageRef : null}
                            src={getImagePath(num, false)}
                            alt={`Layer ${num} trace`}
                            style={{
                              width: `${MOBILE_IMAGE_WIDTH}px`,
                              height: 'auto',
                              opacity: activeLayer === num ? 0 : 1,
                              transition: 'opacity 0.5s ease-in-out',
                            }}
                          />
                          <img
                            src={getImagePath(num, true)}
                            alt={`Layer ${num} active`}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: `${MOBILE_IMAGE_PADDING_LEFT}px`,
                              width: `${MOBILE_IMAGE_WIDTH}px`,
                              height: 'auto',
                              opacity: activeLayer === num ? 1 : 0,
                              transition: 'opacity 0.5s ease-in-out',
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Mobile: Spacer for image area */}
              <div style={{ height: '20%' }} />

              {/* Mobile: Content below (80% height) */}
              <div
                style={{
                  height: '80%',
                  position: 'relative',
                  zIndex: 10,
                }}
              >
                {activeLayer > 0 && prevLayerRef.current > 0 && (
                  <div
                    ref={mobileContentRef}
                    style={{
                      height: '100%',
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
                            {content[prevLayerRef.current - 1].title}
                          </h3>
                          <p
                            className="mb-0"
                            style={{ color: colors.text.cream }}
                          >
                            {content[prevLayerRef.current - 1].description}
                          </p>
                        </div>
                        <CodeBlock
                          code={content[prevLayerRef.current - 1].code}
                          filename={`${content[prevLayerRef.current - 1].title.toLowerCase()}.ts`}
                          opacity={contentOpacity}
                        />
                        {content[prevLayerRef.current - 1].images && (
                          <div
                            className="mt-6"
                            style={{
                              backgroundColor: 'rgba(26, 26, 26, 0.5)',
                              padding: '16px',
                              borderRadius: '8px',
                            }}
                          >
                            {content[prevLayerRef.current - 1].imageLabel && (
                              <p
                                className="mb-4 text-sm"
                                style={{ color: colors.text.cream }}
                              >
                                {content[prevLayerRef.current - 1].imageLabel}
                              </p>
                            )}
                            <div
                              className="flex gap-4"
                              style={{
                                display: 'flex',
                                gap: '6rem',
                              }}
                            >
                              {content[prevLayerRef.current - 1].images?.map(
                                (image, index) => (
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
                                ),
                              )}
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
                    transform: `translateX(${activeLayer > 0 ? '0' : '-50%'}) translateY(${stackTranslateY}px)`,
                    transition: 'transform 0.4s ease-in-out',
                  }}
                >
                  {content.map((_item, index) => {
                    const num = index + 1
                    const imageZIndex = 70 - index * 10
                    return (
                      <div
                        key={num}
                        className="flex items-center"
                        style={{
                          marginTop: `${getLayerMargin(num, activeLayer)}px`,
                          transition: 'margin-top 0.3s ease-in-out',
                        }}
                      >
                        <div
                          style={{
                            paddingLeft: `${IMAGE_PADDING_LEFT}px`,
                            position: 'relative',
                            pointerEvents: 'none',
                            zIndex: imageZIndex,
                            width: `${DESKTOP_IMAGE_WIDTH}px`,
                          }}
                        >
                          <img
                            ref={num === 1 ? imageRef : null}
                            src={getImagePath(num, false)}
                            alt={`Layer ${num} trace`}
                            className="block"
                            style={{
                              width: `${DESKTOP_IMAGE_WIDTH}px`,
                              height: 'auto',
                              opacity: activeLayer === num ? 0 : 1,
                              transition: 'opacity 0.5s ease-in-out',
                            }}
                          />
                          <img
                            src={getImagePath(num, true)}
                            alt={`Layer ${num} active`}
                            className="block"
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: `${IMAGE_PADDING_LEFT}px`,
                              width: `${DESKTOP_IMAGE_WIDTH - IMAGE_PADDING_LEFT}px`,
                              height: 'auto',
                              opacity: activeLayer === num ? 1 : 0,
                              transition: 'opacity 0.5s ease-in-out',
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
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
                          className="mb-6"
                          style={{
                            opacity: contentOpacity,
                            transition: 'opacity 0.15s ease-in-out',
                          }}
                        >
                          <h3
                            className="text-2xl font-medium mb-4"
                            style={{ color: colors.text.cream }}
                          >
                            {content[prevLayerRef.current - 1].title}
                          </h3>
                          <p
                            className="mb-0"
                            style={{ color: colors.text.cream }}
                          >
                            {content[prevLayerRef.current - 1].description}
                          </p>
                        </div>
                        <CodeBlock
                          code={content[prevLayerRef.current - 1].code}
                          filename={`${content[prevLayerRef.current - 1].title.toLowerCase()}.ts`}
                          opacity={contentOpacity}
                        />
                        {content[prevLayerRef.current - 1].images && (
                          <div className="mt-6">
                            {content[prevLayerRef.current - 1].imageLabel && (
                              <p
                                className="mb-4 text-sm"
                                style={{ color: colors.text.cream }}
                              >
                                {content[prevLayerRef.current - 1].imageLabel}
                              </p>
                            )}
                            <div
                              className="flex gap-4"
                              style={{
                                display: 'flex',
                                gap: '6rem',
                              }}
                            >
                              {content[prevLayerRef.current - 1].images?.map(
                                (image, index) => (
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
                                ),
                              )}
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

export default ScrollingStack
