import { colors } from '@/constants/colors'
import Code from './Code'
import CopyButton from './CopyButton'
import TerminalHeader from './TerminalHeader'

interface Tab {
  label: string
  code: string
}

interface TabbedCodeBlockProps {
  tabs: Tab[]
  selectedTab: string
  onTabChange: (tab: string) => void
  filename: string
  language?: string
}

function TabbedCodeBlock({
  tabs,
  selectedTab,
  onTabChange,
  filename,
  language = 'typescript',
}: TabbedCodeBlockProps) {
  const currentCode =
    tabs.find((tab) => tab.label.toLowerCase() === selectedTab)?.code || tabs[0].code

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: colors.bg.code,
      }}
    >
      {/* Tab switcher */}
      <div
        className="flex border-b"
        style={{
          borderColor: 'rgba(184, 187, 38, 0.15)',
        }}
      >
        {tabs.map((tab) => {
          const tabKey = tab.label.toLowerCase()
          const isDisabled = !tab.code
          return (
            <button
              key={tabKey}
              onClick={() => !isDisabled && onTabChange(tabKey)}
              disabled={isDisabled}
              className={`px-6 py-3 text-sm font-mono transition-colors border-b-2 ${
                isDisabled ? 'cursor-not-allowed' : ''
              }`}
              style={{
                backgroundColor: colors.bg.header,
                color:
                  selectedTab === tabKey ? colors.text.primary : colors.text.secondary,
                borderColor:
                  selectedTab === tabKey ? 'rgb(184, 187, 38)' : 'transparent',
                opacity: isDisabled ? 0.3 : selectedTab === tabKey ? 1 : 0.6,
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <TerminalHeader filename={filename} />

      <div className="relative">
        <div className="p-4">
          <Code code={currentCode} language={language} />
        </div>
        <CopyButton text={currentCode} />
      </div>
    </div>
  )
}

export default TabbedCodeBlock
