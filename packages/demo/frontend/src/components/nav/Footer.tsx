import { colors } from '@/constants/colors'

function Footer() {
  return (
    <footer className="border-t border-gray-800 py-8 text-center text-sm" style={{ color: colors.text.cream }}>
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
  )
}

export default Footer
