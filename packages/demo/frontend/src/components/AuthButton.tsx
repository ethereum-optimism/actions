import { usePrivy } from '@privy-io/react-auth'

export function AuthButton() {
  const { ready, authenticated, login, logout, user } = usePrivy()

  if (!ready) {
    return (
      <button className="px-4 py-2 text-terminal-green border border-terminal-green opacity-50 cursor-not-allowed">
        Loading...
      </button>
    )
  }

  if (authenticated) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-terminal-green">
          {user?.email?.address || user?.wallet?.address || 'Connected'}
        </span>
        <button
          onClick={logout}
          className="px-4 py-2 text-terminal-green border border-terminal-green hover:bg-terminal-green hover:text-terminal-bg transition-colors"
        >
          Logout
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={login}
      className="px-4 py-2 text-terminal-green border border-terminal-green hover:bg-terminal-green hover:text-terminal-bg transition-colors"
    >
      Login
    </button>
  )
}