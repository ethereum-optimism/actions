import NavBar from '@/components/NavBar'
import Hero from '@/components/home/Hero'
import Overview from '@/components/home/Overview'
import Features from '@/components/home/Features'
import GettingStarted from '@/components/home/GettingStarted'
import Footer from '@/components/Footer'
import { colors } from '@/constants/colors'

function Home() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.bg.dark }}>
      <NavBar showDemo={true} />

      <Hero />

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
