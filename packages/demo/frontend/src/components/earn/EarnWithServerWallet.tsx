import { useState, useCallback, useEffect, useMemo } from 'react'
import type { Address } from 'viem'
import Earn from './Earn'
import type { WalletProviderConfig } from '@/constants/walletProviders'
import { actionsApi } from '@/api/actionsApi'
import type { EarnOperations } from '@/hooks/useLendProvider'
import {
  buildBorrowOperations,
  buildLendOperations,
  buildMintOperation,
  buildSwapOperations,
  type AuthHeaders,
} from './serverWalletOperations'

interface EarnWithServerWalletProps {
  ready: boolean
  logout: () => Promise<void>
  getAuthHeaders: () => Promise<AuthHeaders>
  selectedProvider: WalletProviderConfig
}

export function EarnWithServerWallet({
  getAuthHeaders,
  logout,
  selectedProvider,
  ready,
}: EarnWithServerWalletProps) {
  const [walletAddress, setWalletAddress] = useState<Address | null>(null)

  const operations = useMemo<EarnOperations>(
    () => ({
      ...buildLendOperations(getAuthHeaders),
      ...buildSwapOperations(getAuthHeaders),
      mintAsset: buildMintOperation(getAuthHeaders, walletAddress),
    }),
    [getAuthHeaders, walletAddress],
  )
  const borrowOperations = useMemo(
    () => buildBorrowOperations(getAuthHeaders),
    [getAuthHeaders],
  )

  const fetchWalletAddress = useCallback(async () => {
    const { address } = await actionsApi.getWallet(await getAuthHeaders())
    setWalletAddress(address)
  }, [getAuthHeaders])

  useEffect(() => {
    if (ready) fetchWalletAddress()
  }, [ready, fetchWalletAddress])

  return (
    <Earn
      operations={operations}
      ready={ready}
      logout={logout}
      walletAddress={walletAddress}
      providerConfig={selectedProvider}
      logPrefix="[EarnWithServerWallet]"
      borrowOperations={borrowOperations}
    />
  )
}
