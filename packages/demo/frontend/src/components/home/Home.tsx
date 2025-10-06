import { useEffect, useRef, useState } from 'react'
import NavBar from '@/components/NavBar'
import Hero from '@/components/home/Hero'
import Overview from '@/components/home/Overview'
import Features from '@/components/home/Features'
import GettingStarted from '@/components/home/GettingStarted'
import Footer from '@/components/Footer'
import { colors } from '@/constants/colors'

function Home() {
  const [showNav, setShowNav] = useState(false)
  const heroRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowNav(!entry.isIntersecting)
      },
      { threshold: 0 }
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
      <NavBar showDemo={true} visible={showNav} />

      <div ref={heroRef}>
        <Hero />
      </div>

      <main className="max-w-7xl mx-auto px-6">
        <Overview />

        <Features />

        <GettingStarted />
      </main>

      <Footer />
    </div>
  )
}

export default Home
