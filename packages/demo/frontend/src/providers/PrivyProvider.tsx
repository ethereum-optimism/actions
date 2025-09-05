import type { ReactNode } from 'react'
import { PrivyProvider as BasePrivyProvider } from '@privy-io/react-auth'
import { useAuth, useUser } from '@clerk/clerk-react'
import { env } from '../envVars'

// Use Privy for wallet connection while Clerk handles authentication
export function PrivyProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth()
  const { user } = useUser()

  return (
    <BasePrivyProvider
      appId={env.VITE_PRIVY_APP_ID}
      config={{
        // Enable custom auth with Clerk JWT, plus email as fallback
        loginMethods: ['email', 'wallet'],
        customAuth: {
          enabled: true,
          getCustomAccessToken: async () => {
            try {
              const token = await getToken()
              return token
            } catch (error) {
              return null
            }
          },
          isAuthenticatedInCustomAuthSystem: () => {
            return !!user?.id
          },
        },
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
        externalWallets: {
          coinbaseWallet: { connectionOptions: 'all' },
          metamask: { connectionOptions: 'all' },
          walletConnect: { connectionOptions: 'all' },
        },
      }}
    >
      {children}
    </BasePrivyProvider>
  )
}