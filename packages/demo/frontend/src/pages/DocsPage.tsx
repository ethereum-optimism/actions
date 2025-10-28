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
            Our full docs are under construction. For now, these code snippets
            offer a high level understanding of the sdk.
          </p>
        </div>

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

export default DocsPage
