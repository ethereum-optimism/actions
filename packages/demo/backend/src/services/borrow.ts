import type {
  BorrowClosePositionParams,
  BorrowDepositCollateralParams,
  BorrowMarket,
  BorrowMarketConfig,
  BorrowMarketId,
  BorrowOpenPositionParams,
  BorrowQuote,
  BorrowReceipt,
  BorrowRepayParams,
  BorrowWithdrawCollateralParams,
  GetBorrowMarketsParams,
} from '@eth-optimism/actions-sdk'
import { MarketNotAllowedError } from '@eth-optimism/actions-sdk'

import { getActions } from '@/config/actions.js'
import { ALL_BORROW_MARKETS } from '@/config/markets.js'
import { getWallet } from '@/services/wallet.js'

/**
 * Resolve a `BorrowMarketId` (from a request body) to its
 * `BorrowMarketConfig` in the backend allowlist. Used by mutations whose
 * SDK signature requires the full config rather than just the id.
 */
export function resolveMarketConfig(
  marketId: BorrowMarketId,
): BorrowMarketConfig {
  const config = ALL_BORROW_MARKETS.find(
    (m) =>
      m.kind === marketId.kind &&
      m.chainId === marketId.chainId &&
      m.marketId.toLowerCase() === marketId.marketId.toLowerCase(),
  )
  if (!config) {
    throw new MarketNotAllowedError({
      address: marketId.marketId,
      chainId: marketId.chainId,
      reason: 'Market not in backend allowlist',
    })
  }
  return config
}

export async function getMarkets(
  params: GetBorrowMarketsParams = {},
): Promise<BorrowMarket[]> {
  const actions = getActions()
  return await actions.borrow.getMarkets(params)
}

// ---------- Mutations ----------

async function resolveWalletOrThrow(idToken: string) {
  const wallet = await getWallet(idToken)
  if (!wallet) {
    throw new Error('Wallet not found')
  }
  if (!wallet.borrow) {
    throw new Error('Borrow functionality not configured for this wallet')
  }
  return wallet
}

export type BorrowOpenServiceInput =
  | ({ idToken: string } & Omit<BorrowOpenPositionParams, 'market'> & {
        marketId: BorrowMarketId
      })
  | { idToken: string; quote: BorrowQuote }

export async function openPosition(
  input: BorrowOpenServiceInput,
): Promise<BorrowReceipt> {
  const wallet = await resolveWalletOrThrow(input.idToken)
  if ('quote' in input) {
    return await wallet.borrow!.openPosition(input.quote)
  }
  const { idToken: _ignored, marketId, ...rest } = input
  const params: BorrowOpenPositionParams = {
    ...rest,
    market: resolveMarketConfig(marketId),
  }
  return await wallet.borrow!.openPosition(params)
}

export type BorrowCloseServiceInput =
  | ({ idToken: string } & Omit<BorrowClosePositionParams, 'market'> & {
        marketId: BorrowMarketId
      })
  | { idToken: string; quote: BorrowQuote }

export async function closePosition(
  input: BorrowCloseServiceInput,
): Promise<BorrowReceipt> {
  const wallet = await resolveWalletOrThrow(input.idToken)
  if ('quote' in input) {
    return await wallet.borrow!.closePosition(input.quote)
  }
  const { idToken: _ignored, marketId, ...rest } = input
  const params: BorrowClosePositionParams = {
    ...rest,
    market: resolveMarketConfig(marketId),
  }
  return await wallet.borrow!.closePosition(params)
}

export type BorrowDepositCollateralServiceInput =
  | ({ idToken: string } & Omit<BorrowDepositCollateralParams, 'market'> & {
        marketId: BorrowMarketId
      })
  | { idToken: string; quote: BorrowQuote }

export async function depositCollateral(
  input: BorrowDepositCollateralServiceInput,
): Promise<BorrowReceipt> {
  const wallet = await resolveWalletOrThrow(input.idToken)
  if ('quote' in input) {
    return await wallet.borrow!.depositCollateral(input.quote)
  }
  const { idToken: _ignored, marketId, ...rest } = input
  const params: BorrowDepositCollateralParams = {
    ...rest,
    market: resolveMarketConfig(marketId),
  }
  return await wallet.borrow!.depositCollateral(params)
}

export type BorrowWithdrawCollateralServiceInput =
  | ({ idToken: string } & Omit<BorrowWithdrawCollateralParams, 'market'> & {
        marketId: BorrowMarketId
      })
  | { idToken: string; quote: BorrowQuote }

export async function withdrawCollateral(
  input: BorrowWithdrawCollateralServiceInput,
): Promise<BorrowReceipt> {
  const wallet = await resolveWalletOrThrow(input.idToken)
  if ('quote' in input) {
    return await wallet.borrow!.withdrawCollateral(input.quote)
  }
  const { idToken: _ignored, marketId, ...rest } = input
  const params: BorrowWithdrawCollateralParams = {
    ...rest,
    market: resolveMarketConfig(marketId),
  }
  return await wallet.borrow!.withdrawCollateral(params)
}

export type BorrowRepayServiceInput =
  | ({ idToken: string } & Omit<BorrowRepayParams, 'market'> & {
        marketId: BorrowMarketId
      })
  | { idToken: string; quote: BorrowQuote }

export async function repay(
  input: BorrowRepayServiceInput,
): Promise<BorrowReceipt> {
  const wallet = await resolveWalletOrThrow(input.idToken)
  if ('quote' in input) {
    return await wallet.borrow!.repay(input.quote)
  }
  const { idToken: _ignored, marketId, ...rest } = input
  const params: BorrowRepayParams = {
    ...rest,
    market: resolveMarketConfig(marketId),
  }
  return await wallet.borrow!.repay(params)
}
