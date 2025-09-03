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

  const getExternalJwt = useCallback(async () => {
    const token = await getToken()
    if (!token) {
      throw new Error('No Clerk JWT token available')
    }
    return token
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
          getExternalJwt,
          isLoading: false,
        },
      }}
    >
      {children}
    </Privy>
  )
}