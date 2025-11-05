import {
  useLogout,
  usePrivy,
  useSessionSigners,
  useUser,
  type WalletWithMetadata,
  useIdentityToken,
} from '@privy-io/react-auth'
import { useCallback, useEffect, useMemo, useRef } from 'react'

import { LoginWithPrivy } from './LoginWithPrivy'
import { env } from '@/envVars'
import { EarnWithServerWallet } from './EarnWithServerWallet'
import { WALLET_PROVIDER_CONFIGS } from '@/constants/walletProviders'

export function EarnWithPrivyServerWallet() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const { logout } = useLogout()
  const { user } = useUser()
  const { addSessionSigners } = useSessionSigners()

  // Track wallets that have signers added or are in progress
  const processedWallets = useRef(new Set<string>())

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

  const { identityToken } = useIdentityToken()

  const isReady =
    !!user?.id && ready && ethereumEmbeddedWallets.length > 0 && !!identityToken

  const addSessionSigner = useCallback(
    async (walletAddress: string) => {
      // Skip if already processed or in progress
      if (processedWallets.current.has(walletAddress)) {
        return
      }

      if (!env.VITE_SESSION_SIGNER_ID) {
        console.error('SESSION_SIGNER_ID must be defined to addSessionSigner')
        return
      }

      // Mark as in progress
      processedWallets.current.add(walletAddress)

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
        // Remove from processed set on error so it can be retried
        processedWallets.current.delete(walletAddress)
      }
    },
    [addSessionSigners],
  )

  const getAuthHeaders = useCallback(async () => {
    const token = await getAccessToken()

    return token
      ? { Authorization: `Bearer ${token}`, 'privy-id-token': identityToken }
      : undefined
  }, [getAccessToken, identityToken])

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
      ready={isReady}
      logout={logout}
      getAuthHeaders={getAuthHeaders}
    />
  )
}
