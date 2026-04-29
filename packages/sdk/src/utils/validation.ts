import type { Address } from 'viem'
import { isAddress } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  AmountRequiredError,
  AssetNotSupportedOnChainError,
  ChainNotSupportedError,
  ConflictingAmountsError,
  InvalidAmountError,
  SameAssetError,
  SlippageOutOfRangeError,
  ZeroAddressError,
} from '@/core/error/errors.js'
import type { Asset } from '@/types/asset.js'
import { isAssetSupportedOnChain } from '@/utils/assets.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export function validateAmountProvided(
  amountIn?: number,
  amountOut?: number,
): void {
  if (amountIn === undefined && amountOut === undefined) {
    throw new AmountRequiredError()
  }
}

export function validateAmountPositiveIfExists(amount?: number): void {
  if (amount !== undefined && amount <= 0) {
    throw new InvalidAmountError(amount)
  }
}

export function validateNotBothAmounts(
  amountIn?: number,
  amountOut?: number,
): void {
  if (amountIn !== undefined && amountOut !== undefined) {
    throw new ConflictingAmountsError()
  }
}

export function validateNotSameAsset(assetIn: Asset, assetOut: Asset): void {
  if (
    assetIn.metadata.symbol.toLowerCase() ===
    assetOut.metadata.symbol.toLowerCase()
  ) {
    throw new SameAssetError(assetIn.metadata.symbol)
  }
}

export function validateNotZeroAddress(address: Address, label: string): void {
  if (address === ZERO_ADDRESS) {
    throw new ZeroAddressError(label, address)
  }
}

export function validateSlippage(slippage: number, maxSlippage: number): void {
  if (slippage < 0 || slippage > maxSlippage) {
    throw new SlippageOutOfRangeError(slippage, maxSlippage)
  }
}

export function validateChainSupported(
  chainId: number,
  supportedChainIds: readonly number[],
): void {
  if (!supportedChainIds.includes(chainId)) {
    throw new ChainNotSupportedError(chainId, supportedChainIds)
  }
}

export function validateAssetOnChain(
  asset: Asset,
  chainId: SupportedChainId,
): void {
  if (!isAssetSupportedOnChain(asset, chainId)) {
    throw new AssetNotSupportedOnChainError(asset.metadata.symbol, chainId)
  }
}

/**
 * Validate that a resolved recipient address is not the zero address.
 * ENS names are skipped — only resolved `Address` values are checked.
 */
export function validateRecipient(recipient: string | undefined): void {
  if (recipient && isAddress(recipient)) {
    validateNotZeroAddress(recipient, 'recipient')
  }
}
