import { useAuth, useUser, SignInButton, SignOutButton } from '@clerk/clerk-react'

export function ClerkAuthButton() {
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth()
  const { user } = useUser()

  if (!clerkLoaded) {
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
        <SignOutButton redirectUrl="/demo">
          <button 
            className="px-4 py-2 border border-terminal-green transition-colors" 
            style={{
              color: '#B8BB26',
              backgroundColor: 'transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#B8BB26'
              e.currentTarget.style.color = '#1D2021'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = '#B8BB26'
            }}
          >
            Logout
          </button>
        </SignOutButton>
      </div>
    )
  }

  return (
    <SignInButton mode="modal">
      <button 
        className="px-4 py-2 border border-terminal-green transition-colors"
        style={{
          color: '#B8BB26',
          backgroundColor: 'transparent',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#B8BB26'
          e.currentTarget.style.color = '#1D2021'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.color = '#B8BB26'
        }}
      >
        Login
      </button>
    </SignInButton>
  )
}