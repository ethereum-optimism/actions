import { useEffect, useRef, useState } from 'react'
import NavBar from '@/components/nav/NavBar'
import Hero from '@/components/home/Hero'
import Overview from '@/components/home/Overview'
import Features from '@/components/home/Features'
import GettingStarted from '@/components/home/GettingStarted'
import Footer from '@/components/nav/Footer'
import { colors } from '@/constants/colors'

function Home() {
  const [showNav, setShowNav] = useState(false)
  const heroRef = useRef<HTMLDivElement>(null)

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

      {/* Disclaimer */}
      <div
        className="max-w-7xl mx-auto px-6 pt-0 pb-8"
        style={{ backgroundColor: colors.bg.dark }}
      >
        <p
          style={{
            fontSize: '12px',
            lineHeight: '1.6',
            color: '#A89B8F',
            textAlign: 'left',
          }}
        >
          This software is provided "as is," without warranty of any kind,
          express or implied, including but not limited to the warranties of
          merchantability, fitness for a particular purpose, and
          noninfringement. In no event shall the authors or copyright holders be
          liable for any claim, damages, or other liability, whether in an
          action of contract, tort, or otherwise, arising from, out of, or in
          connection with the software or the use or other dealings in the
          software.
        </p>
        <p
          style={{
            fontSize: '12px',
            lineHeight: '1.6',
            color: '#A89B8F',
            textAlign: 'left',
            marginTop: '12px',
          }}
        >
          If you publish, deploy, or use this software, you are responsible for
          any regulatory implications related to your activities as it pertains
          to the software, including compliance with any law, rule or regulation
          (collectively, "Law"), including without limitation, any applicable
          sanctions Laws, export control Laws, securities Laws, anti-money
          laundering Laws, or privacy Laws.
        </p>
        <p
          style={{
            fontSize: '12px',
            lineHeight: '1.6',
            color: '#A89B8F',
            textAlign: 'left',
            marginTop: '12px',
          }}
        >
          By using this software, you are subject to Optimism's full{' '}
          <a
            href="https://www.optimism.io/terms"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#A89B8F', textDecoration: 'underline' }}
          >
            Terms of Service
          </a>{' '}
          and the{' '}
          <a
            href="https://www.optimism.io/community-agreement"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#A89B8F', textDecoration: 'underline' }}
          >
            Optimism Community Agreement
          </a>
          .
        </p>
      </div>
    </div>
  )
}

export default Home
