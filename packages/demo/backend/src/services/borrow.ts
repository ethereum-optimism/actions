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

type BorrowReceiptWithUrls = BorrowReceipt & { blockExplorerUrls: string[] }

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
 */
export type BorrowQuoteServiceInput = Omit<BorrowQuoteParams, 'market'> & {
  marketId: BorrowMarketId
}

function quoteParamsFromInput(
  input: BorrowQuoteServiceInput,
): BorrowQuoteParams {
  const { marketId, ...rest } = input
  const market = resolveMarketConfig(marketId)
  return { ...rest, market } as BorrowQuoteParams
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

async function resolveWalletOrThrow(idToken: string) {
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
  return wallet
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
    const receipt = await wallet.borrow!.openPosition(input.quote)
    return decorateReceipt(receipt, input.quote.marketId.chainId)
  }
  const { idToken: _ignored, marketId, ...rest } = input
  const market = resolveMarketConfig(marketId)
  const receipt = await wallet.borrow!.openPosition({ ...rest, market })
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
    const receipt = await wallet.borrow!.closePosition(input.quote)
    return decorateReceipt(receipt, input.quote.marketId.chainId)
  }
  const { idToken: _ignored, marketId, ...rest } = input
  const market = resolveMarketConfig(marketId)
  const receipt = await wallet.borrow!.closePosition({ ...rest, market })
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
    const receipt = await wallet.borrow!.depositCollateral(input.quote)
    return decorateReceipt(receipt, input.quote.marketId.chainId)
  }
  const { idToken: _ignored, marketId, ...rest } = input
  const market = resolveMarketConfig(marketId)
  const receipt = await wallet.borrow!.depositCollateral({ ...rest, market })
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
    const receipt = await wallet.borrow!.withdrawCollateral(input.quote)
    return decorateReceipt(receipt, input.quote.marketId.chainId)
  }
  const { idToken: _ignored, marketId, ...rest } = input
  const market = resolveMarketConfig(marketId)
  const receipt = await wallet.borrow!.withdrawCollateral({ ...rest, market })
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
    const receipt = await wallet.borrow!.repay(input.quote)
    return decorateReceipt(receipt, input.quote.marketId.chainId)
  }
  const { idToken: _ignored, marketId, ...rest } = input
  const market = resolveMarketConfig(marketId)
  const receipt = await wallet.borrow!.repay({ ...rest, market })
  return decorateReceipt(receipt, market.chainId)
}
