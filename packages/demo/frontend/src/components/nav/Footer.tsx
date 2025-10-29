import { colors } from '@/constants/colors'

function Footer() {
  return (
    <>
      <footer
        className="border-t border-gray-800 py-8 text-center text-sm"
        style={{ color: colors.text.cream }}
      >
        <div className="max-w-7xl mx-auto px-6">
          <p>
            © 2025 Actions by{' '}
            <a
              href="https://www.optimism.io/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: colors.actionsRed, fontWeight: 'bold' }}
              className="hover:opacity-80"
            >
              Optimism
            </a>
            . Open source. MIT License.
          </p>
        </div>
      </footer>

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
    </>
  )
}

export default Footer
