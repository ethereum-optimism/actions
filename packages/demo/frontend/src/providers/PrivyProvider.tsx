import type { ReactNode } from 'react'

// Since we're using Clerk for frontend auth, this provider is now just a passthrough
// The backend will still use Privy for wallet management via authorization keys
export function PrivyProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}