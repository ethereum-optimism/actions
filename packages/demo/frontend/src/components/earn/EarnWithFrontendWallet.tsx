import type {
  Wallet,
  ReactProviderTypes,
} from '@eth-optimism/actions-sdk/react'
import { getBlockExplorerUrl } from '@/utils/blockExplorer'
import Earn from './Earn'
import {
  FRONTEND_HOSTED_WALLET_PROVIDER_CONFIGS,
  WALLET_PROVIDER_CONFIGS,
  type FrontendWalletProviderType,
} from '@/constants/walletProviders'
import { useMemo } from 'react'
import { createActions } from '@eth-optimism/actions-sdk/react'
import { createActionsConfig } from '@/config/actions'
import type { EarnOperations } from '@/hooks/useLendProvider'
import { mintDemoAsset } from '@/utils/demoAssetMinting'

export interface EarnWithFrontendWalletProps {
  wallet: Wallet | null
  logout: () => Promise<void>
  selectedProvider: FrontendWalletProviderType
}

function useActions<T extends ReactProviderTypes>(embeddedWalletProviderType: T) {
  const config = useMemo(
    () => createActionsConfig(embeddedWalletProviderType),
    [embeddedWalletProviderType],
  )
  return useMemo(() => createActions(config), [config])
}

type FrontendWalletOperationsWallet = Pick<Wallet, 'address' | 'getBalance'> & {
  sendBatch: Wallet['sendBatch']
  lend: NonNullable<Wallet['lend']>
  swap: NonNullable<Wallet['swap']>
}

type FrontendWalletOperationsActions = Pick<
  ReturnType<typeof createActions>,
  'getSupportedAssets' | 'lend' | 'swap'
>

export function buildFrontendWalletOperations(
  wallet: FrontendWalletOperationsWallet,
  actions: FrontendWalletOperationsActions,
): EarnOperations {
  return {
    getTokenBalances: async () => wallet.getBalance(),
    getMarkets: async () => actions.lend.getMarkets(),
    getPosition: async (marketId) => wallet.lend!.getPosition({ marketId }),
    mintAsset: async (asset) => mintDemoAsset(wallet, asset),
    openPosition: async (params) => wallet.lend!.openPosition(params),
    closePosition: async (params) => wallet.lend!.closePosition(params),
    executeSwap: async (quote) => {
      const receipt = await wallet.swap!.execute(quote)
      const txReceipt = receipt.receipt
      const blockExplorerUrl = getBlockExplorerUrl(
        quote.chainId,
        txReceipt as Parameters<typeof getBlockExplorerUrl>[1],
      )
      return { blockExplorerUrl }
    },
    getConfiguredAssets: async () => actions.getSupportedAssets(),
    getSwapMarkets: async () => actions.swap.getMarkets(),
    getSwapQuote: async (params) => {
      try {
        const assets = actions.getSupportedAssets()
        const assetIn = assets.find(
          (a) => a.address[params.chainId] === params.tokenInAddress,
        )
        const assetOut = assets.find(
          (a) => a.address[params.chainId] === params.tokenOutAddress,
        )
        if (!assetIn || !assetOut) return null

        return await wallet.swap!.getQuote({
          assetIn,
          assetOut,
          chainId: params.chainId,
          amountIn: params.amountIn,
          amountOut: params.amountOut,
          provider: params.provider,
        })
      } catch {
        return null
      }
    },
  }
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
  const embeddedWalletProviderType =
    FRONTEND_HOSTED_WALLET_PROVIDER_CONFIGS[selectedProvider]
  const actions = useActions(embeddedWalletProviderType)

  const operations = useMemo<EarnOperations>(
    () => buildFrontendWalletOperations(wallet!, actions),
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
    />
  )
}
