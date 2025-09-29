import { useTurnkey, AuthState } from "@turnkey/react-wallet-kit";

export function TurnkeyAuthButton() {
  const { authState, user, handleLogin, logout } = useTurnkey();

  if (authState === AuthState.Authenticated) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-terminal-green">
          {user?.userEmail || 'Connected'}
        </span>
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
          onClick={() => {
            logout()
          }}
        >
          Logout
        </button>
      </div>
    )
  }

  return (
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
      onClick={handleLogin}
    >
      Login
    </button>
  )
}
