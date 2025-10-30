import {
  useLogout,
  usePrivy,
  useSessionSigners,
  useUser,
  type WalletWithMetadata,
} from '@privy-io/react-auth'
import { useCallback, useEffect, useMemo } from 'react'

import { LoginWithPrivy } from './LoginWithPrivy'
import { env } from '@/envVars'
import { EarnWithServerWallet } from './EarnWithServerWallet'
import { WALLET_PROVIDER_CONFIGS } from '@/constants/walletProviders'

export function EarnWithPrivyServerWallet() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const { logout } = useLogout()
  const { user } = useUser()
  const { addSessionSigners } = useSessionSigners()

  const ethereumEmbeddedWallets = useMemo<WalletWithMetadata[]>(
    () =>
      (user?.linkedAccounts?.filter(
        (account) =>
          account.type === 'wallet' &&
          account.walletClientType === 'privy' &&
          account.chainType === 'ethereum',
      ) as WalletWithMetadata[]) ?? [],
    [user],
  )

  const addSessionSigner = useCallback(
    async (walletAddress: string) => {
      if (!env.VITE_SESSION_SIGNER_ID) {
        console.error('SESSION_SIGNER_ID must be defined to addSessionSigner')
        return
      }

      try {
        await addSessionSigners({
          address: walletAddress,
          signers: [
            {
              signerId: env.VITE_SESSION_SIGNER_ID,
            },
          ],
        })
      } catch (error) {
        console.error('Error adding session signer:', error)
      }
    },
    [addSessionSigners],
  )

  const getAuthHeaders = useCallback(async () => {
    const token = await getAccessToken()
    return token ? { Authorization: `Bearer ${token}` } : undefined
  }, [getAccessToken])

  // Add session signers for undelegated wallets
  useEffect(() => {
    const undelegatedEthereumEmbeddedWallets = ethereumEmbeddedWallets.filter(
      (wallet) => wallet.delegated !== true,
    )
    undelegatedEthereumEmbeddedWallets.forEach((wallet) => {
      addSessionSigner(wallet.address)
    })
  }, [ethereumEmbeddedWallets, addSessionSigner])

  if (!authenticated) {
    return <LoginWithPrivy />
  }

  return (
    <EarnWithServerWallet
      selectedProvider={WALLET_PROVIDER_CONFIGS.privy}
      userId={user?.id}
      embeddedWalletExists={ethereumEmbeddedWallets.length > 0}
      userEmailAddress={user?.email?.address}
      ready={ready}
      logout={logout}
      getAuthHeaders={getAuthHeaders}
    />
  )
}
