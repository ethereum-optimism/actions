import { useEffect, useRef, useState } from 'react'
import NavBar from '@/components/nav/NavBar'
import Hero from '@/components/home/Hero'
import Overview from '@/components/home/Overview'
import Footer from '@/components/nav/Footer'
import TakeActions from '@/components/home/TakeActions'
import { colors } from '@/constants/colors'

function Home() {
  const [showNav, setShowNav] = useState(false)
  const heroRef = useRef<HTMLDivElement>(null)
  const [progressBarData, setProgressBarData] = useState<{
    show: boolean
    activeLayer: number
    progressPercent: number
    progressColors: string[]
    layers: { num: number; label: string }[]
    onLayerClick: (layerNum: number) => void
  } | null>(null)

  useEffect(() => {
    // used to show/hide the navbar when scrolling
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowNav(!entry.isIntersecting)
      },
      { threshold: 0 },
    )

    if (heroRef.current) {
      observer.observe(heroRef.current)
    }

    return () => {
      if (heroRef.current) {
        observer.unobserve(heroRef.current)
      }
    }
  }, [])

  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.bg.dark }}>
      <NavBar
        showDemo={true}
        visible={showNav}
        progressBar={progressBarData || undefined}
      />

      <div ref={heroRef}>
        <Hero />
      </div>

      <main className="max-w-7xl mx-auto px-6">
        <Overview onProgressUpdate={setProgressBarData} />

        <TakeActions />
      </main>

      <Footer />
    </div>
  )
}

export default Home
