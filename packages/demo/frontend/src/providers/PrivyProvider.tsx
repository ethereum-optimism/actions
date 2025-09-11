import type { ReactNode } from 'react'
import { PrivyProvider as BasePrivyProvider } from '@privy-io/react-auth'
import { env } from '../envVars'

// Use Privy for wallet connection
export function PrivyProvider({ children }: { children: ReactNode }) {

  return (
    <BasePrivyProvider
      appId={env.VITE_PRIVY_APP_ID}
      config={{
        loginMethods: ['email'],
        // Configure appearance
        appearance: {
          theme: 'dark',
          accentColor: '#B8BB26',
          logo: undefined,
        },
        // Configure wallet creation
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
          requireUserPasswordOnCreate: false,
        },
      }}
    >
      {children}
    </BasePrivyProvider>
  )
}