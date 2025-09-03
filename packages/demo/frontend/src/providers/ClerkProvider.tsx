import { ClerkProvider as Clerk } from '@clerk/clerk-react'
import type { ReactNode } from 'react'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!publishableKey) {
  console.warn('VITE_CLERK_PUBLISHABLE_KEY is not set. Please add it to your .env file.')
}

export function ClerkProvider({ children }: { children: ReactNode }) {
  return (
    <Clerk 
      publishableKey={publishableKey || ''} 
      appearance={{
        baseTheme: undefined,
        variables: {
          colorPrimary: '#00FF41',
          colorBackground: '#000000',
          colorText: '#00FF41',
        },
      }}
    >
      {children}
    </Clerk>
  )
}