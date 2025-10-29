import { useState, useEffect } from 'react'
import { keccak256, toBytes } from 'viem'
import type { SmartWallet } from '@eth-optimism/actions-sdk/react'
import { useActions } from './useActions'
import {
  AuthState,
  ClientState,
  useTurnkey,
  WalletSource,
  type EmbeddedWallet,
} from '@turnkey/react-wallet-kit'

/**
 * Hook that automatically creates and returns a smart wallet from Turnkey
 * Returns null when wallet is not ready, otherwise returns the SmartWallet instance
 */
export function useTurnkeyWallet() {
  const {
    wallets,
    clientState,
    authState,
    user,
    createWallet,
    refreshWallets,
    httpClient,
    session,
  } = useTurnkey()
  const { actions } = useActions({ hostedWalletProviderType: 'turnkey' })
  const embeddedWallet = wallets.find(
    (wallet) =>
      wallet.accounts.some(
        (account) => account.addressFormat === 'ADDRESS_FORMAT_ETHEREUM',
      ) && wallet.source === WalletSource.Embedded,
  ) as EmbeddedWallet | undefined
  const [smartWallet, setSmartWallet] = useState<SmartWallet | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function createEmbeddedWallet() {
      try {
        await createWallet({
          walletName: `${keccak256(toBytes(user!.userId))}`,
          accounts: ['ADDRESS_FORMAT_ETHEREUM'],
        })
        refreshWallets()
      } catch (err) {
        console.error('Failed to create wallet', err)
      }
    }

    if (
      clientState === ClientState.Ready &&
      authState === AuthState.Authenticated &&
      !embeddedWallet &&
      user
    ) {
      createEmbeddedWallet()
    }
  }, [clientState, authState, user, createWallet, refreshWallets])

  useEffect(() => {
    const createSmartWallet = async () => {
      if (isCreating || smartWallet) {
        return
      }

      try {
        setIsCreating(true)
        setError(null)

        const signer = await actions.wallet.createSigner({
          client: httpClient!,
          organizationId: session!.organizationId,
          signWith: embeddedWallet!.accounts[0].address,
        })
        const result = await actions.wallet.createSmartWallet({
          signer: signer,
        })

        setSmartWallet(result.wallet)
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error('Failed to create wallet'),
        )
        setSmartWallet(null)
      } finally {
        setIsCreating(false)
      }
    }

    if (
      authState === AuthState.Authenticated &&
      embeddedWallet &&
      httpClient &&
      session?.organizationId
    ) {
      createSmartWallet()
    }
  }, [embeddedWallet, actions, isCreating, smartWallet])

  return {
    smartWallet,
    isCreating,
    error,
  }
}
