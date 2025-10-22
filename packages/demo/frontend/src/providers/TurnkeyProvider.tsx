import {
  TurnkeyProvider as BaseTurnkeyProvider,
  type TurnkeyProviderConfig,
} from '@turnkey/react-wallet-kit'
import '@turnkey/react-wallet-kit/styles.css'
import { env } from '../envVars'

const turnkeyConfig: TurnkeyProviderConfig = {
  organizationId: env.VITE_TURNKEY_ORGANIZATION_ID,
  authProxyConfigId: env.VITE_TURNKEY_AUTH_ID,
}

export function TurnkeyProvider({ children }: { children: React.ReactNode }) {
  return (
    <BaseTurnkeyProvider
      config={turnkeyConfig}
      callbacks={{
        onError: (error) => console.error('Turnkey error:', error),
      }}
    >
      {children}
    </BaseTurnkeyProvider>
  )
}
