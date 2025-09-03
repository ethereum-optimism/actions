import { useAuth, useUser, SignInButton, SignOutButton } from '@clerk/clerk-react'
import { usePrivy } from '@privy-io/react-auth'
import { useEffect } from 'react'

export function ClerkAuthButton() {
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const { ready: privyReady, authenticated: privyAuthenticated, loginWithCustomAuth } = usePrivy()

  useEffect(() => {
    if (isSignedIn && privyReady && !privyAuthenticated) {
      loginWithCustomAuth()
    }
  }, [isSignedIn, privyReady, privyAuthenticated, loginWithCustomAuth])

  if (!clerkLoaded || !privyReady) {
    return (
      <button className="px-4 py-2 text-terminal-green border border-terminal-green opacity-50 cursor-not-allowed">
        Loading...
      </button>
    )
  }

  if (isSignedIn) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-terminal-green">
          {user?.primaryEmailAddress?.emailAddress || user?.id || 'Connected'}
        </span>
        <SignOutButton>
          <button className="px-4 py-2 text-terminal-green border border-terminal-green hover:bg-terminal-green hover:text-terminal-bg transition-colors">
            Logout
          </button>
        </SignOutButton>
      </div>
    )
  }

  return (
    <SignInButton mode="modal">
      <button className="px-4 py-2 text-terminal-green border border-terminal-green hover:bg-terminal-green hover:text-terminal-bg transition-colors">
        Login
      </button>
    </SignInButton>
  )
}