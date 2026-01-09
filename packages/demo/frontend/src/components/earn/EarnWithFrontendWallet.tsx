import { encodeFunctionData, type Address } from 'viem'
import type {
  Wallet,
  SupportedChainId,
  Asset,
  ReactProviderTypes,
} from '@eth-optimism/actions-sdk/react'
import { mintableErc20Abi } from '@/abis/mintableErc20Abi'
import Earn from './Earn'
import {
  FRONTEND_HOSTED_WALLET_PROVIDER_CONFIGS,
  WALLET_PROVIDER_CONFIGS,
  type FrontendWalletProviderType,
} from '@/constants/walletProviders'
import { useMemo } from 'react'
import { createActions } from '@eth-optimism/actions-sdk/react'
import { createActionsConfig } from '@/config/actions'
import { actionsApi } from '@/api/actionsApi'
import type { LendProviderOperations } from '@/hooks/useLendProvider'

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

  const operations = useMemo<LendProviderOperations>(
    () => ({
      getTokenBalances: async () => wallet!.getBalance(),
      getMarkets: async () => actions.lend.getMarkets(),
      getPosition: async (marketId) => wallet!.lend!.getPosition({ marketId }),
      mintAsset: async (asset: Asset) => {
        const walletAddress = wallet!.address
        const chainId = asset.address
          ? Object.keys(asset.address).find(
              (key) => asset.address[key as unknown as SupportedChainId],
            )
          : undefined

        if (!chainId) throw new Error('No chain available for asset')

        if (asset.metadata.symbol.includes('WETH')) {
          await actionsApi.dripEthToWallet(walletAddress)
          return
        }

        const amountInDecimals = BigInt(
          Math.floor(parseFloat('100') * Math.pow(10, asset.metadata.decimals)),
        )
        const tokenAddress =
          asset.address[parseInt(chainId) as SupportedChainId]

        if (!tokenAddress || tokenAddress === 'native') {
          throw new Error(
            `Asset ${asset.metadata.symbol} not available on chain ${chainId}`,
          )
        }

        const result = await wallet!.sendBatch(
          [
            {
              to: tokenAddress as Address,
              data: encodeFunctionData({
                abi: mintableErc20Abi,
                functionName: 'mint',
                args: [walletAddress, amountInDecimals],
              }),
              value: 0n,
            },
          ],
          parseInt(chainId) as SupportedChainId,
        )

        if ('blockExplorerUrl' in result && result.blockExplorerUrl) {
          return { blockExplorerUrls: [result.blockExplorerUrl as string] }
        }
        if ('blockExplorerUrls' in result && result.blockExplorerUrls) {
          return { blockExplorerUrls: result.blockExplorerUrls as string[] }
        }
      },
      openPosition: async (params) => wallet!.lend!.openPosition(params),
      closePosition: async (params) => wallet!.lend!.closePosition(params),
    }),
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
