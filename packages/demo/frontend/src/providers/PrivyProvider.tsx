'use client'
import { PrivyProvider as Privy } from '@privy-io/react-auth'
import type { ReactNode } from 'react'

const appId = import.meta.env.VITE_PRIVY_APP_ID

if (!appId) {
  console.warn('VITE_PRIVY_APP_ID is not set. Please add it to your .env file.')
}

export function PrivyProvider({ children }: { children: ReactNode }) {
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
      }}
    >
      {children}
    </Privy>
  )
}