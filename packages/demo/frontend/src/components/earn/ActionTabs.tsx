import { useActivityHighlight } from '@/contexts/ActivityHighlightContext'
import { colors } from '@/constants/colors'

export type ActionType = 'lend' | 'swap' | 'borrow'

export interface ActionTabsProps {
  activeTab: ActionType
  onTabChange: (tab: ActionType) => void
}

const TABS: { id: ActionType; label: string }[] = [
  { id: 'lend', label: 'Lend' },
  { id: 'swap', label: 'Swap' },
  { id: 'borrow', label: 'Borrow' },
]

const LEND_ACTIONS = new Set([
  'deposit',
  'withdraw',
  'getMarket',
  'getPosition',
])
const SWAP_ACTIONS = new Set(['swap', 'getPrice'])
const BORROW_ACTIONS = new Set([
  'borrow',
  'repay',
  'getBorrowMarkets',
  'getBorrowPosition',
])

function actionsForTab(tab: ActionType): Set<string> {
  switch (tab) {
    case 'lend':
      return LEND_ACTIONS
    case 'swap':
      return SWAP_ACTIONS
    case 'borrow':
      return BORROW_ACTIONS
  }
}

function isTabHighlighted(
  tabId: ActionType,
  activeTab: ActionType,
  hoveredAction: string | null,
): boolean {
  if (!hoveredAction || tabId === activeTab) return false
  return actionsForTab(tabId).has(hoveredAction)
}

export function ActionTabs({ activeTab, onTabChange }: ActionTabsProps) {
  const { hoveredAction } = useActivityHighlight()

  return (
    <div className="flex h-full" style={{ gap: '32px', marginBottom: '-1px' }}>
      {TABS.map((tab) => {
        const highlighted = isTabHighlighted(tab.id, activeTab, hoveredAction)
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="transition-all"
            style={{
              padding: '0 4px',
              border: 'none',
              borderBottom:
                activeTab === tab.id
                  ? '3px solid #1a1b1e'
                  : '3px solid transparent',
              backgroundColor: highlighted
                ? colors.highlight.background
                : 'transparent',
              borderRadius: highlighted ? '6px 6px 0 0' : undefined,
              fontSize: '16px',
              fontWeight: activeTab === tab.id ? 600 : 400,
              color:
                activeTab === tab.id
                  ? '#1a1b1e'
                  : highlighted
                    ? colors.highlight.border
                    : '#9195A6',
              cursor: 'pointer',
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
