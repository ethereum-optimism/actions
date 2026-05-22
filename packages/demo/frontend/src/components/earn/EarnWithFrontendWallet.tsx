import type {
  BorrowMarketConfig,
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
import type { BorrowOperations } from '@/hooks/useBorrowProvider'
import type {
  BorrowQuoteParams,
  StubCloseParams,
  StubCollateralParams,
  StubOpenParams,
  StubRepayParams,
} from '@/api/borrowApi'
import { ALL_BORROW_MARKETS, MorphoBorrowDemo } from '@/constants/markets'
import { mintDemoAsset } from '@/utils/demoAssetMinting'

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

type FrontendWalletOperationsWallet = Pick<Wallet, 'address' | 'getBalance'> & {
  sendBatch: Wallet['sendBatch']
  lend: NonNullable<Wallet['lend']>
  borrow: NonNullable<Wallet['borrow']>
  swap: NonNullable<Wallet['swap']>
}

type FrontendWalletOperationsActions = Pick<
  ReturnType<typeof createActions>,
  'getSupportedAssets' | 'lend' | 'borrow' | 'swap'
>

function resolveBorrowMarketConfig(
  marketId: BorrowQuoteParams['marketId'],
): BorrowMarketConfig {
  const marketConfigs = ALL_BORROW_MARKETS?.length
    ? ALL_BORROW_MARKETS
    : [MorphoBorrowDemo]
  const config = marketConfigs.find(
    (market) =>
      market.kind === marketId.kind &&
      market.chainId === marketId.chainId &&
      market.marketId.toLowerCase() === marketId.marketId.toLowerCase(),
  )
  if (!config) {
    throw new Error(`Unsupported borrow market: ${marketId.marketId}`)
  }
  return config
}

function buildWalletBorrowParams(
  params:
    | BorrowQuoteParams
    | StubOpenParams
    | StubCloseParams
    | StubCollateralParams
    | StubRepayParams,
  walletAddress: Wallet['address'],
) {
  const market = resolveBorrowMarketConfig(params.marketId)
  return {
    ...params,
    market,
    walletAddress,
  }
}

function isEmptyBorrowPosition(
  position: Awaited<
    ReturnType<FrontendWalletOperationsWallet['borrow']['getPosition']>
  >,
): boolean {
  return position.collateralAmount === 0n && position.borrowAmount === 0n
}

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

export function buildFrontendBorrowOperations(
  wallet: FrontendWalletOperationsWallet,
  actions: FrontendWalletOperationsActions,
): BorrowOperations {
  return {
    getMarkets: async () => actions.borrow.getMarkets(),
    getPosition: async (_walletAddress, marketId) => {
      const position = await actions.borrow.getPosition({
        marketId,
        walletAddress: wallet.address,
      })
      return isEmptyBorrowPosition(position) ? null : position
    },
    getQuote: async (params) =>
      actions.borrow.getQuote(buildWalletBorrowParams(params, wallet.address)),
    openPosition: async (_walletAddress, params) =>
      wallet.borrow.openPosition(
        buildWalletBorrowParams(params, wallet.address),
      ),
    closePosition: async (_walletAddress, params) =>
      wallet.borrow.closePosition(
        buildWalletBorrowParams(params, wallet.address),
      ),
    depositCollateral: async (_walletAddress, params) =>
      wallet.borrow.depositCollateral(
        buildWalletBorrowParams(params, wallet.address),
      ),
    withdrawCollateral: async (_walletAddress, params) =>
      wallet.borrow.withdrawCollateral(
        buildWalletBorrowParams(params, wallet.address),
      ),
    repay: async (_walletAddress, params) =>
      wallet.borrow.repay(buildWalletBorrowParams(params, wallet.address)),
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
