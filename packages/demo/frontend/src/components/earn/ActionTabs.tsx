export type ActionType = 'lend' | 'swap'

export interface ActionTabsProps {
  activeTab: ActionType
  onTabChange: (tab: ActionType) => void
}

const TABS: { id: ActionType; label: string }[] = [
  { id: 'lend', label: 'Lend' },
  { id: 'swap', label: 'Swap' },
]

export function ActionTabs({ activeTab, onTabChange }: ActionTabsProps) {
  return (
    <div className="flex" style={{ gap: '32px' }}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          style={{
            padding: '0 0 8px 0',
            border: 'none',
            backgroundColor: 'transparent',
            fontSize: '16px',
            fontWeight: activeTab === tab.id ? 600 : 400,
            color: activeTab === tab.id ? '#1a1b1e' : '#9195A6',
            cursor: 'pointer',
            borderBottom:
              activeTab === tab.id
                ? '3px solid #1a1b1e'
                : '3px solid transparent',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
