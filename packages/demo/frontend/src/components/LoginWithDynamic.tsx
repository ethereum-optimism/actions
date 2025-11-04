import { ROUTES } from '@/constants/routes'
import {
  DynamicEmbeddedWidget,
  useDynamicContext,
} from '@dynamic-labs/sdk-react-core'
/**
 * Login component for Dynamic authentication
 * Displays a simple sign-in screen with the Dynamic login flow
 */
export function LoginWithDynamic() {
  const { sdkHasLoaded } = useDynamicContext()
  return (
    <>
      <div
        className="min-h-screen"
        style={{
          backgroundColor: '#FFFFFF',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
      >
        {sdkHasLoaded && (
          <>
            {/* Backdrop */}
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                zIndex: 999,
              }}
              onClick={() => (window.location.href = ROUTES.EARN)}
            />

            {/* Widget Container */}
            <div
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 1000,
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                maxWidth: '500px',
                width: '90%',
                maxHeight: '90vh',
                overflow: 'auto',
                boxShadow:
                  '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              }}
            >
              {/* Close button */}
              <button
                onClick={() =>
                  (window.location.href = 'https://actions.money/earn')
                }
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: 'rgba(0, 0, 0, 0.05)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  color: '#666',
                  zIndex: 1,
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)'
                }}
                aria-label="Close"
              >
                ✕
              </button>
              <DynamicEmbeddedWidget background="default" />
            </div>
          </>
        )}
      </div>
    </>
  )
}
