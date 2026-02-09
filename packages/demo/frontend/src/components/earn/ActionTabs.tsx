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
    <div className="flex items-center gap-6">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          style={{
            padding: '4px 0',
            border: 'none',
            borderBottom:
              activeTab === tab.id ? '2px solid #1a1b1e' : '2px solid transparent',
            fontSize: '16px',
            fontWeight: activeTab === tab.id ? 600 : 400,
            cursor: 'pointer',
            backgroundColor: 'transparent',
            color: activeTab === tab.id ? '#1a1b1e' : '#9195A6',
            transition: 'all 0.2s ease',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
