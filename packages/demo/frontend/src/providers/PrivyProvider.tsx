'use client'
import { PrivyProvider as Privy } from '@privy-io/react-auth'
import { useAuth } from '@clerk/clerk-react'
import type { ReactNode } from 'react'
import { useCallback } from 'react'

const appId = import.meta.env.VITE_PRIVY_APP_ID

if (!appId) {
  console.warn('VITE_PRIVY_APP_ID is not set. Please add it to your .env file.')
}

export function PrivyProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth()

  const getCustomAccessToken = useCallback(async () => {
    try {
      const token = await getToken()
      return token || undefined
    } catch {
      return undefined
    }
  }, [getToken])

  return (
    <Privy
      appId={appId || 'placeholder-app-id'}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#00FF41',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        customAuth: {
          enabled: true,
          getCustomAccessToken,
          isLoading: false,
        },
      }}
    >
      {children}
    </Privy>
  )
}