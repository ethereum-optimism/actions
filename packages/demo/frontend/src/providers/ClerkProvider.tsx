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
      afterSignInUrl="/demo"
      afterSignUpUrl="/demo"
      afterSignOutUrl="/demo"
      appearance={{
        variables: {
          colorPrimary: '#B8BB26',
          colorBackground: '#1D2021',
          colorInputBackground: '#282828',
          colorInputText: '#B8BB26',
          colorText: '#B8BB26',
          colorTextSecondary: '#928374',
          colorNeutral: '#504945',
          colorDanger: '#FB4934',
          colorSuccess: '#B8BB26',
          colorWarning: '#FABD2F',
          borderRadius: '0.5rem',
        },
        elements: {
          formButtonPrimary: {
            backgroundColor: '#B8BB26',
            color: '#1D2021',
            fontWeight: '600',
            '&:hover, &:focus, &:active': {
              backgroundColor: '#A6A825',
              color: '#1D2021',
            },
          },
          card: {
            backgroundColor: '#1D2021',
            border: '1px solid #504945',
          },
          headerTitle: {
            color: '#B8BB26',
          },
          headerSubtitle: {
            color: '#928374',
          },
          socialButtonsBlockButton: {
            backgroundColor: '#282828',
            border: '1px solid #504945',
            color: '#B8BB26',
            '&:hover': {
              backgroundColor: '#3C3836',
            },
          },
          dividerLine: {
            backgroundColor: '#504945',
          },
          dividerText: {
            color: '#928374',
          },
          formFieldInput: {
            backgroundColor: '#282828',
            border: '1px solid #504945',
            color: '#B8BB26',
            '&:focus': {
              borderColor: '#B8BB26',
            },
          },
          formFieldLabel: {
            color: '#B8BB26',
          },
          footerActionLink: {
            color: '#B8BB26',
            '&:hover': {
              color: '#A6A825',
            },
          },
          footerActionText: {
            color: '#928374',
          },
        },
      }}
    >
      {children}
    </Clerk>
  )
}