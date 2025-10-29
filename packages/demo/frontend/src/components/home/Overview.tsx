import { ScrollyProvider } from 'react-scrolly-telling'
import { colors } from '@/constants/colors'
import ScrollingStack from './ScrollingStack'
import type { ScrollingStackProps } from './ScrollingStack'

interface OverviewProps {
  onProgressUpdate: ScrollingStackProps['onProgressUpdate']
}

function Overview({ onProgressUpdate }: OverviewProps) {
  return (
    <ScrollyProvider>
      <div className="py-16">
        <div className="max-w-4xl mx-auto mb-8">
          <h2
            className="text-3xl font-medium mb-4"
            style={{ color: colors.text.cream }}
          >
            Overview
          </h2>
          <div className="h-px bg-gradient-to-r from-gray-600 via-gray-500 to-transparent mb-4"></div>
          <p className="mb-32" style={{ color: colors.text.cream }}>
            Actions is an open source TypeScript SDK for letting your users
            easily perform onchain actions: <strong>Lend</strong>,{' '}
            <strong>Borrow</strong>, <strong>Swap</strong>, <strong>Pay</strong>
            , without managing complex infrastructure or custody.
            <br />
            <br />
            Integrate DeFi with a single dependency.
          </p>
        </div>

        {/* Scrolly-telling stack section */}
        <ScrollingStack onProgressUpdate={onProgressUpdate} />
      </div>
    </ScrollyProvider>
  )
}

export default Overview
