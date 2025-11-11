import { createContext, useContext, useState, type ReactNode } from 'react'

interface ActivityHighlightContextType {
  hoveredAction: string | null
  setHoveredAction: (action: string | null) => void
}

const ActivityHighlightContext = createContext<
  ActivityHighlightContextType | undefined
>(undefined)

export function ActivityHighlightProvider({
  children,
}: {
  children: ReactNode
}) {
  const [hoveredAction, setHoveredAction] = useState<string | null>(null)

  return (
    <ActivityHighlightContext.Provider
      value={{ hoveredAction, setHoveredAction }}
    >
      {children}
    </ActivityHighlightContext.Provider>
  )
}

export function useActivityHighlight() {
  const context = useContext(ActivityHighlightContext)
  if (context === undefined) {
    throw new Error(
      'useActivityHighlight must be used within ActivityHighlightProvider',
    )
  }
  return context
}
