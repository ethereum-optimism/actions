import type {
  BorrowClosePositionParams,
  BorrowDepositCollateralParams,
  BorrowMarket,
  BorrowMarketConfig,
  BorrowMarketId,
  BorrowOpenPositionParams,
  BorrowPrice,
  BorrowQuote,
  BorrowQuoteParams,
  BorrowReceipt,
  BorrowRepayParams,
  BorrowWithdrawCollateralParams,
  GetBorrowMarketsParams,
  SmartWallet,
  SupportedChainId,
} from '@eth-optimism/actions-sdk'
import {
  MarketNotAllowedError,
  ProviderNotConfiguredError,
} from '@eth-optimism/actions-sdk'

import { getActions } from '@/config/actions.js'
import { ALL_BORROW_MARKETS } from '@/config/markets.js'
import { WalletNotFoundError } from '@/helpers/errors.js'
import { getWallet } from '@/services/wallet.js'
import { getBlockExplorerUrls } from '@/utils/explorers.js'

export type BorrowReceiptWithUrls = BorrowReceipt & {
  blockExplorerUrls: string[]
}

type BorrowEnabledWallet = SmartWallet & {
  borrow: NonNullable<SmartWallet['borrow']>
}

function decorateReceipt(
  receipt: BorrowReceipt,
  chainId: SupportedChainId,
): BorrowReceiptWithUrls {
  const blockExplorerUrls = getBlockExplorerUrls({
    chainId,
    userOpHash: receipt.userOpHash,
    transactionHash: receipt.transactionHash,
    transactionHashes: receipt.transactionHashes,
  })
  return { ...receipt, blockExplorerUrls }
}

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

// ---------- /borrow/price + /borrow/quote (read-only quote build) ----------

/**
 * Backend-shaped input that the controller passes to `getQuote` / `getPrice`.
 * `marketId` is resolved to a full `BorrowMarketConfig` here; `walletAddress`
 * comes from auth (quote) or from the public body (price).
 *
 * Built distributively over `BorrowQuoteParams` so each action variant keeps
 * its discriminator (callers can switch on `input.action` and narrow).
 */
export type BorrowQuoteServiceInput = BorrowQuoteParams extends infer P
  ? P extends { action: string }
    ? Omit<P, 'market'> & { marketId: BorrowMarketId }
    : never
  : never

function quoteParamsFromInput(
  input: BorrowQuoteServiceInput,
): BorrowQuoteParams {
  const market = resolveMarketConfig(input.marketId)
  switch (input.action) {
    case 'open':
      return {
        action: 'open',
        market,
        borrowAmount: input.borrowAmount,
        collateralAmount: input.collateralAmount,
        walletAddress: input.walletAddress,
      }
    case 'close':
      return {
        action: 'close',
        market,
        borrowAmount: input.borrowAmount,
        collateralAmount: input.collateralAmount,
        walletAddress: input.walletAddress,
      }
    case 'depositCollateral':
      return {
        action: 'depositCollateral',
        market,
        amount: input.amount,
        walletAddress: input.walletAddress,
      }
    case 'withdrawCollateral':
      return {
        action: 'withdrawCollateral',
        market,
        amount: input.amount,
        walletAddress: input.walletAddress,
      }
    case 'repay':
      return {
        action: 'repay',
        market,
        amount: input.amount,
        walletAddress: input.walletAddress,
      }
  }
}

export async function getPrice(
  input: BorrowQuoteServiceInput,
): Promise<BorrowPrice> {
  const actions = getActions()
  return await actions.borrow.getPrice(quoteParamsFromInput(input))
}

export async function getQuote(
  input: BorrowQuoteServiceInput,
): Promise<BorrowQuote> {
  const actions = getActions()
  return await actions.borrow.getQuote(quoteParamsFromInput(input))
}

// ---------- Mutations ----------

async function resolveWalletOrThrow(
  idToken: string,
): Promise<BorrowEnabledWallet> {
  const wallet = await getWallet(idToken)
  if (!wallet) {
    throw new WalletNotFoundError()
  }
  if (!wallet.borrow) {
    throw new ProviderNotConfiguredError({
      provider: 'borrow',
      details: 'Borrow namespace is not enabled on this wallet.',
    })
  }
  return wallet as BorrowEnabledWallet
}

