import { DynamicEmbeddedWidget } from '@dynamic-labs/sdk-react-core'
import { useState } from 'react'
import { LoginLayout } from './LoginLayout'

/**
 * Login component for Dynamic authentication
 * Displays a simple sign-in screen with the Dynamic login flow
 */
export function LoginWithDynamic() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <LoginLayout
      onSignIn={() => setModalOpen(true)}
      additionalContent={
        modalOpen && (
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
              onClick={() => setModalOpen(false)}
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
                padding: '24px',
                maxWidth: '500px',
                width: '90%',
                maxHeight: '90vh',
                overflow: 'auto',
                boxShadow:
                  '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              }}
            >
              <DynamicEmbeddedWidget background="default" />
            </div>
          </>
        )
      }
    />
  )
}
