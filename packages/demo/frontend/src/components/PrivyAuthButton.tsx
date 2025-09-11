import { useLogin, useLogout, usePrivy, useUser } from '@privy-io/react-auth';

export function PrivyAuthButton() {
  const { ready, authenticated} = usePrivy();
    const { login } = useLogin();
    const { logout } = useLogout();
    const { user } = useUser();

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
          {user?.email?.address || 'Connected'}
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
              logout();
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
        onClick={() => {
          login();
        }}
      >
        Login
      </button>
  )
}