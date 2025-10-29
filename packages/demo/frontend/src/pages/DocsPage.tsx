import NavBar from '@/components/nav/NavBar'
import Footer from '@/components/nav/Footer'
import GettingStarted from '@/components/home/GettingStarted'
import { colors } from '@/constants/colors'

function DocsPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.bg.dark }}>
      <NavBar showDemo={true} visible={true} />

      <main className="max-w-7xl mx-auto px-6 pt-32">
        <div className="max-w-4xl mx-auto mb-8">
          <h2
            className="text-3xl font-medium mb-4"
            style={{ color: colors.text.cream }}
          >
            Docs
          </h2>
          <p
            className="text-sm mb-12"
            style={{ color: '#999', fontStyle: 'italic' }}
          >
            ⚠️ Our full docs are under construction. For now, these code
            snippets offer a high level understanding of the sdk.
          </p>
        </div>

        <GettingStarted />
      </main>

      <Footer />
    </div>
  )
}

export default DocsPage
