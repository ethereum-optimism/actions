import type {
  Wallet,
  ReactProviderTypes,
} from '@eth-optimism/actions-sdk/react'
import { createActions } from '@eth-optimism/actions-sdk/react'
import { useMemo } from 'react'
import Earn from './Earn'
import {
  FRONTEND_HOSTED_WALLET_PROVIDER_CONFIGS,
  WALLET_PROVIDER_CONFIGS,
  type FrontendWalletProviderType,
} from '@/constants/walletProviders'
import { createActionsConfig } from '@/config/actions'
import type { EarnOperations } from '@/hooks/useLendProvider'
import {
  buildFrontendBorrowOperations,
  buildFrontendWalletOperations,
} from './frontendWalletOperations'

export interface EarnWithFrontendWalletProps {
  wallet: Wallet | null
  logout: () => Promise<void>
  selectedProvider: FrontendWalletProviderType
}

function useActions<T extends ReactProviderTypes>(hostedWalletProviderType: T) {
  const config = useMemo(
    () => createActionsConfig(hostedWalletProviderType),
    [hostedWalletProviderType],
  )
  return useMemo(() => createActions(config), [config])
}

/**
 * Wrapper for frontend wallet providers (Dynamic, Turnkey)
 * Builds operations object and delegates to Earn
 */
export function EarnWithFrontendWallet({
  wallet,
  selectedProvider,
  logout,
}: EarnWithFrontendWalletProps) {
  const hostedWalletProviderType =
    FRONTEND_HOSTED_WALLET_PROVIDER_CONFIGS[selectedProvider]
  const actions = useActions(hostedWalletProviderType)

  const operations = useMemo<EarnOperations>(
    () => buildFrontendWalletOperations(wallet!, actions),
    [wallet, actions],
  )
  const borrowOperations = useMemo(
    () => buildFrontendBorrowOperations(wallet!, actions),
    [wallet, actions],
  )

  return (
    <Earn
      operations={operations}
      ready={!!wallet}
      logout={logout}
      walletAddress={wallet?.address || null}
      providerConfig={WALLET_PROVIDER_CONFIGS[selectedProvider]}
      logPrefix="[EarnWithFrontendWallet]"
      borrowOperations={borrowOperations}
    />
  )
}