export type BorrowOpenServiceInput =
  | ({ idToken: string } & Omit<BorrowOpenPositionParams, 'market'> & {
        marketId: BorrowMarketId
      })
  | { idToken: string; quote: BorrowQuote }

export async function openPosition(
  input: BorrowOpenServiceInput,
): Promise<BorrowReceiptWithUrls> {
  const wallet = await resolveWalletOrThrow(input.idToken)
  if ('quote' in input) {
    const receipt = await wallet.borrow.openPosition(input.quote)
    return decorateReceipt(receipt, input.quote.marketId.chainId)
  }
  const { idToken: _ignored, marketId, ...rest } = input
  const market = resolveMarketConfig(marketId)
  const receipt = await wallet.borrow.openPosition({ ...rest, market })
  return decorateReceipt(receipt, market.chainId)
}

export type BorrowCloseServiceInput =
  | ({ idToken: string } & Omit<BorrowClosePositionParams, 'market'> & {
        marketId: BorrowMarketId
      })
  | { idToken: string; quote: BorrowQuote }

export async function closePosition(
  input: BorrowCloseServiceInput,
): Promise<BorrowReceiptWithUrls> {
  const wallet = await resolveWalletOrThrow(input.idToken)
  if ('quote' in input) {
    const receipt = await wallet.borrow.closePosition(input.quote)
    return decorateReceipt(receipt, input.quote.marketId.chainId)
  }
  const { idToken: _ignored, marketId, ...rest } = input
  const market = resolveMarketConfig(marketId)
  const receipt = await wallet.borrow.closePosition({ ...rest, market })
  return decorateReceipt(receipt, market.chainId)
}

export type BorrowDepositCollateralServiceInput =
  | ({ idToken: string } & Omit<BorrowDepositCollateralParams, 'market'> & {
        marketId: BorrowMarketId
      })
  | { idToken: string; quote: BorrowQuote }

export async function depositCollateral(
  input: BorrowDepositCollateralServiceInput,
): Promise<BorrowReceiptWithUrls> {
  const wallet = await resolveWalletOrThrow(input.idToken)
  if ('quote' in input) {
    const receipt = await wallet.borrow.depositCollateral(input.quote)
    return decorateReceipt(receipt, input.quote.marketId.chainId)
  }
  const { idToken: _ignored, marketId, ...rest } = input
  const market = resolveMarketConfig(marketId)
  const receipt = await wallet.borrow.depositCollateral({ ...rest, market })
  return decorateReceipt(receipt, market.chainId)
}

export type BorrowWithdrawCollateralServiceInput =
  | ({ idToken: string } & Omit<BorrowWithdrawCollateralParams, 'market'> & {
        marketId: BorrowMarketId
      })
  | { idToken: string; quote: BorrowQuote }

export async function withdrawCollateral(
  input: BorrowWithdrawCollateralServiceInput,
): Promise<BorrowReceiptWithUrls> {
  const wallet = await resolveWalletOrThrow(input.idToken)
  if ('quote' in input) {
    const receipt = await wallet.borrow.withdrawCollateral(input.quote)
    return decorateReceipt(receipt, input.quote.marketId.chainId)
  }
  const { idToken: _ignored, marketId, ...rest } = input
  const market = resolveMarketConfig(marketId)
  const receipt = await wallet.borrow.withdrawCollateral({ ...rest, market })
  return decorateReceipt(receipt, market.chainId)
}

export type BorrowRepayServiceInput =
  | ({ idToken: string } & Omit<BorrowRepayParams, 'market'> & {
        marketId: BorrowMarketId
      })
  | { idToken: string; quote: BorrowQuote }

export async function repay(
  input: BorrowRepayServiceInput,
): Promise<BorrowReceiptWithUrls> {
  const wallet = await resolveWalletOrThrow(input.idToken)
  if ('quote' in input) {
    const receipt = await wallet.borrow.repay(input.quote)
    return decorateReceipt(receipt, input.quote.marketId.chainId)
  }
  const { idToken: _ignored, marketId, ...rest } = input
  const market = resolveMarketConfig(marketId)
  const receipt = await wallet.borrow.repay({ ...rest, market })
  return decorateReceipt(receipt, market.chainId)
}
