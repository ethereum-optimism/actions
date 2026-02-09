export type ActionType = 'lend' | 'borrow' | 'swap' | 'pay'

export interface ActionTabsProps {
  activeTab: ActionType
  onTabChange: (tab: ActionType) => void
}

const TABS: { id: ActionType; label: string; enabled: boolean }[] = [
  { id: 'lend', label: 'Lend', enabled: true },
  { id: 'borrow', label: 'Borrow', enabled: false },
  { id: 'swap', label: 'Swap', enabled: true },
  { id: 'pay', label: 'Pay', enabled: false },
]

export function ActionTabs({ activeTab, onTabChange }: ActionTabsProps) {
  return (
    <div className="flex gap-2 mb-6">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => tab.enabled && onTabChange(tab.id)}
          disabled={!tab.enabled}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid #E0E2EB',
            fontSize: '14px',
            fontWeight: 500,
            cursor: tab.enabled ? 'pointer' : 'not-allowed',
            backgroundColor:
              activeTab === tab.id
                ? '#FF0420'
                : tab.enabled
                  ? '#FFFFFF'
                  : '#F9FAFB',
            color:
              activeTab === tab.id
                ? '#FFFFFF'
                : tab.enabled
                  ? '#1a1b1e'
                  : '#9CA3AF',
            transition: 'all 0.2s ease',
          }}
          title={!tab.enabled ? 'Coming Soon' : undefined}
        >
          {tab.label}
          {!tab.enabled && (
            <span className="ml-1 text-xs" style={{ opacity: 0.6 }}>
              (Soon)
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
