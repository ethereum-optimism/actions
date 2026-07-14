import { createContext, useContext, type ReactNode } from 'react'
import type { ActionType } from '@/components/earn/ActionTabs'

/**
 * Generic tab-switcher context.
 *
 * Lets any descendant of `<TabSwitcherProvider>` change the active
 * Earn tab without prop-drilling individual callbacks. Consumers call
 * `useTabSwitcher().setActiveTab(tab)` to navigate.
 *
 * Defaulted to a no-op so it's safe to call from contexts that aren't
 * wrapped (e.g. component tests). The provider is mounted once at the
 * Earn shell level.
 */
export interface TabSwitcherContextValue {
  setActiveTab: (tab: ActionType) => void
}

const NOOP_TAB_SWITCHER: TabSwitcherContextValue = {
  setActiveTab: () => {},
}

const TabSwitcherContext =
  createContext<TabSwitcherContextValue>(NOOP_TAB_SWITCHER)

export function TabSwitcherProvider({
  setActiveTab,
  children,
}: {
  setActiveTab: (tab: ActionType) => void
  children: ReactNode
}) {
  return (
    <TabSwitcherContext.Provider value={{ setActiveTab }}>
      {children}
    </TabSwitcherContext.Provider>
  )
}

export function useTabSwitcher(): TabSwitcherContextValue {
  return useContext(TabSwitcherContext)
}
