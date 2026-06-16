/**
 * Frontend-wallet (Turnkey/Dynamic) operation builders: pure factories that
 * adapt an in-browser SDK `Wallet` + `actions` into the `EarnOperations` /
 * `BorrowOperations` shapes the providers consume.
 */

import type {
  BorrowMarketConfig,
  Wallet,
  createActions,
} from '@eth-optimism/actions-sdk/react'
import { getBlockExplorerUrl } from '@/utils/blockExplorer'
import type { EarnOperations } from '@/hooks/useLendProvider'
import type { BorrowOperations } from '@/hooks/useBorrowProvider'
import type {
  BorrowQuoteParams,
  StubCloseParams,
  StubCollateralParams,
  StubOpenParams,
  StubRepayParams,
} from '@/api/borrowApi'
import { isEmptyPosition } from '@/api/borrowApi.serializers'
import {
  AaveETHBorrowUSDCDemo,
  MorphoUSDCBorrowOPDemo,
} from '@/constants/markets'
import { mintDemoAsset } from '@/utils/demoAssetMinting'
import { mintMirrorUsdcDemo, removeMirrorUsdcDemo } from '@/utils/borrowMirror'

export type FrontendWalletOperationsWallet = Pick<
  Wallet,
  'address' | 'getBalance'
> & {
  sendBatch: Wallet['sendBatch']
  lend: NonNullable<Wallet['lend']>
  borrow: NonNullable<Wallet['borrow']>
  swap: NonNullable<Wallet['swap']>
}

export type FrontendWalletOperationsActions = Pick<
  ReturnType<typeof createActions>,
  'getSupportedAssets' | 'lend' | 'borrow' | 'swap'
>

const DEMO_BORROW_MARKETS: readonly BorrowMarketConfig[] = [
  MorphoUSDCBorrowOPDemo,
  AaveETHBorrowUSDCDemo,
]

function resolveBorrowMarketConfig(
  marketId: BorrowQuoteParams['marketId'],
): BorrowMarketConfig {
  const match = DEMO_BORROW_MARKETS.find(
    (m) =>
      m.kind === marketId.kind &&
      m.chainId === marketId.chainId &&
      m.marketId.toLowerCase() === marketId.marketId.toLowerCase(),
  )
  if (match) return match
  throw new Error(`Unsupported borrow market: ${marketId.marketId}`)
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
  const withParams = (
    params:
      | BorrowQuoteParams
      | StubOpenParams
      | StubCloseParams
      | StubCollateralParams
      | StubRepayParams,
  ) => buildWalletBorrowParams(params, wallet.address)
  // Mirror a real Aave borrow/repay as USDC_DEMO (silent, best-effort). The
  // server-wallet path mirrors in the backend; the in-browser wallet does it
  // here. No-op for Morpho or zero-amount receipts.
  const mirror = (
    marketId: BorrowQuoteParams['marketId'],
    receipt: { borrowAmount: bigint },
    settle: typeof mintMirrorUsdcDemo,
  ) => {
    if (marketId.kind === 'aave-v3' && receipt.borrowAmount > 0n) {
      void settle(wallet, receipt.borrowAmount)
    }
  }
  return {
    getTokenBalances: async () => wallet.getBalance(),
    getMarkets: async () => actions.borrow.getMarkets(),
    getPosition: async (_walletAddress, marketId) => {
      const position = await actions.borrow.getPosition({
        marketId,
        walletAddress: wallet.address,
      })
      return isEmptyPosition(position) ? null : position
    },
    getQuote: async (params) => actions.borrow.getQuote(withParams(params)),
    openPosition: async (_walletAddress, params) => {
      const receipt = await wallet.borrow.openPosition(withParams(params))
      mirror(params.marketId, receipt, mintMirrorUsdcDemo)
      return receipt
    },
    closePosition: async (_walletAddress, params) => {
      const receipt = await wallet.borrow.closePosition(withParams(params))
      mirror(params.marketId, receipt, removeMirrorUsdcDemo)
      return receipt
    },
    depositCollateral: async (_walletAddress, params) =>
      wallet.borrow.depositCollateral(withParams(params)),
    withdrawCollateral: async (_walletAddress, params) =>
      wallet.borrow.withdrawCollateral(withParams(params)),
    repay: async (_walletAddress, params) => {
      const receipt = await wallet.borrow.repay(withParams(params))
      mirror(params.marketId, receipt, removeMirrorUsdcDemo)
      return receipt
    },
  }
}
