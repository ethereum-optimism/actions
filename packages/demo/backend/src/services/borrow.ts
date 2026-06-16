import type {
  BorrowClosePositionParams,
  BorrowDepositCollateralParams,
  BorrowMarket,
  BorrowMarketConfig,
  BorrowMarketId,
  BorrowOpenPositionParams,
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
import { MorphoUSDCBorrowOPDemo } from '@/config/markets.js'
import { WalletNotFoundError } from '@/helpers/errors.js'
import { getWallet } from '@/services/wallet.js'
import { getBlockExplorerUrls } from '@/utils/explorers.js'

const BORROW_MARKETS: BorrowMarketConfig[] = [MorphoUSDCBorrowOPDemo]

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

// Resolves a request-body `BorrowMarketId` to the full `BorrowMarketConfig`
// the SDK expects on its borrow params.
export function resolveMarketConfig(
  marketId: BorrowMarketId,
): BorrowMarketConfig {
  const config = BORROW_MARKETS.find(
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

// Distributed over `BorrowQuoteParams` so each action variant keeps its
// discriminator (callers can switch on `input.action` and narrow).
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

export type BorrowOpenServiceInput = { idToken: string } & Omit<
  BorrowOpenPositionParams,
  'market'
> & {
    marketId: BorrowMarketId
  }

export async function openPosition(
  input: BorrowOpenServiceInput,
): Promise<BorrowReceiptWithUrls> {
  const wallet = await resolveWalletOrThrow(input.idToken)
  const { idToken: _ignored, marketId, ...rest } = input
  const market = resolveMarketConfig(marketId)
  const receipt = await wallet.borrow.openPosition({ ...rest, market })
  return decorateReceipt(receipt, market.chainId)
}

export type BorrowCloseServiceInput = { idToken: string } & Omit<
  BorrowClosePositionParams,
  'market'
> & {
    marketId: BorrowMarketId
  }

export async function closePosition(
  input: BorrowCloseServiceInput,
): Promise<BorrowReceiptWithUrls> {
  const wallet = await resolveWalletOrThrow(input.idToken)
  const { idToken: _ignored, marketId, ...rest } = input
  const market = resolveMarketConfig(marketId)
  const receipt = await wallet.borrow.closePosition({ ...rest, market })
  return decorateReceipt(receipt, market.chainId)
}

export type BorrowDepositCollateralServiceInput = { idToken: string } & Omit<
  BorrowDepositCollateralParams,
  'market'
> & {
    marketId: BorrowMarketId
  }

export async function depositCollateral(
  input: BorrowDepositCollateralServiceInput,
): Promise<BorrowReceiptWithUrls> {
  const wallet = await resolveWalletOrThrow(input.idToken)
  const { idToken: _ignored, marketId, ...rest } = input
  const market = resolveMarketConfig(marketId)
  const receipt = await wallet.borrow.depositCollateral({ ...rest, market })
  return decorateReceipt(receipt, market.chainId)
}

export type BorrowWithdrawCollateralServiceInput = { idToken: string } & Omit<
  BorrowWithdrawCollateralParams,
  'market'
> & {
    marketId: BorrowMarketId
  }

export async function withdrawCollateral(
  input: BorrowWithdrawCollateralServiceInput,
): Promise<BorrowReceiptWithUrls> {
  const wallet = await resolveWalletOrThrow(input.idToken)
  const { idToken: _ignored, marketId, ...rest } = input
  const market = resolveMarketConfig(marketId)
  const receipt = await wallet.borrow.withdrawCollateral({ ...rest, market })
  return decorateReceipt(receipt, market.chainId)
}

export type BorrowRepayServiceInput = { idToken: string } & Omit<
  BorrowRepayParams,
  'market'
> & {
    marketId: BorrowMarketId
  }

export async function repay(
  input: BorrowRepayServiceInput,
): Promise<BorrowReceiptWithUrls> {
  const wallet = await resolveWalletOrThrow(input.idToken)
  const { idToken: _ignored, marketId, ...rest } = input
  const market = resolveMarketConfig(marketId)
  const receipt = await wallet.borrow.repay({ ...rest, market })
  return decorateReceipt(receipt, market.chainId)
}
