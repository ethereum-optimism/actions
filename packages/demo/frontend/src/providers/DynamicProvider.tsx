import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core'

import { EthereumWalletConnectors } from '@dynamic-labs/ethereum'
import { env } from '../envVars'

export function DynamicProvider({ children }: { children: React.ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: env.VITE_DYNAMIC_ENVIRONMENT_ID!,
        walletConnectors: [EthereumWalletConnectors],
      }}
    >
      {children}
    </DynamicContextProvider>
  )
}
