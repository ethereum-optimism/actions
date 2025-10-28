import { useEffect, useRef, useState } from 'react'
import NavBar from '@/components/nav/NavBar'
import Hero from '@/components/home/Hero'
import Overview from '@/components/home/Overview'
import Footer from '@/components/nav/Footer'
import { colors } from '@/constants/colors'
import { DocumentIcon, TerminalIcon } from '@/assets/icons'

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

        {/* CTA Section */}
        <div className="pt-8 pb-24 text-center">
          <h3
            className="text-2xl font-medium mb-6"
            style={{ color: colors.text.cream }}
          >
            Ready to take Action?
          </h3>
          <div className="flex flex-row gap-4 justify-center">
            <a
              href="/earn"
              className="text-black px-8 py-3 rounded-lg font-medium inline-flex items-center justify-center gap-2 transition-colors duration-200"
              style={{ backgroundColor: colors.text.cream }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = '#E5E5CC')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = colors.text.cream)
              }
            >
              <TerminalIcon className="w-5 h-5" />
              Demo
            </a>
            <a
              href="/docs"
              className="border border-gray-600 px-8 py-3 rounded-lg font-medium hover:bg-gray-700 inline-flex items-center justify-center gap-2 transition-colors duration-200"
              style={{ color: colors.text.cream }}
            >
              <DocumentIcon className="w-5 h-5" />
              Docs
            </a>
          </div>
        </div>
      </main>

      <Footer />

      {/* Disclaimer */}
      <div
        className="max-w-7xl mx-auto px-6 pt-0 pb-8"
        style={{ backgroundColor: colors.bg.dark }}
      >
        <p
          style={{
            fontSize: '10px',
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
          connection with the software.
        </p>
        <p
          style={{
            fontSize: '10px',
            lineHeight: '1.6',
            color: '#A89B8F',
            textAlign: 'left',
            marginTop: '12px',
          }}
        >
          You are responsible for any regulatory implications related to your
          activities as it pertains to the software, including compliance with
          any law, rule or regulation (collectively, "Law"), including without
          limitation, any applicable economic sanctions Laws, export control
          Laws, securities Laws, anti-money laundering Laws, or privacy Laws. By
          using this software, you are subject to Optimism's full{' '}
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
