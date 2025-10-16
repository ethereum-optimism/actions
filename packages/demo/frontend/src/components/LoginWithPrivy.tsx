import { useLogin } from '@privy-io/react-auth'

/**
 * Login component for Privy authentication
 * Displays a simple sign-in screen with the Privy login flow
 */
export function LoginWithPrivy() {
  const { login } = useLogin()

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: '#FFFFFF',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{ height: '100vh' }}
      >
        <div className="max-w-md text-center p-8">
          <div className="mb-6">
            <img
              src="/Optimism.svg"
              alt="Optimism"
              className="h-12 mx-auto mb-4"
            />
            <h1
              className="mb-3"
              style={{
                color: '#1a1b1e',
                fontSize: '28px',
                fontWeight: 600,
              }}
            >
              Welcome to Actions
            </h1>
          </div>

          <button
            onClick={() => login()}
            className="w-full py-3 px-6 font-medium transition-all hover:opacity-90"
            style={{
              backgroundColor: '#FF0420',
              color: '#FFFFFF',
              fontSize: '16px',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  )
}
