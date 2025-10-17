import { useContext } from 'react'
import { ActivityLogContext } from '../contexts/ActivityLogContext'

export function useActivityLog() {
  const context = useContext(ActivityLogContext)
  if (!context) {
    throw new Error('useActivityLog must be used within ActivityLogProvider')
  }
  return context
}
