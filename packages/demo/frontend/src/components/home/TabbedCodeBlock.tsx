import { useState } from 'react'
import { colors } from '@/constants/colors'
import Code from './Code'
import CopyButton from './CopyButton'
import TerminalHeader from './TerminalHeader'

interface Tab {
  label: string
  code: string
  disabled?: boolean
  disabledMessage?: string
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
  const [hoveredTab, setHoveredTab] = useState<string | null>(null)
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
          const isDisabled = !tab.code || tab.disabled
          return (
            <div key={tabKey} className="relative">
              <button
                onClick={() => !isDisabled && onTabChange(tabKey)}
                onMouseEnter={() => isDisabled && tab.disabledMessage && setHoveredTab(tabKey)}
                onMouseLeave={() => setHoveredTab(null)}
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
              {isDisabled && tab.disabledMessage && hoveredTab === tabKey && (
                <div
                  className="absolute z-10 px-3 py-2 text-sm text-white rounded-md shadow-lg whitespace-nowrap"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginTop: '8px',
                  }}
                >
                  {tab.disabledMessage}
                  <div
                    className="absolute"
                    style={{
                      bottom: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 0,
                      height: 0,
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderBottom: '6px solid rgba(0, 0, 0, 0.9)',
                    }}
                  />
                </div>
              )}
            </div>
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
